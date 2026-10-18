/* public/js/sound.js — synthesized SFX + procedural background music (WebAudio, no asset files). */
const Sound = (() => {
  let ctx = null, master = null, sfxOn = true, musOn = true, timer = null, kind = null, step = 0, last = 0;

  function init() {                         // must be called from a user gesture (click / key)
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.45; master.connect(ctx.destination); } catch (e) { ctx = null; }
  }
  function tone(f, dur, type = 'square', vol = 0.1, slide = 0, delay = 0, dest) {
    if (!ctx) return; const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol = 0.15) {
    if (!ctx) return; const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; g.gain.value = vol;
    s.buffer = b; s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  const SFX = {
    hit() { noise(.07, .16); tone(170, .08, 'square', .08, -90); }, crit() { noise(.12, .22); tone(240, .14, 'sawtooth', .1, -150); tone(520, .1, 'square', .06, 200, .03); },
    miss() { tone(320, .1, 'sine', .04, -120); }, hurt() { tone(230, .18, 'sawtooth', .1, -150); }, cast() { tone(380, .28, 'triangle', .1, 520); },
    heal() { [523, 659, 784].forEach((f, i) => tone(f, .2, 'sine', .09, 0, i * .08)); }, lvup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .28, 'square', .08, 0, i * .11)); },
    pickup() { tone(880, .07, 'square', .06); tone(1175, .1, 'square', .06, 0, .06); }, click() { tone(700, .04, 'square', .04); },
    warp() { tone(180, .45, 'sine', .12, 900); }, die() { tone(320, .6, 'sawtooth', .1, -260); }, boss() { noise(.3, .25); tone(70, .4, 'sawtooth', .15, -30); },
  };
  function sfx(n) { if (sfxOn && ctx && SFX[n] && performance.now() - last > 25) { last = performance.now(); SFX[n](); } }

  // --- procedural music: slow random-walk melody over a drone, scale per map type
  const SCALES = { town: [262, 294, 330, 392, 440, 523, 587], field: [220, 247, 294, 330, 392, 440, 494], dungeon: [110, 131, 147, 165, 196, 208, 247] };
  function note() {
    if (!ctx || !musOn || !kind) return; const sc = SCALES[kind] || SCALES.town; step++;
    if (step % 4 === 1) tone(sc[0] / 2, kind === 'dungeon' ? 2.4 : 1.6, 'triangle', .05);
    if (Math.random() < (kind === 'dungeon' ? .45 : .75)) { const f = sc[(Math.random() * sc.length) | 0] * (Math.random() < .25 ? 2 : 1); tone(f, kind === 'dungeon' ? 1.6 : .9, kind === 'dungeon' ? 'sine' : 'triangle', .045); }
  }
  function music(k) { kind = k; clearInterval(timer); timer = setInterval(note, k === 'town' ? 420 : k === 'field' ? 560 : 800); }
  function toggle() { sfxOn = musOn = !sfxOn; return sfxOn; }
  return { init, sfx, music, toggle, get on() { return sfxOn; } };
})();
