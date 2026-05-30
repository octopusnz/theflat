# theflat.gen.nz

Static site content for **theflat.gen.nz**, hosted on GitHub Pages.

## Pages

- `index.html`: site homepage
- `rpg.html`: D&D 5e RPG Campaign Tracker
- `404.html`: not-found page

## Data

- `github-stats.json`: auto-generated GitHub statistics (updated by GitHub Actions)
- `rpg-data.json`: RPG campaign tracker state
- `darkstone.json`: Darkstone campaign data
- `inventory.json`: campaign inventory data
- `urls.json`: curated links data
- `data/`: cached D&D 5e API data (ability scores, classes, conditions, equipment, monsters, spells, etc.)

## GitHub Actions Workflows

- `.github/workflows/update-github-stats.yml`: fetches GitHub user/repo stats and commits `github-stats.json` — runs daily at 01:00 UTC and on pushes to `main` that touch the workflow file
- `.github/workflows/fetch-dnd-data.yml`: fetches and caches D&D 5e API data into `data/` — runs daily at 00:00 UTC
- `.github/workflows/static.yml`: deploys the site to GitHub Pages — triggers on pushes to `main` and when either data workflow completes successfully

## Scripts

- `scripts/generate-github-stats.sh`: generate `github-stats.json` locally (useful for testing)
- `scripts/fetch-dnd-data.sh`: fetch and cache D&D 5e API data locally
- `scripts/check-structure.sh`: diagnostic script to validate `rpg.html` structure

## Static Assets

- `site.webmanifest`: installable PWA metadata
- `android-chrome-192x192.png` / `android-chrome-512x512.png`: PWA icons
- `apple-touch-icon.png`: iOS home screen icon
- `favicon-16x16.png` / `favicon-32x32.png` / `favicon-96x96.png` / `favicon.ico` / `favicon.svg`: favicons
- `map.png`: campaign map image
- `robots.txt`: crawler rules
- `sitemap.xml`: sitemap for search engines
- `humans.txt`: human-friendly site attribution/metadata
- `llms.txt`: guidance for LLM tooling
- `.well-known/security.txt`: security contact information
- `.nojekyll`: disables Jekyll processing on GitHub Pages
- `CNAME`: custom domain configuration

## Credits

Octopus favicons based on icons created by [Freepik - Flaticon](https://www.flaticon.com/free-icons/octopus)
