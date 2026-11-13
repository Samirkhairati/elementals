// @name Pixelate
// @description Snaps the picture to big square blocks.
uniform float block; // @param 1 32 4 Block size (map px)

void main() {
  vec2 w = worldAt(outTexCoord);
  float b = max(block, 1.0);
  vec2 centre = (floor(w / b) + 0.5) * b;
  gl_FragColor = texture2D(uMainSampler, uvAt(centre));
}
