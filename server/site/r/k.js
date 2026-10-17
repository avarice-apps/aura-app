/* Kleos — shared: the house's pieces, the card, the bag, search, the nav, the register. */
document.documentElement.classList.add('js');
const K = (() => {
  const API = /^https?:$/.test(location.protocol) && !/claude|anthropic/.test(location.hostname) ? '' : 'https://aura-app-production-c2eb.up.railway.app';
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  const P = window.KP || [];
  const ALIAS = window.KA || {};
  const byId = Object.fromEntries(P.map(p => [p.id, p]));
  Object.entries(ALIAS).forEach(([a, b]) => { if (byId[b]) byId[a] = byId[b]; });
  const LINES = { marbres:'Les Marbres', cote:'La Côte', nuit:'Chez moi' };
  const TYPES = { tees:'T-shirts', long:'Long sleeves', sweat:'Sweatshirts', knit:'Knitwear', shirts:'Shirts', bottoms:'Trousers & shorts', caps:'Caps' };
  const $ = (s, r = document) => r.querySelector(s);
  const money = n => '$' + n;
  const img = (p, v) => `img/m/${p.id}_${v}.webp`;
  const other = v => v === 'f' ? 'b' : 'f';
  const href = p => `product.html?p=${p.id}`;

  // ---------- toast
  let tt; function toast(t) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role','status'); document.body.appendChild(el); } el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2600); }

  // ---------- card: the garment on its own panel, the label underneath
  function card(p, o = {}) {
    const a = document.createElement('a'); a.className = 'card'; a.href = href(p); a.dataset.id = p.id;
    const tag = p.earned ? 'Earned' : p.edit ? 'Launch edit' : '';
    a.setAttribute('aria-label', `${p.name}, ${p.kind}, ${p.earned ? 'earned, not sold' : money(p.price)}`);
    a.innerHTML = `<div class="ph">${tag ? `<span class="tag">${tag}</span>` : ''}<span class="sw">${p.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span><img class="f" src="${img(p, p.lead)}" alt="" loading="lazy" decoding="async"><img class="b" src="${img(p, other(p.lead))}" alt="" loading="lazy" decoding="async"></div>
      <div class="meta"><span class="nm">${p.name}</span><span class="pr">${p.earned ? 'Index 80' : money(p.price)}</span></div>${o.sub === false ? '' : `<span class="sub">${p.kind} · ${p.colour}</span>`}`;
    return a;
  }
  // old callers (home plates, members) open a piece: now it has its own page
  function openPiece(id) { const p = byId[id]; if (p) location.href = href(p); }

  // ---------- size & fit: how to measure, then the garment laid flat, in cm
  const TEE_SVG = `<svg viewBox="0 0 120 130" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M38 8h44l6 10 24 10-8 22-12-4v76H28V46l-12 4L8 28l24-10z"/><path d="M38 8c4 8 18 8 22 8s18 0 22-8" stroke-dasharray="2 2"/><path d="M28 48h64"/><text x="60" y="44" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="Geist,sans-serif">A</text><path d="M108 20v102"/><text x="114" y="74" font-size="7" fill="currentColor" stroke="none" font-family="Geist,sans-serif">B</text></svg>`;
  const TRS_SVG = `<svg viewBox="0 0 120 130" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M30 8h60l6 114H70l-10-70-10 70H24z"/><text x="60" y="5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="Geist,sans-serif">A</text><path d="M60 52v70"/><text x="64" y="92" font-size="7" fill="currentColor" stroke="none" font-family="Geist,sans-serif">B</text></svg>`;
  const FIT = {
    tee:   { sizes:['XS','S','M','L','XL'], a:[50,53,56,59,62], b:[66,69,72,75,78], how:['A, chest: 2 cm below the armhole, edge to edge.','B, length: from the highest point of the shoulder to the hem.'] },
    baby:  { sizes:['XS','S','M','L'], a:[38,40,43,46], b:[46,48,50,52], how:['A, chest: 2 cm below the armhole, edge to edge. Cut to sit close; take your usual size.','B, length: from the shoulder to the hem. Cropped.'] },
    knit:  { sizes:['XS','S','M','L','XL'], a:[52,55,58,61,64], b:[64,67,70,73,76], how:['A, chest: 2 cm below the armhole, edge to edge.','B, length: shoulder to hem. Between sizes, take the smaller.'] },
    shirt: { sizes:['XS','S','M','L','XL'], a:[52,55,58,61,64], b:[72,75,78,81,84], how:['A, chest: 2 cm below the armhole, edge to edge.','B, length: from the collar seam to the hem, at the back.'] },
    trs:   { sizes:['28','30','32','34','36'], a:[38,40.5,43,45.5,48], b:[76,77,78,79,80], how:['A, waist: laid flat, edge to edge; double it for the full waist.','B, inseam: from the crotch seam to the hem.'] },
    shorts:{ sizes:['S','M','L','XL'], a:[37,40,43,46], b:[15,15,16,16], how:['A, waist: laid flat, unstretched, edge to edge.','B, inseam: from the crotch seam to the hem.'] },
  };
  function fitKey(p) { return p.type === 'caps' ? null : p.kind === 'Trouser' ? 'trs' : p.kind === 'Swim shorts' ? 'shorts' : p.kind === 'Baby tee' ? 'baby' : p.type === 'shirts' ? 'shirt' : (p.type === 'knit' || p.type === 'sweat') ? 'knit' : 'tee'; }
  function sizes(p) { const k = fitKey(p); return k ? FIT[k].sizes : ['One size']; }
  function fitGuide(p) {
    const k = fitKey(p);
    if (!k) return '<p>One size. Adjustable strap at the back, 55 to 60 cm.</p>';
    const f = FIT[k], fit = (p.facts.find(x => x[0] === 'Fit') || [])[1];
    return `<p>${fit ? fit + '. ' : ''}Measurements of the garment laid flat, in centimetres.</p><div class="measure">${/trs|shorts/.test(k) ? TRS_SVG : TEE_SVG}<table><thead><tr><th>Size</th>${f.sizes.map(s => `<th>${s}</th>`).join('')}</tr></thead><tbody><tr><td>A</td>${f.a.map(v => `<td>${v}</td>`).join('')}</tr><tr><td>B</td>${f.b.map(v => `<td>${v}</td>`).join('')}</tr></tbody></table></div><ul>${f.how.map(h => `<li>${h}</li>`).join('')}</ul>`;
  }

  // ---------- shell: bag + search, built once
  let lastFocus = null;
  function ensureShell() {
    if ($('#bag')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="scrim" id="bscrim"></div>
      <aside class="bag" id="bag" role="dialog" aria-modal="true" aria-labelledby="bagh" aria-hidden="true">
        <header><h2 id="bagh">Bag</h2><button class="x" id="bx" aria-label="Close">Close</button></header>
        <div class="items" id="bitems"></div>
        <footer><div class="total"><span>Total</span><span id="btotal">$0</span></div><button class="btn fill" id="bgo">Hold my pieces</button><span class="note">Members order first on 11 November, everyone else on the 13th. We hold your pieces and email you a link. Nothing is charged today.</span></footer>
      </aside>
      <div class="search" id="search" role="dialog" aria-modal="true" aria-label="Search" aria-hidden="true">
        <div class="sbar"><label class="sr" for="q">Search the house</label><input id="q" type="search" placeholder="Search" autocomplete="off"><button class="x" id="sx">Close</button></div>
        <div class="res" id="sres"></div>
      </div>`);
    $('#bx').onclick = closeAll; $('#bscrim').onclick = closeAll; $('#sx').onclick = closeAll;
    addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
    $('#bgo').onclick = () => { const b = bag(); if (!b.length) return; store.set('kleos.held', true); toast('Held. Look for an email on 11 November.'); closeAll(); };
    $('#q').addEventListener('input', paintSearch);
  }
  function paintSearch() {
    const q = $('#q').value.trim().toLowerCase(), r = $('#sres');
    if (!q) { r.innerHTML = `<p class="note">${Object.entries(TYPES).map(([k, v]) => `<a href="collection.html?type=${k}">${v}</a>`).join('')}</p>`; return; }
    const hit = P.filter(p => [p.name, p.kind, p.colour, LINES[p.sec], TYPES[p.type], p.after || ''].join(' ').toLowerCase().includes(q)).slice(0, 8);
    r.innerHTML = hit.length ? '' : '<p class="note">Nothing by that name.</p>';
    hit.forEach(p => r.appendChild(card(p, { sub:false })));
  }
  function openSearch() { ensureShell(); lastFocus = document.activeElement; const s = $('#search'); s.classList.add('open'); $('#bscrim').classList.add('open'); s.setAttribute('aria-hidden','false'); paintSearch(); setTimeout(() => $('#q').focus(), 30); }
  const bag = () => store.get('kleos.bag', []).filter(x => byId[x.id]);
  function openBag() { ensureShell(); lastFocus = document.activeElement; paintBag(); $('#bag').classList.add('open'); $('#bscrim').classList.add('open'); $('#bag').setAttribute('aria-hidden', 'false'); document.documentElement.style.overflow = 'hidden'; setTimeout(() => $('#bx').focus(), 50); }
  function closeAll() {
    ['bag','search'].forEach(i => { const e = $('#' + i); if (e) { e.classList.remove('open'); e.setAttribute('aria-hidden', 'true'); } });
    const s = $('#bscrim'); if (s) s.classList.remove('open');
    document.documentElement.style.overflow = ''; if (lastFocus) try { lastFocus.focus(); } catch (_) {}
  }
  function add(p, size) { const b = store.get('kleos.bag', []); b.push({ id:p.id, size }); store.set('kleos.bag', b); paintBag(); }
  function paintBag() {
    const b = bag(); document.querySelectorAll('[data-bagcount]').forEach(e => e.textContent = `Bag (${b.length})`);
    const items = $('#bitems'); if (!items) return;
    if (!b.length) { items.innerHTML = '<p class="empty">Nothing reserved yet. What you reserve is held for you until members open on 11 November.</p>'; $('#btotal').textContent = '$0'; $('#bgo').disabled = true; return; }
    $('#bgo').disabled = false;
    items.innerHTML = b.map((x, i) => { const p = byId[x.id]; return `<div class="row"><a href="${href(p)}"><img src="${img(p, p.lead)}" alt=""></a><div><div class="n">${p.name}</div><div class="s">${p.colour} · ${x.size}</div><div class="s">${money(p.price)}</div></div><button data-i="${i}">Remove</button></div>`; }).join('');
    items.querySelectorAll('button[data-i]').forEach(btn => btn.onclick = () => { const bb = bag(); bb.splice(+btn.dataset.i, 1); store.set('kleos.bag', bb); paintBag(); });
    $('#btotal').textContent = money(b.reduce((s, x) => s + byId[x.id].price, 0));
  }

  // ---------- nav
  function nav() {
    const n = $('.nav'); if (!n) return;
    if (!$('.ann')) n.insertAdjacentHTML('beforebegin', '<div class="ann"><a href="members.html">Members order first, 11 November · Nothing is charged to reserve</a></div>');
    const dark = n.dataset.dark === '1';
    const f = () => { const s = scrollY > innerHeight * .6 || n.dataset.solid === '1'; n.classList.toggle('solid', s); n.classList.toggle('on-dark', dark && !s); };
    addEventListener('scroll', f, { passive:true }); f();
    document.querySelectorAll('[data-bag]').forEach(b => b.addEventListener('click', openBag));
    document.querySelectorAll('[data-search]').forEach(b => b.addEventListener('click', openSearch));
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
  function motion() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = [...document.querySelectorAll('.reveal')];
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('seen')); }
    else { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); } }), { rootMargin:'0px 0px -12% 0px' }); els.forEach(e => io.observe(e)); }
    stagger();
  }
  function stagger(root = document) { root.querySelectorAll('.stagger').forEach(g => [...g.children].forEach((c, i) => { c.style.animationDelay = Math.min(i, 10) * 40 + 'ms'; })); }
  function boot() { motion(); nav(); register(); const h = location.hash.slice(1); if (byId[h] && !/product\.html/.test(location.pathname)) openPiece(h); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  return { P, byId, LINES, TYPES, card, img, other, href, money, sizes, fitGuide, add, openPiece, openBag, openSearch, toast, store, stagger, API };
})();
