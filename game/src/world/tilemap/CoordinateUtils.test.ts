import { describe, it, expect } from 'vitest';
import { CoordinateUtils } from './CoordinateUtils';

// CoordinateUtils only references Phaser as a type, so no Phaser import/mock is needed.
// Minimal fake tilemap; cast through unknown to satisfy the Phaser type.
function fakeTilemap(tileWidth: number, tileHeight: number) {
  return {
    tileWidth,
    tileHeight,
    tileToWorldX: (x: number) => x * tileWidth,
    tileToWorldY: (y: number) => y * tileHeight,
    worldToTileX: (x: number) => Math.floor(x / tileWidth),
    worldToTileY: (y: number) => Math.floor(y / tileHeight),
  } as unknown as Phaser.Tilemaps.Tilemap;
}

describe('CoordinateUtils', () => {
  const map = fakeTilemap(16, 16);

  it('converts tile coordinates to world coordinates', () => {
    expect(CoordinateUtils.tileToWorld(3, 2, map)).toEqual({ x: 48, y: 32 });
  });

  it('converts world coordinates to tile coordinates', () => {
    expect(CoordinateUtils.worldToTile(50, 33, map)).toEqual({ x: 3, y: 2 });
  });

  it('falls back to tile size math when the tilemap returns null', () => {
    const nullMap = {
      tileWidth: 8,
      tileHeight: 8,
      tileToWorldX: () => null,
      tileToWorldY: () => null,
      worldToTileX: () => null,
      worldToTileY: () => null,
    } as unknown as Phaser.Tilemaps.Tilemap;
    expect(CoordinateUtils.tileToWorld(2, 3, nullMap)).toEqual({ x: 16, y: 24 });
    expect(CoordinateUtils.worldToTile(17, 25, nullMap)).toEqual({ x: 2, y: 3 });
  });
});
