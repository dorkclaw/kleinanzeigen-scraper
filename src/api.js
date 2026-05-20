/**
 * Shared API client and JAXB parsing helpers.
 * Used by both deal-finder.js and scraper.js.
 */
const https = require('https');
const { AUTH, USER_AGENT, BASE_URL, NS } = require('./constants');

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

/**
 * Fetch a single ad by ID and return seller rating info.
 * @param {string} id - Ad ID
 * @returns {Promise<object|null>}
 */
function apiGetAd(id) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + `/api/ads/${id}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Authorization': AUTH,
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    };

    const req = https.get(options, res => {
      if (res.statusCode === 429) {
        setTimeout(() => apiGetAd(id).then(resolve).catch(reject), 10000);
        return;
      }
      if (res.statusCode === 401) {
        reject(new Error('Unauthorized (401) — auth may be expired'));
        return;
      }
      if (res.statusCode === 404) {
        resolve(null);
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
    req.setTimeout(30000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
  });
}

/**
 * Extract seller satisfaction from individual ad response.
 * Returns 'TOP', 'GUT', 'OK', 'NAJA', or null if unknown.
 * Based on average rating (stars) and badge levels from the API.
 */
function getSellerSatisfaction(adValue) {
  if (!adValue) return null;

  const rating = adValue['user-rating']?.averageRating?.value;
  const badges = adValue['userBadges']?.badges || [];

  // Build badge level map
  const badgeLevels = {};
  for (const b of badges) {
    if (b.name && b.level !== undefined) {
      badgeLevels[b.name] = parseInt(b.level, 10);
    }
  }

  // Map stars (1-5) + reliability badge (1-3) to satisfaction tier
  // TOP: 5 stars OR 4 stars + reliability level 3
  // GUT: 4 stars OR 3 stars + reliability >= 2
  // OK: 3 stars OR 2 stars + reliability >= 1
  // NAJA: 1-2 stars with no/high reliability
  if (!rating) return null;

  // Rating is on 0-1 scale (e.g. 0.67 = 3.35 stars → round to 3)
  const stars = Math.round(parseFloat(rating) * 5);
  const reliability = badgeLevels['reliability'] || 0;

  if (stars >= 5) return 'TOP';
  if (stars === 4 && reliability >= 3) return 'TOP';
  if (stars === 4) return 'GUT';
  if (stars === 3 && reliability >= 2) return 'GUT';
  if (stars === 3) return 'OK';
  if (stars === 2) return 'OK';
  if (stars <= 1) return 'NAJA';

  return null;
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

module.exports = { apiGet, apiGetAd, jv, jvNum, jvStr, extractPictures, extractUrl, getSellerSatisfaction, BASE_URL, AUTH, USER_AGENT, NS, sleep };
