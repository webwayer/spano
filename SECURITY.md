# Security Policy

## Supported versions

`spano` is a proof of concept. Only the current `master` branch is supported;
there are no maintained release branches and no backports.

## Reporting a vulnerability

Please report security issues **privately**, not as a public issue.

Use GitHub's private vulnerability reporting: go to the
[Security tab](https://github.com/webwayer/spano/security) and choose
**Report a vulnerability**.

Expect an acknowledgement within 7 days. This is a personal project maintained
in spare time, so please allow reasonable time for a fix before any public
disclosure.

## Scope

`spano` is a **fully client-side** static page. It has no backend, no database
and no user accounts, so the realistic attack surface is small:

- Photos you select are read in the browser via `FileReader` and are never
  uploaded anywhere.
- All flight calculations run locally in your browser.
- The published site is static files served by GitHub Pages.

Reports that are in scope include cross-site scripting, dependency
vulnerabilities that are reachable at runtime, and anything that would cause
the tool to leak the contents or metadata of a user's local files.

## A note on flight safety

`spano` generates drone flight plans. It is **not** a safety-critical system and
carries no warranty of correctness — see [LICENSE](LICENSE). Always verify a
generated plan against your aircraft's limits and your local aviation
regulations before flying. In particular, the tool does not currently enforce
an altitude ceiling, and default parameters can produce waypoints above the
120 m / 400 ft limit that applies in many jurisdictions.

If you find a defect that causes `spano` to emit an unsafe or invalid flight
plan, please report it through the same private channel — that is treated with
the same priority as a security issue.
