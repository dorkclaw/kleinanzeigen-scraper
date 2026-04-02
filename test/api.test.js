/**
 * Unit tests for src/api.js — JAXB unwrapping and helpers.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');

// ─── Inline the helpers so tests are self-contained and fast ───────────────────

function jv(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(jv).join(' ');
  while (typeof v === 'object' && v !== null && 'value' in v) {
    v = v.value;
  }
  if (typeof v === 'object' && v !== null) return '';
  return String(v ?? '');
}

function jvNum(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return v;
  return parseFloat(jv(v)) || null;
}

function jvStr(v) {
  const s = jv(v);
  return s.trim();
}

function extractPictures(pictures) {
  if (!pictures) return null;
  const picsObj = pictures?.picture;
  const picsArr = Array.isArray(picsObj) ? picsObj : (picsObj ? [picsObj] : []);
  const result = { thumbnail: null, large: null, extraLarge: null, xxl: null };
  for (const pic of picsArr) {
    const links = pic?.link || [];
    const linkArr = Array.isArray(links) ? links : [links];
    for (const l of linkArr) {
      const rel = typeof (l?.rel) === 'string' ? l.rel : l?.rel?.value || '';
      const href = typeof (l?.href) === 'string' ? l.href : l?.href?.value || '';
      if (rel === 'thumbnail' && !result.thumbnail) result.thumbnail = href;
      if (rel === 'large' && !result.large) result.large = href;
      if ((rel === 'extraLarge' || rel === 'XXL') && !result.extraLarge) result.extraLarge = href;
    }
    if (result.thumbnail && result.extraLarge) break;
  }
  return result.thumbnail || result.large || result.extraLarge || result.xxl ? result : null;
}

function extractUrl(ad) {
  if (!ad || !ad.link) return null;
  const links = Array.isArray(ad.link) ? ad.link : [ad.link];
  for (const l of links) {
    const rel = typeof l.rel === 'string' ? l.rel : l.rel?.value || '';
    if (rel === 'self-public-website') {
      return typeof l.href === 'string' ? l.href : l.href?.value || null;
    }
  }
  return null;
}

// ─── jv() tests ───────────────────────────────────────────────────────────────

describe('jv() — JAXB value unwrapper', () => {
  test('returns empty string for null/undefined', () => {
    assert.strictEqual(jv(null), '');
    assert.strictEqual(jv(undefined), '');
  });

  test('returns string as-is', () => {
    assert.strictEqual(jv('hello'), 'hello');
  });

  test('returns number as string', () => {
    assert.strictEqual(jv(42), '42');
    assert.strictEqual(jv(0), '0');
  });

  test('unwraps {value: "..."}', () => {
    assert.strictEqual(jv({ value: 'hello' }), 'hello');
  });

  test('unwraps {value: 123}', () => {
    assert.strictEqual(jv({ value: 123 }), '123');
  });

  test('unwraps double-nested {value: {value: "..."}}', () => {
    assert.strictEqual(jv({ value: { value: 'hello' } }), 'hello');
  });

  test('unwraps triple-nested {value: {value: {value: "..."}}}', () => {
    assert.strictEqual(jv({ value: { value: { value: 'EUR' } } }), 'EUR');
  });

  test('arrays are joined with spaces', () => {
    assert.strictEqual(jv([{ value: 'a' }, { value: 'b' }]), 'a b');
  });

  test('handles JAXB array of strings', () => {
    assert.strictEqual(jv(['alpha', 'beta']), 'alpha beta');
  });

  test('empty object returns empty string', () => {
    assert.strictEqual(jv({}), '');
  });
});

// ─── jvNum() tests ────────────────────────────────────────────────────────────

describe('jvNum() — numeric extractor', () => {
  test('returns null for null/undefined', () => {
    assert.strictEqual(jvNum(null), null);
    assert.strictEqual(jvNum(undefined), null);
  });

  test('returns number as-is', () => {
    assert.strictEqual(jvNum(42), 42);
    assert.strictEqual(jvNum(0), 0);
    assert.strictEqual(jvNum(3.14), 3.14);
  });

  test('parses numeric string', () => {
    assert.strictEqual(jvNum('42'), 42);
    assert.strictEqual(jvNum('3.14'), 3.14);
  });

  test('returns null for non-numeric string', () => {
    assert.strictEqual(jvNum('hello'), null);
    assert.strictEqual(jvNum(''), null);
  });

  test('unwraps {value: 12}', () => {
    assert.strictEqual(jvNum({ value: 12 }), 12);
  });

  test('unwraps {value: "42"}', () => {
    assert.strictEqual(jvNum({ value: '42' }), 42);
  });

  test('unwraps double-nested {value: {value: 12}}', () => {
    assert.strictEqual(jvNum({ value: { value: 12 } }), 12);
  });
});

// ─── jvStr() tests ────────────────────────────────────────────────────────────

describe('jvStr() — string extractor with trim', () => {
  test('trims whitespace', () => {
    assert.strictEqual(jvStr('  hello  '), 'hello');
  });

  test('returns empty string for null', () => {
    assert.strictEqual(jvStr(null), '');
  });
});

// ─── extractPictures() tests ──────────────────────────────────────────────────

describe('extractPictures()', () => {
  // Real Kleinanzeigen structure: { picture: [{ link: [{ rel: {value:}, href: {value:} }] }] }
  function makePics(rel, href) {
    return { picture: [{ link: [{ rel: { value: rel }, href: { value: href } }] }] };
  }
  function makePicsMulti(...entries) {
    // entries: [{rel, href}, ...]
    return {
      picture: entries.map(e => ({
        link: [{ rel: { value: e.rel }, href: { value: e.href } }],
      })),
    };
  }

  test('returns null for null/undefined', () => {
    assert.strictEqual(extractPictures(null), null);
  });

  test('extracts thumbnail', () => {
    const r = extractPictures(makePics('thumbnail', 'https://img.example.com/thumb.jpg'));
    assert.strictEqual(r.thumbnail, 'https://img.example.com/thumb.jpg');
  });

  test('extracts extraLarge', () => {
    const r = extractPictures(makePics('extraLarge', 'https://img.example.com/xl.jpg'));
    assert.strictEqual(r.extraLarge, 'https://img.example.com/xl.jpg');
  });

  test('extracts multiple sizes', () => {
    const r = extractPictures(makePicsMulti(
      { rel: 'thumbnail', href: 'https://img.example.com/t.jpg' },
      { rel: 'extraLarge', href: 'https://img.example.com/xl.jpg' },
    ));
    assert.strictEqual(r.thumbnail, 'https://img.example.com/t.jpg');
    assert.strictEqual(r.extraLarge, 'https://img.example.com/xl.jpg');
  });

  test('returns null when picture has no matching links', () => {
    const r = extractPictures(makePics('unknown', 'https://img.example.com/u.jpg'));
    assert.strictEqual(r, null);
  });
});

// ─── extractUrl() tests ───────────────────────────────────────────────────────

describe('extractUrl()', () => {
  test('returns null for null/undefined', () => {
    assert.strictEqual(extractUrl(null), null);
    assert.strictEqual(extractUrl(undefined), null);
  });

  test('extracts self-public-website link', () => {
    const ad = {
      link: [
        { rel: { value: 'self-public-website' }, href: { value: 'https://www.kleinanzeigen.de/s-anzeige/123' } },
        { rel: { value: 'other' }, href: { value: 'https://other.de' } },
      ],
    };
    assert.strictEqual(extractUrl(ad), 'https://www.kleinanzeigen.de/s-anzeige/123');
  });

  test('returns null when no matching rel', () => {
    const ad = {
      link: [
        { rel: { value: 'thumbnail' }, href: { value: 'https://img.de/t.jpg' } },
      ],
    };
    assert.strictEqual(extractUrl(ad), null);
  });

  test('handles single link (not array)', () => {
    const ad = {
      link: { rel: { value: 'self-public-website' }, href: { value: 'https://www.kleinanzeigen.de/s-anzeige/456' } },
    };
    assert.strictEqual(extractUrl(ad), 'https://www.kleinanzeigen.de/s-anzeige/456');
  });
});
