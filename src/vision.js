/**
 * Vision image analysis via OpenRouter Gemini Vision.
 * Runs in parallel, returns map of dealId → vision description.
 */
const { spawn } = require('child_process');
const path = require('path');

const ANALYZE_IMAGE_SCRIPT = path.join(__dirname, '..', 'analyze_image.py');

/**
 * Analyze images for a batch of deals in parallel.
 * @param {object[]} deals - Deals with xxlImage urls
 * @returns {Promise<object>} map of dealId → vision result string
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
    new Promise(resolve => {
      const price = deal.price;
      const isBike = deal.categoryLabel.toLowerCase().includes('fahrrad');
      const isVR = deal.categoryLabel.includes('VR') ||
        deal.categoryLabel.includes('Valve Index') ||
        deal.categoryLabel.includes('Bigscreen');
      const isRacing = deal.categoryLabel.includes('Racing');

      const priceContext = isBike
        ? 'Typical German used bike prices: city/trekking €100-300, MTB €150-500, road €200-800, fixies €50-150.'
        : isVR
        ? 'Typical VR resale Germany: Meta Quest 2/3 €100-300, Valve Index €400-600, Bigscreen Beyond €300-500, PSVR2 €200-350.'
        : isRacing
        ? 'Typical racing wheel resale: Logitech G29/G923 €100-200, Thrustmaster T300 €150-250, Fanatec €200-500, standalone wheels €30-100.'
        : 'Typical German resale: monitors €30-150, keyboards/mice €10-40, headsets €20-80, tablets €50-200, PC components €20-100.';

      const prompt = [
        'Format: "PHOTO | SCORE/10 | reason" — max 200 chars.',
        `Score 10 = impossibly cheap, 7-9 = great deal, 4-6 = fair, 1-3 = overpriced.`,
        `1) Real photo or stock? 2) ${isBike ? 'Bike type/brand?' : 'Product type?'} 3) ${priceContext} At €${price}, what's the score?`,
      ].join('\n');

      const python = spawn('python3', [ANALYZE_IMAGE_SCRIPT, deal.xxlImage, prompt], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      python.stdout.on('data', d => (stdout += d.toString()));
      python.stderr.on('data', d => (stderr += d.toString()));

      python.on('close', code => {
        if (code === 0 && stdout.trim()) {
          results[deal.id] = stdout.trim();
        } else {
          console.error(`  Vision error for ${deal.id}: ${stderr || `exit ${code}`}`);
        }
        resolve();
      });

      python.on('error', err => {
        console.error(`  Failed to spawn python for ${deal.id}: ${err.message}`);
        resolve();
      });

      // 25s timeout per image
      setTimeout(() => {
        python.kill();
        resolve();
      }, 25000);
    })
  );

  await Promise.all(promises);
  return results;
}

module.exports = { runVisionAnalysis };
