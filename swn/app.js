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

	// Coarse navigation tabs. `folders` lists the exact `category` values
	// (== folder for campaign pages) that belong to each tab.
	var SECTION_TABS = [
		{ id: 'sector', label: 'Sector & Systems', folders: ['Sectors', 'Systems', 'Worlds'] },
		{ id: 'factions', label: 'Factions & NPCs', folders: ['Factions', 'NPCs'] },
		{ id: 'ships', label: 'Ships & Vehicles', folders: ['Ships', 'Vehicles'] },
		{ id: 'compendium', label: 'Compendium', folders: ['Compendium', 'z_templates'] },
	];
	var SECTION_IDS = SECTION_TABS.map(function (t) { return t.id; });

	// Accent hues per category family, reused across badges, chips and cards.
	var CATEGORY_ACCENT = {
		Sectors: '#38bdf8', Systems: '#38bdf8', Worlds: '#4ade80',
		Factions: '#f472b6', NPCs: '#c084fc', Ships: '#60a5fa', Vehicles: '#60a5fa',
	};
	var COMPENDIUM_ACCENT = {
		Weapons: '#fb923c', Armor: '#fb923c', 'Ship Weapons': '#fb923c', 'Ship Defenses': '#fb923c',
		'Psychic Powers': '#facc15', Cyberware: '#a78bfa', 'Faction Assets': '#f472b6',
		'Ship Fittings': '#60a5fa', Skills: '#4ade80', Equipment: '#94a3b8',
		Creatures: '#f87171', Robots: '#f87171', 'Features & Foci': '#94a3b8',
		NPCs: '#c084fc', Ships: '#60a5fa', Vehicles: '#60a5fa',
	};

	// Category -> ordered [frontmatterKey, columnLabel] pairs. Categories
	// without an entry keep the plain name-list view (their frontmatter
	// doesn't carry enough structured fields to justify a table).
	var TABLE_COLUMNS = {
		'Compendium/Weapons': [['tl', 'TL'], ['cost', 'Cost'], ['damage', 'Damage'], ['range', 'Range'], ['encumbrance', 'Enc'], ['attribute', 'Attr']],
		'Compendium/Armor': [['ac', 'AC'], ['tl', 'TL'], ['cost', 'Cost'], ['encumbrance', 'Enc']],
		'Compendium/Psychic Powers': [['level', 'Level'], ['discipline', 'Discipline']],
		'Compendium/Ship Fittings': [['cost', 'Cost'], ['power', 'Power'], ['mass', 'Mass'], ['tl', 'TL']],
		'Compendium/Ship Weapons': [['cost', 'Cost'], ['power', 'Power'], ['mass', 'Mass'], ['damage', 'Damage'], ['tl', 'TL']],
		'Compendium/Ship Defenses': [['cost', 'Cost'], ['power', 'Power'], ['mass', 'Mass'], ['tl', 'TL']],
		'Compendium/Cyberware': [['tl', 'TL'], ['cost', 'Cost'], ['strain', 'Strain']],
		'Compendium/Faction Assets': [['category', 'Category'], ['rating', 'Rating']],
		'Compendium/Vehicles': [['tl', 'TL'], ['cost', 'Cost'], ['speed', 'Speed'], ['armor', 'Armor'], ['hp', 'HP'], ['crew', 'Crew'], ['tonnage', 'Tonnage']],
		'Compendium/Robots': [['hit_dice', 'HD'], ['ac', 'AC'], ['attack_bonus', 'Attack'], ['saves', 'Saves'], ['morale', 'Morale'], ['speed', 'Speed']],
		'Compendium/Creatures': [['hit_dice', 'HD'], ['ac', 'AC'], ['attack_bonus', 'Attack'], ['saves', 'Saves'], ['morale', 'Morale'], ['speed', 'Speed']],
		'Compendium/NPCs': [['hit_dice', 'HD'], ['ac', 'AC'], ['attack_bonus', 'Attack'], ['saves', 'Saves'], ['morale', 'Morale'], ['speed', 'Speed']],
		'Compendium/Ships': [['hull_type', 'Hull'], ['tl', 'TL'], ['cost', 'Cost'], ['hp', 'HP'], ['ac', 'AC'], ['armor', 'Armor'], ['speed', 'Speed']],
	};

	// Frontmatter key -> human label, used on the backlinks panel.
	var FIELD_LABELS = {
		system: 'system', sector: 'sector', location: 'location', current_location: 'location',
		faction: 'faction', owner_faction: 'owner', homeworld: 'homeworld', leader: 'leader',
		hull_type: 'hull type', statblock: 'statblock', assets: 'asset',
	};

	var state = { pages: [], byId: new Map(), byNameLower: new Map(), meta: null, backlinks: new Map() };
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

	function sectionHref(id) {
		return '#/section/' + id;
	}

	// The sync step writes a small pre-cropped square alongside every full
	// image (see build_swn_manifest.py's optimize_image) — always .jpg
	// regardless of the full image's format, so 'thumb' rewrites the
	// extension rather than reusing the source one.
	function imageUrl(path, size) {
		if (!path) return null;
		var file = String(path).trim().split('/').pop();
		if (!file) return null;
		if (size === 'thumb') {
			return 'content/Images/thumb/' + encodeURIComponent(file.replace(/\.[^.]+$/, '') + '.jpg');
		}
		// The sync step writes a .webp sibling next to every full image, so this
		// rewrites the extension the same way 'thumb' does.
		if (size === 'webp') {
			return 'content/Images/' + encodeURIComponent(file.replace(/\.[^.]+$/, '') + '.webp');
		}
		return 'content/Images/' + encodeURIComponent(file);
	}

	function pageLink(id, label, cls) {
		var page = state.byId.get(id);
		var title = page ? '' : ' title="Not synced to this site"';
		var thumbSrc = page && imageUrl(page.frontmatter && page.frontmatter.image, 'thumb');
		var thumb = thumbSrc ? '<img class="thumb" src="' + thumbSrc + '" alt="" loading="lazy">' : '';
		return '<a href="' + pageHref(id) + '"' + (cls ? ' class="' + cls + '"' : '') + title + '>' + thumb + escapeHtml(label) + '</a>';
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

	function slugify(text) {
		return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	}

	function fieldLabel(key) {
		return FIELD_LABELS[key] || String(key).replace(/_/g, ' ');
	}

	function accentForCategory(category) {
		if (!category) return null;
		if (category.indexOf('Compendium/') === 0) return COMPENDIUM_ACCENT[category.slice('Compendium/'.length)] || null;
		return CATEGORY_ACCENT[category] || null;
	}

	function sectionIdForCategory(category) {
		if (!category) return null;
		if (category.indexOf('Compendium/') === 0) return 'compendium';
		for (var i = 0; i < SECTION_TABS.length; i++) {
			if (SECTION_TABS[i].folders.indexOf(category) !== -1) return SECTION_TABS[i].id;
		}
		return null;
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

	// ---- Backlinks -------------------------------------------------------

	// Every frontmatter field or body wikilink that resolves to another
	// synced page is already computed once here, so page views can show
	// "linked from" without re-scanning the corpus per render.
	function buildBacklinkIndex() {
		var index = new Map();
		function addLink(sourceId, sourceName, targetId, field) {
			if (!targetId || targetId === sourceId) return;
			if (!index.has(targetId)) index.set(targetId, []);
			index.get(targetId).push({ id: sourceId, name: sourceName, field: field });
		}

		state.pages.forEach(function (p) {
			var fm = p.frontmatter || {};
			Object.keys(fm).forEach(function (key) {
				var val = fm[key];
				if (Array.isArray(val)) {
					val.forEach(function (v) {
						if (typeof v === 'string' && v.indexOf('[[') !== -1) addLink(p.id, p.name, resolveFieldId(v), key);
					});
				} else if (typeof val === 'string' && val.indexOf('[[') !== -1) {
					addLink(p.id, p.name, resolveFieldId(val), key);
				}
			});

			var body = p.body || '';
			var re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
			var m, seen = {};
			while ((m = re.exec(body))) {
				var clean = m[1].split('#')[0].trim();
				var base = clean.split('/').pop();
				var targetId = state.byNameLower.get(base.toLowerCase());
				if (targetId && targetId !== p.id && !seen[targetId]) {
					seen[targetId] = true;
					addLink(p.id, p.name, targetId, 'mentions');
				}
			}
		});

		return index;
	}

	function getBacklinks(id) {
		var raw = state.backlinks.get(id) || [];
		var bySource = new Map();
		raw.forEach(function (l) {
			if (!bySource.has(l.id)) bySource.set(l.id, { id: l.id, name: l.name, fields: [] });
			var entry = bySource.get(l.id);
			if (entry.fields.indexOf(l.field) === -1) entry.fields.push(l.field);
		});
		return Array.from(bySource.values()).sort(function (a, b) { return a.name.localeCompare(b.name); });
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
		if (parts.length === 0) return { view: 'overview', query: query };
		if (parts[0] === 'page' && parts[1]) return { view: 'page', id: decodeURIComponent(parts.slice(1).join('/')), query: query };
		if (parts[0] === 'browse') return { view: 'browse', category: parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : null, query: query };
		if (parts[0] === 'section' && parts[1] && SECTION_IDS.indexOf(parts[1]) !== -1) return { view: 'section', id: parts[1], query: query };
		return { view: 'overview', query: query };
	}

	function route() {
		var r = parseHash();
		var activeTab = 'overview';
		if (r.view === 'page') {
			renderPage(r.id);
			var p = state.byId.get(r.id);
			activeTab = p ? sectionIdForCategory(p.category) : null;
		} else if (r.view === 'browse') {
			renderBrowse(r.category, r.query.q || '');
			activeTab = sectionIdForCategory(r.category);
		} else if (r.view === 'section') {
			renderSection(r.id);
			activeTab = r.id;
		} else {
			renderOverview();
			activeTab = 'overview';
		}
		setActiveTab(activeTab);
		main.focus();
		window.scrollTo(0, 0);
	}

	function renderSection(id) {
		if (id === 'sector') return renderSectorSection();
		if (id === 'factions') return renderFactionsSection();
		if (id === 'ships') return renderShipsSection();
		if (id === 'compendium') return renderCompendiumSection();
		renderOverview();
	}

	// ---- Tab bar + global search -------------------------------------------

	function renderTabBar() {
		var el = document.getElementById('tab-bar');
		if (!el) return;
		var links = '<a href="#/" data-tab="overview">Overview</a>';
		SECTION_TABS.forEach(function (t) {
			links += '<a href="' + sectionHref(t.id) + '" data-tab="' + t.id + '">' + escapeHtml(t.label) + '</a>';
		});
		el.innerHTML =
			'<div class="tab-links">' + links + '</div>' +
			'<div class="tab-search">' +
			'<input type="search" id="global-search" placeholder="Search… (press /)" aria-label="Search all pages" autocomplete="off">' +
			'<div class="search-results" id="global-search-results" hidden></div>' +
			'</div>';
	}

	function setActiveTab(id) {
		var el = document.getElementById('tab-bar');
		if (!el) return;
		var links = el.querySelectorAll('a');
		for (var i = 0; i < links.length; i++) {
			var isActive = links[i].getAttribute('data-tab') === id;
			links[i].classList.toggle('active', isActive);
			if (isActive) links[i].setAttribute('aria-current', 'page');
			else links[i].removeAttribute('aria-current');
		}
	}

	function bindGlobalSearch() {
		var input = document.getElementById('global-search');
		var results = document.getElementById('global-search-results');
		if (!input || !results) return;

		function search(q) {
			q = q.trim().toLowerCase();
			if (!q) return [];
			var out = [];
			for (var i = 0; i < state.pages.length && out.length < 8; i++) {
				var p = state.pages[i];
				var tags = (p.frontmatter && p.frontmatter.tags) || [];
				var hay = (p.name + ' ' + humanCategory(p.category) + ' ' + tags.join(' ')).toLowerCase();
				if (hay.indexOf(q) !== -1) out.push(p);
			}
			return out;
		}

		function renderResults(list, q) {
			if (!list.length) {
				results.innerHTML = q ? '<div class="search-empty">No matches</div>' : '';
				results.hidden = !q;
				return;
			}
			results.innerHTML = list.map(function (p) {
				return '<a href="' + pageHref(p.id) + '" class="search-hit">' +
					'<span class="hit-name">' + escapeHtml(p.name) + '</span>' +
					'<span class="hit-meta">' + escapeHtml(humanCategory(p.category)) + '</span></a>';
			}).join('');
			results.hidden = false;
		}

		input.addEventListener('input', function () {
			renderResults(search(input.value), input.value.trim());
		});
		input.addEventListener('focus', function () {
			if (input.value.trim()) renderResults(search(input.value), input.value.trim());
		});
		results.addEventListener('click', function () {
			input.value = '';
			results.hidden = true;
		});
		document.addEventListener('click', function (e) {
			if (!e.target.closest('.tab-search')) results.hidden = true;
		});
		document.addEventListener('keydown', function (e) {
			if (e.key === '/' && document.activeElement !== input && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
				e.preventDefault();
				input.focus();
			}
			if (e.key === 'Escape' && document.activeElement === input) {
				input.value = '';
				results.hidden = true;
				input.blur();
			}
		});
		window.addEventListener('hashchange', function () {
			input.value = '';
			results.hidden = true;
		});
	}

	// ---- Overview ----------------------------------------------------------

	function renderOverview() {
		document.title = 'SWN Campaign Compendium - theflat.gen.nz';
		var pages = state.pages;
		var byFolder = {};
		CAMPAIGN_FOLDERS.forEach(function (f) { byFolder[f] = pages.filter(function (p) { return p.folder === f; }); });

		var html = '';
		html += '<img class="banner" src="content/Images/galaxy.jpg" alt="" loading="lazy">';
		html += '<a class="back-link" href="#/browse">Browse all ' + pages.length + ' pages →</a>';

		var systems = byFolder.Systems, worlds = byFolder.Worlds, factions = byFolder.Factions;
		var ships = byFolder.Ships, npcs = byFolder.NPCs;

		html += '<div class="section-title">Sector Snapshot</div>';
		if (systems.length === 0) {
			html += '<p class="empty-note">No systems recorded yet.</p>';
		}
		systems.forEach(function (sys) {
			var sysWorlds = worlds.filter(function (w) { return resolveFieldId(w.frontmatter.system) === sys.id; });
			html += '<div class="map-system"><div class="map-system-title">' + pageLink(sys.id, sys.name) + '</div>';
			var tags = sys.frontmatter.tags || [];
			if (tags.length) html += '<div class="chip-row">' + tags.map(chip).join('') + '</div>';
			if (sysWorlds.length) {
				html += '<div class="chip-row">' + sysWorlds.map(function (w) {
					var pop = w.frontmatter.population ? ' — ' + escapeHtml(w.frontmatter.population) : '';
					return '<a class="chip" href="' + pageHref(w.id) + '">' + escapeHtml(w.name) + pop + '</a>';
				}).join('') + '</div>';
			}
			html += '</div>';
		});
		html += '<div class="list-row"><a href="' + sectionHref('sector') + '">Full sector map →</a></div>';

		html += '<div class="section-title">Factions</div>';
		if (factions.length) {
			html += '<div class="chip-row">' + factions.map(function (f) {
				return '<a class="chip" href="' + pageHref(f.id) + '">' + escapeHtml(f.name) + '</a>';
			}).join('') + '</div>';
		} else {
			html += '<p class="empty-note">No factions recorded yet.</p>';
		}
		html += '<div class="list-row"><a href="' + sectionHref('factions') + '">Faction &amp; NPC details →</a></div>';

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

		html += '<div class="section-title">Recently Edited</div>';
		var recent = CAMPAIGN_FOLDERS.reduce(function (acc, f) { return acc.concat(byFolder[f]); }, [])
			.filter(function (p) { return p.mtime; })
			.sort(function (a, b) { return b.mtime.localeCompare(a.mtime); })
			.slice(0, 8);
		if (recent.length === 0) {
			html += '<p class="empty-note">No campaign edits recorded yet.</p>';
		}
		recent.forEach(function (p) {
			html += '<div class="list-row">' + pageLink(p.id, p.name) + '<span class="meta">' + formatDate(p.mtime) + '</span></div>';
		});

		main.innerHTML = html;
	}

	// ---- Section tabs --------------------------------------------------------

	function renderSectorSection() {
		document.title = 'Sector & Systems - SWN Campaign Compendium';
		var pages = state.pages;
		var sectors = pages.filter(function (p) { return p.folder === 'Sectors'; });
		var systems = pages.filter(function (p) { return p.folder === 'Systems'; });
		var worlds = pages.filter(function (p) { return p.folder === 'Worlds'; });
		var ships = pages.filter(function (p) { return p.folder === 'Ships'; });
		var npcs = pages.filter(function (p) { return p.folder === 'NPCs'; });

		var html = '<a class="back-link" href="#/">← Overview</a>';
		html += '<div class="section-title">Sector &amp; Systems</div>';

		html += '<div class="card-grid">' +
			'<a class="count-card" href="' + browseHref('Sectors') + '" style="border-top-color:' + CATEGORY_ACCENT.Sectors + '"><div class="count">' + sectors.length + '</div><div class="label">Sectors</div></a>' +
			'<a class="count-card" href="' + browseHref('Systems') + '" style="border-top-color:' + CATEGORY_ACCENT.Systems + '"><div class="count">' + systems.length + '</div><div class="label">Systems</div></a>' +
			'<a class="count-card" href="' + browseHref('Worlds') + '" style="border-top-color:' + CATEGORY_ACCENT.Worlds + '"><div class="count">' + worlds.length + '</div><div class="label">Worlds</div></a>' +
			'</div>';

		if (sectors.length === 0) html += '<p class="empty-note">No sectors recorded yet.</p>';
		sectors.forEach(function (sec) {
			html += '<div class="map-system"><div class="map-system-title">' + pageLink(sec.id, sec.name) + '</div>';
			var tags = sec.frontmatter.tags || [];
			if (tags.length) html += '<div class="chip-row">' + tags.map(chip).join('') + '</div>';
			html += '</div>';
		});

		if (systems.length === 0) html += '<p class="empty-note">No systems recorded yet.</p>';
		systems.forEach(function (sys) {
			var sysWorlds = worlds.filter(function (w) { return resolveFieldId(w.frontmatter.system) === sys.id; });
			var sysShips = ships.filter(function (s) { return resolveFieldId(s.frontmatter.current_location) === sys.id; });

			html += '<div class="map-system"><div class="map-system-title">' + pageLink(sys.id, sys.name) + '</div>';
			var tags = sys.frontmatter.tags || [];
			if (tags.length) html += '<div class="chip-row">' + tags.map(chip).join('') + '</div>';

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

		main.innerHTML = html;
	}

	function renderFactionsSection() {
		document.title = 'Factions & NPCs - SWN Campaign Compendium';
		var pages = state.pages;
		var factions = pages.filter(function (p) { return p.folder === 'Factions'; }).slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
		var npcs = pages.filter(function (p) { return p.folder === 'NPCs'; });
		var ships = pages.filter(function (p) { return p.folder === 'Ships'; });

		var html = '<a class="back-link" href="#/">← Overview</a>';
		html += '<div class="card-grid">' +
			'<a class="count-card" href="' + browseHref('Factions') + '" style="border-top-color:' + CATEGORY_ACCENT.Factions + '"><div class="count">' + factions.length + '</div><div class="label">Factions</div></a>' +
			'<a class="count-card" href="' + browseHref('NPCs') + '" style="border-top-color:' + CATEGORY_ACCENT.NPCs + '"><div class="count">' + npcs.length + '</div><div class="label">NPCs</div></a>' +
			'</div>';

		html += '<div class="section-title">Factions</div>';
		if (factions.length === 0) html += '<p class="empty-note">No factions recorded yet.</p>';
		factions.forEach(function (fac) {
			html += '<div class="faction-card"><div class="faction-name">' + pageLink(fac.id, fac.name) + '</div>';
			var tags = fac.frontmatter.tags || [];
			if (tags.length) html += '<div class="chip-row">' + tags.map(chip).join('') + '</div>';
			var members = npcs.filter(function (n) { return resolveFieldId(n.frontmatter.faction) === fac.id; })
				.concat(ships.filter(function (s) { return resolveFieldId(s.frontmatter.owner_faction) === fac.id; }));
			if (members.length) html += '<div class="chip-row">' + members.map(function (m) { return '<a class="chip" href="' + pageHref(m.id) + '">' + escapeHtml(m.name) + '</a>'; }).join('') + '</div>';
			html += '</div>';
		});

		html += '<div class="section-title">NPCs</div>';
		if (npcs.length === 0) html += '<p class="empty-note">No NPCs recorded yet.</p>';
		npcs.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (n) {
			html += '<div class="list-row">' + pageLink(n.id, n.name) + '<span class="meta">' + escapeHtml(n.frontmatter.role || '') + '</span></div>';
		});

		main.innerHTML = html;
	}

	function renderShipsSection() {
		document.title = 'Ships & Vehicles - SWN Campaign Compendium';
		var pages = state.pages;
		var ships = pages.filter(function (p) { return p.folder === 'Ships'; }).slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
		var vehicles = pages.filter(function (p) { return p.folder === 'Vehicles'; }).slice().sort(function (a, b) { return a.name.localeCompare(b.name); });

		var html = '<a class="back-link" href="#/">← Overview</a>';
		html += '<div class="card-grid">' +
			'<a class="count-card" href="' + browseHref('Ships') + '" style="border-top-color:' + CATEGORY_ACCENT.Ships + '"><div class="count">' + ships.length + '</div><div class="label">Ships</div></a>' +
			'<a class="count-card" href="' + browseHref('Vehicles') + '" style="border-top-color:' + CATEGORY_ACCENT.Vehicles + '"><div class="count">' + vehicles.length + '</div><div class="label">Vehicles</div></a>' +
			'</div>';

		html += '<div class="section-title">Ships</div>';
		if (ships.length === 0) html += '<p class="empty-note">No ships recorded yet.</p>';
		ships.forEach(function (s) {
			var hull = resolveFieldName(s.frontmatter.hull_type);
			var ownerId = resolveFieldId(s.frontmatter.owner_faction);
			var locId = resolveFieldId(s.frontmatter.current_location);
			html += '<div class="map-system"><div class="map-system-title">' + pageLink(s.id, s.name) + '</div>';
			var chips = [];
			if (hull) chips.push(chip(hull));
			if (ownerId) chips.push('<a class="chip" href="' + pageHref(ownerId) + '">' + escapeHtml(resolveFieldName(s.frontmatter.owner_faction)) + '</a>');
			if (locId) chips.push('<a class="chip" href="' + pageHref(locId) + '">' + escapeHtml(resolveFieldName(s.frontmatter.current_location)) + '</a>');
			if (chips.length) html += '<div class="chip-row">' + chips.join('') + '</div>';
			html += '</div>';
		});

		html += '<div class="section-title">Vehicles</div>';
		if (vehicles.length === 0) html += '<p class="empty-note">No vehicles recorded yet.</p>';
		vehicles.forEach(function (v) {
			var locId = resolveFieldId(v.frontmatter.current_location);
			html += '<div class="map-system"><div class="map-system-title">' + pageLink(v.id, v.name) + '</div>';
			if (locId) html += '<div class="chip-row"><a class="chip" href="' + pageHref(locId) + '">' + escapeHtml(resolveFieldName(v.frontmatter.current_location)) + '</a></div>';
			html += '</div>';
		});

		main.innerHTML = html;
	}

	function renderCompendiumSection() {
		document.title = 'Compendium - SWN Campaign Compendium';
		var pages = state.pages;
		var compendiumPages = pages.filter(function (p) { return p.folder === 'Compendium'; });

		var html = '<a class="back-link" href="#/">← Overview</a>';
		html += '<div class="section-title">Rules Compendium — ' + compendiumPages.length + ' entries</div>';

		var byCategory = {};
		compendiumPages.forEach(function (p) { byCategory[p.category] = (byCategory[p.category] || 0) + 1; });
		var cats = Object.keys(byCategory).sort(function (a, b) { return byCategory[b] - byCategory[a]; });
		html += '<div class="card-grid">';
		cats.forEach(function (c) {
			var acc = accentForCategory(c);
			var style = acc ? ' style="border-top-color:' + acc + '"' : '';
			html += '<a class="count-card" href="' + browseHref(c) + '"' + style + '><div class="count">' + byCategory[c] + '</div><div class="label">' + escapeHtml(humanCategory(c)) + '</div></a>';
		});
		html += '</div>';

		html += '<div class="section-title">Templates</div>';
		var templates = pages.filter(function (p) { return p.folder === 'z_templates'; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
		if (templates.length === 0) {
			html += '<p class="empty-note">No templates recorded yet.</p>';
		} else {
			html += '<div class="browse-list">' + templates.map(function (t) { return pageLink(t.id, t.name); }).join('') + '</div>';
		}

		main.innerHTML = html;
	}

	// ---- Page view ---------------------------------------------------------

	function renderPage(id) {
		var page = state.byId.get(id);
		if (!page) { renderNotFound(id); return; }

		document.title = page.name + ' - SWN Campaign Compendium';

		var fm = page.frontmatter || {};
		var rawType = fm.type ? String(fm.type) : (FOLDER_SINGULAR[page.folder] || page.folder);
		var type = rawType.charAt(0).toUpperCase() + rawType.slice(1);
		var accent = accentForCategory(page.category);

		var html = '<a class="back-link" href="#/">← Overview</a>';

		html += '<div class="breadcrumb">' +
			'<a href="' + browseHref(page.category) + '">' + escapeHtml(humanCategory(page.category)) + '</a>' +
			' / ' + escapeHtml(page.name) +
			'</div>';

		html += '<div class="page-header"' + (accent ? ' style="border-left-color:' + accent + '"' : '') + '><h1>' + escapeHtml(page.name) + '</h1>';
		html += '<span class="badge"' + (accent ? ' style="border-color:' + accent + ';color:' + accent + '"' : '') + '>' + escapeHtml(type) + '</span>';
		if (fm.status) html += '<span class="badge' + (fm.status === 'active' ? ' active' : '') + '">' + escapeHtml(fm.status) + '</span>';
		html += '</div>';

		var tags = fm.tags || [];
		if (tags.length) html += '<div class="chip-row">' + tags.map(chip).join('') + '</div>';

		var pageImgSrc = imageUrl(fm.image);
		if (pageImgSrc) {
			var dims = Array.isArray(page.image_size) ? page.image_size : null;
			var dimAttrs = dims ? ' width="' + dims[0] + '" height="' + dims[1] + '"' : '';
			html += '<picture class="page-picture">' +
				'<source srcset="' + imageUrl(fm.image, 'webp') + '" type="image/webp">' +
				'<img class="page-image" src="' + pageImgSrc + '" alt="' + escapeHtml(page.name) + '"' + dimAttrs + ' loading="lazy">' +
				'</picture>';
		}

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

		var backlinks = getBacklinks(id);
		if (backlinks.length) {
			var shown = backlinks.slice(0, 24);
			html += '<div class="backlinks-panel"><div class="backlinks-title">Linked from (' + backlinks.length + ')</div>';
			shown.forEach(function (b) {
				var why = b.fields.filter(function (f) { return f !== 'mentions'; }).map(fieldLabel);
				var label = why.length ? why.join(', ') : 'mentioned in text';
				html += '<div class="backlink-row">' + pageLink(b.id, b.name) + '<span class="why"> — ' + escapeHtml(label) + '</span></div>';
			});
			if (backlinks.length > shown.length) html += '<div class="backlink-more">+' + (backlinks.length - shown.length) + ' more</div>';
			html += '</div>';
		}

		main.innerHTML = html;

		var headings = main.querySelectorAll('.page-body h2');
		if (headings.length >= 3) {
			var used = {};
			var tocItems = [];
			headings.forEach(function (h) {
				var slug = slugify(h.textContent) || 'section';
				var hid = slug, n = 2;
				while (used[hid]) { hid = slug + '-' + n; n++; }
				used[hid] = true;
				h.id = hid;
				tocItems.push('<a href="#' + hid + '">' + escapeHtml(h.textContent) + '</a>');
			});
			var tocEl = document.createElement('div');
			tocEl.className = 'page-toc';
			tocEl.innerHTML = '<div class="page-toc-title">On this page</div>' + tocItems.join('');
			var bodyEl = main.querySelector('.page-body');
			bodyEl.parentNode.insertBefore(tocEl, bodyEl);
		}
	}

	function renderNotFound(id) {
		document.title = 'Not found - SWN Campaign Compendium';
		main.innerHTML = '<a class="back-link" href="#/">← Overview</a>' +
			'<p class="error">No page found for "' + escapeHtml(id || '') + '".</p>';
	}

	// ---- Browse / search -----------------------------------------------------

	function renderCategoryTable(pages, cols) {
		var sortKey = null, sortDir = 1;

		function sortedPages() {
			var list = pages.slice();
			if (sortKey) {
				list.sort(function (a, b) {
					var av = a.frontmatter[sortKey], bv = b.frontmatter[sortKey];
					var an = parseFloat(av), bn = parseFloat(bv);
					var cmp;
					if (!isNaN(an) && !isNaN(bn)) cmp = an - bn;
					else cmp = String(av === undefined || av === null ? '' : av).localeCompare(String(bv === undefined || bv === null ? '' : bv));
					return cmp * sortDir;
				});
			} else {
				list.sort(function (a, b) { return a.name.localeCompare(b.name); });
			}
			return list;
		}

		function rowsHtml() {
			return sortedPages().map(function (p) {
				var cells = cols.map(function (c) {
					var v = p.frontmatter[c[0]];
					return '<td>' + (v === undefined || v === null || v === '' ? '' : escapeHtml(v)) + '</td>';
				}).join('');
				return '<tr><td class="name">' + pageLink(p.id, p.name) + '</td>' + cells + '</tr>';
			}).join('');
		}

		var theadCells = '<th data-key="__name">Name</th>' + cols.map(function (c) {
			return '<th data-key="' + escapeHtml(c[0]) + '">' + escapeHtml(c[1]) + '</th>';
		}).join('');

		var wrap = document.createElement('div');
		wrap.className = 'table-wrap';
		wrap.innerHTML = '<table class="data-table"><thead><tr>' + theadCells + '</tr></thead><tbody>' + rowsHtml() + '</tbody></table>';

		var tbody = wrap.querySelector('tbody');
		var ths = wrap.querySelectorAll('th');
		for (var i = 0; i < ths.length; i++) {
			ths[i].addEventListener('click', function () {
				var key = this.getAttribute('data-key');
				if (key === '__name') { sortKey = null; sortDir = 1; }
				else if (sortKey === key) { sortDir = -sortDir; }
				else { sortKey = key; sortDir = 1; }
				for (var j = 0; j < ths.length; j++) ths[j].removeAttribute('data-sort');
				this.setAttribute('data-sort', sortDir === 1 ? 'asc' : 'desc');
				tbody.innerHTML = rowsHtml();
			});
		}

		return wrap;
	}

	function renderBrowse(category, query) {
		document.title = (category ? humanCategory(category) : 'Browse all pages') + ' - SWN Campaign Compendium';
		var pages = state.pages;
		if (category) pages = pages.filter(function (p) { return p.category === category; });

		var q = (query || '').trim().toLowerCase();
		if (q) pages = pages.filter(function (p) { return p.name.toLowerCase().indexOf(q) !== -1; });

		var html = '<a class="back-link" href="#/">← Overview</a>';
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

		var tableCols = category ? TABLE_COLUMNS[category] : null;

		if (tableCols) {
			main.innerHTML = html;
			main.appendChild(renderCategoryTable(pages, tableCols));
		} else if (category) {
			html += '<div class="browse-list">' + pages.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
				.map(function (p) { return pageLink(p.id, p.name); }).join('') + '</div>';
			main.innerHTML = html;
		} else {
			var byCategory = {};
			pages.forEach(function (p) { (byCategory[p.category] = byCategory[p.category] || []).push(p); });
			Object.keys(byCategory).sort().forEach(function (c) {
				var list = byCategory[c].slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
				var acc = accentForCategory(c);
				var dot = acc ? '<span class="accent-dot" style="background:' + acc + '"></span>' : '';
				html += '<div class="browse-group"><h2>' + dot + escapeHtml(humanCategory(c)) + ' (' + list.length + ')</h2>';
				html += '<div class="browse-list">' + list.map(function (p) { return pageLink(p.id, p.name); }).join('') + '</div></div>';
			});
			main.innerHTML = html;
		}

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
		renderTabBar();
		bindGlobalSearch();

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
			state.backlinks = buildBacklinkIndex();
			renderSyncMeta();
			window.addEventListener('hashchange', route);
			route();
		}).catch(function (err) {
			main.innerHTML = '<p class="error">Failed to load campaign data: ' + escapeHtml(err.message) + '</p>';
		});
	}

	init();
})();
