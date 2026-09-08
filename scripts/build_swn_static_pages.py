#!/usr/bin/env python3
"""
Generate real, crawlable static HTML pages for the campaign-specific SWN
compendium entries (Sectors, Systems, Worlds, NPCs, Ships, Vehicles,
Factions), plus a matching sitemap.xml.

Why: swn/app.js renders the whole compendium as a single-page app at
https://theflat.gen.nz/swn/, with every entry reachable only via a
"#/page/..." hash fragment. Search engines don't index content that's only
reachable through a URL fragment, so none of the ~40 pages of unique
campaign lore (as opposed to the ~500 generic SWN SRD rules-reference
entries, which are intentionally left out of this) were ever indexable —
only the single dashboard URL was. This script reads the same
swn/content/pages.json + swn/content/bodies/*.md that app.js fetches at
runtime and pre-renders one real, path-based HTML page per campaign entry
(e.g. swn/Factions/Some Faction/index.html), so Google can crawl and index
them directly, without executing any JS.

Run after swn/content/ has been synced (scripts/fetch-swn-data.sh) and
before deploying — see .github/workflows/static.yml, which runs this on
every deploy since it only reads files already committed to the repo.

Usage: build_swn_static_pages.py [repo_root]  (defaults to CWD)
"""
import html
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote

import markdown

SITE_ORIGIN = "https://theflat.gen.nz"
SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"

# Mirrors swn/app.js — keep these in sync if the app's own constants change.
CAMPAIGN_FOLDERS = ["Sectors", "Systems", "Worlds", "NPCs", "Ships", "Vehicles", "Factions"]
FOLDER_SINGULAR = {
    "Sectors": "Sector", "Systems": "System", "Worlds": "World", "NPCs": "NPC",
    "Ships": "Ship", "Vehicles": "Vehicle", "Factions": "Faction",
}
CATEGORY_ACCENT = {
    "Sectors": "#38bdf8", "Systems": "#38bdf8", "Worlds": "#4ade80",
    "Factions": "#f472b6", "NPCs": "#c084fc", "Ships": "#60a5fa", "Vehicles": "#60a5fa",
}
STAT_FIELDS = [
    ("hit_dice", "HD"), ("ac", "AC"), ("attack_bonus", "Attack"),
    ("saves", "Saves"), ("morale", "Morale"), ("skill_bonus", "Skill Bonus"),
    ("speed", "Speed"),
]

DEFAULT_OG_IMAGE = f"{SITE_ORIGIN}/apple-touch-icon.png"

HEAD_ICONS = """\t\t<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
\t\t<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
\t\t<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
\t\t<link rel="icon" href="/favicon-96x96.png" type="image/png" sizes="96x96">
\t\t<link rel="icon" href="/favicon.svg" type="image/svg+xml">
\t\t<link rel="manifest" href="/site.webmanifest">
\t\t<link rel="stylesheet" href="/shared.css">
\t\t<link rel="stylesheet" href="/swn/swn.css">"""

CSP = ("default-src 'self'; base-uri 'self'; form-action 'self'; "
       "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com; "
       "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://cloudflareinsights.com https://static.cloudflareinsights.com; "
       "img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; frame-src https://www.googletagmanager.com;")

GTM_HEAD = """\t\t<!-- Google Tag Manager -->
\t\t<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
\t\tnew Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
\t\tj=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
\t\t'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
\t\t})(window,document,'script','dataLayer','GTM-W8RGXCTR');</script>
\t\t<!-- End Google Tag Manager -->

\t\t<link rel="preconnect" href="https://www.googletagmanager.com">
\t\t<link rel="preconnect" href="https://www.google-analytics.com">
\t\t<link rel="dns-prefetch" href="https://www.googletagmanager.com">
\t\t<link rel="dns-prefetch" href="https://www.google-analytics.com">"""

GTM_NOSCRIPT = ('\t\t<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-W8RGXCTR"\n'
                '\t\theight="0" width="0" title="Google Tag Manager" style="display:none;visibility:hidden"></iframe></noscript>')

THEME_FLASH_SCRIPT = """\t\t<script>
\t\t\t// Apply theme BEFORE page render to prevent flash
\t\t\t(function() {
\t\t\t\tconst savedTheme = localStorage.getItem('theme');
\t\t\t\tif (savedTheme === 'light') {
\t\t\t\t\tdocument.documentElement.classList.add('theme-light');
\t\t\t\t}
\t\t\t})();
\t\t</script>"""

