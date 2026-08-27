# The flight model

The maths behind spano, written down so it survives outside the author's head.
This is the highest-value document in the repository: without it nobody —
including a future you — can safely change the planner.

## The problem

A vertical curved panorama is a set of ground photographs, cropped and stacked
so the result reads as one continuous image bending away from the viewer.

Model it as a **virtual surface** hanging in the air. Every patch of ground has
a place on that surface, and the finished panorama is what a viewer standing at
a fixed point would see if the ground were painted onto it.

Three points define each sample:

| Point              | Meaning                                             |
| ------------------ | --------------------------------------------------- |
| `pointOnTheGround` | the patch of ground being photographed              |
| `pointOnTheCurve`  | where that patch must appear on the virtual surface |
| `shootingPoint`    | where the camera has to be for the two to line up   |

The code calls this triple a `Triple`, and everything downstream is derived
from a list of them.

## Coordinates and units

Everything happens in a **vertical slice** through the flight path.

- `x` — ground distance from the start point, metres, increasing away from the viewer.
- `y` — altitude, metres.
- Angles — degrees, except inside `src/core/geometry/angles.ts`, which is the
  only place radians exist. Trig is routed through wrappers that accept a
  branded `Radians` type, so `cos(someDegrees)` does not compile.

The 3D preview uses a different frame: the slice's `x` becomes the scene's `z`,
`y` stays `y`, and the camera sits on the centreline at `x = 0`. The conversion
is `sliceToScene()` in `src/adapters/scene3d/scene.ts`.

## The curve

Both built-in shapes are three pieces: a flat leg on the ground, an arc, then a
second leg. They are parameterised by **arc length**, from 0 to
`getTotalLength()` — a property the planner relies on completely, and which
`tests/property/curves.test.ts` checks.

| Shape         | Arc sweep | Arc length | Second leg    |
| ------------- | --------- | ---------- | ------------- |
| `Arc90Curve`  | 90°       | `π·r/2`    | vertical      |
| `Arc135Curve` | 135°      | `3·π·r/4`  | rising at 45° |

135° is three eighths of a circle, hence `3πr/4`. The README claimed 120° from
2018 until 2026; it was never that.

`getPointOnTheGround(l)` is simply `{ x: offset + l, y: 0 }` — the ground is
assumed **flat**. That assumption is the single biggest limitation of the model
after the stitching problem, and terrain-following is the obvious next feature.

### The shooting point

For a sample at arc length `l`:

1. Take `pointOnTheCurve(l)` — where the patch must appear.
2. Measure the angle and distance from there to the viewpoint. Which reference
   the angle is measured against depends on which piece of the curve `l` falls
   in; that is what `getCorrectedViewAngle` switches on.
3. Apply that same angle and distance from `pointOnTheGround(l)`. The result is
   where the camera must be.

Step 3 is `calculateTriangleCustom`, which **requires its first argument to be
on the ground** — it places the right-angle vertex at `y = 0` and ignores the
input's `y` entirely. Both call sites pass a ground point. A property test
caught that this was never written down.

## The five planner stages

`src/core/planner/`, composed by `plan.ts`.

### 1. Sampling — `sampling.ts`

Walk the curve at one-metre intervals, inclusive of both ends, producing one
`Triple` per sample.

### 2. Error model — `error-model.ts`

For each sample, compare two angles at its ground point: the angle to its **own**
shooting position, and the angle to the **previous** shooting position.

Their difference is the `shootingError`. It answers: _if I photograph this patch
from where I was standing for the last one, how far off is the result?_

Along the flat legs the two coincide and the error is ~1e-14. Around the arc
they diverge and it exceeds 0.5°. **That divergence is the whole problem**, and
everything downstream is an attempt to manage it.

### 3. Segmentation — `segmentation.ts`

Split into runs where the error behaves consistently — a new segment starts
where the error _changes_ by more than `SEGMENT_SPLIT_ERROR_DELTA` (0.1°)
between adjacent samples.

Measured over the golden corpus — 10,985 deltas — 10,891 sit at or below the
threshold and 94 above it, with the nearest neighbours either side at **0.0685**
and **0.1877**. There is real margin, but it is roughly 0.07 to 0.19, not the
orders of magnitude an earlier draft of this document claimed. Perturbing the
threshold to 0.11 moves no case; 0.49 breaks three golden files.

### 4. Shot allocation — `allocation.ts`

The most intricate stage.

**Flat segments** (`avgError < 0.01`) split so no frame covers more than
`maxViewAngle` (20°) of ground.

**Curved segments** additionally cap accumulated distortion at
`maxDistortionAngle` (7°) per frame, and are laid out `start` / centre-pairs /
`end` so the seams land where the mismatch between neighbours is smallest.

