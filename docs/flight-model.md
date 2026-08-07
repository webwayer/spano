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
projective warp. Use a WebGL quad with the homography as a 3×3 uniform —
three.js is already a dependency, so this costs one small shader.

**The hard limit:** a 2D warp assumes everything lies on the ground plane.
Buildings, trees and relief exhibit parallax, and no planar warp reconciles that.

### Tier 2 — seam optimisation

Choose the cut that minimises visible discontinuity (graph-cut) and blend across
it (Burt–Adelson multi-band). Cosmetic rather than corrective, cheap once Tier 1
exists, still fully in-browser.

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

The neat part: spano's existing output is already the right _input_. Novel view
synthesis needs known camera poses, and spano computes them and can export them
as a flight plan. Plan the flight → fly it → reconstruct → render the panorama
along the planned curve. That reuses the planner unchanged and replaces only the
cropping step — the one step that was never going to work.
