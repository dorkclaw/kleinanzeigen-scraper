/**
 * Formatting and reporting helpers.
 */
const { jv } = require('./api');

const DISCORD_WEBHOOK_URL =
  process.env.KLEINANZEIGEN_DISCORD_WEBHOOK ||
  process.env.DISCORD_WEBHOOK_URL ||
  null;

// ─── Price formatting ─────────────────────────────────────────────────────────

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

// ─── HTML stripping ──────────────────────────────────────────────────────────

/**
 * Strip HTML tags from a string and truncate.
 */
function stripHtml(str, maxLen = 200) {
  const plain = (str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain;
}

// ─── Vision filtering ────────────────────────────────────────────────────────

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

// ─── Discord posting ─────────────────────────────────────────────────────────

const DISCORD_MAX_RETRIES = 3;
const DISCORD_RETRY_BASE_DELAY_MS = 1000;

/**
 * Post a single payload to Discord with retry logic.
 * @param {object} payload - Discord webhook payload
 * @returns {Promise<boolean>} true if posted successfully after retries
 */
async function postWithRetry(payload) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('[Discord] No webhook URL configured (set KLEINANZEIGEN_DISCORD_WEBHOOK)');
    return false;
  }

  for (let attempt = 1; attempt <= DISCORD_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return true;
      }
      if (res.status >= 500 && attempt < DISCORD_MAX_RETRIES) {
        // Server error — retry
        const delay = DISCORD_RETRY_BASE_DELAY_MS * attempt;
        console.warn(`[Discord] Server error ${res.status}, retrying in ${delay}ms (attempt ${attempt}/${DISCORD_MAX_RETRIES})…`);
        await sleep(delay);
        continue;
      }
      // 400 bad request, 404 not found, 403 forbidden, etc. — don't retry, it's a permanent failure
      console.warn(`[Discord] Webhook returned ${res.status} ${res.statusText} — not retrying.`);
      return false;
    } catch (err) {
      if (attempt < DISCORD_MAX_RETRIES) {
        const delay = DISCORD_RETRY_BASE_DELAY_MS * attempt;
        console.warn(`[Discord] Network error: ${err.message}, retrying in ${delay}ms (attempt ${attempt}/${DISCORD_MAX_RETRIES})…`);
        await sleep(delay);
        continue;
      }
      console.error(`[Discord] Failed after ${DISCORD_MAX_RETRIES} attempts:`, err.message);
      return false;
    }
  }
  return false;
}

/**
 * Post deals to Discord via webhook.
 * @param {object[]} deals
 * @returns {Promise<boolean>} true if posted successfully
 */
async function postToDiscord(deals) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('[Discord] No webhook URL configured (set KLEINANZEIGEN_DISCORD_WEBHOOK)');
    return false;
  }

  const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (deals.length === 0) {
    // Post a "no deals" ping so we know the cron is alive
    const payload = {
      content: `🛍️ **0 neue Deals in Aachen** (${dateStr})\n\nKeine neuen Deals heute. Nächste Prüfung morgen früh. 💨`,
    };
    const ok = await postWithRetry(payload);
    if (ok) console.log('[Discord] Posted "no deals" notification.');
    return ok;
  }

  // Build a compact list — each deal on 2 lines
  const lines = [`🛍️ **${deals.length} neue Deals in Aachen** (${dateStr})\n`];
  for (const deal of deals) {
    const price = formatPrice(deal.ad);
    const location = deal.ad.state || deal.ad.zipCode || '?';
    const distance = deal.ad.distance || '?';
    lines.push(`**${deal.categoryLabel}** — ${deal.title}`);
    lines.push(`${price} | 📍 ${location} (${distance}km) | ${deal.url}\n`);
  }

  // Discord embed field limit is 1024 chars per field, 25 fields max
  // Post as plain text (compact) — split into chunks of 10 deals max
  const CHUNK = 10;
  let allOk = true;
  for (let i = 0; i < deals.length; i += CHUNK) {
    const chunk = deals.slice(i, i + CHUNK);
    const chunkNum = Math.floor(i / CHUNK) + 1;
    const chunkLines = [i === 0 ? lines[0] : `🛍️ **Deals ${i + 1}–${i + chunk.length}** (fortgesetzt)`];
    for (const deal of chunk) {
      const price = formatPrice(deal.ad);
      const location = deal.ad.state || deal.ad.zipCode || '?';
      const distance = deal.ad.distance || '?';
      chunkLines.push(`**${deal.categoryLabel}** — ${deal.title}`);
      chunkLines.push(`${price} | 📍 ${location} (${distance}km)`);
      chunkLines.push(`${deal.url}\n`);
    }
    const payload = { content: chunkLines.join('\n') };
    const ok = await postWithRetry(payload);
    if (ok) {
      console.log(`[Discord] Posted chunk ${chunkNum} (${chunk.length} deals).`);
    } else {
      console.warn(`[Discord] Chunk ${chunkNum} failed — not retrying further.`);
      allOk = false;
    }
    // Small delay between chunks to avoid rate limiting
    if (i + CHUNK < deals.length) await sleep(500);
  }
  return allOk;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Stdout reporting ────────────────────────────────────────────────────────

/**
 * Print a list of deals to stdout.
 * @param {object[]} deals
 * @returns {Promise<boolean>} true if Discord delivery succeeded
 */
async function reportDeals(deals) {
  if (deals.length === 0) {
    console.log('No deals found.');
    const ok = await postToDiscord(deals); // still ping Discord so cron is alive
    return ok;
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

  const ok = await postToDiscord(deals);
  return ok;
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

module.exports = { formatPrice, stripHtml, filterByVision, reportDeals, printAllDeals, postToDiscord };
