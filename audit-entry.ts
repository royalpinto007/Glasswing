import { audit } from './src/audit.js';
import type { AuditResult } from './src/types.js';

declare global {
  interface Window {
    __glasswingResult?: AuditResult;
  }
}

/**
 * The script injected into the page being checked.
 *
 * The result is parked on window and read by a second, tiny injection.
 * esbuild wraps an IIFE bundle in its own function, so the module's final
 * expression is not the script's completion value and executeScript would
 * resolve to undefined.
 */
window.__glasswingResult = audit(document, location.href);

export {};
