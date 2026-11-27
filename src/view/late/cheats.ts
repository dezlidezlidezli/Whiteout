// Late-game debug cheats under window.__fk.cheat (browser tests / screenshots). Everything goes
// through the sim's public API; positions come from the data so layout changes never break them.

import { startFinale } from '../../sim/finale';
import type { LateCtx } from './ctx';

type Cheats = Record<string, (...a: never[]) => unknown>;

export function installLateCheats(get: () => LateCtx): void {
  const install = (): boolean => {
    const fk = (window as unknown as { __fk?: { cheat: Cheats } }).__fk;
    if (!fk) return false;
    const c = fk.cheat as unknown as Record<string, unknown>;
    if (c.lateArea) return true;

    const sim = () => get().sim;
    const snap = () => {
      const { view } = get();
      view.setSim(sim());
    };
    const tp = (x: number, z: number) => {
      const p = sim().state.player;
      p.x = p.px = x;
      p.z = p.pz = z;
      p.vx = p.vz = 0;
    };
    /** Complete campaign pads in data order up to and including `last`. */
    const upTo = (last: string) => {
      const s = sim();
      for (const p of s.data.pads) {
        if (p.group) continue;
        s.completePad(p.id);
        if (p.id === last) break;
      }
    };
    const hearthPad = (level: number) => sim().data.pads.find((p) => p.effects.some((e) => e.type === 'hearth' && e.level === level))?.id;
    const beaconPad = (stage: number) => sim().data.pads.find((p) => p.effects.some((e) => e.type === 'beacon' && e.stage === stage))?.id;
    const area = (id: string) => sim().data.areas.find((a) => a.id === id);
    /** With the carried flame on, the finished Beacon waits for it: light the trail and the crown. */
    const lightBeacon = () => {
      const s = sim();
      if (!s.data.mechanics.flame || s.state.beacon < 4 || s.state.finale.phase !== 'none') return;
      const f = (s.state as unknown as { flame: { lit: Record<string, true>; beaconLit: boolean; held: boolean } }).flame;
      for (const b of s.data.mech.braziers) if (b.kind === 'trail') f.lit[b.id] = true;
      f.beaconLit = true;
      f.held = false;
      startFinale(s);
    };

    Object.assign(c, {
      /** Jump to an area: its Hearth pad done (full = also every pad before the next Hearth level), teleport to its focus. */
      lateArea: (id: string, full = true, settle = 20) => {
        const a = area(id);
        if (!a) return false;
        const next = full ? hearthPad(a.hearth + 1) : undefined;
        const s = sim();
        if (next) {
          const i = s.data.pads.findIndex((p) => p.id === next);
          const before = s.data.pads.slice(0, i).filter((p) => !p.group).pop();
          if (before) upTo(before.id);
        } else if (full) {
          const b3 = beaconPad(3);
          if (b3) upTo(b3);
        } else {
          const hp = hearthPad(a.hearth);
          if (hp) upTo(hp);
        }
        s.state.embers += 3000;
        tp(a.focus.x, a.focus.z);
        s.drainEvents();
        s.advance(settle);
        s.drainEvents();
        tp(a.focus.x, a.focus.z);
        snap();
        return true;
      },
      /** Complete every pad up to Beacon stage n (stage 4 starts the finale). */
      lateBeacon: (n: number) => {
        const id = beaconPad(n);
        if (id) upTo(id);
        return sim().state.beacon;
      },
      /** Stand by the Beacon with stages 1..3 done (ready for the last one). */
      lateReady: () => {
        const b3 = beaconPad(3);
        if (b3) upTo(b3);
        const s = sim();
        const bz = s.data.decor.find((d) => d.model === 'beacon');
        const pad = s.padDefs.get(beaconPad(4) ?? '');
        if (pad) tp(pad.x, pad.z + 2.5);
        else if (bz) tp(bz.x, bz.z + 5);
        snap();
      },
      /** Start the finale now (completes the Beacon). */
      lateFinale: () => {
        const b4 = beaconPad(4);
        if (b4) upTo(b4);
        lightBeacon();
        return sim().state.finale.phase;
      },
      /** Skip straight into Open Season (finale done). */
      lateOpenSeason: (showCredits = false) => {
        const s = sim();
        const b4 = beaconPad(4);
        if (b4) upTo(b4);
        lightBeacon();
        const f = s.data.finale;
        s.advance(f.lightingTime + f.dawnTime + 0.2);
        s.drainEvents();
        if (!showCredits) {
          try {
            localStorage.setItem(`fk-credits-seen-${s.state.seed}`, '1');
          } catch {
            /* ignore */
          }
        }
        snap();
        return s.state.finale.phase;
      },
      /** Teleport + snap the camera. */
      lateGo: (x: number, z: number) => {
        tp(x, z);
        snap();
      },
      /** Advance the sim headlessly n seconds (no autopilot), then snap. */
      lateAdvance: (n: number) => {
        sim().advance(n);
        sim().drainEvents();
        snap();
      },
    });
    return true;
  };
  if (!install()) {
    const iv = window.setInterval(() => {
      if (install()) window.clearInterval(iv);
    }, 200);
  }
}
