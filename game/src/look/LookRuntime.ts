// Puts a map's looks on screen: the map's look as a camera pass, tile layers and pictures through the inline grade
// pipeline, user shaders as post pipelines. Follows the active profile (lookState), blending looks while a profile
// transition runs. See docs/looks.md.

import Phaser from "phaser";
import { compileLooks, hasDetail, mixCompiled, type CompiledLook, type LookLayer } from "@shared/look/compile.ts";
import { resolveLook, LUT_SIZE } from "@shared/look/schema.ts";
import { pictureSubject, WORLD_SUBJECT, type LookPlacement } from "@shared/look/shader.ts";
import type { ShaderInfo } from "@shared/look/userShaders.ts";
import type { LookSet } from "@shared/look/types.ts";
import { LookShadows } from "./LookShadows";
import { lookState, type LookBlend } from "./lookState";
import {
  LOOK_DETAIL_PIPELINE,
  LookDetailPipeline,
  LOOK_GRADE_PIPELINE,
  LOOK_PASS_PIPELINE,
  LookGradePipeline,
  LookPassPipeline,
  lookView,
  userShaderKey,
  userShaderPipeline,
  type LookBinding,
} from "./pipelines";

type Wrapper = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;

/** Something with a look on screen. */
interface Subject {
  kind: "map" | "tile" | "picture";
  /** Inner first: a picture's own look, then its layer's. */
  sets: { set: LookSet; space: "subject" | "world" }[];
  /** Picture own size (unscaled) or the map size. */
  own: { w: number; h: number };
  target: Phaser.GameObjects.GameObject | Phaser.Cameras.Scene2D.Camera;
  /** Pictures: where it is drawn. */
  picture?: { frameUv: [number, number, number, number]; texSize: [number, number]; uvToWorld: [number, number, number, number]; subject: LookPlacement["subject"]; box: LookPlacement["frame"] };
  /** Compiled per profile. */
  compiled: Map<string, CompiledLook>;
  mixLut?: Wrapper;
  shaderKeys: string[];
}

export interface PictureItem {
  image: Phaser.GameObjects.Image;
  look?: LookSet;
  layerLook?: LookSet;
}

const profileKey = (p: string | null) => p ?? "";

export class LookRuntime {
  private readonly scene: Phaser.Scene;
  private readonly renderer: Phaser.Renderer.WebGL.WebGLRenderer | null;
  private readonly shaders: Map<string, ShaderInfo>;
  private subjects: Subject[] = [];
  private textures = new Map<string, { lut: Wrapper; brush: Wrapper | null }>();
  private mapSize = { w: 1, h: 1 };
  private unsubscribe: () => void;
  private warned = new Set<string>();
  private readonly shadows: LookShadows;

  private warnOnce(w: string): void {
    if (this.warned.has(w)) return;
    this.warned.add(w);
    console.warn(`[Looks] ${w}`);
  }

  constructor(scene: Phaser.Scene, shaders: ShaderInfo[]) {
    this.scene = scene;
    this.shadows = new LookShadows(scene);
    this.shaders = new Map(shaders.map((s) => [s.id, s]));
    const r = scene.game.renderer;
    this.renderer = r instanceof Phaser.Renderer.WebGL.WebGLRenderer ? r : null;
    if (this.renderer) {
      const pipes = this.renderer.pipelines;
      if (!pipes.has(LOOK_GRADE_PIPELINE)) pipes.add(LOOK_GRADE_PIPELINE, new LookGradePipeline(scene.game));
      if (!pipes.getPostPipeline(LOOK_PASS_PIPELINE)) pipes.addPostPipeline(LOOK_PASS_PIPELINE, LookPassPipeline);
      if (!pipes.getPostPipeline(LOOK_DETAIL_PIPELINE)) pipes.addPostPipeline(LOOK_DETAIL_PIPELINE, LookDetailPipeline);
      for (const info of shaders) pipes.addPostPipeline(userShaderKey(info.id), userShaderPipeline(info));
    } else {
      console.warn("[Looks] the canvas renderer cannot grade; looks are off (use WebGL)");
    }
    this.unsubscribe = lookState.subscribe((b) => this.applyBlend(b));
  }

  destroy(): void {
    this.unsubscribe();
    this.clear();
    this.shadows.clear();
    for (const t of this.textures.values()) this.dropTextures(t);
    this.textures.clear();
  }

