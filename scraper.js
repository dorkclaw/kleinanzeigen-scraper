const https = require('https');
const fs = require('fs');
const path = require('path');

const AUTH = 'Basic YW5kcm9pZDpUYVI2MHBFdHRZ';
const NS = '{http://www.ebayclassifiedsgroup.com/schema/ad/v1}';
const ADS_DIR = path.join(__dirname, 'ads');
const STATE_FILE = path.join(__dirname, 'state.json');

// ── API ───────────────────────────────────────────────────────────────────────

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.kleinanzeigen.de',
      path: '/api' + path,
      headers: { 'Authorization': AUTH, 'User-Agent': 'okhttp/4.10.0', 'Accept': 'application/json' }
    };
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
      });
    }).on('error', reject);
  });
}

// ── JAXB helpers ───────────────────────────────────────────────────────────────

function jaxbVal(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if ('value' in obj) return obj.value;
  return obj;
}

function jaxbStr(obj) {
  const v = jaxbVal(obj);
  return (v === null || v === undefined) ? null : String(v);
}

// ── Picture extraction ─────────────────────────────────────────────────────────

function extractPictures(pictures) {
  if (!pictures) return [];
  const picsObj = pictures?.picture;
  const picsArr = Array.isArray(picsObj) ? picsObj : (picsObj ? [picsObj] : []);
  return picsArr.map(pic => {
    const links = pic?.link;
    const linkArr = Array.isArray(links) ? links : (links ? [links] : []);
    const linkMap = {};
    linkArr.forEach(l => { if (l?.rel) linkMap[l.rel] = l.href; });
    return {
      thumbnail: linkMap['thumbnail'] || null,
      large: linkMap['large'] || null,
      extraLarge: linkMap['extraLarge'] || null,
      xxl: linkMap['XXL'] || null,
    };
  });
}

// ── Attribute extraction ───────────────────────────────────────────────────────

function extractAttributes(attributes) {
  if (!attributes) return {};
  const attrsObj = attributes?.attribute;
  const attrsArr = Array.isArray(attrsObj) ? attrsObj : (attrsObj ? [attrsObj] : []);
  const result = {};
  attrsArr.forEach(attr => {
    const name = attr?.name;
    if (!name) return;
    const vals = attr?.value;
    const valArr = Array.isArray(vals) ? vals : (vals ? [vals] : []);
    result[name] = valArr.map(v => v?.value || v?.['localized-label'] || v).filter(v => v != null);
  });
  return result;
}

// ── Full ad parser ────────────────────────────────────────────────────────────

function parseAd(ad) {
  const adAddr = ad['ad-address'] || {};
  const locObj = ad['locations']?.location;
  const locArr = Array.isArray(locObj) ? locObj : (locObj ? [locObj] : []);
  const firstLoc = locArr[0] || {};

  let distance = jaxbVal(adAddr['radius']) || jaxbVal(firstLoc['radius']) || null;
  if (distance !== null) distance = parseFloat(distance);

  const links = ad['link'];
  const linkArr = Array.isArray(links) ? links : (links ? [links] : []);
  const urlObj = linkArr.find(l => l?.rel === 'self-public-website');

  // Category path
  const cat = ad['category'] || {};
  const catPath = [];
  let c = cat;
  while (c) {
    const name = jaxbVal(c['localized-name']);
    if (name) catPath.unshift(name);
    c = c['category'];
  }

  const startDate = ad['start-date-time']?.value || ad['start-date-time'];
  const editDate = ad['last-user-edit-date']?.value || ad['last-user-edit-date'];

  return {
    id: jaxbStr(ad['id']),
    title: jaxbVal(ad['title']),
    price: jaxbVal(ad['price']?.['amount']),
    priceType: jaxbVal(ad['price']?.['price-type']),
    currency: jaxbVal(ad['price']?.['currency-iso-code']?.['value']),
    description: jaxbVal(ad['description']) || null,
    location: jaxbVal(firstLoc['localized-name']),
    zipCode: jaxbVal(adAddr['zip-code']),
    state: jaxbVal(adAddr['state']),
    latitude: jaxbVal(adAddr['latitude']),
    longitude: jaxbVal(adAddr['longitude']),
    distance,
    url: urlObj?.href || null,
    pictures: extractPictures(ad['pictures']),
    category: catPath,
    categoryId: jaxbStr(cat['id']),
    attributes: extractAttributes(ad['attributes']),
    labels: (ad['labels']?.label || []).map(l => jaxbVal(l)).filter(Boolean),
    adType: jaxbVal(ad['ad-type']),
    posterType: jaxbVal(ad['poster-type']),
    sellerType: jaxbVal(ad['seller-account-type']),
    adStatus: jaxbVal(ad['ad-status']),
    startDate: jaxbStr(startDate),
    lastEditDate: jaxbStr(editDate),
    buyNow: ad['buy-now']?.selected === 'true' || ad['buy-now']?.['value'] === true,
    shippingOptions: (ad['shipping-options']?.['shipping-option'] || []).map(s => s?.id).filter(Boolean),
    featuresActive: (ad['features-active']?.['feature-active'] || []).map(f => jaxbVal(f)).filter(Boolean),
    // Raw reference (for debugging)
    _rawId: jaxbStr(ad['id']),
  };
}

