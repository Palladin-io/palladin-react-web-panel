import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { shortenKey } from "../../shared/lib/shorten-key";
import { getVaultMembers } from "../vaults/api/vault-members-api";
import { vaultMembersQueryKey } from "../vaults/use-vault-members";
import { getOrgGrants, type OrgGrant } from "./api/org-grants-api";
import { ORG_GRANTS_QUERY_KEY } from "./query-keys";
import { grantReasonCoordinateKey } from "./grant-reason-coordinate";
import { useGrantReasons } from "./use-grant-reasons";

export interface GrantHistoryCoordinate {
  type: "grant_approved" | "grant_denied" | "grant_revoked";
  grantId: string;
  vaultId: string;
}

export interface GrantHistoryMetadata {
  reason?: string;
  actorName?: string;
}

const EMPTY_METADATA: ReadonlyMap<string, GrantHistoryMetadata> = new Map();

/** Resolves grant-history presentation from authoritative client-side sources. */
export function useGrantHistoryMetadata(
  coordinates: readonly GrantHistoryCoordinate[],
): ReadonlyMap<string, GrantHistoryMetadata> {
  const byVault = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    for (const coordinate of coordinates) {
      const ids = groups.get(coordinate.vaultId);
      if (ids) ids.add(coordinate.grantId);
      else groups.set(coordinate.vaultId, new Set([coordinate.grantId]));
    }
    return [...groups];
  }, [coordinates]);

  const grantQueries = useQueries({
    queries: byVault.map(([vaultId, wantedIds]) => ({
      queryKey: [
        ...ORG_GRANTS_QUERY_KEY,
        "notification-history",
        vaultId,
        [...wantedIds].sort(),
      ] as const,
      queryFn: () => collectWantedGrants(vaultId, wantedIds),
      staleTime: 15_000,
    })),
  });
  const grants = useMemo(
    () => grantQueries.flatMap((query) => query.data ?? []),
    [grantQueries],
  );
  const reasons = useGrantReasons(grants);
  const memberQueries = useQueries({
    queries: byVault.map(([vaultId]) => ({
      queryKey: [
        ...vaultMembersQueryKey(vaultId),
        "notification-history",
      ] as const,
      queryFn: () => collectMemberNames(vaultId),
      staleTime: 15_000,
    })),
  });

  return useMemo(() => {
    if (grants.length === 0) return EMPTY_METADATA;
    const memberNames = new Map<string, ReadonlyMap<string, string>>();
    byVault.forEach(([vaultId], index) => {
      const names = memberQueries[index]?.data;
      if (names) memberNames.set(vaultId, names);
    });
    const grantsById = new Map(grants.map((grant) => [grant.id, grant]));
    const resolved = new Map<string, GrantHistoryMetadata>();
    for (const coordinate of coordinates) {
      const grant = grantsById.get(coordinate.grantId);
      if (!grant || grant.vaultId !== coordinate.vaultId) continue;
      const actorId = actorIdFor(grant, coordinate.type);
      const reason = reasons.get(grantReasonCoordinateKey(grant));
      resolved.set(coordinate.grantId, {
        ...(reason ? { reason } : {}),
        ...(actorId
          ? {
              actorName:
                memberNames.get(coordinate.vaultId)?.get(actorId) ??
                shortenKey(actorId),
            }
          : {}),
      });
    }
    return resolved;
  }, [byVault, coordinates, grants, memberQueries, reasons]);
}

async function collectWantedGrants(
  vaultId: string,
  wantedIds: ReadonlySet<string>,
) {
  const found: OrgGrant[] = [];
  let cursor: string | undefined;
  do {
    const page = await getOrgGrants({ vaultId, cursor, pageSize: 100 });
    for (const grant of page.items)
      if (wantedIds.has(grant.id)) found.push(grant);
    if (found.length === wantedIds.size) break;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return found;
}

async function collectMemberNames(vaultId: string) {
  const names = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const page = await getVaultMembers(vaultId, cursor);
    for (const member of page.items) {
      const name = member.memberName?.trim();
      if (name) names.set(member.memberId, name);
    }
    cursor = page.nextAfterId ?? undefined;
  } while (cursor);
  return names;
}

function actorIdFor(grant: OrgGrant, type: GrantHistoryCoordinate["type"]) {
  if (type === "grant_approved") return grant.createdBy;
  if (type === "grant_denied") return grant.deniedBy;
  return grant.revokedBy;
}
