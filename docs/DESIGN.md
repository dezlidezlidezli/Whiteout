# Frostkettle — design & architecture contract

Frostkettle is an **original** cosy arcade/camp game for iPhone (installable web app). It belongs to the
"stack-carry-serve" arcade-idle genre with a frozen-survival theme. It must not reuse the name,
characters, art, UI or audio of any existing game. No ads, no purchases, no energy, no wait-timers,
no accounts, no network calls. Everything is earned by playing.

## 1. Fantasy

The Long Night froze the valley. You are the **Kettlekeeper**, keeper of the last warm kettle.
Out of the storm shuffle the **Icebound** — villagers frozen pale blue. Feed them hot stew and they
**thaw**: colour floods back, they cheer, drop glowing **embers** (the currency) and walk to your
**camp** to live by the **Hearth**. Feed the Hearth and its warmth melts the frost walls, opening new
land. Rebuild the valley and relight the **Great Beacon** to end the Long Night.

Tone: warm lights against cold blue dusk, chunky low-poly toys, generous juice, zero pressure.
There is no fail state, no death, nothing is ever lost.

## 2. Controls

- Portrait, one thumb. Touch anywhere and drag = floating virtual joystick. Release = stop.
- Everything else is **automatic by proximity**: picking up, dropping, cooking, serving, chopping,
  paying pads. No action buttons in the world.
- HUD: embers, population, current quest chip, settings gear. Keyboard WASD/arrows for desktop testing.

## 3. Core rules

**Carry stack.** The player carries a LIFO stack of mixed items on their back/arms, capacity `N`
(starts 6, upgradable to ~40). Stations take the top-most matching item. Items hop in arcs between
player and stations at a fixed cadence (≈8–12 items/s, upgradable) — this cadence is the "feel".

**Embers** are not carried. They pile up physically where earned and fly into the wallet when the
player walks near.

**Station primitives** (all content is built from these; data-driven):

| Primitive | Behaviour |
|---|---|
| `Pile` | Holds items of one kind for pickup. May refill at a rate up to a cap (e.g. fish crate). |
| `Node` | Harvest node (tree, ice hole, ore vein). Stand adjacent → auto-work; each completed hit yields items straight to the stack (or onto the ground pile if full). Trees fall and regrow. |
| `Processor` | Input buffer(s) → recipe → output buffer. E.g. Kettle: 1 fish → 1 stew. Works whenever it has inputs and output space. May need an operator slot (cook) or be automatic. |
| `Counter` | Holds a dish. Icebound queue in front; serves one per `serveTime` while stock lasts. Each served customer thaws, spawns embers, and walks to camp (population +1). |
| `Deposit` | Accepts specific items toward a goal (Hearth fuel, building materials, Beacon stages). |
| `Pad` | Ember payment pad on the ground showing icon + remaining cost. Stand on it to pay (rate accelerates the longer you stand). On completion: unlock/upgrade/hire/open. Pads have `requires` so they appear in a guided chain. Some pads also need materials (shown as a second counter) — delivered from the stack. |
| `Helper` | Hired villager NPC with a role: haul A→B, harvest a node type, or operate a processor. Has capacity + speed (upgradable). |
| `Link` | Conveyor: moves items between two buffers at a rate, no walking. |

**Hearth & warmth.** The Hearth sits at the camp centre. Hearth level (1–5) is raised by a pad
(embers + materials). Each level expands the **warm radius**: snow visibly melts into ground within
it and the next **frost wall** shatters, opening the next area. From Pinewood on, the Hearth also
burns **logs** as fuel: while fuelled, the camp is "Cosy" → customers pay double and helpers move
faster. Running out of fuel only removes the bonus.

