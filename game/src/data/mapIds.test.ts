import { describe, expect, it } from "vitest";
import { resolveMapKey, slugMapId } from "./mapIds";

describe("slugMapId", () => {
  it("matches the maps:export slug rule", () => {
    expect(slugMapId("new_map_1")).toBe("new-map-1");
    expect(slugMapId("new map 1")).toBe("new-map-1");
    expect(slugMapId("City Map (2).json")).toBe("city-map-2");
    expect(slugMapId("Café")).toBe("cafe");
    expect(slugMapId("__")).toBe("");
  });
});

describe("resolveMapKey", () => {
  const keys = ["city", "map1", "market", "new map 1"];

  it("prefers an exact key", () => {
    expect(resolveMapKey(keys, "market")).toBe("market");
    expect(resolveMapKey(keys, "new map 1")).toBe("new map 1");
  });

  it("finds the game map behind the editor's file name", () => {
    expect(resolveMapKey(keys, "new_map_1")).toBe("new map 1");
    expect(resolveMapKey(keys, "New-Map-1")).toBe("new map 1");
    expect(resolveMapKey(["new-map-1"], "new_map_1.json")).toBe("new-map-1");
  });

  it("returns undefined for unknown, empty and ambiguous ids", () => {
    expect(resolveMapKey(keys, "nowhere")).toBeUndefined();
    expect(resolveMapKey(keys, "")).toBeUndefined();
    expect(resolveMapKey(["a b", "a-b"], "a_b")).toBeUndefined();
  });
});
