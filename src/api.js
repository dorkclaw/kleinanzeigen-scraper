/**
 * Shared API client and JAXB parsing helpers.
 * Used by both deal-finder.js and scraper.js.
 */
const https = require('https');
const { AUTH, USER_AGENT, BASE_URL } = require('./constants');

/**
 * Make a GET request to the Kleinanzeigen API.
 * @param {string} path - Path including query string (e.g. '/api/ads.json?q=laptop&page=0')
 * @param {number} retries - Number of retries on 429
 * @returns {Promise<object>} Parsed JSON response
 */
function apiGet(path, retries = 3) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': AUTH,
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    };

    const doReq = () => {
      const TIMEOUT_MS = 30000;
      const req = https.get(options, res => {
        if (res.statusCode === 429 && retries > 0) {
          console.error(`  ⚠ Rate-limited (429), retrying in 10s... (${retries} left)`);
          setTimeout(doReq, 10000);
          return;
        }
        if (res.statusCode === 401) {
          reject(new Error('Unauthorized (401) — auth may be expired'));
          return;
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse failed: ${data.slice(0, 200)}`));
          }
        });
      });
      req.setTimeout(TIMEOUT_MS, () => {
        req.destroy(new Error(`Request timeout after ${TIMEOUT_MS}ms`));
      });
      req.on('error', reject);
    };

    doReq();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── JAXB unwrapping ──────────────────────────────────────────────────────────

/**
 * Unwrap a JAXB value: {value: "..."} → "..."
 * Also handles plain primitives, arrays, and nested JAXB ({value: {value: "..."}}).
 */
function jv(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(jv).join(' ');
  // Recursively unwrap nested JAXB objects
  while (typeof v === 'object' && v !== null && 'value' in v) {
    v = v.value;
  }
  // After unwinding, if we landed on a non-primitive, give up rather than
  // stringify something like {} or [] as '[object Object]'
  if (typeof v === 'object' && v !== null) return '';
  return String(v ?? '');
}

/**
 * Extract numeric value from JAXB or plain field.
 */
function jvNum(v) {
  if (!v) return null;
  if (typeof v === 'number') return v;
  return parseFloat(jv(v)) || null;
}

/**
 * Extract string value from JAXB or plain field, returns null if empty.
 */
function jvStr(v) {
  const s = jv(v);
  return s || null;
}

// ─── Picture extraction ───────────────────────────────────────────────────────

/**
 * Extract picture URLs from JAXB picture object.
 * Returns { thumbnail, large, extraLarge, xxl } or null.
 */
function extractPictures(pictures) {
  if (!pictures) return null;
  const picsObj = pictures?.picture;
  const picsArr = Array.isArray(picsObj) ? picsObj : (picsObj ? [picsObj] : []);
  const result = { thumbnail: null, large: null, extraLarge: null, xxl: null };
  for (const pic of picsArr) {
    const links = pic?.link || [];
    const linkArr = Array.isArray(links) ? links : [links];
    for (const l of linkArr) {
      const rel = l?.rel || '';
      const href = l?.href || '';
      if (rel === 'thumbnail' && !result.thumbnail) result.thumbnail = href;
      if (rel === 'large' && !result.large) result.large = href;
      if ((rel === 'extraLarge' || rel === 'XXL') && !result.extraLarge) result.extraLarge = href;
    }
    if (result.thumbnail && result.extraLarge) break;
  }
  return result;
}

// ─── URL extraction ──────────────────────────────────────────────────────────

/**
 * Extract public listing URL from JAXB ad object.
 */
function extractUrl(ad) {
  try {
    const links = ad?.link || [];
    const linkArr = Array.isArray(links) ? links : [links];
    for (const l of linkArr) {
      const rel = l?.rel || '';
      if (rel.includes('self-public-website')) {
        return l?.href || null;
      }
    }
  } catch {}
  const id = ad?.id ? jvStr(ad.id) : null;
  return id ? `https://www.kleinanzeigen.de/s-anzeige/${id}` : null;
}

module.exports = { apiGet, sleep, jv, jvNum, jvStr, extractPictures, extractUrl };
