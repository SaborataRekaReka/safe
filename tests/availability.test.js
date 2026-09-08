const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const partnerHtml = fs.readFileSync(path.join(root, 'partner_link.html'), 'utf8');
const inlineScripts = html => Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g), match => match[1]);
const redirectScript = inlineScripts(partnerHtml).find(script => script.includes('function redirectNow()'));

function runRedirect({ cookie = '', storageValue = null, blockedRead = false, blockedWrite = false, brokenAnalytics = false, search = '?ref_id=new-partner', referrer = '' } = {}) {
  const timeouts = [];
  const intervals = [];
  const destinations = [];
  const links = { href: 'https://r.bothelp.io/tg?domain=ExchSafe_bot&start=c1779906106435-ds' };
  let elapsed = 0;
  const cta = {
    getAttribute: key => links[key],
    setAttribute: (key, value) => { links[key] = value; },
    addEventListener() {}
  };
  const page = { getAttribute: () => '3000' };
  const document = {
    referrer,
    title: 'Переход в Telegram',
    querySelector: selector => ({ '[data-go-bot-page]': page, '[data-go-bot-link]': cta, '[data-go-bot-status]': { textContent: '' } })[selector] || null,
    querySelectorAll: () => []
  };
  Object.defineProperty(document, 'cookie', {
    get() { if (blockedRead) throw new Error('Cookies disabled'); return cookie; },
    set() { if (blockedWrite) throw new Error('Cookie writes disabled'); }
  });
  const window = {
    document,
    location: { search, protocol: 'https:', href: 'https://safe-fin.com/partner_link' + search, replace: url => destinations.push(url) },
    dataLayer: brokenAnalytics ? { push() { throw new Error('Analytics failed'); } } : [],
    setTimeout: (callback, delay) => { timeouts.push({ callback, delay }); return timeouts.length; },
    setInterval: callback => { intervals.push(callback); return intervals.length; },
    clearInterval() {}
  };
  Object.defineProperty(window, 'localStorage', {
    get() {
      if (blockedRead) throw new Error('Storage disabled');
      return {
        getItem: () => storageValue,
        setItem() { if (blockedWrite) throw new Error('Storage writes disabled'); }
      };
    }
  });
  vm.runInNewContext(redirectScript, {
    window, document, URL, URLSearchParams,
    Date: { now: () => elapsed },
    navigator: { sendBeacon: () => true },
    // These requests never resolve: neither measurement nor warmup may gate navigation.
    fetch: () => new Promise(() => {})
  });
  assert.equal(destinations.length, 0, 'must preserve the visible countdown');
  elapsed = 3000;
  intervals.forEach(callback => callback());
  timeouts.sort((a, b) => a.delay - b.delay).forEach(timer => timer.callback());
  assert.equal(destinations.length, 1, 'interval and fallback timeout must not redirect twice');
  assert.equal(links.href, destinations[0], 'manual and automatic destinations must agree');
  const destination = new URL(destinations[0]);
  assert.equal(destination.searchParams.get('domain'), 'ExchSafe_bot');
  assert.equal(destination.searchParams.get('start'), 'c1779906106435-ds');
  return destination.searchParams.get('partner_code');
}

