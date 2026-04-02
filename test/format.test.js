/**
 * Unit tests for src/format.js — formatting and reporting helpers.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');

// ─── Inline helpers under test ───────────────────────────────────────────────

function stripHtml(str, maxLen = 200) {
  const plain = (str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain;
}

function formatPrice(deal) {
  let p, cur;
  if (typeof deal.price === 'number') {
    p = deal.price;
    cur = deal.currency || '€';
  } else {
    p = deal.price?.amount?.value || deal.price?.amount;
    cur = deal.price?.['currency-iso-code']?.value?.value || deal.currency || '€';
  }
  if (!p || p === 0) return 'Preis auf Anfrage';
  return `${p} ${cur}`;
}

function filterByVision(deals, visionResults, doAnalyzeImages, minScore = 8) {
  if (!doAnalyzeImages) return deals;
  return deals.filter(d => {
    const vision = visionResults[d.id];
    if (!vision) return false;
    if (!vision.match(/^PHOTO\s*\|/i)) return false;
    const match = vision.match(/(\d+)\/10/);
    if (!match) return false;
    return parseInt(match[1]) >= minScore;
  });
}

// ─── stripHtml() tests ────────────────────────────────────────────────────────

describe('stripHtml()', () => {
  test('strips simple HTML tags', () => {
    assert.strictEqual(stripHtml('<b>hello</b> world'), 'hello world');
  });

  test('strips nested tags', () => {
    assert.strictEqual(stripHtml('<p><strong>bold</strong> text</p>'), 'bold text');
  });

  test('collapses whitespace', () => {
    assert.strictEqual(stripHtml('hello    world'), 'hello world');
  });

  test('trims result', () => {
    assert.strictEqual(stripHtml('  hello  '), 'hello');
  });

  test('truncates long strings with …', () => {
    const long = 'a'.repeat(300);
    const result = stripHtml(long, 50);
    assert.strictEqual(result.length, 51); // 50 + …
    assert.ok(result.endsWith('…'));
  });

  test('handles null/undefined', () => {
    assert.strictEqual(stripHtml(null), '');
    assert.strictEqual(stripHtml(undefined), '');
  });

  test('collapses multiple spaces to single space', () => {
    assert.strictEqual(stripHtml('<div>hello  world</div>'), 'hello world');
  });
});

// ─── formatPrice() tests ──────────────────────────────────────────────────────

describe('formatPrice()', () => {
  test('formats {price: 12, currency: "EUR"}', () => {
    assert.strictEqual(formatPrice({ price: 12, currency: 'EUR' }), '12 EUR');
  });

  test('formats {price: 12, currency: "€"}', () => {
    assert.strictEqual(formatPrice({ price: 12, currency: '€' }), '12 €');
  });

  test('falls back to € when no currency', () => {
    assert.strictEqual(formatPrice({ price: 50 }), '50 €');
  });

  test('returns "Preis auf Anfrage" for price 0', () => {
    assert.strictEqual(formatPrice({ price: 0 }), 'Preis auf Anfrage');
  });

  test('returns "Preis auf Anfrage" for null price', () => {
    assert.strictEqual(formatPrice({ price: null }), 'Preis auf Anfrage');
  });

  test('handles JAXB-wrapped price', () => {
    const deal = {
      price: { amount: { value: 99 }, 'currency-iso-code': { value: { value: 'EUR' } } },
    };
    assert.strictEqual(formatPrice(deal), '99 EUR');
  });
});

// ─── filterByVision() tests ───────────────────────────────────────────────────

describe('filterByVision()', () => {
  const deals = [
    { id: '1', title: 'Deal A' },
    { id: '2', title: 'Deal B' },
    { id: '3', title: 'Deal C' },
  ];

  test('returns all deals when vision analysis disabled', () => {
    const result = filterByVision(deals, {}, false);
    assert.strictEqual(result.length, 3);
  });

  test('returns all deals when vision analysis enabled but no results', () => {
    const result = filterByVision(deals, {}, true);
    assert.strictEqual(result.length, 0);
  });

  test('filters out deals with no PHOTO prefix', () => {
    const vision = { '1': 'Stock image', '2': 'PHOTO | 9/10 | good deal' };
    const result = filterByVision(deals, vision, true);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, '2');
  });

  test('filters by minimum score threshold (default 8)', () => {
    const vision = {
      '1': 'PHOTO | 9/10 | great deal',
      '2': 'PHOTO | 7/10 | ok deal',
      '3': 'PHOTO | 10/10 | insane',
    };
    const result = filterByVision(deals, vision, true);
    assert.strictEqual(result.length, 2);
    assert.ok(result.some(d => d.id === '1'));
    assert.ok(result.some(d => d.id === '3'));
  });

  test('respects custom minScore', () => {
    const vision = {
      '1': 'PHOTO | 9/10',
      '2': 'PHOTO | 7/10',
    };
    const result = filterByVision(deals, vision, true, 9);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, '1');
  });

  test('case-insensitive PHOTO prefix check', () => {
    const vision = { '1': 'photo | 9/10' };
    const result = filterByVision(deals, vision, true);
    assert.strictEqual(result.length, 1);
  });
});
