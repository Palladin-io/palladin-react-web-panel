import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { shortenKey } from "../../shared/lib/shorten-key";
import { useAuthStore } from "../auth";
import { organizationIdFromAccessToken } from "../../shared/lib/organization-scope";
import { useOrganizationMemberDirectory } from "../../shared/hooks/use-organization-member-directory";
import { getOrgGrants, type OrgGrant } from "./api/org-grants-api";
import { ORG_GRANTS_QUERY_KEY } from "./query-keys";
import { grantReasonCoordinateKey } from "./grant-reason-coordinate";
import { useGrantReasons } from "./use-grant-reasons";

export interface GrantHistoryCoordinate {
  type: "grant_approved" | "grant_denied" | "grant_revoked";
  grantId: string;
  vaultId: string;
  entryId: string | null;
  agentId: string | null;
}

export interface GrantHistoryMetadata {
  reason?: string;
  actorName?: string;
}

const EMPTY_METADATA: ReadonlyMap<string, GrantHistoryMetadata> = new Map();

export function grantHistoryCoordinateKey(
  coordinate: GrantHistoryCoordinate,
): string {
  return JSON.stringify([
    coordinate.type,
    coordinate.grantId,
    coordinate.vaultId,
    coordinate.entryId,
    coordinate.agentId,
  ]);
}

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
  const accessToken = useAuthStore((state) => state.accessToken);
  const actorIds = useMemo(() => [...new Set(grants.flatMap((grant) =>
    [grant.createdBy, grant.deniedBy, grant.revokedBy].filter((id): id is string => Boolean(id)),
  ))], [grants]);
  const members = useOrganizationMemberDirectory(
    organizationIdFromAccessToken(accessToken), actorIds, coordinates.length > 0,
  );

  return useMemo(() => {
    if (grants.length === 0) return EMPTY_METADATA;
    const grantsByCoordinates = new Map(
      grants.map((grant) => [grantReasonCoordinateKey(grant), grant]),
    );
    const resolved = new Map<string, GrantHistoryMetadata>();
    for (const coordinate of coordinates) {
      const grant = grantsByCoordinates.get(
        grantReasonCoordinateKey({
          id: coordinate.grantId,
          vaultId: coordinate.vaultId,
          entryId: coordinate.entryId,
          agentId: coordinate.agentId,
        }),
      );
      if (!grant) continue;
      const actorId = actorIdFor(grant, coordinate.type);
      const reason = reasons.get(grantReasonCoordinateKey(grant));
      resolved.set(grantHistoryCoordinateKey(coordinate), {
        ...(reason ? { reason } : {}),
        ...(actorId
          ? {
              actorName:
                members.nameById[actorId] ??
                shortenKey(actorId),
            }
          : {}),
      });
    }
    return resolved;
  }, [coordinates, grants, members.nameById, reasons]);
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

function actorIdFor(grant: OrgGrant, type: GrantHistoryCoordinate["type"]) {
  if (type === "grant_approved") return grant.createdBy;
  if (type === "grant_denied") return grant.deniedBy;
  return grant.revokedBy;
}
