#!/bin/bash

# Fetch the octopusnz/swn Obsidian vault (Stars Without Number campaign notes)
# and build the local content bundle served by swn/index.html.
#
# This is a MANUAL sync, run locally whenever the campaign vault changes —
# it is not wired into the automated deploy workflow. Re-run and commit the
# result to publish updates.

set -euo pipefail

SOURCE_REPO="https://github.com/octopusnz/swn.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/swn/content"
CLONE_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$CLONE_DIR"
}
trap cleanup EXIT

echo "Cloning $SOURCE_REPO..."
git clone --depth 1 --quiet "$SOURCE_REPO" "$CLONE_DIR"

echo "Building swn content manifest..."
python3 "$SCRIPT_DIR/build_swn_manifest.py" "$CLONE_DIR" "$OUTPUT_DIR"

echo "Done! Review changes under swn/content/ and commit them to publish."
