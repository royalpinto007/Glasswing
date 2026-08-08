import { highlightInPage } from './src/highlight.js';
import type { AuditResult } from './src/types.js';

/**
 * The service worker runs the audit and owns the last result.
 *
 * The audit is injected on demand rather than declared as a content script, so
 * the extension holds no standing access to any page: it runs on one tab, at
 * the moment the user asks for a check.
 *
 * MV3 evicts this worker aggressively, so listeners are registered at the top
 * level on every start.
 */

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'audit-page') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const id = tabs[0]?.id;
    if (id !== undefined) void runAudit(id);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'AUDIT_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs[0]?.id;
      if (id === undefined) {
        sendResponse({ ok: false, error: 'No active tab.' });
        return;
      }
      runAudit(id).then(sendResponse, (e: unknown) =>
        sendResponse({ ok: false, error: describe(e) })
      );
    });
    return true;
  }

  if (message?.type === 'HIGHLIGHT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs[0]?.id;
      if (id === undefined) {
        sendResponse({ ok: false });
        return;
      }
      chrome.scripting
        .executeScript({ target: { tabId: id }, func: highlightInPage, args: [message.selector] })
        .then(
          (r) => sendResponse({ ok: r[0]?.result === true }),
          () => sendResponse({ ok: false })
        );
    });
    return true;
  }

  return undefined;
});

export interface AuditResponse {
  ok: boolean;
  result?: AuditResult;
  error?: string;
}

async function runAudit(tabId: number): Promise<AuditResponse> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['dist/audit.js'] });
    // Second hop reads what the bundle parked on window and clears it, so the
    // page is left exactly as it was found.
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const result = window.__glasswingResult;
        delete window.__glasswingResult;
        return result;
      },
    });
    const result = injection?.result as AuditResult | undefined;
    if (!result) return { ok: false, error: 'The page could not be checked.' };

    // Kept so reopening the panel shows the last run rather than an empty
    // screen, which reads as though the check never happened.
    await chrome.storage.local.set({ 'glasswing.last': result });
    await notifyPanel();
    return { ok: true, result };
  } catch (error) {
    // Chrome blocks injection into its own pages and the web store.
    return { ok: false, error: `This page cannot be checked (${describe(error)}).` };
  }
}

async function notifyPanel(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'AUDIT_DONE' });
  } catch {
    // Nothing listening when the panel is closed. That is the normal case.
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