Consecutive shots deliberately **overlap by one sample**, giving each seam a
shared reference point.

Two consequences worth knowing:

- The 20° budget is a **target, not a bound**, and the gap is much larger than
  it looks. The greedy splitter admits the final sample of a run
  unconditionally, the anchored layout then merges _pairs_ of groups without
  re-checking, and the one-sample overlap widens every shot again. Most frames
  land near 20°, but degenerate geometry — a shooting point that lands on the
  ground between the two points it frames — reaches **178°**, far beyond any
  sensor. `stepsExceedingFieldOfView` reports these and the UI flags them;
  correcting the allocation is a change to the flight model and belongs in its
  own commit.
- Segments yielding fewer than three groups cannot support the anchored layout
  and fall back to one frame per group. Before 2026 they instead indexed past
  the end of the array and produced `undefined` samples, which surfaced as a
  crash two stages later.

### 5. Steps — `steps.ts`

Turn each shot into a pilot instruction. `shotOn` decides which sample supplies
the hover position:

| `shotOn` | Hovers at         | Aims at                      | Effect                   |
| -------- | ----------------- | ---------------------------- | ------------------------ |
| `start`  | the first sample  | its ground patch             | strip against one edge   |
| `center` | the middle sample | the point bisecting its view | strip centred in frame   |
| `end`    | the last sample   | its ground patch             | strip against other edge |

`viewAngleToTheGround` is measured from straight down and then reduced by 90°,
so it is gimbal pitch relative to horizontal, negative pointing down. The UI
negates it again to read "36° down".

`backwards` is true when the aircraft has overflown the patch it is imaging and
must turn to shoot back down the track. The image is rotated 180° during
cropping to compensate.

## The fields of view

`vFov` 46.8 degrees drives `calcViewport`, so it decides every crop the tool
produces. `hFov` is used only to draw ground footprints on the map.

`hFov` was 62.4 from 2018 until 2026, and it was wrong: 62.4 / 46.8 is exactly
4/3, so the horizontal figure had been obtained by scaling the vertical _angle_
by the sensor's aspect ratio. For a pinhole camera it is the tangents of the
half-angles that carry the aspect ratio, not the angles, so the two numbers
described a sensor of ratio 1.3995 while the camera writes 4:3 stills. Every
footprint drawn from it was 4.7% too wide.

Deciding which number to keep was not arbitrary. `vFov` has an empirical check
behind it — strips have stacked cleanly along the flat legs for years — and an
independent one: a 28 mm-equivalent lens gives 46.40 degrees. `hFov` had neither.
With `vFov` trusted and the sensor 4:3, the horizontal field is determined:
`2 * atan(4/3 * tan(23.4)) = 59.9686`.

Two alternatives were rejected because each arrives as a _pair_, and mixing
pairs is the original mistake: DJI's published 78.8 degrees diagonal implies
66.62 horizontal but also 52.47 vertical, and a 28 mm equivalent implies 65.47
horizontal but on a 3:2 frame. The absolute figures are still unverified against
the real optics; what is now guaranteed is that they cannot contradict each
other, because `tests/unit/camera.test.ts` asserts the tangent ratio against
`sensorPixels` for every profile.

The correction re-recorded `tests/golden/flight-path.json`. The diff touches
`hFov` and the two viewport offsets and nothing else — no waypoint moved, and
`digest.json` and the full dumps did not change at all, which is the evidence
that the planner itself was untouched.

## From plan to map

`src/core/geo/flight-path.ts` projects `shootingPoint.x` along the bearing from
the start point toward a direction point, using the great-circle formulae in
`great-circle.ts`. Backwards steps keep their position and invert their heading.

Waypoints closer together than 0.6 m are pushed apart: flight controllers cannot
resolve them otherwise.

## The crop

`calcViewport` in `src/adapters/imaging/images.ts` decides which horizontal band
of a frame to keep. Its height is the fraction of the sensor's vertical field of
view the shot actually covers:

```
activeImageArea = (angleOfView / vFov) * imageHeight
```

Its vertical position follows the anchor. The first and last shots of a plan
extend to the frame edge, so the panorama has no hard cut at either end.

The result is floored — canvas dimensions are unsigned longs — and clamped to at
least one pixel. A plan can contain a shot whose angle of view rounds to 0°, and
a zero-height canvas serialises to the string `data:,`, which no `<img>` can
decode.

## The unsolved problem

Cropping works along the flat legs. Around the arc it cannot, and this is not a
tuning issue: **a crop selects pixels; it does not change the projection they
were captured under.** Two adjacent strips shot from different positions
foreshorten the ground differently, so they disagree at their seam wherever you
cut. Stage 2 measures exactly this residual; stage 4 bounds it rather than
removing it.

