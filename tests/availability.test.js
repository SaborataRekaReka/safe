const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const partnerHtml = fs.readFileSync(path.join(root, 'partner_link.html'), 'utf8');
const inlineScripts = html => Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g), match => match[1]);
const referralScript = inlineScripts(partnerHtml).find(script => script.includes("var API_PATH = '/referral-start.php'"));

async function runReferralPage({
  search = '?ref_id=current-partner&click_id=click-17',
  fetchMode = 'success',
  responsePayload = {
    ok: true,
    code: 'K7M4Q',
    telegram_url: 'https://t.me/Danil_Berdykin?text=Hello%20K7M4Q'
  }
} = {}) {
  const timers = [];
  const intervals = [];
  const destinations = [];
  const requests = [];
  const seconds = [{ textContent: '3' }, { textContent: '3' }];
  const status = { textContent: '' };
  const timer = { hidden: true };
  const countdown = { hidden: true };
  const ring = { style: {} };
  let elapsed = 0;

  const attributes = { href: 'https://t.me/Danil_Berdykin' };
  const cta = {
    getAttribute: key => attributes[key],
    setAttribute: (key, value) => { attributes[key] = String(value); },
    removeAttribute: key => { delete attributes[key]; },
    addEventListener() {}
  };
  const page = { getAttribute: () => '3000' };
  const document = {
    querySelector: selector => ({
      '[data-referral-page]': page,
      '[data-referral-status]': status,
      '[data-referral-link]': cta,
      '[data-partner-link-timer]': timer,
      '[data-partner-link-countdown]': countdown,
      '[data-partner-link-ring]': ring
    })[selector] || null,
    querySelectorAll: () => seconds
  };

  const href = 'https://safe-fin.com/partner_link' + search;
  const window = {
    document,
    location: {
      search,
      href,
      replace: url => destinations.push(url)
    },
    dataLayer: [],
    setTimeout(callback, delay) {
      const timerId = timers.length;
      timers.push({ callback, delay, cleared: false });
      return timerId;
    },
    clearTimeout(timerId) {
      if (timers[timerId]) timers[timerId].cleared = true;
    },
    setInterval(callback) {
      intervals.push(callback);
      return intervals.length;
    },
    clearInterval() {},
    fetch(url, options) {
      requests.push({ url, options });
      if (fetchMode === 'pending') return new Promise(() => {});
      if (fetchMode === 'error') return Promise.reject(new Error('Network error'));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(responsePayload)
      });
    }
  };

  vm.runInNewContext(referralScript, {
    window,
    document,
    URL,
    URLSearchParams,
    Date: { now: () => elapsed }
  });

  await new Promise(resolve => setImmediate(resolve));

  if (fetchMode === 'pending') {
    const apiTimeout = timers.find(item => item.delay === 5000 && !item.cleared);
    assert.ok(apiTimeout, 'a stalled API request must have a timeout');
    apiTimeout.callback();
  }

  assert.equal(timer.hidden, false, 'countdown starts only after success or a safe fallback is selected');
  assert.equal(countdown.hidden, false);
  assert.equal(destinations.length, 0, 'the countdown stays visible before navigation');

  elapsed = 3000;
  intervals.forEach(callback => callback());
  timers
    .filter(item => item.delay === 3250 && !item.cleared)
    .forEach(item => item.callback());

  assert.equal(destinations.length, 1, 'interval and fallback timer must not redirect twice');
  assert.equal(attributes.href, destinations[0], 'manual and automatic destinations must agree');

  return {
    destination: destinations[0],
    request: requests[0] || null,
    requestCount: requests.length,
    status: status.textContent,
    dataLayer: window.dataLayer
  };
}

test('partner page is self-contained and no longer references BotHelp', () => {
  assert.ok(referralScript);
  assert.doesNotMatch(partnerHtml, /<link[^>]+rel=["']stylesheet["']/);
  assert.doesNotMatch(partnerHtml, /bothelp\.io/i);
  assert.match(partnerHtml, /href="https:\/\/t\.me\/Danil_Berdykin"/);
});

test('referral request uses exact current URL values and returned personal Telegram link', async () => {
  const result = await runReferralPage({
    search: '?partner_code=stored-is-irrelevant&ref_id=%20exact-ref%20&click_id=click%2F17'
  });
  const requestBody = JSON.parse(result.request.options.body);

  assert.equal(result.request.url, '/referral-start.php');
  assert.equal(requestBody.ref_id, ' exact-ref ');
  assert.equal(requestBody.click_id, 'click/17');
  assert.equal(requestBody.page_url, 'https://safe-fin.com/partner_link?partner_code=stored-is-irrelevant&ref_id=%20exact-ref%20&click_id=click%2F17');
  assert.equal(result.destination, 'https://t.me/Danil_Berdykin?text=Hello%20K7M4Q');
  assert.match(result.status, /K7M4Q/);
});

test('qa=1 stays on the API request and suppresses page analytics', async () => {
  const result = await runReferralPage({ search: '?ref_id=partner-7&qa=1' });
  assert.equal(result.request.url, '/referral-start.php?qa=1');
  assert.equal(JSON.parse(result.request.options.body).page_url, 'https://safe-fin.com/partner_link?ref_id=partner-7&qa=1');
  assert.deepEqual(result.dataLayer, []);
});

test('missing ref_id skips the API and opens the operator without attribution', async () => {
  const result = await runReferralPage({ search: '?partner_code=legacy-value' });
  assert.equal(result.requestCount, 0);
  assert.equal(result.destination, 'https://t.me/Danil_Berdykin');
  assert.match(result.status, /нет партнёрской метки/i);
});

test('API failure and timeout fall back to the direct operator chat', async () => {
  const failed = await runReferralPage({ fetchMode: 'error' });
  assert.equal(failed.destination, 'https://t.me/Danil_Berdykin');
  assert.match(failed.status, /оператор поможет вручную/i);

  const timedOut = await runReferralPage({ fetchMode: 'pending' });
  assert.equal(timedOut.destination, 'https://t.me/Danil_Berdykin');
  assert.match(timedOut.status, /дольше обычного/i);
});

test('unexpected Telegram host, user, or empty draft is rejected', async () => {
  for (const telegramUrl of [
    'https://example.com/Danil_Berdykin?text=code',
    'https://t.me/another_user?text=code',
    'https://t.me/Danil_Berdykin'
  ]) {
    const result = await runReferralPage({
      responsePayload: { ok: true, code: 'K7M4Q', telegram_url: telegramUrl }
    });
    assert.equal(result.destination, 'https://t.me/Danil_Berdykin');
    assert.match(result.status, /не удалось проверить/i);
  }
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
