#!/usr/bin/env node
/**
 * Kleinanzeigen Deal Finder
 * 
 * Searches multiple categories for potential deals and reports new findings.
 * Tracks seen ads in seen-ads.json to avoid spamming duplicates.
 * 
 * Usage:
 *   node deal-finder.js                  # normal run (fetch + report new deals)
 *   node deal-finder.js --dryRun=true    # show what would be reported without Discord
 *   node deal-finder.js --categories     # list configured categories and exit
 *   node deal-finder.js --reset-seen     # clear seen-ads log (start fresh)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const AUTH = 'Basic YW5kcm9pZDpUYVI2MHBFdHRZ';
const USER_AGENT = 'okhttp/4.10.0';
const NS = '{http://www.ebayclassifiedsgroup.com/schema/ad/v1}';
const LOCATION_ID = 1921; // Aachen
const POSTAL_CODE = '52074'; // Aachen zipcode

const SEEN_FILE = path.join(__dirname, 'seen-ads.json');
const ADS_DIR = path.join(__dirname, 'ads');

// Categories to search. Each entry: { query, label, maxPrice, excludeKeywords }
// excludeKeywords: skip entirely regardless of brand/price
const CORE_CATEGORIES = [
  // Group 0 (run on even days: 2,4,6,...30) — study/desk
  [
    { query: 'laptop',            label: '💻 Laptops',             maxPrice: 70,  excludeKeywords: ['defekt', 'kaputt', 'broken', 'gesperrt', 'suche', 'nur ', 'nur-', 'defect', 'damage', 'funktioniert nicht', 'startet nicht', 'bootet nicht', 'fehler', 'fehlerhaft', 'Reparatur', 'restwert', 'für teile', 'für ersatzteile', 'als ersatz', 'Displayfehler', 'Tastatur defekt', 'display kaputt', 'akku defekt', 'ladebuchse'] },
    { query: 'bücher',            label: '📚 Bücher',              maxPrice: 50,  excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'beschädigt'] },
    { query: 'taschenrechner',    label: '🔢 Taschenrechner',      maxPrice: 100, excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche'] },
    { query: 'bürostuhl',         label: '🪑 Bürostühle',          maxPrice: 100, excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'fehlerhaft'] },
    { query: 'werkzeug',          label: '🔧 Werkzeug',            maxPrice: 80,  excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'feinmechaniker', 'brille', 'handy', 'uhr', 'bike', 'fahrrad'] },
    { query: 'hantel',            label: '🏋️ Hanteln (1-10kg)',    maxPrice: 30,  excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'ergometer', 'fahrrad', 'laufband'] },
  ],
  // Group 1 (run on odd days: 1,3,5,...31) — tech/gear
  [
    { query: 'monitor',           label: '🖥️ Monitore',           maxPrice: 150, excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'burnin', 'einbrennen', 'fleck', 'flecken', 'totale defekt', 'netbook', 'Displayfehler', 'burn in', 'burn-in', 'brennt ein', 'eingebrannt'] },
    { query: 'tastatur maus',     label: '⌨️🖱️ Tastaturen+Mäuse',  maxPrice: 80,  excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'rauch', 'geraucht', 'tier', 'ps/2 adapter', 'ps/2 konverter', 'adapter', 'konverter'] },
    { query: 'pc komponenten',    label: '🔧 PC-Komponenten',      maxPrice: 150, excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'defekt', 'fehlerhaft', 'restwert', 'für teile', 'für ersatzteile'] },
    { query: 'tablet ipad',       label: '📱 Tablets+iPads',       maxPrice: 200, excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'tasche', 'hülle', 'case', 'cover', 'folie', 'ständer', 'halterung', 'pencil', 'pen', 'stift', 'keyboard cover', 'schutzhülle'] },
    { query: 'headset',           label: '🎧 Headsets',            maxPrice: 80,  excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'motorrad', 'moped', 'fahrrad', 'bike', 'velo', 'helm', 'intercom', 'sprachanlage', 'vimoto', 'fahrradcomputer', 'cycle', 'wired only', 'nur kabel', 'ps4', 'xbox', 'kind', 'kinder', ' gaming ', 'gamingkopfhörer'] },
  ],
];

// Pick group based on day of month (odd/even)
// CORE_CATEGORIES[0] = even days, CORE_CATEGORIES[1] = odd days
const day = new Date().getDate();
const CATEGORIES = CORE_CATEGORIES[day % 2];

// Bonus categories — rotate daily on a 3-day cycle
const BONUS_CATEGORIES = [
  // Speakers / Subwoofers
  {
    query: 'lautsprecher subwoofer',
    label: '🔊 Lautsprecher+Subwoofer',
    maxPrice: 250,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'kabel', 'nur', 'led', 'party', 'mini', 'billig', 'computer', 'pc-lautsprecher', 'laptop'],
  },
  // Bikes — max €80, AI checks description+picture before posting
  {
    query: 'fahrrad mountainbike rennrad',
    label: '🚲 Fahrräder',
    maxPrice: 80,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'kinder', '10 zoll', '12 zoll', '14 zoll', '16 zoll', '18 zoll', '20 zoll', '24 zoll', 'damenn', 'damenrad', 'herrenrad einfache', 'cityrad'],
  },
  // DDR4 RAM
  {
    query: 'ddr4 ram',
    label: '🧠 DDR4 RAM',
    maxPrice: 80,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'ddr3', 'ddr5', 'sodimm', 'laptop ram', 'server', 'ecc'],
  },
];

// Always-on bonus categories (searched every run, not rotated)
const ALWAYS_BONUS = [
  // VR headsets — only post scores ≥7
  {
    query: 'vr headset',
    label: '🥽 VR Headsets',
    maxPrice: 200,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'sonderangebot', 'aktion', 'angebot', 'test', 'brille'],
  },
  {
    query: 'oculus quest',
    label: '🥽 Oculus/Meta Quest',
    maxPrice: 250,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'sonderangebot', 'aktion', 'test', 'brille'],
  },
  {
    query: 'valve index',
    label: '🕹️ Valve Index',
    maxPrice: 500,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'brille', ' einzeln', 'nur zubehör'],
  },
  {
    query: 'bigscreen beyond',
    label: '🖥️ Bigscreen Beyond',
    maxPrice: 500,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test'],
  },
  {
    query: 'psvr',
    label: '🎮 PSVR',
    maxPrice: 200,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test'],
  },
  // Racing wheels — only post scores ≥7
  {
    query: 'sim racing lenkrad',
    label: '🏎️ Sim Racing Wheels',
    maxPrice: 300,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'cockpit', 'sitz', 'halterung', 'prüfstand', 'rollentrainer', 'rahmen', 'montage'],
  },
  {
    query: 'logitech g29',
    label: '🏎️ Logitech G29/G923',
    maxPrice: 250,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'cockpit', 'sitz', 'halterung'],
  },
  // 10Gb/s+ network cards — only excellent deals
  {
    query: '10gbe network card',
    label: '🔌 10GbE Netzwerkkarte',
    maxPrice: 150,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'sfp+ modul', 'sfp+ cable'],
  },
  {
    query: '10 gigabit pcie',
    label: '🔌 10GbE Netzwerkkarte',
    maxPrice: 150,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'sfp+ modul', 'sfp+ cable'],
  },
  {
    query: 'sfp+ netzwerkkarte',
    label: '🔌 SFP+ Netzwerkkarte',
    maxPrice: 150,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'nur karte', 'ohne transceiver'],
  },
  // Server cases — only excellent deals
  {
    query: 'server gehäuse 19 zoll',
    label: '🗄️ Server Gehäuse',
    maxPrice: 200,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'leer', 'ohne hardware', 'netzteil'],
  },
  {
    query: 'rackmount gehäuse',
    label: '🗄️ Server Gehäuse',
    maxPrice: 200,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'leer', 'ohne hardware'],
  },
];

const BONUS = BONUS_CATEGORIES[day % 3];
const ALL_CATEGORIES = [...CATEGORIES, BONUS, ...ALWAYS_BONUS];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function apiGet(path, retries = 3) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://api.kleinanzeigen.de' + path);
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
      require('https').get(options, res => {
        if (res.statusCode === 429 && retries > 0) {
          console.error(`  ⚠ Rate-limited (429), retrying in 10s... (${retries} left)`);
          setTimeout(doReq, 10000);
          return;
        }
        if (res.statusCode === 401) {
          reject(new Error(`Unauthorized (401) — auth may be expired`));
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
      }).on('error', reject);
    };
    doReq();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function loadSeenAds() {
  if (!fs.existsSync(SEEN_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSeenAds(seen) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

function loadSeenIds() {
  return new Set(Object.keys(loadSeenAds()));
}

function loadAdFile(id) {
  const file = path.join(ADS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function getThumbnail(ad) {
  try {
    const pics = ad.pictures || [];
    if (pics.length === 0) return null;
    const pic = Array.isArray(pics[0]) ? pics[0] : [pics[0]];
    for (const p of pic) {
      if (p.thumbnail) return p.thumbnail;
    }
    return null;
  } catch {
    return null;
  }
}

// Unwrap a JAXB value: handles {value: "..."} or plain string/number
function jv(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(jv).join(' ');
  return (v.value !== undefined ? String(v.value) : '');
}

function extractText(ad) {
  const parts = [jv(ad.title), jv(ad.description)];
  try {
    if (ad.attributes) {
      const attrs = ad.attributes;
      if (Array.isArray(attrs)) {
        for (const a of attrs) {
          const val = jv(a.value !== undefined ? a.value : a);
          if (val) parts.push(val);
        }
      }
    }
  } catch {}
  return parts.join(' ').toLowerCase();
}

function isLikelyDeal(ad, cat) {
  const text = extractText(ad);
  
  // Skip if contains any exclude keyword (defect, broken, wanted/Suche)
  // Normalize: strip HTML tags, replace separators with spaces, pad for boundary matching
  const normalized = ' ' + text.replace(/<[^>]+>/g, ' ').replace(/[-_:,;!?()[\]{}|]+/g, ' ') + ' ';
  for (const kw of cat.excludeKeywords) {
    if (normalized.includes(' ' + kw + ' ')) return false;
  }

  return true;
}

function formatPrice(ad) {
  // ad.price may be a number (stored directly) or an object with amount.value
  const p = typeof ad.price === 'number'
    ? ad.price
    : ad.price?.amount?.value || ad.price?.amount;
  if (!p || p === 0) return 'Preis auf Anfrage';
  const cur = typeof ad.price === 'number'
    ? (ad.currency || '€')
    : (ad.price?.['currency-iso-code']?.value?.value || ad.currency || '€');
  return `${p} ${cur}`;
}

// ─── DISCORD REPORTER ────────────────────────────────────────────────────────

async function reportDeals(deals) {
  if (deals.length === 0) {
    console.log('No deals found.');
    return;
  }

  console.log(`\n🛍️ **${deals.length} Deals found in Aachen** (${new Date().toISOString().split('T')[0]})\n`);
  for (const deal of deals) {
    const price = formatPrice(deal.ad);
    const location = deal.ad.zipCode || deal.ad.state || '?';
    const distance = deal.ad.distance || '?';
    console.log(`  **${deal.categoryLabel}**`);
    console.log(`  ${deal.title}`);
    console.log(`  ${price} | 📍 ${location} (${distance}km)`);
    console.log(`  🔗 [${deal.url}](${deal.url})`);
    console.log();
  }
}

// ─── MAIN CRAWL LOGIC ────────────────────────────────────────────────────────

async function fetchCategory(cat, seenIds) {
  const seenThisRun = new Set();
  const deals = [];
  let page = 0;
  const MAX_PAGES = 1; // Just first page per category per run — enough deals, light on API
  const PAGE_SIZE = 20;

  while (page < MAX_PAGES) {
    const params = new URLSearchParams({
      q: cat.query,
      locationId: String(LOCATION_ID),
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

    const ads = json[NS + 'ads']?.value?.ad;
    if (!ads || ads.length === 0) break;

    // Total is in paging.numFound (not search-options which doesn't exist in this API version)
    const paging = json[NS + 'ads']?.value?.paging;
    const total = paging?.numFound ? parseInt(paging.numFound) : 0;
    if (page === 0) {
      if (total === 0) {
        console.log(`  No results for "${cat.query}"`);
        return { deals: [], seenThisRun };
      }
      console.log(`  "${cat.query}": ${total} total results`);
    }

    for (const ad of ads) {
      if (!ad || !ad.id) continue;
      const id = String(ad.id?._ || ad.id?.value || ad.id);

      // Skip already-seen ads
      if (seenIds.has(id)) continue;
      if (seenThisRun.has(id)) continue;
      seenThisRun.add(id);

      // Skip non-fixed-price ads (make offer / contact seller)
      const priceType = ad.price?.['price-type']?.value;
      if (priceType !== 'SPECIFIED_AMOUNT') continue;
      
      // Price is wrapped in JAXB {value: ...} — extract the number
      const price = parseFloat(ad.price?.amount?.value || ad.price?.amount || 0);
      if (cat.maxPrice && price > cat.maxPrice) continue;

      // Check if likely a deal
      if (!isLikelyDeal(ad, cat)) continue;

      // Get thumbnail and XXL image
      let thumbnail = null;
      let xxlImage = null;
      try {
        const pics = ad.pictures?.picture || ad.pictures || [];
        const picArray = Array.isArray(pics) ? pics : [pics];
        for (const p of picArray) {
          const links = p.link || [];
          const linkArr = Array.isArray(links) ? links : [links];
          for (const l of linkArr) {
            const href = l.href || l.$?.href || '';
            const rel = l.rel || l.$?.rel || '';
            if (rel === 'thumbnail' && !thumbnail) thumbnail = href;
            if ((rel === 'XXL' || rel === 'extraLarge') && !xxlImage) xxlImage = href;
          }
          if (thumbnail && xxlImage) break;
        }
      } catch {}

      const url = (() => {
        try {
          const links = ad.link || [];
          const linkArr = Array.isArray(links) ? links : [links];
          for (const l of linkArr) {
            const rel = l.rel || l.$?.rel || '';
            if (rel.includes('self-public-website')) return l.href || l.$?.href || `https://www.kleinanzeigen.de/s-anzeige/${id}`;
          }
        } catch {}
        return `https://www.kleinanzeigen.de/s-anzeige/${id}`;
      })();

      deals.push({
        id,
        title: ad.title?.value || ad.title || 'Ohne Titel',
        price: price,
        currency: ad.price?.['currency-iso-code']?.value?.value || ad.currency || 'EUR',
        url,
        thumbnail,
        xxlImage,
        categoryLabel: cat.label,
        ad: {
          id,
          price: price,
          currency: ad.price?.['currency-iso-code']?.value?.value || ad.currency || 'EUR',
          state: ad['ad-address']?.state?.value || ad.state || '',
          distance: parseFloat(ad['ad-address']?.radius?.value || 0).toFixed(1),
          description: ad.description?.value || ad.description || '',
          attributes: ad.attributes,
        },
      });
    }

    page++;
    if (ads.length < PAGE_SIZE) break;
    await sleep(2000); // Be polite — stagger between pages
  }

  return { deals, seenThisRun };
}

// ─── VISION IMAGE ANALYSIS ───────────────────────────────────────────────────

const ANALYZE_IMAGE_SCRIPT = path.join(__dirname, 'analyze_image.py');

/**
 * Analyze images for a batch of deals using OpenRouter Gemini Vision.
 * Runs in parallel, returns map of dealId → vision description.
 */
