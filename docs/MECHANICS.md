# Frostkettle — signature mechanics (owner-approved additions)

Five hands-on mechanics, one or two per area, layered on top of `docs/DESIGN.md`. They obey the
same laws: one thumb, no buttons, everything by proximity and movement, no fail states, nothing is
ever lost, no wait-timers. Each must be fun in itself for the thumb, not a chore with a new skin.
Each is introduced by one short quest, has a clear automation/upgrade path so it never becomes a
grind, and has a place in the endless mode.

Shared vocabulary for sim, view, art and audio. Names in `code` are the intended identifiers.

---

## 1. Snow plough — Pinewood onward (`plough`)

**Fantasy.** Deep drifts choke the valley. Push a plough through them and carve the world open.

- **Deep snow** covers defined zones (`deepSnow` zones: rectangles/polygons in data): the roads
  between areas, and optional side lots in every area. Stored as a coarse grid of cells (0.5 m),
  each cleared or not, persisted compactly (bitset per zone).
- Without the plough the player wades at 45 % speed and helpers cannot path through deep snow.
- A pad in Pinewood (planks + embers) grants the **plough**. From then on, entering deep snow
  automatically deploys it: the player pushes at 80 % speed and permanently clears a swath about
  1.6 m wide. Upgrades (ingots, later): wider blade (2.4 m), full speed.
- **Finds.** Buried under the snow, revealed when their cell is cleared: ember caches, crates of
  items, lost villagers (see §2), short-cut paths, and one landmark per area. Finds are placed in
  data, deterministic.
- **Completion.** Each zone shows a percentage; clearing 100 % pays a reward and turns the lot into
  usable ground (decoration plots, extra queue space, a helper short-cut).
- **Feel.** The joy of mowing: a clean edge, snow curling off the blade into banks at the sides,
  a rising pitch while pushing continuously, a soft thump when something is uncovered.
- Events: `ploughStart`, `ploughStop`, `snowCleared {zone, cells}`, `findRevealed {kind}`,
  `zoneCleared {zone}`.

## 2. Rescue walks — every area from Pinewood (`rescue`)

**Fantasy.** Not everyone made it to the counter. Take a lantern out into the white and bring
them home.

- **Lost villagers** lie buried at fixed spots in the storm fringe beyond the warm radius and under
  deep snow (24 in the whole valley, a collectible set; a few are revealed only by ploughing).
- A camp pad grants the **rescue lantern**. Its glow (radius 6 m, upgradable to 9 m) is the leash.
- Standing next to a buried villager digs them out (about 1.5 s, automatic). They become a
  **follower**: they trail the player in a conga line (up to 3, upgradable to 6), stumbling along at
  the player's pace. A follower left outside the glow simply stops and waits where they are, safe,
  until the player comes back. Nothing can go wrong.
- Lead followers into any warm radius (the camp, a lit brazier) and they **thaw with the full
  effect**, join the population, and pay a large ember bonus. Each lost villager is a named
  character with one line of flavour, listed on a "Found" page (x / 24). Finding all in an area
  pays a bonus; finding all 24 unlocks a camp monument.
- **Whiteout fringe.** Beyond the warm radius visibility closes in (heavy fog, wind); the lantern
  opens a pocket of clarity. Purely atmosphere and navigation, never damage.
- Events: `lanternOn/Off`, `digStart`, `rescued {id}`, `followerWait {id}`, `followerHome {id}`,
  `areaAllFound {area}`, `allFound`.

## 3. Ice skating — Frozen Lake (`skate`)

**Fantasy.** The lake is a rink. Glide.

- On **ice surfaces** (zones in data) the player's movement has momentum: lower acceleration and
  friction, top speed 1.5× normal, turns carve. Tuned to feel graceful, not slippery-frustrating:
  releasing the stick glides to a stop in about 1.5 s; pushing against the glide brakes quickly.
- Stations on the lake stand on **grip mats** (boardwalk/snow patches) where movement is normal, so
  precise standing is never fought by the ice. Walls bounce gently.
