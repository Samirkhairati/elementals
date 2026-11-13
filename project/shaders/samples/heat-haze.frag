// @name Heat haze
// @description Rising shimmer that wobbles the picture sideways, stronger toward the bottom.
// @animated
uniform float amplitude;  // @param 0 5 1 Amplitude (map px)
uniform float wavelength; // @param 4 96 20 Wavelength (map px)
uniform float speed;      // @param 0 8 3 Speed
uniform float bottom;     // @param 0 1 0.6 Stronger at bottom

void main() {
  vec2 uv = outTexCoord;
  vec2 w = worldAt(uv);
  // 0 at the top of the box, 1 at the bottom, whichever way uv y runs
  float down = uWorld.w > 0.0 ? uv.y : 1.0 - uv.y;
  float k = 6.2831853 / wavelength;
  float wob = sin(w.y * k - uTime * speed) + 0.5 * sin(w.y * k * 2.1 - uTime * speed * 1.4 + w.x * 0.05);
  float strength = mix(1.0, down, bottom);
  vec2 off = vec2(wob * amplitude * strength, 0.0);
  gl_FragColor = texture2D(uMainSampler, uvAt(w + off));
}
