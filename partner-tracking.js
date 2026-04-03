(function (globalScope, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(globalScope || globalThis);
    return;
  }

  globalScope.SafePartnerTracking = factory(globalScope);
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  var DEFAULT_CONFIG = {
    PARTNER_QUERY_KEYS: ['partner_code', 'a_aid'],
    STORAGE_KEY: 'partner_code',
    COOKIE_KEY: 'partner_code',
    COOKIE_MAX_AGE_DAYS: 30,
    BOTHELP_URL_PREFIX: 'https://r.bothelp.io/tg?',
    DEFAULT_BOTHELP_LINK: 'https://r.bothelp.io/tg?domain=safe_exchange_money_bot&start=c1774877924856-ds',
    AUTO_REDIRECT_TO_BOT: true,
    MAX_PARTNER_CODE_LENGTH: 100,
    AUTO_REDIRECT_DELAY_MS: 500
  };

  var initState = {
    initialized: false,
    lastUrl: null,
    currentPartnerCode: null,
    mutationObserver: null,
    goBotRedirectScheduled: false,
    scheduleDecorateTimer: null,
    scheduleSyncTimer: null
  };

  function getConfig() {
    var runtimeConfig = isObject(global.SAFE_PARTNER_CONFIG) ? global.SAFE_PARTNER_CONFIG : {};
    return Object.assign({}, DEFAULT_CONFIG, runtimeConfig);
  }

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  function hasWindow() {
    return typeof window !== 'undefined' && !!window.document;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (_error) {
      return value;
    }
  }

  function sanitizePartnerCode(value, maxLength) {
    if (value === null || value === undefined) {
      return null;
    }

    var normalized = String(value).trim();
    if (!normalized) {
      return null;
    }

    var maxLen = Number.isFinite(maxLength) ? maxLength : 100;
    if (normalized.length > maxLen) {
      normalized = normalized.slice(0, maxLen);
    }

    return normalized;
  }

  function getUrlSearchParams(searchValue) {
    var rawSearch = '';

    if (typeof searchValue === 'string') {
      rawSearch = searchValue;
    } else if (hasWindow()) {
      rawSearch = window.location.search || '';
    }

    if (rawSearch.charAt(0) === '?') {
      rawSearch = rawSearch.slice(1);
    }

    return new URLSearchParams(rawSearch);
  }

  function getPartnerCodeFromUrl(searchValue) {
    var config = getConfig();
    var params = getUrlSearchParams(searchValue);
    var maxLength = config.MAX_PARTNER_CODE_LENGTH;

    var partnerCodeKey = config.PARTNER_QUERY_KEYS[0] || 'partner_code';
    var aidKey = config.PARTNER_QUERY_KEYS[1] || 'a_aid';

    var directPartnerCode = sanitizePartnerCode(params.get(partnerCodeKey), maxLength);
    if (directPartnerCode) {
      return directPartnerCode;
    }

    var aidPartnerCode = sanitizePartnerCode(params.get(aidKey), maxLength);
    if (aidPartnerCode) {
      return aidPartnerCode;
    }

    return null;
  }

  function getStorage(options) {
    if (options && options.storage) {
      return options.storage;
    }

    if (!hasWindow()) {
      return null;
    }

    try {
      return window.localStorage;
    } catch (_error) {
      return null;
    }
  }

  function getCookieSource(options) {
    if (options && typeof options.cookieString === 'string') {
      return options.cookieString;
    }

    if (!hasWindow()) {
      return '';
    }

    return document.cookie || '';
  }

  function readCookieValue(key, options) {
    var cookieSource = getCookieSource(options);
    if (!cookieSource) {
      return null;
    }

    var parts = cookieSource.split(';');
    for (var index = 0; index < parts.length; index += 1) {
      var cookiePart = parts[index].trim();
      if (!cookiePart) {
        continue;
      }

      var separatorIndex = cookiePart.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      var name = safeDecode(cookiePart.slice(0, separatorIndex).trim());
      if (name !== key) {
        continue;
      }

      var value = cookiePart.slice(separatorIndex + 1);
      return safeDecode(value);
    }

    return null;
  }

  function getCookieDomain() {
    if (!hasWindow()) {
      return '';
    }

    var hostname = window.location.hostname || '';
    if (!hostname || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return '';
    }

    var segments = hostname.split('.').filter(Boolean);
    if (segments.length < 2) {
      return '';
    }

    return '.' + segments.slice(-2).join('.');
  }

  function writeCookie(key, value, maxAgeDays, options) {
    if (options && typeof options.cookieWriter === 'function') {
      options.cookieWriter(key, value, maxAgeDays);
      return;
    }

    if (!hasWindow()) {
      return;
    }

    var maxAgeSeconds = Math.max(0, Math.floor(maxAgeDays * 24 * 60 * 60));
    var isSecure = window.location.protocol === 'https:';
    var baseCookie =
      encodeURIComponent(key) +
      '=' +
      encodeURIComponent(value) +
      '; path=/; max-age=' +
      maxAgeSeconds +
      '; SameSite=Lax' +
      (isSecure ? '; Secure' : '');

    document.cookie = baseCookie;

    var rootDomain = getCookieDomain();
    if (rootDomain) {
      document.cookie = baseCookie + '; domain=' + rootDomain;
    }
  }

  function getStoredPartnerCode(options) {
    var config = getConfig();
    var maxLength = config.MAX_PARTNER_CODE_LENGTH;

    var storage = getStorage(options);
    if (storage && typeof storage.getItem === 'function') {
      try {
        var fromStorage = sanitizePartnerCode(storage.getItem(config.STORAGE_KEY), maxLength);
        if (fromStorage) {
          return fromStorage;
        }
      } catch (_error) {
        // Ignore localStorage access errors and fallback to cookie.
      }
    }

    var fromCookie = sanitizePartnerCode(readCookieValue(config.COOKIE_KEY, options), maxLength);
    if (!fromCookie) {
      return null;
    }

    if (storage && typeof storage.setItem === 'function') {
      try {
        storage.setItem(config.STORAGE_KEY, fromCookie);
      } catch (_error) {
        // Ignore sync errors.
      }
    }

    return fromCookie;
  }

  function savePartnerCode(value, options) {
    var config = getConfig();
    var normalizedValue = sanitizePartnerCode(value, config.MAX_PARTNER_CODE_LENGTH);
    if (!normalizedValue) {
      return null;
    }

    var storage = getStorage(options);
    if (storage && typeof storage.setItem === 'function') {
      try {
        storage.setItem(config.STORAGE_KEY, normalizedValue);
      } catch (_error) {
        // Ignore localStorage write errors.
      }
    }

    writeCookie(config.COOKIE_KEY, normalizedValue, config.COOKIE_MAX_AGE_DAYS, options);
    return normalizedValue;
  }

  function resolvePartnerCode(options) {
    var searchValue = options && typeof options.search === 'string' ? options.search : undefined;
    var urlPartnerCode = getPartnerCodeFromUrl(searchValue);

    if (urlPartnerCode) {
      savePartnerCode(urlPartnerCode, options);
      return urlPartnerCode;
    }

    return getStoredPartnerCode(options);
  }

  function isBotHelpRedirectUrl(url) {
    if (typeof url !== 'string' || !url) {
      return false;
    }

    var config = getConfig();
    return url.indexOf(config.BOTHELP_URL_PREFIX) === 0;
  }

  function appendPartnerCodeToBotHelpUrl(url, partnerCode) {
    if (typeof url !== 'string' || !url) {
      return url;
    }

    if (!isBotHelpRedirectUrl(url)) {
      return url;
    }

    var config = getConfig();
    var safeCode = sanitizePartnerCode(partnerCode, config.MAX_PARTNER_CODE_LENGTH);
    if (!safeCode) {
      return url;
    }

    try {
      var parsedUrl = new URL(url);
      parsedUrl.searchParams.set(config.STORAGE_KEY, safeCode);
      return parsedUrl.toString();
    } catch (_error) {
      return url;
    }
  }

  function collectBotHelpAnchors(root) {
    if (!hasWindow()) {
      return [];
    }

    var scope = root || document;
    var links = [];

    if (scope.nodeType === 1 && scope.tagName === 'A' && scope.hasAttribute('href')) {
      links.push(scope);
    }

    if (typeof scope.querySelectorAll === 'function') {
      var candidates = scope.querySelectorAll('a[href]');
      for (var i = 0; i < candidates.length; i += 1) {
        links.push(candidates[i]);
      }
    }

    return links;
  }

  function decorateBotHelpLinks(root, partnerCode) {
    var resolvedPartnerCode = sanitizePartnerCode(
      partnerCode !== undefined ? partnerCode : resolvePartnerCode(),
      getConfig().MAX_PARTNER_CODE_LENGTH
    );

    if (!resolvedPartnerCode) {
      return 0;
    }

    var links = collectBotHelpAnchors(root);
    var updatedCount = 0;

    for (var i = 0; i < links.length; i += 1) {
      var link = links[i];
      var originalHref = link.getAttribute('href') || '';
      if (!isBotHelpRedirectUrl(originalHref)) {
        continue;
      }

      var updatedHref = appendPartnerCodeToBotHelpUrl(originalHref, resolvedPartnerCode);
      if (updatedHref !== originalHref) {
        link.setAttribute('href', updatedHref);
        updatedCount += 1;
      }
    }

    return updatedCount;
  }

  function buildBotHelpLink(partnerCode) {
    var config = getConfig();
    var safeCode = sanitizePartnerCode(partnerCode, config.MAX_PARTNER_CODE_LENGTH);
    if (!safeCode) {
      return config.DEFAULT_BOTHELP_LINK;
    }

    return appendPartnerCodeToBotHelpUrl(config.DEFAULT_BOTHELP_LINK, safeCode);
  }

  function isGoBotPage() {
    if (!hasWindow()) {
      return false;
    }

    return !!document.querySelector('[data-go-bot-page]');
  }

  function syncGoBotPage(partnerCode) {
    if (!isGoBotPage()) {
      return;
    }

    var config = getConfig();
    var safeCode = sanitizePartnerCode(partnerCode, config.MAX_PARTNER_CODE_LENGTH);
    var botLink = buildBotHelpLink(safeCode);

    var links = document.querySelectorAll('[data-go-bot-link]');
    for (var i = 0; i < links.length; i += 1) {
      links[i].setAttribute('href', botLink);
    }

    var partnerValueNodes = document.querySelectorAll('[data-go-bot-partner-value]');
    for (var j = 0; j < partnerValueNodes.length; j += 1) {
      partnerValueNodes[j].textContent = safeCode || 'не указан';
    }

    var statusNode = document.querySelector('[data-go-bot-status]');
    if (statusNode) {
      if (safeCode) {
        statusNode.textContent = 'Партнерский код найден. Можно перейти в Telegram прямо сейчас.';
      } else {
        statusNode.textContent = 'Партнерский код не найден. Будет использована базовая ссылка на бота.';
      }
    }

    if (!config.AUTO_REDIRECT_TO_BOT || !safeCode || initState.goBotRedirectScheduled) {
      return;
    }

    initState.goBotRedirectScheduled = true;

    if (statusNode) {
      statusNode.textContent = 'Партнерский код найден. Автопереход в Telegram...';
    }

    var redirectDelay = config.AUTO_REDIRECT_DELAY_MS;
    if (!Number.isFinite(redirectDelay) || redirectDelay < 300 || redirectDelay > 700) {
      redirectDelay = 500;
    }

    window.setTimeout(function () {
      window.location.assign(botLink);
    }, redirectDelay);
  }

  function scheduleDecorate(partnerCode) {
    if (!hasWindow()) {
      return;
    }

    if (initState.scheduleDecorateTimer) {
      return;
    }

    initState.scheduleDecorateTimer = window.setTimeout(function () {
      initState.scheduleDecorateTimer = null;
      decorateBotHelpLinks(document, partnerCode);
    }, 0);
  }

  function scheduleSync() {
    if (!hasWindow()) {
      return;
    }

    if (initState.scheduleSyncTimer) {
      return;
    }

    initState.scheduleSyncTimer = window.setTimeout(function () {
      initState.scheduleSyncTimer = null;
      syncTrackingState();
    }, 0);
  }

  function syncTrackingState() {
    if (!hasWindow()) {
      return;
    }

    var currentUrl = window.location.href;
    if (initState.lastUrl === currentUrl && !isGoBotPage()) {
      scheduleDecorate(initState.currentPartnerCode || getStoredPartnerCode());
      return;
    }

    initState.lastUrl = currentUrl;
    var partnerCode = resolvePartnerCode();
    initState.currentPartnerCode = partnerCode;
    decorateBotHelpLinks(document, partnerCode);
    syncGoBotPage(partnerCode);
  }

  function patchHistoryMethods() {
    if (!hasWindow() || !window.history || window.history.__safePartnerTrackingPatched) {
      return;
    }

    var originalPushState = window.history.pushState;
    var originalReplaceState = window.history.replaceState;

    window.history.pushState = function pushStatePatched() {
      var result = originalPushState.apply(this, arguments);
      scheduleSync();
      return result;
    };

    window.history.replaceState = function replaceStatePatched() {
      var result = originalReplaceState.apply(this, arguments);
      scheduleSync();
      return result;
    };

    window.history.__safePartnerTrackingPatched = true;
  }

  function initMutationObserver() {
    if (!hasWindow() || typeof MutationObserver !== 'function' || !document.documentElement) {
      return;
    }

    initState.mutationObserver = new MutationObserver(function (mutations) {
      var shouldDecorate = false;

      for (var i = 0; i < mutations.length; i += 1) {
        var mutation = mutations[i];

        if (mutation.type === 'attributes' && mutation.attributeName === 'href') {
          shouldDecorate = true;
          break;
        }

        if (mutation.type === 'childList' && mutation.addedNodes && mutation.addedNodes.length > 0) {
          shouldDecorate = true;
          break;
        }
      }

      if (!shouldDecorate) {
        return;
      }

      var fallbackPartnerCode = initState.currentPartnerCode || getStoredPartnerCode();
      scheduleDecorate(fallbackPartnerCode);
      syncGoBotPage(fallbackPartnerCode);
    });

    initState.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
  }

  function initPartnerTracking() {
    if (!hasWindow()) {
      return;
    }

    if (initState.initialized) {
      syncTrackingState();
      return;
    }

    initState.initialized = true;

    patchHistoryMethods();
    initMutationObserver();

    window.addEventListener('popstate', scheduleSync);
    window.addEventListener('hashchange', scheduleSync);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', syncTrackingState, { once: true });
      return;
    }

    syncTrackingState();
  }

  var api = {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    getPartnerCodeFromUrl: getPartnerCodeFromUrl,
    getStoredPartnerCode: getStoredPartnerCode,
    savePartnerCode: savePartnerCode,
    resolvePartnerCode: resolvePartnerCode,
    appendPartnerCodeToBotHelpUrl: appendPartnerCodeToBotHelpUrl,
    decorateBotHelpLinks: decorateBotHelpLinks,
    initPartnerTracking: initPartnerTracking,
    sanitizePartnerCode: sanitizePartnerCode,
    buildBotHelpLink: buildBotHelpLink
  };

  if (hasWindow()) {
    window.SafePartnerTracking = api;
    initPartnerTracking();
  }

  return api;
});
