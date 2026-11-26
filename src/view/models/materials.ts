// Small shared material set. Every model uses these (vertex colours carry the palette).
import * as THREE from 'three';
import { PALETTE } from './palette';

let _mats: ReturnType<typeof make> | null = null;

function make() {
  /** Default: flat-shaded, matte, vertex coloured. */
  const std = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0 });
  std.name = 'fk-std';
  /** Unlit glow for flames, windows, lamps (vertex coloured). Bloom-friendly when tone mapping is on. */
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  glow.name = 'fk-glow';
  /** Lit but self-illuminated amber (embers, hot coals). */
  const ember = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.45, metalness: 0,
    emissive: new THREE.Color(0xff4a08), emissiveIntensity: 0.55,
  });
  ember.name = 'fk-ember';
  /** Translucent ice. */
  const ice = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.18, metalness: 0.05,
    transparent: true, opacity: 0.78, emissive: new THREE.Color(0x1b4f6e), emissiveIntensity: 0.35,
  });
  ice.name = 'fk-ice';
  /** Crowd material: vertex colours, instanceColor applied only where tintMask = 1. */
  const crowd = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
  crowd.name = 'fk-crowd';
  crowd.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tintMask;')
      .replace(
        '#include <color_vertex>',
        `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor = vec4( 1.0 );
        #endif
        #ifdef USE_COLOR
          vColor.rgb *= color.rgb;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, tintMask );
        #endif`,
      );
  };
  crowd.customProgramCacheKey = () => 'fk-crowd-tint';
  return { std, glow, ember, ice, crowd };
}

export function mats() {
  if (!_mats) _mats = make();
  return _mats;
}
