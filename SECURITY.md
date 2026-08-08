# Security Policy

## Supported versions

The latest release is supported. Glasswing is a browser extension, so the
version that matters is the one installed from the store.

## Reporting a vulnerability

Please do not open a public issue, discussion or pull request for a security
problem.

Report it privately through GitHub's
[security advisory form](https://github.com/royalpinto007/Glasswing/security/advisories/new),
which is visible only to the maintainers.

Include what you found, how to reproduce it, and what an attacker could do with
it. A rough proof of concept helps.

You can expect an acknowledgement within a week. If the report is valid, we
will agree a disclosure timeline with you before anything is made public.

## Scope

Glasswing reads the page you ask it to check and reports on it locally. The
things most worth reporting:

- **Anything that gets script execution in the extension's context.** Findings
  quote text, attributes and selectors straight out of arbitrary pages, so all
  of it is attacker-controlled. It is rendered with `textContent` and never as
  markup; a way around that is the highest severity issue here.
- **Anything that reads a page the user did not ask to check.** The audit is
  injected on demand into a single tab and should never run otherwise. There
  are no content scripts.
- **Any network request the extension makes.** There should be none at all, so
  one appearing is a finding in itself.
- **Anything a page can do to change what Glasswing reports about it.** The
  audit runs in the page's world, so a page can see it; a page being able to
  make a real problem disappear from the report is a real issue.
- **Anything in the highlight overlay that a page can turn against the user**,
  such as making it clickable or leaving it behind.

Out of scope: rules that miss something, or report something they should not.
Those are bugs, and the bug template is the right place for them.
