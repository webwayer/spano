# Golden characterisation tests

These baselines record what the planner **does**. They are not a claim that the
output is correct — only that it does not change by accident.

They were first captured from the unmodified 2018 sources, before any
restructuring, and have been re-recorded twice since: once when the allocation
crash was fixed, and once when `flight-path.json` was added. Each re-record is
noted in the commit that made it.

## Running

```bash
npm run golden           # check current behaviour against the baselines
npm run golden:capture   # re-record — only when a change is DELIBERATE
```

Run `npm run golden` at every gate. If it fails and you did not intend to change
behaviour, you have found a regression. If you did intend it, re-record, **read
the diff**, and say in the commit message which cases moved and why.

Re-recording to make a red run green, without reading the diff, throws away the
only protection the planner has. That is not rhetoric: a mutation survey found
**sixteen** deliberate bugs — negated gimbal angles, swapped shot anchors, a
disabled waypoint-spacing rule — that change real flight output and are caught
by *nothing else in the repository*.

## What is covered

| File | Covers |
| --- | --- |
| `digest.json` | All 36 cases (18 parameter sets × 2 curve types). Per case: counts, per-segment average errors, shot layout, and the full step list — the values the UI renders and a mission export consumes. |
| `full/*.json` | Three cases dumped in full, every intermediate stage included. |
| `geo.json` | `src/core/geo/great-circle.ts` — destination and initial bearing, plus round trips. |
| `flight-path.json` | `src/core/geo/flight-path.ts` — projecting steps onto the map, the minimum waypoint spacing, the inverted heading for backwards steps. |
| `litchi.json` | `src/core/export/litchi-csv.ts`, driven by a static fixture. |

## What is NOT covered — read this before trusting a green run

**Everything outside `src/core`.** The harness imports only from `core/`, so
`src/adapters/` and `src/ui/` have no baseline at all. The image cropping, the
canvas diagrams, the three.js scene and the whole UI are held by the Playwright
suite and by unit tests, not by these files.

That matters concretely: the viewport clamp, the shared WebGL renderer and the
three.js lighting migration all sit in `adapters/` and could change output
without a single baseline moving.

**Litchi column drift.** `litchi.json` pins the CSV as generated today. It does
**not** verify the columns still match Litchi's current format — that check is
outstanding, and it is why no download button ships.

## Design notes

**Reference de-duplication.** `segments`, `shots` and `steps` do not contain
triples — they hold references to the same objects in `pointTriples`, and
`divideSegmentsIntoShots` deliberately unshifts each shot's last triple into the
next so consecutive shots overlap by one sample. The full dumps serialise
`pointTriples` once and replace every downstream reference with its index, which
keeps the files small and makes the overlap structure itself part of what is
protected.

**Relative tolerance, not exact equality.** `1e-9`. `Math.sin`, `cos`, `acos`,
`atan2` and `pow` are not required by ECMA-262 to be correctly rounded, and this
code leans on all of them — exact float comparison would go flaky the moment it
runs on x64 CI instead of an arm64 laptop. An independent differential later
confirmed every compared quantity was in fact bit-identical, so the tolerance is
not masking anything today.

One caveat on the wording: the scale is `max(1, |actual|, |expected|)`, so below
|x| = 1 the tolerance is effectively **absolute** 1e-9, not relative. The
near-zero flat-leg errors are therefore protected less tightly than the name
suggests.

**NaN, ±Infinity and undefined survive the round trip.** JSON turns the first
three into `null` and drops the last. All four are reachable — `angleFromLines`
calls `Math.acos`, which returns `NaN` once floating-point error pushes its
argument outside `[-1, 1]`. They are encoded as `"__NaN__"`, `"__Infinity__"`,
`"__-Infinity__"` and `"__undefined__"`. None appear in the current baselines,
which is itself worth knowing.

**Failures are recorded, not skipped.** If a case throws, the harness stores the
error as that case's outcome. All 36 currently succeed; when one of them threw,
fixing it produced a diff of exactly one case moving from `error` to `ok`, which
is the clearest possible review artefact.

## A warning about weak perturbations

When checking that this suite can actually fail, choose the perturbation
carefully. Several plausible ones are exact no-ops:

- `deltaError > 0.1` → `> 0.11` — no delta in the corpus lies between them.
  (`> 0.49` **is** caught, and breaks three files.)
- `i <= totalCurveLength` → `i <` in the sampling loop — the bound contains π
  and `i` is always integral, so they can never differ.
- `parseInt(x.toFixed(), 10)` → `Math.round(x)` — provably identical for
  positive `x`.

A suite that survives your test perturbation has told you nothing. The one used
to validate this harness was `deltaError > 0.1` → `> 1e-9`, which forces many
short segments; `verify.ts` reported 40 differences and exited 1.
