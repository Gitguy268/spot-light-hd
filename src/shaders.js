// Post-processing shaders: the 8-bit look (the classic game's palette) and the photo grade.
import * as THREE from 'three';

const PALETTE = ['#1C1B20', '#4A4F5C', '#8FA9C4', '#C8925A', '#9A6A3C', '#E2B57F', '#2F6F73', '#4F9A9A',
  '#D7263D', '#FF2A2A', '#FFD0D0', '#F4F4F0', '#C9C9C2', '#E6C229', '#C8E04A', '#3B2A20'].map(h => new THREE.Color(h));

// Pixelate to 1/5 resolution and snap every pixel to the 16-colour palette
export const RetroShader = {
  name: 'RetroShader',
  uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, pixel: { value: 5 }, palette: { value: PALETTE.map(c => new THREE.Vector3(c.r, c.g, c.b)) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float pixel; uniform vec3 palette[16]; varying vec2 vUv;
    void main() {
      vec2 cell = pixel / resolution;
      vec2 uv = (floor(vUv / cell) + 0.5) * cell;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      // ordered dither so gradients don't band into blocks
      vec2 p = floor(vUv / cell);
      float d = (mod(p.x + p.y * 2.0, 4.0) / 4.0 - 0.375) * 0.08;
      c += d;
      vec3 best = palette[0]; float bd = 1e9;
      for (int i = 0; i < 16; i++) { vec3 q = pow(palette[i], vec3(1.0 / 2.2)); float dd = dot(c - q, c - q); if (dd < bd) { bd = dd; best = q; } }
      gl_FragColor = vec4(best, 1.0);
    }`,
};

// Colour grade for the camera: filters, a soft vignette and fine film grain
export const GradeShader = {
  name: 'GradeShader',
  uniforms: { tDiffuse: { value: null }, mode: { value: 0 }, time: { value: 0 }, resolution: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform int mode; uniform float time; uniform vec2 resolution; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      if (mode == 1) c = c * vec3(1.08, 1.0, 0.86) + vec3(0.02, 0.01, 0.0);
      else if (mode == 2) c = vec3(pow(l, 0.95));
      else if (mode == 3) { c = mix(vec3(l), c, 0.7) * vec3(1.06, 1.0, 0.88); c = c * 0.92 + 0.05; }
      else if (mode == 4) c = c * vec3(0.9, 1.0, 1.1);
      vec2 q = vUv - 0.5;
      float vig = smoothstep(0.85, 0.25, length(q * vec2(resolution.x / resolution.y, 1.0)) * 0.9);
      c *= mix(0.78, 1.0, vig);
      float g = (hash(vUv * resolution + fract(time) * 100.0) - 0.5) * (mode == 3 ? 0.07 : 0.025);
      gl_FragColor = vec4(c + g, 1.0);
    }`,
};
