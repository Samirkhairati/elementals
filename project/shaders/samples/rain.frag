// @name Rain
// @description Falling rain streaks laid over the picture, fixed to the map.
// @animated
uniform float density; // @param 0.1 1 0.5 Density
uniform float speed;   // @param 20 400 160 Speed (map px/s)
uniform float angle;   // @param -45 45 12 Slant (degrees)
uniform float streak;  // @param 4 32 12 Streak length (map px)
uniform vec3 colour;   // @color #bcd4ff Colour
uniform float opacity; // @param 0 1 0.5 Opacity

float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void main() {
  vec4 base = texture2D(uMainSampler, outTexCoord);
  vec2 w = worldAt(outTexCoord);
  float a = radians(angle);
  vec2 fall = vec2(-sin(a), cos(a));
  vec2 across = vec2(cos(a), sin(a));
  float u = dot(w, across);
  float v = dot(w, fall);
  float rain = 0.0;
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    float spacing = mix(6.0, 14.0, fl) / density;
    float cycle = 64.0 + 40.0 * fl;
    float x = u / spacing + fl * 17.0;
    float id = floor(x);
    float fx = fract(x);
    float r = hash1(id + fl * 91.0);
    float sp = speed * (1.0 + 0.3 * fl);
    float fy = fract((v - uTime * sp) / cycle + r);
    float lenFrac = streak / cycle;
    float tail = clamp((fy - (1.0 - lenFrac)) / lenFrac, 0.0, 1.0);
    float halfW = 0.5 / spacing;
    float line = 1.0 - smoothstep(halfW * 0.5, halfW * 1.5, abs(fx - 0.5));
    rain = max(rain, tail * line * (1.0 - 0.3 * fl));
  }
  gl_FragColor = vec4(base.rgb + colour * rain * opacity * base.a, base.a);
}
