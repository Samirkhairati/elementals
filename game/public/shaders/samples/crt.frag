// @name CRT
// @description Scanlines, RGB subpixel tint, soft vignette and a slight flicker.
// @animated
uniform float lineSize; // @param 1 8 3 Scanline period (map px)
uniform float lineDark; // @param 0 1 0.3 Scanline darkness
uniform float subpixel; // @param 0 1 0.25 RGB subpixel tint
uniform float vignette; // @param 0 1 0.35 Vignette
uniform float flicker;  // @param 0 0.2 0.04 Flicker

void main() {
  vec2 uv = outTexCoord;
  vec2 w = worldAt(uv);
  vec4 c = texture2D(uMainSampler, uv);
  float scan = 0.5 + 0.5 * sin(w.y / lineSize * 6.2831853);
  float shade = 1.0 - lineDark * (1.0 - scan);
  float column = mod(floor(w.x), 3.0);
  vec3 mask = vec3(1.0) - subpixel * vec3(
    column < 0.5 ? 0.0 : 1.0,
    (column > 0.5 && column < 1.5) ? 0.0 : 1.0,
    column > 1.5 ? 0.0 : 1.0);
  vec2 d = uv - 0.5;
  float vig = 1.0 - vignette * smoothstep(0.2, 0.75, length(d));
  float fl = 1.0 - flicker * (0.5 + 0.5 * sin(uTime * 60.0) * sin(uTime * 7.3));
  c.rgb *= mask * shade * vig * fl;
  gl_FragColor = c;
}