async function runVisionAnalysis(deals) {
  const dealsWithImages = deals.filter(d => d.xxlImage);
  if (dealsWithImages.length === 0) {
    console.log('  (no images to analyze)');
    return {};
  }

  console.log(`  Analyzing ${dealsWithImages.length} image(s) via Gemini Vision...`);

  const results = {};
  const promises = dealsWithImages.map(deal =>
    new Promise((resolve) => {
      const price = deal.price;
      const isBike = deal.categoryLabel.toLowerCase().includes('fahrrad');
      const isVR = deal.categoryLabel.includes('VR') || deal.categoryLabel.includes('Valve Index') || deal.categoryLabel.includes('Bigscreen');
      const priceContext = isBike
        ? `Typical German used bike prices: city/trekking €100-300, MTB €150-500, road €200-800, fixies €50-150.`
        : isVR
        ? `Typical VR resale Germany: Meta Quest 2/3 €100-300, Valve Index €400-600, Bigscreen Beyond €300-500, PSVR2 €200-350.`
        : deal.categoryLabel.includes('Racing')
        ? `Typical racing wheel resale: Logitech G29/G923 €100-200, Thrustmaster T300 €150-250, Fanatec €200-500, standalone wheels €30-100.`
        : `Typical German resale: monitors €30-150, keyboards/mice €10-40, headsets €20-80, tablets €50-200, PC components €20-100.`;
      const prompt = `Format: "PHOTO | SCORE/10 | reason" — max 200 chars.\n` +
        `Score 10 = impossibly cheap, 7-9 = great deal, 4-6 = fair, 1-3 = overpriced.\n` +
        `1) Real photo or stock? 2) ${isBike ? 'Bike type/brand?' : 'Product type?'} 3) ${priceContext} At €${price}, what's the score?`;

      const python = spawn('python3', [ANALYZE_IMAGE_SCRIPT, deal.xxlImage, prompt], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      python.stdout.on('data', d => stdout += d.toString());
      python.stderr.on('data', d => stderr += d.toString());

      python.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          results[deal.id] = stdout.trim();
        } else {
          console.error(`  Vision error for ${deal.id}: ${stderr || 'non-zero exit'}`);
        }
        resolve();
      });

      python.on('error', (err) => {
        console.error(`  Failed to spawn python for ${deal.id}: ${err.message}`);
        resolve();
      });

      // 25s timeout
      setTimeout(() => {
        python.kill();
        resolve();
      }, 25000);
    })
  );

  await Promise.all(promises);
  return results;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--categories')) {
    console.log('Configured categories:');
    for (const c of ALL_CATEGORIES) {
      console.log(`  ${c.label}: "${c.query}" (max €${c.maxPrice})`);
    }
    return;
  }

  const dryRun = args.includes('--dryRun=true');
  const resetSeen = args.includes('--reset-seen');
  const doAnalyzeImages = args.includes('--analyze-images');

  console.log('=== Kleinanzeigen Deal Finder ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Analyze images: ${doAnalyzeImages}`);
  console.log(`Location: Aachen (${LOCATION_ID})`);
  console.log();

  if (resetSeen) {
    fs.writeFileSync(SEEN_FILE, JSON.stringify({}));
    console.log('Seen-ads log cleared.');
    return;
  }

  const seenIds = loadSeenIds();
  console.log(`Already seen: ${seenIds.size} ads`);
  console.log();

  const allDeals = [];
  const allSeenThisRun = new Set();
  let categoryCount = 0;

  for (const cat of ALL_CATEGORIES) {
    categoryCount++;
    process.stdout.write(`[${categoryCount}/${ALL_CATEGORIES.length}] ${cat.label}...`);
    const { deals, seenThisRun } = await fetchCategory(cat, seenIds);
    
    for (const id of seenThisRun) allSeenThisRun.add(id);
    allDeals.push(...deals);
    
    if (deals.length > 0) {
      console.log(` ${deals.length} deals found!`);
    } else {
      console.log(' none');
    }
    await sleep(2000); // 2s between categories to avoid rate limits
  }

  console.log();
  console.log(`Total new deals: ${allDeals.length}`);

  if (allDeals.length === 0) {
    console.log('Nothing new. Exiting.');
    return;
  }

  // Analyze images via vision if requested
  let visionResults = {};
  if (doAnalyzeImages) {
    console.log();
    visionResults = await runVisionAnalysis(allDeals);
  }

  // Only post deals with vision score ≥8 (great deal or impossibly cheap)
  // Score 10 = impossibly cheap, 8-9 = great deal, 4-6 = fair, 1-3 = overpriced
  // Without vision analysis: mark deals as seen BUT always post (Dorian wants to see everything, will filter visually)
  // With vision analysis: only post score ≥8 + real product photo
  const MIN_SCORE = 8;
  const filteredDeals = allDeals.filter(d => {
    // With vision: strict quality filter
    if (doAnalyzeImages) {
      const vision = visionResults[d.id];
      if (!vision) return false;
      if (!vision.match(/^PHOTO\s*\|/i)) return false;
      const match = vision.match(/(\d+)\/10/);
      if (!match) return false;
      return parseInt(match[1]) >= MIN_SCORE;
    }
    // No vision: post everything (Dorian reviews manually, better than nothing)
    return true;
  });

  // Print all deals (dry run shows everything, with scores)
  console.log();
  console.log('--- DEALS ---');
  for (const d of allDeals) {
    const rawDesc = d.ad.description || '';
    // Strip HTML tags and truncate
    const plainDesc = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const shortDesc = plainDesc.length > 200 ? plainDesc.slice(0, 200) + '…' : plainDesc;
    const vision = visionResults[d.id];

    console.log(`  [${d.categoryLabel}] ${d.title} — ${formatPrice(d.ad)} | 📍 ${d.ad.state || '?'} (${d.ad.distance}km)`);
    if (shortDesc) console.log(`    📝 ${shortDesc}`);
    if (vision) console.log(`    👁️  ${vision}`);
    console.log(`    ${d.url}`);
    if (d.thumbnail) console.log(`    🖼️  ${d.thumbnail}`);
    console.log();
  }

  if (dryRun) {
    console.log('[Dry run — not updating seen log or sending Discord]');
    return;
  }

  // Update seen ads
  const seen = loadSeenAds();
  for (const id of allSeenThisRun) {
    seen[id] = new Date().toISOString();
  }
  saveSeenAds(seen);

  // Only post deals that pass the score filter
  await reportDeals(filteredDeals);
}

main().catch(console.error);