THEME_TOGGLE_SCRIPT = """\t\t<script>
\t\t\tconst themeToggle = document.getElementById('theme-toggle');
\t\t\tconst themeLabel = document.getElementById('theme-label');
\t\t\tconst htmlEl = document.documentElement;

\t\t\tfunction updateThemeLabel(theme) {
\t\t\t\tthemeLabel.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
\t\t\t}

\t\t\tconst savedTheme = localStorage.getItem('theme');
\t\t\tupdateThemeLabel(savedTheme === 'light' ? 'light' : 'dark');

\t\t\tthemeToggle.addEventListener('click', function () {
\t\t\t\tconst isLight = htmlEl.classList.toggle('theme-light');
\t\t\t\tconst theme = isLight ? 'light' : 'dark';
\t\t\t\ttry { localStorage.setItem('theme', theme); } catch (e) {}
\t\t\t\tupdateThemeLabel(theme);
\t\t\t});
\t\t</script>"""

FOOTER = """\t\t<footer id="site-footer">
\t\t\t<p>
\t\t\t\t<strong>Stars Without Number</strong> was created by Kevin Crawford and published by
\t\t\t\t<a href="https://sine-nomine-publishing.myshopify.com/collections/stars-without-number" target="_blank" rel="noopener">Sine Nomine Publishing<span class="visually-hidden"> (opens in new tab)</span></a>.
\t\t\t</p>
\t\t</footer>"""


def encode_uri_component(segment):
    """Match JS encodeURIComponent's safe set exactly, so a URL built here
    is byte-identical to one swn/app.js builds for the same id."""
    return quote(segment, safe="!*'()")


def id_to_url_path(page_id):
    return "/".join(encode_uri_component(seg) for seg in page_id.split("/"))


def page_url(page_id):
    return f"{SITE_ORIGIN}/swn/{id_to_url_path(page_id)}/"


def escape_html(value):
    if value is None:
        return ""
    return html.escape(str(value), quote=True)


def escape_md_label(s):
    return str(s).replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")


def slugify(text):
    slug = re.sub(r"[^a-z0-9]+", "-", str(text).lower())
    return slug.strip("-")


def human_category(category):
    if not category:
        return "Uncategorized"
    if category.startswith("Compendium/"):
        return category[len("Compendium/"):]
    if category == "Compendium":
        return "Compendium Index"
    if category == "z_templates":
        return "Templates"
    return category


def image_url(image_field, size=None):
    if not image_field:
        return None
    file = str(image_field).strip().split("/")[-1]
    if not file:
        return None
    stem = file.rsplit(".", 1)[0]
    if size == "thumb":
        return "/swn/content/Images/thumb/" + encode_uri_component(stem + ".jpg")
    if size == "webp":
        return "/swn/content/Images/" + encode_uri_component(stem + ".webp")
    return "/swn/content/Images/" + encode_uri_component(file)


class Compendium:
    def __init__(self, pages, backlinks):
        self.pages = pages
        self.by_id = {p["id"]: p for p in pages}
        self.by_name_lower = {p["name"].lower(): p["id"] for p in pages}
        self.backlinks = backlinks
        self.static_ids = {p["id"] for p in pages if p["folder"] in CAMPAIGN_FOLDERS}

    def resolve(self, wiki_target):
        base = wiki_target.split("#", 1)[0].strip().split("/")[-1]
        return self.by_name_lower.get(base.lower())

    def link_target(self, target_id):
        """Where a resolved wikilink should point: a real static page for
        campaign entries, the SPA hash view (still useful to a human
        reader) for everything else — the ~500 generic SRD entries are
        intentionally not made into static pages (see build script docstring)."""
        if target_id in self.static_ids:
            return page_url_relative(target_id)
        return f"/swn/#/page/{encode_uri_component(target_id)}"

    def get_backlinks(self, page_id):
        raw = self.backlinks.get(page_id, [])
        by_source = {}
        for link in raw:
            src_id = link["id"]
            if src_id not in by_source:
                src_page = self.by_id.get(src_id)
                by_source[src_id] = {
                    "id": src_id,
                    "name": src_page["name"] if src_page else src_id,
                    "fields": [],
                }
            field = link.get("field", "mentions")
            if field not in by_source[src_id]["fields"]:
                by_source[src_id]["fields"].append(field)
        return sorted(by_source.values(), key=lambda e: e["name"].lower())


