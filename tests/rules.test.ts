import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RULES,
  groupFindings,
  headingSkips,
  sortFindings,
  summarise,
  verdict,
} from '../src/rules.js';
import type { Finding, RuleId, Severity } from '../src/types.js';

function make(rule: RuleId, severity: Severity, selector = 'div'): Finding {
  return { rule, severity, message: rule, selector, snippet: '' };
}

test('every rule has a plain-English reason, not a WCAG number', () => {
  for (const info of Object.values(RULES)) {
    assert.ok(info.why.length > 40, `${info.id} has no real explanation`);
    assert.doesNotMatch(
      info.why,
      /\b\d\.\d\.\d\b/,
      `${info.id} cites a criterion instead of a reason`
    );
  }
});

test('serious findings sort above everything else', () => {
  const sorted = sortFindings([
    make('duplicate-id', 'minor'),
    make('page-lang', 'moderate'),
    make('image-alt', 'serious'),
  ]);
  assert.deepEqual(
    sorted.map((f) => f.severity),
    ['serious', 'moderate', 'minor']
  );
});

test('within a severity, the rule broken most often comes first', () => {
  // One fix that clears three rows beats one that clears one.
  const sorted = sortFindings([
    make('link-name', 'serious', 'a'),
    make('image-alt', 'serious', 'img:nth-of-type(1)'),
    make('image-alt', 'serious', 'img:nth-of-type(2)'),
    make('image-alt', 'serious', 'img:nth-of-type(3)'),
  ]);
  assert.equal(sorted[0]?.rule, 'image-alt');
  assert.equal(sorted[3]?.rule, 'link-name');
});

test('grouping keeps that order and loses nothing', () => {
  const findings = [
    make('duplicate-id', 'minor'),
    make('image-alt', 'serious', 'img:nth-of-type(1)'),
    make('image-alt', 'serious', 'img:nth-of-type(2)'),
  ];
  const groups = groupFindings(findings);
  assert.deepEqual(
    groups.map((g) => g.rule),
    ['image-alt', 'duplicate-id']
  );
  assert.equal(groups[0]?.findings.length, 2);
  assert.equal(
    groups.reduce((n, g) => n + g.findings.length, 0),
    findings.length
  );
});

test('the verdict never claims the page is accessible', () => {
  const clean = verdict(summarise([]));
  assert.match(clean, /no automatic checks failed/i);
  assert.doesNotMatch(clean, /\baccessible\b/i);
});

test('the verdict leads with the serious count when there is one', () => {
  assert.match(verdict(summarise([make('image-alt', 'serious')])), /^1 serious problem/);
  assert.match(verdict(summarise([make('page-lang', 'moderate')])), /none serious/);
});

test('summaries count by severity', () => {
  const s = summarise([
    make('image-alt', 'serious'),
    make('contrast', 'serious'),
    make('page-lang', 'moderate'),
  ]);
  assert.deepEqual(s, { total: 3, serious: 2, moderate: 1, minor: 0 });
});

test('heading order flags only downward jumps of more than one', () => {
  assert.deepEqual(headingSkips([1, 2, 3, 2, 3]), []);
  // Going back up any number of levels is fine.
  assert.deepEqual(headingSkips([1, 2, 3, 4, 1]), []);
  assert.deepEqual(headingSkips([1, 2, 4]), [{ at: 2, from: 2, to: 4 }]);
});

test('starting below h1 is itself a skip', () => {
  assert.deepEqual(headingSkips([3, 4]), [{ at: 0, from: 0, to: 3 }]);
  assert.deepEqual(headingSkips([1]), []);
  assert.deepEqual(headingSkips([]), []);
});
