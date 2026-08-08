# Contributing to Glasswing

Glasswing is a Chrome MV3 extension written in TypeScript with no runtime
dependencies. It runs an accessibility audit inside the page you are looking
at, entirely on your machine.

## Local setup

```bash
npm ci
npm run build
```

Then open `chrome://extensions`, enable Developer mode, choose Load unpacked
and select the repository root.

## Before opening a pull request

```bash
npm run typecheck
npm test
npm run format:check
npm run build
npm run test:e2e   # needs: npx playwright install chromium
```

`npm test` covers the maths and the rule logic against jsdom. `npm run test:e2e`
loads the built extension into a real Chrome and audits
`tests/fixture/broken.html`, which is the only place a contrast number means
anything, because jsdom does not do the cascade.

## Three rules

**Glasswing makes no network requests.** No analytics, no telemetry, no CDN
fonts, no remote config, no "anonymous" usage ping. CI greps the built bundles
for `fetch`, `XMLHttpRequest`, `WebSocket` and `sendBeacon` and fails if any
appear.

**Glasswing holds no standing access to any page.** There are no content
scripts and no `host_permissions`. Page access is requested at the moment
someone runs a check, and the audit is injected into that one tab. CI fails the
build if a standing permission appears.

**A false positive is worse than a missed finding.** Someone acting on a wrong
finding changes correct markup and makes the page worse, and they stop trusting
the next twenty rows. When a rule cannot tell, it stays quiet.

## Adding a check

A new rule needs all of:

- an entry in `RuleId` and in `RULES`, with a `why` written for someone who has
  never read WCAG and does not want to; if the sentence cites a success
  criterion instead of a consequence, it is not finished
- detection in `audit.ts`, working from the passed `Document` rather than the
  global one, so it stays testable
- a test that a page breaking the rule is caught, **and** a test that a correct
  page using the awkward-but-valid pattern is not

That last one is the whole job. `alt=""`, `aria-label`, `role="main"`, a
wrapping `<label>` and a heading level going back up are all correct, and each
of them is something a naive version of a rule reports as broken.

## Guidelines

- Keep the change focused. One concern per pull request.
- Match the surrounding code: same naming, same file layout, same idiom.
- Logic that can be pure should be pure. Colour parsing, contrast, severity
  ordering and heading analysis all live in `src/` with no DOM in sight so they
  can be tested directly.
- Text and attributes quoted from a page are untrusted input and are never
  interpolated into markup. Build nodes and set `textContent`. There is no
  `innerHTML` in this codebase and there should not be one.
- Findings are written as plain sentences with the numbers in them
  ("Contrast is 2.4:1, needs 4.5:1"), not as rule codes.
- Update the README and CHANGELOG in the same pull request when behaviour
  changes.

## Reporting bugs

Use the bug report template. For a wrong finding, a public URL is worth more
than any description, because the cascade is usually the thing that explains it.