def page_url_relative(page_id):
    """Absolute path (no origin) — used for internal hrefs so the site
    works identically under any scheme/host."""
    return f"/swn/{id_to_url_path(page_id)}/"


IMAGE_EMBED_RE = re.compile(r"!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")
STATBLOCK_FENCE_RE = re.compile(r"```statblock[\s\S]*?```")


def preprocess_body(body, comp):
    if not body:
        return ""

    body = STATBLOCK_FENCE_RE.sub("", body)

    def replace_image(m):
        target, alt = m.group(1), m.group(2)
        file = target.strip().split("/")[-1]
        src = "/swn/content/Images/" + encode_uri_component(file)
        return f"![{escape_md_label((alt or '').strip())}]({src})"

    body = IMAGE_EMBED_RE.sub(replace_image, body)

    def replace_wikilink(m):
        target, alias = m.group(1), m.group(2)
        clean = target.split("#", 1)[0].strip()
        label = (alias or target).strip()
        target_id = comp.resolve(clean)
        if target_id:
            return f"[{escape_md_label(label)}]({comp.link_target(target_id)})"
        return escape_md_label(label)

    body = WIKILINK_RE.sub(replace_wikilink, body)
    return body


HEADING_RE = re.compile(r"<h2>(.*?)</h2>")


def add_heading_ids(body_html):
    """Assigns each <h2> an id (matching app.js's slugify + collision
    handling) and returns (html_with_ids, toc_entries)."""
    used = {}
    toc = []

    def repl(m):
        # m.group(1) is already-escaped HTML from markdown.markdown() (e.g.
        # "Leadership &amp; Members") — unescape to plain text first so
        # slugify() and the TOC label see a literal "&", matching what the
        # JS app's h.textContent (auto-decoded) would slugify, and so the
        # label doesn't get escaped a second time below.
        text = html.unescape(re.sub(r"<[^>]+>", "", m.group(1)))
        base = slugify(text) or "section"
        hid, n = base, 2
        while hid in used:
            hid = f"{base}-{n}"
            n += 1
        used[hid] = True
        toc.append((hid, text))
        return f'<h2 id="{escape_html(hid)}">{m.group(1)}</h2>'

    return HEADING_RE.sub(repl, body_html), toc


def excerpt_from_html(body_html, limit=155):
    text = re.sub(r"<[^>]+>", " ", body_html)
    text = re.sub(r"\s+", " ", html.unescape(text)).strip()
    if len(text) <= limit:
        return text
    truncated = text[:limit].rsplit(" ", 1)[0]
    return truncated + "…"


def render_stat_card(fm):
    if fm.get("hit_dice") is None or fm.get("hit_dice") == "":
        return ""
    stats = []
    for key, label in STAT_FIELDS:
        val = fm.get(key)
        if val is None or val == "":
            continue
        stats.append(f'<div class="stat"><div class="value">{escape_html(val)}</div><div class="key">{label}</div></div>')
    if not stats:
        return ""
    return '<div class="stat-card">' + "".join(stats) + "</div>"


def page_link_html(comp, target_id, label=None, cls=None):
    page = comp.by_id.get(target_id)
    label = label if label is not None else (page["name"] if page else target_id)
    title = "" if page else ' title="Not synced to this site"'
    thumb_html = ""
    if page:
        thumb_src = image_url((page.get("frontmatter") or {}).get("image"), "thumb")
        if thumb_src:
            thumb_html = f'<img class="thumb" src="{thumb_src}" alt="" loading="lazy">'
    href = comp.link_target(target_id) if target_id in comp.by_id else "#"
    cls_attr = f' class="{cls}"' if cls else ""
    return f'<a href="{escape_html(href)}"{cls_attr}{title}>{thumb_html}{escape_html(label)}</a>'


