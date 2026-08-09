#!/usr/bin/env python3
"""
Build swn/content/pages.json (+ meta.json) from a checkout of the octopusnz/swn
Obsidian vault.

Usage: build_swn_manifest.py <path-to-swn-checkout> <path-to-swn-content-output-dir>

- Parses YAML frontmatter on every Markdown file.
- Strips "Hooks & Secrets" and "GM Notes" sections from the body — that
  content is GM-only spoiler material and this manifest feeds a public page.
- Excludes .obsidian/, the rulebook PDF/TXT, and non-content files.
- Records the last git commit date per file for a "recently edited" list.
- Re-encodes every image for the web (resolution cap, recompression,
  metadata stripped) and generates a small thumbnail alongside it. Requires
  Pillow (`pip install Pillow`), same as PyYAML is already required above.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml
from PIL import Image, ImageOps

EXCLUDED_DIR_PARTS = {".obsidian", ".git"}
# Not campaign content: Dashboard.md is an Obsidian dataviewjs script (the
# site builds its own dashboard from this manifest instead of rendering it),
# and README.md is vault/plugin credits, reused as static text in the footer.
EXCLUDED_ROOT_FILES = {"Dashboard.md", "README.md"}
GM_ONLY_HEADINGS = {"hooks & secrets", "gm notes"}
FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*$")

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
IMAGE_MAX_DIMENSION = 1600
IMAGE_JPEG_QUALITY = 82
THUMB_SIZE = 96
THUMB_JPEG_QUALITY = 75
THUMB_BG = (15, 23, 42)  # matches swn/index.html's dark --card-bg


def strip_gm_sections(body: str) -> str:
    lines = body.split("\n")
    out = []
    skipping = False
    skip_level = 0
    for line in lines:
        m = HEADING_RE.match(line)
        if m:
            level = len(m.group(1))
            title = m.group(2).strip().lower()
            if skipping and level <= skip_level:
                skipping = False
            if not skipping and title in GM_ONLY_HEADINGS:
                skipping = True
                skip_level = level
                continue
        if skipping:
            continue
        out.append(line)
    return "\n".join(out).strip()


def strip_leading_title(body: str) -> str:
    """Drop a leading level-1 heading — the page template restates the
    filename as an H1, and the client renders its own canonical title."""
    stripped = body.lstrip("\n")
    lines = stripped.split("\n", 1)
    if not lines:
        return body
    m = HEADING_RE.match(lines[0])
    if m and m.group(1) == "#":
        return lines[1].lstrip("\n") if len(lines) > 1 else ""
    return body


IMAGE_EMBED_RE = re.compile(r"^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$")


def strip_leading_image(body: str, image_field) -> str:
    """Drop a leading image embed that duplicates the frontmatter `image`
    property — this vault's character/place templates embed the portrait
    inline as the first line of the body *and* set it as a queryable
    property; the client renders its own hero image from the property, so
    the inline copy would otherwise show the same photo twice."""
    if not isinstance(image_field, str) or not image_field.strip():
        return body
    target = image_field.strip().split("/")[-1].lower()
    stripped = body.lstrip("\n")
    lines = stripped.split("\n", 1)
    if not lines:
        return body
    m = IMAGE_EMBED_RE.match(lines[0].strip())
    if not m or m.group(1).strip().split("/")[-1].lower() != target:
        return body
    return lines[1].lstrip("\n") if len(lines) > 1 else ""


def _has_visible_alpha(img: Image.Image) -> bool:
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        alpha = img.convert("RGBA").getchannel("A")
        return alpha.getextrema()[0] < 255
    return False


def _flatten_rgb(img: Image.Image, bg=THUMB_BG) -> Image.Image:
    """Composite any transparency onto a flat background instead of just
    discarding the alpha channel, which can leave garbage color data
    behind in fully-transparent regions of some PNGs."""
    if img.mode not in ("RGB", "L"):
        rgba = img.convert("RGBA")
        flat = Image.new("RGB", rgba.size, bg)
        flat.paste(rgba, mask=rgba.getchannel("A"))
        return flat
    return img.convert("RGB")


def optimize_image(src: Path, images_out: Path, thumbs_out: Path) -> str:
    """Re-encode one vault image for the web: cap resolution, strip
    embedded metadata (Pillow drops EXIF unless it's explicitly
    re-attached), and convert opaque images to JPEG regardless of source
    format — PNG is a poor fit for the photographic images this vault
    uses, and every synced image so far is a photo, not a diagram. Images
    with real transparency stay PNG. Also writes a small square thumbnail
    used for inline "linked from"-style avatars.

    Returns the filename actually written under images_out — this can
    differ from src.name when the format changes (e.g. "world.png" ->
    "world.jpg"), so callers need to reconcile any stored references.
    """
    with Image.open(src) as im:
        im.load()
        full = im.copy()
        full.thumbnail((IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION), Image.LANCZOS)

        if _has_visible_alpha(im):
            dest_name = src.stem + ".png"
            full.save(images_out / dest_name, format="PNG", optimize=True)
        else:
            dest_name = src.stem + ".jpg"
            _flatten_rgb(full).save(
                images_out / dest_name, format="JPEG",
                quality=IMAGE_JPEG_QUALITY, optimize=True, progressive=True,
            )

        thumb = ImageOps.fit(_flatten_rgb(im), (THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
        thumb.save(
            thumbs_out / (src.stem + ".jpg"), format="JPEG",
            quality=THUMB_JPEG_QUALITY, optimize=True,
        )

    return dest_name


def parse_file(repo: Path, rel_path: Path, mtimes: dict) -> dict:
    text = rel_path_read(repo / rel_path)
    fm_match = FRONTMATTER_RE.match(text)
    frontmatter = {}
    body = text
    if fm_match:
        raw_fm = fm_match.group(1)
        body = text[fm_match.end():]
        try:
            loaded = yaml.safe_load(raw_fm)
            if isinstance(loaded, dict):
                frontmatter = loaded
        except yaml.YAMLError as exc:
            print(f"warning: failed to parse frontmatter in {rel_path}: {exc}", file=sys.stderr)

    name = rel_path.stem
    body = strip_gm_sections(body)
    body = strip_leading_title(body)
    body = strip_leading_image(body, frontmatter.get("image"))

    parts = rel_path.parts
    folder = parts[0]
    if folder == "Compendium" and len(parts) > 2:
        category = f"Compendium/{parts[1]}"
    elif folder == "Compendium":
        category = "Compendium"
    else:
        category = folder

    posix_path = rel_path.as_posix()
    return {
        "id": posix_path[:-3] if posix_path.endswith(".md") else posix_path,
        "path": posix_path,
        "name": name,
        "folder": folder,
        "category": category,
        "frontmatter": frontmatter,
        "body": body,
        "mtime": mtimes.get(posix_path),
    }


def rel_path_read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def build_mtimes(repo: Path) -> dict:
    """Last commit date per tracked file path, newest-first log so the
    first time we see a path is its most recent commit."""
    result = subprocess.run(
        ["git", "-c", "core.quotepath=false", "-C", str(repo), "log",
         "--name-only", "--pretty=format:\x01%cI"],
        capture_output=True, text=True, check=True,
    )
    mtimes: dict[str, str] = {}
    current_date = None
    for line in result.stdout.split("\n"):
        if line.startswith("\x01"):
            current_date = line[1:]
        elif line.strip():
            mtimes.setdefault(line.strip(), current_date)
    return mtimes


def head_sha(repo: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def main():
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(1)

    repo = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    mtimes = build_mtimes(repo)

    pages = []
    for md_path in sorted(repo.rglob("*.md")):
        rel = md_path.relative_to(repo)
        if EXCLUDED_DIR_PARTS & set(rel.parts[:-1]):
            continue
        if len(rel.parts) == 1 and rel.name in EXCLUDED_ROOT_FILES:
            continue
        pages.append(parse_file(repo, rel, mtimes))

    pages.sort(key=lambda p: p["path"].lower())

    images_src = repo / "Images"
    images_out = out_dir / "Images"
    images_out.mkdir(parents=True, exist_ok=True)
    thumbs_out = images_out / "thumb"
    thumbs_out.mkdir(parents=True, exist_ok=True)

    image_count = 0
    renamed = {}  # original filename -> optimized filename, only when the format changed
    if images_src.is_dir():
        for img in sorted(images_src.iterdir()):
            if not img.is_file() or img.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            try:
                final_name = optimize_image(img, images_out, thumbs_out)
            except Exception as exc:
                print(f"warning: failed to optimize image {img.name}: {exc}", file=sys.stderr)
                continue
            if final_name != img.name:
                renamed[img.name] = final_name
                stale = images_out / img.name
                if stale.exists():
                    stale.unlink()  # leftover from a previous sync, in the old format
            image_count += 1

    if renamed:
        for page in pages:
            image_field = page["frontmatter"].get("image")
            if not isinstance(image_field, str):
                continue
            base = image_field.split("/")[-1]
            if base in renamed:
                page["frontmatter"]["image"] = f"Images/{renamed[base]}"

    (out_dir / "pages.json").write_text(
        json.dumps(pages, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    from datetime import datetime, timezone

    meta = {
        "source_repo": "https://github.com/octopusnz/swn",
        "source_commit": head_sha(repo),
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "page_count": len(pages),
        "image_count": image_count,
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(f"Wrote {len(pages)} pages and {image_count} images to {out_dir}")


if __name__ == "__main__":
    main()
