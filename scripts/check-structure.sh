#!/bin/bash
# Quick diagnostic script to check for the HTML structure issue
# that causes content to render halfway down the page

echo "🔍 Checking RPG Campaign Tracker HTML Structure..."
echo ""

if [ ! -f "rpg.html" ]; then
    echo "❌ rpg.html not found in current directory"
    exit 1
fi

echo "📋 Checking for orphaned closing tags..."
# Look for any </div> that might be orphaned near the map container
orphaned_divs=$(sed -n '1790,1810p' rpg.html | grep -n "^[[:space:]]*</div>" | wc -l)
echo "   Found $orphaned_divs closing divs in critical section (should be expected closes)"

echo ""
echo "🏗️  Tracing main container structure..."
main_opens=$(grep -c '<main class="map-container"' rpg.html)
main_closes=$(grep -c '</main>' rpg.html)
echo "   <main> opens: $main_opens"
echo "   </main> closes: $main_closes"

if [ "$main_opens" -ne "$main_closes" ]; then
    echo "   ⚠️  WARNING: Mismatched main tags!"
fi

echo ""
echo "🎯 Checking page element structure..."
search_page=$(grep -c 'id="search-page"' rpg.html)
inventory_page=$(grep -c 'id="inventory-page"' rpg.html)
echo "   Search page elements: $search_page"
echo "   Inventory page elements: $inventory_page"

echo ""
echo "✅ HTML structure check complete"
echo ""
echo "💡 For detailed troubleshooting, see TROUBLESHOOTING.md"
