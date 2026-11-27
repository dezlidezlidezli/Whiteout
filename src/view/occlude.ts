// Screen-space see-through: any scenery fragment that lies in front of the player (or the current
// guide target) and inside a soft circle around them on screen is dithered away. One shared set of
// uniforms, a cached material clone per art material, no per-object work each frame.

import * as THREE from 'three';

const MAX = 2;

export const seeUniforms = {
  /** xy = centre in framebuffer pixels, z = radius in pixels, w = window depth (0..1) of the subject. */
  uSee: { value: [new THREE.Vector4(-1e4, -1e4, 0, 0), new THREE.Vector4(-1e4, -1e4, 0, 0)] },
};

const clones = new WeakMap<THREE.Material, THREE.Material>();

/** Return a see-through variant of `m` (cached). Glow/additive and already-transparent materials pass through. */
export function seeThrough(m: THREE.Material): THREE.Material {
  const hit = clones.get(m);
  if (hit) return hit;
  if ((m as THREE.Material & { userData: { fkSee?: boolean } }).userData.fkSee) return m;
  const c = m.clone();
  c.userData = { ...m.userData, fkSee: true };
  const prev = m.onBeforeCompile;
  c.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uSee = seeUniforms.uSee;
    // World height of each fragment: the bottom of walls/props never dissolves (barriers stay readable).
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying float vFkWY;`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
#ifdef USE_INSTANCING
  vFkWY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
#else
  vFkWY = (modelMatrix * vec4(transformed, 1.0)).y;
#endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uSee[${MAX}];\nvarying float vFkWY;`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
{
  // 4x4 Bayer threshold for a soft, stable dissolve.
  vec2 fp = floor(gl_FragCoord.xy);
  vec2 p1 = mod(fp, 2.0);
  vec2 p2 = mod(floor(fp * 0.5), 2.0);
  float b1 = p1.x * 2.0 + p1.y * 3.0 - 4.0 * p1.x * p1.y;
  float b2 = p2.x * 2.0 + p2.y * 3.0 - 4.0 * p2.x * p2.y;
  float bayer = (4.0 * b1 + b2 + 0.5) / 16.0;
  for (int i = 0; i < ${MAX}; i++) {
    vec4 s = uSee[i];
    if (s.z <= 0.0) continue;
    float r = length(gl_FragCoord.xy - s.xy) / s.z;
    if (r < 1.0 && gl_FragCoord.z < s.w - 0.0006 && vFkWY > 0.45) {
      float cut = smoothstep(1.0, 0.55, r) * 0.82;
      if (bayer < cut) discard;
    }
  }
}`,
      );
  };
  c.customProgramCacheKey = () => `fkSee|${m.customProgramCacheKey?.() ?? ''}|${m.type}`;
  clones.set(m, c);
  return c;
}

/** Swap every mesh material under `o` for its see-through variant. */
export function makeSeeThrough(o: THREE.Object3D): void {
  o.traverse((x) => {
    const mesh = x as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material;
    if (Array.isArray(mat)) mesh.material = mat.map((q) => (isSolid(q) ? seeThrough(q) : q));
    else if (isSolid(mat)) mesh.material = seeThrough(mat);
  });
}

function isSolid(m: THREE.Material): boolean {
  return !m.transparent && m.blending === THREE.NormalBlending;
}

const _p = new THREE.Vector3();

/** Update subject i (0 = player, 1 = guide target) from a world point; radius in CSS px. */
export function setSeeSubject(i: number, cam: THREE.Camera, x: number, y: number, z: number, radiusCss: number, size: THREE.Vector2, dpr: number): void {
  const s = seeUniforms.uSee.value[i];
  _p.set(x, y, z).project(cam);
  if (_p.z > 1 || Math.abs(_p.x) > 1.3 || Math.abs(_p.y) > 1.3) {
    s.z = 0;
    return;
  }
  s.x = (_p.x * 0.5 + 0.5) * size.x;
  s.y = (_p.y * 0.5 + 0.5) * size.y;
  s.z = radiusCss * dpr;
  s.w = _p.z * 0.5 + 0.5;
}

export function clearSeeSubject(i: number): void {
  seeUniforms.uSee.value[i].z = 0;
}
