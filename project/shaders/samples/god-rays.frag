// @name God rays
// @description Slowly shifting light shafts fixed to the map, added over the picture.
// @animated
uniform float angle;     // @param 0 360 60 Direction (degrees)
uniform float width;     // @param 8 128 40 Shaft width (map px)
uniform float speed;     // @param 0 3 0.5 Speed
uniform vec3 colour;     // @color #ffe9b0 Colour
uniform float intensity; // @param 0 1 0.35 Intensity

void main() {
  vec4 base = texture2D(uMainSampler, outTexCoord);
  vec2 w = worldAt(outTexCoord);
  float a = radians(angle);
  vec2 dir = vec2(cos(a), sin(a));
  vec2 perp = vec2(-dir.y, dir.x);
  float p = dot(w, perp) / width * 6.2831853;
  float along = dot(w, dir);
  float t = uTime * speed;
  float beam = 0.5 * sin(p * 0.35 + t) + 0.3 * sin(p * 0.83 - t * 1.3) + 0.2 * sin(p * 1.7 + t * 0.7);
  beam = pow(clamp(beam * 0.5 + 0.55, 0.0, 1.0), 2.5);
  float fade = 0.65 + 0.35 * sin(along / (width * 6.0) + t * 0.4);
  vec3 add = colour * beam * fade * intensity * base.a;
  gl_FragColor = vec4(base.rgb + add, base.a);
}
