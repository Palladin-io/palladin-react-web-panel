# Feature: permissions

**Path:** `src/features/permissions/`

## What it does

Lists system and custom organization roles, creates custom roles, and edits or deletes eligible custom roles. The product surface manages administrative permission flags and member assignments only.

## How it is organized

- `permissions-page.tsx` composes role list/detail through `ResponsiveMasterDetail` at `/settings/permissions` and `/settings/permissions/:roleId`.
- `shared/api/organization-roles-api.ts` validates the role list, server-provided assignable-permission catalog, and CRUD responses with Zod. Team consumes the same role contract.
- `permission-catalog.ts` maps stable backend permission keys to client-localized groups, labels, and descriptions. Matching is case-insensitive; unknown server permissions remain visible through a localized fallback.
- `PermissionFields` renders accessible grouped checkboxes. Updates preserve permission bits unknown to this frontend version.
- `CreateRoleDialog` uses the canonical modal/form controls. `RoleDetail` uses the shared pinned `DetailTabBar` with General, Permissions, and `Members (N)`. General owns role-name editing and deletion; Permissions owns the administrative bitmask; Members lists the people currently assigned to the selected role and can remove that one role while preserving every other assignment. Each editable tab saves only its own draft while preserving failed edits.
- The selected role name and assigned count live only in the selected master card/tab count on wide split view; the detail panel does not repeat a second heading. Narrow drill-in keeps only the back action above the tabs.
- The detail panel and its shared `ScrollArea` keep tab chrome pinned, contain scroll chaining, and leave the authenticated shell at a definite viewport height.

## Authorization and safety

- Role listing and CRUD require `OrganizationManagement`; the rail and routes enforce the same affordance guard while backend authorization remains authoritative.
- Role and permission catalog items are caller-aware through `canAssign`. The full catalog remains visible, but controls exceeding the caller's delegated authority are read-only. Existing non-delegable bits are preserved during permitted edits.
- System-role identity and administrative permissions are read-only. `Administrator` keeps `int.MaxValue`, while the default `User` role keeps exactly `VaultCreate | VaultManage`; neither name nor mask is rewritten by the client.
- Delete is offered only for unassigned custom roles (`assignedMemberCount === 0`); backend returns 409 for races, system roles, or in-use roles.
- Removing a role from the Members tab reuses the complete member-role replacement endpoint. Owner assignments, higher peers, non-delegable roles, and a member's last remaining role are read-only in the client; the backend remains authoritative and the `GrantManage` fail-closed error keeps the assignment unchanged.
- A mutation that would change effective `GrantManage` currently fails closed with `organization-role-grant-manage-cutover-unavailable`. The UI shows a dedicated localized error and retains the user's draft until the Vault recipient-set protocol is available.
- Role-derived Vault access is intentionally absent from the web product until client-side key provisioning and offboarding are complete. Do not expose a selector that only stores desired state without producing effective access.
