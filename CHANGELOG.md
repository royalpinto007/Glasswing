# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-08

First release.

### Added

- Ten checks: image alt text, text contrast, form labels, link and button
  names, heading order, page language, page title, main landmark and duplicate
  ids.
- WCAG 2 contrast, computed from the rendered colour rather than the declared
  one, with translucent text flattened onto what is behind it and large text
  judged at 3:1 rather than 4.5:1.
- Findings grouped by rule, ordered by severity and then by how many times each
  rule is broken, so the fix that clears the most rows is first.
- A plain-English reason for every rule, written for someone who has not read
  WCAG.
- Show, which draws a box around the element a finding is about and scrolls to
  it.
- Alt+Shift+A to check the current page.
- The last result is kept, so reopening the panel shows it rather than an empty
  screen.

### Notes

- No network requests, no account, no analytics. Nothing leaves the machine.
- No content scripts and no standing host permissions: page access is requested
  the first time a check is run.

[1.0.0]: https://github.com/royalpinto007/Glasswing/releases/tag/v1.0.0
