// Inline SVG icons for the late-game UI (orders, journal, credits). No external assets.

const S = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const INK = 'stroke="#3a2414" stroke-width="1.2" stroke-linejoin="round"';

export const ITEM_ICONS: Record<string, string> = {
  fish: S(`<path d="M3.5 12c3-4.6 9.4-5.4 13.6-1.6L21 7.6v8.8l-3.9-2.8C12.9 17.4 6.5 16.6 3.5 12z" fill="#8cc0e0" ${INK}/><circle cx="7.4" cy="11.2" r="1.1" fill="#24324f"/><path d="M11 9.6c.8 1.4.8 3.4 0 4.8" fill="none" stroke="#5a8ab0" stroke-width="1.2" stroke-linecap="round"/>`),
  smokedFish: S(`<path d="M3.5 12c3-4.6 9.4-5.4 13.6-1.6L21 7.6v8.8l-3.9-2.8C12.9 17.4 6.5 16.6 3.5 12z" fill="#c87a40" ${INK}/><circle cx="7.4" cy="11.2" r="1.1" fill="#3a2414"/><path d="M10 9.2l1.6 5.6M13 9.2l1.6 5.6" stroke="#8a4a20" stroke-width="1.3" stroke-linecap="round"/><path d="M15 5c-1-1.4 1-2 0-3.4M18 5.4c-1-1.4 1-2 0-3.4" fill="none" stroke="#e9eef8" stroke-width="1.2" stroke-linecap="round"/>`),
  stew: S(`<path d="M3.5 11h17c0 5-3.6 8.6-8.5 8.6S3.5 16 3.5 11z" fill="#d8743a" ${INK}/><ellipse cx="12" cy="11" rx="8.5" ry="2.2" fill="#f2a15a" ${INK}/><circle cx="9.5" cy="10.8" r="1" fill="#ffe08a"/><circle cx="13.6" cy="11.3" r="1" fill="#9fd36a"/><path d="M9 7c-1-1.6 1-2.2 0-3.8M14 7c-1-1.6 1-2.2 0-3.8" fill="none" stroke="#e9eef8" stroke-width="1.3" stroke-linecap="round"/>`),
  log: S(`<rect x="2.5" y="8" width="16" height="8" rx="4" fill="#a8703c" ${INK}/><ellipse cx="18.6" cy="12" rx="2.6" ry="4" fill="#e7c08a" ${INK}/><circle cx="18.6" cy="12" r="1.2" fill="none" stroke="#a8703c" stroke-width="1"/>`),
  plank: S(`<rect x="2.5" y="6" width="19" height="5" rx="1.2" fill="#e0b070" ${INK}/><rect x="2.5" y="13" width="19" height="5" rx="1.2" fill="#d09a58" ${INK}/><path d="M6 8.5h4M13 15.5h5" stroke="#a87040" stroke-width="1" stroke-linecap="round"/>`),
  ore: S(`<path d="M4 15l3-7 6-2.5 6 4 1 6-5 3.5H8z" fill="#8a8f99" ${INK}/><path d="M9 10l2 2-1.5 2.5M14.5 9.5l1 3" stroke="#c46a3a" stroke-width="1.6" stroke-linecap="round"/><circle cx="15" cy="15" r="1.2" fill="#e08a50"/>`),
  ingot: S(`<path d="M3 16.5l3.5-7h11l3.5 7z" fill="#d0d6de" ${INK}/><path d="M6.5 9.5l1.4-3h8.2l1.4 3z" fill="#eef2f6" ${INK}/><path d="M8 13h5" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>`),
  feast: S(`<ellipse cx="12" cy="16" rx="9.5" ry="3.4" fill="#e9e2d2" ${INK}/><path d="M5 15c0-4.6 3.2-8 7-8s7 3.4 7 8z" fill="#f2c24e" ${INK}/><path d="M12 7V4.6" stroke="#3a2414" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="4" r="1.2" fill="#c87a40" ${INK}/><path d="M8 11.5c1-1.2 2.4-1.8 4-1.8" fill="none" stroke="#fff3c0" stroke-width="1.3" stroke-linecap="round"/>`),
};

