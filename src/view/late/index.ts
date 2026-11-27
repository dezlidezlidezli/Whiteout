// Late-game presentation (Areas 3–5, the Beacon, the finale, Open Season). Self-contained: main.ts
// creates it once and forwards events/frames; it reaches the view's parts through LateCtx and
// draws its own HUD pieces (orders, Journal, credits) into the HUD root.
//
//   const late = createLatePresentation({ getView, getSim, hudRoot, tap });
//   late.handleEvents(events)   // after view.handleEvents
//   late.frame(alpha, dt)       // before view.frame
//
// Work that must happen after the view has placed its camera and set its audio for the frame
// (camera cinematics, music/ambience overrides) runs from scene.onBeforeRender.

import '../../ui/late/late.css';
import type { Sim, SimEvent } from '../../sim';
import { Credits } from '../../ui/late/credits';
import { Journal } from '../../ui/late/journal';
import { OrdersTracker } from '../../ui/late/orders';
import type { View } from '../view';
import { BeaconView } from './beacon';
import { installLateCheats } from './cheats';
import { Couriers } from './couriers';
import { Crank } from './crank';
import { Flame } from './flame';
import type { LateCtx, LatePart } from './ctx';
import { FinaleDirector } from './finale';
import { patchGround } from './groundfx';
import { Market } from './market';
import { Mood } from './mood';
import { Tools } from './tools';

export interface LateOptions {
  getView(): View;
  getSim(): Sim;
  /** The HUD root (`.fk-ui`). */
  hudRoot: HTMLElement;
  /** UI tap sound. */
  tap(): void;
}

export interface LatePresentation {
  handleEvents(events: SimEvent[]): void;
  frame(alpha: number, dt: number): void;
  dispose(): void;
}

export function createLatePresentation(o: LateOptions): LatePresentation {
  const ctx: LateCtx = { view: o.getView(), sim: o.getSim(), time: 0 };
  const orders = new OrdersTracker(o.hudRoot);
  const journal = new Journal(o.hudRoot, () => ctx.sim, o.tap);
  const credits = new Credits(o.hudRoot, o.tap);
  let parts: LatePart[] = [];
  let director: FinaleDirector;
  let prevBefore: typeof ctx.view.scene.onBeforeRender | null = null;

  const build = () => {
    const ground = patchGround(ctx.view);
    director = new FinaleDirector(ctx, { credits, hudRoot: o.hudRoot, ground });
    const beacon = new BeaconView(ctx);
    director.setBeacon(beacon);
    parts = [beacon, new Couriers(ctx), new Tools(ctx), new Market(ctx), new Crank(ctx), new Mood(ctx, director), new Flame(ctx, ground, o.hudRoot), director];
    const scene = ctx.view.scene;
    prevBefore = scene.onBeforeRender;
    scene.onBeforeRender = function (...args) {
      prevBefore?.apply(this, args);
      for (const p of parts) p.post?.();
    };
  };
  const teardown = () => {
    for (const p of parts) p.dispose?.();
    parts = [];
    if (prevBefore) ctx.view.scene.onBeforeRender = prevBefore;
  };
  build();
  installLateCheats(() => ctx);

  return {
    handleEvents(events) {
      for (const e of events) {
        for (const p of parts) p.handle?.(e);
        if (e.type === 'orderProgress' || e.type === 'orderComplete' || e.type === 'seasonUp') orders.handle(e, ctx.sim);
      }
    },
    frame(_alpha, dt) {
      const v = o.getView();
      if (v !== ctx.view) {
        // WebGL context restored: a brand-new view. Rebuild every 3D piece on it.
        teardown();
        ctx.view = v;
        ctx.sim = o.getSim();
        build();
      }
      const sim = o.getSim();
      if (sim !== ctx.sim) {
        ctx.sim = sim;
        orders.reset();
        credits.dispose();
        for (const p of parts) p.reset?.();
      }
      ctx.time += dt;
      for (const p of parts) p.frame?.(dt);
      orders.update(sim, dt, v.title || director.cinematic);
      journal.update(sim);
    },
    dispose() {
      teardown();
      credits.dispose();
      orders.el.remove();
    },
  };
}
