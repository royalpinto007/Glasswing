import {
  contrastRatio,
  flatten,
  formatRatio,
  isLargeText,
  levelFor,
  parseColor,
  requiredRatio,
} from './contrast.js';
import { headingSkips } from './rules.js';
import type { AuditResult, Finding } from './types.js';

/**
 * The audit, run against a Document.
 *
 * Takes a Document rather than reading `document` so it can be exercised
 * without a browser, and so the same code runs in the page and in tests.
 */
export function audit(doc: Document, url: string): AuditResult {
  const findings: Finding[] = [];
  let checked = 0;

  const push = (f: Finding) => findings.push(f);

  // Document-level checks first: cheap, and they explain a lot on their own.
  if (!doc.documentElement.getAttribute('lang')?.trim()) {
    push(
      finding(
        'page-lang',
        'moderate',
        'The <html> element has no lang attribute.',
        'html',
        '<html>'
      )
    );
  }
  if (!doc.title.trim()) {
    push(finding('page-title', 'moderate', 'The page has no title.', 'head > title', '<title>'));
  }
  if (!doc.querySelector('main, [role="main"]')) {
    push(
      finding(
        'landmark-main',
        'minor',
        'The page has no <main> element or role="main".',
        'body',
        '<body>'
      )
    );
  }

  // Images.
  for (const img of doc.querySelectorAll('img')) {
    checked++;
    if (isHidden(img)) continue;
    const alt = img.getAttribute('alt');
    // alt="" is a deliberate "this is decorative" and is correct, so only a
    // missing attribute is a finding.
    if (alt === null) {
      push(
        finding(
          'image-alt',
          'serious',
          'Image has no alt attribute.',
          selectorFor(img),
          `<img src="${short(img.getAttribute('src') ?? '')}">`
        )
      );
    }
  }

  // Links and buttons.
  for (const el of doc.querySelectorAll('a[href], button, [role="button"], [role="link"]')) {
    checked++;
    if (isHidden(el)) continue;
    if (accessibleName(el)) continue;

    const isLink = el.tagName === 'A' || el.getAttribute('role') === 'link';
    push(
      finding(
        isLink ? 'link-name' : 'button-name',
        'serious',
        isLink ? 'Link has no readable text.' : 'Button has no accessible name.',
        selectorFor(el),
        outline(el)
      )
    );
  }

  // Form fields.
  for (const el of doc.querySelectorAll('input, select, textarea')) {
    checked++;
    if (isHidden(el)) continue;
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    // These carry their own meaning and take no label.
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue;
    if (hasLabel(doc, el)) continue;

    push(
      finding(
        'form-label',
        'serious',
        el.getAttribute('placeholder')
          ? 'Field is labelled only by placeholder text, which disappears when typing.'
          : 'Form field has no label.',
        selectorFor(el),
        outline(el)
      )
    );
  }

  // Headings.
  const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => !isHidden(h));
  checked += headings.length;
  const levels = headings.map((h) => Number(h.tagName[1]));
  for (const skip of headingSkips(levels)) {
    const el = headings[skip.at];
    if (!el) continue;
    push(
      finding(
        'heading-order',
        'moderate',
        skip.from === 0
          ? `Page starts at h${skip.to} rather than h1.`
          : `Jumps from h${skip.from} to h${skip.to}.`,
        selectorFor(el),
        `<${el.tagName.toLowerCase()}>${short(el.textContent ?? '')}`
      )
    );
  }

  // Duplicate ids.
  const seenIds = new Map<string, number>();
  for (const el of doc.querySelectorAll('[id]')) {
    const id = el.getAttribute('id');
    if (!id) continue;
    seenIds.set(id, (seenIds.get(id) ?? 0) + 1);
  }
  for (const [id, count] of seenIds) {
    if (count > 1) {
      push(
        finding(
          'duplicate-id',
          'minor',
          `id="${id}" is used ${count} times.`,
          `#${id}`,
          `id="${id}"`
        )
      );
    }
  }

  // Contrast, last because it is the expensive one.
  for (const el of doc.querySelectorAll('p,span,a,li,h1,h2,h3,h4,h5,h6,button,label,td,th,dd,dt')) {
    if (!ownText(el)) continue;
    checked++;
    const problem = contrastProblem(el);
    if (problem) push(problem);
  }

  return { url, title: doc.title, ranAt: Date.now(), checked, findings };
}

