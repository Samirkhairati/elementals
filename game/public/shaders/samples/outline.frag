// @name Outline
// @description Draws a coloured outline around the picture's opaque edge.
// @pad 4
uniform float thickness; // @param 1 4 1 Thickness (map px)
uniform vec3 colour;     // @color #ffffff Colour

void main() {
  vec2 uv = outTexCoord;
  vec2 w = worldAt(uv);
  vec4 base = texture2D(uMainSampler, uv);
  float edge = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 off = vec2(cos(a), sin(a)) * thickness;
    edge = max(edge, texture2D(uMainSampler, uvAt(w + off)).a);
  }
  float line = edge * (1.0 - base.a);
  gl_FragColor = vec4(base.rgb + colour * line, base.a + line);
}
