import type { GrantFieldSelectionMode } from '../../shared/types/grant-field-selection'
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "../../shared/components/button";
import { LoadMoreSentinel } from "../../shared/components/load-more-sentinel";
import { ErrorState } from "../../shared/components/error-state";
import { Icon } from "../../shared/components/icon";
import { ModalShell } from "../../shared/components/modal-shell";
import { DialogFooter } from "../../shared/components/dialog-footer";
import { SearchBar } from "../../shared/components/search-bar";
import { TypeFilterDropdown } from "../../shared/components/type-filter-dropdown";
import {
  ApproveGrantDialog,
  isApprovableGrantType,
  DenyGrantDialog,
  grantHistoryCoordinateKey,
  grantReasonCoordinateKey,
  GrantReviewUnavailableError,
  OrgGrantsPanel,
  StaleGrantReviewError,
  useApproveGrant,
  useDenyGrant,
  useGrantApprovalReview,
  useGrantHistoryMetadata,
  useGrantReasons,
  usePendingGrants,
  type GrantMethod,
  type GrantPolicyBody,
  type PendingGrant,
} from "../grants";
import { DenyAgentDialog } from "./deny-agent-dialog";
import {
  ApproveAgentDialog,
  useAgents,
  AgentApprovalRequiresUnlockError,
  useApproveAgent,
  useDeactivateAgent,
  type ApproveAgentInput,
} from "../agents";
import { useMemberSyncStore } from "../vaults/sync/member-sync-store";
import { NotificationCard } from "./notification-card";
import { NotificationPreferencesDialog } from "./notification-preferences-dialog";
import {
  notificationGrantContext,
  type NotificationGrantContext,
} from "./notification-grant-context";
import type { NotificationItem } from "./notifications-api";
import {
  NOTIFICATIONS_QUERY_KEY,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsSummary,
} from "./notification-queries";
import {
  notificationDeepLink,
  resolveNotificationItem,
} from "./notification-resolution";

type Segment = "all" | "todo" | "history" | "grants";

/** Agent-approval target carried from an `agent_pending` card to the modal. */
interface AgentTarget {
  agentId: string;
  agentName: string;
  agentType?: string;
  notificationId: string;
}

/**
 * Notification Center / Inbox — replaces the Approvals surface with a
 * persistent feed of action-required + informational notifications.
 *
 * Layout follows the approved design 1:1: header + segment (All / To-do /
 * History), a search row (input + "Filter" button), then a "Required actions"
 * section and a "History" section linking out to the Audit Log.
 *
 * A notification card is an IMMUTABLE LOG of an event, not a live control panel.
 * Inline mutating actions exist ONLY on the two action-required pending types —
 * `grant_pending` and `agent_pending` (approve/deny). Every other card carries
 * at most a single non-mutating "View" link that deep-links to the resource
 * detail; state changes (revoke / grant again) happen there, not on the card.
 *
 * The approve/deny flows reuse the existing zero-knowledge grant + agent flows —
 * the crypto is untouched; only the ids come from notification `metadata`.
 */
export interface NotificationCenterPageProps {
  /** Pre-selects a segment tab when deep-linked (e.g. from a dashboard tile). */
  initialSegment?: Segment;
}

