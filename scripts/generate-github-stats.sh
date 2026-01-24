#!/bin/bash
# Local GitHub stats generator
# Usage: ./scripts/generate-github-stats.sh <github-username> <github-token>

set -e

USERNAME="${1:?GitHub username required}"
TOKEN="${2:?GitHub PAT token required}"

echo "Fetching GitHub stats for @$USERNAME..."

# Fetch user data
USER_DATA=$(curl -s -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/users/$USERNAME")

# Fetch repositories (excluding forks)
REPOS=$(curl -s -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/users/$USERNAME/repos?per_page=100&sort=updated" \
  | jq '[.[] | select(.fork == false)]')

# Calculate stats
TOTAL_REPOS=$(echo "$REPOS" | jq 'length')
TOTAL_WATCHERS=$(echo "$REPOS" | jq '[.[].watchers_count] | add // 0')
FOLLOWERS=$(echo "$USER_DATA" | jq '.followers')

# Fetch languages for each repo (limit to 30 repos to avoid rate limits)
echo "$REPOS" | jq -c '.[:30]' > repos_temp.json

LANGUAGE_STATS='{}'
while IFS= read -r repo; do
  REPO_NAME=$(echo "$repo" | jq -r '.name')
  echo "  Processing $REPO_NAME..."
  LANGUAGES=$(curl -s -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/$USERNAME/$REPO_NAME/languages")
  
  # Merge language stats
  LANGUAGE_STATS=$(echo "$LANGUAGE_STATS $LANGUAGES" | jq -s '
    reduce .[1] as $lang (.[0]; 
      reduce ($lang | keys_unsorted[]) as $key (.; 
        .[$key] = ((.[$key] // 0) + $lang[$key])
      )
    )
  ')
done < <(jq -c '.[]' repos_temp.json)

rm repos_temp.json

# Calculate total lines of code (approximate)
TOTAL_BYTES=$(echo "$LANGUAGE_STATS" | jq '[.[]] | add // 0')
TOTAL_LINES=$(echo "$TOTAL_BYTES / 50" | bc)

# Get top 5 repos by stars
TOP_REPOS=$(echo "$REPOS" | jq '[sort_by(-.stargazers_count) | .[:5] | .[] | {
  name: .name,
  description: .description,
  html_url: .html_url,
  stargazers_count: .stargazers_count
}]')

# Create final JSON
cat > github-stats.json << EOF
{
  "updated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "total_repos": $TOTAL_REPOS,
  "total_watchers": $TOTAL_WATCHERS,
  "total_lines": $TOTAL_LINES,
  "followers": $FOLLOWERS,
  "languages": $LANGUAGE_STATS,
  "top_repos": $TOP_REPOS
}
EOF

echo "✅ GitHub stats generated successfully!"
echo "📝 File: github-stats.json"
cat github-stats.json
