#!/bin/bash
# Fetch D&D 5e equipment data from the public API
# Usage: ./scripts/fetch-dnd5e-equipment.sh

set -e

API_URL="https://www.dnd5eapi.co/api/2014/equipment"
OUTPUT_FILE="equipment.json"

echo "Fetching D&D 5e equipment data from $API_URL..."

# Fetch equipment data
curl -s "$API_URL" | jq '.' > "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
    # Count items fetched
    ITEM_COUNT=$(jq '.results | length' "$OUTPUT_FILE" 2>/dev/null || echo "unknown")
    UPDATED_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    echo "Equipment data updated successfully!"
    echo "Items fetched: $ITEM_COUNT"
    echo "Saved to: $OUTPUT_FILE"
    
    # Add metadata
    temp_file=$(mktemp)
    jq --arg updated "$UPDATED_TIME" '.updated_at = $updated' "$OUTPUT_FILE" > "$temp_file"
    mv "$temp_file" "$OUTPUT_FILE"
    
    cat "$OUTPUT_FILE" | jq '.results | length, .[:3] | .' 2>/dev/null | head -20
else
    echo "Error fetching equipment data"
    exit 1
fi
