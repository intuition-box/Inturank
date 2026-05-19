/**
 * Arena-only procedural audio — casino-floor / game-show energy.
 * Respects browser autoplay: call `resumeArenaAudio()` from pointer/click handlers
 * before relying on queued sounds.
 */

import { tryPlayArenaAmbientFromUserGesture } from './arenaAmbientMusic';
import { pulseArenaTapOptic } from './arenaTapOptic';

const ARENA_SOUND_PREF = 'inturank_arena_sound';

export function getArenaSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(ARENA_SOUND_PREF);
    return v !== 'false';
  } catch {
    return true;
  }
}

export function setArenaSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ARENA_SOUND_PREF, String(enabled));
  } catch {
    /* ignore */
  }
}

let ctxRef: AudioContext | null = null;
let arenaMaster: GainNode | null = null;

function arenaCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctxRef) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef = new Ctor();
      arenaMaster = ctxRef.createGain();
      arenaMaster.gain.value = 0.22;
      arenaMaster.connect(ctxRef.destination);
    }
    return ctxRef;
  } catch {
    return null;
  }
}

/** Wake procedural Web Audio; BGM primer is gated inside `arenaAmbientMusic` (Climb shell only). */
export function resumeArenaAudio(): void {
  if (getArenaSoundEnabled()) {
    const ctx = arenaCtx();
    if (ctx?.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }
  tryPlayArenaAmbientFromUserGesture();
}

/**
 * Web Audio `resume()` is promise-based — a sync `state` check right after calling
 * `resume()` still sees `suspended`, so the first taps were silent. Run the graph
 * only once the context is actually running.
 */
function runArenaAudio(fn: (master: GainNode, ctx: AudioContext) => void): void {
  if (!getArenaSoundEnabled()) return;
  const ctx = arenaCtx();
  if (!arenaMaster || !ctx) return;
  const exec = () => {
    if (!getArenaSoundEnabled()) return;
    if (ctx.state !== 'running') return;
    const m = arenaMaster;
    if (!m) return;
    fn(m, ctx);
  };
  if (ctx.state === 'running') exec();
  else void ctx.resume().then(exec).catch(() => {});
}

type FloorProfile = 'full' | 'ui';

/** “Floor rush” synthesis — contest entry uses full stack; UI taps use trimmed `ui` profile + lower bus gain. */
function scheduleFloorEnter(target: GainNode, ctx: AudioContext, t: number, profile: FloorProfile): void {
  const ui = profile === 'ui';

  const nDur = ctx.sampleRate * (ui ? 0.21 : 0.35);
  const buf = ctx.createBuffer(1, nDur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < nDur; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / nDur);

  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.Q.value = 3;
  nf.frequency.setValueAtTime(600, t);
  nf.frequency.exponentialRampToValueAtTime(4800, t + (ui ? 0.2 : 0.38));

  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(ui ? 0.068 : 0.065, t + 0.04);
  ng.gain.exponentialRampToValueAtTime(0.001, t + (ui ? 0.24 : 0.42));
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(target);
  noise.start(t);
  noise.stop(t + (ui ? 0.26 : 0.45));

  const midi = ui ? [64, 67, 71, 76] : [64, 67, 71, 76, 79, 83, 88];
  const noteStep = ui ? 0.041 : 0.055;
  const noteStartOffset = ui ? 0.012 : 0.02;

  midi.forEach((note, i) => {
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    const start = t + i * noteStep + noteStartOffset;
    osc.frequency.setValueAtTime(freq * 0.97, start);
    osc.frequency.exponentialRampToValueAtTime(freq, start + 0.035);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(ui ? 0.108 : 0.1, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, start + (ui ? 0.15 : 0.2));
    osc.connect(g);
    g.connect(target);
    osc.start(start);
    osc.stop(start + (ui ? 0.16 : 0.22));
  });

  const low = ctx.createOscillator();
  const lg = ctx.createGain();
  low.type = 'sine';
  low.frequency.setValueAtTime(110, t + 0.05);
  low.frequency.exponentialRampToValueAtTime(55, t + (ui ? 0.2 : 0.35));
  lg.gain.setValueAtTime(0, t + 0.05);
  lg.gain.linearRampToValueAtTime(ui ? 0.076 : 0.12, t + 0.08);
  lg.gain.exponentialRampToValueAtTime(0.001, t + (ui ? 0.28 : 0.45));
  low.connect(lg);
  lg.connect(target);
  low.start(t + 0.05);
  low.stop(t + (ui ? 0.31 : 0.5));

  if (!ui) {
    const chordFreqs = [261.63, 329.63, 392.0];
    chordFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 900 + i * 100;
      osc.type = 'sawtooth';
      const st = t + 0.32 + i * 0.012;
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.045, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.55);
      osc.connect(filt);
      filt.connect(g);
      g.connect(target);
      osc.start(st);
      osc.stop(st + 0.6);
    });
  }

  const bell = ctx.createOscillator();
  const bg = ctx.createGain();
  bell.type = 'sine';
  const bt = t + (ui ? 0.15 : 0.48);
  bell.frequency.setValueAtTime(ui ? 2210 : 2349, bt);
  bell.frequency.exponentialRampToValueAtTime(1400, bt + (ui ? 0.05 : 0.08));
  bg.gain.setValueAtTime(0, bt);
  bg.gain.linearRampToValueAtTime(ui ? 0.088 : 0.09, bt + 0.018);
  bg.gain.exponentialRampToValueAtTime(0.001, bt + (ui ? 0.2 : 0.35));
  bell.connect(bg);
  bg.connect(target);
  bell.start(bt);
  bell.stop(bt + (ui ? 0.22 : 0.4));
}

