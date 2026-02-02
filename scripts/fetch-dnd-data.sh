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
  
  # Use curl to fetch and pretty-print JSON
  if curl -s "$BASE_URL/$endpoint" | jq '.' > "$DATA_DIR/$endpoint.json" 2>/dev/null; then
    echo "✓ Saved $endpoint.json"
  else
    echo "✗ Failed to fetch $endpoint"
  fi
done

echo "Done!"
