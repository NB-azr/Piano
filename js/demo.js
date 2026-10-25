/* ============ demo.js · 自动演示（Autopilot） ============ */
(function (global) {
  'use strict';

  var timers = [];
  var playing = false;
  var onEnd = null;
  var onStart = null;
  var checkTimer = null;

  function clearTimers() {
    timers.forEach(function (t) { clearTimeout(t); });
    timers = [];
    if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
  }

  function stop() {
    if (!playing) return false;
    clearTimers();
    playing = false;
    if (onEnd) { try { onEnd(false); } catch (e) {} }
    return true;
  }

  /**
   * 启动自动演示
   * @param {Object} song - { name, bpm, notes: [{m,t,d}] }
   * @param {Object} callbacks - { onStart, onEnd, onHit(midi) }
   */
  function play(song, callbacks) {
    if (!song || !song.notes || !song.notes.length) return false;
    stop();
    callbacks = callbacks || {};
    onStart = callbacks.onStart || null;
    onEnd = callbacks.onEnd || null;
    var onHit = callbacks.onHit || null;

    playing = true;
    if (onStart) { try { onStart(song); } catch (e) {} }

    var bpm = song.bpm || 100;
    var beatMs = 60000 / bpm;
    
    // 我们不再自己算定时器触发发声，而是依赖 falling.js 的判定
    // 因为要"像真人一样"，我们必须在音符落线的瞬间触发 hit
    // 但触发 hit 需要模拟按键事件（noteOn/noteOff）
    // 为了完美，我们直接按谱子的 atMs 去触发 hit
    // 注意：falling.js 的 atMs = n.t * beatMs + TRAVEL
    
    var TRAVEL = 2400; 
    var notes = song.notes;

    notes.forEach(function (n) {
      var atMs = n.t * beatMs + TRAVEL;
      var durMs = n.d * beatMs;
      
      // 起音（完美判定）
      var tOn = setTimeout(function () {
        if (!playing) return;
        if (onHit) onHit(n.m, true); // true 表示按下
      }, atMs);
      timers.push(tOn);

      // 止音
      var tOff = setTimeout(function () {
        if (!playing) return;
        if (onHit) onHit(n.m, false); // false 表示松开
      }, atMs + durMs);
      timers.push(tOff);
    });

    var lastAt = 0;
    notes.forEach(function(n) {
        lastAt = Math.max(lastAt, n.t * beatMs + TRAVEL + n.d * beatMs);
    });

    // 结束判定（兜底）
    var tEnd = setTimeout(function () {
      if (!playing) return;
      playing = false;
      timers = [];
      if (onEnd) { try { onEnd(true); } catch (e) {} }
    }, lastAt + 3000);
    timers.push(tEnd);

    return true;
  }

  global.PianoDemo = {
    play: play,
    stop: stop,
    get isPlaying() { return playing; }
  };
})(window);