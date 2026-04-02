/**
 * Seen-ads tracking — persists IDs + timestamps to a JSON file.
 */
const fs = require('fs');
const path = require('path');

const SEEN_FILE = path.join(__dirname, '..', 'seen-ads.json');

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

function markSeen(seenIds) {
  const seen = loadSeenAds();
  const now = new Date().toISOString();
  for (const id of seenIds) {
    seen[id] = now;
  }
  saveSeenAds(seen);
}

function clearSeen() {
  fs.writeFileSync(SEEN_FILE, JSON.stringify({}));
}

module.exports = { loadSeenAds, saveSeenAds, loadSeenIds, markSeen, clearSeen, SEEN_FILE };
