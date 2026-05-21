---
name: route-tree-regen
description: How to regenerate routeTree.gen.ts after adding a TanStack Router route file
metadata:
  type: project
---

Adding a new file under `src/routes/` does NOT update `src/routeTree.gen.ts` automatically outside of `vite dev`/`vite build`.

**Why:** `npm run build` is `tsc -b && vite build`. `tsc` runs first and fails with
`TS2345: ... not assignable to parameter of type 'keyof FileRoutesByPath'`
because the new route is not yet in the generated tree. The `TanStackRouterVite()`
plugin only regenerates the tree when `vite` itself runs.

**How to apply:** after adding/removing a route file, run `npx vite build` once
(regenerates `routeTree.gen.ts` via the plugin), then `npm run build` for the full
typed build. Commit the regenerated `routeTree.gen.ts`. The `tsr generate` CLI does
not work standalone here ("No files matched the entrypoints pattern").