**Camp.** Thawed villagers become population. They wander, sit by the fire, wave. Population
milestones auto-raise tents then cabins around the Hearth and gate helper hires ("needs 12
villagers"). The camp is the visible scoreboard of the player's kindness.

**Quests.** A linear chain of small goals ("Serve 5 bowls", "Build a second kettle", "Raise the
Hearth") gives direction. A ground arrow at the player's feet points to the current quest target.
Quests reward embers. The first few double as the tutorial — no text walls, no modal popups.

## 4. Campaign

One continuous world, camp at the origin, areas around it behind frost walls.
Target length: about 2–3 hours to the finale, then endless mode.

1. **Kettle Yard** (start, next to camp). Fish crate → Kettle → Counter → Icebound queue.
   Pads: bigger pack, second kettle, porter helper (crate→kettle), conveyor (kettle→counter),
   second counter, Hearth L2.
2. **Pinewood** (Hearth L2). Chop pines → logs. Fuel the Hearth (Cosy bonus). Sawmill: log → 2 planks.
   Planks are needed by building pads. Lumberjack helper. Cabins. Hearth L3 (embers + planks).
3. **Frozen Lake** (Hearth L3). Ice holes → fish in bulk. Smokehouse: fish + log → smoked fish.
   Lakeside counter where Icebound want smoked fish (pays more). Fisher helper. Sled-dog courier
   (fast long-range hauler). Hearth L4 (embers + planks + smoked fish feast for the camp).
4. **Ironridge** (Hearth L4). Ore veins → ore. Forge: ore + log → ingot. Ingots buy tool upgrades
   (axe, pick, steel kettle = faster cooking) and beacon parts. Miner helper.
   Great Kitchen: stew + smoked fish → feast, served at a third counter (pays most). Hearth L5.
5. **Beacon Peak** (Hearth L5). The Great Beacon is a 4-stage Deposit (planks, ingots, logs, embers).
   Each stage visibly raises the tower. Lighting it is the **finale**: the storm tears open, dawn
   light sweeps the valley, all snow melts, every villager cheers, credits roll.

**Endless mode ("Open Season")** after the finale: caravans post random delivery orders on the
notice board (deliver X of item Y for a big ember reward); infinite, gently scaling stat upgrades;
cosmetic camp decorations as ember sinks; a stats page. Never any timers.

## 5. Feel & presentation (the difference between "works" and "loved")

- Items fly in arcs with a pop of scale; the stack sways with spring lag behind the player and
  leans when turning; pickup pitch rises with stack height.
- Thaw moment: icy shell cracks off in shards, colour floods in, a little hop, "+embers" burst.
- Pads fill like a liquid gauge and "ka-chunk" when complete; the new building scales in with
  overshoot and a puff of snow.
- Hearth level-up: a warm shockwave ring rolls outward, snow melts behind it, the frost wall shatters.
- Camera: fixed-angle perspective follow (≈50° pitch), gentle look-ahead, pulls back for tall
  stacks, short cinematic pan to newly opened areas (skippable by touching).
- Snowfall, breath puffs, footprints, warm point lights flickering on snow, aurora in the sky.
- 60 fps on recent iPhones. Use InstancedMesh for items and crowds. Cap devicePixelRatio at 2.
  Budget: < 150 draw calls, < 300k triangles in view. Provide an auto quality fallback.

## 6. Architecture

```
index.html            canvas#game + div#ui   (owned by the PWA agent after scaffold)
src/main.ts           boot
src/sim/              PURE TypeScript game logic. No three.js, no DOM, no Date.now/Math.random
                      (seeded RNG in state). Deterministic `sim.step(dt)`. All state serialisable.
src/data/             Declarative content: items, recipes, areas/layout, pads, quests, balance.
src/view/             Three.js rendering. Reads sim state every frame, drains sim events for
                      effects. Never mutates the sim except through its input API.
src/view/models/      Procedural model factories (fixed contract in index.ts).
src/audio/            Procedural WebAudio sfx/music (fixed contract in index.ts).
src/ui/               DOM HUD and menus layered over the canvas (own CSS).
src/platform/         Save storage, visibility/pause, PWA registration, device quality detection.
tests/                vitest: sim unit tests + headless bot that plays the campaign.
```

Rules:

- **Sim/view separation is mandatory.** `src/sim` and `src/data` must run under Node in vitest.
  A headless **bot** (`tests/bot.ts`) plays using only the public sim API and must be able to finish
  the campaign; it reports time-to-milestone so balance can be tuned without a browser.
- The sim exposes: `setMove(x, z)` (joystick vector), `step(dt)`, `state`, a drained `events`
  queue (pickup, drop, craft, serve, thaw, emberSpawn, emberCollect, padProgress, padComplete,
  unlock, hearthUp, questComplete, nodeHit, nodeDeplete, …), `serialize()` / `load()`.
- Fixed sim timestep (1/60 s) with accumulator; the view interpolates.
- World units are metres; ground is the XZ plane; +Y up. Player speed ≈ 5 m/s.
- Save: versioned JSON in `localStorage`, autosave every ~10 s and on `visibilitychange`/`pagehide`.
  Migrations keyed by version. Export/import as a text code in Settings. Never lose a save.
- Debug hook: `window.__fk = { sim, view, cheat }` (give embers, complete pad, teleport, set time
  scale) for automated browser tests. Also supports `?seed=`, `?timescale=`, `?autoplay=1`.
- No runtime network access. No external assets or fonts: everything procedural or bundled.

## 7. iPhone / PWA requirements

- Installable from Safari "Add to Home Screen": manifest + apple meta tags, standalone display,
  portrait, themed status bar, icons (incl. 180×180 apple-touch-icon), offline via service worker.
- Respect safe areas (`env(safe-area-inset-*)`), `100dvh`, no scroll/zoom/selection/callouts,
  no double-tap zoom, no pull-to-refresh.
- Audio unlocks on first touch; pause sim + audio when hidden; survive WebGL context loss.
- Works at any base path (relative URLs only) for GitHub Pages project sites.
