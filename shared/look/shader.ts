// The grading shader, as GLSL ES 1.0 text, and the uniform values of a compiled look. Both the editor (its own small
// WebGL canvas) and the game (Phaser pipelines) include LOOK_GLSL and call `lookGrade`, so a look renders the same.
//
// Coordinates: every host passes the map pixel (`world`) a fragment shows. Mask shapes of a `world` look are in map
// pixels; those of a `subject` look (a picture's own) are in the picture's box, reached through uLookSubject.

import { MAX_COMPONENTS, MAX_MASKS } from './schema.ts'
import type { CompiledLook } from './compile.ts'

export const LOOK_GLSL = /* glsl */ `
#define LOOK_MAX_MASKS ${MAX_MASKS}
#define LOOK_MAX_COMPONENTS ${MAX_COMPONENTS}
#define LOOK_MAX_COMPONENT_VECS ${MAX_COMPONENTS * 3}

uniform sampler2D uLookLut;
// lut edge, atlas width, atlas height, global strip on (1/0)
uniform vec4 uLookLutInfo;
uniform float uLookMaskCount;
uniform vec4 uLookMasks[LOOK_MAX_MASKS];
uniform vec4 uLookComps[LOOK_MAX_COMPONENT_VECS];
uniform sampler2D uLookBrush;
// world -> subject: subject = (world - xy) * zw
uniform vec4 uLookSubject;
// the vignette's frame in map pixels: x, y, w, h
uniform vec4 uLookFrame;
uniform vec4 uLookVignette;
uniform vec3 uLookVignetteColor;
uniform vec4 uLookGrain;
uniform float uLookTime;
// mask index to show (-1 = none), mode (0 = red overlay, 1 = black and white), opacity
uniform vec4 uLookPreview;

vec3 lookLut(vec3 c, float strip) {
  float n = uLookLutInfo.x;
  c = clamp(c, 0.0, 1.0);
  float b = c.b * (n - 1.0);
  float b0 = floor(b);
  float b1 = min(b0 + 1.0, n - 1.0);
  float x = c.r * (n - 1.0) + 0.5;
  float y = (strip * n + c.g * (n - 1.0) + 0.5) / uLookLutInfo.z;
  vec3 s0 = texture2D(uLookLut, vec2((b0 * n + x) / uLookLutInfo.y, y)).rgb;
  vec3 s1 = texture2D(uLookLut, vec2((b1 * n + x) / uLookLutInfo.y, y)).rgb;
  return mix(s0, s1, b - b0);
}

float lookLinear(float v) {
  return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4);
}

vec3 lookLab(vec3 c) {
  vec3 l = vec3(lookLinear(c.r), lookLinear(c.g), lookLinear(c.b));
  vec3 xyz = vec3(
    (0.4124 * l.r + 0.3576 * l.g + 0.1805 * l.b) / 0.95047,
    0.2126 * l.r + 0.7152 * l.g + 0.0722 * l.b,
    (0.0193 * l.r + 0.1192 * l.g + 0.9505 * l.b) / 1.08883);
  vec3 f = vec3(
    xyz.x > 0.008856 ? pow(xyz.x, 1.0 / 3.0) : 7.787 * xyz.x + 16.0 / 116.0,
    xyz.y > 0.008856 ? pow(xyz.y, 1.0 / 3.0) : 7.787 * xyz.y + 16.0 / 116.0,
    xyz.z > 0.008856 ? pow(xyz.z, 1.0 / 3.0) : 7.787 * xyz.z + 16.0 / 116.0);
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}

float lookHash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

vec3 lookGrade(vec3 c0, vec2 world) {
  vec3 c = uLookLutInfo.w > 0.5 ? lookLut(c0, 0.0) : c0;
  vec2 subject = (world - uLookSubject.xy) * uLookSubject.zw;
  float lum0 = dot(c0, vec3(0.2126, 0.7152, 0.0722));
  bool needLab = false;
  vec3 lab = vec3(0.0);
  float shown = 0.0;
  for (int k = 0; k < LOOK_MAX_MASKS; k++) {
    if (float(k) >= uLookMaskCount) break;
    vec4 mk = uLookMasks[k];
    float m = 0.0;
    for (int j = 0; j < LOOK_MAX_COMPONENTS; j++) {
      float fj = float(j);
      if (fj < mk.z) continue;
      if (fj >= mk.z + mk.w) break;
      vec4 h = uLookComps[j * 3];
      vec4 p = uLookComps[j * 3 + 1];
      vec4 q = uLookComps[j * 3 + 2];
      vec2 pos = mod(h.z, 4.0) >= 2.0 ? world : subject;
      float v = 1.0;
      if (h.x < 0.5) {
        v = 1.0;
      } else if (h.x < 1.5) {
        vec2 d = p.zw - p.xy;
        float t = dot(pos - p.xy, d) / max(dot(d, d), 1e-6);
        v = 1.0 - smoothstep(0.0, 1.0, t);
      } else if (h.x < 2.5) {
        vec2 o = pos - p.xy;
        vec2 r = vec2(o.x * q.x + o.y * q.y, -o.x * q.y + o.y * q.x) / p.zw;
        float d = length(r);
        v = q.z < 0.001 ? (d <= 1.0 ? 1.0 : 0.0) : 1.0 - smoothstep(1.0 - q.z, 1.0, d);
      } else if (h.x < 3.5) {
        vec2 hs = p.zw * 0.5;
        float rad = min(q.y, min(hs.x, hs.y));
        vec2 d = abs(pos - (p.xy + hs)) - hs + rad;
        float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rad;
        v = q.x > 0.001 ? smoothstep(0.0, q.x, -sd) : (sd <= 0.0 ? 1.0 : 0.0);
      } else if (h.x < 4.5) {
        vec4 b = texture2D(uLookBrush, clamp(pos * q.xy, 0.0, 1.0));
        vec4 sel = vec4(1.0) - step(vec4(0.5), abs(vec4(0.0, 1.0, 2.0, 3.0) - p.x));
        v = dot(b, sel);
      } else if (h.x < 5.5) {
        if (!needLab) { lab = lookLab(c0); needLab = true; }
        v = 1.0 - smoothstep(p.w, p.w + max(q.x, 0.001), distance(lab, p.xyz));
      } else {
        v = smoothstep(p.x - max(p.z, 0.0001), p.x, lum0) * (1.0 - smoothstep(p.y, p.y + max(p.w, 0.0001), lum0));
      }
      if (mod(h.z, 2.0) >= 1.0) v = 1.0 - v;
      v *= h.w;
      if (h.y < 0.5) m = max(m, v);
      else if (h.y < 1.5) m = m * (1.0 - v);
      else m = m * v;
    }
    if (mk.y > 0.5) m = 1.0 - m;
    if (abs(float(k) - uLookPreview.x) < 0.5) shown = m;
    m *= mk.x;
    if (m > 0.0) c = mix(c, lookLut(c, float(k + 1)), m);
  }
  if (uLookVignette.x != 0.0) {
    vec2 f = ((world - uLookFrame.xy) / uLookFrame.zw - 0.5) * 2.0;
    float aspect = uLookFrame.z / uLookFrame.w;
    float rnd = uLookVignette.z;
    // roundness 1: a circle that fits the frame's longer side; 0: an ellipse; -1: towards the frame's rectangle
    vec2 qv = abs(f) * mix(vec2(1.0), aspect > 1.0 ? vec2(1.0, 1.0 / aspect) : vec2(aspect, 1.0), max(rnd, 0.0));
    float e = mix(2.0, 8.0, max(-rnd, 0.0));
    float d = pow(pow(qv.x, e) + pow(qv.y, e), 1.0 / e);
    float start = 0.15 + uLookVignette.y * 0.95;
    float v = smoothstep(start, start + 0.05 + uLookVignette.w * 1.1, d);
    c = mix(c, uLookVignetteColor, v * abs(uLookVignette.x));
  }
  if (uLookGrain.x > 0.0) {
    vec2 cell = floor(world / max(uLookGrain.y, 1.0));
    float seed = uLookGrain.z > 0.5 ? floor(uLookTime * 24.0) * 17.0 : 0.0;
    float g = lookHash(cell + seed) - 0.5;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c += g * uLookGrain.x * 0.32 * (1.0 - abs(lum - 0.5));
  }
  if (uLookPreview.x > -0.5) {
    if (uLookPreview.y > 0.5) c = mix(c, vec3(shown), uLookPreview.z);
    else c = mix(c, vec3(1.0, 0.18, 0.22), shown * 0.6 * uLookPreview.z);
  }
  return clamp(c, 0.0, 1.0);
}
`

