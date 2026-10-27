// Sound effects are synthesised with WebAudio at play time, so there are no
// audio asset files (same approach as textures.ts). Kept soft and friendly.

function envelope(ctx: AudioContext, t: number, peak: number, attack: number, decay: number) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  gain.connect(ctx.destination);
  return gain;
}

/** Rising water-drop "bloink" for passing an obstacle. */
export function playBloink(ctx: AudioContext) {
  const t = ctx.currentTime;
  const out = envelope(ctx, t, 0.3, 0.01, 0.34);
  for (const [mult, level] of [
    [1, 1],
    [2, 0.25],
  ]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520 * mult, t);
    osc.frequency.exponentialRampToValueAtTime(1040 * mult, t + 0.09);
    osc.frequency.exponentialRampToValueAtTime(880 * mult, t + 0.3);
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.36);
  }
}

/** Soft splash, then bubbles sinking lower in pitch as the boat goes under. */
export function playSink(ctx: AudioContext) {
  const t = ctx.currentTime;

  // splash: noise through a closing low-pass filter
  const len = 1;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2500, t);
  filter.frequency.exponentialRampToValueAtTime(300, t + 0.9);
  noise.connect(filter).connect(envelope(ctx, t, 0.35, 0.01, 0.9));
  noise.start(t);
  noise.stop(t + len);

  // bubbles: short upward blips, each lower than the last
  for (let i = 0; i < 7; i++) {
    const start = t + 0.25 + i * 0.17 + Math.random() * 0.05;
    const f = 260 - i * 25;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, start);
    osc.frequency.exponentialRampToValueAtTime(f * 2.2, start + 0.07);
    osc.connect(envelope(ctx, start, 0.18, 0.01, 0.11));
    osc.start(start);
    osc.stop(start + 0.13);
  }
}

/**
 * Friendly two-tone ship's horn for casting off: two detuned pairs of
 * sawtooth reeds a fifth apart, softened by a low-pass filter, sliding up to
 * pitch as the air comes in. Kept moderate in volume.
 */
export function playHorn(ctx: AudioContext) {
  const t = ctx.currentTime;
  const hold = 0.9;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.22, t + 0.08);
  out.gain.setValueAtTime(0.22, t + hold);
  out.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.35);
  out.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.7;
  filter.connect(out);

  for (const f of [116, 117.5, 174, 175.8]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f * 0.94, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const g = ctx.createGain();
    g.gain.value = 0.25;
    osc.connect(g).connect(filter);
    osc.start(t);
    osc.stop(t + hold + 0.4);
  }
}
