import { tileToAnchor } from "@shared/engine/index.ts";
import { GAME_CONSTANTS } from "@/constants/game";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Converts the objects of a legacy Tiled `interactables` object layer into editor-format entities that
 * carry a legacy `Interactable` component. Feeding them through the normal pipeline
 * (`migrateEntity` -> Event component with one state) makes them behave like any other entity event:
 * `on_interact` -> action state, `on_step` -> playerTouch state, `message` -> showText, `eventKey` -> emit.
 *
 * They occupy one non-solid tile (`floor(obj.x / 32), floor(obj.y / 32)`, like the old InteractionSystem).
 * With neither message nor eventKey the object's name is shown as the message (old behaviour).
 */
export function entitiesFromInteractableObjects(objects: unknown, tileSize: number = GAME_CONSTANTS.TILE_SIZE): Record<string, unknown>[] {
  if (!Array.isArray(objects)) return [];
  const out: Record<string, unknown>[] = [];

  objects.forEach((obj, index) => {
    if (!isRecord(obj) || typeof obj.x !== "number" || typeof obj.y !== "number") return;

    let message = "";
    let type = "on_interact";
    let eventKey = "";
    const props = obj.properties;
    if (Array.isArray(props)) {
      for (const p of props) {
        if (!isRecord(p)) continue;
        if (p.name === "message" && typeof p.value === "string") message = p.value;
        if (p.name === "type" && typeof p.value === "string") type = p.value;
        if (p.name === "eventKey" && typeof p.value === "string") eventKey = p.value;
      }
    } else if (isRecord(props)) {
      if (typeof props.message === "string") message = props.message;
      if (typeof props.type === "string") type = props.type;
      if (typeof props.eventKey === "string") eventKey = props.eventKey;
    }
    const name = typeof obj.name === "string" ? obj.name : "";
    if (!message && !eventKey && name) message = name;

    const { x, y } = tileToAnchor(Math.floor(obj.x / tileSize), Math.floor(obj.y / tileSize));
    const id = `tiled-interactable-${typeof obj.id === "number" || typeof obj.id === "string" ? obj.id : index}`;
    out.push({
      id,
      name: name || "Interactable",
      x,
      y,
      components: {
        Transform: { x, y, depth: 5 },
        Collider: { width: tileSize, height: tileSize, offsetX: 0, offsetY: 0, isSolid: false },
        Interactable: { type, message, eventKey },
      },
    });
  });

  return out;
}

/** Finds the `interactables` object layer in raw (Tiled JSON) map data and converts its objects. */
export function legacyInteractableEntities(rawMap: unknown): Record<string, unknown>[] {
  if (!isRecord(rawMap) || !Array.isArray(rawMap.layers)) return [];
  const layer = rawMap.layers.find((l) => isRecord(l) && l.type === "objectgroup" && l.name === "interactables");
  return isRecord(layer) ? entitiesFromInteractableObjects(layer.objects) : [];
}
