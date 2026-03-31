# Kleinanzeigen Scraper

Crawls Kleinanzeigen.de search results and saves each ad as a JSON file.

**No external dependencies** — uses only Node.js built-in `https` and `fs`.

## Setup

```bash
git clone https://github.com/dorkclaw/kleinanzeigen-scraper.git
cd kleinanzeigen-scraper
# No npm install needed — pure Node.js
```

## Usage

```bash
node scraper.js --query=fahrrad --locationId=1921 --maxPrice=100 --maxDistance=10 --maxPages=10
```

### CLI Arguments

| Flag | Description | Default |
|------|-------------|---------|
| `--query` | Search term | `fahrrad` |
| `--locationId` | Location ID (1921 = Aachen) | `1921` |
| `--maxPrice` | Max price in € | none |
| `--maxDistance` | Max distance in km | none |
| `--maxPages` | Max pages to crawl | `10` |
| `--stopAdId` | Stop at this ad ID (for resumable crawls) | auto from `state.json` |
| `--dryRun=true` | Show what would be saved without writing files | `false` |
| `--dumpState=true` | Print current state and exit | `false` |

### Finding Location IDs

Use the website URL: `https://www.kleinanzeigen.de/s-region-aachen/k0` → location code `an1921` → ID `1921`.
Check `scraper.js` for known IDs or inspect network requests on the site.

### Examples

```bash
# First crawl — saves all found ads
node scraper.js --query=fahrrad --locationId=1921 --maxPrice=100 --maxDistance=10 --maxPages=10

# Second+ crawl — auto-stops at last crawl's newest ad (from state.json)
node scraper.js --query=fahrrad --locationId=1921 --maxPrice=100 --maxDistance=10 --maxPages=10

# Dry run — see what would be fetched without saving
node scraper.js --dryRun=true --query=kinderfahrrad --locationId=1921 --maxPages=3

# Check current state
node scraper.js --dumpState=true

# Manual stop at specific ad
node scraper.js --stopAdId=3368991620 --query=fahrrad --locationId=1921
```

## Output

### Per-Ad JSON Files (`ads/{id}.json`)

Each ad is saved with:

- `id` — Kleinanzeigen ad ID
- `title` — listing title
- `price` / `priceType` / `currency`
- `description` — HTML description
- `location` / `zipCode` / `state`
- `latitude` / `longitude`
- `distance` — km from search center
- `url` — public listing URL
- `pictures[]` — array of picture objects, each with `thumbnail`, `large`, `extraLarge`, `xxl` URLs
- `category[]` — breadcrumb path (e.g. `["Fahrräder & Zubehör"]`)
- `categoryId`
- `attributes{}` — key-value pairs (condition, type, size, etc.)
- `labels[]`
- `adType` / `posterType` / `sellerType`
- `adStatus`
- `startDate` / `lastEditDate`
- `buyNow`
- `shippingOptions[]`

### State File (`state.json`)

Tracks:
- `lastAdId` — most recent ad ID from last crawl (used for resumable crawling)
- `lastRun` — ISO timestamp
- `query` / `locationId` / `maxPrice` / `maxDistance`
- `totalSaved` / `totalSeen`

## API Notes

- **No query = 500 error** — the `q` parameter is required
- **Rate limits unknown** — add delays between pages if crawling large result sets
- **JAXB response format** — every level has `{value: ...}` wrapping; only ONE `.value` in chain
- **Distance is a string** — `ad-address.radius` returns `"1.07"` (string), compare with `parseFloat()`
- **Picture links** — each picture has multiple link rels: `thumbnail`, `large`, `extraLarge`, `XXL`
- **Category** — only leaf category is returned, not the full breadcrumb path in the API response

---

## Deal Finder (`deal-finder.js`)

Periodically searches Kleinanzeigen for genuine deals and reports findings to Discord.

### How It Works

- Searches **10 core categories** (alternating A/B groups each day)
- Skips ads with: "Suche" (wanted), defect keywords, "Preis auf Anfrage", component-only items
- Tracks seen ads in `seen-ads.json` to avoid reporting duplicates
- Sends Discord embeds with thumbnails (max 10 per message, chunks automatically)

### Categories (Group A — odd days)

| Category | Label | Max Price | Notes |
|----------|-------|-----------|-------|
| kinderfahrrad | 🚴 Kinderfahrrad | €100 | Woom, Puky, etc. |
| kinderwagen | 👶 Kinderwagen | €80 | Bugaboo, Joolz, etc. |
| fahrrad | 🚴 Fahrrad | €150 | Any bike |
| werkzeug | 🔧 Werkzeug | €80 | Any tool |
| schreibtisch ikea | 🪑 Schreibtisch | €60 | IKEA only |

### Categories (Group B — even days)

| Category | Label | Max Price | Notes |
|----------|-------|-----------|-------|
| kindersitz | 🧸 Kindersitz | €80 | Maxi-Cosi, Cybex |
| couch sofa | 🛋️ Sofa/Couch | €100 | Any sofa |
| staubsauger dyson | 🧹 Staubsauger | €80 | Dyson, Miele, Kärcher |
| playstation 4 | 🎮 PS4/PS5 | €120 | Sony consoles |
| laptop | 💻 Laptops | €200 | Any laptop |

### Setup

```bash
# Set Discord webhook (from Discord channel settings > Integrations > Webhooks)
export KLEINANZEIGEN_DISCORD_WEBHOOK="https://discord.com/api/webhooks/..."

# Dry run (no Discord, no seen-ads update)
node deal-finder.js --dryRun=true

# Normal run
node deal-finder.js

# Reset seen-ads log (start fresh, will report everything again)
node deal-finder.js --reset-seen
```

### Cron Job

Run twice daily at 9 AM and 6 PM Berlin time:

```json
{
  "name": "kleinanzeigen-deals",
  "schedule": {
    "kind": "cron",
    "expr": "0 9,18 * * *",
    "tz": "Europe/Berlin"
  },
  "payload": { "kind": "agentTurn", "message": "Run: cd /home/node/.openclaw/workspace/kleinanzeigen-scraper && node deal-finder.js" },
  "sessionTarget": "isolated",
  "delivery": { "mode": "announce", "channel": "claw" }
}
```

### Rate Limiting

The Kleinanzeigen API rate-limits after ~3-5 requests.
The script handles 429s with a 10-second retry (up to 3 attempts).
If all retries fail, the category is skipped silently.
Run with `--dryRun=true` first to test without side effects.

### Files

- `deal-finder.js` — main script
- `seen-ads.json` — tracks reported ad IDs (excluded from git)
- `ads/` — per-ad JSON files from scraper (excluded from git)