Three ways to do better, in increasing cost.

### Tier 1 — warp each strip instead of cropping it

_Client-side. Best value for effort. Do this one first._

Every piece needed is already computed: the camera position, its look-at point,
its field of view, and a ground-plane assumption. That is enough to derive the
exact **homography** from each captured frame to the panorama's local frame, and
resample the strip through it rather than cutting a rectangle out of it. Scale
and keystone mismatch at the seams disappear because the strips stop being in
disagreeing projections.

`CanvasRenderingContext2D.setTransform` is affine only and cannot express a
projective warp — an affine map sends a rectangle to a parallelogram, and ground
seen obliquely is a trapezoid. So it is a WebGL quad with the homography as a
3×3 uniform.

**Built, in `src/core/imaging/` and `src/adapters/imaging/warp-gl.ts`.** Four
things about it were not obvious from this paragraph:

- **The panorama is treated as its own pinhole camera**, standing at the
  viewer's eye and aimed at the curve. That is not an embellishment, it is what
  this document already says the panorama _is_ — and once the destination is an
  ordinary projection, the map from frame to panorama is a homography.
- **The axis points at the curve's angular bisector**, not at the midpoint of
  its chord. Aiming at the chord's midpoint put parts of a strongly bent curve
  behind the plane of the lens, and failed on an eighth of the parameter space
  for no reason but a badly chosen ray.
- **Two shapes have no flat picture at all**, and the code refuses them by name
  rather than producing nonsense. `PanoramaTooWide`: a rectilinear projection
  cannot carry half a turn and degrades long before it. `PanoramaFolds`: the
  135° arc's second leg rises back towards the viewer, and from some heights it
  runs along the line of sight, so two parts of the ground claim one direction.
  Together they account for 4.8% of the shapes the form can reach.
- **Not on the shared three.js renderer.** That renderer lives behind a 523 KB
  dynamic import loaded only for the synthetic preview; the warp is needed on
  the photo path, which never touches it. Raw WebGL2 in its own module, with the
  same one-context-for-the-page discipline.

The seams now agree to within 5e-12 of a pixel across the whole parameter space,
which is machine zero. `tests/property/strip-warp.test.ts` is where that is
asserted.

**The hard limit, unchanged:** a 2D warp assumes everything lies on the ground
plane. Buildings, trees and relief exhibit parallax, and no planar warp
reconciles that. `src/core/quality/parallax.ts` measures what is left.

### Tier 2 — seam optimisation

Choose the cut that minimises visible discontinuity and blend across it.
Cosmetic rather than corrective: it hides the residual parallax, it does not
remove it.

**Built**, in `src/adapters/imaging/seam.ts`, with two departures from the
sketch above worth recording.

**Dynamic programming, not a graph cut.** Graph cuts earn their cost when the
overlap is a two-dimensional region and the boundary may take any shape. Here
the overlap is a horizontal band and the cut has to cross it left to right
exactly once, so the optimal path is a shortest path through a grid — solved
exactly by dynamic programming in O(width × height), in about twenty lines, and
without needing a worker to stay off the main thread.

**The overlap had to be manufactured.** After Tier 1 the strips abut exactly,
which is the point of it and leaves nowhere to put a seam. The imagery is
already there: a frame covers the sensor's full 46.8° while its strip is
allotted about twenty, so most of every photograph is discarded, and a
projective map does not stop at the corners it was built from. Asking for rows
beyond the nominal range returns the neighbouring ground for free.

Strips then alternate between **two** composite layers rather than one per
strip. With the overshoot at 0.4 of the smaller neighbour, strip _i_ reaches at
most 0.4 into strip _i+1_ while strip _i+2_ reaches back at most 0.4 from the
far side — 0.4 against 0.6, so a layer never overlaps itself. For a 161-frame
plan that is two canvases instead of a hundred and sixty-one.

**Still missing: multi-band.** The feather hides a cut in detail. It does not
hide an exposure difference between two photographs taken minutes apart, which
lives at a spatial scale far wider than any feather. Laplacian pyramids are the
answer, and are the next thing to build here.

### Tier 3 — synthesise the view that was never photographed

_Offline reconstruction, in-browser viewing._

The fundamental issue is that the ideal ray exists in no captured frame. So stop
cropping and **generate** it. This is novel view synthesis, practical since
around 2020:

- **SfM + MVS** (COLMAP, OpenMVS): recover poses and a dense textured mesh, then
  render the panorama from the ideal curved camera path. Deterministic, no
  training.
- **3D Gaussian Splatting** (2023 onward): reconstruct as explicit anisotropic
  Gaussians. Trains in minutes on a consumer GPU, renders in real time, and
  WebGL splat renderers exist — so reconstruction stays offline while the viewer
  remains a static page, which keeps this project's no-server constraint intact.
