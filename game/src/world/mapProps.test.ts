import { describe, expect, it } from "vitest";
import { readMapProps } from "./mapProps";

describe("readMapProps", () => {
  it("defaults to the whole tile grid and the usual player depth", () => {
    expect(readMapProps({ width: 10, height: 5 })).toEqual({ pixelWidth: 320, pixelHeight: 160, playerZ: 20 });
  });

  it("reads the pixel size and the player depth the exporter writes", () => {
    const raw = { width: 40, height: 23, properties: [{ name: "pixelWidth", value: 1280 }, { name: "pixelHeight", value: 720 }, { name: "playerZ", value: 7 }] };
    expect(readMapProps(raw)).toEqual({ pixelWidth: 1280, pixelHeight: 720, playerZ: 7 });
  });

  it("ignores a pixel size that does not fit the grid", () => {
    expect(readMapProps({ width: 2, height: 2, properties: [{ name: "pixelWidth", value: 9999 }] }).pixelWidth).toBe(64);
  });
});