def render_page(page, comp, body_html, toc):
    page_id = page["id"]
    fm = page.get("frontmatter") or {}
    raw_type = str(fm["type"]) if fm.get("type") else FOLDER_SINGULAR.get(page["folder"], page["folder"])
    page_type = raw_type[:1].upper() + raw_type[1:]
    accent = CATEGORY_ACCENT.get(page["category"])

    html_parts = []
    html_parts.append('<a class="back-link" href="/swn/#/">← Overview</a>')
    html_parts.append(
        f'<div class="breadcrumb"><a href="/swn/#/browse/{encode_uri_component(page["category"])}">{escape_html(human_category(page["category"]))}</a> / {escape_html(page["name"])}</div>'
    )

    header_style = f' style="border-left-color:{accent}"' if accent else ""
    badge_style = f' style="border-color:{accent};color:{accent}"' if accent else ""
    html_parts.append(f'<div class="page-header"{header_style}><h1>{escape_html(page["name"])}</h1>')
    html_parts.append(f'<span class="badge"{badge_style}>{escape_html(page_type)}</span>')
    if fm.get("status"):
        active_cls = " active" if fm["status"] == "active" else ""
        html_parts.append(f'<span class="badge{active_cls}">{escape_html(fm["status"])}</span>')
    html_parts.append("</div>")

    tags = fm.get("tags") or []
    if tags:
        html_parts.append('<div class="chip-row">' + "".join(f'<span class="chip">{escape_html(t)}</span>' for t in tags) + "</div>")

    page_img_src = image_url(fm.get("image"))
    if page_img_src:
        dims = page.get("image_size")
        dim_attrs = f' width="{dims[0]}" height="{dims[1]}"' if isinstance(dims, list) and len(dims) == 2 else ""
        html_parts.append(
            '<picture class="page-picture">'
            f'<source srcset="{image_url(fm.get("image"), "webp")}" type="image/webp">'
            f'<img class="page-image" src="{page_img_src}" alt="{escape_html(page["name"])}"{dim_attrs} loading="lazy">'
            "</picture>"
        )

    html_parts.append(render_stat_card(fm))

    if len(toc) >= 3:
        toc_links = "".join(f'<a href="#{escape_html(hid)}">{escape_html(text)}</a>' for hid, text in toc)
        html_parts.append(f'<div class="page-toc"><div class="page-toc-title">On this page</div>{toc_links}</div>')

    html_parts.append(f'<div class="page-body">{body_html}</div>')

    if page.get("mtime"):
        html_parts.append(f'<p class="empty-note">Last edited {page["mtime"][:10]}</p>')

    backlinks = comp.get_backlinks(page_id)
    if backlinks:
        shown = backlinks[:24]
        rows = []
        for b in shown:
            why_fields = [f for f in b["fields"] if f != "mentions"]
            why = ", ".join(why_fields) if why_fields else "mentioned in text"
            rows.append(f'<div class="backlink-row">{page_link_html(comp, b["id"])}<span class="why"> — {escape_html(why)}</span></div>')
        more = f'<div class="backlink-more">+{len(backlinks) - len(shown)} more</div>' if len(backlinks) > len(shown) else ""
        html_parts.append(
            f'<div class="backlinks-panel"><div class="backlinks-title">Linked from ({len(backlinks)})</div>' + "".join(rows) + more + "</div>"
        )

    html_parts.append(f'<p class="empty-note"><a href="/swn/#/page/{encode_uri_component(page_id)}">Browse the full interactive compendium →</a></p>')

    return "\n\t\t\t".join(p for p in html_parts if p)


