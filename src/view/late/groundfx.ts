// Extends the view's snow ground shader (at runtime, guarded) with what the late game needs:
//  - uFkGreen: the thawed earth turns lush green after the finale
//  - uFkPatches: lingering snow patches once the whole valley has thawed
//  - uFkWarm[]: small rings of melted snow around lit braziers (carry the flame)
// If the ground shader no longer has the anchors this relies on, it does nothing (plain look).

import * as THREE from 'three';
import type { View } from '../view';

export const WARM_SPOTS = 12;

export interface GroundFx {
  uFkGreen: { value: number };
  uFkPatches: { value: number };
  /** x, z, radius (radius 0 = unused). */
  uFkWarm: { value: THREE.Vector3[] };
}

export function patchGround(view: View): GroundFx {
  const u: GroundFx = {
    uFkGreen: { value: 0 },
    uFkPatches: { value: 0 },
    uFkWarm: { value: Array.from({ length: WARM_SPOTS }, () => new THREE.Vector3(0, 0, 0)) },
  };
  const mat = view['ground'].mesh.material as THREE.Material;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    const fs = sh.fragmentShader;
    const anchors = ['fkMelt', 'fkNoise', 'fkFbm', 'vFkWorld', 'uniform vec3 uSnow;', 'uEarth', '#include <alphamap_fragment>'];
    if (!anchors.every((a) => fs.includes(a))) return;
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = fs
      .replace('uniform vec3 uSnow;', `uniform vec3 uSnow; uniform float uFkGreen; uniform float uFkPatches; uniform vec3 uFkWarm[${WARM_SPOTS}];`)
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
{
  vec2 fxz = vFkWorld.xz;
  float fm = fkMelt(fxz);
  float tuft = fkNoise(fxz * 1.3);
  // Melted rings round lit braziers.
  float wm = 0.0;
  for (int i = 0; i < ${WARM_SPOTS}; i++) {
    vec3 w = uFkWarm[i];
    if (w.z > 0.0) wm = max(wm, smoothstep(w.z + 0.4, w.z - 0.6, length(fxz - w.xy) + (tuft - 0.5) * 0.9));
  }
  wm *= 1.0 - fm;
  vec3 earthW = uEarth * (0.72 + 0.36 * tuft);
  diffuseColor.rgb = mix(diffuseColor.rgb, earthW, wm);
  diffuseColor.rgb *= 1.0 - wm * (1.0 - wm) * 0.9;
  vec3 lush = diffuseColor.rgb * vec3(0.74, 1.16, 0.58) + vec3(0.015, 0.05, 0.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, lush, max(fm, wm) * uFkGreen * (0.55 + 0.45 * tuft));
  float pn = fkFbm(fxz * 0.16 + vec2(5.0, 2.0));
  float patchK = smoothstep(0.71, 0.75, pn + tuft * 0.05) * uFkPatches;
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnow * (0.9 + 0.1 * tuft), patchK);
}`,
      );
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|fk-late-ground2`;
  mat.needsUpdate = true;
  return u;
}
