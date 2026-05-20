/**
 * Core category fetching logic — searches one category for new ads.
 */
const { apiGet, apiGetAd, jv, getSellerSatisfaction, sleep, extractPictures, extractUrl } = require('./api');
const { LOCATION_ID } = require('./constants');

const PAGE_SIZE = 20;
const MAX_PAGES = 1; // First page only — keeps API load light

/**
 * Search one category and return new deals (not in seenIds).
 *
 * @param {object} cat - Category config object { query, label, maxPrice, excludeKeywords }
 * @param {Set<string>} seenIds - Already-seen ad IDs to skip
 * @returns {{ deals: object[], seenThisRun: Set<string> }}
 */
async function fetchCategory(cat, seenIds) {
  const seenThisRun = new Set();
  const deals = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      q: cat.query,
      locationId: String(cat.locationId || LOCATION_ID),
      size: String(PAGE_SIZE),
      page: String(page),
    });

    let json;
    try {
      json = await apiGet('/api/ads.json?' + params);
    } catch (e) {
      console.error(`  API error for "${cat.query}" page ${page}: ${e.message}`);
      break;
    }

    const ns = json[NS + 'ads'];
    const ads = ns?.value?.ad;
    if (!ads || ads.length === 0) break;

    const paging = ns?.value?.paging;
    const total = paging?.numFound ? parseInt(paging.numFound) : 0;
    if (page === 0) {
      if (total === 0) {
        console.log(`  No results for "${cat.query}"`);
        return { deals: [], seenThisRun };
      }
      console.log(`  "${cat.query}": ${total} total results`);
    }

    for (const rawAd of ads) {
      if (!rawAd || !rawAd.id) continue;

      const id = String(rawAd.id.value || rawAd.id);
      if (!id) continue;

      // Skip already-seen ads
      if (seenIds.has(id) || seenThisRun.has(id)) continue;
      seenThisRun.add(id);

      // Skip non-fixed-price ads
      const priceTypeRaw = rawAd.price?.['price-type']?.value || rawAd.price?.['price-type'];
      const priceType = typeof priceTypeRaw === 'object' ? priceTypeRaw?.value : priceTypeRaw;
      if (priceType !== 'SPECIFIED_AMOUNT') continue;

      // Extract and validate price
      const priceAmount = rawAd.price?.amount;
      const priceNum = extractNum(priceAmount);
      if (priceNum === null || (cat.maxPrice && priceNum > cat.maxPrice)) continue;

      // Radius filter (km)
      if (cat.radius) {
        const rawRadius = jv(rawAd['ad-address']?.radius);
        const dist = parseFloat(rawRadius || 0);
        if (dist > cat.radius) continue;
      }

      // Keyword quality filter
      if (!isLikelyDeal(rawAd, cat)) continue;

      // Fetch individual ad for seller satisfaction (skip OK/NAJA sellers)
      try {
        const adData = await apiGetAd(id);
        const nsKey = NS + 'ad';
        const adValue = adData?.[nsKey]?.value;
        const satisfaction = getSellerSatisfaction(adValue);
        // Skip only known OK/NAJA sellers; UNKNOWN (null = no rating data) passes through
        if (satisfaction === 'OK' || satisfaction === 'NAJA') {
          console.log(`  Skipping "${jv(rawAd.title) || id}" — seller satisfaction: ${satisfaction}`);
          continue;
        }
      } catch (e) {
        // If we can't fetch seller info, be permissive and include the deal
        console.warn(`  Could not fetch seller info for ${id}: ${e.message}`);
      }

      // Extract images
      const pics = extractPictures(rawAd.pictures);
      const thumbnail = pics?.thumbnail || null;
      const xxlImage = pics?.extraLarge || null;

      // Extract URL
      const url = extractUrl(rawAd) || `https://www.kleinanzeigen.de/s-anzeige/${id}`;

      // Extract text for description snippet
      const description = jv(rawAd.description) || '';

      deals.push({
        id,
        title: jv(rawAd.title) || 'Ohne Titel',
        price: priceNum,
        currency: jv(rawAd.price?.['currency-iso-code']?.value) || 'EUR',
        url,
        thumbnail,
        xxlImage,
        categoryLabel: cat.label,
        ad: {
          id,
          price: priceNum,
          currency: jv(rawAd.price?.['currency-iso-code']?.value) || 'EUR',
          state: jv(rawAd['ad-address']?.state) || '',
          distance: parseFloat(jv(rawAd['ad-address']?.radius) || 0).toFixed(1),
          description,
          attributes: rawAd.attributes,
        },
      });
    }

    if (ads.length < PAGE_SIZE) break;
    await sleep(1000);
  }

  return { deals, seenThisRun };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

const NS = require('./constants').NS;

/**
 * Extract a numeric price from JAXB or plain field.
 * @param {any} v - JAXB {value: number} or a number
 * @returns {number|null}
 */
function extractNum(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return v;
  // JAXB-wrapped: {value: 12}
  const inner = v.value !== undefined ? v.value : v;
  if (typeof inner === 'number') return inner;
  const n = parseFloat(inner);
  return isNaN(n) ? null : n;
}

/** Check if ad text doesn't contain any exclude keywords and matches required keywords. */
function isLikelyDeal(ad, cat) {
  const text = extractText(ad);
  const normalized = ' ' + text.replace(/<[^>]+>/g, ' ').replace(/[-_:,;!?()[\]{}|]+/g, ' ') + ' ';

  for (const kw of cat.excludeKeywords) {
    if (normalized.includes(' ' + kw + ' ')) return false;
  }

  if (cat.requireKeywords && cat.requireKeywords.length > 0) {
    const hasRequired = cat.requireKeywords.some(kw => {
      const needle = ' ' + kw.toLowerCase() + ' ';
      return normalized.includes(needle);
    });
    if (!hasRequired) return false;
  }

  // Height filter: reject if any height value found is below minimum
  if (cat.minHeight) {
    const heights = text.match(/\b(\d+)\s*(cm|m)\b/gi) || [];
    const hasValidHeight = heights.some(h => {
      const n = parseInt(h, 10);
      const isMeters = h.toLowerCase().includes('m');
      const cm = isMeters ? n * 100 : n;
      return cm >= cat.minHeight;
    });
    // If no height mentioned at all, be lenient and accept
    if (heights.length > 0 && !hasValidHeight) return false;
  }

  return true;
}

/** Concatenate all searchable text from an ad. */
function extractText(ad) {
  const parts = [jv(ad.title), jv(ad.description)];
  try {
    if (ad.attributes) {
      const attrs = ad.attributes;
      if (Array.isArray(attrs)) {
        for (const a of attrs) {
          const val = a.value !== undefined ? jv(a.value) : jv(a);
          if (val) parts.push(val);
        }
      }
    }
  } catch {}
  return parts.join(' ').toLowerCase();
}

module.exports = { fetchCategory };