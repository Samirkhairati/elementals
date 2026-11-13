// @name Snow
// @description Soft snowflakes drifting down in three depth layers, fixed to the map.
// @animated
uniform float density; // @param 0.05 1 0.4 Density
uniform float size;    // @param 0.5 4 1.5 Flake size (map px)
uniform float speed;   // @param 2 80 20 Fall speed (map px/s)
uniform float opacity; // @param 0 1 0.8 Opacity

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec4 base = texture2D(uMainSampler, outTexCoord);
  vec2 w = worldAt(outTexCoord);
  float snow = 0.0;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float scale = 1.0 + fl * 0.8;       // deeper layers: larger cells, bigger, faster
    float cell = 20.0 * scale;
    vec2 p = w / cell;
    p.y -= uTime * speed * scale / cell;
    vec2 id = floor(p) + fl * 37.0;
    vec2 f = fract(p);
    float h = hash2(id);
    float h2 = hash2(id + 13.7);
    float present = step(h, density);
    vec2 centre = vec2(0.5 + 0.25 * sin(uTime * (0.6 + h2) + h * 6.2831853), 0.5 + 0.25 * (h2 - 0.5) * 2.0);
    float rad = min(size * scale / cell, 0.24);
    float d = length(f - centre);
    snow = max(snow, present * (1.0 - smoothstep(rad * 0.5, rad, d)));
  }
  gl_FragColor = vec4(base.rgb + vec3(snow * opacity * base.a), base.a);
}
