import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { MapParser } from './MapParser';

function tiledMap(overrides: Record<string, unknown> = {}) {
  return {
    width: 4,
    height: 3,
    tilewidth: 32,
    tileheight: 32,
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', width: 4, height: 3, data: new Array(12).fill(1) },
    ],
    tilesets: [
      { firstgid: 1, name: 'terrain', image: 'terrain.png', imagewidth: 64, imageheight: 64, columns: 2, tilecount: 4 },
    ],
    ...overrides,
  };
}

describe('MapParser.parse', () => {
  it('parses a valid Tiled map', () => {
    const m = MapParser.parse(tiledMap());
    expect(m).toMatchObject({
      width: 4, height: 3, tileWidth: 32, tileHeight: 32,
      version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
    });
    expect(m.layers).toHaveLength(1);
    expect(m.layers[0]).toMatchObject({ id: 1, name: 'ground', type: 'tilelayer', width: 4, height: 3 });
    expect(m.layers[0].data).toHaveLength(12);
    expect(m.tilesets[0]).toMatchObject({ firstgid: 1, name: 'terrain', image: 'terrain.png', columns: 2, tilecount: 4 });
  });

  it('throws for null / undefined input', () => {
    expect(() => MapParser.parse(undefined)).toThrow(/undefined or null/);
    expect(() => MapParser.parse(null)).toThrow(/undefined or null/);
  });

  it('throws when layers or tilesets are missing', () => {
    expect(() => MapParser.parse({ width: 1, height: 1, tilesets: [] })).toThrow(/missing layers or tilesets/);
    expect(() => MapParser.parse({ width: 1, height: 1, layers: [] })).toThrow(/missing layers or tilesets/);
    expect(() => MapParser.parse({})).toThrow(/missing layers or tilesets/);
  });

  it('applies layer defaults: visible=true, opacity=1, x=y=0', () => {
    const m = MapParser.parse(tiledMap());
    expect(m.layers[0]).toMatchObject({ visible: true, opacity: 1, x: 0, y: 0 });
  });

  it('keeps explicit layer values, including falsy ones', () => {
    const m = MapParser.parse(
      tiledMap({ layers: [{ id: 2, name: 'fx', type: 'tilelayer', visible: false, opacity: 0, x: 5, y: 6 }] }),
    );
    expect(m.layers[0]).toMatchObject({ visible: false, opacity: 0, x: 5, y: 6 });
  });

  it('applies tileset defaults: margin=0, spacing=0', () => {
    const m = MapParser.parse(tiledMap());
    expect(m.tilesets[0]).toMatchObject({ margin: 0, spacing: 0 });
    const m2 = MapParser.parse(
      tiledMap({ tilesets: [{ firstgid: 1, name: 't', margin: 2, spacing: 1 }] }),
    );
    expect(m2.tilesets[0]).toMatchObject({ margin: 2, spacing: 1 });
  });

  it('falls back to the map tilewidth/tileheight when a tileset omits them', () => {
    const m = MapParser.parse(tiledMap({ tilewidth: 16, tileheight: 24 }));
    expect(m.tilesets[0]).toMatchObject({ tilewidth: 16, tileheight: 24 });
    const m2 = MapParser.parse(
      tiledMap({ tilesets: [{ firstgid: 1, name: 't', tilewidth: 8, tileheight: 8 }] }),
    );
    expect(m2.tilesets[0]).toMatchObject({ tilewidth: 8, tileheight: 8 });
  });

  it('accepts maps with empty layers/tilesets arrays', () => {
    const m = MapParser.parse(tiledMap({ layers: [], tilesets: [] }));
    expect(m.layers).toEqual([]);
    expect(m.tilesets).toEqual([]);
  });
});

describe('real map files', () => {
  const dir = new URL('../../../public/data/maps/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('finds map files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s parses', (file) => {
    const raw = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const m = MapParser.parse(raw);
    expect(m.width).toBeGreaterThan(0);
    expect(m.height).toBeGreaterThan(0);
    expect(m.tileWidth).toBeGreaterThan(0);
    expect(m.layers.length).toBe(raw.layers.length);
    expect(m.tilesets.length).toBe(raw.tilesets.length);
    for (const ts of m.tilesets) {
      expect(ts.tilewidth).toBeGreaterThan(0);
      expect(ts.margin).toBeGreaterThanOrEqual(0);
      expect(ts.spacing).toBeGreaterThanOrEqual(0);
    }
    for (const l of m.layers) {
      expect(typeof l.visible).toBe('boolean');
      expect(typeof l.opacity).toBe('number');
      if (l.type === 'tilelayer') expect(l.data).toHaveLength(l.width! * l.height!);
    }
  });
});
