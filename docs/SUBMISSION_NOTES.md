# WattKeep submission notes

These notes describe the state of the OpenAI WebMCP Challenge project at the current local handoff. The repository is intentionally private during development. Public release and submission actions remain separate from the completed product work.

## Completed

- [x] Source: the inspect, simulate, compare, explain, stage, review, human commit, stale rejection, restage, discard, undo, and session reset flows are implemented.
- [x] Licence: the repository includes the MIT licence in [LICENSE](../LICENSE), with copyright 2026 Dewaldt Huysamen.
- [x] Documentation: the product story, setup, tool contract, safety boundary, architecture, accessibility notes, and timed demo are documented in [README.md](../README.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [DEMO_SCRIPT.md](DEMO_SCRIPT.md).
- [x] Tests: unit, component, WebMCP contract, Playwright end-to-end, accessibility, responsive, fallback, stale, undo, reset, and preview smoke coverage is present.
- [x] Local verification: the current result set is 48 unit and component tests, 13 WebMCP contract tests, and 13 Playwright end-to-end tests. `test:a11y` invokes seven accessibility, responsive, and smoke tests. Typecheck, lint, and production build pass.
- [x] Native local WebMCP smoke: Chromium 151.0.7922.108 with WebMCP testing enabled exposed `document.modelContext`, registered exactly the eight page tools, exposed no forbidden approval, commit, or undo tool, and completed inspect, Balanced Night simulation, comparison, recoverable unknown-simulation handling, staging, review, and visible Review and commit synchronisation. The smoke stopped before human commit, as intended. A pre-aborted native execution produced the browser transport's `AbortError` behaviour.

## Verification commands

Run from the repository root after installing the locked dependencies:

```bash
npm run test:unit
npm run test:contracts
npm run test:e2e
npm run test:a11y
npm run typecheck
npm run lint
npm run build
```

The browser tests use system Chromium 151 in this environment and a contract-faithful fake `modelContext` for deterministic page-tool execution. Axe assertions require no serious or critical violations in the tested states. That threshold is automated evidence, not a total WCAG certification.

The local native smoke confirmed the host-facing registration and execution path. It does not make a current ChatGPT in-app browser run or a public deployment claim.

## Later actions not completed

The following are intentionally uncompleted and must be handled only after the product and final scan are approved:

- [ ] Make the repository public only after approval and a final scan for secrets, private details, local planning residue, and unsupported claims.
- [ ] Choose and publish the final live deployment URL.
- [ ] Capture final screenshots or other submission assets, if desired.
- [ ] Record and upload the three-minute demo video.
- [ ] Publish the final YouTube URL, if a video is uploaded there.
- [ ] Submit the Devpost form for the challenge.
- [ ] Run a current ChatGPT in-app browser smoke, if that environment is available for final checking.

No deployment, public repository, video upload, YouTube URL, or Devpost submission is claimed by these notes.

## Scope boundary

WattKeep remains a fictional, anonymous, deterministic, local-first planner. It has no backend, accounts, live telemetry, messaging integration, billing, or real inverter control. The page tools and schemas are an interface for the challenge; they are not an authorisation boundary. The manual interface is complete when WebMCP is absent or registration fails, and localStorage supplies reload recovery rather than cross-tab consistency.
