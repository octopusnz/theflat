#!/bin/bash

# Fetch D&D 5e API data and cache it locally
# This script fetches all D&D 5e API endpoints and stores them as JSON files
#
# The deploy workflow runs this before publishing, so a partial or empty result
# here would ship broken data to the live site. Every endpoint is fetched to a
# temp file and validated as JSON before it is allowed to replace the cached
# copy, and any failure aborts the whole run.

set -euo pipefail

BASE_URL="https://www.dnd5eapi.co/api/2014"
DATA_DIR="data"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Define all endpoints to fetch
declare -a ENDPOINTS=(
  "ability-scores"
  "classes"
  "conditions"
  "damage-types"
  "equipment-categories"
  "equipment"
  "features"
  "languages"
  "magic-schools"
  "monsters"
  "proficiencies"
  "races"
  "skills"
  "spells"
  "subclasses"
  "subraces"
  "traits"
  "weapon-properties"
)

echo "Fetching D&D 5e API data..."

# Fetch each endpoint
for endpoint in "${ENDPOINTS[@]}"; do
  echo "Fetching $endpoint..."

  raw="$TMP_DIR/$endpoint.raw"

  # --fail turns a 4xx/5xx into a non-zero exit instead of saving the error body.
  if ! curl --fail --retry 3 --retry-delay 2 --max-time 60 -sS \
       "$BASE_URL/$endpoint" -o "$raw"; then
    echo "Failed to fetch $endpoint" >&2
    exit 1
  fi

  # An empty or malformed body would otherwise be written out as a zero-byte
  # file that still passes response.ok in the browser.
  if ! jq -e 'has("count") and has("results")' "$raw" >/dev/null 2>&1; then
    echo "Unexpected response for $endpoint (not a JSON index document)" >&2
    exit 1
  fi

  jq -c '.' "$raw" > "$DATA_DIR/$endpoint.json"
  echo "Saved $endpoint.json ($(jq -r '.count' "$raw") entries)"
done

echo "Writing meta.json..."
# Sum only the endpoint files. Globbing $DATA_DIR would also pick up meta.json
# itself on a re-run.
ENTRY_COUNT=$(for endpoint in "${ENDPOINTS[@]}"; do
  jq '.count' "$DATA_DIR/$endpoint.json"
done | jq -s 'add')

jq -n --arg synced_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --argjson entry_count "$ENTRY_COUNT" \
  '{synced_at: $synced_at, entry_count: $entry_count}' > "$DATA_DIR/meta.json"

echo "Done! $ENTRY_COUNT entries across ${#ENDPOINTS[@]} endpoints."
