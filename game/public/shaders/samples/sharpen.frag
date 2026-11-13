// @name Sharpen
// @description Unsharp mask: adds back the difference from a small blur.
uniform float amount; // @param 0 3 0.8 Amount
uniform float radius; // @param 0.5 4 1 Radius (map px)

void main() {
  vec2 uv = outTexCoord;
  vec2 w = worldAt(uv);
  vec4 c = texture2D(uMainSampler, uv);
  vec4 sum = c * 4.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    sum += texture2D(uMainSampler, uvAt(w + vec2(cos(a), sin(a)) * radius));
  }
  vec4 blur = sum / 12.0;
  vec3 rgb = c.rgb + amount * (c.rgb - blur.rgb);
  gl_FragColor = vec4(clamp(rgb, 0.0, c.a), c.a);
}