- **NeRF variants**: higher fidelity on reflective surfaces, slower. Probably
  the wrong trade for aerial ground imagery.

### Interpolating across the seam

Short of a reconstruction, the disagreement at a seam can be **measured** and
crossed smoothly rather than cut. `src/adapters/imaging/flow.ts` does that, and
two choices in it are worth recording.

**The flow is one-dimensional, which is physics rather than economy.** A
parallax displacement lies along the epipolar line, set by the direction the
camera moved; the aircraft moves along the track, and the track projects into
the panorama very nearly vertically. Searching two dimensions would cost a
hundred times more and spend it looking where the answer cannot be.

**One displacement per column, not per pixel.** A per-pixel field needs
regularisation to stay coherent, and without it tears — which looks worse than
the honest step it replaced.

It is offered only where it can work. At the wide-strip plan's fifteen degrees
between frames the ground moves further than any sensible search covers, so the
measurement would return nothing and the mode would quietly become a
cross-fade under a name promising otherwise. The single hover has no parallax to
measure at all. `dense-linear` exists to make consecutive frames close enough
that the match is reliable.

### Measuring the height instead of assuming it

The one path here that _removes_ the residual rather than hiding it, and it
needs no neural network to do it.

Two frames meeting at a seam are a stereo pair whose baseline spano knows
exactly, because it computed both poses. Their disagreement is therefore not a
nuisance but a reading: an object of height `h` is drawn by each camera as
though it stood at `h·tanθ` from its real position, so the two place it
`h × slidePerMetre` apart on the ground — and `slidePerMetre` is the number
`quality/parallax.ts` already reports. Hence

```
h = disparity_in_rows / (slidePerMetre × rows_per_ground_metre)
```

with every term on the right known. The height comes out in **metres**, not in
a relative unit needing a scale fitted afterwards, which is what a monocular
depth model would have given — at the cost of tens of megabytes of weights and
a relaxation of the content security policy.

Knowing `h`, the relief displacement can be subtracted so every raised object is
drawn over its own base. That is the true-orthophoto correction, and once it is
applied all the strips agree about where the tree is, because all of them are
drawing it over its footprint.

**The irony is structural and worth stating plainly.** Height is recovered from
parallax, and every other mode in this project exists to make parallax small. On
the default curve one row of measured disparity means

| capture            | frames | metres of height per row |
| ------------------ | ------ | ------------------------ |
| wide strips        | 10     | 0.36                     |
| fine strips, 1°    | 43     | 1.88                     |
| fine strips, 0.25° | 141    | 6.11                     |
| dense pass, 0.1°   | 431    | 18.41                    |

so this is the one mode that wants a _coarse_ flight, and it is offered on the
wide plan and withheld from the dense one. Two further limits are reported
rather than hidden: a seam with no parallax is refused outright, and the
measurable height is capped by the overlap band, because a disagreement larger
than the band cannot be seen inside it.

### A bug this uncovered

`FLAT_SEGMENT_ERROR` was an absolute threshold on `avgError`, which is measured
between neighbouring samples and therefore scales with `stepLength`. As an
absolute number it was a statement about the sampling rate rather than about the
ground, and any curve became "flat" once sampled finely enough. On
`Arc90Curve(200, 200, 200, 200)` at a 0.07 m interval the average fell to
8.8e-3, the whole arc took the flat branch, and the greedy splitter closed no
group at all: 14,284 samples became **one photograph**.

Unreachable since 2018 only because nothing ever passed a `stepLength` other
than 1. It is now `FLAT_SEGMENT_ERROR_PER_METRE`, multiplied by the interval, so
at 1 m it is the old constant exactly and the golden baselines did not move.

The neat part: spano's existing output is already the right _input_. Novel view
synthesis needs known camera poses, and spano computes them. Plan the flight →
fly it → reconstruct → render the panorama along the planned curve. That reuses
the planner unchanged and replaces only the cropping step — the one step that
was never going to work.

`src/core/export/colmap.ts` now writes that model, and the page has buttons for
its three files. Two things it deliberately does not claim:

- **The poses are planned, not measured.** The aircraft hovers near them, not on
  them, and wind and GPS drift are larger than a reconstruction's tolerances.
  They are a prior and a frame to align to, not a substitute for
  structure-from-motion on the real photographs.
- **The valuable half is the render path.** Once a reconstruction exists, the
  exported poses are exactly the virtual cameras the panorama is composed from,
  and a virtual camera costs nothing to render. Frame count stops being a flying
  cost, so the finest capture density becomes available from a coarse flight.
  That is the one route by which the residual actually reaches zero rather than
  merely getting smaller.
