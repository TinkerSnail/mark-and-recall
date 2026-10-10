// Mark & Recall, experiment 01: two guides, one town, forks flagged while you're still upstream of them.
// Data comes from data.js (tools/build_lab.py). Progress lives in localStorage, per playthrough.
(() => {
  const LAB = window.LAB;
  const G = LAB.guides;
  const KEY = 'mw-guide-lab-v1';
  const other = g => (g === 'tarvis' ? 'karpah' : 'tarvis');
  const unit = {};
  for (const g of Object.keys(G)) for (const u of G[g].units) unit[u.id] = u;

  // Links in both directions, strongest first.
  const linksOf = {};
  for (const l of LAB.links) {
    (linksOf[l.a] ||= []).push({ ...l, id: l.b });
    (linksOf[l.b] ||= []).push({ ...l, id: l.a });
  }
  for (const k in linksOf) linksOf[k].sort((x, y) => y.score - x.score);

  // Names whose fate depends on a fork.
  const roles = {};
  for (const f of LAB.forks) for (const b of f.branches) {
    for (const n of b.casualties || []) (roles[n] ||= []).push({ f, b, kind: 'casualty' });
    if (b.gatekeeper) (roles[b.gatekeeper] ||= []).push({ f, b, kind: 'gate' });
  }

  // ---------------------------------------------------------------- state

  const fresh = () => ({
    lead: 'tarvis', active: 'p1', order: ['p1'],
    pts: { p1: { name: 'Nerevarine', parent: null, checks: {}, choices: {} } },
  });
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { S = fresh(); }
  if (!S.pts || !S.pts[S.active]) S = fresh();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: session only */ } };
  const P = () => S.pts[S.active];
  const open = new Set(); // UI expansions, not persisted

  const applyTheme = () => {
    if (S.theme) document.documentElement.dataset.theme = S.theme;
    else delete document.documentElement.dataset.theme;
  };

  // ---------------------------------------------------------------- helpers

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cvar = g => `--c: var(--${g}); --cbg: var(--${g}-bg);`;

  // Dunmer brush glyphs lifted from the game's town banners (tools/make_textures.py)
  const GLYPHS = ['vos', 'hla-oad', 'khull', 'sadrith-mora', 'gnaar-mok', 'ald-velothi', 'tel-aruhn', 'tel-vos'];
  const FORK_GLYPH = { 'guild-war': 'vos', 'great-house': 'hla-oad' };
  const glyphFor = id => GLYPHS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % GLYPHS.length];
  const glyphCol = name => `textures/glyphs/col-${name}.webp`;
  const leadUnits = () => G[S.lead].units.filter(u => !u.downstream);
  const doneIn = u => u.steps.reduce((n, _, i) => n + (P().checks[`${u.id}:${i}`] ? 1 : 0), 0);
  const clip = (s, n) => (s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + '…' : s);
  const branchOf = (f, id) => f.branches.find(b => b.id === id);

  function forkSlots(units) {
    const at = {};
    for (const f of LAB.forks) {
      // A quest-giver is a stronger anchor than a passing mention (Caius's first errand name-drops Eydis).
      let i = units.findIndex(u => f.anchor.includes(u.giver));
      if (i < 0) i = units.findIndex(u => f.anchor.some(a => u.npcs.slice(0, 4).includes(a)));
      if (i >= 0) (at[i] ||= []).push(f);
    }
    return at;
  }

  function chip(name, cls = '') {
    let extra = '';
    let tip = [];
    for (const r of roles[name] || []) {
      const chosen = P().choices[r.f.id];
      if (r.kind === 'casualty') {
        if (chosen === r.b.id) { extra = ' doomed'; tip.push(`Dies on this playthrough's road (${r.b.label})`); }
        else if (!chosen) { extra = ' doomed maybe'; tip.push(`Dies if you take ${r.b.label}`); }
        else tip.push(`Safe on your road (${branchOf(r.f, chosen).label})`);
      } else if (r.kind === 'gate') {
        extra = ' gate';
        tip.push(`Recruiter for ${r.b.label}. ${r.f.title}: join one House and the others close`);
      }
    }
    return `<span class="chip${cls ? ' ' + cls : ''}${extra}" data-ent="${esc(name)}"${tip.length ? ` title="${esc(tip.join(' · '))}"` : ''}>${esc(name)}</span>`;
  }

  const entityChips = (u, n = 8) =>
    u.npcs.slice(0, n).map(x => chip(x)).join('') + u.places.slice(0, 3).map(p => chip(p, 'place')).join('');

  // ---------------------------------------------------------------- masthead

  function renderTop() {
    const t = G.tarvis, k = G.karpah;
    const card = (g, x) => `
      <div class="gcard" style="${cvar(g)}">
        <div class="label">${esc(x.shape)}</div>
        <h2><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a></h2>
        <p>${esc(x.title)}${/[.!?]$/.test(x.title) ? '' : '.'} ${esc(x.slice)}.</p>
        <p class="lic">${esc(x.license)}</p>
      </div>`;
    const tl = t.units.length, kl = k.units.filter(u => !u.downstream).length;
    document.getElementById('top').innerHTML = `
      <div class="banner">
        <img class="pinchy" src="pinchy.svg" alt="Pinchy the mudcrab in her purple velvet wizard hat" title="Pinchy, lab assistant">
        <div class="label">Mark &amp; Recall: An Omni Guide to Morrowind · experiment 01</div>
        <h1>Two Guides Walk Into Balmora</h1>
        <p class="dek">tarvis79 walks Balmora building by building. Karpah walks it guild by guild.
          Neither knows the other exists. The game's own list of people and places introduces them,
          and two forks get flagged before you reach them.</p>
      </div>
      <div class="guides">${card('tarvis', t)}${card('karpah', k)}</div>
      <div class="stats">
        <span><b>${tl}</b> tarvis79 stops</span>
        <span><b>${kl}</b> Karpah quests</span>
        <span><b>${LAB.links.length}</b> links found</span>
        <span><b>${LAB.forks.length}</b> forks ahead</span>
        <span><b>${LAB.spine.npcs.toLocaleString()}</b> names from Morrowind.esm</span>
      </div>`;
  }

  // ---------------------------------------------------------------- control bar

  function depth(id) { let d = 0, p = S.pts[id]; while (p && p.parent) { d++; p = S.pts[p.parent]; } return d; }

  function renderBar() {
    const opts = S.order.filter(id => S.pts[id]).map(id => {
      const d = depth(id), nm = S.pts[id].name.split(' ⑂ ').pop();
      return `<option value="${id}"${id === S.active ? ' selected' : ''}>${' '.repeat(d)}${d ? '⑂ ' : ''}${esc(nm)}</option>`;
    }).join('');
    const path = P().name.split(' ⑂ ').map((s, i) => (i ? `<span class="fk">⑂</span> ` : '') + esc(s)).join(' ');
    const units = leadUnits(), slots = forkSlots(units);
    let route = '';
    units.forEach((u, i) => {
      for (const f of slots[i] || []) {
        route += `<button class="fdot${P().choices[f.id] ? ' set' : ''}" data-act="jump" data-to="f-${f.id}" title="Fork: ${esc(f.title)}" aria-label="Jump to fork ${esc(f.title)}"></button><span class="gap"></span>`;
      }
      const d = doneIn(u), n = u.steps.length;
      route += `<button class="dot${d && d === n ? ' done' : d ? ' part' : ''}" style="${cvar(S.lead)}" data-act="jump" data-to="u-${u.id}" title="${esc(u.title)}" aria-label="Jump to ${esc(u.title)}"></button>`;
      if (i < units.length - 1) route += '<span class="gap"></span>';
    });
    document.getElementById('bar').innerHTML = `
      <div class="wrap">
        <span class="seg views" role="tablist" aria-label="View">
          <button role="tab" data-act="view" data-v="walk" aria-pressed="${S.view !== 'time'}" aria-selected="${S.view !== 'time'}">Walkthrough</button>
          <button role="tab" data-act="view" data-v="time" aria-pressed="${S.view === 'time'}" aria-selected="${S.view === 'time'}">Timeline</button>
        </span>
        <span class="label">Lead guide</span>
        <span class="seg">
          <button data-act="lead" data-g="tarvis" style="${cvar('tarvis')}" aria-pressed="${S.lead === 'tarvis'}">tarvis79</button>
          <button data-act="lead" data-g="karpah" style="${cvar('karpah')}" aria-pressed="${S.lead === 'karpah'}">Karpah</button>
        </span>
        <span class="label">Playthrough</span>
        <select id="pt" aria-label="Playthrough">${opts}</select>
        <button class="ghost" data-act="new" title="Start a fresh playthrough">＋ New</button>
        ${S.order.length > 1 ? '<button class="ghost" data-act="del" title="Delete this playthrough">Delete</button>' : ''}
        <span class="spacer"></span>
        <span class="lineage">${path}</span>
        <button class="ghost" data-act="theme" title="Switch light/dark">${document.documentElement.dataset.theme === 'light' ? '☾' : '☀'}</button>
      </div>
      <div class="wrap"><div class="route" aria-label="Route overview">${route}</div></div>`;
  }

  // ---------------------------------------------------------------- braid

  function leadCard(u, g) {
    const n = u.steps.length, d = doneIn(u);
    const all = open.has('s:' + u.id);
    const lim = all ? n : Math.min(n, 2);
    const kicker = g === 'tarvis' ? `${esc(u.group)} · Balmora` : esc(u.faction);
    const quests = g === 'tarvis'
      ? u.quests.map(q => `<span class="chip q" title="Quest">${esc(q.replace(/\s*-\s*/, ' · '))}</span>`).join('')
      : '';
    const joins = (u.factions || []).map(f => `<span class="chip q" title="Joins / ranks up here">✦ ${esc(f.replace(/\s*-\s*/, ' · '))}</span>`).join('');
    const rep = u.rep ? `<p class="rep-line">${esc(u.rep)}</p>` : '';
    const steps = u.steps.slice(0, lim).map((p, i) => {
      const id = `${u.id}:${i}`, on = !!P().checks[id];
      return `<li class="${on ? 'checked' : ''}"><input type="checkbox" data-step="${id}" ${on ? 'checked' : ''} aria-label="Done"><p>${esc(p)}</p></li>`;
    }).join('');
    const more = n > 2 ? `<button class="more" data-act="steps" data-id="${u.id}">${all ? 'Show fewer' : `Show all ${n} steps`}</button>` : '';
    return `
      <article class="card" style="${cvar(g)}">
        <i class="card-glyph" aria-hidden="true" style="background-image:url(${glyphCol(glyphFor(u.id))})"></i>
        <span class="prog${d === n && n ? ' full' : ''}">${d}/${n}</span>
        <div class="label">${kicker}</div>
        <h3>${esc(u.title)}</h3>
        ${rep}
        <div class="chips">${quests}${joins}${entityChips(u)}</div>
        <ol class="steps">${steps}</ol>
        ${more}
      </article>`;
  }

  function mini(v, l, leadId) {
    const key = `m:${leadId}:${v.id}`, exp = open.has(key);
    const g = v.guide;
    const grp = g === 'karpah' ? esc(v.group) : `${esc(v.group)} · Balmora`;
    const badges = (l.sameQuest.length ? '<span class="chip same">same quest</span>' : '')
      + (l.giver ? `<span class="chip giver" title="This stop is where you meet the quest-giver">quest-giver here</span>` : '')
      + l.via.map(x => chip(x)).join('');
    const body = exp
      ? v.steps.map(p => `<p>${esc(p)}</p>`).join('')
      : `<p>${esc(clip(v.steps[0] || '', 260))}</p>`;
    return `
      <div class="mini" style="${cvar(g)}">
        <div class="grp">${grp}</div>
        <h4>${esc(v.title)}</h4>
        ${v.rep && exp ? `<div class="rep">${esc(v.rep)}</div>` : ''}
        <div class="chips">${badges}</div>
        ${body}
        ${v.steps.length > 1 || (v.steps[0] || '').length > 260
          ? `<button class="more" data-act="mini" data-key="${key}">${exp ? 'Collapse' : `Read ${esc(G[g].name)}'s full take (${v.steps.length} paragraph${v.steps.length > 1 ? 's' : ''})`}</button>` : ''}
      </div>`;
  }

  function linkedCol(u, g) {
    const o = other(g);
    const ls = (linksOf[u.id] || []).filter(l => unit[l.id].guide === o);
    const label = `<div class="label mobile-label" style="color:var(--${o})">${esc(G[o].name)} on the same ground</div>`;
    if (!ls.length) {
      return `<div class="linked">${label}<div class="empty"><img class="crab" src="pinchy.svg" alt="" aria-hidden="true">
        <span>Pinchy checked ${esc(G[o].name)}'s guide. Nothing there touches this ${g === 'tarvis' ? 'stop' : 'quest'}${g === 'tarvis' ? ': this one is tarvis79 being thorough' : ''}.</span></div></div>`;
    }
    const all = open.has('l:' + u.id), lim = all ? ls.length : 3;
    const more = ls.length > 3 ? `<button class="more" style="${cvar(o)}" data-act="links" data-id="${u.id}">${all ? 'Show fewer' : `${ls.length - 3} more from ${esc(G[o].name)}`}</button>` : '';
    return `<div class="linked">${label}${ls.slice(0, lim).map(l => mini(unit[l.id], l, u.id)).join('')}${more}</div>`;
  }

  const VERDICT = {
    takes: 'takes this road',
    avoids: 'steers you away',
    documents: 'documents it',
    silent: 'never mentions it',
  };

  function forkCard(f, units, idx) {
    const chosen = P().choices[f.id];
    const passed = units.slice(idx).some(u => doneIn(u) > 0);
    const status = chosen
      ? `<span class="pill ok">This playthrough: ${esc(branchOf(f, chosen).label)}</span>`
      : passed
        ? `<span class="pill">You've passed this marker, but the decision is still ahead. You can still fork.</span>`
        : `<span class="pill">You're upstream. Nothing is locked in.</span>`;
    const branches = f.branches.map(b => {
      const stances = ['tarvis', 'karpah'].map(g => {
        const s = f.stances[g][b.id];
        return `<div class="stance" style="${cvar(g)}"><span class="who">${esc(G[g].name)}</span>
          <span class="verdict ${s.status}">${VERDICT[s.status]}</span>${s.quote ? `<q>${esc(s.quote)}</q>` : ''}${s.note ? `<span class="note">${esc(s.note)}</span>` : ''}</div>`;
      }).join('');
      const acts = chosen === b.id
        ? `<button class="go commit" data-act="uncommit" data-f="${f.id}">✓ Your road · undo</button>`
        : `<button class="go" data-act="fork" data-f="${f.id}" data-b="${b.id}" title="Copy this playthrough into a new one that takes this road">⑂ Fork a playthrough this way</button>
           ${chosen ? '' : `<button class="go commit" data-act="commit" data-f="${f.id}" data-b="${b.id}">Commit this one</button>`}`;
      return `
        <div class="branch${chosen === b.id ? ' chosen' : chosen ? ' dim' : ''}">
          ${b.house ? `<img class="emblem" src="textures/glyphs/house-${b.house.toLowerCase()}.webp" alt="" aria-hidden="true">` : ''}
          <h4>${esc(b.label)}</h4>
          <p class="cost">${esc(b.cost)}</p>
          ${b.keeps ? `<p class="keeps">${esc(b.keeps)}</p>` : ''}
          ${stances}
          <div class="acts">${acts}</div>
        </div>`;
    }).join('');
    const pk = open.has('p:' + f.id);
    let peeks = '';
    if (pk) {
      for (const b of f.branches) for (const g of ['tarvis', 'karpah']) {
        const ps = f.stances[g][b.id].peeks;
        if (!ps.length) continue;
        // A one-liner like "I'll take this option first." needs the paragraph after it for context.
        const shown = ps[0].length < 220 && ps[1] ? ps.slice(0, 2) : ps.slice(0, 1);
        peeks += `<div class="mini" style="${cvar(g)}"><div class="grp">${esc(G[g].name)} · downstream</div><h4>${esc(b.label)}</h4>${shown.map(p => `<p>${esc(clip(p, 700))}</p>`).join('')}</div>`;
      }
      if (!peeks) peeks = '<div class="empty"><img class="crab" src="pinchy.svg" alt="" aria-hidden="true"><span>Pinchy looked. Neither guide walks this one past the decision.</span></div>';
    }
    const hasPeeks = f.branches.some(b => ['tarvis', 'karpah'].some(g => f.stances[g][b.id].peeks.length));
    return `
      <section class="fork" id="f-${f.id}">
        <i class="fork-glyph" aria-hidden="true" style="background-image:url(${glyphCol(FORK_GLYPH[f.id] || glyphFor(f.id))})"></i>
        <div class="flag"><span class="label">⑂ Fork ahead</span>${status}</div>
        <h3>${esc(f.title)}</h3>
        <p class="qn">${esc(f.question)}</p>
        <p class="why">${esc(f.why)}</p>
        <p class="where"><b>The decision itself:</b> ${esc(f.decideAt)}</p>
        <div class="branches">${branches}</div>
        <div class="savehint">Before you commit, make a hard save:
          <code>${esc(f.saveName)}</code>
          <button class="ghost" data-act="copy" data-text="${esc(f.saveName)}">Copy</button>
          ${hasPeeks ? `<span class="spacer"></span><button class="ghost" data-act="peek" data-f="${f.id}">${pk ? 'Hide downstream' : 'Peek downstream'}</button>` : ''}
        </div>
        ${pk ? `<div class="peeks">${peeks}</div>` : ''}
      </section>`;
  }

  function renderMain() {
    if (S.view === 'time') return renderTimeline();
    const g = S.lead, o = other(g), units = leadUnits(), slots = forkSlots(units);
    let html = `
      <div class="colheads">
        <div style="${cvar(g)}"><b>${esc(G[g].name)} leads</b> <span class="label">· ${esc(G[g].shape)}</span></div>
        <div style="${cvar(o)}"><b>${esc(G[o].name)} on the same ground</b></div>
      </div>`;
    let lastGroup = null;
    units.forEach((u, i) => {
      for (const f of slots[i] || []) html += forkCard(f, units, i);
      if (g === 'karpah' && u.group !== lastGroup) {
        html += `<div class="divider"><span>${esc(u.group)}</span></div>`;
        lastGroup = u.group;
      }
      html += `<div class="row" id="u-${u.id}">${leadCard(u, g)}${linkedCol(u, g)}</div>`;
    });
    document.getElementById('app').innerHTML = html;
  }

  function renderFoot() {
    const g = S.lead, o = other(g);
    const leadIds = new Set(leadUnits().map(u => u.id));
    const only = G[o].units.filter(v => !(linksOf[v.id] || []).some(l => leadIds.has(l.id)));
    const items = only.map(v => `<li>${esc(v.title)} <span>· ${esc(o === 'karpah' ? v.group : v.group + ' · Balmora')}${v.downstream ? ' · downstream' : ''}</span></li>`).join('');
    document.getElementById('foot').innerHTML = `
      <details class="only"><summary>Only in ${esc(G[o].name)} (${only.length})</summary>
        <p class="label" style="margin-top:8px">${o === 'karpah'
          ? 'Mostly the Guild War chapters, which happen far from Balmora. The fork cards draw on them.'
          : 'Stops Karpah never visits: farmhouses, tombs, and tarvis79 grinding skills.'}</p>
        <ul>${items}</ul>
      </details>
      <details class="how"><summary>How the guides found each other</summary>
        <ol>
          <li>Both guides were tagged against the game itself: ${LAB.spine.npcs.toLocaleString()} NPC names and Balmora's interiors, read straight out of <i>Morrowind.esm</i>. Neither guide was hand-mapped.</li>
          <li>Rare shared names count more than common ones (Caius Cosades shows up everywhere; Drarayne Thelas doesn't). The same quest title adds a lot, and visiting the quest-giver adds some.</li>
          <li>The forks are written once, against the game, then each guide's <i>entire</i> text is checked for which road it walks. That's how we know tarvis79 quietly takes Percius's road without ever mentioning Sjoring's.</li>
          <li>Trivia from the spine: Bethesda's own record ID for Percius Mercius is <code>persius mercius</code>.</li>
        </ol>
      </details>
      <figure class="assistant">
        <img src="textures/pinchy-field.jpg" alt="In-game screenshot: Pinchy in her wizard hat beside a Telvanni mage in a mushroom tower" width="210" height="201">
        <figcaption><span class="label">Lab assistant</span>
          <b>Pinchy</b>, of <i>MudcrabSilence.esp</i>, photographed supervising a Telvanni.
          She can't die, won't fight back, and has no opinion on the Guild War, which makes her the only neutral party in Balmora.</figcaption>
      </figure>
      <p>Guide text © Travis Whitsitt (tarvis79) and © Rebecca Skinner (Karpah), from GameFAQs. tarvis79 permits reuse with credit;
        Karpah's guide is for personal use, so this lab stays on your machine. Game data © Bethesda Softworks.</p>`;
  }

  // ---------------------------------------------------------------- timeline: the guides as written
  // Each guide is a strip in its own reading order; a piece's width is how much the guide
  // writes about it. Lines join pieces that cover the same ground, so crossings are the same
  // ground covered in a different order. Colors validated against the plot wash (#e6dab9).

  const TL = { tarvis: '#573a98', karpah: '#00806b', fork: '#962f1b', ink: '#2b1d10', wash: '#e6dab9' };
  const wordsIn = u => u.steps.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0);
  const isDone = u => u.steps.length > 0 && doneIn(u) === u.steps.length;

  function laneUnits(g) {
    const us = G[g].units.slice();
    if (g === 'karpah') {
      const key = u => [...u.section.split('.').map(Number), +u.id.split('-')[1]];
      us.sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
    }
    return us;
  }

  // Progress in one guide counts in the other only for the same quest. Meeting a
  // quest-giver isn't the same as doing all of their quests.
  function covered(v) {
    return (linksOf[v.id] || []).some(l => unit[l.id].guide !== v.guide && l.sameQuest.length && isDone(unit[l.id]));
  }

  function decisionBranch(v) {
    for (const f of LAB.forks) for (const b of f.branches) {
      if (b.evidence && v.fullTitle && new RegExp(b.evidence).test(v.fullTitle)) return { f, b };
    }
    return null;
  }

  function renderTimeline() {
    const app = document.getElementById('app');
    const lanes = { tarvis: laneUnits('tarvis'), karpah: laneUnits('karpah') };
    const showSel = ['tarvis', 'karpah'].includes(S.tlShow) ? S.tlShow : 'both';
    const shown = showSel === 'both' ? ['tarvis', 'karpah'] : [showSel];
    const both = shown.length === 2;
    const cs = getComputedStyle(app);
    const avail = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 36; // card padding
    const zoom = Math.min(8, Math.max(1, +S.tlZoom || 1));
    // guide names live in a sticky HTML column, so they stay put while a zoomed chart scrolls
    const LANEW = avail < 640 ? 118 : 190;
    const L = 12, R = 96, H = 18;
    const plotW = Math.round(Math.max(560, avail - LANEW - L - R) * zoom);
    const W = L + plotW + R;
    // tarvis79's stop names sit above its strip, Karpah's chapter names below hers
    const Y = both ? { tarvis: 150, karpah: 330 } : showSel === 'tarvis' ? { tarvis: 150 } : { karpah: 84 };
    const SVGH = both ? 530 : showSel === 'tarvis' ? 300 : 290;

    // lay each lane out across the full plot width: one equal block per stop/quest,
    // or (Size: by words) each block as wide as the guide's text about it
    const byWords = S.tlSize === 'words';
    const pos = {};
    for (const g of shown) {
      const us = lanes[g];
      const len = byWords ? us.map(u => Math.max(40, u.steps.join(' ').length)) : us.map(() => 1);
      const gaps = us.map((u, i) => (i === 0 ? 0 : g === 'karpah' && u.section !== us[i - 1].section ? 8 : 2));
      const k = (plotW - gaps.reduce((a, b) => a + b, 0)) / len.reduce((a, b) => a + b, 0);
      let x = L;
      us.forEach((u, i) => { x += gaps[i]; const w = Math.max(3, len[i] * k); pos[u.id] = { x, w, cx: x + w / 2 }; x += w; });
    }

    const out = [];
    // links first, so pieces sit on top (they need both strips)
    if (both) for (const l of LAB.links) {
      const a = pos[l.a], b = pos[l.b];
      if (!a || !b) continue;
      const y1 = Y.tarvis + H, y2 = Y.karpah, ym = (y1 + y2) / 2;
      const strong = l.sameQuest.length || l.giver;
      out.push(`<path class="link${strong ? ' strong' : ''}" data-a="${l.a}" data-b="${l.b}" d="M${a.cx.toFixed(1)} ${y1} C${a.cx.toFixed(1)} ${ym} ${b.cx.toFixed(1)} ${ym} ${b.cx.toFixed(1)} ${y2}"/>`);
    }

    // lane labels: HTML, pinned to the left edge of the scroller
    const laneHtml = shown.map(g => {
      const words = lanes[g].reduce((n, u) => n + wordsIn(u), 0);
      return `<div class="lane" style="top:${Y[g] + 1}px">
        <div class="lane-name"><i style="background:${TL[g]}"></i>${esc(G[g].name)}</div>
        <div class="lane-sub">${esc(G[g].shape)} · ${words.toLocaleString()} words</div>
        ${S.lead === g ? '<div class="lane-lead">you\'re following this one</div>' : ''}
      </div>`;
    }).join('');

    // pieces
    for (const g of shown) {
      for (const u of lanes[g]) {
        const p = pos[u.id], done = isDone(u), cov = !done && covered(u);
        const op = done || cov ? 1 : u.downstream ? 0.2 : 0.32;
        const dec = g === 'karpah' && u.downstream ? decisionBranch(u) : null;
        const label = `${G[g].name}: ${u.title}. ${done ? 'Done' : cov ? 'Covered by your progress in the other guide' : 'Not done yet'}.`;
        out.push(`<g class="piece" tabindex="0" role="button" data-id="${u.id}" aria-label="${esc(label)}">
          <rect class="hit" x="${p.x - 1}" y="${Y[g] - 6}" width="${p.w + 2}" height="${H + 12}"/>
          <rect class="mark" x="${p.x.toFixed(1)}" y="${Y[g]}" width="${p.w.toFixed(1)}" height="${H}" rx="2" fill="${TL[g]}" fill-opacity="${op}"/>
          ${dec ? `<rect x="${(p.x - 2).toFixed(1)}" y="${Y[g] - 2}" width="${(p.w + 4).toFixed(1)}" height="${H + 4}" rx="3" fill="none" stroke="${TL.fork}" stroke-width="2"/>` : ''}
        </g>`);
      }
    }

    // tarvis79: stop names above the strip, nudged apart so they never stack
    let lastX = -99;
    if (Y.tarvis != null) for (const u of lanes.tarvis) {
      const p = pos[u.id];
      const lx = Math.max(p.cx, lastX + 15);
      lastX = lx;
      const name = u.title.length > 26 ? u.title.slice(0, 25) + '…' : u.title;
      if (lx - p.cx > 1) out.push(`<path class="leader" d="M${p.cx.toFixed(1)} ${Y.tarvis - 3} L${lx.toFixed(1)} ${Y.tarvis - 9}"/>`);
      out.push(`<text class="tick" transform="translate(${lx.toFixed(1)} ${Y.tarvis - 11}) rotate(-52)">${esc(name)}</text>`);
    }

    // Karpah: chapter brackets below the strip
    if (Y.karpah != null) {
      lastX = -99;
      const chapters = [];
      for (const u of lanes.karpah) {
        const c = chapters[chapters.length - 1];
        if (c && c.section === u.section) c.x1 = pos[u.id].x + pos[u.id].w;
        else chapters.push({ section: u.section, x0: pos[u.id].x, x1: pos[u.id].x + pos[u.id].w, u });
      }
      const yb = Y.karpah + H + 7;
      for (const c of chapters) out.push(`<path class="bracket" d="M${c.x0.toFixed(1)} ${yb - 3} V${yb} H${c.x1.toFixed(1)} V${yb - 3}"/>`);
      // zoomed out: one name per chapter. Zoomed in (2x+): every quest gets its own name.
      const tags = zoom >= 2
        ? lanes.karpah.map(u => ({ x: pos[u.id].cx, text: u.title, later: u.downstream }))
        : chapters.map(c => ({ x: (c.x0 + c.x1) / 2, text: (c.u.giver || c.u.group.replace(/^\[[\d.]+\]\s*/, '')) + (c.u.downstream ? ' (after Balmora)' : ''), later: c.u.downstream }));
      for (const t of tags) {
        const lx = Math.max(t.x, lastX + 15);
        lastX = lx;
        const text = t.text.length > 30 ? t.text.slice(0, 29) + '…' : t.text;
        out.push(`<text class="tick${t.later ? ' later' : ''}" transform="translate(${lx.toFixed(1)} ${yb + 12}) rotate(52)">${esc(text)}</text>`);
      }
    }

    // fork gates: where each guide reaches the fork; joined across the strips when both show
    const notes = [];
    for (const f of LAB.forks) {
      const gate = {};
      for (const g of shown) {
        const us = lanes[g].filter(u => !u.downstream);
        let i = us.findIndex(u => f.anchor.includes(u.giver));
        if (i < 0) i = us.findIndex(u => f.anchor.some(a => u.npcs.slice(0, 4).includes(a)));
        if (i >= 0) gate[g] = pos[us[i].id].x - 2;
      }
      if (both && gate.tarvis != null && gate.karpah != null) {
        const t1 = Y.tarvis + H + 12, k1 = Y.karpah - 12, ym = (t1 + k1) / 2;
        out.push(`<path class="gate" d="M${gate.tarvis.toFixed(1)} ${Y.tarvis - 6} V${t1}"/>`,
          `<path class="gate" d="M${gate.karpah.toFixed(1)} ${k1} V${Y.karpah + H + 4}"/>`,
          `<path class="gate-link" d="M${gate.tarvis.toFixed(1)} ${t1} C${gate.tarvis.toFixed(1)} ${ym} ${gate.karpah.toFixed(1)} ${ym} ${gate.karpah.toFixed(1)} ${k1}"/>`,
          `<text class="gate-label" x="${((gate.tarvis + gate.karpah) / 2).toFixed(1)}" y="${ym + 4}" text-anchor="middle">⑂ ${esc(f.title)}</text>`);
      } else if (!both && gate[showSel] != null) {
        // one strip: the gate runs past the pin row to its own label row
        const x = gate[showSel], y = Y[showSel];
        const [y0, y1, ly] = showSel === 'tarvis' ? [y - 6, y + H + 44, y + H + 58] : [y - 44, y + H + 4, y - 50];
        out.push(`<path class="gate" d="M${x.toFixed(1)} ${y0} V${y1}"/>`,
          `<text class="gate-label" x="${(x + 4).toFixed(1)}" y="${ly}">⑂ ${esc(f.title)}</text>`);
      }
      // where does tarvis79 actually commit? (found by the build, from his full text)
      const took = f.branches.find(b => f.stances.tarvis[b.id].status === 'takes');
      const where = took && f.stances.tarvis[took.id].where;
      if (Y.tarvis != null && where && where !== 'Balmora & Wilderness') notes.push(`⑂ ${f.title}: tarvis79 commits to ${took.label} later, in “${where}” →`);
    }
    const noteY = both ? Y.tarvis + H + 44 : (Y.tarvis || 0) + H + 84;
    notes.forEach((n, i) => out.push(`<text class="gate-note" x="${L + plotW}" y="${noteY + i * 19}" text-anchor="end">${esc(n)}</text>`));

    // You are here: first unfinished piece in the guide you're following,
    // and the matching spot in the other guide
    const lead = S.lead, oth = other(lead);
    const leadList = lanes[lead].filter(u => !u.downstream);
    let hi = leadList.findIndex(u => !isDone(u));
    const anyDone = leadList.some(isDone);
    let match = null;
    for (let i = hi < 0 ? leadList.length - 1 : hi; i >= 0 && !match; i--) {
      const ls = (linksOf[leadList[i].id] || []).filter(l => unit[l.id].guide === oth);
      if (ls.length) match = ls[0].id;
    }
    const pin = (g, x, solid, text) => {
      const below = g === 'tarvis';
      const tip = below ? Y[g] + H + 2 : Y[g] - 2, body = below ? tip + 17 : tip - 17;
      const anchor = x > L + plotW - 170 ? 'end' : 'start';
      const tx = anchor === 'end' ? x - 12 : x + 12;
      return `<g class="pin">
        <path d="M${x.toFixed(1)} ${tip} L${(x - 5).toFixed(1)} ${(body + (below ? -4 : 4)).toFixed(1)} L${(x + 5).toFixed(1)} ${(body + (below ? -4 : 4)).toFixed(1)} Z" fill="${TL.ink}"/>
        <circle cx="${x.toFixed(1)}" cy="${body}" r="7" fill="${solid ? TL.ink : TL.wash}" stroke="${TL.ink}" stroke-width="2"/>
        ${solid ? `<circle cx="${x.toFixed(1)}" cy="${body}" r="2.5" fill="#e9c457"/>` : ''}
        <text class="pin-label" x="${tx.toFixed(1)}" y="${body + 5}" text-anchor="${anchor}">${esc(text)}</text>
      </g>`;
    };
    if (pos[leadList[0].id]) {
      const last = pos[leadList[leadList.length - 1].id];
      const hereX = hi < 0 ? last.x + last.w : pos[leadList[hi].id].x;
      out.push(pin(lead, hereX, true, hi < 0 ? 'You are here: Balmora done!' : anyDone ? 'You are here' : 'You are here: just off the boat'));
    }
    if (match && pos[match]) out.push(pin(oth, pos[match].cx, false, both ? `≈ here in ${G[oth].name}` : `≈ you are here (following ${G[lead].name})`));

    const leadName = esc(G[lead].name), othName = esc(G[oth].name);
    const rows = shown.map(g => lanes[g].map((u, i) => {
      const done = isDone(u), cov = !done && covered(u);
      const nl = (linksOf[u.id] || []).filter(l => unit[l.id].guide !== g).length;
      return `<tr><td><span class="sw" style="background:${TL[g]}"></span>${esc(G[g].name)}</td><td>${i + 1}</td>
        <td>${esc(g === 'tarvis' ? u.group : u.group.replace(/^\[([\d.]+)\].*/, '§$1'))}</td><td>${esc(u.title)}${u.downstream ? ' <i>(after Balmora)</i>' : ''}</td>
        <td class="num">${wordsIn(u).toLocaleString()}</td><td class="num">${nl}</td>
        <td>${done ? 'Done' : cov ? 'Covered' : '—'}</td></tr>`;
    }).join('')).join('');

    const blocks = byWords
      ? ' Block widths show how many words the guide spends on each one, so the long blocks are where it lingers.'
      : '';
    const dek = both
      ? `Each strip is one guide, read left to right. Each block is one stop (tarvis79) or one quest (Karpah).${blocks}
         Lines join blocks about the same people and places, so <b>where lines cross, the guides cover the
         same ground in a different order</b>. You're following ${leadName}; the hollow pin is the matching
         spot in ${othName}.`
      : `${esc(G[showSel].name)} on its own, read left to right, one block per ${showSel === 'tarvis' ? 'stop' : 'quest'}.${blocks}
         Show both guides to see how it lines up with ${esc(G[other(showSel)].name)}.`;
    const sbtn = (v, text) => `<button data-act="tlsize" data-v="${v}" aria-pressed="${(S.tlSize === 'words') === (v === 'words')}">${text}</button>`;
    const fbtn = (v, text, c) => `<button data-act="tlshow" data-v="${v}" style="--c: ${c}" aria-pressed="${showSel === v}">${text}</button>`;

    app.innerHTML = `
      <section class="card timeline" style="--c: var(--tarvis)">
        <i class="card-glyph tl-glyph" aria-hidden="true" style="background-image:url(${glyphCol('tel-vos')})"></i>
        <div class="label">Timeline</div>
        <h3>The guides, as written</h3>
        <p class="tl-dek">${dek}</p>
        <div class="tl-filter">
          <span class="label">Show</span>
          <span class="seg" role="group" aria-label="Show">
            ${fbtn('both', 'Both guides', 'var(--trim)')}${fbtn('tarvis', 'tarvis79', TL.tarvis)}${fbtn('karpah', 'Karpah', TL.karpah)}
          </span>
          <span class="label">Size</span>
          <span class="seg" role="group" aria-label="Block size">${sbtn('equal', 'Equal')}${sbtn('words', 'By words')}</span>
          <span class="label">Zoom</span>
          <span class="seg zoom" role="group" aria-label="Zoom">
            <button data-act="tlzoom" data-z="out" aria-label="Zoom out" ${zoom <= 1 ? 'disabled' : ''}>−</button>
            <button data-act="tlzoom" data-z="fit" aria-label="Fit to width">${zoom === 1 ? 'Fit' : `${+zoom.toFixed(2)}×`}</button>
            <button data-act="tlzoom" data-z="in" aria-label="Zoom in" ${zoom >= 8 ? 'disabled' : ''}>+</button>
          </span>
          <span class="tl-hint">or pinch / ⌘-scroll on the chart${zoom < 2 ? ' · 2× names every quest' : ''}</span>
        </div>
        <div class="tl-legend" aria-hidden="true">
          ${shown.includes('tarvis') ? `<span><i class="key sw" style="background:${TL.tarvis}"></i>tarvis79</span>` : ''}
          ${shown.includes('karpah') ? `<span><i class="key sw" style="background:${TL.karpah}"></i>Karpah</span>` : ''}
          <span><i class="key sw faded" style="background:${TL.ink}"></i>pale = not done yet</span>
          ${both ? '<span><i class="key line"></i>same people or places</span><span><i class="key line strong"></i>same quest</span>' : ''}
          <span><i class="key gate"></i>fork ahead</span>
          ${shown.includes('karpah') ? '<span><i class="key ring"></i>where a fork is decided</span>' : ''}
        </div>
        <div class="tl-scroll" data-plotw="${plotW}" data-lanew="${LANEW}" data-l="${L}">
          <div class="tl-inner" style="grid-template-columns: ${LANEW}px ${W}px">
          <div class="tl-lanes" style="height:${SVGH}px">${laneHtml}</div>
          <svg width="${W}" height="${SVGH}" viewBox="0 0 ${W} ${SVGH}" role="img" aria-label="Timeline of ${both ? 'both guides with links' : esc(G[showSel].name)}, forks and your position">
            ${out.join('')}
          </svg>
          </div>
          <div class="tl-tip" role="tooltip" hidden></div>
        </div>
        <details class="tl-table"><summary>Show as a table</summary>
          <table>
            <thead><tr><th>Guide</th><th>#</th><th>Where</th><th>Piece</th><th class="num">Words</th><th class="num">Links</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </details>
      </section>`;
    wireTimeline(pos, Y);
  }

  function wireTimeline(pos, Y) {
    const box = document.querySelector('.tl-scroll');
    const tip = box.querySelector('.tl-tip');
    const show = (g, evt) => {
      const u = unit[g.dataset.id];
      const done = isDone(u), cov = !done && covered(u);
      const links = (linksOf[u.id] || []).filter(l => unit[l.id].guide !== u.guide);
      const dec = u.downstream ? decisionBranch(u) : null;
      tip.replaceChildren();
      const line = (text, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = text; tip.appendChild(d); };
      line(u.title, 'tt-title');
      line(`${G[u.guide].name} · ${u.guide === 'tarvis' ? u.group : u.group.replace(/^\[[\d.]+\]\s*/, '')}`, 'tt-sub');
      line(`${wordsIn(u).toLocaleString()} words · ${u.steps.length} step${u.steps.length === 1 ? '' : 's'}`);
      line(done ? 'Done' : cov ? `Covered by your progress in ${G[other(u.guide)].name}` : u.downstream ? 'After Balmora' : 'Not done yet');
      if (dec) line(`⑂ ${dec.f.title}: ${dec.b.label} is decided here`, 'tt-fork');
      line(links.length ? `Linked to ${links.length} in ${G[other(u.guide)].name}` : `Nothing matching in ${G[other(u.guide)].name}`, 'tt-sub');
      document.querySelectorAll('.link').forEach(p => p.classList.toggle('hot', p.dataset.a === u.id || p.dataset.b === u.id));
      document.querySelectorAll('.piece').forEach(s => s.classList.toggle('mate', links.some(l => l.id === s.dataset.id)));
      tip.hidden = false;
      const r = box.getBoundingClientRect(), p = pos[u.id];
      const segY = Y[u.guide];
      let x = (evt && evt.clientX ? evt.clientX - r.left + box.scrollLeft : p.cx + +box.dataset.lanew) + 14;
      x = Math.min(x, box.scrollLeft + box.clientWidth - tip.offsetWidth - 8);
      tip.style.left = `${Math.max(box.scrollLeft + 8, x)}px`;
      tip.style.top = `${u.guide === 'tarvis' ? segY + 34 : segY - tip.offsetHeight - 14}px`;
    };
    const hide = () => {
      tip.hidden = true;
      document.querySelectorAll('.link.hot').forEach(p => p.classList.remove('hot'));
      document.querySelectorAll('.piece.mate').forEach(s => s.classList.remove('mate'));
    };
    box.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey)) return; // trackpad pinch arrives as ctrl+wheel
      e.preventDefault();
      setZoom((+S.tlZoom || 1) * Math.exp(-e.deltaY * 0.01), e.clientX);
    }, { passive: false });
    box.querySelectorAll('.piece').forEach(g => {
      g.addEventListener('pointermove', e => show(g, e));
      g.addEventListener('pointerleave', hide);
      g.addEventListener('focus', () => show(g));
      g.addEventListener('blur', hide);
      const go = () => openInWalkthrough(unit[g.dataset.id]);
      g.addEventListener('click', go);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  // Zoom keeps the spot under the pointer (or the middle of the view) where it was.
  function setZoom(z, clientX) {
    const box = document.querySelector('.tl-scroll');
    const cur = Math.min(8, Math.max(1, +S.tlZoom || 1));
    z = Math.min(8, Math.max(1, Math.round(z * 4) / 4));
    if (!box || z === cur) return;
    const r = box.getBoundingClientRect();
    const px = clientX != null ? clientX - r.left : box.clientWidth / 2;
    const lead = +box.dataset.lanew + +box.dataset.l;
    const frac = (box.scrollLeft + px - lead) / +box.dataset.plotw;
    S.tlZoom = z;
    save();
    renderMain();
    const nb = document.querySelector('.tl-scroll');
    nb.scrollLeft = Math.max(0, frac * +nb.dataset.plotw + lead - px);
  }

  function openInWalkthrough(u) {
    S.view = 'walk';
    let target = `u-${u.id}`;
    if (u.downstream) {
      const dec = decisionBranch(u);
      S.lead = S.lead || 'tarvis';
      if (dec) { open.add('p:' + dec.f.id); target = `f-${dec.f.id}`; }
    } else {
      S.lead = u.guide;
    }
    save();
    render();
    // instant: we just swapped views, so a long smooth scroll from the top would only be a delay
    document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function render() {
    applyTheme();
    renderTop();
    renderBar();
    renderMain();
    renderFoot();
  }

  // ---------------------------------------------------------------- actions

  let toastTimer;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 4200);
  }

  function forkTo(fid, bid) {
    const f = LAB.forks.find(x => x.id === fid), b = branchOf(f, bid), parent = P();
    const id = 'p' + Date.now().toString(36);
    S.pts[id] = {
      name: `${parent.name} ⑂ ${b.label}`,
      parent: S.active,
      from: { fork: fid, branch: bid, on: new Date().toISOString().slice(0, 10) },
      checks: { ...parent.checks },
      choices: { ...parent.choices, [fid]: bid },
    };
    // Slot the child after its parent's last descendant so the menu reads as a tree.
    let at = S.order.indexOf(S.active);
    while (at + 1 < S.order.length && depth(S.order[at + 1]) > depth(S.active)) at++;
    S.order.splice(at + 1, 0, id);
    S.active = id;
    save();
    render();
    toast(`Forked into "${b.label}". Make a hard save named "${f.saveName}".`);
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act;
    if (a === 'tlshow') { S.tlShow = el.dataset.v; save(); renderMain(); }
    else if (a === 'tlsize') { S.tlSize = el.dataset.v; save(); renderMain(); }
    else if (a === 'tlzoom') {
      const z = +S.tlZoom || 1;
      setZoom(el.dataset.z === 'in' ? z * 1.5 : el.dataset.z === 'out' ? z / 1.5 : 1);
    }
    else if (a === 'view') { S.view = el.dataset.v; save(); render(); window.scrollTo({ top: 0 }); }
    else if (a === 'lead') { S.lead = el.dataset.g; save(); render(); window.scrollTo({ top: 0 }); }
    else if (a === 'steps') { toggle('s:' + el.dataset.id); }
    else if (a === 'links') { toggle('l:' + el.dataset.id); }
    else if (a === 'mini') { toggle(el.dataset.key); }
    else if (a === 'peek') { toggle('p:' + el.dataset.f); }
    else if (a === 'fork') { forkTo(el.dataset.f, el.dataset.b); }
    else if (a === 'commit') { P().choices[el.dataset.f] = el.dataset.b; save(); render(); }
    else if (a === 'uncommit') { delete P().choices[el.dataset.f]; save(); render(); }
    else if (a === 'jump') {
      if (S.view === 'time') { S.view = 'walk'; save(); render(); }
      document.getElementById(el.dataset.to)?.scrollIntoView({ block: 'start' });
    }
    else if (a === 'copy') {
      const txt = el.dataset.text;
      Promise.resolve(navigator.clipboard?.writeText(txt)).then(() => toast(`Copied "${txt}"`), () => toast(txt));
    }
    else if (a === 'theme') {
      const cur = document.documentElement.dataset.theme
        || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      S.theme = cur === 'light' ? 'dark' : 'light';
      save(); render();
    }
    else if (a === 'new') {
      const name = prompt('Name the new playthrough', 'Nerevarine ' + (S.order.length + 1));
      if (!name) return;
      const id = 'p' + Date.now().toString(36);
      S.pts[id] = { name: name.replace(/⑂/g, ''), parent: null, checks: {}, choices: {} };
      S.order.push(id); S.active = id; save(); render();
    }
    else if (a === 'del') {
      if (!confirm(`Delete "${P().name}"? Its forks keep their own copies of progress.`)) return;
      const gone = S.active, parent = S.pts[gone].parent;
      for (const id of S.order) if (S.pts[id].parent === gone) S.pts[id].parent = parent;
      delete S.pts[gone];
      S.order = S.order.filter(id => id !== gone);
      S.active = parent && S.pts[parent] ? parent : S.order[0];
      save(); render();
    }
  });

  function toggle(k) { open.has(k) ? open.delete(k) : open.add(k); render(); }

  document.addEventListener('change', e => {
    if (e.target.id === 'pt') { S.active = e.target.value; save(); render(); return; }
    const step = e.target.dataset.step;
    if (step) {
      if (e.target.checked) P().checks[step] = 1; else delete P().checks[step];
      save(); render();
    }
  });

  // Hover a name and every mention of it lights up, in both guides.
  document.addEventListener('mouseover', e => {
    const c = e.target.closest('.chip[data-ent]');
    if (!c) return;
    const n = c.dataset.ent;
    document.querySelectorAll('.chip[data-ent]').forEach(x => x.classList.toggle('hot', x.dataset.ent === n));
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('.chip[data-ent]')) document.querySelectorAll('.chip.hot').forEach(x => x.classList.remove('hot'));
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (S.view === 'time') renderMain(); }, 150);
  });

  render();
})();
