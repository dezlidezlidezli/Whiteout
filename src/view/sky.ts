// Dusk sky dome with stars and a slowly rippling aurora. Only visible when the camera looks up
// (title screen, cinematic beats); in play the fixed 50° camera sees ground + fog.

import * as THREE from 'three';
import { createProp, PROP_NAMES } from './models';

export class Sky {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private aurora: THREE.Object3D | null = null;
  private curtain: THREE.Object3D | null = null;

  constructor(parent: THREE.Object3D, horizon: THREE.Color) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uHorizon: { value: horizon.clone() },
        uZenith: { value: new THREE.Color(0x070c1c) },
        uGlow: { value: new THREE.Color(0x3a3a6a) },
        uAurora: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uGlow; uniform float uAurora;
        varying vec3 vDir;
        float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
        float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec3 d = normalize(vDir);
          float up = clamp(d.y, -0.2, 1.0);
          vec3 c = mix(uHorizon, uZenith, pow(max(up, 0.0), 0.55));
          // Warm low glow towards the camp side (south-west dusk).
          c += uGlow * pow(1.0 - abs(up), 6.0) * 0.6;
          // Stars.
          vec2 sp = d.xz / max(0.15, d.y + 0.25) * 60.0;
          float st = step(0.996, h(floor(sp))) * smoothstep(0.05, 0.4, up);
          st *= 0.6 + 0.4 * sin(uTime * 2.0 + h(floor(sp) + 3.0) * 30.0);
          c += vec3(st);
          // Aurora curtains in the north (-z).
          float north = smoothstep(0.1, -0.7, d.z);
          float band = 0.0;
          for (int k = 0; k < 3; k++) {
            float fk = float(k);
            float x = d.x * (2.2 + fk * 0.7) + uTime * (0.05 + fk * 0.02);
            float wave = sin(x * 3.0 + n(vec2(x, fk)) * 4.0) * 0.06 + 0.22 + fk * 0.08;
            float dist = abs(up - wave);
            float curtain = smoothstep(0.1, 0.0, dist) * (0.55 + 0.45 * n(vec2(x * 6.0, uTime * 0.3 + fk)));
            curtain += smoothstep(0.25, 0.0, up - wave) * step(wave, up + 0.25) * 0.15 * n(vec2(x * 10.0, uTime * 0.5));
            band += curtain * (1.0 - fk * 0.25);
          }
          vec3 aur = mix(vec3(0.2, 1.0, 0.65), vec3(0.55, 0.45, 1.0), smoothstep(0.15, 0.45, up));
          c += aur * band * north * 0.55 * uAurora;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), this.mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    // If the art set provides an aurora mesh, hang it in the northern sky as well.
    if ((PROP_NAMES as readonly string[]).includes('aurora')) {
      this.aurora = createProp('aurora');
      this.aurora.position.set(0, 32, -95);
      parent.add(this.aurora);
      this.curtain = this.aurora.getObjectByName('curtain') ?? this.aurora;
      // It hangs beyond the fog distance: never fog it out.
      this.aurora.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && 'fog' in m) (m as THREE.MeshBasicMaterial).fog = false;
      });
    }
  }

  update(time: number, camPos: THREE.Vector3): void {
    this.mat.uniforms.uTime.value = time;
    this.mesh.position.copy(camPos);
    if (this.aurora && this.curtain) {
      // Gentle wave: breathe in height and drift sideways.
      this.aurora.position.set(camPos.x + Math.sin(time * 0.07) * 6, 32, camPos.z - 95);
      this.curtain.scale.y = 1 + Math.sin(time * 0.35) * 0.2;
      this.curtain.position.x = Math.sin(time * 0.21) * 3;
    }
  }
}
