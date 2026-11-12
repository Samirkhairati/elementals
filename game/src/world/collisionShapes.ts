// Polygon collision layers of a raw (exported) map: an `objectgroup` with the property `kind=collision`; each
// object has x/y (its first point) and a `polygon` (closed) or `polyline` (open) of points relative to it.
// Read whether or not the layer is visible.

import { cleanPoints, isUsableShape, type CollisionShape } from "@shared/collisionShapes.ts";
import { finiteOr as num, isRecord, rawLayers, tiledProps } from "./tiledRaw";

/** Every usable collision shape of a raw map, in world pixels. */
export function readCollisionShapes(raw: unknown): CollisionShape[] {
  const out: CollisionShape[] = [];
  rawLayers(raw).forEach((layer, li) => {
    if (!isRecord(layer) || layer.type !== "objectgroup" || tiledProps(layer).kind !== "collision") return;
    const layerId = layer.id ?? li;
    const ox = num(layer.offsetx, 0);
    const oy = num(layer.offsety, 0);
    (Array.isArray(layer.objects) ? layer.objects : []).forEach((obj, oi) => {
      if (!isRecord(obj)) return;
      const closed = Array.isArray(obj.polygon);
      const rel = cleanPoints(closed ? obj.polygon : obj.polyline);
      const x = num(obj.x, 0) + ox;
      const y = num(obj.y, 0) + oy;
      const shape: CollisionShape = {
        id: `${String(layerId)}:${String(obj.id ?? oi)}`,
        points: rel.map((p) => ({ x: x + p.x, y: y + p.y })),
        closed,
      };
      if (isUsableShape(shape)) out.push(shape);
    });
  });
  return out;
}
