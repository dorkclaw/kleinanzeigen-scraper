# Kleinanzeigen Scraper

Search Kleinanzeigen.de (eBay Kleinanzeigen) via their internal API using Node.js.

## What it does

- Searches for items on Kleinanzeigen.de within a given location
- Filters by max price and distance
- Extracts title, price, location, distance, and public URL

## Usage

```bash
node api_scraper.js
```

Edit the `search()` call in `main()` to change query, location, max price, or max distance.

## API Details

- **Base URL**: `https://api.kleinanzeigen.de/api`
- **Auth**: Basic auth with `android:TAR60pEtY` (公开凭证)
- **Location**: Aachen = `locationId: 1921`
- **Rate limit**: Unknown — seems limited after a few rapid requests

## Search Parameters

- `q` — search query
- `locationId` — location ID (1921 = Aachen)
- `size` — number of results (max 50?)
