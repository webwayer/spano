# Golden characterisation tests

These baselines record what the planner **currently does**, captured from the
unmodified 2018 sources before any restructuring began.

They are not a claim that the output is correct. They are a claim that it does
not change by accident. Phases 2–4 move 1,651 previously untested lines around;
these files are the only evidence that a file move, a renamed symbol or a newly
enabled `strict` flag did not quietly alter the flight maths.

## Running

Both scripts run from the repository root. They use `npx --yes tsx@4` rather
than an installed dependency, so the legacy `package.json` (128 advisories) is
never installed. Node 26 cannot run these sources directly — strip-only type
removal rejects the parameter properties in `lib/math.ts` and both curve
classes.

```bash
# check current behaviour against the baselines — exits 1 on drift
npx --yes tsx@4 tools/golden/verify.ts

# re-record the baselines — only when a change is DELIBERATE
npx --yes tsx@4 tools/golden/capture.ts
```

Run `verify.ts` at the end of every phase gate. If it fails and you did not
intend to change behaviour, you have found a regression. If you did intend it,
re-run `capture.ts`, **read the diff**, and mention in the commit message which
cases moved and why.

Re-running `capture.ts` to make a red `verify.ts` go green, without reading the
diff, defeats the entire purpose of these files.

## What is covered

| File | Covers |
|---|---|
| `digest.json` | All 36 cases (18 parameter sets × 2 curve types). Per case: counts, per-segment average errors, shot layout, and the full step list — the same values the UI renders and a mission export consumes. |
| `full/*.json` | Three cases dumped in full, including every intermediate stage. |
| `geo.json` | `lib/math_geo.ts` — great-circle destination and initial bearing, plus round trips. |
| `litchi.json` | `makeLitchiMission()` CSV output, driven by a static fixture. |

**Not covered yet:** `getGeoSteps()` and `getPointsForViewport()` live inside
`index.ts` alongside jQuery, so they cannot be imported headless. Copying them
into the harness would let the copy drift and end up validating itself. They
gain coverage in Phase 3, the moment they move into `core/` — capture them
*before* changing anything else about them.

Also not covered: the 2D canvas layer, the three.js preview, and image
cropping. Those need a browser and are Phase 5 (Playwright).

## Design notes

**Reference de-duplication.** `segments`, `shots` and `steps` do not contain
triples — they hold references to the same objects in `pointTriples`, and
`divideSegmentsIntoShots` (`lib/model.ts:140`) deliberately unshifts each shot's
last triple into the next so consecutive shots overlap by one sample. The full
dumps serialise `pointTriples` once and replace every downstream reference with
its index. That keeps the files small and makes the overlap structure itself
part of what is protected.

**Relative tolerance, not exact equality.** Comparison uses a relative tolerance
of `1e-9`. `Math.sin`, `cos`, `acos`, `atan2` and `pow` are not required by
ECMA-262 to be correctly rounded, and this code leans on all of them — two V8
builds on different architectures can differ in the last ulp. Exact float
equality would make the suite flaky the moment it runs on x64 CI instead of an
arm64 laptop. `1e-9` relative is still ~7 orders of magnitude tighter than any
genuine behavioural change.

**NaN, ±Infinity and undefined are preserved.** JSON turns the first three into
`null` and drops the last. All four are reachable — `angleFromLines()` calls
`Math.acos`, which returns `NaN` once floating-point error pushes its argument
outside `[-1, 1]` on a degenerate triangle. They are encoded as `"__NaN__"`,
`"__Infinity__"`, `"__-Infinity__"` and `"__undefined__"`. None appear in the
current baselines, which is itself worth knowing.

## Known-failing case

One of the 36 cases throws today, and the baseline records that as behaviour:

```
stunning/viewpoint-above-curve  (offset 50, firstLeg 50, radius 40, secondLeg 20, viewPoint 200)
TypeError: Cannot read properties of undefined (reading 'pointOnTheGround')
```

**Root cause**, traced through the stages: the error-based segmentation produces
a *short* high-error segment — here 2 triples with `avgError` 0.357. Because
`avgError >= 0.01`, `divideSegmentsIntoShots` takes the curved branch
(`lib/model.ts:91`), where `splitBy` yields a single sub-array. With
`curvedShots.length === 1`, `restShots.slice(1)` is empty, so the
`restShots.slice(1).length === 1` test at `lib/model.ts:126` falls through to
`[].concat(restShots[1], restShots[2])` → `[undefined, undefined]`. The
`unshift` at line 140 masks the first `undefined` but not the last, so
`convertShotsIntoSteps` survives `firstElement.shootingPoint` at line 155 and
dies on `lastElement.pointOnTheGround` at line 170.

The trigger is a **short high-error segment**, not any single input parameter —
which is why it appears at a middling radius rather than the smallest one.

Fix this in Phase 4, then re-capture and confirm only this case's entry changes.

## A warning about weak perturbations

When validating that this suite can actually fail, pick the perturbation
carefully. Two plausible-looking ones turned out to be exact no-ops:

- `deltaError > 0.1` → `> 0.11` — observed deltas are ~1e-14 on the flat legs
  and >0.5 at the leg/arc transitions. Nothing sits in between.
- `i <= totalCurveLength` → `i < totalCurveLength` in the sampling loop — these
  differ only when `i` exactly equals the total, and the total is non-integer
  while `i` is always an integer.

Both facts are useful (those thresholds have real margin), but a suite that
survives your test perturbation has told you nothing. The one used to validate
this harness was `deltaError > 0.1` → `> 1e-9`, which forces many short
segments; `verify.ts` reported 40 differences and exited 1.
