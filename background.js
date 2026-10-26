'use strict';

/**
 * Tab Suspender Lite — background service worker.
 *
 * Responsibilities:
 *   - turn a tab into a placeholder tab (suspend);
 *   - expose the two keyboard commands;
 *   - restore a placeholder tab when its page asks for it.
 *
 * The placeholder URL keeps the whole original URL, so nothing needs storage and
 * nothing has to survive a worker restart: a suspended tab is self-describing.
 */

const SUSPENDED_PAGE = 'suspended.html';
const SUSPENDED_URL_PREFIX = chrome.runtime.getURL(SUSPENDED_PAGE);

// Browser-internal pages are skipped: Chrome may refuse to navigate back to them
// and their state cannot be preserved. `about:blank` is the one harmless exception.
const BROWSER_SCHEME = /^(?:chrome|chrome-untrusted|chrome-search|devtools|chrome-extension):/i;

function isBrowserPage(url) {
  if (BROWSER_SCHEME.test(url)) return true;
  return /^about:/i.test(url) && !/^about:blank(?:[?#]|$)/i.test(url);
}

/** Returns the URL a tab can be suspended with, or '' when it should be skipped. */
function suspendableUrlOf(tab) {
  if (!tab || tab.id == null) return '';
  const url = tab.url || tab.pendingUrl || '';
  if (!url || url.startsWith(SUSPENDED_URL_PREFIX) || isBrowserPage(url)) return '';
  return url;
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
    // Chrome rejects top-level navigations whose URL exceeds its ~2 MiB limit.
    // The tab keeps its original page, which is exactly the fallback we want.
    console.warn('[Tab Suspender Lite] 无法挂起标签页', tab.id, error);
    return false;
  }
}

/** Suspend the active tab of the current window. */
async function suspendCurrentTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return suspendTab(active);
}

/** Suspend every other tab in the current window, skipping pinned tabs. */
async function suspendOtherTabsInCurrentWindow() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const targets = tabs.filter(
    (tab) => tab.id !== (active && active.id) && !tab.pinned && suspendableUrlOf(tab)
  );
  const results = await Promise.allSettled(targets.map((tab) => suspendTab(tab)));
  return results.filter((result) => result.status === 'fulfilled' && result.value).length;
}

/** Original URL encoded in a placeholder tab's address. */
function targetUrlOf(suspendedUrl) {
  try {
    return new URL(suspendedUrl).searchParams.get('url') || '';
  } catch {
    return '';
  }
}

/**
 * Chrome refuses to navigate an existing tab to a `data:` URL, and to another
 * extension's page, so those are restored by opening a new tab instead.
 */
function needsNewTabFor(url) {
  return /^data:/i.test(url) || /^chrome-extension:/i.test(url);
}

/** Restore the placeholder tab that sent the request. */
async function restoreSuspendedTab(placeholderTab) {
  const targetUrl = targetUrlOf(placeholderTab.url || '');
  if (!targetUrl) return { ok: false, error: 'missing url' };

  if (needsNewTabFor(targetUrl)) {
    try {
      await chrome.tabs.create({
        url: targetUrl,
        windowId: placeholderTab.windowId,
        index: placeholderTab.index + 1,
        active: true,
        openerTabId: placeholderTab.id
      });
      return { ok: true, openedInNewTab: true };
    } catch (error) {
      console.warn('[Tab Suspender Lite] 无法在新标签页打开', error);
      return { ok: false, error: String(error) };
    }
  }

  try {
    await chrome.tabs.update(placeholderTab.id, { url: targetUrl });
    return { ok: true };
  } catch (error) {
    console.warn('[Tab Suspender Lite] 无法恢复标签页', error);
    return { ok: false, error: String(error) };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'restore-suspended-tab' || !sender.tab) return false;
  restoreSuspendedTab(sender.tab)
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false }));
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  let task = Promise.resolve();
  if (command === 'suspend-current-tab') task = suspendCurrentTab();
  else if (command === 'suspend-other-tabs') task = suspendOtherTabsInCurrentWindow();
  task.catch((error) => console.warn('[Tab Suspender Lite]', command, error));
});

// Exposed for manual testing from the extension's own worker context (and for a
// possible future popup / context menu without duplicating the logic).
globalThis.suspendCurrentTab = suspendCurrentTab;
globalThis.suspendOtherTabsInCurrentWindow = suspendOtherTabsInCurrentWindow;
globalThis.restoreSuspendedTab = restoreSuspendedTab;
