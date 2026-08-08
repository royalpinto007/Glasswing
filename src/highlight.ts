/**
 * Draw a box over an element, in the page.
 *
 * Runs as an injected function, so it must be self-contained. Kept here rather
 * than inline in the worker only so it can be read and reviewed on its own.
 */
export function highlightInPage(selector: string): boolean {
  const ID = '__glasswing-marker';
  document.getElementById(ID)?.remove();

  let el: Element | null = null;
  try {
    el = document.querySelector(selector);
  } catch {
    return false;
  }
  if (!el) return false;

  el.scrollIntoView({ block: 'center', behavior: 'smooth' });

  const box = el.getBoundingClientRect();
  const marker = document.createElement('div');
  marker.id = ID;
  // A fixed overlay rather than an outline on the element itself: styling the
  // element can shift layout, which moves the thing being pointed at.
  marker.style.cssText = [
    'position:fixed',
    `top:${box.top - 3}px`,
    `left:${box.left - 3}px`,
    `width:${box.width + 6}px`,
    `height:${box.height + 6}px`,
    'border:2px solid #d94f2b',
    'border-radius:3px',
    'box-shadow:0 0 0 9999px rgba(0,0,0,.18)',
    'pointer-events:none',
    'z-index:2147483647',
    'transition:opacity .2s',
  ].join(';');
  document.body.appendChild(marker);

  window.setTimeout(() => {
    marker.style.opacity = '0';
    window.setTimeout(() => marker.remove(), 250);
  }, 2200);

  return true;
}
