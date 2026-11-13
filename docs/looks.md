# Looks: colour grading, masks, profiles and shaders

Lightroom-style grading of the whole map, a tile or image layer, or one picture. The editor and the game use the same
code (`shared/look/`) and the same GLSL, so what the editor's canvas shows is what the game draws.

## Model (`shared/look/types.ts`)

* A **`LookSet`** is stored as `look` on a map (`EditorMap.look`), a tile / image layer (`EditorLayer.look`) and a picture
  (`EditorImageItem.look`). It holds a `default` look and `profiles: { [profileId]: Look }`. While a profile is active,
  its look replaces the default; a subject without one uses its default (`resolveLook`). A look with `enabled: false` is kept
  but not applied.
* A **`Look`** has global adjustments (`adjust`), up to 4 **masks** (each with its own `adjust`), `vignette`, `grain` and
  user **shaders**. Every number is optional (absent = neutral).
* **Adjustments** (`LookAdjust`): Light (exposure, contrast, highlights, shadows, whites, blacks), Color (temperature, tint,
  vibrance, saturation), the 8-band **colour mixer** (`hsl`), **colour grading** wheels (shadows / midtones / highlights /
  global, blending, balance), **curves** (RGB, R, G, B), Effects (dehaze, fade, a coloured light `overlay`). Each section
  has an eye (`off`).
* **Masks**: components combine top to bottom: `add` (max), `subtract` (m·(1−v)), `intersect` (m·v); each has invert,
  visibility and strength; the mask has amount, invert and visibility. Types: `all`, `linear`, `radial`, `rect`
  (marquee, corner radius + soft edge), `brush` (strokes with size / feather / flow / erase), `color` (Lab ΔE of the
  original pixel, range + softness) and `luminance` (a brightness range). Limits: 4 masks, 16 components, 4 brush
  components per look (one per channel of the brush texture). `compileLooks` drops what does not fit and warns.
* **Mask space**: a picture's own look is in the picture's own pixels (unscaled, unflipped; `pictureSubject`); a layer's
  or the map's look is in map pixels.
* **Profiles** live in `project/looks.json` (`LooksFile`: `profiles`, `start`, the author's `presets`), copied to
  `game/public/data/looks.json` by the asset sync. Ids are stable; renaming changes only the name.

## How a look is drawn

`shared/look/bake.ts` turns adjustments into a colour function (white balance → exposure → contrast → tone zones →
dehaze → curves → mixer → vibrance / saturation → grading → overlay → fade). `compile.ts` bakes it into a **32³ LUT**
(a 1024 × 32·(1+masks) atlas: strip 0 global, one strip per mask), packs the mask components into uniforms and
rasterises brush strokes into an RGBA texture. A picture's stack is [its own look (subject space), its layer's look
(world space)]: global adjustments chain, then every mask applies in order; vignette and grain come from the first look
that sets them (frame: the picture's box, or the camera view for layer and map looks). `shader.ts` holds the GLSL
(`lookGrade`) and `lookUniforms`. Any amount of adjustment costs one LUT lookup per pixel (two-strip trilinear) plus the
masks.

**Game** (`game/src/look/`): `LookRuntime` builds the subjects from the map's `look` properties
(`readLooks.ts`). Pictures and tile layers are graded inline by `LookGradePipeline` (a SinglePipeline: no extra
framebuffer); the map's look is one camera PostFX pass (`LookPassPipeline`), so it covers characters too; each user
shader is its own PostFX pipeline. `lookState` holds the active profile and blends between profiles (`mixCompiled`).
Event command **Set Look Profile** `{profile, ms, wait}`; `?look=<profileId>` starts in a profile, `?look=off` turns looks
off. The UI scene is never graded.

**Editor** (`editor/src/lib/look/`): one WebGL1 canvas (`lookGL.ts`) runs the same `LOOK_PASS_FRAG` and user shaders.
Pictures are graded once per look + placement and cached (`lookDraw.ts`); tile layers grade the visible area at one
pixel per map pixel; the map's look grades the canvas's content Konva layer right after it draws (`lookMapPass.ts`,
`useMapLookPass.ts`). Grid, handles and overlays are on a second Konva layer and stay ungraded.

## Editor UI

* **Look panel** (Alt+G, View › Look; `components/editor/look/LookPanel.tsx`): edits the map, the active layer or the
  picked picture (follows the selection; the pin keeps one). Profile tabs (Default + profiles; the dot = this subject has
  its own look for that profile; double-click renames; ⋯ sets the start profile or deletes). Editing a profile without its
  own look copies the default first ("= Default" badge). Presets (built-in groups + project presets), copy / paste look,
  save as preset. Tabs: **Edit** (the sections, vignette and grain under Effects), **Masks**, **Shaders**. Every slider
  commits one undo step on release (`setLook(ref, set, commit)` in `routes/editor.tsx`).
* **Masks on the canvas** (`konva/KonvaMaskEditor.tsx`): the selected component shows handles (linear: start / middle /
  end; radial: centre, width + rotation, height; marquee: corners + move); a brush component paints with left-drag (the
  panel's size / feather / flow / erase). Overlay: off, red overlay, black and white. Colour range has an eyedropper
  (looks are hidden while picking, so it samples the original colours).
* **Top toolbar Look menu**: the profile the canvas shows (the same as the panel's tab), looks on / off, animate.
* **Database › Shaders** (`database/ShadersPage.tsx`): write, preview and check user shaders.

## User shaders (`project/shaders/<id>.frag`)

Fragment shaders with a prepended header (`SHADER_HEADER`): `uMainSampler`, `outTexCoord`, `uTime`, `uResolution`,
`uWorld` (uv → map pixels), `uWorldPixel`, `worldAt(uv)`, `uvAt(world)`. Annotations: `// @name`, `// @description`,
`// @animated`, `// @pad N` (room around a picture for glows / outlines), `uniform float x; // @param min max default Label`,
`uniform vec3 c; // @color #hex Label`. The asset sync copies them to `game/public/shaders/` with `data/shaders.json`.
15 samples are in `project/shaders/samples/`.

## Known gaps

See docs/future-issues.md (Looks).
