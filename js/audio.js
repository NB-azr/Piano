/* ============ PianoAudio · Web Audio 合成引擎 ============ */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var activeVoices = new Map(); // voiceId -> { nodes:[], gain }
  var timbre = 'piano';
  var volume = 0.7;
  var transpose = 0; // 半音

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    // 立即尝试 resume（若已在手势内）
    if (ctx.state !== 'running') { try { ctx.resume(); } catch(e){} }
    return ctx;
  }

  function resume() {
    ensureCtx();
    // 有些浏览器初始 state 为 suspended 或 interrupted（Safari）
    if (ctx.state !== 'running') {
      try { ctx.resume(); } catch (e) {}
    }
    return ctx;
  }

  // 首次用户手势：强制解锁音频（捕获阶段，最早期）
  var unlocked = false;
  function unlockOnce() {
    if (unlocked) return;
    try {
      ensureCtx();
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      if (ctx.state !== 'running') ctx.resume();
      unlocked = true;
    } catch (e) {}
  }
  ['pointerdown', 'mousedown', 'touchstart', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, unlockOnce, true);
  });

  /* ---- 音色构建：返回 { nodes, gain } ---- */
  function buildPiano(freq, t0) {
    var out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.9, t0 + 0.008);
    out.gain.exponentialRampToValueAtTime(0.28, t0 + 0.28);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);

    var nodes = [out];
    // 泛音：[倍数, 增益]
    var harmonics = [
      [1, 1.0], [2, 0.55], [3, 0.32], [4, 0.18], [5, 0.10], [6, 0.06]
    ];
    harmonics.forEach(function (h) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * h[0], t0);
      // 高泛音衰减更快
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(h[1] * 0.35, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6 / h[0]);
      osc.connect(g); g.connect(out);
      osc.start(t0);
      osc.stop(t0 + 2.0);
      nodes.push(osc, g);
    });
    return { nodes: nodes, gain: out };
  }

  function buildOrgan(freq, t0) {
    var out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
    var nodes = [out];
    [[1, 0.5], [2, 0.3], [0.5, 0.2]].forEach(function (h) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq * h[0], t0);
      g.gain.value = h[1] * 0.4;
      osc.connect(g); g.connect(out);
      osc.start(t0);
      nodes.push(osc, g);
    });
    return { nodes: nodes, gain: out };
  }

  function buildSynth(freq, t0) {
    var out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(0.3, t0 + 0.01);
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 6, t0);
    filter.frequency.exponentialRampToValueAtTime(freq * 2, t0 + 0.6);
    filter.Q.value = 6;

    var nodes = [out, filter];
    ['sawtooth', 'sawtooth'].forEach(function (type, i) {
      var osc = ctx.createOscillator();
      osc.type = type;
      osc.detune.value = i === 0 ? -6 : 6;
      osc.frequency.setValueAtTime(freq, t0);
      osc.connect(filter);
      osc.start(t0);
      nodes.push(osc);
    });
    filter.connect(out);
    return { nodes: nodes, gain: out };
  }

  var builders = { piano: buildPiano, organ: buildOrgan, synth: buildSynth };

  /* ---- 对外 API ---- */
  function noteOn(midi, voiceId) {
    resume();
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) {}
    }
    voiceId = voiceId || ('v' + midi + '_' + Date.now());
    if (activeVoices.has(voiceId)) noteOff(voiceId);
    var t0 = ctx.currentTime + 0.001;
    var freq = midiToFreq(midi + transpose);
    var v = (builders[timbre] || buildPiano)(freq, t0);
    v.gain.connect(master);
    activeVoices.set(voiceId, { voice: v, start: t0, midi: midi });
    return voiceId;
  }

  function noteOff(voiceId) {
    var entry = activeVoices.get(voiceId);
    if (!entry) return;
    activeVoices.delete(voiceId);
    var t = ctx.currentTime;
    var g = entry.voice.gain;
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    } catch (e) {}
    entry.voice.nodes.forEach(function (n) {
      if (n.stop) { try { n.stop(t + 0.25); } catch (e) {} }
    });
  }

  function allOff() {
    Array.from(activeVoices.keys()).forEach(noteOff);
  }

  function setTimbre(v) { timbre = v; }
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
  }
  function setTranspose(semi) { transpose = semi | 0; }

  global.PianoAudio = {
    noteOn: noteOn,
    noteOff: noteOff,
    allOff: allOff,
    setTimbre: setTimbre,
    setVolume: setVolume,
    setTranspose: setTranspose,
    midiToFreq: midiToFreq,
    resume: resume,
    get timbre() { return timbre; },
    get transpose() { return transpose; }
  };
})(window);