  /** Shows a map's looks: its own (camera), its tile layers' and its pictures', and their drop shadows. */
  showMap(map: { look?: LookSet; size: { w: number; h: number }; tileLayers: { layer: Phaser.Tilemaps.TilemapLayer; look: LookSet }[]; pictures: PictureItem[] }): void {
    this.clear();
    // shadows need no shader: they show with the canvas renderer too
    this.shadows.show(map, lookState.blend);
    if (!this.renderer) return;
    this.mapSize = map.size;
    const camera = this.scene.cameras.main;
    if (map.look) this.subjects.push(this.subject("map", [{ set: map.look, space: "world" }], map.size, camera));
    for (const { layer, look } of map.tileLayers) this.subjects.push(this.subject("tile", [{ set: look, space: "world" }], map.size, layer));
    for (const p of map.pictures) {
      const sets = [...(p.look ? [{ set: p.look, space: "subject" as const }] : []), ...(p.layerLook ? [{ set: p.layerLook, space: "world" as const }] : [])];
      if (sets.length === 0) continue;
      const img = p.image;
      const frame = img.frame;
      const own = { w: frame.realWidth, h: frame.realHeight };
      const box = { x: img.x - img.originX * img.displayWidth, y: img.y - img.originY * img.displayHeight, w: img.displayWidth, h: img.displayHeight };
      const s = this.subject("picture", sets, own, img);
      s.picture = {
        frameUv: [frame.u0, frame.v0, frame.u1 - frame.u0, frame.v1 - frame.v0],
        texSize: [frame.source.width, frame.source.height],
        uvToWorld: [img.flipX ? box.x + box.w : box.x, img.flipY ? box.y + box.h : box.y, img.flipX ? -box.w : box.w, img.flipY ? -box.h : box.h],
        subject: pictureSubject(box, own, img.flipX, img.flipY),
        box,
      };
      this.subjects.push(s);
    }
    this.applyBlend(lookState.blend);
  }

  /** Every frame, before drawing: where the camera looks, the transition. */
  update(dtMs: number): void {
    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    lookView.worldView = { x: v.x, y: v.y, w: v.width, h: v.height };
    lookView.screenToWorld = [v.x - cam.x / cam.zoom, v.y - cam.y / cam.zoom, 1 / cam.zoom, 1 / cam.zoom];
    lookView.time = this.scene.time.now / 1000;
    lookState.update(dtMs);
  }

  private subject(kind: Subject["kind"], sets: Subject["sets"], own: Subject["own"], target: Subject["target"]): Subject {
    return { kind, sets, own, target, compiled: new Map(), shaderKeys: [] };
  }

  private compiledFor(s: Subject, profile: string | null, lutSize = LUT_SIZE): CompiledLook {
    const key = `${profileKey(profile)}@${lutSize}`;
    let c = s.compiled.get(key);
    if (!c) {
      const stack: LookLayer[] = s.sets.flatMap(({ set, space }) => {
        const look = resolveLook(set, profile);
        return look ? [{ look, space }] : [];
      });
      c = compileLooks(stack, { subjectSize: s.own, mapSize: this.mapSize, lutSize });
      for (const w of c.warnings) this.warnOnce(w);
      s.compiled.set(key, c);
    }
    return c;
  }

  private applyBlend(b: LookBlend): void {
    this.shadows.apply(b);
    for (const s of this.subjects) {
      const to = this.compiledFor(s, b.to);
      const compiled = b.t >= 1 || b.from === b.to ? to : mixCompiled(this.compiledFor(s, b.from), to, b.t);
      this.bind(s, compiled, b.t < 1 && b.from !== b.to);
      this.setShaders(s, compiled);
    }
  }

  private bind(s: Subject, compiled: CompiledLook, mixing: boolean): void {
    const target = s.target;
    if (compiled.neutral) {
      if (s.kind === "map") (target as Phaser.Cameras.Scene2D.Camera).removePostPipeline(LOOK_PASS_PIPELINE);
      else (target as unknown as Phaser.GameObjects.Components.Pipeline).resetPipeline();
      return;
    }
    const tex = mixing ? this.mixTextures(s, compiled) : this.texturesFor(compiled);
    const binding: LookBinding = {
      compiled,
      lut: tex.lut,
      brush: tex.brush,
      mode: s.kind === "picture" ? "picture" : "screen",
      subject: s.picture?.subject ?? WORLD_SUBJECT,
      frame: s.picture?.box ?? null,
      ...(s.picture ? { frameUv: s.picture.frameUv, texSize: s.picture.texSize, uvToWorld: s.picture.uvToWorld } : {}),
    };
    if (s.kind === "map") {
      const cam = target as Phaser.Cameras.Scene2D.Camera;
      let pass = cam.getPostPipeline(LOOK_PASS_PIPELINE) as LookPassPipeline | LookPassPipeline[] | undefined;
      if (!pass || (Array.isArray(pass) && pass.length === 0)) {
        cam.setPostPipeline(LOOK_PASS_PIPELINE);
        pass = cam.getPostPipeline(LOOK_PASS_PIPELINE) as LookPassPipeline;
      }
      (Array.isArray(pass) ? pass[0] : pass).look = binding;
    } else {
      (target as unknown as Phaser.GameObjects.Components.Pipeline).setPipeline(LOOK_GRADE_PIPELINE, { look: binding });
    }
  }