export const ICON_BOOK = S(`<path d="M4 4.5c2.6-.8 5.4-.6 8 1.2v14c-2.6-1.8-5.4-2-8-1.2z" fill="#ffd9a8" stroke="#24324f" stroke-width="1.2" stroke-linejoin="round"/><path d="M20 4.5c-2.6-.8-5.4-.6-8 1.2v14c2.6-1.8 5.4-2 8-1.2z" fill="#fff3dc" stroke="#24324f" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 8.4c1.4-.3 2.8-.1 4 .6M6.2 11.4c1.4-.3 2.8-.1 4 .6M13.8 9c1.2-.7 2.6-.9 4-.6" stroke="#b07a40" stroke-width="1" stroke-linecap="round"/><path d="M16 3.6v5.2l1.4-1 1.4 1V3.9" fill="#ff7a3a" stroke="#7a2a10" stroke-width=".9" stroke-linejoin="round"/>`);

export const ICON_EMBER_SM = S(`<path d="M12 1.8c3.6 4.2 6.6 7.6 6.6 12a6.6 6.6 0 0 1-13.2 0c0-2.6 1.3-4.6 2.9-6.4.2 1.9 1 3.2 2.3 3.8C10.2 8.2 10.6 5.1 12 1.8z" fill="#ffb347" stroke="#7a2a10" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 11c.9 1.6 2.5 2.7 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.2.6-2 1.4-2.7.1.7.4 1 .8 1.2.2-1 .1-2 .3-3z" fill="#fff0b0"/>`);

export const ICON_TICK = S(`<path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`);

export const ICON_SUN = S(`<circle cx="12" cy="13" r="5" fill="#ffd27a" stroke="#9a4a12" stroke-width="1.2"/><g stroke="#ffb347" stroke-width="1.8" stroke-linecap="round"><path d="M12 3.5v2.2M4.6 6.6l1.6 1.6M19.4 6.6l-1.6 1.6M2.5 13h2.2M19.3 13h2.2"/></g><path d="M2 19h20" stroke="#ffe8c0" stroke-width="1.8" stroke-linecap="round"/>`);

export function itemIcon(item: string): string {
  return ITEM_ICONS[item] ?? ITEM_ICONS.fish;
}

export const ITEM_NAMES: Record<string, [string, string]> = {
  fish: ['fish', 'fish'], smokedFish: ['smoked fish', 'smoked fish'], stew: ['stew', 'stews'], log: ['log', 'logs'],
  plank: ['plank', 'planks'], ore: ['ore', 'ore'], ingot: ['ingot', 'ingots'], feast: ['feast', 'feasts'],
};
export function itemName(item: string, n = 2): string {
  const p = ITEM_NAMES[item] ?? [item, item];
  return n === 1 ? p[0] : p[1];
}

export const ICON_LAMP = S(`<path d="M12 2v3" stroke="#3a2414" stroke-width="1.4" stroke-linecap="round"/><rect x="9" y="4.4" width="6" height="2" rx="1" fill="#6a4a2a"/><ellipse cx="12" cy="12" rx="6" ry="6.6" fill="#ffc46b" stroke="#7a3a10" stroke-width="1.2"/><path d="M8 9.5c2.6 1 5.4 1 8 0M7.6 13c2.8 1.1 6 1.1 8.8 0" fill="none" stroke="#c87a30" stroke-width="1"/><path d="M12 9.6c.9 1.3 1.6 2.1 1.6 3.2a1.6 1.6 0 0 1-3.2 0c0-1.1.7-1.9 1.6-3.2z" fill="#fff4c4"/><rect x="10" y="18.4" width="4" height="2" rx="1" fill="#6a4a2a"/>`);
