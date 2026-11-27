// Snowy valley floor. Inside the Hearth's warm radius the snow melts into thawed earth with a wet
// rim; the radius is a uniform so it can roll outward when the Hearth levels up.

import * as THREE from 'three';
import { PALETTE } from './models';

export interface GroundUniforms {
  /** Baked flatten mask: R = tight (colour), G = dilated (no snow height). See SnowMask. */
  uMask: { value: THREE.Texture | null };
  /** World x0, z0 of the mask and its size in metres. */
  uMaskRect: { value: THREE.Vector4 };
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

function blankMask(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

export function createGround(size = 240, segs = 96): { mesh: THREE.Mesh; uniforms: GroundUniforms } {
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const uniforms: GroundUniforms = {
    uMask: { value: blankMask() },
    uMaskRect: { value: new THREE.Vector4(-1, -1, 2, 2) },
    uCenter: { value: new THREE.Vector2(0, 0) },
    uRadius: { value: 6 },
    uTime: { value: 0 },
    uWave: { value: -100 },
  };
  // Lambert: the ground covers most pixels on a phone; PBR here buys nothing visible.
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
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
uniform sampler2D uMask; uniform vec4 uMaskRect;
varying vec3 vFkWorld;
varying vec3 vFkN; // per-vertex noise: snow shade, earth tone, dry patches
varying float vFkFlat;
${NOISE}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec4 fkW = modelMatrix * vec4(transformed, 1.0);
float fkM = fkMelt(fkW.xz);
// Snow lies a little deeper than the thawed ground, with soft drifts.
vec4 fkMk = texture2D(uMask, (fkW.xz - uMaskRect.xy) / uMaskRect.zw);
float fkFl = fkMk.g; // dilated past a grid cell: snow can never rise over a slab edge
vFkFlat = fkMk.r;
// Snow lies a little deeper than the thawed ground, with soft drifts; pressed flat under yard floors.
transformed.y += (1.0 - fkM) * (0.05 + fkFbm(fkW.xz * 0.15) * 0.22) * (1.0 - fkFl) - fkFl * 0.03;
vFkWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vFkN = vec3(fkFbm(fkW.xz * 0.6), fkFbm(fkW.xz * 0.9), fkFbm(fkW.xz * 0.45 + 11.0));`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uCenter; uniform float uRadius; uniform float uTime; uniform float uWave;
uniform vec3 uSnow; uniform vec3 uShade; uniform vec3 uEarth;
uniform sampler2D uMask; uniform vec4 uMaskRect;
varying vec3 vFkWorld;
varying vec3 vFkN;
varying float vFkFlat;
${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 xz = vFkWorld.xz;
  float m = fkMelt(xz);
  float sn = vFkN.x;
  vec3 snowC = mix(uShade, uSnow, 0.55 + 0.45 * sn);
  // Sparkle.
  float sp = step(0.985, fkHash(floor(xz * 9.0))) * (0.5 + 0.5 * sin(uTime * 3.0 + fkHash(floor(xz * 9.0)) * 40.0));
  snowC += sp * 0.25;
  float g = vFkN.y;
  vec3 earthC = mix(uEarth * 0.72, uEarth * 1.08, g);
  // Grass tufts and dry patches.
  earthC = mix(earthC, vec3(0.42, 0.33, 0.22), smoothstep(0.62, 0.75, vFkN.z) * 0.55);
  float rim = m * (1.0 - m) * 4.0;
  vec3 c = mix(snowC, earthC, m);
  c *= 1.0 - rim * 0.28; // wet edge where the snow is melting
  // Warm shockwave band.
  float wd = abs(length(xz - uCenter) - uWave);
  c += vec3(1.0, 0.55, 0.2) * smoothstep(1.4, 0.0, wd) * 0.45;
  // Trodden, slightly darker snow around floors so slab edges sit in the scene.
  float fkTight = texture2D(uMask, (xz - uMaskRect.xy) / uMaskRect.zw).r;
  c = mix(c, c * vec3(0.86, 0.88, 0.94), fkTight * (1.0 - m));
  diffuseColor.rgb = c;
}`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return { mesh, uniforms };
}
