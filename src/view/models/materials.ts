// Small shared material set. Every model uses these (vertex colours carry the palette).
import * as THREE from 'three';
import { PALETTE } from './palette';

let _mats: ReturnType<typeof make> | null = null;

/** Debug/compare switches (gallery only). Must be set before the first model is built. */
export const RENDER_FLAGS = { standardMaterials: false, unskinnedCharacters: false };

/** Cheap matte material: per-fragment Lambert (no specular), flat shaded. */
function matte(p: THREE.MeshLambertMaterialParameters & { roughness?: number; metalness?: number }): THREE.Material {
  const { roughness, metalness, ...rest } = p;
  if (RENDER_FLAGS.standardMaterials) return new THREE.MeshStandardMaterial({ ...rest, roughness: roughness ?? 0.82, metalness: metalness ?? 0 });
  const m = new THREE.MeshLambertMaterial(rest);
  // Lambert has no specular/energy-compensation term: lift albedo a touch so it matches the old look
  if (rest.vertexColors) m.color.setScalar(1.06);
  return m;
}

function make() {
  /** Default: flat-shaded, matte, vertex coloured. */
  const std = matte({ vertexColors: true, flatShading: true, roughness: 0.82 });
  std.name = 'fk-std';
  /** Unlit glow for flames, windows, lamps (vertex coloured). Bloom-friendly when tone mapping is on. */
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  glow.name = 'fk-glow';
  /** Lit but self-illuminated amber (embers, hot coals). */
  const ember = matte({
    vertexColors: true, flatShading: true, roughness: 0.45,
    emissive: new THREE.Color(0xff4a08), emissiveIntensity: 0.55,
  });
  ember.name = 'fk-ember';
  /** Translucent ice. */
  const ice = matte({
    vertexColors: true, flatShading: true, roughness: 0.18, metalness: 0.05,
    transparent: true, opacity: 0.8, emissive: new THREE.Color(0x1b4f6e), emissiveIntensity: RENDER_FLAGS.standardMaterials ? 0.35 : 0.45,
  });
  ice.name = 'fk-ice';
  /** Crowd material: vertex colours, instanceColor applied only where tintMask = 1. */
  const crowd = matte({ vertexColors: true, flatShading: true, roughness: 0.85 });
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
  /** Additive sky curtain (RGBA vertex colours carry the alpha falloff). */
  const aurora = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
  aurora.name = 'fk-aurora';
  /** Glossy lake-ice floor (vertex coloured, smooth). */
  const iceFloor = RENDER_FLAGS.standardMaterials
    ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.08, flatShading: false })
    : new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(0x0e2a38), emissiveIntensity: 0.6 });
  iceFloor.name = 'fk-ice-floor';
  return { std, glow, ember, ice, crowd, aurora, iceFloor };
}

export function mats() {
  if (!_mats) _mats = make();
  return _mats;
}
