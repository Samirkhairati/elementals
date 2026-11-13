import { describe, expect, it, vi } from "vitest";
import { LookState } from "./lookState";
import { mapLook, parseLookProp, readLooksFile, shaderIdsOf, startProfile, tileLayerLooks } from "./readLooks";
import { loadedShaders, readShaderManifest } from "./shaderManifest";
import { readImageObjects } from "@/world/imageLayers";

describe("LookState", () => {
  it("switches at once, or blends over a duration and resolves at the end", async () => {
    const s = new LookState();
    s.reset("day");
    await s.setProfile("night");
    expect(s.blend).toEqual({ from: "day", to: "night", t: 1 });

    let done = false;
    const p = s.setProfile("sunset", 1000).then(() => (done = true));
    expect(s.blend.t).toBe(0);
    s.update(500);
    expect(s.blend.t).toBeCloseTo(0.5);
    expect(s.transitioning).toBe(true);
    s.update(600);
    await p;
    expect(done).toBe(true);
    expect(s.blend).toEqual({ from: "night", to: "sunset", t: 1 });
  });

  it("tells listeners about every step", () => {
    const s = new LookState();
    const seen: number[] = [];
    s.subscribe((b) => seen.push(b.t));
    void s.setProfile("night", 100);
    s.update(50);
    s.update(50);
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(1);
  });
});

describe("reading looks from a map", () => {
  const look = { default: { adjust: { exposure: -1 } } };
  const raw = {
    properties: [{ name: "look", type: "string", value: JSON.stringify(look) }],
    layers: [
      { type: "tilelayer", name: "Ground", properties: [{ name: "look", type: "string", value: JSON.stringify({ profiles: { night: { adjust: { saturation: -40 } } } }) }] },
      { type: "tilelayer", name: "Plain" },
      {
        type: "objectgroup",
        name: "Pics",
        properties: [{ name: "kind", type: "string", value: "image" }, { name: "look", type: "string", value: JSON.stringify(look) }],
        objects: [{ name: "tree", x: 1, y: 2, properties: [{ name: "graphic", type: "string", value: "a.png" }, { name: "look", type: "string", value: JSON.stringify({ default: { shaders: [{ id: "s", shader: "fx/wave" }] } }) }] }],
      },
    ],
  };

  it("reads the map's, the tile layers' and the pictures' looks", () => {
    expect(mapLook(raw)).toEqual(look);
    expect([...tileLayerLooks(raw).keys()]).toEqual(["Ground"]);
    const [pic] = readImageObjects(raw);
    expect(pic.layerLook).toEqual(look);
    expect(pic.look?.default?.shaders?.[0].shader).toBe("fx/wave");
    expect(shaderIdsOf([mapLook(raw), pic.look, pic.layerLook])).toEqual(["fx/wave"]);
  });

  it("ignores a broken look", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseLookProp("{not json")).toBeUndefined();
    expect(parseLookProp(42)).toBeUndefined();
    warn.mockRestore();
  });

  it("starts in the requested profile, else the file's start, else the first", () => {
    const file = readLooksFile({ profiles: [{ id: "day" }, { id: "night" }], start: "night" });
    expect(startProfile(file, "day")).toBe("day");
    expect(startProfile(file)).toBe("night");
    expect(startProfile(readLooksFile({ profiles: [] }))).toBeNull();
    expect(startProfile(readLooksFile(undefined))).toBe("day");
  });
});

describe("shader manifest", () => {
  it("reads entries and parses the loaded sources", () => {
    const manifest = { version: 1, shaders: [{ id: "fx/a", file: "shaders/fx/a.frag" }, { id: "fx/b", file: "shaders/fx/b.frag" }, { bad: 1 }] };
    expect(readShaderManifest(manifest)).toHaveLength(2);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const shaders = loadedShaders(manifest, (k) => (k.endsWith("fx/a") ? "// @name A\nvoid main(){}" : undefined));
    warn.mockRestore();
    expect(shaders.map((s) => s.name)).toEqual(["A"]);
  });
});
