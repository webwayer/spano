# Architecture

spano is a static page. There is no backend, no build-time data, and no server
component of any kind: `index.html` plus hashed assets, deployed to GitHub Pages.

## Layers

```
                    ┌──────────────┐
                    │   main.ts    │  composition root, wiring only
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │     ui/      │  form, step list, previews, DOM helpers
                    └──┬────────┬──┘
                       │        │
          ┌────────────▼──┐  ┌──▼────────────┐
          │     core/     │◄─┤   adapters/   │  canvas, imaging, three.js, files
          │  pure. no DOM │  └───────┬───────┘
          └───────────────┘          │
                                     ▼
                        DOM · Canvas · WebGL · FileReader
```

Dependencies point one way. `core/` depends on nothing; `adapters/` reads core's
types; `ui/` uses both; `main.ts` wires them together — reaching `core` and
`adapters` directly as well as through `ui`, which the diagram simplifies.

## The purity boundary is enforced, not agreed

Layering rules decay because nothing checks them. This one is checked twice:

1. **`src/core/tsconfig.json` omits `"DOM"` from `lib`.** `document`, `window`,
   `Image`, `Blob` and `canvas` do not resolve inside `core/`. Reaching for one
   is a build error, not a code-review note.
2. **Two ESLint rules.** `no-restricted-imports` blocks `three`, `adapters/*`
   and `ui/*`; `no-restricted-syntax` blocks the same targets reached through a
   dynamic `import()`. Both are needed: the tsconfig catches globals but not
   imports (`three` type-checks fine, it ships its own types), and
   `no-restricted-imports` never visits `ImportExpression` — a hole found by
   probing the boundary rather than trusting it.

Seventeen DOM and platform globals were tried against the first mechanism and
all seventeen were rejected. Eight import forms were tried against the second.

`npm run typecheck` runs three projects: the app, the DOM-free core, and the
Node-only golden harness.

The payoff is concrete: the entire planner runs in Node in milliseconds. The
unit and property suites need no jsdom, no browser, and no mocks.

## Where things live

| Path                     | Contains                                                              |
| ------------------------ | --------------------------------------------------------------------- |
| `src/core/geometry/`     | triangle solvers, angle units                                         |
| `src/core/geo/`          | great-circle maths, projecting a plan onto the map                    |
| `src/core/curves/`       | the virtual panorama surfaces                                         |
| `src/core/planner/`      | the five stages, plus `plan.ts` as the single public entry point      |
| `src/core/camera/`       | camera profiles and the altitude ceiling                              |
| `src/core/export/`       | Litchi CSV formatting (pure string generation)                        |
| `src/adapters/canvas2d/` | the two diagram canvases                                              |
| `src/adapters/imaging/`  | cropping, rotation, image loading                                     |
| `src/adapters/scene3d/`  | three.js scene, synthetic ground and landmarks, plan rendering        |
| `src/ui/`                | form reading, step list, previews, typed DOM helpers, error reporting |

## Deliberate choices

**No UI framework.** One form and three output regions. `src/ui/dom.ts` is 134
lines and replaces everything jQuery was doing.

**three.js is loaded on demand.** It is the large majority of the bundle and the
3D preview is behind a button many visitors never press, so
`src/ui/previews.ts` reaches it through a dynamic `import()`. First-load JS is
around 21 KB; the renderer chunk is 523 KB and arrives only when asked for. Rendering eagerly would defer the download by a few hundred milliseconds
and no more, which is not what lazy loading is for.

**One shared WebGL renderer.** Browsers cap live WebGL contexts at around 16.
Building one per plan — as the 2018 code did — broke the preview after about
sixteen regenerations. Scene contents are disposed per render; the renderer is
kept.

**Errors go to a live region, not `alert`.** `alert` blocks the page, cannot be
styled and is announced poorly. `src/ui/errors.ts` is the only place that
decides, and it also wraps async click handlers — without that, a rejected
handler is an unhandled rejection and the user sees nothing.

**The CSP is injected at build time.** It cannot live in `index.html`: the dev
server injects styles as inline `<style>` elements, which `style-src 'self'`
blocks, leaving the page unstyled while developing. See the plugin in
`vite.config.ts`.

## Testing

| Layer      | Tool                | Covers                                                                                                                  |
| ---------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Golden     | plain Node + `tsx`  | 36 planner cases, geodesy, flight-path placement, Litchi CSV. **Covers `core/` only** — nothing in `adapters/` or `ui/` |
| Unit       | Vitest              | geometry, camera profiles, CSV formatting                                                                               |
| Property   | Vitest + fast-check | curve totality and continuity, geodesy round-trips, plan invariants                                                     |
| End-to-end | Playwright + axe    | the real page against the production build                                                                              |

The golden baselines are characterisation tests: they record what the planner
**does**, bugs included, so a refactor that changes behaviour cannot pass
quietly. They are not a claim the output is correct. See
[`tests/golden/README.md`](../tests/golden/README.md).

## Deployment

`npm run build` emits `dist/`; `.github/workflows/deploy.yml` publishes it to
GitHub Pages over OIDC, with no stored secret. `dist/` is not tracked in git —
before 2026 it was, which meant the published site was whatever a human last
built on a laptop, with nothing tying it to a commit.

`base` is `/spano/` because Pages serves the project from a subpath. Anything
referencing an asset at runtime must go through `import.meta.env.BASE_URL`.