  /** The post pipelines of a subject: the detail pass first (when its look has texture, clarity or dehaze), then its user shaders. */
  private setShaders(s: Subject, compiled: CompiledLook): void {
    const target = s.target as unknown as Phaser.GameObjects.Components.PostPipeline;
    const detail = hasDetail(compiled);
    const wanted = compiled.shaders.filter((u) => {
      if (this.shaders.has(u.shader)) return true;
      const w = `shader "${u.shader}" is not loaded (run \`npm run assets:sync\`)`;
      this.warnOnce(w);
      return false;
    });
    const keys = [...(detail ? [LOOK_DETAIL_PIPELINE] : []), ...wanted.map((u) => userShaderKey(u.shader))];
    if (keys.join("|") !== s.shaderKeys.join("|")) {
      for (const k of s.shaderKeys) target.removePostPipeline(k);
      for (const k of keys) target.setPostPipeline(k);
      s.shaderKeys = keys;
    }
    if (detail) {
      const found = target.getPostPipeline(LOOK_DETAIL_PIPELINE) as unknown as LookDetailPipeline | LookDetailPipeline[] | undefined;
      for (const p of Array.isArray(found) ? found : found ? [found] : []) p.detail = compiled.detail;
    }
    // Parameters: the n-th instance of a shader on the target gets the n-th use's values.
    const seen = new Map<string, number>();
    for (const u of wanted) {
      const key = userShaderKey(u.shader);
      const found = target.getPostPipeline(key) as unknown as { params?: unknown } | { params?: unknown }[];
      const list = Array.isArray(found) ? found : found ? [found] : [];
      const i = seen.get(key) ?? 0;
      seen.set(key, i + 1);
      if (list[i]) list[i].params = u.params;
    }
  }

  private texturesFor(c: CompiledLook): { lut: Wrapper; brush: Wrapper | null } {
    const key = `${c.lutSize}:${c.key}`;
    let t = this.textures.get(key);
    if (!t) {
      t = { lut: this.dataTexture(c.lut, c.lutWidth, c.lutHeight), brush: c.brush ? this.dataTexture(c.brush, c.brushSize, c.brushSize) : null };
      this.textures.set(key, t);
    }
    return t;
  }

  /** A subject's own LUT texture, rewritten every frame of a transition. */
  private mixTextures(s: Subject, c: CompiledLook): { lut: Wrapper; brush: Wrapper | null } {
    const gl = this.renderer!.gl;
    if (!s.mixLut) s.mixLut = this.dataTexture(c.lut, c.lutWidth, c.lutHeight);
    else s.mixLut.update(c.lut, c.lutWidth, c.lutHeight, false, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.LINEAR, gl.LINEAR, gl.RGBA);
    const brush = c.brush ? this.texturesFor(c).brush : null;
    return { lut: s.mixLut, brush };
  }

  private dataTexture(data: Uint8Array, w: number, h: number): Wrapper {
    const gl = this.renderer!.gl;
    return this.renderer!.createTexture2D(0, gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.RGBA, data as unknown as object, w, h, false, true, false);
  }

  private dropTextures(t: { lut: Wrapper; brush: Wrapper | null }): void {
    this.renderer?.deleteTexture(t.lut);
    if (t.brush) this.renderer?.deleteTexture(t.brush);
  }

  /** Takes every look off the screen (the objects themselves belong to the map and are destroyed with it). */
  private clear(): void {
    for (const s of this.subjects) {
      if (s.mixLut) this.renderer?.deleteTexture(s.mixLut);
      if (s.kind === "map") {
        const cam = s.target as Phaser.Cameras.Scene2D.Camera;
        cam.removePostPipeline(LOOK_PASS_PIPELINE);
        for (const k of s.shaderKeys) cam.removePostPipeline(k);
      }
    }
    this.subjects = [];
    // Keep the textures of looks that are likely to come back (same presets on the next map), within reason.
    if (this.textures.size > 48) {
      for (const t of this.textures.values()) this.dropTextures(t);
      this.textures.clear();
    }
  }
}
