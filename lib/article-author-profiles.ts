const knownNames: Record<string, string> = {
  brady: 'Brady Johanson',
  rebekah: 'Rebekah Murtagh',
  rachel: 'Rachel Arterberry',
  ojas: 'Ojas Tasker',
  newslinesa_rax22k: 'Tawanna Verock',
  newsline: 'Tawanna Verock',
};

const portraits: Record<string, string> = {
  'brady johanson': '/brady-johanson-headshot.jpg',
  'rebekah murtagh': '/rebekah-murtagh-headshot.jpg',
  'rachel arterberry': '/rachel-arterberry-headshot.jpg',
  'ojas tasker': '/ojas-tasker-headshot.jpeg',
  'tawanna verock': '/email/tawanna-verock-headshot-20260827.png',
  'ed zapata': '/ed-zapata-headshot.jpg',
  'carri amescua': '/carri-amescua-headshot.jpg',
  'candy cooke': '/candy-cooke-headshot.jpg',
  'sherri monroe': '/sherri-monroe-headshot.jpg',
  'ashley jackson': '/ashley-jackson-headshot.jpg',
  'brandy wuensch': '/brandy-wuensch-headshot.jpg',
  'sonia guardado': '/sonia-guardado-headshot.jpg',
  'delaine mcmurry': '/delaine-mcmurry-headshot.jpg',
  'kim dale': '/kim-dale-headshot.jpg',
  'kent redding': '/kent-redding-headshot.jpg',
  'julie jones': '/julie-jones-headshot.jpg',
  'john crowe': '/john-crowe-headshot.jpg',
  'tanya chappell': '/tanya-chappell-headshot.jpg',
};

export function canonicalAuthorName(name: string, publication?: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  const key = clean.toLocaleLowerCase('en-US');
  if (publication === 'austin' && key === 'newsline') return clean;
  return knownNames[key] ?? clean;
}

export function authorPortrait(name: string, avatar?: string | null): string | null {
  const key = canonicalAuthorName(name).toLocaleLowerCase('en-US');
  // Keep a photo manually uploaded to the app or its image storage.
  if (avatar && !/(?:realtyline\.us|newslinesa\.com)\/wp-content\/uploads\/|gravatar\.com\/avatar\//i.test(avatar)) {
    return avatar;
  }
  return portraits[key] ?? null;
}
