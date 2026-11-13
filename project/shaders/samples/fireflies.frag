// @name Fireflies
// @description Glowing dots that drift and blink, fixed to the map.
// @animated
uniform float density; // @param 0.05 1 0.3 Density
uniform float size;    // @param 0.5 4 1.5 Dot size (map px)
uniform float speed;   // @param 0 3 0.8 Drift speed
uniform vec3 colour;   // @color #d8ff6a Colour
uniform float glow;    // @param 0 1 0.8 Intensity

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec4 base = texture2D(uMainSampler, outTexCoord);
  vec2 w = worldAt(outTexCoord);
  float cell = 48.0;
  vec2 p = w / cell;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float h = hash2(id);
  float h2 = hash2(id + 7.3);
  float h3 = hash2(id + 19.1);
  float present = step(h, density);
  float t = uTime * speed;
  vec2 centre = vec2(0.5 + 0.25 * sin(t * (0.4 + h2) + h3 * 6.2831853),
                     0.5 + 0.25 * sin(t * (0.5 + h3) + h2 * 6.2831853));
  float d = length(f - centre) * cell;             // map pixels from the dot
  float blink = 0.5 + 0.5 * sin(uTime * (1.0 + 2.0 * h3) + h * 6.2831853);
  float core = 1.0 - smoothstep(size * 0.5, size, d);
  float halo = exp(-d * d / (size * size * 6.0)) * 0.5;
  float v = present * blink * (core + halo) * glow;
  gl_FragColor = vec4(base.rgb + colour * v * base.a, base.a);
}
