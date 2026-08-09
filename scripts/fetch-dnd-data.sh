#!/bin/bash

# Fetch D&D 5e API data and cache it locally
# This script fetches all D&D 5e API endpoints and stores them as JSON files

BASE_URL="https://www.dnd5eapi.co/api/2014"
DATA_DIR="data"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

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
  
  # Use curl to fetch compact JSON
  if curl -s "$BASE_URL/$endpoint" | jq -c '.' > "$DATA_DIR/$endpoint.json" 2>/dev/null; then
    echo "Saved $endpoint.json"
  else
    echo "Failed to fetch $endpoint"
  fi
done

echo "Writing meta.json..."
ENTRY_COUNT=$(jq -s '[.[].count] | add' "$DATA_DIR"/*.json)
jq -n --arg synced_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --argjson entry_count "$ENTRY_COUNT" \
  '{synced_at: $synced_at, entry_count: $entry_count}' > "$DATA_DIR/meta.json"

echo "Done!"
