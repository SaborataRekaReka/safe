const test = require('node:test');
const assert = require('node:assert/strict');

const tracking = require('../partner-tracking.js');

function createStorage(initialData = {}) {
  const data = { ...initialData };

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    snapshot() {
      return { ...data };
    }
  };
}

test('getPartnerCodeFromUrl uses partner_code first', () => {
  const value = tracking.getPartnerCodeFromUrl('?partner_code= 12345 &a_aid=abc');
  assert.equal(value, '12345');
});

test('getPartnerCodeFromUrl falls back to a_aid', () => {
  const value = tracking.getPartnerCodeFromUrl('?a_aid=kseniia');
  assert.equal(value, 'kseniia');
});

test('getPartnerCodeFromUrl falls back to ref_id', () => {
  const value = tracking.getPartnerCodeFromUrl('?ref_id=partner-42');
  assert.equal(value, 'partner-42');
});

test('getPartnerCodeFromUrl ignores empty values', () => {
  const value = tracking.getPartnerCodeFromUrl('?partner_code=   &a_aid=');
  assert.equal(value, null);
});

test('resolvePartnerCode priority: url over storage and cookie', () => {
  const storage = createStorage({ partner_code: 'stored' });
  const writes = [];

  const value = tracking.resolvePartnerCode({
    search: '?partner_code=fresh-code',
    storage,
    cookieString: 'partner_code=cookie-value',
    cookieWriter: (key, cookieValue) => writes.push([key, cookieValue])
  });

  assert.equal(value, 'fresh-code');
  assert.equal(storage.getItem('partner_code'), 'fresh-code');
  assert.deepEqual(writes[0], ['partner_code', 'fresh-code']);
});

test('resolvePartnerCode uses storage when URL has no code', () => {
  const storage = createStorage({ partner_code: 'stored-value' });

  const value = tracking.resolvePartnerCode({
    search: '?utm_source=test',
    storage,
    cookieString: 'partner_code=cookie-value'
  });

  assert.equal(value, 'stored-value');
});

test('resolvePartnerCode uses cookie when storage empty', () => {
  const storage = createStorage();

  const value = tracking.resolvePartnerCode({
    search: '?utm_source=test',
    storage,
    cookieString: 'partner_code=cookie-only'
  });

  assert.equal(value, 'cookie-only');
  assert.equal(storage.getItem('partner_code'), 'cookie-only');
});

test('appendPartnerCodeToBotHelpUrl adds partner_code and preserves params', () => {
  const result = tracking.appendPartnerCodeToBotHelpUrl(
    'https://r.bothelp.io/tg?domain=safe_exchange_money_bot&start=c1774877924856-ds&utm_source=ads',
    'abc 123'
  );

  const parsed = new URL(result);
  assert.equal(parsed.searchParams.get('domain'), 'safe_exchange_money_bot');
  assert.equal(parsed.searchParams.get('start'), 'c1774877924856-ds');
  assert.equal(parsed.searchParams.get('utm_source'), 'ads');
  assert.equal(parsed.searchParams.get('partner_code'), 'abc 123');
});

test('appendPartnerCodeToBotHelpUrl replaces existing partner_code', () => {
  const result = tracking.appendPartnerCodeToBotHelpUrl(
    'https://r.bothelp.io/tg?domain=safe_exchange_money_bot&start=c1774877924856-ds&partner_code=old',
    'new'
  );

  const parsed = new URL(result);
  assert.equal(parsed.searchParams.get('partner_code'), 'new');
});

test('appendPartnerCodeToBotHelpUrl does not change non BotHelp URL', () => {
  const source = 'https://example.com/?partner_code=old';
  const result = tracking.appendPartnerCodeToBotHelpUrl(source, 'new');
  assert.equal(result, source);
});

test('sanitizePartnerCode trims and limits length to 100', () => {
  const longValue = `  ${'x'.repeat(150)}  `;
  const sanitized = tracking.sanitizePartnerCode(longValue, 100);
  assert.equal(sanitized.length, 100);
});
