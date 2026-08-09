(function () {
	'use strict';

	var CAMPAIGN_FOLDERS = ['Sectors', 'Systems', 'Worlds', 'NPCs', 'Ships', 'Vehicles', 'Factions'];
	var STAT_FIELDS = [
		['hit_dice', 'HD'],
		['ac', 'AC'],
		['attack_bonus', 'Attack'],
		['saves', 'Saves'],
		['morale', 'Morale'],
		['skill_bonus', 'Skill Bonus'],
		['speed', 'Speed'],
	];
	var FOLDER_SINGULAR = {
		Sectors: 'Sector', Systems: 'System', Worlds: 'World', NPCs: 'NPC',
		Ships: 'Ship', Vehicles: 'Vehicle', Factions: 'Faction', z_templates: 'Template',
		Compendium: 'Compendium Entry',
	};

	var state = { pages: [], byId: new Map(), byNameLower: new Map(), meta: null };
	var main = document.getElementById('main-content');

	function escapeHtml(value) {
		if (value === null || value === undefined) return '';
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function escapeMdLabel(s) {
		return String(s).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
	}

	function pageHref(id) {
		return '#/page/' + encodeURIComponent(id);
	}

	function browseHref(category) {
		return category ? '#/browse/' + encodeURIComponent(category) : '#/browse';
	}

	function pageLink(id, label, cls) {
		var page = state.byId.get(id);
		var title = page ? '' : ' title="Not synced to this site"';
		return '<a href="' + pageHref(id) + '"' + (cls ? ' class="' + cls + '"' : '') + title + '>' + escapeHtml(label) + '</a>';
	}

	function chip(text) {
		return '<span class="chip">' + escapeHtml(text) + '</span>';
	}

	function formatDate(iso) {
		if (!iso) return '';
		var d = new Date(iso);
		if (isNaN(d.getTime())) return '';
		return d.toISOString().slice(0, 10);
	}

	function humanCategory(category) {
		if (!category) return 'Uncategorized';
		if (category === 'Compendium') return 'Compendium Index';
		if (category.indexOf('Compendium/') === 0) return category.slice('Compendium/'.length);
		if (category === 'z_templates') return 'Templates';
		return category;
	}

	// ---- Wikilink resolution -------------------------------------------------

	function firstWikiTarget(value) {
		if (Array.isArray(value)) value = value.length ? value[0] : null;
		if (typeof value !== 'string') return null;
		var m = value.match(/\[\[([^\]|]+)/);
		var raw = m ? m[1] : value;
		return raw.split('#')[0].trim();
	}

	function resolveFieldId(value) {
		var target = firstWikiTarget(value);
		if (!target) return null;
		var base = target.split('/').pop();
		return state.byNameLower.get(base.toLowerCase()) || null;
	}

	function resolveFieldName(value) {
		var id = resolveFieldId(value);
		if (!id) return firstWikiTarget(value);
		var page = state.byId.get(id);
		return page ? page.name : null;
	}

	// ---- Markdown body preprocessing (Obsidian syntax -> standard Markdown) --

	function preprocessBody(body) {
		if (!body) return '';

		// Image embeds: ![[Images/x.jpg]] or ![[Images/x.jpg|alt text]]
		body = body.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (m, target, alt) {
			var file = target.trim().split('/').pop();
			var src = 'content/Images/' + encodeURIComponent(file);
			return '![' + escapeMdLabel((alt || '').trim()) + '](' + src + ')';
		});

		// Fantasy Statblocks fences are redundant with the stat card rendered
		// from this page's own frontmatter — drop them from the body.
		body = body.replace(/```statblock[\s\S]*?```/g, '');

		// Wikilinks: [[Target]] or [[Target|Alias]]
		body = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (m, target, alias) {
			var clean = target.split('#')[0].trim();
			var base = clean.split('/').pop();
			var id = state.byNameLower.get(base.toLowerCase());
			var label = (alias || target).trim();
			if (id) return '[' + escapeMdLabel(label) + '](' + pageHref(id) + ')';
			return escapeMdLabel(label);
		});

		return body;
	}

	function renderMarkdown(body) {
		return marked.parse(preprocessBody(body));
	}

	// ---- Router ----------------------------------------------------------

	function parseHash() {
		var hash = location.hash || '';
		hash = hash.replace(/^#/, '');
		var queryIndex = hash.indexOf('?');
		var query = {};
		if (queryIndex !== -1) {
			var qs = hash.slice(queryIndex + 1);
			hash = hash.slice(0, queryIndex);
			qs.split('&').forEach(function (pair) {
				if (!pair) return;
				var eq = pair.indexOf('=');
				var k = eq === -1 ? pair : pair.slice(0, eq);
				var v = eq === -1 ? '' : pair.slice(eq + 1);
				query[decodeURIComponent(k)] = decodeURIComponent(v || '');
			});
		}
		var parts = hash.split('/').filter(Boolean);
		if (parts.length === 0) return { view: 'dashboard', query: query };
		if (parts[0] === 'page' && parts[1]) return { view: 'page', id: decodeURIComponent(parts.slice(1).join('/')), query: query };
		if (parts[0] === 'browse') return { view: 'browse', category: parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : null, query: query };
		return { view: 'dashboard', query: query };
	}

	function route() {
		var r = parseHash();
		if (r.view === 'page') renderPage(r.id);
		else if (r.view === 'browse') renderBrowse(r.category, r.query.q || '');
		else renderDashboard();
		main.focus();
		window.scrollTo(0, 0);
	}

	// ---- Dashboard ---------------------------------------------------------

	function renderDashboard() {
		document.title = 'SWN Campaign Compendium - theflat.gen.nz';
		var pages = state.pages;
		var byFolder = {};
		CAMPAIGN_FOLDERS.forEach(function (f) { byFolder[f] = pages.filter(function (p) { return p.folder === f; }); });

		var html = '';
		html += '<img class="banner" src="content/Images/galaxy.png" alt="" loading="lazy">';

		html += '<form class="search-row" id="dashboard-search">' +
			'<input type="search" name="q" placeholder="Search all ' + pages.length + ' pages…" aria-label="Search all pages">' +
			'<button type="submit">Search</button>' +
			'<button type="button" onclick="location.hash=\'#/browse\'">Browse all →</button>' +
			'</form>';

		// Campaign overview
		html += '<div class="section-title">Campaign Overview</div><div class="card-grid">';
		CAMPAIGN_FOLDERS.forEach(function (f) {
			html += '<a class="count-card" href="' + browseHref(f) + '"><div class="count">' + byFolder[f].length + '</div><div class="label">' + escapeHtml(f) + '</div></a>';
		});
		html += '</div>';

		html += '<div class="dashboard-layout"><div class="dashboard-main">';

		// Campaign map
		html += '<div class="section-title">Campaign Map</div>';
		var systems = byFolder.Systems, worlds = byFolder.Worlds, ships = byFolder.Ships, npcs = byFolder.NPCs;
		if (systems.length === 0) {
			html += '<p class="empty-note">No systems recorded yet.</p>';
		}
		systems.forEach(function (sys) {
			var sysWorlds = worlds.filter(function (w) { return resolveFieldId(w.frontmatter.system) === sys.id; });
			var sysShips = ships.filter(function (s) { return resolveFieldId(s.frontmatter.current_location) === sys.id; });

			html += '<div class="map-system"><div class="map-system-title">' + pageLink(sys.id, sys.name) + '</div>';
			var tags = sys.frontmatter.tags || [];
			if (tags.length) {
				html += '<div class="chip-row">' + tags.map(chip).join('') + '</div>';
			}

			if (sysWorlds.length) {
				html += '<div class="map-branch-label">Worlds</div>';
				sysWorlds.forEach(function (w) {
					var wNpcs = npcs.filter(function (n) { return n.frontmatter.location_type === 'world' && resolveFieldId(n.frontmatter.location) === w.id; });
					html += '<div class="map-node">' + pageLink(w.id, w.name);
					if (w.frontmatter.population) html += ' <span class="chip">' + escapeHtml(w.frontmatter.population) + '</span>';
					if (wNpcs.length) html += '<div class="chip-row">' + wNpcs.map(function (n) { return '<a class="chip" href="' + pageHref(n.id) + '">' + escapeHtml(n.name) + '</a>'; }).join('') + '</div>';
					html += '</div>';
				});
			}

			if (sysShips.length) {
				html += '<div class="map-branch-label">Ships in system</div>';
				sysShips.forEach(function (s) {
					var crew = npcs.filter(function (n) { return n.frontmatter.location_type === 'ship' && resolveFieldId(n.frontmatter.location) === s.id; });
					var hull = resolveFieldName(s.frontmatter.hull_type);
					html += '<div class="map-node">' + pageLink(s.id, s.name);
					if (hull) html += ' <span class="chip">' + escapeHtml(hull) + '</span>';
					if (crew.length) html += '<div class="chip-row">' + crew.map(function (n) { return '<a class="chip" href="' + pageHref(n.id) + '">' + escapeHtml(n.name) + '</a>'; }).join('') + '</div>';
					html += '</div>';
				});
			}
			html += '</div>';
		});

		var unlinked = []
			.concat(systems.filter(function (s) { return !resolveFieldId(s.frontmatter.sector); }).map(function (p) { return [p, 'missing sector']; }))
			.concat(worlds.filter(function (w) { return !resolveFieldId(w.frontmatter.system); }).map(function (p) { return [p, 'missing system']; }))
			.concat(ships.filter(function (s) { return !resolveFieldId(s.frontmatter.current_location); }).map(function (p) { return [p, 'missing current location']; }))
			.concat(byFolder.Vehicles.filter(function (v) { return !resolveFieldId(v.frontmatter.current_location); }).map(function (p) { return [p, 'missing current location']; }))
			.concat(npcs.filter(function (n) { return !resolveFieldId(n.frontmatter.location); }).map(function (p) { return [p, 'missing location']; }));
		if (unlinked.length) {
			html += '<div class="section-title">Unlinked Entries</div>';
			unlinked.forEach(function (pair) {
				html += '<div class="list-row">' + pageLink(pair[0].id, pair[0].name) + '<span class="meta">' + escapeHtml(pair[1]) + '</span></div>';
			});
		}

		// Factions
		html += '<div class="section-title">Factions</div>';
		var factions = byFolder.Factions.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
		if (factions.length === 0) {
			html += '<p class="empty-note">No factions recorded yet.</p>';
		}
		factions.forEach(function (fac) {
			html += '<div class="faction-card"><div class="faction-name">' + pageLink(fac.id, fac.name) + '</div>';
			var tags = fac.frontmatter.tags || [];
			if (tags.length) html += '<div class="chip-row">' + tags.map(chip).join('') + '</div>';
			var members = npcs.filter(function (n) { return resolveFieldId(n.frontmatter.faction) === fac.id; })
				.concat(ships.filter(function (s) { return resolveFieldId(s.frontmatter.owner_faction) === fac.id; }));
			if (members.length) html += '<div class="chip-row">' + members.map(function (m) { return '<a class="chip" href="' + pageHref(m.id) + '">' + escapeHtml(m.name) + '</a>'; }).join('') + '</div>';
			html += '</div>';
		});

		// Recently edited
		html += '<div class="section-title">Recently Edited</div>';
		var recent = CAMPAIGN_FOLDERS.reduce(function (acc, f) { return acc.concat(byFolder[f]); }, [])
			.filter(function (p) { return p.mtime; })
			.sort(function (a, b) { return b.mtime.localeCompare(a.mtime); })
			.slice(0, 8);
		recent.forEach(function (p) {
			html += '<div class="list-row">' + pageLink(p.id, p.name) + '<span class="meta">' + formatDate(p.mtime) + '</span></div>';
		});

		html += '</div><div class="dashboard-side">';

		// Rules compendium
		var compendiumPages = pages.filter(function (p) { return p.folder === 'Compendium'; });
		html += '<div class="side-title">Rules Compendium — ' + compendiumPages.length + ' entries</div>';
		var byCategory = {};
		compendiumPages.forEach(function (p) { byCategory[p.category] = (byCategory[p.category] || 0) + 1; });
		var cats = Object.keys(byCategory).sort(function (a, b) { return byCategory[b] - byCategory[a]; });
		html += '<div class="side-grid">';
		cats.forEach(function (c) {
			html += '<a class="side-card" href="' + browseHref(c) + '"><div class="count">' + byCategory[c] + '</div><div class="label">' + escapeHtml(humanCategory(c)) + '</div></a>';
		});
		html += '</div>';

		html += '<div class="side-title">Templates</div>';
		var templates = pages.filter(function (p) { return p.folder === 'z_templates'; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
		templates.forEach(function (t) {
			html += '<div class="list-row">' + pageLink(t.id, t.name) + '</div>';
		});

		html += '</div></div>';

		main.innerHTML = html;

		var form = document.getElementById('dashboard-search');
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var q = form.q.value.trim();
			location.hash = q ? '#/browse?q=' + encodeURIComponent(q) : '#/browse';
		});
	}

	// ---- Page view ---------------------------------------------------------

	function renderPage(id) {
		var page = state.byId.get(id);
		if (!page) { renderNotFound(id); return; }

		document.title = page.name + ' - SWN Campaign Compendium';

		var fm = page.frontmatter || {};
		var rawType = fm.type ? String(fm.type) : (FOLDER_SINGULAR[page.folder] || page.folder);
		var type = rawType.charAt(0).toUpperCase() + rawType.slice(1);

		var html = '<a class="back-link" href="#/">← Dashboard</a>';

		html += '<div class="breadcrumb">' +
			'<a href="' + browseHref(page.category) + '">' + escapeHtml(humanCategory(page.category)) + '</a>' +
			' / ' + escapeHtml(page.name) +
			'</div>';

		html += '<div class="page-header"><h1>' + escapeHtml(page.name) + '</h1>';
		html += '<span class="badge">' + escapeHtml(type) + '</span>';
		if (fm.status) html += '<span class="badge' + (fm.status === 'active' ? ' active' : '') + '">' + escapeHtml(fm.status) + '</span>';
		html += '</div>';

		var tags = fm.tags || [];
		if (tags.length) html += '<div class="chip-row">' + tags.map(chip).join('') + '</div>';

		var hasStats = fm.hit_dice !== undefined && fm.hit_dice !== null;
		if (hasStats) {
			html += '<div class="stat-card">';
			STAT_FIELDS.forEach(function (pair) {
				var val = fm[pair[0]];
				if (val === undefined || val === null || val === '') return;
				html += '<div class="stat"><div class="value">' + escapeHtml(val) + '</div><div class="key">' + pair[1] + '</div></div>';
			});
			html += '</div>';
		}

		html += '<div class="page-body">' + renderMarkdown(page.body) + '</div>';

		if (page.mtime) html += '<p class="empty-note">Last edited ' + formatDate(page.mtime) + '</p>';

		main.innerHTML = html;
	}

	function renderNotFound(id) {
		document.title = 'Not found - SWN Campaign Compendium';
		main.innerHTML = '<a class="back-link" href="#/">← Dashboard</a>' +
			'<p class="error">No page found for "' + escapeHtml(id || '') + '".</p>';
	}

	// ---- Browse / search -----------------------------------------------------

	function renderBrowse(category, query) {
		document.title = (category ? humanCategory(category) : 'Browse all pages') + ' - SWN Campaign Compendium';
		var pages = state.pages;
		if (category) pages = pages.filter(function (p) { return p.category === category; });

		var q = (query || '').trim().toLowerCase();
		if (q) pages = pages.filter(function (p) { return p.name.toLowerCase().indexOf(q) !== -1; });

		var html = '<a class="back-link" href="#/">← Dashboard</a>';
		html += '<div class="section-title">' + (category ? escapeHtml(humanCategory(category)) : 'Browse all pages') + '</div>';

		html += '<form class="search-row" id="browse-search">' +
			'<input type="search" name="q" value="' + escapeHtml(query || '') + '" placeholder="Filter by name…" aria-label="Filter pages by name">' +
			'<button type="submit">Filter</button>' +
			(category ? '<button type="button" onclick="location.hash=\'' + browseHref(null) + (q ? '?q=' + encodeURIComponent(query) : '') + '\'">All categories</button>' : '') +
			'</form>';

		if (pages.length === 0) {
			html += '<p class="empty-note">No pages match.</p>';
			main.innerHTML = html;
			bindBrowseSearch(category);
			return;
		}

		if (category) {
			html += '<div class="browse-list">' + pages.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
				.map(function (p) { return pageLink(p.id, p.name); }).join('') + '</div>';
		} else {
			var byCategory = {};
			pages.forEach(function (p) { (byCategory[p.category] = byCategory[p.category] || []).push(p); });
			Object.keys(byCategory).sort().forEach(function (c) {
				var list = byCategory[c].slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
				html += '<div class="browse-group"><h2>' + escapeHtml(humanCategory(c)) + ' (' + list.length + ')</h2>';
				html += '<div class="browse-list">' + list.map(function (p) { return pageLink(p.id, p.name); }).join('') + '</div></div>';
			});
		}

		main.innerHTML = html;
		bindBrowseSearch(category);
	}

	function bindBrowseSearch(category) {
		var form = document.getElementById('browse-search');
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var q = form.q.value.trim();
			location.hash = browseHref(category) + (q ? '?q=' + encodeURIComponent(q) : '');
		});
	}

	// ---- Init ----------------------------------------------------------------

	function renderSyncMeta() {
		var el = document.getElementById('sync-meta');
		if (!el || !state.meta) return;
		var d = formatDate(state.meta.synced_at);
		el.textContent = 'Content synced ' + d + ' · ' + state.meta.page_count + ' pages';
	}

	function init() {
		Promise.all([
			fetch('content/pages.json').then(function (r) { return r.json(); }),
			fetch('content/meta.json').then(function (r) { return r.json(); }).catch(function () { return null; }),
		]).then(function (results) {
			state.pages = results[0];
			state.meta = results[1];
			state.pages.forEach(function (p) {
				state.byId.set(p.id, p);
				state.byNameLower.set(p.name.toLowerCase(), p.id);
			});
			renderSyncMeta();
			window.addEventListener('hashchange', route);
			route();
		}).catch(function (err) {
			main.innerHTML = '<p class="error">Failed to load campaign data: ' + escapeHtml(err.message) + '</p>';
		});
	}

	init();
})();
