// @name Water ripple
// @description Animated wavy distortion, like looking through water.
// @animated
uniform float amplitude;  // @param 0 6 1.5 Amplitude (map px)
uniform float wavelength; // @param 4 96 24 Wavelength (map px)
uniform float speed;      // @param 0 6 2 Speed

void main() {
  vec2 w = worldAt(outTexCoord);
  float k = 6.2831853 / wavelength;
  float ph = uTime * speed;
  vec2 off = vec2(
    sin(w.y * k + ph) + 0.5 * sin(w.y * k * 2.3 - ph * 1.7),
    0.6 * sin(w.x * k * 0.8 + ph * 1.3)
  ) * amplitude;
  gl_FragColor = texture2D(uMainSampler, uvAt(w + off));
}