def render_document(page, comp):
    page_id = page["id"]
    title = f'{page["name"]} - SWN Campaign Compendium'
    fm = page.get("frontmatter") or {}

    body_md = preprocess_body(page.get("body", ""), comp)
    body_html, toc = add_heading_ids(markdown.markdown(body_md, extensions=["tables"]))
    description = excerpt_from_html(body_html) or f'{page["name"]} — Stars Without Number campaign compendium entry.'

    url = page_url(page_id)
    og_image = None
    img = image_url(fm.get("image"))
    if img:
        og_image = SITE_ORIGIN + img

    main_html = render_page(page, comp, body_html, toc)

    return f"""<!DOCTYPE html>
<html lang="en">
\t<head>
\t\t<meta charset="utf-8">
\t\t<meta name="viewport" content="width=device-width, initial-scale=1">
\t\t<meta http-equiv="Content-Security-Policy" content="{CSP}">

{GTM_HEAD}

{THEME_FLASH_SCRIPT}
\t\t<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
\t\t<meta name="theme-color" content="#0b1220" media="(prefers-color-scheme: dark)">
\t\t<meta name="description" content="{escape_html(description)}">
\t\t<link rel="canonical" href="{url}">

\t\t<meta property="og:type" content="article">
\t\t<meta property="og:site_name" content="theflat.gen.nz">
\t\t<meta property="og:locale" content="en_NZ">
\t\t<meta property="og:title" content="{escape_html(title)}">
\t\t<meta property="og:description" content="{escape_html(description)}">
\t\t<meta property="og:url" content="{url}">
\t\t<meta property="og:image" content="{og_image or DEFAULT_OG_IMAGE}">

\t\t<meta name="twitter:card" content="summary">
\t\t<meta name="twitter:title" content="{escape_html(title)}">
\t\t<meta name="twitter:image" content="{og_image or DEFAULT_OG_IMAGE}">
\t\t<meta name="twitter:description" content="{escape_html(description)}">

\t\t<title>{escape_html(title)}</title>
{HEAD_ICONS}
\t</head>
\t<body>
{GTM_NOSCRIPT}

\t\t<a href="#main-content" class="skip-link">Skip to main content</a>

\t\t<div class="site-chrome">
\t\t\t<header>
\t\t\t\t<h1><a href="/swn/">SWN Campaign Compendium</a></h1>
\t\t\t\t<a class="site-link" href="/">← theflat.gen.nz</a>
\t\t\t\t<button type="button" class="theme-toggle" id="theme-toggle">
\t\t\t\t\t<span id="theme-label">Light Mode</span>
\t\t\t\t</button>
\t\t\t</header>
\t\t</div>

\t\t<main id="main-content" tabindex="-1">
\t\t\t{main_html}
\t\t</main>

{FOOTER}

{THEME_TOGGLE_SCRIPT}
\t</body>
</html>
"""


def build_sitemap(repo_root, campaign_pages):
    sitemap_path = repo_root / "sitemap.xml"
    ET.register_namespace("", SITEMAP_NS)
    tree = ET.parse(sitemap_path)
    root = tree.getroot()
    ns = {"s": SITEMAP_NS}

    prefix = f"{SITE_ORIGIN}/swn/"
    # Keep every existing entry except stale campaign-page entries from a
    # previous run of this script (identified by a /swn/<Folder>/... path
    # with more than the two segments the app's own single dashboard URL
    # "https://theflat.gen.nz/swn/" has).
    for url_el in list(root.findall("s:url", ns)):
        loc_el = url_el.find("s:loc", ns)
        loc = loc_el.text if loc_el is not None else ""
        if loc.startswith(prefix) and loc != prefix:
            root.remove(url_el)

    for page in campaign_pages:
        url_el = ET.SubElement(root, f"{{{SITEMAP_NS}}}url")
        ET.SubElement(url_el, f"{{{SITEMAP_NS}}}loc").text = page_url(page["id"])
        lastmod_el = ET.SubElement(url_el, f"{{{SITEMAP_NS}}}lastmod")
        lastmod_el.text = (page.get("mtime") or "")[:10]

    ET.indent(tree, space="  ")
    tree.write(sitemap_path, encoding="UTF-8", xml_declaration=True)
    with open(sitemap_path, "a", encoding="utf-8") as f:
        f.write("\n")


def main():
    repo_root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    content_dir = repo_root / "swn" / "content"
    pages_data = json.loads((content_dir / "pages.json").read_text(encoding="utf-8"))
    all_pages = pages_data["pages"]
    backlinks = pages_data.get("backlinks", {})

    bodies_dir = content_dir / "bodies"
    for page in all_pages:
        body_path = bodies_dir / f"{page['id']}.md"
        page["body"] = body_path.read_text(encoding="utf-8") if body_path.exists() else ""

    comp = Compendium(all_pages, backlinks)
    campaign_pages = [p for p in all_pages if p["folder"] in CAMPAIGN_FOLDERS]

    written = 0
    for page in campaign_pages:
        out_dir = repo_root / "swn" / page["id"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(render_document(page, comp), encoding="utf-8")
        written += 1

    build_sitemap(repo_root, campaign_pages)

    print(f"Wrote {written} static campaign pages and updated sitemap.xml")


if __name__ == "__main__":
    main()
