# Contributing

Thanks for looking. Issues and pull requests are welcome.

## Setup

Node 24 or newer (see `.nvmrc`).

```bash
npm ci
npm run dev
```

## The gate

```bash
npm run check
```

That runs formatting, lint, three type-check projects, unit and property tests,
and the golden baselines. CI additionally builds and runs Playwright against the
production build.

## Things worth knowing before you change code

**`src/core/` must stay pure.** No DOM, no three.js, no imports from `adapters/`
or `ui/`. This is enforced by `src/core/tsconfig.json` (which omits `"DOM"` from
`lib`) and by an ESLint rule, so you will find out immediately.

**The golden baselines are the safety net.** They record what the planner
currently does. If `npm run golden` fails and you did not mean to change
behaviour, you have found a regression. If you did mean to, re-record with
`npm run golden:capture`, **read the diff**, and say in the commit message which
cases moved and why. Re-recording to make a red run green, without reading the
diff, defeats the whole mechanism. See `tests/golden/README.md`.

**The maths is documented.** `docs/flight-model.md` explains what each planner
stage does and why. If you change the model, change that too.

## Adding an aircraft

Five lines in `src/core/camera/profiles.ts`, plus its entry in
`CAMERA_PROFILES`. Vertical and horizontal field of view, and the gimbal pitch
range. Please say which aircraft you measured against.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/). Explain _why_ in
the body — the what is in the diff.

## Safety

spano produces flight plans. If you find a defect that makes it emit an unsafe
or invalid plan, please report it privately — see `SECURITY.md`. That is treated
with the same priority as a security issue.
