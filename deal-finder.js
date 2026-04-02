#!/usr/bin/env node
/**
 * Kleinanzeigen Deal Finder — daily deal notifier.
 *
 * Usage:
 *   node deal-finder.js                  # normal run (fetch + report new deals)
 *   node deal-finder.js --dryRun=true    # show what would be reported without Discord
 *   node deal-finder.js --categories     # list configured categories and exit
 *   node deal-finder.js --reset-seen     # clear seen-ads log (start fresh)
 */
const { getCategories } = require('./src/categories');
const { fetchCategory } = require('./src/fetch');
const { runVisionAnalysis } = require('./src/vision');
const { reportDeals, printAllDeals, filterByVision } = require('./src/format');
const { loadSeenIds, markSeen, clearSeen } = require('./src/seen');
const { sleep } = require('./src/api');
const { LOCATION_ID } = require('./src/constants');

async function main() {
  // ─── CLI args ──────────────────────────────────────────────────────────────
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dryRun=true');
  const resetSeen = args.includes('--reset-seen');
  const doAnalyzeImages = args.includes('--analyze-images');
  const categories = getCategories();

  if (args.includes('--categories')) {
    console.log('Configured categories:');
    for (const c of categories) {
      console.log(`  ${c.label}: "${c.query}" (max €${c.maxPrice})`);
    }
    return;
  }

  if (resetSeen) {
    clearSeen();
    console.log('Seen-ads log cleared.');
    return;
  }

  // ─── Banner ───────────────────────────────────────────────────────────────
  console.log('=== Kleinanzeigen Deal Finder ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Analyze images: ${doAnalyzeImages}`);
  console.log(`Location: Aachen (${LOCATION_ID})`);
  console.log();

  // ─── Load state ───────────────────────────────────────────────────────────
  const seenIds = loadSeenIds();
  console.log(`Already seen: ${seenIds.size} ads`);
  console.log();

  // ─── Fetch all categories ─────────────────────────────────────────────────
  const allDeals = [];
  const allSeenThisRun = new Set();

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    process.stdout.write(`[${i + 1}/${categories.length}] ${cat.label}...`);

    const { deals, seenThisRun } = await fetchCategory(cat, seenIds);

    for (const id of seenThisRun) allSeenThisRun.add(id);
    allDeals.push(...deals);

    if (deals.length > 0) {
      console.log(` ${deals.length} deals found!`);
    } else {
      console.log(' none');
    }
    await sleep(2000);
  }

  console.log();
  console.log(`Total new deals: ${allDeals.length}`);

  if (allDeals.length === 0) {
    console.log('Nothing new. Exiting.');
    return;
  }

  // ─── Vision analysis (optional) ───────────────────────────────────────────
  let visionResults = {};
  if (doAnalyzeImages) {
    console.log();
    visionResults = await runVisionAnalysis(allDeals);
  }

  // ─── Print all deals ──────────────────────────────────────────────────────
  console.log();
  printAllDeals(allDeals, visionResults);

  if (dryRun) {
    console.log('[Dry run — not updating seen log or sending Discord]');
    return;
  }

  // ─── Persist seen ads ─────────────────────────────────────────────────────
  markSeen(allSeenThisRun);

  // ─── Filter & report ───────────────────────────────────────────────────────
  const filteredDeals = filterByVision(allDeals, visionResults, doAnalyzeImages, /* minScore */ 8);
  await reportDeals(filteredDeals);
}

main().catch(console.error);
