# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project uses [Semantic Versioning](https://semver.org/).

## [2.0.0] — 2026-08-06

A full rebuild of everything around the flight-planning maths. The planner
itself is preserved: the golden baselines confirm that only one deliberately
fixed case changed output across the whole restructuring.

### Security

- **Removed a Google Maps API key that had been published since March 2018**, on
  a page whose map feature was commented out the entire time. The key requires
  rotation in Google Cloud; deleting the line does not revoke it.
- Dependency tree went from 618 packages resolving 128 advisories (47 critical)
  to 219 resolving none.
- Added a strict Content-Security-Policy, achievable only because the Bootstrap
  CDN and Maps SDK are gone.
- Added `SECURITY.md`, including a flight-safety reporting route.

### Fixed

- A curved segment yielding fewer than three groups produced `undefined` samples
  and crashed the planner two stages later with "Cannot read properties of
  undefined".
- A shot whose angle of view rounded to 0° produced a zero-height canvas, whose
  data URL no browser can decode, killing the whole strip render.
- `WebGLRenderer` was constructed per regeneration and never released; the 3D
  preview died after roughly sixteen clicks.
- `waitForImage` attached only `onload`, so a missing or corrupt image left the
  UI frozen with no message at all.
- Async click handlers dropped their rejections, so failures were silent.
- Both curve classes returned `undefined` past their end instead of failing.
- `calculateTriangleCustom` silently required its vertex to be on the ground.
- The README described the second curve as 120°; it has always been 135°.

### Added

- A camera profile type, so supporting another aircraft is a five-line change.
- An altitude ceiling warning, defaulting to 120 m.
- 85 unit and property tests, 11 end-to-end tests, and golden characterisation
  baselines for the planner, geodesy, flight-path placement and CSV export.
- CI, Pages deployment over OIDC, CodeQL, OpenSSF Scorecard, dependency review
  and grouped Dependabot updates.
- `docs/flight-model.md`, `docs/architecture.md` and five ADRs.
- An MIT licence. The project previously had none, which left it legally closed.

### Changed

- Vite 8 and TypeScript 6 replace webpack 3 and a pinned 2017 TypeScript nightly.
- three.js 0.90 → 0.185, including the r125 geometry and r155/r165 lighting
  migrations.
- Split into `src/core` (pure), `src/adapters` and `src/ui`, with the purity
  boundary enforced by the compiler and the linter rather than by convention.
- jQuery and Bootstrap removed. The page is hand-written, WCAG 2.2 AA, works at
  320 px and supports light and dark themes.
- three.js moved behind a dynamic import: first-load JS is about 21 KB, down
  from 1.45 MB.
- `dist/` is no longer tracked; the site is built and published by CI.

### Removed

- The dead Google Maps integration, an unused alternate terrain file, an unused
  triangle solver, and leftover debug logging.