export function NotificationCenterPage({
  initialSegment,
}: NotificationCenterPageProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notifications = useNotifications();
  const summary = useNotificationsSummary();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const agents = useAgents();
  const memberVaults = useMemberSyncStore((state) => state.vaults);
  const agentsById = useMemo(
    () => new Map((agents.data ?? []).map((agent) => [agent.agentId, agent])),
    [agents.data],
  );

  // Refresh the feed + summary after a grant action so the resolved card drops
  // out (and its buttons disable) immediately, instead of lingering up to the
  // 15s staleTime — which risks a double-submit. The grant mutations already
  // invalidate ['grants']; this covers the notifications side.
  const refreshFeed = () =>
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });

  const [segment, setSegment] = useState<Segment>(initialSegment ?? "all");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [prefsOpen, setPrefsOpen] = useState(false);

  // Pending-action mutations + dialog targets. Only the two action-required
  // pending types mutate from the inbox; everything else just deep-links out.
  const deny = useDenyGrant();
  const approve = useApproveGrant();
  const pendingGrants = usePendingGrants();
  const pendingGrantReasons = useGrantReasons(pendingGrants.data ?? []);
  const pendingReasonsByCoordinates = useMemo(() => {
    const reasons = new Map<string, string>();
    for (const grant of pendingGrants.data ?? []) {
      const reason = pendingGrantReasons.get(grantReasonCoordinateKey(grant));
      if (!reason) continue;
      reasons.set(
        grantReasonCoordinateKey(grant),
        reason,
      );
    }
    return reasons;
  }, [pendingGrants.data, pendingGrantReasons]);
  const [approveTarget, setApproveTarget] = useState<PendingGrant | null>(null);
  const approvalReview = useGrantApprovalReview(approveTarget);
  const approveAgent = useApproveAgent();
  const deactivateAgent = useDeactivateAgent();
  const [denyTarget, setDenyTarget] = useState<NotificationGrantContext | null>(
    null,
  );
  // Agent approval target — opens the existing agent-activation modal.
  const [agentApproveTarget, setAgentApproveTarget] =
    useState<AgentTarget | null>(null);
  // Agent deny target — opens a confirm dialog (deny === deactivate) with a
  // security warning about possible API-key leakage.
  const [denyAgentTarget, setDenyAgentTarget] = useState<{
    agentId: string;
    notificationId: string;
    agentName: string;
    apiKeyId?: string;
    apiKeySuffix?: string;
  } | null>(null);
  const busy =
    approve.isPending ||
    deny.isPending ||
    approveAgent.isPending ||
    deactivateAgent.isPending;

  // Mark a notification read. `markRead` is purely optimistic (patches `readAt`
  // in the feed cache + drops the badge) — no feed invalidation, so this never
  // remounts cards or re-triggers the mark-read-on-view observer.
  function markReadNow(id: string) {
    markRead.mutate(id);
  }

  const items = useMemo(
    () =>
      (notifications.data?.pages.flatMap((page) => page.items) ?? []).map(
        (item) =>
          resolveNotificationItem(item, {
            vaults: memberVaults,
            agents: agentsById,
          }),
      ),
    [notifications.data, memberVaults, agentsById],
  );
  const grantHistoryCoordinates = useMemo(
    () =>
      items.flatMap((item) => {
        if (!isGrantHistoryType(item.type)) return [];
        const grantId = item.metadata?.grantId;
        const vaultId = item.metadata?.vaultId;
        return grantId && vaultId
          ? [{
              type: item.type,
              grantId,
              vaultId,
              entryId: item.metadata?.entryId ?? null,
              agentId: item.metadata?.agentId ?? null,
            }]
          : [];
      }),
    [items],
  );
  const grantHistoryMetadata = useGrantHistoryMetadata(grantHistoryCoordinates);
  const resolvedItems = useMemo(
    () =>
      items.map((item) => {
        const grantId = item.metadata?.grantId;
        const metadata = grantId && isGrantHistoryType(item.type)
          ? grantHistoryMetadata.get(
              grantHistoryCoordinateKey({
                type: item.type,
                grantId,
                vaultId: item.metadata?.vaultId ?? "",
                entryId: item.metadata?.entryId ?? null,
                agentId: item.metadata?.agentId ?? null,
              }),
            )
          : undefined;
        const pendingReason =
          item.type === "grant_pending" && grantId
            ? pendingReasonsByCoordinates.get(
                grantReasonCoordinateKey({
                  id: grantId,
                  vaultId: item.metadata?.vaultId ?? "",
                  entryId: item.metadata?.entryId ?? null,
                  agentId: item.metadata?.agentId ?? null,
                }),
              )
            : undefined;
        return metadata || pendingReason
          ? {
              ...item,
              metadata: {
                ...item.metadata,
                ...metadata,
                ...(pendingReason ? { reason: pendingReason } : {}),
              },
            }
          : item;
      }),
    [grantHistoryMetadata, items, pendingReasonsByCoordinates],
  );

  const { actionItems, historyItems } = useMemo(
    () => splitByCategory(resolvedItems),
    [resolvedItems],
  );

  const filteredActions = useMemo(
    () => filterItems(actionItems, query, typeFilter),
    [actionItems, query, typeFilter],
  );
  const filteredHistory = useMemo(
    () => filterItems(historyItems, query, typeFilter),
    [historyItems, query, typeFilter],
  );
  const typeFilterOptions = useMemo(
    () =>
      FILTERABLE_TYPES.map((type) => ({
        value: type,
        label: t(`notifications.center.filterType.${type}`),
      })),
    [t],
  );

  // The Grants tab swaps the immutable inbox feed for the live org-wide grants
  // panel — the only place in the inbox with live state + actions (Revoke).
  const showGrants = segment === "grants";
  const showActions = segment === "all" || segment === "todo";
  const showHistory = segment === "all" || segment === "history";

  function handleDeny(reason: string) {
    if (!denyTarget) return;
    deny.mutate(
      { vaultId: denyTarget.vaultId, grantId: denyTarget.grantId, reason },
      {
        onSuccess: () => {
          toast.success(t("grants.deny.success"));
          setDenyTarget(null);
        },
        onError: () => toast.error(t("grants.deny.error")),
      },
    );
  }

  async function openGrantApproval(context: NotificationGrantContext) {
    // The pending list deliberately has a short stale window. Approval cannot
    // use that cached envelope: a freshly retried agent request may carry new
    // signed reason/key metadata while the notification card already exists.
    // Fetch the canonical pending contract immediately before cryptographic
    // review so signature/scope checks never run against a stale snapshot.
    const refreshed = await pendingGrants.refetch();
    if (refreshed.isError) {
      toast.error(t("grants.approve.requestRefreshFailed"));
      return;
    }
    const grant = refreshed.data?.find(
      (item) => item.id === context.grantId && item.vaultId === context.vaultId,
    );
    if (!grant) {
      toast.error(t("grants.approve.requestNotPending"));
      return;
    }
    if (!isApprovableGrantType(grant.type)) {
      toast.error(t("grants.approve.reviewUnavailable"));
      return;
    }
    setApproveTarget(grant);
  }

  function handleApproveGrant(
    policy: GrantPolicyBody,
    methods: GrantMethod[],
    fieldIds: string[],
    fieldSelectionMode: GrantFieldSelectionMode,
  ) {
    if (!approveTarget?.encryptedReason || !approvalReview.data || !isApprovableGrantType(approveTarget.type)) return;
    approve.mutate(
      {
        grantId: approveTarget.id,
        agentId: approveTarget.agentId,
        type: approveTarget.type,
        vaultId: approveTarget.vaultId,
        entryId: approveTarget.entryId,
        policy,
        methods,
        fieldIds,
        fieldSelectionMode,
        reviewedEntryRevision: approvalReview.data.entryRevision,
        requestedMethods:
          approveTarget.encryptedReason.descriptor.binding.requestedMethods,
      },
      {
        onSuccess: () => {
          setApproveTarget(null);
        },
        onError: (error) =>
          toast.error(
            t(
              error instanceof StaleGrantReviewError
                ? "grants.approve.staleReview"
                : "grants.approve.error",
            ),
          ),
      },
    );
  }

  function handleApproveAgent(input: ApproveAgentInput) {
    if (!agentApproveTarget) return;
    approveAgent.mutate(
      { agentId: agentApproveTarget.agentId, input },
      {
        onSuccess: ({ discoveryReady }) => {
          if (discoveryReady) toast.success(t("agents.approveSuccess"));
          else toast.warning(t("agents.discoveryProvisioningPending"));
          setAgentApproveTarget(null);
          refreshFeed();
        },
        onError: (error) =>
          toast.error(
            t(
              error instanceof AgentApprovalRequiresUnlockError
                ? "agents.approveRequiresUnlock"
                : "agents.errorApprove",
            ),
          ),
      },
    );
  }

  function handleDenyAgent(
    agentId: string,
    notificationId: string,
    agentName: string,
    apiKeyId?: string,
    apiKeySuffix?: string,
  ) {
    // Open the confirm dialog first — denying deactivates the agent and may
    // signal a leaked API key, so it deserves a deliberate confirmation.
    setDenyAgentTarget({
      agentId,
      notificationId,
      agentName,
      apiKeyId,
      apiKeySuffix,
    });
  }

  function handleConfirmDenyAgent() {
    if (!denyAgentTarget) return;
    const { agentId, notificationId } = denyAgentTarget;
    // "Deny" a pending agent = deactivate it (no separate reject endpoint).
    deactivateAgent.mutate(agentId, {
      onSuccess: () => {
        toast.success(t("agents.deactivateSuccess"));
        markReadNow(notificationId);
        // Backend collapses the pending card + emits an `agent_deactivated`
        // history card; re-fetch so both land in the feed (like grant deny).
        refreshFeed();
        setDenyAgentTarget(null);
      },
      onError: () => toast.error(t("agents.errorDeactivate")),
    });
  }

  // Construct navigation locally from opaque identifiers. The destination's
  // normal route/API authorization remains authoritative.
  function handleView(item: NotificationItem) {
    const destination = notificationDeepLink(item);
    if (!destination) return;
    markReadNow(item.id);
    navigate(destination);
  }

  return (
    <div className="min-h-full px-4 py-4 text-[var(--cv-t1)]">
      {/* Header row — app-standard `h-10` (same as Agents/Vaults/org-grants) so
          the search below sits at the same height across every list screen.
          Title/subtitle on the left; segment tabs + actions inline on the right. */}
      <div className="mb-4 flex h-10 items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">
            {t("notifications.center.title")}
          </h2>
          <p className="text-meta text-[var(--cv-t3)]">
            {t("notifications.center.subtitle")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SegmentTabs
            segment={segment}
            onChange={setSegment}
            todoCount={summary.data?.pendingActionCount ?? 0}
          />
          <Button
            variant="subtle"
            size="sm"
            icon="done_all"
            disabled={
              (summary.data?.unreadCount ?? 0) === 0 || markAllRead.isPending
            }
            onClick={() => markAllRead.mutate()}
          >
            {t("notifications.center.markAllRead")}
          </Button>
          <Button
            variant="accent"
            size="sm"
            icon="settings"
            aria-label={t("notifications.prefs.title")}
            title={t("notifications.prefs.title")}
            onClick={() => setPrefsOpen(true)}
          />
        </div>
      </div>

      {/* Search (left) + multi-select type filter (right) — org-grants pattern.
          Hidden on the Grants tab, where OrgGrantsPanel owns its own filtering. */}
      {!showGrants && (
        <div className="mb-3 flex items-stretch gap-2">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder={t("notifications.center.search")}
            className="flex-1"
          />
          <TypeFilterDropdown
            options={typeFilterOptions}
            selected={typeFilter}
            onChange={setTypeFilter}
            placeholder={t("notifications.center.filterType")}
            ariaLabel={t("notifications.center.filterType")}
          />
        </div>
      )}

      {showGrants ? (
        <OrgGrantsPanel bare />
      ) : notifications.isPending ? (
        <LoadingSkeleton />
      ) : notifications.isError ? (
        <ErrorState
          message={t("notifications.center.errorLoad")}
          onRetry={notifications.refetch}
        />
      ) : resolvedItems.length === 0 ? (
        <EmptyState filtered={false} />
      ) : (
        <>
          {/* Action-required cards render with no section label — just the
              cards at the top of the inbox. */}
          {showActions &&
            (filteredActions.length === 0 ? (
              segment === "todo" ? (
                <EmptyState filtered={Boolean(query)} />
              ) : null
            ) : (
              <div className="mb-4">
                <Grid>
                  {filteredActions.map((item) => (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      onSeen={markRead.mutate}
                      footer={
                        <ActionFooter
                          item={item}
                          busy={busy}
                          grantType={pendingGrants.data?.find((grant) => grant.id === item.metadata?.grantId
                            && grant.vaultId === item.metadata?.vaultId)?.type}
                          onApprove={openGrantApproval}
                          onDeny={setDenyTarget}
                          onApproveAgent={setAgentApproveTarget}
                          onDenyAgent={handleDenyAgent}
                          onView={handleView}
                        />
                      }
                    />
                  ))}
                </Grid>
              </div>
            ))}

          {showHistory && (
            <section>
              {/* Section label only when a To-do section with cards is rendered
                  above it — never show "History" as the first/only section. */}
              {showActions && filteredActions.length > 0 && (
                <p className="mb-3 flex items-center gap-2 text-meta font-semibold text-[var(--cv-t3)]">
                  {t("notifications.center.history")}
                  <span
                    className="font-medium"
                    title={t("notifications.center.auditLogSoon")}
                  >
                    ({t("notifications.center.auditLog")})
                  </span>
                </p>
              )}
              {filteredHistory.length === 0 ? (
                <EmptyState filtered={Boolean(query)} />
              ) : (
                <Grid>
                  {filteredHistory.map((item) => (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      onSeen={markRead.mutate}
                      footer={<ViewFooter item={item} onView={handleView} />}
                    />
                  ))}
                </Grid>
              )}
            </section>
          )}

          <LoadMoreSentinel
            hasNextPage={notifications.hasNextPage}
            isFetchingNextPage={notifications.isFetchingNextPage}
            isFetchNextPageError={notifications.isFetchNextPageError}
            onLoadMore={() => notifications.fetchNextPage()}
          />
        </>
      )}

      {approveTarget && approvalReview.data && (
        <ApproveGrantDialog
          grant={approveTarget}
          review={approvalReview.data}
          isPending={approve.isPending}
          onConfirm={handleApproveGrant}
          onCancel={() => setApproveTarget(null)}
        />
      )}
      {approveTarget && !approvalReview.data && (
        <ModalShell
          ariaLabel={t("grants.approve.title")}
          title={t("grants.approve.title")}
          onClose={() => setApproveTarget(null)}
          footer={
            <DialogFooter>
              <Button
                variant="subtle"
                size="sm"
                className="flex-1"
                onClick={() => setApproveTarget(null)}
              >
                {t("grants.cancel")}
              </Button>
            </DialogFooter>
          }
        >
          {approvalReview.isError ? (
            <ErrorState
              message={
                approvalReview.error instanceof GrantReviewUnavailableError
                  ? `${t("grants.approve.reviewUnavailable")} ${t("grants.approve.reviewStage", { stage: approvalReview.error.stage })}`
                  : t("grants.approve.reviewUnavailable")
              }
              onRetry={() => approvalReview.refetch()}
            />
          ) : (
            <p className="text-ui text-[var(--cv-t3)]">
              {t("grants.approve.loadingReview")}
            </p>
          )}
        </ModalShell>
      )}

      {/* Dialogs — only the two pending types mutate; reuse the existing
          zero-knowledge grant + agent flows (crypto unchanged). */}
      <DenyGrantDialog
        open={denyTarget !== null}
        targetLabel={denyTarget?.entryLabel ?? t("grants.unknownTarget")}
        isPending={deny.isPending}
        onConfirm={handleDeny}
        onCancel={() => setDenyTarget(null)}
      />

      {agentApproveTarget && (
        <ApproveAgentDialog
          open
          agentId={agentApproveTarget.agentId}
          initialName={agentApproveTarget.agentName}
          initialType={agentApproveTarget.agentType ?? ""}
          isPending={approveAgent.isPending}
          isProvisioning={approveAgent.phase === "provisioning"}
          onConfirm={handleApproveAgent}
          onCancel={() => setAgentApproveTarget(null)}
        />
      )}

      {denyAgentTarget && (
        <DenyAgentDialog
          open
          agentName={denyAgentTarget.agentName}
          apiKeyId={denyAgentTarget.apiKeyId}
          apiKeySuffix={denyAgentTarget.apiKeySuffix}
          isPending={deactivateAgent.isPending}
          onConfirm={handleConfirmDenyAgent}
          onCancel={() => setDenyAgentTarget(null)}
        />
      )}

      {prefsOpen && (
        <NotificationPreferencesDialog onClose={() => setPrefsOpen(false)} />
      )}
    </div>
  );
}

