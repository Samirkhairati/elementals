import { describe, expect, it } from 'vitest';
import type { AnimationRegistration } from '@shared/engine/index.ts';
import { CharacterLoader, type LoaderPort } from './characterLoader';
import { characterRegistry, heroDef } from '@/test/characters';
import type { SheetLoad } from './spritePlan';

class FakePort implements LoaderPort {
  loaded = new Set<string>();
  queued: SheetLoad[] = [];
  created: AnimationRegistration[] = [];
  starts = 0;
  private done: (() => void) | null = null;
  textureExists(key: string) { return this.loaded.has(key); }
  queueSheet(sheet: SheetLoad) { this.queued.push(sheet); }
  start(done: () => void) { this.starts++; this.done = done; }
  createAnimations(a: readonly AnimationRegistration[]) { this.created.push(...a); }
  /** The files finish loading. */
  finish() { for (const s of this.queued) this.loaded.add(s.textureKey); this.done?.(); this.done = null; }
}

const registry = () => characterRegistry({ 'characters/hero': heroDef('Hero'), 'characters/armor': heroDef('Armor'), 'objects/flower': { ...heroDef('Flower'), facing: 'none', clips: { sway: heroDef().clips.sway }, bindings: {}, sheets: { walk: heroDef().sheets.walk } } });

describe('CharacterLoader', () => {
  it('loads only the requested characters, then creates their animations and resolves', async () => {
    const port = new FakePort();
    const loader = new CharacterLoader(registry(), port);
    let resolved = false;
    const p = loader.ensure(['characters/hero']).then(() => (resolved = true));
    expect(port.queued.map((s) => s.textureKey)).toEqual(['sprite:characters/hero:walk', 'sprite:characters/hero:run', 'sprite:characters/hero:attack']);
    expect(port.starts).toBe(1);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(port.created).toEqual([]);
    port.finish();
    await p;
    expect(resolved).toBe(true);
    expect(port.created.some((a) => a.key === 'sprite:characters/hero:walk-down')).toBe(true);
    expect(port.created.some((a) => a.key.includes('armor'))).toBe(false); // not requested, not loaded
    expect(loader.has('characters/hero')).toBe(true);
    expect(loader.has('characters/armor')).toBe(false);
  });

  it('a character loads once: later and concurrent requests do not queue it again', async () => {
    const port = new FakePort();
    const loader = new CharacterLoader(registry(), port);
    const a = loader.ensure(['characters/hero', 'characters/hero']);
    const b = loader.ensure(['characters/hero', 'characters/armor']); // shares the running load, adds armor
    expect(port.queued.filter((s) => s.textureKey.includes('characters/hero')).length).toBe(3);
    expect(port.queued.filter((s) => s.textureKey.includes('characters/armor')).length).toBe(3);
    expect(port.starts).toBe(1);
    port.finish();
    await Promise.all([a, b]);
    await loader.ensure(['characters/hero', 'characters/armor']); // nothing left to do
    expect(port.starts).toBe(1);
    expect(port.created.filter((x) => x.key === 'sprite:characters/hero:walk-down')).toHaveLength(1);
  });

  it('resolves at once when the textures are already there, and warns about unknown ids', async () => {
    const port = new FakePort();
    port.loaded = new Set(['sprite:objects/flower:walk']);
    const warnings: string[] = [];
    const loader = new CharacterLoader(registry(), port, (m) => warnings.push(m));
    await loader.ensure(['objects/flower', 'characters/ghost', '']);
    expect(port.starts).toBe(0);
    expect(port.created.map((a) => a.key)).toEqual(['sprite:objects/flower:sway']);
    expect(warnings).toEqual(['[Characters] unknown character "characters/ghost"; nothing to load']);
  });

  it('a character whose sheet has no URL is reported and its animations are not created', async () => {
    const reg = registry();
    delete reg.get('characters/hero')!.files.run;
    const port = new FakePort();
    const warnings: string[] = [];
    const loader = new CharacterLoader(reg, port, (m) => warnings.push(m));
    const p = loader.ensure(['characters/hero']);
    port.finish();
    await p;
    expect(warnings.some((w) => w.includes('no URL for sheet "run"'))).toBe(true);
    expect(port.created.some((a) => a.key.includes(':run-'))).toBe(false);
    expect(port.created.some((a) => a.key.includes(':walk-'))).toBe(true);
  });
});
