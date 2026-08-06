# 5. No UI framework

**Status:** accepted, 2026-08

## Context

The 2018 page used jQuery 3.3.1 and Bootstrap 4.0.0 from a CDN. Bootstrap 4
reached end of life in January 2023; jQuery 3.3.1 predates the fix for
CVE-2020-11022/11023.

## Decision

No framework. `src/ui/dom.ts` provides typed helpers; `src/styles/main.css` is
about 300 lines of modern CSS.

## Why

The application is one form and three output regions. jQuery was being used for
exactly ten methods — `empty`, `prop`, `val`, `show`, `hide`, `on`, `off`,
`append`, `prepend`, `click` — each a one-liner natively.

The CDN link mattered beyond weight: a third-party runtime dependency makes a
strict Content-Security-Policy impossible. `style-src 'self'` is only achievable
because nothing external is loaded.

## Consequences

- One fewer runtime dependency, and 49 "jQuery is not callable" type errors gone.
- The `.on`/`.off` pairing that stopped handlers stacking across regenerations
  is replaced by an `AbortController`, so forgetting the pairing is impossible.
- Light and dark themes, WCAG 2.2 AA contrast, 44px targets and a 320px reflow
  are all hand-written. Verified by axe-core in the e2e suite rather than assumed.
- Revisit only if the UI grows real client-side state.