/** “Floor rush” — full bright stack when starting a contest run from the hub / PLAY. */
export function playArenaFloorEnter(): void {
  runArenaAudio((master, ctx) => {
    scheduleFloorEnter(master, ctx, ctx.currentTime, 'full');
  });
}

/** UI tap — shortened floor-enter sting (+ screen tap optic). Quieter than full `playArenaFloorEnter`. */
export function playArenaUiClick(): void {
  pulseArenaTapOptic();
  runArenaAudio((master, ctx) => {
    const t = ctx.currentTime;
    const bus = ctx.createGain();
    /** UI tap bus — keep `full` floor sting via direct `master` only. */
    bus.gain.value = 0.82;
    bus.connect(master);
    scheduleFloorEnter(bus, ctx, t, 'ui');
  });
}

/** Nav / card hover shimmer — quieter than clicks. */
export function playArenaUiHover(): void {
  runArenaAudio((master, ctx) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(3200, t);
  osc.frequency.exponentialRampToValueAtTime(4200, t + 0.05);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.028, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + 0.08);
  });
}

/** Agree / right swipe — short “winner lane” ding. */
export function playArenaSwipeAgree(): void {
  runArenaAudio((master, ctx) => {
  const t = ctx.currentTime;
  const cents = [0, 4, 7].map((s) => 523.25 * Math.pow(2, s / 12));
  cents.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    const start = t + i * 0.018;
    osc.frequency.setValueAtTime(freq * 1.002, start);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.065, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + 0.25);
  });
  });
}

/** Pass / left — mute fold. */
export function playArenaSwipePass(): void {
  runArenaAudio((master, ctx) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.08, t + 0.018);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + 0.22);
  });
}

/** Rank list row slide. */
export function playArenaRankSlide(): void {
  runArenaAudio((master, ctx) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 9;
  f.frequency.setValueAtTime(640, t);
  osc.type = 'square';
  osc.frequency.setValueAtTime(208, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.08, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
  osc.connect(f);
  f.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + 0.09);
  });
}

/** Streak / stance win — fuller than swipe agree. */
export function playArenaCelebrateMini(): void {
  runArenaAudio((master, ctx) => {
  const t = ctx.currentTime;
  const chord = [392, 493.88, 587.33, 783.99];
  chord.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    const start = t + i * 0.03;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.06, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
    osc.frequency.setValueAtTime(freq, start);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + 0.5);
  });
  });
}
