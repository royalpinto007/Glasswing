import type { Finding, RuleId, RuleInfo, Severity } from './types.js';

/**
 * What each rule is, and why anyone should care.
 *
 * The "why" is written for someone who has not read WCAG and does not want
 * to. A checker that says "violates 1.4.3" has told the user nothing they can
 * act on; the point of a finding is that it gets fixed.
 */
export const RULES: Record<RuleId, RuleInfo> = {
  'image-alt': {
    id: 'image-alt',
    title: 'Image with no alt text',
    why: 'A screen reader reads the file name instead, so the image may as well not be there. Decorative images should have alt="" to be skipped deliberately.',
    severity: 'serious',
  },
  contrast: {
    id: 'contrast',
    title: 'Text contrast below AA',
    why: 'Low-contrast text is unreadable in sunlight, on a cheap screen, or for the very large number of people with reduced vision.',
    severity: 'serious',
  },
  'form-label': {
    id: 'form-label',
    title: 'Form field with no label',
    why: 'A screen reader announces the field with no idea what it is for. Placeholder text does not count: it disappears as soon as someone types.',
    severity: 'serious',
  },
  'link-name': {
    id: 'link-name',
    title: 'Link with no readable text',
    why: 'Screen reader users often navigate by listing links. "Click here", or an icon with no label, is a dead end in that list.',
    severity: 'serious',
  },
  'button-name': {
    id: 'button-name',
    title: 'Button with no accessible name',
    why: 'An icon-only button is announced as just "button". Nothing tells the user what pressing it will do.',
    severity: 'serious',
  },
  'heading-order': {
    id: 'heading-order',
    title: 'Heading level skipped',
    why: 'Headings are how screen reader users skim a page. Jumping from h2 to h4 reads as a missing section.',
    severity: 'moderate',
  },
  'page-lang': {
    id: 'page-lang',
    title: 'Page language not declared',
    why: 'Without a lang attribute a screen reader guesses the language, and often reads the page in the wrong accent, which can make it unintelligible.',
    severity: 'moderate',
  },
  'page-title': {
    id: 'page-title',
    title: 'Page has no title',
    why: 'The title is the first thing announced, and how anyone with twenty tabs open tells them apart.',
    severity: 'moderate',
  },
  'landmark-main': {
    id: 'landmark-main',
    title: 'No main landmark',
    why: 'A main element lets a screen reader user skip the navigation. Without one they hear the header on every page.',
    severity: 'minor',
  },
  'duplicate-id': {
    id: 'duplicate-id',
    title: 'Duplicate id',
    why: 'Labels and aria references point at the first match, so a duplicate id silently attaches a label to the wrong element.',
    severity: 'minor',
  },
};

const ORDER: Record<Severity, number> = { serious: 0, moderate: 1, minor: 2 };

/**
 * Order findings so the list is worth reading top to bottom.
 *
 * Severity first, then how many of each rule, so a rule broken forty times
 * outranks one broken once at the same severity. That reflects how the work
 * actually gets done: one fix that clears forty rows is the best first move.
 */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  const counts = new Map<RuleId, number>();
  for (const f of findings) counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1);

  return [...findings].sort((a, b) => {
    if (a.severity !== b.severity) return ORDER[a.severity] - ORDER[b.severity];
    const byCount = (counts.get(b.rule) ?? 0) - (counts.get(a.rule) ?? 0);
    if (byCount !== 0) return byCount;
    if (a.rule !== b.rule) return a.rule.localeCompare(b.rule);
    return a.selector.localeCompare(b.selector);
  });
}

export interface Group {
  rule: RuleId;
  info: RuleInfo;
  findings: Finding[];
}

/** Group by rule for display, keeping the sorted order of the first member. */
export function groupFindings(findings: readonly Finding[]): Group[] {
  const sorted = sortFindings(findings);
  const groups = new Map<RuleId, Finding[]>();
  for (const f of sorted) {
    const list = groups.get(f.rule);
    if (list) list.push(f);
    else groups.set(f.rule, [f]);
  }
  return [...groups.entries()].map(([rule, list]) => ({
    rule,
    info: RULES[rule],
    findings: list,
  }));
}

export interface Summary {
  total: number;
  serious: number;
  moderate: number;
  minor: number;
}

export function summarise(findings: readonly Finding[]): Summary {
  const s: Summary = { total: findings.length, serious: 0, moderate: 0, minor: 0 };
  for (const f of findings) s[f.severity]++;
  return s;
}

/**
 * A one-line verdict for the top of the panel.
 *
 * "No problems found" is deliberately not "this page is accessible". An
 * automated pass catches perhaps a third of real barriers, and claiming
 * otherwise gives people permission to stop looking.
 */
export function verdict(summary: Summary): string {
  if (summary.total === 0) return 'No automatic checks failed on this page.';
  if (summary.serious > 0) {
    return `${summary.serious} serious ${summary.serious === 1 ? 'problem' : 'problems'} to fix first.`;
  }
  return `${summary.total} ${summary.total === 1 ? 'issue' : 'issues'}, none serious.`;
}

/**
 * Heading order, checked over the levels alone.
 *
 * Pure, so the awkward cases are testable: a page starting at h3, a jump from
 * h2 to h4, and the fact that going back up any number of levels is fine.
 * Only going *down* by more than one is a skip.
 */
export function headingSkips(
  levels: readonly number[]
): { at: number; from: number; to: number }[] {
  const skips: { at: number; from: number; to: number }[] = [];
  let previous = 0;

  for (const [index, level] of levels.entries()) {
    if (previous === 0) {
      // The first heading should be an h1; starting at h3 is itself a skip.
      if (level > 1) skips.push({ at: index, from: 0, to: level });
    } else if (level > previous + 1) {
      skips.push({ at: index, from: previous, to: level });
    }
    previous = level;
  }
  return skips;
}
