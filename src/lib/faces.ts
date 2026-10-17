/**
 * Faces for everyone you talk to: marble heads from the Cleveland Museum of Art's open-access collection (CC0),
 * printed in the night duotone (navy shadows, Kleos blue, ivory light). Poise is the head of Alexander.
 * Cast members always have the same face, so recurring characters are recognisable. Strangers (Daily Side Quests,
 * named one-offs, people you only meet once) get a face from the stranger pool, picked at random for each call.
 *
 * Sources (accession numbers): mara 2023.108 · ines 1979.38 · theo 1966.20 · dev 1929.440 · julian 1969.121 ·
 * kai 1947.188 · sasha 1938.426 · marco 1925.468 · nina 1916.831 · poise 1927.209 · strangers 1924.538, 1928.195,
 * 1989.74, 1926.53, 1975.5, 1979.39, 1928.858, 1925.943.
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

/** Strangers (Daily Side Quests, named one-offs, people you meet once): one of these, picked fresh for each call. */
export const STRANGERS = [
  require('../../assets/faces/stranger1.webp'),
  require('../../assets/faces/stranger2.webp'),
  require('../../assets/faces/stranger3.webp'),
  require('../../assets/faces/stranger4.webp'),
  require('../../assets/faces/stranger5.webp'),
  require('../../assets/faces/stranger6.webp'),
  require('../../assets/faces/stranger7.webp'),
  require('../../assets/faces/stranger8.webp'),
];

const key = (s?: string | null) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const hash = (s: string) => {
  let h = 0;
  for (const ch of s || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

/** Is this someone from the cast (a known face), or a stranger? */
export function isCast(c?: { id?: string | null; name?: string | null } | string | null) {
  const id = typeof c === 'string' ? '' : key(c?.id);
  const name = key(typeof c === 'string' ? c : c?.name);
  return (!!id && id in FACES) || (!!name && name in FACES);
}

/**
 * The face for a character: by cast id, then by name. Anyone else is a stranger, from the pool.
 * `seed` makes the pick random per call (pass the session id); without it the pick is stable by name.
 * `stranger`: the server says this is a one-off person even if they share a cast member's name.
 */
export function faceFor(c?: { id?: string | null; name?: string | null } | string | null, opts?: { seed?: string; stranger?: boolean }) {
  const id = typeof c === 'string' ? '' : key(c?.id);
  const name = key(typeof c === 'string' ? c : c?.name);
  if (!opts?.stranger || id === 'poise') {
    if (id && id in FACES) return FACES[id as keyof typeof FACES];
    if (name && name in FACES) return FACES[name as keyof typeof FACES];
  }
  return STRANGERS[hash(`${opts?.seed ?? ''}|${name || id}`) % STRANGERS.length];
}
