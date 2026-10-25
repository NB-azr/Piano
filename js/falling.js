/* ============ falling.js · 下落式练习模式 (v3 含漏键暂停) ============ */
(function (global) {
  'use strict';

  var lane = null, judgeLine = null;
  var song = null;
  var notes = [];
  var running = false;
  var t0 = 0;              // 基准时间
  var rafId = 0;
  var onJudge = null, onEnd = null;
  var getLeft = null;
  var getCenterPx = null;
  var getCol = null;
  var stats = { perfect: 0, good: 0, ok: 0, near: 0, recover: 0, miss: 0, total: 0, score: 0 };

  var BASE_TRAVEL = 2400;
  var TRAVEL = 2400;
  var speedFactor = 1.0;
  var HIT_WIN = 180;    // Perfect ±180ms
  var GOOD_WIN = 360;   // Good ±360ms
  var OK_WIN = 850;     // 提前 850ms 内都能按（隔着一段距离也能点，越远分越低）
  var LATE_GRACE = 150; // 过线后只等 150ms 就暂停（保证暂停时所有音符都在线上方）
  var NEAR_KEY = 1;     // 相邻 1 个键（含黑键）也能中
  var FAR_KEY = 2;      // 隔 1 个键也能中
  var NEAR_SCORE = 25;  // 相邻键得分
  var FAR_SCORE = 10;   // 隔键得分

  // 暂停状态
  var autoMode = false;
  var onAutoHit = null;
  var paused = false;
  var pauseAt = 0;         // 暂停时的 clockNow
  var pauseWaitMidi = -1;  // 等待补按的音符 midi
  var pauseWaitNote = null;// 等待补按的音符对象
  var onPauseChange = null;
  var onScore = null;
  var resumeGraceCid = null; // 和弦补按宽限
  var resumeGraceUntil = 0;

  // 和弦（多键同按）：同 cid 的音符用线连起来
  var SVGNS = 'http://www.w3.org/2000/svg';
  var linkSvg = null;
  var chordGroups = {};    // cid -> {items:[...], line:SVGLine}

  function buildLinkLayer() {
    if (linkSvg && linkSvg.parentNode) linkSvg.parentNode.removeChild(linkSvg);
    linkSvg = document.createElementNS(SVGNS, 'svg');
    linkSvg.setAttribute('class', 'lane-links');
    linkSvg.setAttribute('viewBox', '0 0 100 100');
    linkSvg.setAttribute('preserveAspectRatio', 'none');
    lane.appendChild(linkSvg);
    Object.keys(chordGroups).forEach(function (cid) {
      var g = chordGroups[cid];
      if (g.items.length < 2) return;
      var line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('class', 'fall-link');
      linkSvg.appendChild(line);
      g.line = line;
    });
  }

  // 每帧按球的实际位置更新连线（已命中/不可见的球自动排除）
  function updateLinks() {
    if (!linkSvg) return;
    var lr = lane.getBoundingClientRect();
    if (!lr.width || !lr.height) return;
    Object.keys(chordGroups).forEach(function (cid) {
      var g = chordGroups[cid];
      if (!g.line) return;
      var pts = [];
      g.items.forEach(function (it) {
        if (!it.el || it.judged || it.el.style.display === 'none') return;
        var r = it.el.getBoundingClientRect();
        if (!r.width) return;
        pts.push({
          x: (r.left + r.width / 2 - lr.left) / lr.width * 100,
          y: (r.top + r.height / 2 - lr.top) / lr.height * 100
        });
      });
      if (pts.length >= 2) {
        pts.sort(function (a, b) { return a.x - b.x; });
        g.line.style.display = '';
        g.line.setAttribute('x1', pts[0].x);
        g.line.setAttribute('y1', pts[0].y);
        g.line.setAttribute('x2', pts[pts.length - 1].x);
        g.line.setAttribute('y2', pts[pts.length - 1].y);
      } else {
        g.line.style.display = 'none';
      }
    });
  }

  function init(laneEl, judgeEl, opts) {
    lane = laneEl; judgeLine = judgeEl;
    onJudge = (opts && opts.onJudge) || null;
    onEnd = (opts && opts.onEnd) || null;
    getLeft = (opts && opts.getMidiLeftPct) || function(){ return null; };
    getCenterPx = (opts && opts.getMidiCenterPx) || function(){ return null; };
    getCol = (opts && opts.getCol) || function(){ return null; };
    onPauseChange = (opts && opts.onPauseChange) || null;
    onScore = (opts && opts.onScore) || null;
  }

  function beatMs() { return 60000 / (song ? song.bpm : 100); }

  function clearDom() {
    notes.forEach(function (n) { if (n.el && n.el.parentNode) n.el.parentNode.removeChild(n.el); });
    notes = [];
    if (linkSvg && linkSvg.parentNode) linkSvg.parentNode.removeChild(linkSvg);
    linkSvg = null;
    chordGroups = {};
  }

  function load(songObj) {
    stop(); clearDom();
    song = songObj;
    stats = { perfect: 0, good: 0, ok: 0, near: 0, recover: 0, miss: 0, total: song.notes.length, score: 0 };
  }

  function start() {
    if (!song || !song.notes.length) return false;
    TRAVEL = BASE_TRAVEL;
    // 防止重复启动：先取消上一轮残留的动画循环
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    clearDom();
    stats = { perfect: 0, good: 0, ok: 0, near: 0, recover: 0, miss: 0, total: song.notes.length, score: 0 };
    paused = false; pauseWaitMidi = -1; pauseWaitNote = null;
    resumeGraceCid = null; resumeGraceUntil = 0;
    var bms = beatMs();
    chordGroups = {};
    notes = song.notes.map(function (n) {
      var item = {
        midi: n.m, atMs: (n.t * bms) / speedFactor + TRAVEL, durMs: (n.d * bms) / speedFactor,
        judged: false, hit: false, el: null, cid: (n.c != null ? n.c : null)
      };
      if (item.cid != null) {
        if (!chordGroups[item.cid]) chordGroups[item.cid] = { items: [], line: null };
        chordGroups[item.cid].items.push(item);
      }
      var el = document.createElement('div');
      // 白键音蓝色、黑键音（#C/#D/#F/#G/#A）红色
      el.className = 'fall-note' + ([1,3,6,8,10].indexOf(n.m % 12) >= 0 ? ' note-black' : '');
      var col = getCol ? getCol(n.m) : null;
      if (col) {
        el.style.left = '50%';
        el.style.top = '0%';
        col.appendChild(el);
        item.el = el;
        item.col = col;
      } else {
        item.offLane = true;
      }
      return item;
    });
    buildLinkLayer();
    running = true;
    t0 = performance.now();
    rafId = requestAnimationFrame(tick);
    return true;
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    paused = false;
  }

  function reset() {
    stop(); clearDom(); song = null;
    stats = { perfect: 0, good: 0, ok: 0, near: 0, recover: 0, miss: 0, total: 0, score: 0 };
  }

  function clockNow() {
    // 若暂停，时间冻结在 pauseAt
    if (paused) return pauseAt;
    return performance.now() - t0;
  }

  function tick() {
    if (!running) return;
    var now = clockNow();

    // autoMode: 自动完美判定
    if (autoMode && !paused) {
      for (var ai = 0; ai < notes.length; ai++) {
        var an = notes[ai];
        if (!an.el || an.judged) continue;
        if (now >= an.atMs - HIT_WIN) {
          // 到达命中窗口，自动判 perfect
          an.judged = true; an.hit = true;
          stats.perfect++; stats.score += 100;
          spawnFloatScore(an.midi, 'Perfect +100', 'perfect');
          if (onScore) onScore(stats);
          if (onJudge) onJudge(an.midi, 'perfect');
          if (onAutoHit) onAutoHit(an.midi);
          an.el.classList.add('hit');
          (function(el){ setTimeout(function(){ if(el&&el.parentNode) el.parentNode.removeChild(el); }, 260); })(an.el);
        }
      }
    }

    // 只在未暂停时推进过期检测
    if (!paused && !autoMode) {
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        if (!n.el || n.judged) continue;
        // 和弦补按宽限：刚恢复时，同和弦的其他成员再给 250ms 按下，避免连锁暂停
        if (n.cid != null && n.cid === resumeGraceCid && now < resumeGraceUntil) continue;
        // 过线后仅留 LATE_GRACE 短暂宽限，随后立刻暂停（暂停时后面的音符都还在线上方）
        if (now > n.atMs + LATE_GRACE) {
          // 进入暂停等待
          paused = true;
          pauseAt = now;
          pauseWaitMidi = n.midi;
          pauseWaitNote = n;
          n.el.classList.add('waiting');
          n.el.setAttribute('data-wait-midi', n.midi);
          if (onPauseChange) onPauseChange(true, n.midi);
          if (onJudge) onJudge(n.midi, 'wait');
          break; // 只等一个
        }
      }
    }

    // 更新位置（含暂停时保持）
    for (var j = 0; j < notes.length; j++) {
      var m = notes[j];
      if (!m.el || m.judged) continue;
      // 暂停时：等待补按的音符吸附到判定线（top 百分比为音符中心位置，
      // 配合 CSS translateY(-50%)，100% 即中心正好落在判定线上）
      if (paused && m === pauseWaitNote) {
        m.el.style.display = '';
        m.el.style.top = '100%';
        continue;
      }
      var appear = m.atMs - TRAVEL;
      var elapsed = now - appear;
      if (elapsed < 0) { m.el.style.display = 'none'; continue; }
      var progress = elapsed / TRAVEL;
      if (progress > 1.6) { m.el.style.display = 'none'; }
      else {
        m.el.style.display = '';
        var topPct = Math.min(100, progress * 100);
        m.el.style.top = topPct + '%';
      }
    }

    // 和弦连线随球的位置更新
    updateLinks();

    var lastAt = 0;
    for (var k = 0; k < notes.length; k++) lastAt = Math.max(lastAt, notes[k].atMs);
    if (!paused && now > lastAt + OK_WIN + 1500) {
      running = false;
      if (onEnd) onEnd(stats);
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function resumeFromPause() {
    // 无缝恢复：时钟从暂停点继续，音符保持当前高度接着往下掉，不做任何跳变
    // 和弦：给同 cid 的其余成员 250ms 补按宽限
    resumeGraceCid = (pauseWaitNote && pauseWaitNote.cid != null) ? pauseWaitNote.cid : null;
    resumeGraceUntil = pauseAt + 250;
    t0 = performance.now() - pauseAt;
    paused = false;
    if (pauseWaitNote && pauseWaitNote.el) {
      pauseWaitNote.el.classList.remove('waiting');
      pauseWaitNote.el.classList.add('recover');
      (function (el) { setTimeout(function(){ if (el && el.parentNode) el.parentNode.removeChild(el); }, 300); })(pauseWaitNote.el);
    }
    pauseWaitNote = null;
    pauseWaitMidi = -1;
    if (onPauseChange) onPauseChange(false, -1);
  }

  function spawnFloatScore(midi, text, colorClass) {
    if (!lane) return;
    var col = getCol ? getCol(midi) : null;
    var host = col || lane;
    var el = document.createElement('div');
    el.className = 'float-score ' + (colorClass || '');
    el.textContent = text;
    // 定位：命中点水平居中于列，垂直固定在判定线上方
    el.style.left = '50%';
    el.style.bottom = '28px';
    host.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 900);
  }

  function hit(midi) {
    if (!running) return;

    // ---- 暂停中：只接受补按正确音符 ----
    // ---- 暂停中：接受正确音 + 相邻误触 ----
    if (paused) {
      if (!pauseWaitNote) return;
      // 和弦：先按了同一和弦里的其他成员，先判掉这个音，继续等等待音（和弦要逐个按全）
      if (pauseWaitNote.cid != null && midi !== pauseWaitMidi) {
        for (var ci = 0; ci < notes.length; ci++) {
          var cn = notes[ci];
          if (!cn.judged && cn.cid === pauseWaitNote.cid && cn.midi === midi) {
            cn.judged = true; cn.hit = true;
            stats.ok++; stats.score += 35;
            spawnFloatScore(midi, '和弦 +35', 'ok');
            if (onScore) onScore(stats);
            if (onJudge) onJudge(midi, 'ok');
            cn.el.classList.add('ok');
            (function (el) { setTimeout(function(){ if (el && el.parentNode) el.parentNode.removeChild(el); }, 260); })(cn.el);
            return;
          }
        }
      }
      var diff = Math.abs(midi - pauseWaitMidi);
      if (diff === 0) {
        pauseWaitNote.judged = true;
        pauseWaitNote.hit = true;
        stats.recover++;
        stats.score += 50;
        spawnFloatScore(midi, '+50', 'recover');
        if (onScore) onScore(stats);
        if (onJudge) onJudge(midi, 'recover');
        resumeFromPause();
        return;
      }
      if (diff === NEAR_KEY || diff === FAR_KEY) {
        pauseWaitNote.judged = true;
        pauseWaitNote.hit = true;
        var isNear = diff === NEAR_KEY;
        var add = isNear ? NEAR_SCORE : FAR_SCORE;
        stats.near++;
        stats.score += add;
        spawnFloatScore(midi, isNear ? '邻键 +25' : '隔键 +10', isNear ? 'near' : 'far');
        if (onScore) onScore(stats);
        if (onJudge) onJudge(midi, isNear ? 'near' : 'far');
        resumeFromPause();
        return;
      }
      return;
    }

    // ---- 正常判定（同键按时间分档；相邻 ±1 / 隔键 ±2 也能中，分更低）----
    var now = clockNow();
    var best = null, bestDt = Infinity, bestDist = Infinity;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.judged || !n.el) continue;
      var dist = Math.abs(n.midi - midi);
      if (dist > FAR_KEY) continue;
      var dt = Math.abs(now - n.atMs);
      if (dt > OK_WIN) continue;
      // 先按离键距离、再按时间差选最优音符
      if (dist < bestDist || (dist === bestDist && dt < bestDt)) {
        best = n; bestDt = dt; bestDist = dist;
      }
    }
    if (!best) return;
    var res, add, cls, text;
    if (bestDist === 0) {
      if (bestDt <= HIT_WIN) { res = 'perfect'; add = 100; cls = 'perfect'; text = 'Perfect +100'; }
      else if (bestDt <= GOOD_WIN) { res = 'good'; add = 70; cls = 'good'; text = 'Good +70'; }
      else { res = 'ok'; add = 35; cls = 'ok'; text = 'OK +35'; }
    } else if (bestDist === NEAR_KEY) {
      res = 'near'; add = NEAR_SCORE; cls = 'near'; text = '邻键 +25';
    } else {
      res = 'far'; add = FAR_SCORE; cls = 'far'; text = '隔键 +10';
    }
    best.judged = true; best.hit = true;
    if (res === 'perfect') stats.perfect++;
    else if (res === 'good') stats.good++;
    else if (res === 'ok') stats.ok++;
    else stats.near++;
    stats.score += add;
    spawnFloatScore(midi, text, cls);
    if (onScore) onScore(stats);
    best.el.classList.add(res);
    if (onJudge) onJudge(midi, res);
    (function (el) { setTimeout(function(){ if (el && el.parentNode) el.parentNode.removeChild(el); }, 260); })(best.el);
  }

  global.PianoFalling = {
    init: init, load: load, start: start, stop: stop, reset: reset, hit: hit,
    get stats() { return stats; },
    get running() { return running; },
    get paused() { return paused; },
    get waitingMidi() { return pauseWaitMidi; },
    spawnFloatScore: spawnFloatScore,
    setAutoMode: function(on, cb) { autoMode = !!on; onAutoHit = cb || null; },
    setSpeedFactor: function(f) { speedFactor = Math.max(0.25, Math.min(4, f || 1)); },
    getSpeedFactor: function() { return speedFactor; },
    getNotes: function() { return notes; },
    getSong: function() { return song; },
    getT0: function() { return t0; },
    getClockNow: clockNow,
    getWaitInfo: function () {
      if (!paused || !pauseWaitNote) return null;
      return { midi: pauseWaitNote.midi, el: pauseWaitNote.el };
    }
  };
})(window);
