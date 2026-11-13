// @name Bloom
// @description Bright areas glow: bright-pass, 13-tap blur, added on top.
// @pad 8
uniform float threshold; // @param 0 1 0.6 Threshold
uniform float radius;    // @param 1 12 4 Radius (map px)
uniform float intensity; // @param 0 3 1 Intensity

vec3 brightPass(vec2 uv, float thr) {
  vec4 s = texture2D(uMainSampler, uv);
  return max(s.rgb - vec3(thr) * s.a, vec3(0.0));
}

void main() {
  vec2 uv = outTexCoord;
  vec2 w = worldAt(uv);
  vec4 base = texture2D(uMainSampler, uv);
  vec3 sum = brightPass(uv, threshold) * 2.0;
  float total = 2.0;
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0471976;
    sum += brightPass(uvAt(w + vec2(cos(a), sin(a)) * radius * 0.5), threshold) * 1.5;
    float a2 = a + 0.5235988;
    sum += brightPass(uvAt(w + vec2(cos(a2), sin(a2)) * radius), threshold);
    total += 2.5;
  }
  vec3 glow = sum / total * intensity * 2.0;
  float ga = clamp(max(glow.r, max(glow.g, glow.b)), 0.0, 1.0);
  gl_FragColor = vec4(base.rgb + glow, max(base.a, ga));
}
