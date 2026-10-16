/* Kleos — shared: the collection, the bag, the drawer, the nav. */
const K = (() => {
  const API = /^https?:$/.test(location.protocol) && !/claude|anthropic/.test(location.hostname) ? '' : 'https://aura-app-production-c2eb.up.railway.app';
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };

  const P = [
    // Issue Nº 001 — La Côte
    { id:'villa_tee', line:'cote', name:'Villa Kleos', kind:'T-shirt', price:68, ed:100, img:'villa_tee', colour:'White',
      blurb:'Heavy white cotton. Caillebotte’s villas above Trouville across the back, a small Kleos at the chest.',
      facts:[['Cloth','240 gsm combed cotton'],['Print','One-colour screen print, Kleos blue'],['Fit','Boxy, dropped shoulder'],['Made','Portugal']] },
    { id:'rowing_long', line:'cote', name:'Kleos Rowing Club', kind:'Long sleeve', price:78, ed:100, img:'rowing_long', colour:'Ivory',
      blurb:'Eakins’ pair turning the stake, set in an arch on the back. Crossed oars embroidered at the chest.',
      facts:[['Cloth','220 gsm cotton jersey'],['Print','Screen print and embroidery'],['Fit','Regular, long in the body'],['Made','Portugal']] },
    { id:'regates_crew', line:'cote', name:'Régates', kind:'Crewneck', price:128, ed:100, img:'regates_crew', colour:'Cream',
      blurb:'Loopback crew in cream. Manet’s boats off Berck in an oval on the back, ringed in type.',
      facts:[['Cloth','400 gsm loopback cotton'],['Detail','Ribbed cuffs and hem'],['Fit','Relaxed'],['Made','Portugal']] },
    { id:'bains_tee', line:'cote', name:'Les bains de mer', kind:'T-shirt', price:68, ed:100, img:'bains_tee', colour:'Pale blue',
      blurb:'Pale blue, with Boudin’s beach at Deauville on the back. Nothing on the front.',
      facts:[['Cloth','240 gsm combed cotton'],['Print','One-colour screen print'],['Fit','Boxy'],['Made','Portugal']] },
    { id:'quarterzip', line:'cote', name:'The Quarter-zip', kind:'Knit', price:165, ed:100, img:'quarterzip', colour:'Ivory',
      blurb:'Extra-fine merino with a ribbed stand collar. Kleos at the chest and again at the hem.',
      facts:[['Cloth','Extra-fine merino, 12 gauge'],['Detail','Metal zip, ribbed stand'],['Fit','Regular'],['Made','Portugal']] },
    { id:'oxford', line:'cote', name:'The Oxford', kind:'Shirt', price:125, ed:100, img:'oxford', colour:'White, blue stripe',
      blurb:'Button-down in a fine blue pinstripe, box pleat at the back. Crossed oars on the pocket.',
      facts:[['Cloth','Supima cotton oxford'],['Detail','Mother-of-pearl buttons'],['Fit','Straight, a touch long'],['Made','Portugal']] },
    { id:'linen_trouser', line:'cote', name:'Linen Trouser', kind:'Trouser', price:140, ed:100, img:'linen_trouser', colour:'Cream',
      blurb:'Italian linen, one reverse pleat, side adjusters instead of belt loops at the back.',
      facts:[['Cloth','Italian linen, 260 gsm'],['Detail','Side adjusters, pressed crease'],['Fit','Straight, full break'],['Made','Italy']] },
    { id:'stripe_trouser', line:'cote', name:'Striped Trouser', kind:'Trouser', price:150, ed:100, img:'stripe_trouser', colour:'White and navy',
      blurb:'White linen with a wide navy stripe. For the deck, and for dinner after.',
      facts:[['Cloth','Linen and cotton, 240 gsm'],['Detail','Drawcord inside, flat front'],['Fit','Straight, cropped'],['Made','Italy']] },
    { id:'laurel_cap', line:'cote', name:'The Laurel Cap', kind:'Cap', price:0, ed:0, earned:true, img:'laurel_cap', colour:'Ivory',
      blurb:'Not for sale. It arrives when your Aura Index in the app reaches 80, shipped free with your number inside.',
      facts:[['Cloth','Washed cotton twill'],['Mark','Laurel K, embroidered'],['How','Earned in the app at 80'],['Made','Portugal']] },
    // Nº 002 preview — Chez moi, the night line
    { id:'dry_tee', line:'night', name:'Dry, with a twist', kind:'T-shirt', price:68, ed:100, img:'dry_tee', colour:'White',
      blurb:'A martini on the back, a smaller one at the chest. For the bar that stays open.',
      facts:[['Cloth','240 gsm combed cotton'],['Print','Navy screen print, embroidered chest'],['Fit','Boxy'],['Made','Portugal']] },
    { id:'dernier_baby', line:'night', name:'Un dernier verre', kind:'Baby tee', price:62, ed:100, img:'dernier_baby', colour:'Blush',
      blurb:'Fitted blush tee. Hôtel Kleos, Saint-Tropez, on the back; Chez moi at the chest.',
      facts:[['Cloth','Cotton rib, 180 gsm'],['Print','Claret screen print'],['Fit','Fitted, cropped'],['Made','Portugal']] },
    { id:'sobremesa_long', line:'night', name:'Sobremesa', kind:'Long sleeve', price:78, ed:100, img:'sobremesa_long', colour:'Butter',
      blurb:'The table doesn’t get up until the conversation’s done. Madrid, until late.',
      facts:[['Cloth','220 gsm cotton jersey'],['Print','Navy screen print'],['Fit','Regular'],['Made','Portugal']] },
    { id:'insomnie_baby', line:'night', name:'Club des Insomniaques', kind:'Baby tee', price:62, ed:100, img:'insomnie_baby', colour:'White',
      blurb:'Paris, since midnight. A crescent at the chest, the club seal on the back.',
      facts:[['Cloth','Cotton rib, 180 gsm'],['Print','Navy screen print'],['Fit','Fitted, cropped'],['Made','Portugal']] },
    { id:'soleil_polo', line:'night', name:'Le soleil se lève', kind:'Knit polo', price:115, ed:100, img:'soleil_polo', colour:'Ivory',
      blurb:'The sun comes up, we go home. Knit polo with Chez moi stitched at the chest.',
      facts:[['Cloth','Cotton piqué knit'],['Detail','Two-button placket'],['Fit','Regular'],['Made','Portugal']] },
    { id:'mayfair_crew', line:'night', name:'Never early', kind:'Crewneck', price:128, ed:100, img:'mayfair_crew', colour:'Navy',
      blurb:'Never early. Never rushed. The Kleos Club, Mayfair, in ivory on navy.',
      facts:[['Cloth','400 gsm loopback cotton'],['Print','Ivory screen print'],['Fit','Relaxed'],['Made','Portugal']] },
  ];
  const byId = Object.fromEntries(P.map(p => [p.id, p]));
  const $ = (s, r = document) => r.querySelector(s);
  const money = n => '$' + n;
  const SIZES = { 'Trouser':['28','30','32','34','36'], 'Cap':['One size'], 'Baby tee':['XS','S','M','L'] };

  // ---------- toast
  let tt; function toast(t) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role','status'); document.body.appendChild(el); } el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2600); }

  // ---------- card
  function card(p) {
    const b = document.createElement('button'); b.className = 'card'; b.type = 'button'; b.dataset.id = p.id;
    b.setAttribute('aria-label', `${p.name}, ${p.kind}${p.earned ? ', earned' : ', ' + money(p.price)}`);
    b.innerHTML = `<div class="ph">${p.earned ? '<span class="tag">Earned, not sold</span>' : ''}<img class="f" src="img/${p.img}_f.webp" alt="" loading="lazy"><img class="b" src="img/${p.img}_b.webp" alt="" loading="lazy"></div>
      <div class="meta"><span class="nm">${p.name}</span><span class="pr">${p.earned ? 'Index 80' : money(p.price)}</span></div><span class="sub">${p.kind} · ${p.colour}</span>`;
    b.addEventListener('click', () => openPiece(p.id));
    return b;
  }

  // ---------- drawer
  let lastFocus = null;
  function ensureShell() {
    if ($('#drawer')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="scrim" id="scrim"></div>
      <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="dname" aria-hidden="true">
        <button class="x" id="dx" aria-label="Close">×</button>
        <div class="stage"><img id="dimg" alt=""><div class="views"><button id="vf" aria-pressed="true">Front</button><button id="vb" aria-pressed="false">Back</button></div></div>
        <div class="info">
          <span class="note" id="dline"></span>
          <h2 id="dname"></h2>
          <div class="price" id="dprice"></div>
          <p id="dblurb"></p>
          <div><div class="note" style="margin-bottom:8px">Size</div><div class="sizes" id="dsizes"></div></div>
          <button class="btn fill" id="dadd">Reserve</button>
          <span class="note" id="dnote"></span>
          <div class="facts" id="dfacts"></div>
        </div>
      </aside>
      <div class="scrim" id="bscrim"></div>
      <aside class="bag" id="bag" role="dialog" aria-modal="true" aria-labelledby="bagh" aria-hidden="true">
        <header><h2 id="bagh">Your reservations</h2><button class="x" style="position:static;width:44px;height:44px;border:0;background:none;font-size:22px;cursor:pointer" id="bx" aria-label="Close">×</button></header>
        <div class="items" id="bitems"></div>
        <footer><div class="total"><span>Total</span><span id="btotal">$0</span></div><button class="btn fill" id="bgo">Hold my pieces</button><span class="note">Members order first on 11 November, everyone else on the 13th. We hold your pieces and email you a link; nothing is charged today.</span></footer>
      </aside>`);
    $('#dx').onclick = closeAll; $('#scrim').onclick = closeAll; $('#bx').onclick = closeAll; $('#bscrim').onclick = closeAll;
    addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
    $('#bgo').onclick = () => { const b = store.get('kleos.bag', []); if (!b.length) return; store.set('kleos.held', true); toast('Held. Look for an email on 11 November.'); closeAll(); };
  }
  function openPiece(id) {
    ensureShell(); const p = byId[id]; if (!p) return; lastFocus = document.activeElement;
    let view = 'f', size = null;
    const setView = v => { view = v; $('#dimg').src = `img/${p.img}_${v}.webp`; $('#dimg').alt = `${p.name}, ${v === 'f' ? 'front' : 'back'}`; $('#vf').setAttribute('aria-pressed', v === 'f'); $('#vb').setAttribute('aria-pressed', v === 'b'); };
    $('#vf').onclick = () => setView('f'); $('#vb').onclick = () => setView('b'); setView('f');
    $('#dline').textContent = p.line === 'night' ? 'Chez moi · the night line · Nº 002' : 'La Côte · Issue Nº 001';
    $('#dname').textContent = p.name;
    $('#dprice').textContent = p.earned ? 'Earned at an Aura Index of 80' : `${money(p.price)} · edition of ${p.ed}, numbered`;
    $('#dblurb').textContent = p.blurb;
    const sz = SIZES[p.kind] || ['XS','S','M','L','XL'];
    $('#dsizes').innerHTML = sz.map(s => `<button type="button" aria-pressed="false">${s}</button>`).join('');
    $('#dsizes').querySelectorAll('button').forEach(b => b.onclick = () => { size = b.textContent; $('#dsizes').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    if (sz.length === 1) { size = sz[0]; $('#dsizes button').setAttribute('aria-pressed', 'true'); }
    const add = $('#dadd');
    if (p.earned) { add.textContent = 'See your Index'; add.onclick = () => { location.href = 'members.html#issued'; }; $('#dnote').textContent = 'Members who reach 80 are sent theirs. Your number is stitched inside.'; }
    else { add.textContent = 'Reserve'; $('#dnote').textContent = 'Every piece comes with a month of Kleos Black. Your serial number is the code.';
      add.onclick = () => { if (!size) { toast('Choose a size first'); return; } const b = store.get('kleos.bag', []); b.push({ id:p.id, size }); store.set('kleos.bag', b); paintBag(); toast(`${p.name}, ${size}, reserved`); }; }
    $('#dfacts').innerHTML = p.facts.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');
    $('#drawer').classList.add('open'); $('#scrim').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden'; setTimeout(() => $('#dx').focus(), 50);
    try { history.replaceState(null, '', '#' + id); } catch (_) {}
  }
  function openBag() { ensureShell(); lastFocus = document.activeElement; paintBag(); $('#bag').classList.add('open'); $('#bscrim').classList.add('open'); $('#bag').setAttribute('aria-hidden', 'false'); document.documentElement.style.overflow = 'hidden'; setTimeout(() => $('#bx').focus(), 50); }
  function closeAll() { ['drawer','bag'].forEach(i => { const e = $('#' + i); if (e) { e.classList.remove('open'); e.setAttribute('aria-hidden', 'true'); } }); ['scrim','bscrim'].forEach(i => { const e = $('#' + i); if (e) e.classList.remove('open'); }); document.documentElement.style.overflow = ''; if (location.hash && byId[location.hash.slice(1)]) { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} } if (lastFocus) try { lastFocus.focus(); } catch (_) {} }
  function paintBag() {
    const b = store.get('kleos.bag', []); const c = document.querySelectorAll('[data-bagcount]'); c.forEach(e => e.textContent = b.length ? `Bag (${b.length})` : 'Bag');
    const items = $('#bitems'); if (!items) return;
    if (!b.length) { items.innerHTML = '<p class="empty">Nothing reserved yet. Pieces you reserve are held for you until members open on 11 November.</p>'; $('#btotal').textContent = '$0'; $('#bgo').disabled = true; return; }
    $('#bgo').disabled = false;
    items.innerHTML = b.map((x, i) => { const p = byId[x.id]; return `<div class="row"><img src="img/${p.img}_f.webp" alt=""><div><div class="n">${p.name}</div><div class="s">${p.kind} · ${x.size} · ${money(p.price)}</div></div><button data-i="${i}">Remove</button></div>`; }).join('');
    items.querySelectorAll('button[data-i]').forEach(btn => btn.onclick = () => { const bb = store.get('kleos.bag', []); bb.splice(+btn.dataset.i, 1); store.set('kleos.bag', bb); paintBag(); });
    $('#btotal').textContent = money(b.reduce((s, x) => s + byId[x.id].price, 0));
  }

  // ---------- nav
  function nav() {
    const n = $('.nav'); if (!n) return;
    const dark = n.dataset.dark === '1';
    const f = () => { const s = scrollY > innerHeight * .6 || n.dataset.solid === '1'; n.classList.toggle('solid', s); n.classList.toggle('on-dark', dark && !s); };
    addEventListener('scroll', f, { passive:true }); f();
    document.querySelectorAll('[data-bag]').forEach(b => b.addEventListener('click', openBag));
    paintBag();
  }
  // ---------- footer register (same register as the waitlist)
  function register() {
    const f = $('#foot-f'); if (!f) return; const msg = $('#foot-m');
    const n = store.get('kleos.n', null); if (n) { f.style.display = 'none'; msg.textContent = `You are on the register, Nº ${String(n).padStart(4, '0')}.`; return; }
    f.addEventListener('submit', async e => { e.preventDefault(); const v = $('#foot-e').value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { msg.textContent = 'That doesn’t look like an email.'; return; }
      msg.textContent = 'One moment.';
      try { const r = await fetch(API + '/waitlist', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ email:v, source:'release-foot' }) }); if (!r.ok) throw 0; const j = await r.json(); try { localStorage.setItem('kleos.n', j.number); } catch (_) {} f.style.display = 'none'; msg.textContent = `You are on the register, Nº ${String(j.number).padStart(4, '0')}.`; }
      catch (_) { msg.textContent = 'The register didn’t answer. Try again in a moment.'; } });
  }
  function boot() { nav(); register(); addEventListener('hashchange', () => { const h = location.hash.slice(1); if (byId[h]) openPiece(h); }); if (location.hash && byId[location.hash.slice(1)]) setTimeout(() => openPiece(location.hash.slice(1)), 200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  return { P, byId, card, openPiece, openBag, toast, store, API };
})();
