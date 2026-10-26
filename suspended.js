'use strict';

/**
 * Tab Suspender Lite — placeholder page.
 *
 * Reads the original URL and title from its own query string, shows a minimal
 * card, and restores the page when the card (or Enter/Space) is used.
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

  /** Restore: replace the placeholder so it does not stay in history. */
  const restore = () => {
    if (!/^https?:\/\//i.test(targetUrl)) return;
    location.replace(targetUrl);
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

  const titleEl = document.getElementById('title');
  titleEl.textContent = truncate(fullTitle, TITLE_MAX);
  titleEl.title = fullTitle;

  const urlEl = document.getElementById('url');
  urlEl.textContent = truncate(targetUrl, URL_MAX);
  urlEl.title = targetUrl;

  document.getElementById('card').addEventListener('click', restore);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      restore();
    }
  });
})();
