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
Check the `api_scraper.js` for known IDs or inspect network requests on the site.

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

## Data

The API is an undocumented Kleinanzeigen endpoint. Auth header is pre-shared.
Rate limits are unknown — add delays between pages if crawling large result sets.
