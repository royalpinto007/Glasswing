# Glasswing

See what your page is doing to people who cannot see it. Ten accessibility
checks, run inside the page, with a plain sentence for every problem and a
button that shows you exactly which element it means.

[![CI](https://github.com/royalpinto007/Glasswing/actions/workflows/ci.yml/badge.svg)](https://github.com/royalpinto007/Glasswing/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-241713.svg)](manifest.json)
[![Tech](https://img.shields.io/badge/Tech-TypeScript-b5432a.svg)](#how-it-works)

<!-- media:start -->
<!-- media:end -->

## Why

Most accessibility tools tell you that an element "violates 1.4.3". That is a
citation, not a reason, and nobody has ever fixed a page because of one.

Glasswing tells you the contrast is 2.4:1 where it needs 4.5:1, that the grey
is unreadable in sunlight and to a very large number of people with reduced
vision, and then draws a box around the paragraph in question. Same finding,
but it is now something a person can act on before lunch.

## What it checks

| Check                      | Severity | What it catches                                                 |
| -------------------------- | -------- | --------------------------------------------------------------- |
| Image with no alt text     | Serious  | A screen reader reads the file name instead                     |
| Text contrast below AA     | Serious  | Text that cannot be read in sunlight or with reduced vision     |
| Form field with no label   | Serious  | A field announced with no idea what it is for                   |
| Link with no readable text | Serious  | A dead end in the list of links screen reader users navigate by |
| Button with no name        | Serious  | An icon-only button announced as just "button"                  |
| Heading level skipped      | Moderate | A jump from h2 to h4, which reads as a missing section          |
| Page language not declared | Moderate | A page read out in the wrong accent, often unintelligibly       |
| Page has no title          | Moderate | The first thing announced, and how twenty tabs are told apart   |
| No main landmark           | Minor    | No way to skip the navigation on every page                     |
| Duplicate id               | Minor    | A label silently attached to the wrong element                  |

Findings are ordered by severity, and then by how many times each rule is
broken, because the fix that clears forty rows is the best first move.

## What it does not claim

Automatic checks catch roughly a third of real accessibility barriers. Nothing
here can tell you whether alt text is any good, whether the tab order makes
sense, or whether the page works with a screen reader in practice. So a clean
result says "no automatic checks failed", not "this page is accessible", and it
says it that way on purpose.

## Install

Not on the Chrome Web Store yet. To run it now:

```bash
git clone https://github.com/royalpinto007/Glasswing.git
cd Glasswing
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose Load unpacked and
select the repository root.

## Use

Click the toolbar icon to open the panel, then **Check this page**. Or press
**Alt+Shift+A** anywhere.

Every finding has a **Show** button that scrolls to the element and outlines it
in the page, so you never have to work out which of forty images the row means.

## Privacy

Glasswing makes no network requests at all. There is no account, no sync, no
analytics and no telemetry. Results are held in local extension storage so the
panel still shows the last run when you reopen it, and nothing else is kept.

It also holds no standing access to any page: there are no content scripts and
no `host_permissions` in the manifest. The first time you run a check it asks
for page access, and the audit is injected into that one tab at that moment.

CI enforces both of those. A build with a network call or a standing host
permission fails.

## How it works

```
sidepanel.ts ──message──▶ background.ts ──inject──▶ audit-entry.ts
     ▲                          │                         │
     └────── result ────────────┘                    src/audit.ts
                                                    src/contrast.ts
```

The audit is bundled on its own and injected into the page, where it walks the
DOM and reads computed styles. It parks the result on `window`, a second tiny
injection reads it and clears it, and the page is left exactly as it was found.

Everything that can be pure is pure and lives in `src/`:

- **`contrast.ts`**: colour parsing, WCAG relative luminance and contrast
  ratios. This is the part of a checker most likely to be quietly wrong and the
  part nobody notices is wrong, because an incorrect ratio still looks like a
  number. It touches no DOM and is tested against the values in the spec.
- **`audit.ts`**: the rules, taking a `Document` rather than reading the
  global one, so the same code runs in the page and in the tests.
- **`rules.ts`**: what each rule is, why it matters, and the ordering.

Contrast is computed from what is rendered rather than what is declared:
translucent text is flattened onto whatever is actually behind it, and the
background is walked up the ancestor chain, because text sits on a transparent
element inside a coloured one more often than not. Large text is judged at 3:1
rather than 4.5:1, where large means 24px, or 18.66px when bold.

## Development

```bash
npm run typecheck
npm test            # rules and maths, against jsdom
npm run build
npm run test:e2e    # the built extension in real Chrome; needs Playwright
```

The end-to-end run loads the extension into Chrome and audits
`tests/fixture/broken.html`, a page with a known set of problems. It is the
only place a contrast number means anything, because jsdom does not do the
cascade.

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). The one rule
worth repeating here is that a false positive is worse than a missed finding,
so every new check needs a test that a correct page does not trip it.

## Licence

MIT. See [LICENSE](LICENSE).
