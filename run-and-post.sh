#!/bin/bash
# Runs deal-finder and posts a summary to Discord #claw channel.
# Set KLEINANZEIGEN_DISCORD_WEBHOOK to your Discord webhook URL.
# Without the env var, runs silently (good for testing).

set -e

CHANNEL_ID="1484275351390650451"
BOT_TOKEN="${DISCORD_BOT_TOKEN}"
WEBHOOK_URL="${KLEINANZEIGEN_DISCORD_WEBHOOK}"

cd /home/node/.openclaw/workspace/kleinanzeigen-scraper

LOG=$(mktemp)
trap "rm -f $LOG" EXIT

# Run deal-finder, capture all output
node deal-finder.js > "$LOG" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "[deal-finder] non-zero exit: $EXIT_CODE"
  cat "$LOG"
  exit $EXIT_CODE
fi

TOTAL=$(grep "^Total new deals:" "$LOG" | sed 's/Total new deals: //')
if [ -z "$TOTAL" ] || [ "$TOTAL" -eq 0 ]; then
  echo "[deal-finder] No new deals today."
  exit 0
fi

echo "[deal-finder] Found $TOTAL new deals."

# Post to Discord webhook if configured
if [ -n "$WEBHOOK_URL" ]; then
  # Build a compact deal list (first 10)
  DEALS=$(grep "^  DEAL:" "$LOG" | sed 's/^  DEAL: //' | head -10 | while read -r line; do
    echo "$line"
  done)

  # Escape deals for JSON (basic: escape quotes and backslashes)
  DEALS_ESCAPED=$(echo "$DEALS" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "")

  PAYLOAD=$(cat << PYEOF
{
  "content": "🛍️ **$TOTAL neue Deals in Aachen** ($(date '+%d.%m.%Y'))\n\n${DEALS_ESCAPED}"
}
PYEOF
)

  curl -s -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" > /dev/null
  echo "[deal-finder] Posted $TOTAL deals to Discord."
fi

exit 0
