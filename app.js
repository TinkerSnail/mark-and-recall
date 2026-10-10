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
        <div class="label">Mark &amp; Recall’s Magical Guide to Morrowind · experiment 01</div>
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
    const rep = u.rep ? `<p class="mini rep" style="border:0;padding:0;background:none">${esc(u.rep)}</p>` : '';
    const steps = u.steps.slice(0, lim).map((p, i) => {
      const id = `${u.id}:${i}`, on = !!P().checks[id];
      return `<li class="${on ? 'checked' : ''}"><input type="checkbox" data-step="${id}" ${on ? 'checked' : ''} aria-label="Done"><p>${esc(p)}</p></li>`;
    }).join('');
    const more = n > 2 ? `<button class="more" data-act="steps" data-id="${u.id}">${all ? 'Show fewer' : `Show all ${n} steps`}</button>` : '';
    return `
      <article class="card" style="${cvar(g)}">
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
    if (a === 'lead') { S.lead = el.dataset.g; save(); render(); window.scrollTo({ top: 0 }); }
    else if (a === 'steps') { toggle('s:' + el.dataset.id); }
    else if (a === 'links') { toggle('l:' + el.dataset.id); }
    else if (a === 'mini') { toggle(el.dataset.key); }
    else if (a === 'peek') { toggle('p:' + el.dataset.f); }
    else if (a === 'fork') { forkTo(el.dataset.f, el.dataset.b); }
    else if (a === 'commit') { P().choices[el.dataset.f] = el.dataset.b; save(); render(); }
    else if (a === 'uncommit') { delete P().choices[el.dataset.f]; save(); render(); }
    else if (a === 'jump') { document.getElementById(el.dataset.to)?.scrollIntoView({ block: 'start' }); }
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

  render();
})();
