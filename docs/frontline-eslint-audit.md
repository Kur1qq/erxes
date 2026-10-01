# Frontline ESLint measurement

Measured on 2026-10-01 from fork commit `205b730b6bbd044f8c35d94bd3548a4ff8d2c31c`.
This is a measurement only: no ESLint rule or CI requirement was changed.

## Scope and method

- `frontline_ui`: 1,386 TypeScript source files under `frontend/plugins/frontline_ui/src`, using its own `eslint.config.js`.
- `frontline_api`: 636 TypeScript source files under `backend/plugins/frontline_api/src`, using the repository root `eslint.config.js` because this plugin has no local ESLint config.
- Node `22.23.0`, ESLint `9.24.0`, TypeScript `5.7.3`.
- Typed rules were measured with `--parser-options '{"projectService":true}'`. They are not enabled in the checked-in configs.
- Counts are ESLint findings, not confirmed runtime bugs. Times are one local run each, not CI benchmarks.

| Project         | Current errors | Current warnings | Files with findings | Current lint time |
| --------------- | -------------: | ---------------: | ------------------: | ----------------: |
| `frontline_ui`  |              9 |              101 |                  72 |              14 s |
| `frontline_api` |              9 |               90 |                  39 |               6 s |

Current warnings include 58 `@typescript-eslint/no-unused-vars` and 25 `react-hooks/exhaustive-deps` findings in UI, plus 90 `no-unused-vars` findings in API. UI also has two existing `react-hooks/rules-of-hooks` errors. Requiring the current full lint command would already fail both projects.

## Candidate rules

| Rule                                         |  UI findings | API findings | Notes                                                                                                                    |
| -------------------------------------------- | -----------: | -----------: | ------------------------------------------------------------------------------------------------------------------------ |
| `@typescript-eslint/no-floating-promises`    |          175 |           61 | Unhandled Promise statements; API findings cluster in inbox (23) and ticket (22).                                        |
| `@typescript-eslint/no-misused-promises`     |          165 |           17 | UI findings often involve async event attributes; API findings often involve async route callbacks. Review each context. |
| `@typescript-eslint/no-unsafe-assignment`    | Not measured |        1,993 | API-only measurement.                                                                                                    |
| `@typescript-eslint/no-unsafe-member-access` | Not measured |        2,398 | API-only measurement.                                                                                                    |
| `@typescript-eslint/no-unsafe-call`          | Not measured |          672 | API-only measurement.                                                                                                    |
| `@typescript-eslint/no-unsafe-return`        | Not measured |          314 | API-only measurement.                                                                                                    |

The four API `no-unsafe-*` rules produced 5,377 findings in total. All typed-rule runs completed without parser errors. Measuring `no-floating-promises` plus `no-misused-promises` took 48 s for UI and 32 s for API; the four API `no-unsafe-*` rules took 28 s. Typed linting adds a material cost, and the rule groups were measured in separate runs.

Examples requiring owner review:

- `backend/plugins/frontline_api/src/modules/ticket/graphql/resolvers/mutations/pipeline.ts:28`: `graphqlPubsub.publish(...)` returns a Promise that is not awaited or caught before the resolver returns.
- `backend/plugins/frontline_api/src/main.ts:56`: `startPlugin(...)` returns a Promise without an explicit rejection handler.
- `backend/plugins/frontline_api/src/modules/integrations/facebook/routes.ts:12`: an async Express callback is passed where a void-returning callback is typed; it already contains a `try`/`catch`, so this needs contextual review.
- `frontend/plugins/frontline_ui/src/widgets/automations/modules/instagram/components/bots/components/InstagramPageInfo.tsx:16`: an existing `rules-of-hooks` error reports a Hook called after an early return.

## Reproduce

Run from the repository root. These commands report existing findings and may exit with code 1; they do not edit source files.

```bash
pnpm exec eslint --config frontend/plugins/frontline_ui/eslint.config.js --format json 'frontend/plugins/frontline_ui/src/**/*.{ts,tsx}'
pnpm exec eslint --config eslint.config.js --format json 'backend/plugins/frontline_api/src/**/*.{ts,tsx}'
```

For typed-rule measurements, add `--parser-options '{"projectService":true}'` and the chosen `--rule '@typescript-eslint/<rule>:error'` arguments to the matching command.

## Rollout decision pending

`no-floating-promises` in `frontline_api` is the first pilot candidate because its 61 findings include server-side mutation and startup paths. Review representative findings with the plugin owner before changing behavior. If selected, start with a fork-only, report-only pilot; existing errors make an immediate required lint gate unsuitable. A count baseline can prohibit growth in a file/rule bucket but cannot guarantee detection of every new finding when an old one disappears in the same bucket. `no-unsafe-*` needs separate type-boundary cleanup before a broad rollout.
