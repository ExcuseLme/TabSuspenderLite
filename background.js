'use strict';

/**
 * The Suspender Lite — background service worker.
 *
 * Responsibilities:
 *   - turn a normal web tab into a placeholder tab (suspend);
 *   - expose the two keyboard commands.
 *
 * Restoring is handled entirely by the placeholder page itself (a click), so the
 * worker does not need to track tab state, and nothing has to survive a worker
 * restart: the suspended tab's URL already carries everything.
 */

const SUSPENDED_PAGE = 'suspended.html';
const SUSPENDED_URL_PREFIX = chrome.runtime.getURL(SUSPENDED_PAGE);

/** Returns the http(s) URL of a tab, or '' when the tab cannot be suspended. */
function suspendableUrlOf(tab) {
  if (!tab || tab.id == null) return '';
  const candidate = /^https?:\/\//i.test(tab.url || '') ? tab.url : (tab.pendingUrl || '');
  if (!/^https?:\/\//i.test(candidate)) return '';
  if (candidate.startsWith(SUSPENDED_URL_PREFIX)) return '';
  return candidate;
}

/** The placeholder URL keeps the tab self-describing: no storage required. */
function suspendedUrlFor(tab, pageUrl) {
  const params = new URLSearchParams();
  params.set('url', pageUrl);
  params.set('title', tab.title || pageUrl);
  return SUSPENDED_URL_PREFIX + '?' + params.toString();
}

/** Suspend one tab. Returns true when the tab was suspended. */
async function suspendTab(tab) {
  const pageUrl = suspendableUrlOf(tab);
  if (!pageUrl) return false;
  try {
    await chrome.tabs.update(tab.id, { url: suspendedUrlFor(tab, pageUrl) });
    return true;
  } catch (error) {
    console.warn('[TheSuspenderLite] could not suspend tab', tab.id, error);
    return false;
  }
}

/** Suspend the active tab of the current window (if it is a web page). */
async function suspendCurrentTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return suspendTab(active);
}

/** Suspend every other web tab in the current window, skipping pinned tabs. */
async function suspendOtherTabsInCurrentWindow() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const targets = tabs.filter(
    (tab) => tab.id !== (active && active.id) && !tab.pinned && suspendableUrlOf(tab)
  );
  const results = await Promise.allSettled(targets.map((tab) => suspendTab(tab)));
  return results.filter((result) => result.status === 'fulfilled' && result.value).length;
}

chrome.commands.onCommand.addListener((command) => {
  let task = Promise.resolve();
  if (command === 'suspend-current-tab') task = suspendCurrentTab();
  else if (command === 'suspend-other-tabs') task = suspendOtherTabsInCurrentWindow();
  task.catch((error) => console.warn('[TheSuspenderLite]', command, error));
});

// Exposed for manual testing from the extension's own worker context (and for a
// possible future popup / context menu without duplicating the logic).
globalThis.suspendCurrentTab = suspendCurrentTab;
globalThis.suspendOtherTabsInCurrentWindow = suspendOtherTabsInCurrentWindow;
