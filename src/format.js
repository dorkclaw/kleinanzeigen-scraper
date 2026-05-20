/**
 * Formatting, vision filtering, and Discord reporting helpers.
 */
const { jv } = require('./api');

const DISCORD_WEBHOOK_URL =
  process.env.KLEINANZEIGEN_DISCORD_WEBHOOK ||
  process.env.DISCORD_WEBHOOK_URL ||
  null;

// ─── Price formatting ────────────────────────────────────────────────────────

/** @param {object} deal - top-level deal with .price (number) and .currency */
function formatPrice(deal) {
  if (!deal.price || deal.price === 0) return 'Preis auf Anfrage';
  const cur = deal.currency === 'EUR' ? '€' : (deal.currency || '€');
  return `${deal.price} ${cur}`;
}

// ─── HTML stripping ─────────────────────────────────────────────────────────

/**
 * Strip HTML tags from a string and truncate.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function stripHtml(str, maxLen = 200) {
  const plain = (str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain;
}

// ─── Vision filtering ────────────────────────────────────────────────────────

/**
 * Filter deals by vision score.
 * Requires vision string to match "PHOTO | N/10" format and score >= minScore.
 * Returns original array unchanged if vision analysis was not run.
 *
 * @param {object[]} deals
 * @param {object}   visionResults - map of dealId → vision result string
 * @param {boolean}  wasAnalyzed  - whether vision analysis actually ran
 * @param {number}   minScore     - minimum score to pass (default 8)
 * @returns {object[]} filtered deals
 */
function filterByVision(deals, visionResults, wasAnalyzed, minScore = 8) {
  if (!wasAnalyzed) return deals;

  return deals.filter(d => {
    const vision = visionResults[d.id];
    if (!vision) return false;
    const match = vision.match(/^PHOTO\s*\|\s*(\d+)\/10/i);
    if (!match) return false;
    return parseInt(match[1]) >= minScore;
  });
}

// ─── Discord posting ─────────────────────────────────────────────────────────

const DISCORD_MAX_RETRIES  = 3;
const DISCORD_RETRY_DELAY  = 1000; // ms
const DISCORD_CHUNK_SIZE   = 10;   // deals per Discord message

/** Small delay helper that works in both CommonJS and ESM contexts. */
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
      if (res.ok) return true;

      // 5xx: retryable server error
      if (res.status >= 500 && attempt < DISCORD_MAX_RETRIES) {
        const delay = DISCORD_RETRY_DELAY * attempt;
        console.warn(`[Discord] Server error ${res.status}, retrying in ${delay}ms (${attempt}/${DISCORD_MAX_RETRIES})…`);
        await sleep(delay);
        continue;
      }

      // 4xx: permanent failure, don't retry
      console.warn(`[Discord] Webhook returned ${res.status} ${res.statusText} — not retrying.`);
      return false;
    } catch (err) {
      if (attempt < DISCORD_MAX_RETRIES) {
        const delay = DISCORD_RETRY_DELAY * attempt;
        console.warn(`[Discord] Network error: ${err.message}, retrying in ${delay}ms (${attempt}/${DISCORD_MAX_RETRIES})…`);
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

  const dateStr = new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  if (deals.length === 0) {
    console.log('[Discord] No deals — not posting.');
    return true;
  }

  let allOk = true;
  for (let i = 0; i < deals.length; i += DISCORD_CHUNK_SIZE) {
    const chunk     = deals.slice(i, i + DISCORD_CHUNK_SIZE);
    const chunkNum = Math.floor(i / DISCORD_CHUNK_SIZE) + 1;
    const isFirst  = i === 0;

    const header = isFirst
      ? `🛍️ **${deals.length} neue Deals in Aachen** (${dateStr})\n`
      : `🛍️ **Deals ${i + 1}–${i + chunk.length}** (fortgesetzt)\n`;

    const lines = [header];
    for (const d of chunk) {
      lines.push(
        `**${d.categoryLabel}** — ${d.title}`,
        `${formatPrice({ price: d.price, currency: d.currency })} | 📍 ${d.ad.state || '?'} (${d.ad.distance}km)`,
        `${d.url}\n`,
      );
    }

    const ok = await postWithRetry({ content: lines.join('\n') });
    if (ok) {
      console.log(`[Discord] Chunk ${chunkNum} posted (${chunk.length} deals).`);
    } else {
      console.warn(`[Discord] Chunk ${chunkNum} failed.`);
      allOk = false;
    }

    if (i + DISCORD_CHUNK_SIZE < deals.length) await sleep(500);
  }

  return allOk;
}

// ─── Stdout reporting ────────────────────────────────────────────────────────

/**
 * Report new deals to stdout and Discord.
 * @param {object[]} deals
 * @returns {Promise<boolean>} true if Discord delivery succeeded
 */
async function reportDeals(deals) {
  if (deals.length === 0) {
    console.log('No deals found.');
    return postToDiscord([]);
  }

  console.log(`\n🛍️ **${deals.length} Deals found in Aachen** (${new Date().toISOString().split('T')[0]})\n`);
  for (const d of deals) {
    console.log(`  **${d.categoryLabel}**`);
    console.log(`  ${d.title}`);
    console.log(`  ${formatPrice({ price: d.price, currency: d.currency })} | 📍 ${d.ad.state || '?'} (${d.ad.distance}km)`);
    console.log(`  🔗 [${d.url}](${d.url})`);
    console.log();
  }

  return postToDiscord(deals);
}

/**
 * Print all deals to stdout (dry-run output).
 * @param {object[]} deals
 * @param {object}   visionResults - map of dealId → vision result string
 */
function printAllDeals(deals, visionResults = {}) {
  console.log('--- DEALS ---');
  for (const d of deals) {
    const vision = visionResults[d.id];
    console.log(
      `  [${d.categoryLabel}] ${d.title} — ` +
      `${formatPrice({ price: d.price, currency: d.currency })} | ` +
      `📍 ${d.ad.state || '?'} (${d.ad.distance}km)`,
    );
    const shortDesc = stripHtml(d.ad.description);
    if (shortDesc) console.log(`    📝 ${shortDesc}`);
    if (vision)    console.log(`    👁️  ${vision}`);
    console.log(`    ${d.url}`);
    if (d.thumbnail) console.log(`    🖼️  ${d.thumbnail}`);
    console.log();
  }
}

module.exports = { formatPrice, stripHtml, filterByVision, reportDeals, printAllDeals, postToDiscord };
