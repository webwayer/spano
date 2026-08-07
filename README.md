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
