'use strict';

/**
 * Tab Suspender Lite — placeholder page.
 *
 * Reads the original URL and title from its own query string, shows a minimal
 * card, and restores the page when the user clicks it.
 *
 * Restore rules (decided on this page, nothing is stored or flagged at
 * suspension time):
 *   - `data:` URLs cannot be loaded into an existing tab, so they are opened in
 *     a new tab right after this one; the address line is the only click target.
 *   - plain web pages are replaced in place (so the placeholder does not stay in
 *     history);
 *   - everything else (`file:`, `view-source:`, `about:blank`, `blob:`) is
 *     restored by the service worker, because the renderer may not navigate to it.
 *
 * Deliberately dependency-free, no fetch, no storage, no canvas and no data:
 * URIs: the favicon is a plain `_favicon` URL served from Chrome's local cache.
 */

(() => {
  const TITLE_MAX = 20;
  const URL_MAX = 50;

  const params = new URLSearchParams(location.search);
  const targetUrl = params.get('url') || '';
  const fullTitle = params.get('title') || targetUrl;

  const truncate = (value, max) => {
    const chars = Array.from(value);
    return chars.length > max ? chars.slice(0, max).join('') + '…' : value;
  };

  const needsNewTab = /^data:/i.test(targetUrl) || /^chrome-extension:\/\//i.test(targetUrl);
  const rendererCanNavigate = /^https?:\/\//i.test(targetUrl);

  let restoring = false;

  /** Ask the worker to restore this tab (new tab for data:, update for the rest). */
  const requestRestore = () => {
    if (restoring) return;
    restoring = true;
    chrome.runtime.sendMessage({ type: 'restore-suspended-tab' }, () => {
      if (chrome.runtime.lastError) restoring = false;
    });
  };

  const restore = () => {
    if (!targetUrl) return;
    if (rendererCanNavigate) {
      location.replace(targetUrl);
      return;
    }
    requestRestore();
  };

  // The tab strip and its hover tooltip get the full title; only the card is truncated.
  document.title = fullTitle;

  // Favicon: Chrome's local favicon cache, keyed by the original URL.
  if (targetUrl) {
    const icon = new URL(chrome.runtime.getURL('/_favicon/'));
    icon.searchParams.set('pageUrl', targetUrl);
    icon.searchParams.set('size', '32');
    const iconUrl = icon.toString();

    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = iconUrl;
    document.head.append(link);

    const img = document.getElementById('favicon');
    img.src = iconUrl;
    img.alt = '';
  }

  const card = document.getElementById('card');
  const titleEl = document.getElementById('title');
  const urlEl = document.getElementById('url');
  const hintEl = document.getElementById('hint');

  titleEl.textContent = truncate(fullTitle, TITLE_MAX);
  titleEl.title = fullTitle;

  urlEl.textContent = truncate(targetUrl, URL_MAX);
  urlEl.title = targetUrl;

  if (needsNewTab) {
    hintEl.textContent = /^data:/i.test(targetUrl)
      ? 'data: 类型地址无法原地恢复，将在新标签页中打开'
      : '扩展页面无法原地恢复，将在新标签页中打开';
    card.classList.add('new-tab-restore');
    urlEl.classList.add('clickable');
    urlEl.addEventListener('click', (event) => {
      event.stopPropagation();
      requestRestore();
    });
    // Everything else on the card stays inert on purpose: only the address acts.
  } else {
    hintEl.textContent = '点击任意位置恢复';
    card.addEventListener('click', restore);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (needsNewTab) requestRestore();
    else restore();
  });
})();
