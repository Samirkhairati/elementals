import { describe, expect, it } from "vitest";
import { finiteOr, finiteOrUndefined, rawLayers, tiledProps } from "./tiledRaw";

describe("tiledRaw", () => {
  it("reads Tiled properties as an object, skipping malformed entries", () => {
    expect(tiledProps({ properties: [{ name: "kind", value: "image" }, { value: 1 }, null, { name: "z", value: 3 }] })).toEqual({ kind: "image", z: 3 });
    expect(tiledProps({ properties: "nope" })).toEqual({});
    expect(tiledProps(null)).toEqual({});
  });

  it("numbers fall back on anything that is not finite", () => {
    expect(finiteOr(2, 0)).toBe(2);
    expect(finiteOr(Number.NaN, 5)).toBe(5);
    expect(finiteOr("3", 5)).toBe(5);
    expect(finiteOrUndefined(Infinity)).toBeUndefined();
  });

  it("layers are the map's list, or none", () => {
    expect(rawLayers({ layers: [1, 2] })).toEqual([1, 2]);
    expect(rawLayers({ layers: {} })).toEqual([]);
    expect(rawLayers(undefined)).toEqual([]);
  });
});
