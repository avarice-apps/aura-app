/**
 * Faces for everyone you talk to. Portraits are public-domain paintings (Cleveland Museum of Art, CC0)
 * in the Kleos blue print; Poise is the marble head. Cast members have their own face; anyone else
 * (a Rehearse persona, a scene extra) gets a stable one from the pool, picked by name.
 */
const FACES = {
  poise: require('../../assets/faces/poise.webp'),
  mara: require('../../assets/faces/mara.webp'),
  theo: require('../../assets/faces/theo.webp'),
  dev: require('../../assets/faces/dev.webp'),
  julian: require('../../assets/faces/julian.webp'),
  ines: require('../../assets/faces/ines.webp'),
  kai: require('../../assets/faces/kai.webp'),
  sasha: require('../../assets/faces/sasha.webp'),
  marco: require('../../assets/faces/marco.webp'),
  nina: require('../../assets/faces/nina.webp'),
} as const;

const POOL = [
  require('../../assets/faces/p1.webp'),
  require('../../assets/faces/p2.webp'),
  require('../../assets/faces/p3.webp'),
  require('../../assets/faces/p4.webp'),
  require('../../assets/faces/p5.webp'),
  require('../../assets/faces/p6.webp'),
  require('../../assets/faces/p7.webp'),
];

const key = (s?: string | null) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** The face for a character: by cast id, then by name, then a stable pick from the pool. */
export function faceFor(c?: { id?: string | null; name?: string | null } | string | null) {
  const id = typeof c === 'string' ? '' : key(c?.id);
  const name = key(typeof c === 'string' ? c : c?.name);
  if (id && id in FACES) return FACES[id as keyof typeof FACES];
  if (name && name in FACES) return FACES[name as keyof typeof FACES];
  let h = 0;
  for (const ch of name || id || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return POOL[h % POOL.length];
}