- **Fish leaps.** Small splashes telegraph a fish about to jump along the ice ahead of the player's
  path; skating through one at speed scoops it straight onto the stack (a bonus fish source that
  rewards flowing lines). A streak of consecutive leaps raises a combo with rising pitch.
- Carrying a tall stack while skating makes the stack lean dramatically into turns (pure show).
- Upgrade: sharpened skates (ingots) — tighter turns, higher top speed. Helpers and couriers use the
  ice normally (the sled dog is faster on it).
- Events: `skateStart`, `skateStop`, `fishLeapSpawn`, `fishLeapCatch {combo}`, `skateBounce`.

## 4. Crank by circling — Ironridge (`crank`)

**Fantasy.** Put your back into it: walk the capstan round.

- A **Crank** station has a ring around it (inner 1.2 m, outer 2.8 m). While the player moves inside
  the ring, their change of angle around the centre accumulates as turns (either direction; reversing
  is allowed but wastes a little). A push-bar visibly swings round with the player.
- Two uses:
  - **Forge bellows.** Turns build **blast** (0–100 %), which decays over about 25 s. The forge
    always works at 1× on its own; with blast it runs up to 3×. A booster, never a requirement.
  - **Mine lift.** Every 2 full turns hauls a cage of 6 ore up the shaft into the pit-head pile —
    a much faster ore source than chipping veins.
- Automation: hire a villager (later, a reindeer) who walks the capstan for you at a steady pace.
- Feel: ratchet clicks per notch, rope creak, the cage rising in view as you circle, bellows
  breathing and the forge fire brightening with blast.
- Events: `crankNotch {id}`, `crankTurn {id}`, `blast {level}`, `liftArrive {n}`.

## 5. Carry the flame — Beacon Peak and the finale (`flame`)

**Fantasy.** The Great Beacon cannot be lit with a spark. Its fire must be carried from the Hearth,
up the mountain, through the wind.

- At the Hearth (or any lit brazier) the player takes up a **flame** (held aloft, separate from the
  carry stack — both hands are needed, so the stack must be empty to take it, and taking items while
  holding it is disabled). `flame` is 0–1.
- In the cold it gutters: it shrinks over about 20 s of walking outside warmth (faster in marked
  wind gaps), not at all inside a warm radius. Reaching any **lit brazier** restores it to full.
- Arriving at an **unlit brazier** with a living flame lights it: a permanent pocket of warmth
  (snow melts in a ring, the next stretch of the trail is revealed) and a new place to take or
  restore the flame. The **Trail of Light** up Beacon Peak is a chain of 7 braziers spaced so each
  leg is comfortably makeable, with two optional risky short-cuts through wind gaps.
- If the flame goes out, nothing is lost: walk back to the last lit brazier (always near) and try
  again. The quest arrow always points to the nearest lit brazier when the flame is low or out.
- **Finale.** When the Beacon's four build stages are complete it stands dark. The final act is to
  carry the flame from the last brazier to the Beacon's crown. Lighting it triggers the existing
  finale sequence (storm breaks, dawn, the Long Night ends).
- Elsewhere: one optional unlit brazier in each earlier area; lighting it gives that yard a small
  permanent Cosy bonus. In endless mode, the **Lantern Festival** order type asks the player to
  light a chain of festival lamps around the camp with a carried flame.
- Events: `flameTaken`, `flameLevel {v}` (throttled), `flameOut`, `brazierLit {id}`,
  `trailComplete`, `beaconLit`.

---

## Integration rules

- Each mechanic is a small, data-driven sim module (`src/sim/plough.ts`, `rescue.ts`, `skate.ts`,
  `crank.ts`, `flame.ts`) with state under one key, serialised, migrated from older saves, covered by
  unit tests, and exercised by the headless bot (the bot must plough, rescue, skate, crank and carry
  the flame to finish the campaign).
- The quest chain introduces each with one quest and one line of text. Guidance arrows must always
  have a correct target for every state of every mechanic.
- None of them may create a soft-lock: every state has a useful action available.
- Balance: they add delight and options, not length for its own sake. Campaign target stays about
  2–3 hours for a person.
