// @name Drop shadow
// @description A soft coloured shadow cast behind the picture.
// @pad 8
uniform float offsetX;  // @param -8 8 2 Offset X (map px)
uniform float offsetY;  // @param -8 8 3 Offset Y (map px, down is positive)
uniform float softness; // @param 0 4 1.5 Softness (map px)
uniform vec3 colour;    // @color #000000 Colour
uniform float opacity;  // @param 0 1 0.5 Opacity

void main() {
  vec2 uv = outTexCoord;
  vec2 w = worldAt(uv) - vec2(offsetX, offsetY);
  vec4 base = texture2D(uMainSampler, uv);
  float sa = texture2D(uMainSampler, uvAt(w)).a * 2.0;
  float n = 2.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    sa += texture2D(uMainSampler, uvAt(w + vec2(cos(a), sin(a)) * softness)).a;
    n += 1.0;
  }
  sa = sa / n * opacity;
  vec4 shadow = vec4(colour * sa, sa);
  gl_FragColor = base + shadow * (1.0 - base.a);
}
