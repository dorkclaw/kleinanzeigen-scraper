/**
 * Formatting and reporting helpers.
 */
const { jv } = require('./api');

/**
 * Format a price from an ad's price field.
 * Handles JAXB-wrapped and plain numeric formats.
 */
/**
 * Format a deal's price and currency.
 * @param {object} deal - Deal object with .price (number) and .currency (string) top-level,
 *                        OR ad object with JAXB-wrapped .price
 */
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

/**
 * Strip HTML tags from a string and truncate.
 */
function stripHtml(str, maxLen = 200) {
  const plain = (str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain;
}

/**
 * Filter deals by vision score (if vision results available).
 * Without vision: returns all deals.
 *
 * @param {object[]} deals
 * @param {object} visionResults - map of dealId → vision string
 * @param {boolean} doAnalyzeImages - whether vision analysis was run
 * @param {number} minScore - minimum score to pass (default 8)
 * @returns {object[]} filtered deals
 */
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

/**
 * Print a list of deals to stdout.
 */
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

/**
 * Print all deals to stdout (for dry-run / full listing output).
 * Includes description snippet and vision result if available.
 */
function printAllDeals(deals, visionResults = {}) {
  console.log('--- DEALS ---');
  for (const d of deals) {
    const shortDesc = stripHtml(d.ad.description);
    const vision = visionResults[d.id];
    const price = formatPrice({ price: d.price, currency: d.currency });

    console.log(`  [${d.categoryLabel}] ${d.title} — ${price} | 📍 ${d.ad.state || '?'} (${d.ad.distance}km)`);
    if (shortDesc) console.log(`    📝 ${shortDesc}`);
    if (vision) console.log(`    👁️  ${vision}`);
    console.log(`    ${d.url}`);
    if (d.thumbnail) console.log(`    🖼️  ${d.thumbnail}`);
    console.log();
  }
}

module.exports = { formatPrice, stripHtml, filterByVision, reportDeals, printAllDeals };