test('partner page has no external stylesheet that can block the inline redirect', () => {
  assert.ok(redirectScript);
  assert.doesNotMatch(partnerHtml, /<link[^>]+rel=["']stylesheet["']/);
});

test('redirect preserves the URL code when the webview blocks all storage', () => {
  assert.equal(runRedirect({ blockedRead: true, blockedWrite: true }), 'new-partner');
});

test('redirect survives read-only storage and a failing analytics handler', () => {
  assert.equal(runRedirect({ blockedWrite: true, brokenAnalytics: true }), 'new-partner');
});

test('an unrelated malformed cookie does not erase the first partner or stop navigation', () => {
  assert.equal(runRedirect({ cookie: 'bad%ZZ=value; partner_code=first-partner' }), 'first-partner');
  assert.equal(runRedirect({ cookie: 'partner_code=legacy%ZZ' }), 'legacy%ZZ');
});

test('first-touch attribution and all existing referral entry points survive the fix', () => {
  assert.equal(runRedirect({ storageValue: 'original-partner' }), 'original-partner');
  assert.equal(runRedirect({ search: '?a_aid=affiliate-7' }), 'affiliate-7');
  assert.equal(runRedirect({ search: '?partner_code=partner%20%26%207' }), 'partner & 7');
  assert.equal(runRedirect({ search: '', referrer: 'https://partners.safe-fin.com/click?campaign_id=1&ref_id=referrer-partner' }), 'referrer-partner');
  assert.equal(runRedirect({ search: '' }), null);
});

test('shared tracking keeps attribution even when cookie persistence throws', () => {
  const tracking = require('../partner-tracking.js');
  assert.equal(tracking.resolvePartnerCode({
    search: '?ref_id=partner-42', cookieString: '',
    storage: { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } },
    cookieWriter() { throw new Error('Blocked'); }
  }), 'partner-42');
});

test('shared browser tracking still resolves the URL when cookie and storage getters throw', () => {
  const document = { readyState: 'loading', addEventListener() {} };
  Object.defineProperty(document, 'cookie', {
    get() { throw new Error('Cookie access denied'); },
    set() { throw new Error('Cookie access denied'); }
  });
  const window = { document, location: { search: '?ref_id=webview-partner', protocol: 'https:', hostname: 'safe-fin.com' }, addEventListener() {} };
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage access denied'); } });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'partner-tracking.js'), 'utf8'), { window, document, URL, URLSearchParams });
  assert.equal(window.SafePartnerTracking.resolvePartnerCode(), 'webview-partner');
});

const guardHtml = fs.readFileSync(path.join(root, 'partials/loading-guard.html'), 'utf8').trim();
const guardScript = inlineScripts(guardHtml)[0];

function createStyleGuard() {
  const classes = new Set();
  const events = {};
  const link = { nodeName: 'LINK', sheet: null, media: '', hasAttribute: name => name === 'data-site-styles' };
  let timeout;
  const document = {
    documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
    querySelector: () => link,
    addEventListener: (name, callback) => { events[name] = callback; }
  };
  vm.runInNewContext(guardScript, {
    document, window: { setTimeout: callback => { timeout = callback; return 1; }, clearTimeout() {} }
  });
  return { classes, events, link, timeout };
}

test('stalled CSS stops blocking rendering and late CSS restores the normal design', () => {
  const guard = createStyleGuard();
  guard.timeout();
  assert.equal(guard.link.media, 'print');
  assert.ok(guard.classes.has('site-styles-pending'));
  guard.link.sheet = {};
  guard.events.load({ target: guard.link });
  assert.equal(guard.link.media, 'all');
  assert.equal(guard.classes.size, 0);
});

test('failed CSS exposes readable content immediately; successful CSS keeps normal rendering', () => {
  const failed = createStyleGuard();
  failed.events.error({ target: failed.link });
  assert.ok(failed.classes.has('site-styles-pending'));
  const loaded = createStyleGuard();
  loaded.link.sheet = {};
  loaded.timeout();
  assert.equal(loaded.link.media, '');
  assert.equal(loaded.classes.size, 0);
});

test('every shared-stylesheet page starts its guard before CSS and keeps scripts non-blocking', () => {
  let checked = 0;
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    if (!/<link[^>]+href="styles\.css/.test(html)) continue;
    const fragment = html.match(/<!-- shared:loading-guard:start -->[\s\S]*?<!-- shared:loading-guard:end -->/);
    assert.ok(fragment, name);
    assert.equal(fragment[0].replace(/^    /gm, '').replace(/\r\n/g, '\n'), guardHtml.replace(/\r\n/g, '\n'), name);
    assert.ok(fragment.index < html.indexOf('<link rel="stylesheet" data-site-styles'), name);
    for (const script of html.matchAll(/<script\b[^>]*\bsrc=[^>]+>/g)) {
      assert.match(script[0], /\b(?:defer|async)\b/, name);
    }
    checked++;
  }
  assert.ok(checked > 0);
});
