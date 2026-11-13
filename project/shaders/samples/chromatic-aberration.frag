// @name Chromatic aberration
// @description Splits red and blue apart along the direction away from the centre.
uniform float amount; // @param 0 8 2 Split (map px)
uniform float edge;   // @param 0 1 0.7 Grows toward edges

void main() {
  vec2 uv = outTexCoord;
  vec2 w = worldAt(uv);
  vec2 d = (uv - 0.5) * uWorld.zw;            // centre -> here, in map pixels
  float len = length(d);
  vec2 dir = d / max(len, 0.0001);
  float reach = clamp(len / (0.5 * length(uWorld.zw)), 0.0, 1.0);
  float k = amount * mix(1.0, reach, edge);
  vec4 g = texture2D(uMainSampler, uv);
  vec4 r = texture2D(uMainSampler, uvAt(w + dir * k));
  vec4 b = texture2D(uMainSampler, uvAt(w - dir * k));
  gl_FragColor = vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
}