function isGrantHistoryType(
  type: string,
): type is "grant_approved" | "grant_denied" | "grant_revoked" {
  return (
    type === "grant_approved" ||
    type === "grant_denied" ||
    type === "grant_revoked"
  );
}

/** action-required → To-do; everything else → History. */
function splitByCategory(items: NotificationItem[]) {
  const actionItems: NotificationItem[] = [];
  const historyItems: NotificationItem[] = [];
  for (const item of items) {
    if (item.category === "actionRequired" && item.actionState === "pending") {
      actionItems.push(item);
    } else {
      historyItems.push(item);
    }
  }
  return { actionItems, historyItems };
}

/** Filter by free-text search (over metadata) AND the selected type set. */
function filterItems(
  items: NotificationItem[],
  query: string,
  types: Set<string>,
): NotificationItem[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (types.size > 0 && !types.has(item.type)) return false;
    if (!needle) return true;
    const haystack = Object.values(item.metadata ?? {})
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Footer for cards in the To-do section. Inline mutating actions exist ONLY for
 * the two action-required PENDING types (`grant_pending`, `agent_pending`) —
 * approve/deny. Any other action-required type (e.g. `credential_stale`) is an
 * immutable log and gets the same non-mutating "View" link as History cards.
 * Both approve/deny buttons are `size="sm"` + `flex-1` so the slots stay equal.
 */
function ActionFooter({
  item,
  busy,
  grantType,
  onApprove,
  onDeny,
  onApproveAgent,
  onDenyAgent,
  onView,
}: {
  item: NotificationItem;
  busy: boolean;
  grantType?: string;
  onApprove: (ctx: NotificationGrantContext) => void;
  onDeny: (ctx: NotificationGrantContext) => void;
  onApproveAgent: (target: AgentTarget) => void;
  onDenyAgent: (
    agentId: string,
    notificationId: string,
    agentName: string,
    apiKeyId?: string,
    apiKeySuffix?: string,
  ) => void;
  onView: (item: NotificationItem) => void;
}) {
  const { t } = useTranslation();
  const ctx = notificationGrantContext(item);

  if (item.type === "grant_pending" && ctx) {
    return (
      <>
        <Button
          variant="subtle"
          size="sm"
          className="flex-1"
          disabled={busy}
          onClick={() => onDeny(ctx)}
        >
          {t("grants.deny.action")}
        </Button>
        <Button
          variant="positive"
          size="sm"
          icon="check"
          className="flex-1"
          disabled={busy || !isApprovableGrantType(grantType ?? "")}
          onClick={() => onApprove(ctx)}
        >
          {t("grants.approve.action")}
        </Button>
      </>
    );
  }

  if (item.type === "agent_pending") {
    const agentId = item.metadata?.agentId;
    // Without an agentId we can't drive the approve/deactivate flow — fall back
    // to the read-only "View" link rather than a dead button.
    if (!agentId) return <ViewFooter item={item} onView={onView} />;
    const agentName = item.metadata?.agentName ?? "";
    const agentType = item.metadata?.agentType ?? "";
    return (
      <>
        <Button
          variant="subtle"
          size="sm"
          className="flex-1"
          disabled={busy}
          onClick={() =>
            onDenyAgent(
              agentId,
              item.id,
              agentName,
              item.metadata?.apiKeyId,
              item.metadata?.apiKeySuffix,
            )
          }
        >
          {t("grants.deny.action")}
        </Button>
        <Button
          variant="positive"
          size="sm"
          className="flex-1"
          disabled={busy}
          onClick={() =>
            onApproveAgent({
              agentId,
              agentName,
              agentType,
              notificationId: item.id,
            })
          }
        >
          {t("grants.approve.action")}
        </Button>
      </>
    );
  }

  // Any other action-required type is a log card — read-only "View" link.
  return <ViewFooter item={item} onView={onView} />;
}

/**
 * Contextual label for the "View" link — names the deep-link target so the CTA
 * reads "View Access" / "View Agent" / "View Entry" instead of a generic "View".
 *
 * The notification `type` is the most reliable signal; for unmodelled types we
 * use the available opaque identifiers. Defaults to access (the dominant type).
 */
function viewLabelKey(item: NotificationItem): string {
  switch (item.type) {
    case "agent_pending":
    case "agent_approved":
      return "notifications.center.viewAgent";
    case "credential_stale":
      return "notifications.center.viewEntry";
    case "grant_approved":
    case "grant_denied":
    case "grant_revoked":
      return "notifications.center.viewAccess";
    default: {
      if (item.metadata?.agentId) return "notifications.center.viewAgent";
      if (item.metadata?.entryId) return "notifications.center.viewEntry";
      return "notifications.center.viewAccess";
    }
  }
}

/**
 * Footer for every non-pending card (History + non-actionable To-do): a single
 * non-mutating "View" link that deep-links to the resource detail, with a label
 * naming the target (Access / Agent / Entry). The card is an immutable log, so
 * it never mutates state inline. Renders nothing when the opaque identifiers
 * cannot form a local route.
 */
function ViewFooter({
  item,
  onView,
}: {
  item: NotificationItem;
  onView: (item: NotificationItem) => void;
}) {
  const { t } = useTranslation();
  if (!notificationDeepLink(item)) return null;
  return (
    <Button
      variant="subtle"
      size="sm"
      icon="arrow_forward"
      className="flex-1"
      onClick={() => onView(item)}
    >
      {t(viewLabelKey(item))}
    </Button>
  );
}

/** Notification types offered in the filter dropdown (matches the taxonomy). */
const FILTERABLE_TYPES = [
  "agent_pending",
  "grant_pending",
  "credential_stale",
  "grant_approved",
  "grant_denied",
  "grant_revoked",
  "agent_approved",
] as const;

/**
 * Segment switcher — accent-underline active tab matching the app's tab idiom
 * (`VaultDetailTabs`), sized to sit inline in the header action row next to
 * "Mark all as read" / settings. The To-do tab carries a small count chip built
 * from `--cv-*` / `--cv-primary` tokens.
 */
function SegmentTabs({
  segment,
  onChange,
  todoCount,
}: {
  segment: Segment;
  onChange: (segment: Segment) => void;
  todoCount: number;
}) {
  const { t } = useTranslation();
  const options: { key: Segment; label: string; count?: number }[] = [
    { key: "all", label: t("notifications.center.segAll") },
    { key: "todo", label: t("notifications.center.segTodo"), count: todoCount },
    { key: "history", label: t("notifications.center.segHistory") },
    { key: "grants", label: t("notifications.center.segGrants") },
  ];
  return (
    <div className="mr-1 flex items-center" role="tablist">
      {options.map((option) => {
        const isActive = segment === option.key;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.key)}
            className={`flex items-center gap-1.5 border-b-2 px-2.5 py-1 text-ui font-semibold transition-colors ${
              isActive
                ? "border-[var(--cv-primary)] text-[var(--cv-primary)]"
                : "border-transparent text-[var(--cv-t3)] hover:text-[var(--cv-t1)]"
            }`}
          >
            {option.label}
            {option.count ? (
              <span className="inline-flex h-[1rem] min-w-[1rem] items-center justify-center rounded-full bg-[rgb(var(--cv-primary-rgb)/0.15)] px-1 text-micro font-bold text-[var(--cv-primary)]">
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Responsive card grid — same auto-fill/min-340/`gap-[0.625rem]` as the
 * org-grants-panel list, but `items-stretch` so every card in a row shares the
 * tallest card's height (cards are `h-full` flex columns). This gives the
 * uniform-height pending grid.
 */
function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,21.25rem),1fr))] items-stretch gap-[0.625rem]">
      {children}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center">
      <Icon
        name={filtered ? "filter_alt_off" : "check_circle"}
        size={28}
        color="var(--cv-t3)"
      />
      <p className="text-ui font-medium text-[var(--cv-t3)]">
        {t(
          filtered
            ? "notifications.center.emptyFiltered"
            : "notifications.center.empty",
        )}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,21.25rem),1fr))] items-start gap-[0.625rem]">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="h-[9.375rem] animate-pulse rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  );
}
