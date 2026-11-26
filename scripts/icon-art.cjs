// Frostkettle app icon artwork (original). Shared by make-icons.cjs.
// A round-bellied copper kettle with a warm glow and a curl of steam on a snowy blue night.
'use strict';

// Deterministic snowflake positions so every build produces identical icons.
function flakes() {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let i = 0; i < 26; i++) {
    const x = 60 + rnd() * 904;
    const y = 50 + rnd() * 560;
    // keep the kettle silhouette clean
    if (Math.hypot(x - 470, y - 560) < 300) continue;
    const r = 6 + rnd() * 9;
    out.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" opacity="${(0.45 + rnd() * 0.5).toFixed(2)}"/>`);
  }
  return out.join('');
}

/** Kettle + glow + steam, drawn in a 1024 box. */
function art() {
  return `
  <g id="glow">
    <circle cx="470" cy="600" r="420" fill="url(#fkGlow)"/>
  </g>
  <g id="snow" fill="#eaf4ff">${flakes()}</g>
  <path d="M-400 880 L0 850 C 220 790 380 815 520 830 C 690 848 860 800 1024 780 L1424 740 L1424 1500 L-400 1500 Z" fill="url(#fkSnow)"/>
  <ellipse cx="470" cy="842" rx="250" ry="34" fill="#0b1630" opacity="0.35"/>
  <!-- steam curl -->
  <path d="M808 352 C 870 300 770 262 812 206 C 846 160 912 186 896 236 C 884 272 834 258 846 226" fill="none" stroke="#ffd9a8" stroke-width="64" stroke-linecap="round" stroke-linejoin="round" opacity="0.22"/>
  <path d="M808 352 C 870 300 770 262 812 206 C 846 160 912 186 896 236 C 884 272 834 258 846 226" fill="none" stroke="#ffffff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
  <!-- handle -->
  <path d="M300 470 C 270 150 670 150 640 470" fill="none" stroke="#4a2414" stroke-width="62" stroke-linecap="round"/>
  <path d="M300 470 C 270 150 670 150 640 470" fill="none" stroke="#d27536" stroke-width="32" stroke-linecap="round"/>
  <path d="M330 330 C 380 230 470 220 520 226" fill="none" stroke="#ffd29a" stroke-width="10" stroke-linecap="round" opacity="0.8"/>
  <!-- spout -->
  <path d="M630 560 C 700 540 730 470 760 420 C 770 400 784 388 800 382 L 842 372 C 852 370 858 380 852 390 L 826 424 C 800 470 790 560 742 640 C 716 684 680 700 640 704 Z" fill="url(#fkSpout)" stroke="#5a2a14" stroke-width="12" stroke-linejoin="round"/>
  <!-- belly -->
  <ellipse cx="470" cy="610" rx="262" ry="232" fill="url(#fkCopper)" stroke="#5a2a14" stroke-width="12"/>
  <!-- foot band -->
  <path d="M290 760 C 360 836 580 836 650 760 L 640 790 C 570 858 370 858 300 790 Z" fill="#7a3418" opacity="0.85"/>
  <!-- belly band -->
  <path d="M214 600 C 300 660 640 660 726 600" fill="none" stroke="#ffcf8f" stroke-width="12" stroke-linecap="round" opacity="0.55"/>
  <!-- highlight -->
  <ellipse cx="380" cy="520" rx="78" ry="112" transform="rotate(32 380 520)" fill="#fff3dc" opacity="0.55"/>
  <ellipse cx="344" cy="470" rx="22" ry="30" transform="rotate(32 344 470)" fill="#ffffff" opacity="0.9"/>
  <!-- lid -->
  <ellipse cx="470" cy="398" rx="150" ry="40" fill="#8f3e1c" stroke="#5a2a14" stroke-width="10"/>
  <path d="M352 392 C 370 330 570 330 588 392 Z" fill="url(#fkLid)" stroke="#5a2a14" stroke-width="10" stroke-linejoin="round"/>
  <circle cx="470" cy="330" r="34" fill="#f0a04e" stroke="#5a2a14" stroke-width="10"/>
  <circle cx="460" cy="320" r="10" fill="#fff3dc" opacity="0.85"/>`;
}

function defs() {
  return `
  <defs>
    <radialGradient id="fkSky" cx="0.46" cy="0.55" r="0.75">
      <stop offset="0" stop-color="#2d4f86"/>
      <stop offset="0.55" stop-color="#172848"/>
      <stop offset="1" stop-color="#0b1222"/>
    </radialGradient>
    <radialGradient id="fkGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffb35c" stop-opacity="0.9"/>
      <stop offset="0.45" stop-color="#ff9a3d" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fkSnow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dce9fb"/>
      <stop offset="1" stop-color="#8fa9d4"/>
    </linearGradient>
    <radialGradient id="fkCopper" cx="0.34" cy="0.3" r="0.85">
      <stop offset="0" stop-color="#ffc98a"/>
      <stop offset="0.32" stop-color="#ee8a45"/>
      <stop offset="0.7" stop-color="#b44d22"/>
      <stop offset="1" stop-color="#6e2a14"/>
    </radialGradient>
    <linearGradient id="fkSpout" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e07c3c"/>
      <stop offset="1" stop-color="#8f3a1a"/>
    </linearGradient>
    <linearGradient id="fkLid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3a35a"/>
      <stop offset="1" stop-color="#b6531f"/>
    </linearGradient>
  </defs>`;
}

/**
 * Full icon SVG. `scale` shrinks the artwork around the centre (maskable safe zone);
 * the night sky always fills the whole square (opaque, full bleed).
 */
function iconSvg({ scale = 1, size = 1024 } = {}) {
  const t = (1 - scale) * 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${size}" height="${size}">${defs()}
  <rect width="1024" height="1024" fill="url(#fkSky)"/>
  <g transform="translate(${t} ${t}) scale(${scale})"><g transform="translate(18 0)">${art()}</g></g>
</svg>`;
}

module.exports = { iconSvg, art, defs };
