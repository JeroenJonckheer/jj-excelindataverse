# Testing

The test strategy is layered so that most of the coverage runs deterministically and without a live
environment.

## Layers

- **Unit tests (Jest)** for the pure logic: validation, paste parsing, navigation, formatting,
  column mapping and edit resolution.
- **Component tests (React Testing Library)** for cell editing, selection, keyboard behaviour,
  paste and saving.
- **End-to-end tests (Playwright)** against an offline harness that mounts the real control with a
  mocked dataset context and a deterministic Dataverse service, covering the full interaction.
- **Live smoke test** against the target environment via an app registration, so even that step is
  repeatable and runs without manual clicks.

## Repeatable cycle

```bash
npm run lint           # lint check
npm run typecheck      # TypeScript check
npm run test           # unit and component tests
npm run test:coverage  # tests with the enforced coverage threshold
npm run test:e2e       # Playwright tests against the harness
npm run verify         # all of the above plus the build, in order
```

`npm run verify` succeeds or fails deterministically and is the single gate used before building the
solution and publishing a release.

## Coverage threshold

The coverage threshold is enforced in `jest.config.js`. Statements, functions and lines are held at
80% and branches at 75%. A change that drops below the threshold fails `npm run test:coverage`, and
therefore `npm run verify`.

## Continuous integration

GitHub Actions runs `npm run verify` on every push and pull request, so the same gate that runs
locally runs in CI.

## The harness

The offline harness lives in `harness/`. It bundles the real control with a mock context (sample
records and columns) and a mock Dataverse service (static metadata, in-memory save and lookup
search), then serves it as a static page. Playwright drives that page. The harness is also used to
record the demo.
