import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contrastRatio,
  flatten,
  formatRatio,
  isLargeText,
  levelFor,
  luminance,
  parseColor,
  requiredRatio,
} from '../src/contrast.js';

test('parses the forms a browser returns', () => {
  assert.deepEqual(parseColor('rgb(255, 0, 0)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  // Chrome has started returning the space form for some properties.
  assert.deepEqual(parseColor('rgb(10 20 30 / 0.25)'), { r: 10, g: 20, b: 30, a: 0.25 });
  assert.deepEqual(parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
});

test('parses hex in every length', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('#ff0000'), { r: 255, g: 0, b: 0, a: 1 });
  assert.equal(parseColor('#000000ff')?.a, 1);
  assert.equal(parseColor('#00000000')?.a, 0);
  // The fourth digit of a short hex is alpha, not a colour channel.
  assert.deepEqual(parseColor('#f008'), { r: 255, g: 0, b: 0, a: 136 / 255 });
  assert.equal(parseColor('rebeccapurple'), null);
  assert.equal(parseColor('#12345'), null);
});

test('luminance matches the values WCAG states', () => {
  assert.equal(luminance({ r: 255, g: 255, b: 255, a: 1 }), 1);
  assert.equal(luminance({ r: 0, g: 0, b: 0, a: 1 }), 0);
});

test('the extreme ratio is 21:1 both ways round', () => {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 0, g: 0, b: 0, a: 1 };
  assert.equal(Math.round(contrastRatio(white, black)), 21);
  assert.equal(contrastRatio(white, black), contrastRatio(black, white));
  assert.equal(contrastRatio(white, white), 1);
});

test('a known mid-grey lands where the published tables put it', () => {
  // #767676 on white is the canonical "just passes AA" grey.
  const ratio = contrastRatio({ r: 118, g: 118, b: 118, a: 1 }, { r: 255, g: 255, b: 255, a: 1 });
  assert.ok(ratio >= 4.5 && ratio < 4.6, `expected just over 4.5, got ${ratio}`);
});

test('translucent text is judged as rendered, not as declared', () => {
  const declared = { r: 0, g: 0, b: 0, a: 0.35 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const rendered = flatten(declared, white);
  assert.equal(rendered.a, 1);
  // Black at 35% over white is a light grey, and fails.
  assert.ok(contrastRatio(rendered, white) < 4.5);
  // Opaque input is returned unchanged.
  assert.deepEqual(flatten({ r: 1, g: 2, b: 3, a: 1 }, white), { r: 1, g: 2, b: 3, a: 1 });
});

test('large text is 24px, or 18.66px when bold', () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(23.9, 400), false);
  assert.equal(isLargeText(19, 700), true);
  assert.equal(isLargeText(19, 600), false);
  assert.equal(isLargeText(18, 700), false);
});

test('levels are graded on the size of the text', () => {
  assert.equal(levelFor(4.5, false), 'aa');
  assert.equal(levelFor(4.49, false), 'fail');
  assert.equal(levelFor(7, false), 'aaa');
  // The same ratio that fails for body text passes for large text.
  assert.equal(levelFor(3.5, true), 'aa');
  assert.equal(levelFor(3.5, false), 'fail');
  assert.equal(levelFor(2.9, true), 'fail');
});

test('ratios are reported to one decimal, not four', () => {
  assert.equal(formatRatio(4.4999), '4.5:1');
  assert.equal(formatRatio(21), '21:1');
  assert.equal(requiredRatio(false), 4.5);
  assert.equal(requiredRatio(true), 3);
});