function finding(
  rule: Finding['rule'],
  severity: Finding['severity'],
  message: string,
  selector: string,
  snippet: string
): Finding {
  return { rule, severity, message, selector, snippet };
}

/**
 * Contrast for one element.
 *
 * The background has to be walked up the ancestor chain, because the common
 * case is text on a transparent element inside a coloured one. Giving up at
 * the first transparent parent would mean checking text against nothing.
 */
function contrastProblem(el: Element): Finding | null {
  const view = el.ownerDocument.defaultView;
  if (!view) return null;

  const style = view.getComputedStyle(el);
  const fg = parseColor(style.color);
  if (!fg) return null;
  // Fully transparent text is invisible, not low-contrast. Reporting it as a
  // contrast failure would send someone to adjust a colour that is not the
  // problem.
  if (fg.a === 0) return null;

  const bg = backgroundBehind(el, view);
  if (!bg) return null;

  const solid = flatten(fg, bg);
  const ratio = contrastRatio(solid, bg);
  const size = parseFloat(style.fontSize) || 16;
  const weight = Number(style.fontWeight) || 400;
  const large = isLargeText(size, weight);

  if (levelFor(ratio, large) !== 'fail') return null;

  return finding(
    'contrast',
    'serious',
    `Contrast is ${formatRatio(ratio)}, needs ${requiredRatio(large)}:1${large ? ' for large text' : ''}.`,
    selectorFor(el),
    short(ownText(el))
  );
}

/** The first opaque background painted behind an element. */
function backgroundBehind(el: Element, view: Window): ReturnType<typeof parseColor> {
  let node: Element | null = el;
  while (node) {
    const color = parseColor(view.getComputedStyle(node).backgroundColor);
    if (color && color.a >= 1) return color;
    node = node.parentElement;
  }
  // Nothing opaque all the way up means the canvas, which browsers paint white.
  return { r: 255, g: 255, b: 255, a: 1 };
}

/** Text belonging to this element rather than to its children. */
function ownText(el: Element): string {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 3) text += node.textContent ?? '';
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Whether an element is hidden, and so not worth reporting. */
function isHidden(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.hasAttribute('hidden')) return true;
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden';
}

/**
 * Roughly what a screen reader would announce.
 *
 * Not a full accessible-name computation, which is a specification in its own
 * right. This covers the cases that actually produce nameless controls in the
 * wild: an icon-only button, an image link whose image has alt text, and
 * aria-label or aria-labelledby.
 */
export function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria;

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const target = el.ownerDocument.getElementById(labelledBy.split(/\s+/)[0] ?? '');
    const text = target?.textContent?.trim();
    if (text) return text;
  }

  const text = el.textContent?.replace(/\s+/g, ' ').trim();
  if (text) return text;

  // An image link is named by its image's alt text.
  const img = el.querySelector('img[alt]');
  const alt = img?.getAttribute('alt')?.trim();
  if (alt) return alt;

  const title = el.getAttribute('title')?.trim();
  return title ?? '';
}

/** Whether a form control has something that will be announced as its label. */
export function hasLabel(doc: Document, el: Element): boolean {
  if (el.getAttribute('aria-label')?.trim()) return true;
  if (el.getAttribute('aria-labelledby')?.trim()) return true;
  if (el.closest('label')) return true;

  const id = el.getAttribute('id');
  if (id && doc.querySelector(`label[for="${cssEscape(id)}"]`)) return true;

  // title is a weak label but genuinely is announced, so it is not a failure.
  if (el.getAttribute('title')?.trim()) return true;
  return false;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/** A short path, enough to find the element in devtools. */
export function selectorFor(el: Element): string {
  const id = el.getAttribute('id');
  if (id) return `#${id}`;

  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;

  while (node && node.tagName !== 'HTML' && depth < 4) {
    let part = node.tagName.toLowerCase();
    const cls = (node.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean)[0];
    if (cls) part += `.${cls}`;

    const parent = node.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((c) => c.tagName === node!.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }

    parts.unshift(part);
    node = node.parentElement;
    depth++;
  }
  return parts.join(' > ');
}

function outline(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const cls = el.getAttribute('class');
  return `<${tag}${cls ? ` class="${short(cls, 24)}"` : ''}>`;
}

function short(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}
