// Kleos · concept pages: theme switch, the gold medal, veins drawn in on view, a little depth on scroll.
(function () {
  const root = document.documentElement;
  // theme: Gallery (light) or Night, remembered per viewer
  let theme = 'gallery';
  try { theme = localStorage.getItem('kleos.concept.theme') || 'gallery'; } catch (_) {}
  const apply = (t) => { root.dataset.theme = t === 'night' ? 'night' : ''; document.querySelectorAll('.switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t))); };
  apply(theme);
  document.querySelectorAll('.switch button').forEach((b) => b.addEventListener('click', () => { theme = b.dataset.t; apply(theme); try { localStorage.setItem('kleos.concept.theme', theme); } catch (_) {} }));

  // shared gold gradient for veins
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0'); defs.setAttribute('aria-hidden', 'true'); defs.style.position = 'absolute';
  defs.innerHTML = '<defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8A6A2B"/><stop offset=".35" stop-color="#F3D58A"/><stop offset=".55" stop-color="#FFF1C2"/><stop offset=".8" stop-color="#C9A04E"/><stop offset="1" stop-color="#7A5A22"/></linearGradient></defs>';
  document.body.prepend(defs);

  // the medal: a struck gold piece, tilted
  const MEDAL = '<svg viewBox="0 0 200 150" aria-hidden="true"><defs>'
    + '<radialGradient id="mf" cx=".38" cy=".3" r=".9"><stop offset="0" stop-color="#FFF6D8"/><stop offset=".28" stop-color="#F0D28A"/><stop offset=".62" stop-color="#C79A45"/><stop offset="1" stop-color="#8D6A2A"/></radialGradient>'
    + '<linearGradient id="me" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6B4E1C"/><stop offset=".5" stop-color="#B58B3E"/><stop offset="1" stop-color="#5E4416"/></linearGradient>'
    + '<path id="mr" d="M 30 70 A 70 42 0 1 1 170 70 A 70 42 0 1 1 30 70"/></defs>'
    + '<ellipse cx="100" cy="80" rx="92" ry="56" fill="url(#me)"/>'
    + '<ellipse cx="100" cy="72" rx="92" ry="56" fill="url(#mf)"/>'
    + '<ellipse cx="100" cy="72" rx="80" ry="48" fill="none" stroke="#9C7631" stroke-opacity=".55" stroke-width="1.2"/>'
    + '<text font-family="Instrument Serif, Georgia, serif" font-size="11" letter-spacing="3" fill="#7A5A22" fill-opacity=".8"><textPath href="#mr">ΚΛΕΟΣ · WHAT IS HEARD OF YOU · ΚΛΕΟΣ · WHAT IS HEARD OF YOU ·</textPath></text>'
    + '<text x="100" y="92" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-size="74" fill="#8D6A2A" transform="translate(0 28) scale(1 .62)" opacity=".9">K</text>'
    + '<ellipse cx="78" cy="48" rx="34" ry="10" fill="#fff" opacity=".22" transform="rotate(-18 78 48)"/></svg>';
  document.querySelectorAll('[data-medal]').forEach((el) => { el.innerHTML = MEDAL; });

  // veins: each path learns its length, then draws in when its section is on screen
  document.querySelectorAll('.vein path').forEach((p) => { try { p.style.setProperty('--len', Math.ceil(p.getTotalLength())); } catch (_) {} });
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.25 });
  document.querySelectorAll('.plate, .letter, .card').forEach((s) => io.observe(s));

  // depth: objects move a little against the scroll (transform only), and lean toward the pointer on desktop
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const objs = [...document.querySelectorAll('[data-depth]')];
  let mx = 0, my = 0, tx = 0, ty = 0, ticking = false;
  const frame = () => {
    tx += (mx - tx) * 0.08; ty += (my - ty) * 0.08;
    const vh = innerHeight;
    for (const o of objs) {
      const d = parseFloat(o.dataset.depth) || 0;
      const r = o.parentElement.getBoundingClientRect();
      const mid = (r.top + r.height / 2 - vh / 2) / vh;
      o.style.transform = `translate3d(${(tx * d * 14).toFixed(2)}px, ${(mid * d * -60 + ty * d * 10).toFixed(2)}px, 0)`;
    }
    ticking = Math.abs(mx - tx) > 0.001 || Math.abs(my - ty) > 0.001;
    if (ticking) requestAnimationFrame(frame);
  };
  const kick = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', kick, { passive: true });
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; kick(); }, { passive: true });
  kick();
})();
