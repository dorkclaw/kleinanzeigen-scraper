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
    try {
      const res = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        console.log('[Discord] Posted "no deals" notification.');
        return true;
      } else {
        console.warn(`[Discord] Webhook returned ${res.status} ${res.statusText}`);
        return false;
      }
    } catch (err) {
      console.error('[Discord] Failed to post:', err.message);
      return false;
    }
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
  for (let i = 0; i < deals.length; i += CHUNK) {
    const chunk = deals.slice(i, i + CHUNK);
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
    try {
      const res = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn(`[Discord] Chunk ${i / CHUNK + 1} → webhook returned ${res.status}`);
      } else {
        console.log(`[Discord] Posted chunk ${i / CHUNK + 1} (${chunk.length} deals).`);
      }
    } catch (err) {
      console.error(`[Discord] Chunk ${i / CHUNK + 1} failed:`, err.message);
    }
    // Small delay between chunks to avoid rate limiting
    if (i + CHUNK < deals.length) await sleep(500);
  }
  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Stdout reporting ────────────────────────────────────────────────────────

/**
 * Print a list of deals to stdout.
 */
async function reportDeals(deals) {
  if (deals.length === 0) {
    console.log('No deals found.');
    await postToDiscord(deals); // still ping Discord so cron is alive
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

  await postToDiscord(deals);
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