/** The precision line every host shader starts with (the same in the editor and the game). */
export const LOOK_PRECISION = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`

/**
 * A full-frame grading pass: the source is premultiplied, `outTexCoord` maps to map pixels through uLookUvToWorld
 * (world = xy + uv * zw), snapped to pixel centres when uLookSnap is 1. Used by the editor for everything and by the
 * game for a map's look (a camera pass).
 */
export const LOOK_PASS_FRAG = `${LOOK_PRECISION}
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
uniform vec4 uLookUvToWorld;
uniform float uLookSnap;
${LOOK_GLSL}
void main() {
  vec4 s = texture2D(uMainSampler, outTexCoord);
  vec2 world = uLookUvToWorld.xy + outTexCoord * uLookUvToWorld.zw;
  if (uLookSnap > 0.5) world = floor(world) + 0.5;
  if (s.a <= 0.0) {
    gl_FragColor = uLookPreview.x > -0.5 && uLookPreview.y > 0.5 ? vec4(0.0) : s;
    return;
  }
  vec3 c = lookGrade(s.rgb / s.a, world);
  gl_FragColor = vec4(c * s.a, s.a);
}
`

/**
 * The detail pass (texture, clarity, dehaze), run over what the grade drew. It needs the pixels around each one, so it
 * is a pass of its own over a whole subject (the editor's layer / picture canvas; in the game a post pipeline of the
 * object or the camera). `uLookUvToWorld` is the same mapping as the grade pass's (its size gives the uv of one map
 * pixel, so the radii are in map pixels whatever the zoom); `uLookDetail` = texture, clarity, dehaze (-1..1), unused.
 *
 *  - Texture: the luminance minus a blur of radius ~2 px, added back (+) or taken away (-), at most ±0.12: fine detail.
 *  - Clarity: the luminance minus a blur of radius ~10 px, weighted to the midtones, at most ±0.15: local contrast.
 *    (Limited so the hard edges of pixel art do not ring.)
 *  - Dehaze (as Lightroom's, the dark channel prior): the mean of the darkest channel over a neighbourhood (smooth, so
 *    no blocks) says how hazy it is there, counted only where bright and grey; + divides that haze out (transmission at
 *    least 0.55) and adds a little contrast and colour everywhere, - lays a light haze over the picture, thicker where
 *    it is already hazy. Calibrated to stay close to the old per-pixel dehaze at small amounts.
 *
 * Transparent pixels around are left out of the blurs (alpha-weighted), so a sprite's edge does not darken.
 */
export const LOOK_DETAIL_FRAG = `${LOOK_PRECISION}
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
uniform vec4 uLookUvToWorld;
uniform vec4 uLookDetail;

float detailLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Alpha-weighted mean luminance of 8 taps on a ring of radius r (uv), plus the centre.
float detailBlur(vec2 uv, vec2 r, float centre, float centreA) {
  float sum = centre * centreA;
  float wsum = centreA;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec4 s = texture2D(uMainSampler, uv + vec2(cos(a), sin(a)) * r);
    sum += detailLum(s.rgb);
    wsum += s.a;
    vec4 h = texture2D(uMainSampler, uv + vec2(cos(a + 0.3927), sin(a + 0.3927)) * r * 0.5);
    sum += detailLum(h.rgb);
    wsum += h.a;
  }
  return sum / max(wsum, 1e-4);
}

void main() {
  vec4 s = texture2D(uMainSampler, outTexCoord);
  if (s.a <= 0.0) {
    gl_FragColor = s;
    return;
  }
  vec3 c = s.rgb / s.a;
  vec2 px = 1.0 / max(abs(uLookUvToWorld.zw), vec2(1e-6));
  float L = detailLum(c);

  // Texture and clarity add back the difference to a blur, limited so hard pixel-art edges do not ring.
  if (uLookDetail.x != 0.0) {
    float fine = detailBlur(outTexCoord, px * 2.0, L, s.a);
    c += clamp((L - fine) * uLookDetail.x * 0.9, -0.12, 0.12);
  }
  if (uLookDetail.y != 0.0) {
    float wide = detailBlur(outTexCoord, px * 10.0, L, s.a);
    float mid = 1.0 - pow(abs(2.0 * L - 1.0), 2.0);
    c += clamp((L - wide) * uLookDetail.y * 0.7 * (0.3 + 0.7 * mid), -0.15, 0.15);
  }
  if (uLookDetail.z != 0.0) {
    // How hazy the neighbourhood is: the mean of the darkest channel over 5 x 5 taps 4 px apart (smooth, so no blocks),
    // counted only where it is bright and grey (colourful pixel art is not haze).
    float darkSum = 0.0;
    float n = 0.0;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec4 t = texture2D(uMainSampler, outTexCoord + vec2(float(x), float(y)) * px * 4.0);
        if (t.a > 0.5) {
          darkSum += min(t.r, min(t.g, t.b)) / t.a;
          n += 1.0;
        }
      }
    }
    float dark = n > 0.0 ? darkSum / n : min(c.r, min(c.g, c.b));
    float haze = smoothstep(0.3, 0.9, dark);
    float k = uLookDetail.z;
    const vec3 airlight = vec3(0.95);
    if (k > 0.0) {
      // remove the haze where there is some (transmission at least 0.55), then a little contrast and colour everywhere
      float t = 1.0 - 0.45 * k * haze;
      c = (c - airlight) / t + airlight;
      float L2 = detailLum(c);
      c = mix(vec3(L2), c, 1.0 + 0.2 * k);
      c = (c - 0.5) * (1.0 + 0.12 * k) + 0.5 - 0.03 * k;
    } else {
      // add haze: towards a light grey, more where it is already hazy, a little everywhere
      float amount = -k * (0.12 + 0.18 * haze);
      c = mix(c, vec3(0.55 + 0.35 * L), amount);
    }
  }
  c = clamp(c, 0.0, 1.0);
  gl_FragColor = vec4(c * s.a, s.a);
}
`

/** The uniform values of the detail pass for a compiled look (besides `uLookUvToWorld`, set by the host). */
export function lookDetailUniforms(look: Pick<CompiledLook, 'detail'>): UniformValue[] {
  return [{ name: 'uLookDetail', type: '4f', value: look.detail }]
}

export interface UniformValue {
  name: string
  type: '1f' | '4f' | '3f' | '4fv'
  value: number | number[] | Float32Array
}

/** Where a pass is drawn, in map pixels. */
export interface LookPlacement {
  /** world -> subject: subject = (world - origin) * scale (scale -1 flips). */
  subject: { ox: number; oy: number; sx: number; sy: number }
  /** The vignette's frame (map pixels). */
  frame: { x: number; y: number; w: number; h: number }
  time?: number
  /** Show one mask (its index in the compiled look's maskIndex). */
  preview?: { mask: number; mode: 'overlay' | 'bw'; opacity?: number } | null
}

/** Every uniform value of LOOK_GLSL for a compiled look (textures are bound by the host). */
export function lookUniforms(look: CompiledLook, at: LookPlacement): UniformValue[] {
  const p = at.preview
  return [
    { name: 'uLookLutInfo', type: '4f', value: [look.lutSize, look.lutWidth, look.lutHeight, look.hasGlobal ? 1 : 0] },
    { name: 'uLookMaskCount', type: '1f', value: look.maskCount },
    { name: 'uLookMasks', type: '4fv', value: look.masks },
    { name: 'uLookComps', type: '4fv', value: look.comps },
    { name: 'uLookSubject', type: '4f', value: [at.subject.ox, at.subject.oy, at.subject.sx, at.subject.sy] },
    { name: 'uLookFrame', type: '4f', value: [at.frame.x, at.frame.y, Math.max(1, at.frame.w), Math.max(1, at.frame.h)] },
    { name: 'uLookVignette', type: '4f', value: look.vignette },
    { name: 'uLookVignetteColor', type: '3f', value: look.vignetteColor },
    { name: 'uLookGrain', type: '4f', value: look.grain },
    { name: 'uLookTime', type: '1f', value: at.time ?? 0 },
    { name: 'uLookPreview', type: '4f', value: p ? [p.mask, p.mode === 'bw' ? 1 : 0, p.opacity ?? 1, 0] : [-1, 0, 0, 0] },
  ]
}

/**
 * The subject mapping of a picture drawn in the box (x, y, w, h) of map pixels, flipped or not: its own pixels
 * (`own` = the picture's size before scaling), so its masks follow the picture when it is flipped or scaled.
 */
export function pictureSubject(box: { x: number; y: number; w: number; h: number }, own: { w: number; h: number }, flipX = false, flipY = false): LookPlacement['subject'] {
  const kx = own.w / Math.max(1e-6, box.w)
  const ky = own.h / Math.max(1e-6, box.h)
  return { ox: flipX ? box.x + box.w : box.x, oy: flipY ? box.y + box.h : box.y, sx: flipX ? -kx : kx, sy: flipY ? -ky : ky }
}

/** The inverse of a subject mapping: subject pixels -> map pixels. */
export const subjectToWorld = (s: LookPlacement['subject'], x: number, y: number): { x: number; y: number } => ({ x: s.ox + x / s.sx, y: s.oy + y / s.sy })
export const worldToSubject = (s: LookPlacement['subject'], x: number, y: number): { x: number; y: number } => ({ x: (x - s.ox) * s.sx, y: (y - s.oy) * s.sy })

export const WORLD_SUBJECT: LookPlacement['subject'] = { ox: 0, oy: 0, sx: 1, sy: 1 }
