// Id generation for entities, event states and commands.
//
// `newId()` is injectable so tests (and the game, if it wants) can make ids predictable.
// `deterministicId(seed)` gives the same uuid-like id for the same seed; migration uses it so that
// converting the same legacy map twice (editor load, exporter, game) yields identical ids.

export type IdFn = () => string;

function randomHex(count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** A random RFC-4122-shaped (v4) id; uses `crypto.randomUUID` when the runtime has it. */
export function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${randomHex(3)}-${randomHex(12)}`;
}

let generator: IdFn = randomId;

/** Fresh id from the active generator. */
export function newId(): string {
  return generator();
}

/** Replaces the id generator (pass `null` to restore the random one). Returns the previous generator. */
export function setIdGenerator(fn: IdFn | null): IdFn {
  const previous = generator;
  generator = fn ?? randomId;
  return previous;
}

/** Generator producing `<prefix>-1`, `<prefix>-2` ... Handy in tests. */
export function createSequentialIdGenerator(prefix = 'id'): IdFn {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function hash32(text: string, salt: number): number {
  let h = (0x811c9dc5 ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Same seed -> same uuid-shaped id. Not cryptographic; only for stable generated ids. */
export function deterministicId(seed: string): string {
  const hex = [0, 1, 2, 3].map((salt) => hash32(seed, salt).toString(16).padStart(8, '0')).join('');
  const variant = '89ab'[parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
