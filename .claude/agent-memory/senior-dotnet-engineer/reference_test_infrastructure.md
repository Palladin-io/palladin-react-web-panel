---
name: reference-test-infrastructure
description: Where net-backend integration tests live and how to authenticate/seed them (corrects stale CLAUDE.md path)
metadata:
  type: reference
---

net-backend integration tests live in `tests/Palladin.Tests.Integrations/` — NOT `tests/Palladin.Api.Tests/` (CLAUDE.md is stale on this). Unit tests in `tests/Palladin.Tests.Unit/`.

- Auth: `apiFactory.CreateAuthenticatedClient(user, permissions = int.MaxValue, plan)` (extension in `Shared/Extensions/IdentityExtensions.cs`). There is no `LoginAs` here. Default grants ALL permissions; pass a specific `Permission` to test gating.
- Seeders (`Shared/Seeders/`, `IServiceProvider` extensions): `SeedUserAsync()` → `(User, Organization, Role)` (admin role, all perms); `SeedVaultAsync(orgId, userId, faker?)`; `SeedEntryAsync(vaultId, createdBy, faker?, createdAt?)`; `SeedAgentAsync(orgId, faker?)` (writes to `AgentsDbWriteContext`).
- Fakers (`Shared/Fakers/`): `VaultFaker.Create(organizationId, createdBy)`, `EntryFaker.Create(vaultId, createdBy, type)` (defaults Description=Lorem, UrlDomain set only for Credential), `AgentFaker.Create(organizationId)` (Name=random username, Status=Active) — all `PrivateCtorFaker`, override with `.RuleFor(...)`.
- Endpoint call: `client.GETAsync<TEndpoint, TRequest, TResponse>(req)` returns `TestResult<T>` deconstructable to `(HttpResponseMessage, T?)` — must `await` then deconstruct, the tuple is not directly assignable to a declared value-tuple return.
- Test class: `[Collection<ApiFactoryCollection>] ... : TestBase` (both in `Palladin.Tests.Integrations.Shared`).
