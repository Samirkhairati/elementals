// @name Dither
// @description Ordered 4x4 Bayer dither down to a few colour levels, per map pixel.
uniform float levels;   // @param 2 16 4 Levels per channel
uniform float strength; // @param 0 1 1 Dither strength

void main() {
  vec2 uv = outTexCoord;
  vec2 px = mod(floor(worldAt(uv)), 4.0);
  vec2 lo = mod(px, 2.0);
  vec2 hi = floor(px / 2.0);
  vec2 x = abs(lo - hi);                          // xor of the bits
  float bayer = (x.x * 8.0 + hi.y * 4.0 + x.y * 2.0 + lo.y) / 16.0;
  float thr = (bayer - 0.46875) * strength;       // centred on 0
  vec4 s = texture2D(uMainSampler, uv);
  vec3 c = s.rgb / max(s.a, 0.0001);
  float n = max(levels - 1.0, 1.0);
  vec3 q = clamp(floor(c * n + thr + 0.5) / n, 0.0, 1.0);
  gl_FragColor = vec4(q * s.a, s.a);
}
