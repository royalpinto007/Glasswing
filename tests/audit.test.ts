import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { accessibleName, audit, hasLabel, selectorFor } from '../src/audit.js';
import type { RuleId } from '../src/types.js';

/**
 * The structural rules are exercised here against a real DOM implementation.
 *
 * Contrast is deliberately not tested here: jsdom does not do the cascade, so
 * any ratio it produced would be fiction. The maths is covered in
 * contrast.test.ts and the whole thing is checked against a fixture page in
 * real Chrome by the end-to-end run.
 */
function run(body: string, head = '<title>T</title>', lang = ' lang="en"') {
  const dom = new JSDOM(
    `<!doctype html><html${lang}><head>${head}</head><body>${body}</body></html>`
  );
  const result = audit(dom.window.document, 'https://example.com/page');
  return {
    result,
    rules: result.findings.map((f) => f.rule),
    has: (rule: RuleId) => result.findings.some((f) => f.rule === rule),
  };
}

test('a clean page produces nothing', () => {
  const { result } = run('<main><h1>Title</h1><p>Words.</p><img src="a.png" alt="A cat"></main>');
  assert.deepEqual(result.findings, []);
  assert.equal(result.title, 'T');
  assert.equal(result.url, 'https://example.com/page');
});

test('document-level omissions are each caught once', () => {
  const { rules } = run('<p>Words.</p>', '', '');
  assert.deepEqual(rules.sort(), ['landmark-main', 'page-lang', 'page-title']);
});

test('role="main" counts as a main landmark', () => {
  assert.equal(run('<div role="main"><h1>T</h1></div>').has('landmark-main'), false);
});

test('a missing alt is a finding but alt="" is not', () => {
  assert.equal(run('<main><img src="a.png"></main>').has('image-alt'), true);
  // An empty alt is a deliberate "this is decorative", which is correct.
  assert.equal(run('<main><img src="a.png" alt=""></main>').has('image-alt'), false);
});

test('hidden elements are not reported', () => {
  assert.equal(run('<main><img src="a.png" hidden></main>').has('image-alt'), false);
  assert.equal(run('<main><img src="a.png" aria-hidden="true"></main>').has('image-alt'), false);
  assert.equal(run('<main><img src="a.png" style="display:none"></main>').has('image-alt'), false);
});

test('an icon-only button is nameless, an aria-label fixes it', () => {
  assert.equal(run('<main><button><svg></svg></button></main>').has('button-name'), true);
  assert.equal(
    run('<main><button aria-label="Close"><svg></svg></button></main>').has('button-name'),
    false
  );
});

test('an image link is named by its image', () => {
  assert.equal(
    run('<main><a href="/"><img src="l.png" alt="Home"></a></main>').has('link-name'),
    false
  );
  assert.equal(run('<main><a href="/"><img src="l.png" alt=""></a></main>').has('link-name'), true);
});

test('a placeholder is not a label, and the message says so', () => {
  const { result } = run('<main><input placeholder="Email"></main>');
  const finding = result.findings.find((f) => f.rule === 'form-label');
  assert.ok(finding);
  assert.match(finding.message, /placeholder/i);
});

test('the ways a field can be labelled all count', () => {
  assert.equal(run('<main><label>Email <input></label></main>').has('form-label'), false);
  assert.equal(
    run('<main><label for="e">Email</label><input id="e"></main>').has('form-label'),
    false
  );
  assert.equal(run('<main><input aria-label="Email"></main>').has('form-label'), false);
  assert.equal(
    run('<main><span id="l">Email</span><input aria-labelledby="l"></main>').has('form-label'),
    false
  );
});

test('submit and hidden inputs take no label', () => {
  assert.equal(
    run('<main><input type="submit" value="Go"><input type="hidden" name="t"></main>').has(
      'form-label'
    ),
    false
  );
});

test('a skipped heading level is reported at the heading that skipped', () => {
  const { result } = run('<main><h1>A</h1><h4>B</h4></main>');
  const finding = result.findings.find((f) => f.rule === 'heading-order');
  assert.ok(finding);
  assert.match(finding.message, /h1 to h4/);
  assert.match(finding.snippet, /B/);
});

test('duplicate ids are reported once with a count', () => {
  const { result } = run('<main><p id="x">a</p><p id="x">b</p><p id="x">c</p></main>');
  const hits = result.findings.filter((f) => f.rule === 'duplicate-id');
  assert.equal(hits.length, 1);
  assert.match(hits[0]!.message, /3 times/);
});

test('accessible name prefers aria-label over text', () => {
  const dom = new JSDOM('<button aria-label="Close dialog">X</button>');
  const el = dom.window.document.querySelector('button')!;
  assert.equal(accessibleName(el), 'Close dialog');
});

test('title alone is a weak but real label', () => {
  const dom = new JSDOM('<input title="Search">');
  const doc = dom.window.document;
  assert.equal(hasLabel(doc, doc.querySelector('input')!), true);
});

test('selectors prefer an id and otherwise disambiguate siblings', () => {
  const dom = new JSDOM('<main><ul><li>a</li><li id="b">b</li><li>c</li></ul></main>');
  const doc = dom.window.document;
  assert.equal(selectorFor(doc.querySelector('#b')!), '#b');
  const third = doc.querySelectorAll('li')[2]!;
  assert.match(selectorFor(third), /li:nth-of-type\(3\)$/);
});

test('the checked count reflects work actually done', () => {
  const { result } = run('<main><h1>T</h1><img src="a.png" alt=""><a href="/">Home</a></main>');
  assert.ok(result.checked >= 3, `expected several elements checked, got ${result.checked}`);
});
