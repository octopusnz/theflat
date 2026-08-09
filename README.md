# theflat.gen.nz

Static site content for **theflat.gen.nz**, hosted on GitHub Pages.

## Credits

Octopus favicons based on icons created by [Freepik - Flaticon](https://www.flaticon.com/free-icons/octopus)

D&D 5e data provided by the [D&D 5e API](https://www.dnd5eapi.co/) ([5e-bits/5e-srd-api](https://github.com/5e-bits/5e-srd-api)), licensed under the [MIT License](https://github.com/5e-bits/5e-srd-api/blob/main/LICENSE.md).

This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at [D&D Beyond](https://dndbeyond.com/srd). The SRD 5.1 is licensed under the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/legalcode).

**Stars Without Number** was created by Kevin Crawford and published by [Sine Nomine Publishing](https://sine-nomine-publishing.myshopify.com/collections/stars-without-number). The `swn/` compendium's markdown is based on files from [Dark Star Adventures](https://dark-star-adventures.itch.io/stars-without-number-markdown-files), modified for this campaign; campaign source notes live at [github.com/octopusnz/swn](https://github.com/octopusnz/swn).

## Pages

- `index.html`: site homepage
- `rpg.html`: D&D 5e RPG Campaign Tracker
- `swn/index.html`: Stars Without Number campaign compendium — dashboard plus rendered campaign/rules notes
- `404.html`: not-found page

## Data

- `github-stats.json`: auto-generated GitHub statistics (updated by GitHub Actions)
- `rpg-data.json`: RPG campaign tracker state
- `darkstone.json`: Darkstone campaign data
- `inventory.json`: campaign inventory data
- `urls.json`: curated links data
- `data/`: cached D&D 5e API data (ability scores, classes, conditions, equipment, monsters, spells, etc.)
- `swn/content/`: campaign/compendium markdown synced from [octopusnz/swn](https://github.com/octopusnz/swn) as `pages.json` + `meta.json`, plus `Images/`. GM-only "Hooks & Secrets" and "GM Notes" sections are stripped during sync since this page is public. This is a **manual** sync (not part of the automated deploy workflow) — re-run `scripts/fetch-swn-data.sh` and commit the result to publish vault updates.

## GitHub Actions Workflows

- `.github/workflows/static.yml`: fetches D&D 5e API data, refreshes `github-stats.json`, then deploys the site to GitHub Pages — triggers on pushes to `main`, daily at 01:00 UTC, and manually via `workflow_dispatch`

## Scripts

- `scripts/fetch-dnd-data.sh`: fetch and cache D&D 5e API data locally
- `scripts/check-structure.sh`: diagnostic script to validate `rpg.html` structure
- `scripts/fetch-swn-data.sh`: clone the `octopusnz/swn` vault and rebuild `swn/content/` (manual — see Data above)
- `scripts/build_swn_manifest.py`: parses the vault's markdown/frontmatter into `swn/content/pages.json`, called by `fetch-swn-data.sh`

Image generation tooling (drafting/requesting portrait images via the Grok Imagine API and landing them in the vault) lives in `octopusnz/swn` itself, not here — see that repo's `scripts/` and README. This repo only picks up the result on the next `fetch-swn-data.sh` run.

## Static Assets

- `site.webmanifest`: installable PWA metadata
- `android-chrome-192x192.png` / `android-chrome-512x512.png`: PWA icons
- `apple-touch-icon.png`: iOS home screen icon
- `favicon-16x16.png` / `favicon-32x32.png` / `favicon-96x96.png` / `favicon.ico` / `favicon.svg`: favicons
- `map.jpg`: campaign map image
- `robots.txt`: crawler rules
- `sitemap.xml`: sitemap for search engines
- `humans.txt`: human-friendly site attribution/metadata
- `llms.txt`: guidance for LLM tooling
- `.well-known/security.txt`: security contact information
- `.nojekyll`: disables Jekyll processing on GitHub Pages
- `CNAME`: custom domain configuration
