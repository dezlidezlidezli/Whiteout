// Snowy valley floor. Inside the Hearth's warm radius the snow melts into thawed earth with a wet
// rim; the radius is a uniform so it can roll outward when the Hearth levels up.

import * as THREE from 'three';
import { PALETTE } from './models';

export interface GroundUniforms {
  uCenter: { value: THREE.Vector2 };
  uRadius: { value: number };
  uTime: { value: number };
  uWave: { value: number };
}

const NOISE = /* glsl */ `
float fkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float fkNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fkHash(i), fkHash(i + vec2(1.0, 0.0)), u.x), mix(fkHash(i + vec2(0.0, 1.0)), fkHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fkFbm(vec2 p) { return fkNoise(p) * 0.6 + fkNoise(p * 2.1 + 3.7) * 0.3 + fkNoise(p * 4.3 + 9.1) * 0.1; }
float fkMelt(vec2 xz) {
  float d = length(xz - uCenter);
  float n = (fkFbm(xz * 0.28) - 0.5) * 2.4;
  return smoothstep(uRadius + 0.9, uRadius - 0.9, d + n);
}
`;

export function createGround(size = 240, segs = 96): { mesh: THREE.Mesh; uniforms: GroundUniforms } {
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const uniforms: GroundUniforms = {
    uCenter: { value: new THREE.Vector2(0, 0) },
    uRadius: { value: 6 },
    uTime: { value: 0 },
    uWave: { value: -100 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const snow = new THREE.Color(PALETTE.snow);
  const shade = new THREE.Color(PALETTE.snowShade);
  const earth = new THREE.Color(PALETTE.thawedGround);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, {
      uSnow: { value: snow },
      uShade: { value: shade },
      uEarth: { value: earth },
    });
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uCenter; uniform float uRadius; uniform float uTime;
varying vec3 vFkWorld;
${NOISE}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec4 fkW = modelMatrix * vec4(transformed, 1.0);
float fkM = fkMelt(fkW.xz);
// Snow lies a little deeper than the thawed ground, with soft drifts.
transformed.y += (1.0 - fkM) * (0.05 + fkFbm(fkW.xz * 0.15) * 0.22);
vFkWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uCenter; uniform float uRadius; uniform float uTime; uniform float uWave;
uniform vec3 uSnow; uniform vec3 uShade; uniform vec3 uEarth;
varying vec3 vFkWorld;
${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 xz = vFkWorld.xz;
  float m = fkMelt(xz);
  float sn = fkFbm(xz * 0.6);
  vec3 snowC = mix(uShade, uSnow, 0.55 + 0.45 * sn);
  // Sparkle.
  float sp = step(0.985, fkHash(floor(xz * 9.0))) * (0.5 + 0.5 * sin(uTime * 3.0 + fkHash(floor(xz * 9.0)) * 40.0));
  snowC += sp * 0.25;
  float g = fkFbm(xz * 0.9);
  vec3 earthC = mix(uEarth * 0.72, uEarth * 1.08, g);
  // Grass tufts and dry patches.
  earthC = mix(earthC, vec3(0.42, 0.33, 0.22), smoothstep(0.62, 0.75, fkFbm(xz * 0.45 + 11.0)) * 0.55);
  float rim = m * (1.0 - m) * 4.0;
  vec3 c = mix(snowC, earthC, m);
  c *= 1.0 - rim * 0.28; // wet edge where the snow is melting
  // Warm shockwave band.
  float wd = abs(length(xz - uCenter) - uWave);
  c += vec3(1.0, 0.55, 0.2) * smoothstep(1.4, 0.0, wd) * 0.45;
  diffuseColor.rgb = c;
}`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return { mesh, uniforms };
}
