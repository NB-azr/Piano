/* ============ PianoRecorder · 录音与回放 ============ */
(function (global) {
  'use strict';

  var events = [];   // { t: 毫秒, midi, on:true/false }
  var recording = false;
  var recStart = 0;
  var playTimers = [];
  var playing = false;

  function start() {
    events = [];
    recording = true;
    recStart = performance.now();
  }

  function record(midi, on) {
    if (!recording) return;
    events.push({ t: performance.now() - recStart, midi: midi, on: on });
  }

  function stop() {
    recording = false;
    return events.slice();
  }

  function clear() {
    stopPlay();
    events = [];
    recording = false;
  }

  function stopPlay() {
    playTimers.forEach(clearTimeout);
    playTimers = [];
    playing = false;
  }

  /**
   * 回放。onEvent(midi, on, noteName) 由调用方执行发声/高亮
   */
  function play(onEvent, onEnd) {
    if (!events.length) return false;
    stopPlay();
    playing = true;
    var last = 0;
    events.forEach(function (ev) {
      last = Math.max(last, ev.t);
      var timer = setTimeout(function () {
        onEvent(ev.midi, ev.on);
      }, ev.t);
      playTimers.push(timer);
    });
    var endTimer = setTimeout(function () {
      playing = false;
      playTimers = [];
      if (onEnd) onEnd();
    }, last + 400);
    playTimers.push(endTimer);
    return true;
  }

  global.PianoRecorder = {
    start: start,
    record: record,
    stop: stop,
    clear: clear,
    play: play,
    stopPlay: stopPlay,
    get isRecording() { return recording; },
    get isPlaying() { return playing; },
    get count() { return events.length; }
  };
})(window);