// ── File helpers ──────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveAd(ad, dir) {
  const filePath = path.join(dir, `${ad.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(ad, null, 2), 'utf8');
  return filePath;
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return {}; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ── Pagination loop ───────────────────────────────────────────────────────────

async function fetchAllAds({ query, locationId = 1921, maxPrice = null, maxDistance = null, stopAdId = null, maxPages = 10, pageSize = 50 }) {
  let page = 0;
  let total = null;
  const allAds = [];
  const seenIds = new Set();

  while (page < maxPages) {
    const q = encodeURIComponent(query);
    const path = `/ads.json?q=${q}&locationId=${locationId}&page=${page}&size=${pageSize}`;
    const parsed = await apiGet(path);
    
    const adsWrapper = parsed[NS + 'ads'];
    const adsData = adsWrapper?.value;
    if (!adsData) {
      console.log(`  Page ${page}: no ads data, stopping.`);
      break;
    }

    if (total === null) {
      total = parsed['searchOptions']?.['totalResultCount'] || parsed['searchOptions']?.['extension']?.['totalResultCount'];
      console.log(`  Total results: ${total}`);
    }

    let adArray = adsData['ad'];
    if (!Array.isArray(adArray)) adArray = adArray ? [adArray] : [];
    if (adArray.length === 0) break;

    const pageAds = adArray.map(parseAd);
    
    // Filter
    let filtered = pageAds;
    if (maxPrice !== null) {
      filtered = filtered.filter(a => a.price !== null && a.price <= maxPrice && a.priceType === 'SPECIFIED_AMOUNT');
    }
    if (maxDistance !== null) {
      filtered = filtered.filter(a => a.distance !== null && a.distance <= maxDistance);
    }

    for (const ad of filtered) {
      // Stop if we've seen this ad before (reached previous crawl's newest)
      if (stopAdId && String(ad.id) === String(stopAdId)) {
        console.log(`  Reached stop ad ID ${stopAdId}, stopping.`);
        return { allAds, seenIds: Array.from(seenIds), total, page };
      }
      seenIds.add(String(ad.id));
      allAds.push(ad);
    }

    // Stop if this was the last page
    if (pageAds.length < pageSize) break;

    page++;
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  return { allAds, seenIds: Array.from(seenIds), total, page };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flags = {};
  args.forEach((arg, i) => {
    if (arg.startsWith('--')) {
      const key = arg.slice(2).split('=')[0];
      flags[key] = arg.includes('=') ? arg.split('=')[1] : (args[i + 1] || true);
    }
  });

  const query = flags.query;
  if (!query) {
    console.error('ERROR: --query is required (e.g., --query=fahrrad)');
    process.exit(1);
  }
  const locationId = parseInt(flags.locationId || '1921');
  const maxPrice = flags.maxPrice ? parseInt(flags.maxPrice) : null;
  const maxDistance = flags.maxDistance ? parseFloat(flags.maxDistance) : null;
  const maxPages = flags.maxPages ? parseInt(flags.maxPages) : 10;
  const stopAdId = flags.stopAdId || null;
  const dryRun = flags.dryRun === 'true';
  const dumpState = flags.dumpState === 'true';

  console.log('=== Kleinanzeigen Scraper ===\n');
  console.log(`Query: "${query}" | LocationID: ${locationId} | MaxPrice: ${maxPrice}€ | MaxDistance: ${maxDistance}km | MaxPages: ${maxPages}`);
  if (stopAdId) console.log(`Stop ad ID: ${stopAdId} (resuming from last crawl)`);
  console.log('');

  // Dump state and exit
  if (dumpState) {
    const state = loadState();
    console.log('Current state:', JSON.stringify(state, null, 2));
    return;
  }

  // Load previous state
  const prevState = loadState();
  const effectiveStop = stopAdId || prevState.lastAdId || null;
  if (effectiveStop) console.log(`Will stop at ad ID: ${effectiveStop} (or max pages)`);
  console.log('');

  // Fetch
  const { allAds, seenIds, total, page } = await fetchAllAds({
    query, locationId, maxPrice, maxDistance, stopAdId: effectiveStop, maxPages, pageSize: 50
  });

  console.log(`\nFetched ${allAds.length} new ads (page 0-${page})`);
  if (total !== null) console.log(`Total matching: ${total}`);

  if (allAds.length === 0) {
    console.log('No new ads. Nothing to save.');
    return;
  }

  if (dryRun) {
    console.log('\nDry-run — not saving files:');
    allAds.forEach(a => console.log(`  [${a.id}] ${a.title} | ${a.price}€ | ${a.distance}km | ${a.location}`));
    return;
  }

  // Save each ad to its own file
  ensureDir(ADS_DIR);
  let saved = 0;
  for (const ad of allAds) {
    try {
      saveAd(ad, ADS_DIR);
      saved++;
      console.log(`  Saved [${ad.id}] ${ad.title?.slice(0, 60)}`);
    } catch (e) {
      console.error(`  FAILED to save [${ad.id}]: ${e.message}`);
    }
  }

  // Update state: most recent ad ID seen
  const newState = {
    lastAdId: allAds[0]?.id || effectiveStop,
    lastRun: new Date().toISOString(),
    query,
    locationId,
    maxPrice: maxPrice || null,
    maxDistance: maxDistance || null,
    totalSaved: (prevState.totalSaved || 0) + saved,
    totalSeen: (prevState.totalSeen || 0) + allAds.length,
  };
  saveState(newState);

  console.log(`\nDone. Saved ${saved} new ads. Total ever: ${newState.totalSaved}`);
  console.log(`Last ad ID: ${newState.lastAdId} (use --stopAdId=${newState.lastAdId} to resume)`);
}

main().catch(console.error);
