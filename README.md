# spano

Work out the drone flight for a **vertical curved panorama**: where to hover, at
what altitude and gimbal angle, and which slice of each frame to keep.

**[Try it →](https://webwayer.github.io/spano/)**

Everything runs in your browser. There is no backend, and photos you select are
read locally and never uploaded.

<!-- TODO: an example panorama that spano itself produced, committed under docs/.
     The image that used to be here was hotlinked from a third-party CDN. -->

## What it does

A vertical curved panorama is a set of photographs of the ground, taken from
different positions and angles, cropped and stacked so the result reads as one
continuous image bending away from the viewer.

Given the shape you want and the eye you want it composed for, spano works out:

- how many photographs to take,
- where the aircraft must hover for each, and at what altitude,
- what gimbal pitch to use, and
- which horizontal strip of each frame belongs in the finished panorama.

You can adjust the offset (ground under the start point you don't want in shot),
the two flat legs, the arc radius, and the viewpoint height. Two curve shapes
are built in — a 90° arc and a 135° arc — and adding more is a small amount of
code.

## Capture modes, and what each one costs

The seam problem below is not one number, it is a trade, so the tool now plans
several ways of photographing the same panorama and measures all of them side by
side. For a 10 m object on the default parameters:

| Capture mode                 | Frames | Seam slide |
| ---------------------------- | ------ | ---------- |
| Wide strips (the original)   | 10     | 14.3 m     |
| Fine strips, 1° per frame    | 43     | 3.5 m      |
| Fine strips, 0.25° per frame | 141    | 1.3 m      |
| Single hover, gimbal sweep   | 2–8    | **0**      |

A single hover has no parallax at all, because parallax needs two viewpoints —
but it foreshortens the distance badly, which is the entire reason the aircraft
flies the arc in the first place. The comparison table on the page does not rank
the modes, because that trade is the user's to make.

`src/core/quality/parallax.ts` is where the number comes from.

## Trying the modes

No photographs needed. Press **Build panorama from preview** and the synthetic
scene renders itself, then change **Processing** and it rebuilds — the frames
are cached, so everything after the first build costs only the processing.

Every processing mode is selectable on every capture that produces strips at
all, because watching a mode produce no change is itself a finding about the
flight — and a picker that decides for you cannot tell you that. Where a pair is
a poor one the note underneath says what to expect, since the reasons run in
opposite directions: the morph needs frames _close enough to match_, and the
height measurement needs them _far enough apart to disagree_.

The one capture that offers nothing is the survey grid, and that is a fact about
the flight rather than a judgement: it flies several lines over the same ground,
so several frames claim the same panorama rows and there is no strip to
reproject.

## Processing modes

Two ways of turning the frames into a panorama, switchable on the page:

- **Plain crop** — the original: cut a horizontal band out of each frame and
  stack them. Two strips shot from different positions foreshorten the ground
  differently, so they disagree wherever the cut falls.
- **Reproject** — resample each strip onto the viewer's curve through its exact
  projective map. The ground lines up at every seam to machine precision.
- **Reproject and blend** — additionally route each cut around whatever stands
  above the ground, and soften it. A tree halved at a seam is what the eye
  catches; a cut through the grass beside it is not.
- **Reproject and orthorectify** — measure how tall things actually are, from the
  parallax between frames and the baseline spano already knows, then stand each
  object back over its own base. The only mode that removes the defect instead
  of hiding it — and the only one that wants a _coarse_ flight, because it needs
  the parallax the others exist to suppress.
- **Reproject and morph** — measure how far the two frames disagree at each seam
  and slide across it, so the object travels instead of stepping. Needs
  consecutive frames close enough to match, which is what the dense capture mode
  is for; it is withheld where it could not work rather than degrading in
  silence.

Reprojecting fixes the ground and only the ground. Objects standing above it
still slide, by the amounts in the table above; that residual needs a
reconstruction, and the page exports the camera poses for one.

Either mode can be saved as a PNG. Until 2026 the plain mode produced no
panorama _file_ at all — the picture existed only as a column of `<img>`
elements that CSS stacked edge to edge, which is fine to look at and impossible
to keep.

## Known limitation

Along the flat legs, cropping a strip out of each frame works. Around the arc it
does not, and no amount of parameter tuning fixes it: **a crop selects pixels,
it cannot change the projection they were captured under.** Two adjacent strips
taken from different positions foreshorten the ground differently, so they
disagree at their shared seam wherever you cut.

The current code manages this by bounding the distortion accumulated within each
frame rather than removing it. `docs/flight-model.md` explains what is actually
being measured and sets out three ways to do better, from a client-side
per-strip warp to offline novel-view synthesis.

## Quick start

Requires [Node.js](https://nodejs.org) 24 or newer.

```bash
npm ci
npm run dev      # http://localhost:5173/spano/
```

Other commands:

| Command                  | What it does                                                 |
| ------------------------ | ------------------------------------------------------------ |
| `npm run check`          | Format, lint, types, unit and property tests, baselines      |
| `npm run build`          | Type-check and build into `dist/`                            |
| `npm test`               | Unit and property tests                                      |
| `npm run test:e2e`       | Playwright, against the production build                     |
| `npm run golden`         | Verify the planner against its characterisation baselines    |
| `npm run golden:capture` | Re-record those baselines — only when a change is deliberate |

## How it is put together

```
src/core/      pure planning: geometry, geodesy, curves, the planner, CSV export
src/adapters/  canvas, imaging, three.js, file download
src/ui/        form reading, step list, previews
src/main.ts    composition root — wiring only
```

`src/core` has no DOM and no three.js, and that is enforced rather than agreed:
`src/core/tsconfig.json` omits `"DOM"` from `lib`, so `document`, `window` and
`canvas` do not resolve there, and an ESLint rule blocks importing `three` or
anything from `adapters/` and `ui/`. The whole planner therefore runs in Node in
milliseconds, which is why the test suite is fast and does not need a browser.

More in [`docs/architecture.md`](docs/architecture.md). The maths is written up
in [`docs/flight-model.md`](docs/flight-model.md), and the decisions behind the
2026 rebuild are in [`docs/adr/`](docs/adr/).

## Sharing a plan

The current parameters live in the URL fragment, so a link reproduces the plan
exactly. Fragments are never sent to the server, so a shared link leaks nothing
to the host.

## Not shipped yet

**Mission export.** `src/core/export/litchi-csv.ts` produces a Litchi Mission
Hub CSV, and it is unit-tested — but the column set has not been checked against
Litchi since 2018, and a stale header silently mis-maps every field after the
first missing one. In this context that means a wrong flight plan, so there is
deliberately no download button until the format is validated against a current
Litchi export. For recent DJI airframes, WPML `.kmz` is likely the better target.

## Safety

spano generates flight plans. It is **not** a safety-critical system and carries
no warranty — see [LICENSE](LICENSE). Always check a generated plan against your
aircraft's limits and your local aviation rules before flying.

The tool warns when a plan puts waypoints above a configurable altitude ceiling,
defaulting to 120 m — the EASA Open Category limit, and close to the FAA
Part 107 limit of 400 ft (≈122 m). It is a warning, not a guarantee of legality.

## Contributing

Issues and pull requests are welcome. `npm run check` is the gate. If you change
planner behaviour deliberately, re-record the golden baselines **and describe
which cases moved and why** — see [`tests/golden/README.md`](tests/golden/README.md).

Adding an aircraft is a five-line change in
[`src/core/camera/profiles.ts`](src/core/camera/profiles.ts).

## Licence

[MIT](LICENSE).
