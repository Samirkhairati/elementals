// @name Hologram
// @description Tinted, flickering ghost with scanlines, a moving bright band and glitch jitter; keeps the picture's alpha.
// @animated
uniform vec3 tint;      // @color #5ad8ff Tint
uniform float tintAmt;  // @param 0 1 0.8 Tint amount
uniform float lineSize; // @param 1 8 2 Scanline period (map px)
uniform float flicker;  // @param 0 1 0.3 Flicker
uniform float glitch;   // @param 0 1 0.4 Glitch jitter

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = outTexCoord;
  vec2 w = worldAt(uv);
  float row = floor(w.y / 3.0);
  float tick = floor(uTime * 8.0);
  float jit = step(0.96, hash2(vec2(row, tick))) * glitch * 3.0;
  vec4 s = texture2D(uMainSampler, uvAt(w + vec2(jit, 0.0)));
  float lum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
  vec3 holo = tint * lum * 1.4 + tint * s.a * 0.12;
  vec3 col = mix(s.rgb, holo, tintAmt);
  float lines = 0.7 + 0.3 * sin(w.y / lineSize * 6.2831853);
  float band = pow(fract(w.y / 160.0 - uTime * 0.25), 6.0) * 0.5;
  float fl = 1.0 - flicker * (0.5 + 0.5 * sin(uTime * 41.0) * sin(uTime * 13.0 + 1.0));
  float k = lines * fl;
  float af = mix(1.0, 0.75 + 0.25 * lines, tintAmt) * (0.85 + 0.15 * fl);
  gl_FragColor = vec4((col + tint * band * s.a) * k * af, s.a * af);
}
