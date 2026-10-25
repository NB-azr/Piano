/* ============ app.js · 入口与 UI 绑定 ============ */
(function () {
  'use strict';

  var piano = document.getElementById('piano');
  var timbreSel = document.getElementById('timbre');
  var volumeEl = document.getElementById('volume');
  var transposeEl = document.getElementById('transpose');
  var transposeVal = document.getElementById('transposeVal');
  var showNoteEl = document.getElementById('showNote');
  var speedSel = document.getElementById('speedSel');
  var recBtn = document.getElementById('recBtn');
  var playBtn = document.getElementById('playBtn');
  var stopBtn = document.getElementById('stopBtn');
  var clearBtn = document.getElementById('clearBtn');
  var statusEl = document.getElementById('status');
  var songSel = document.getElementById('songSel');
  var importBtn = document.getElementById('importBtn');
  var importInput = document.getElementById('importInput');
  var practiceBtn = document.getElementById('practiceBtn');
  var practiceStopBtn = document.getElementById('practiceStopBtn');
  var demoBtn = document.getElementById('demoBtn');
  var laneEl = document.getElementById('lane');
  var judgeEl = document.getElementById('judgeLine');
  var curScoreEl = document.getElementById('curScore');
  var bestScoreEl = document.getElementById('bestScore');
  var resultModal = document.getElementById('resultModal');
  var resultTitle = document.getElementById('resultTitle');
  var resultScore = document.getElementById('resultScore');
  var resultBest = document.getElementById('resultBest');
  var resultPerfect = document.getElementById('resultPerfect');
  var resultGood = document.getElementById('resultGood');
  var resultOk = document.getElementById('resultOk');
  var resultNear = document.getElementById('resultNear');
  var resultRecover = document.getElementById('resultRecover');
  var resultRetry = document.getElementById('resultRetry');
  var resultClose = document.getElementById('resultClose');
  var totalScoreEl = document.getElementById('totalScore');
  var rankBtn = document.getElementById('rankBtn');
  var rankModal = document.getElementById('rankModal');
  var rankList = document.getElementById('rankList');
  var rankClose = document.getElementById('rankClose');

  var inPractice = false;
  var inDemo = false;
  var activeVoice = {};
  var playbackVoice = {};
  var BEST_KEY = 'webpiano_best_score';

  var KEYHINT = {60:'A',61:'W',62:'S',63:'E',64:'D',65:'F',66:'T',67:'G',68:'Y',69:'H',70:'U',71:'J',72:'K'};

  function setStatus(text, isRec) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('rec', !!isRec);
  }

  var currentSongKey = '';
  function bestKeyFor(songKey) {
    return BEST_KEY + '_' + (songKey || 'default');
  }
  function getBest(songKey) {
    songKey = songKey || currentSongKey;
    try { return parseInt(localStorage.getItem(bestKeyFor(songKey)) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function setBest(v, songKey) {
    songKey = songKey || currentSongKey;
    try { localStorage.setItem(bestKeyFor(songKey), String(v)); } catch (e) {}
  }
  // 一次性清理旧版无后缀的污染 key
  try { localStorage.removeItem(BEST_KEY); } catch (e) {}

  function historyKeyFor(songKey) {
    return 'webpiano_history_' + (songKey || 'default');
  }
  function getHistory(songKey) {
    try {
      var raw = localStorage.getItem(historyKeyFor(songKey));
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function pushHistory(score, songKey) {
    if (!(score > 0)) return;
    var arr = getHistory(songKey);
    arr.push({ score: score, at: Date.now() });
    arr.sort(function (a, b) { return b.score - a.score; });
    arr = arr.slice(0, 10);
    try { localStorage.setItem(historyKeyFor(songKey), JSON.stringify(arr)); } catch (e) {}
  }
  function showResultModal(stats, songName, isDemo) {
    if (!resultModal) return;
    var best = getBest(currentSongKey);
    var isNew = false;
    var rankInfo = null;
    if (!isDemo) {
      var myScore = stats.score || 0;
      pushHistory(myScore, currentSongKey);
      var hist = getHistory(currentSongKey);
      var rank = 0;
      var cnt = 0;
      for (var i = 0; i < hist.length; i++) {
        if (hist[i].score > myScore) rank++;
        if (hist[i].score >= myScore) cnt++;
      }
      rankInfo = { rank: rank + 1, total: hist.length };
      isNew = myScore > best;
      if (isNew) { best = myScore; setBest(best, currentSongKey); }
    }
    if (resultTitle) resultTitle.textContent = songName + (isDemo ? ' · 演示' : (isNew ? ' · 新纪录！' : ' · 完成'));
    if (resultScore) resultScore.textContent = stats.score || 0;
    if (resultBest) resultBest.textContent = best;
    if (resultPerfect) resultPerfect.textContent = stats.perfect || 0;
    if (resultGood) resultGood.textContent = stats.good || 0;
    if (resultOk) resultOk.textContent = stats.ok || 0;
    if (resultNear) resultNear.textContent = stats.near || 0;
    if (resultRecover) resultRecover.textContent = stats.recover || 0;
    if (bestScoreEl) bestScoreEl.textContent = best;
    refreshTotalScore();
    var rankLine = document.getElementById('resultRankLine');
    if (rankLine) {
      if (isDemo) {
        rankLine.innerHTML = '<span class="rank-demo-tag">演示模式 · 不计入排行</span>';
      } else if (rankInfo) {
        var rankCls = rankInfo.rank === 1 ? ' rank-first' : '';
        rankLine.innerHTML = '<span class="rank-pos' + rankCls + '">本次第 <strong>' + rankInfo.rank + '</strong> 名</span>' +
          '<span class="rank-total">共 ' + rankInfo.total + ' 次记录</span>';
      }
    }
    var histEl = document.getElementById('resultHistory');
    if (histEl) {
      if (isDemo) {
        histEl.innerHTML = '';
      } else {
        var hist2 = getHistory(currentSongKey).slice(0, 5);
        if (!hist2.length) {
          histEl.innerHTML = '';
        } else {
          var html = '<div class="rank-mini-title">本曲 Top 5</div>';
          hist2.forEach(function (h, i) {
            var medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : (i + 1);
            html += '<div class="rank-row' + (i < 3 ? ' top' + (i + 1) : '') + '">' +
              '<span class="rank-no">' + medal + '</span>' +
              '<span class="rank-score">' + h.score + '</span></div>';
          });
          histEl.innerHTML = html;
        }
      }
    }
    resultModal.style.display = 'flex';
  }
  function hideResultModal() {
    if (resultModal) resultModal.style.display = 'none';
  }

  function calcMaxScore(songKey) {
    var song = PianoSongs && PianoSongs[songKey];
    if (!song || !song.notes) return 0;
    var singles = 0;
    var chordSet = {};
    for (var i = 0; i < song.notes.length; i++) {
      var n = song.notes[i];
      if (n.c) { chordSet[n.c] = true; }
      else { singles++; }
    }
    var chordGroups = Object.keys(chordSet).length;
    return singles * 100 + chordGroups * 100;
  }
  function refreshTotalScore() {
    var maxEl = document.getElementById('maxScore');
    if (maxEl) maxEl.textContent = calcMaxScore(currentSongKey);
    if (bestScoreEl) bestScoreEl.textContent = getBest(currentSongKey);
  }

  function showRankModal() {
    if (!rankModal || !rankList) return;
    var rows = [];
    Object.keys(PianoSongs || {}).forEach(function (k) {
      var best = getBest(k);
      if (best > 0) rows.push({ name: PianoSongs[k].name, best: best, key: k });
    });
    rows.sort(function (a, b) { return b.best - a.best; });
    if (!rows.length) {
      rankList.innerHTML = '<div class="rank-empty">还没有记录，快去练一首吧</div>';
    } else {
      var html = '';
      rows.forEach(function (r, i) {
        var medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : (i + 1);
        html += '<div class="rank-row' + (i < 3 ? ' top' + (i + 1) : '') + '">' +
          '<span class="rank-no">' + medal + '</span>' +
          '<span class="rank-name">' + r.name + '</span>' +
          '<span class="rank-score">' + r.best + '</span></div>';
      });
      rankList.innerHTML = html;
    }
    rankModal.style.display = 'flex';
  }

  function updateScoreUI(stats) {
    if (curScoreEl) curScoreEl.textContent = stats.score || 0;
    var best = getBest(currentSongKey);
    if ((stats.score || 0) > best) { best = stats.score; setBest(best, currentSongKey); }
    if (bestScoreEl) bestScoreEl.textContent = best;
  }

  /* ---- 发声 ---- */
  function noteOn(midi) {
    // 练习判定优先，不受发声去重影响
    if (inPractice) PianoFalling.hit(midi);
    if (activeVoice[midi]) return;
    var vid = PianoAudio.noteOn(midi);
    activeVoice[midi] = vid;
    PianoKeyboard.highlightMidi(midi, true);
    PianoRecorder.record(midi, true);
  }
  function noteOff(midi) {
    var vid = activeVoice[midi];
    if (vid) { PianoAudio.noteOff(vid); delete activeVoice[midi]; }
    PianoKeyboard.highlightMidi(midi, false);
    PianoRecorder.record(midi, false);
  }

  /* ---- 键盘 ---- */
  PianoKeyboard.build(piano, { onNoteOn: noteOn, onNoteOff: noteOff });
  if (laneEl) PianoKeyboard.buildLaneCols(laneEl);
  PianoKeyboard.onTranspose(function (delta) {
    transposeEl.value = parseInt(transposeEl.value, 10) + delta;
    applyTranspose();
  });

  /* ---- 控件 ---- */
  timbreSel.addEventListener('change', function () {
    PianoAudio.setTimbre(timbreSel.value);
    setStatus('音色：' + timbreSel.options[timbreSel.selectedIndex].text);
  });
  if (speedSel) {
    speedSel.addEventListener('change', function () {
      var f = parseFloat(speedSel.value) || 1;
      if (typeof PianoFalling !== 'undefined' && PianoFalling.setSpeedFactor) {
        PianoFalling.setSpeedFactor(f);
      }
      setStatus('下落速度：' + f.toFixed(2) + 'x');
    });
  }
  volumeEl.addEventListener('input', function () {
    PianoAudio.setVolume(volumeEl.value / 100);
  });
  function applyTranspose() {
    var v = parseInt(transposeEl.value, 10) || 0;
    transposeVal.textContent = (v > 0 ? '+' : '') + v;
    PianoAudio.setTranspose(v);
  }
  transposeEl.addEventListener('input', applyTranspose);
  showNoteEl.addEventListener('change', function () {
    document.body.classList.toggle('hide-notes', !showNoteEl.checked);
  });

  /* ---- 练习模式 ---- */
  if (typeof PianoSongs !== 'undefined' && songSel) {
    // 读取 js/custom.js 里的 CUSTOM_SONGS（用户自己加的曲子）
    if (typeof PianoCustom !== 'undefined' && PianoCustom.list) {
      PianoCustom.list.forEach(function (s, i) {
        var norm = PianoCustom.normalize(s);
        if (norm && !PianoSongs[norm.name]) PianoSongs['custom_' + i] = norm;
      });
    }
    var songKeys = Object.keys(PianoSongs);
    songKeys.forEach(function (k) {
      var opt = document.createElement('option');
      opt.value = k;
      opt.textContent = PianoSongs[k].name;
      songSel.appendChild(opt);
    });
    if (songKeys.length) {
      songSel.value = songKeys[0];
      currentSongKey = songKeys[0];
      refreshTotalScore();
    }
    practiceBtn.disabled = false;
    songSel.addEventListener('change', function () {
      practiceBtn.disabled = false;
      // 同步当前曲目，刷新总分/最高显示
      if (songSel.value) {
        currentSongKey = songSel.value;
        refreshTotalScore();
        if (bestScoreEl) bestScoreEl.textContent = getBest(currentSongKey);
        if (curScoreEl) curScoreEl.textContent = '0';
      }
    });

    PianoFalling.init(laneEl, judgeEl, {
      getMidiLeftPct: function (midi) { return PianoKeyboard.getKeyLeftPct(midi); },
      getMidiCenterPx: function (midi) { return PianoKeyboard.getKeyCenterPx(midi); },
      getCol: function (midi) { return PianoKeyboard.getColForMidi(midi); },
      onScore: function (stats) { updateScoreUI(stats); },
      onJudge: function (midi, result) {
        if (result === 'perfect') { setStatus('Perfect! +100'); }
        else if (result === 'good') { setStatus('Good +70'); }
        else if (result === 'ok') { setStatus('OK +35'); }
        else if (result === 'wait') {
          var info = (typeof PianoFalling.getWaitInfo === 'function') ? PianoFalling.getWaitInfo() : null;
          var useMidi = info ? info.midi : midi;
          var nm = PianoKeyboard.midiName(useMidi);
          var hint = KEYHINT[useMidi] ? ('（键盘 ' + KEYHINT[useMidi] + ' 键）') : '（点击琴键）';
          setStatus('漏了！按 ' + nm + ' ' + hint + ' · 旁边的键也能按，分更低');
        }
        else if (result === 'recover') { setStatus('补按 +50'); }
        else if (result === 'near') { setStatus('邻键 +25'); }
        else if (result === 'far') { setStatus('隔键 +10'); }
      },
      onPauseChange: function (isPaused) {
        document.body.classList.toggle('paused', !!isPaused);
      },
      onEnd: function (stats) {
        var songName = (PianoSongs[currentSongKey] && PianoSongs[currentSongKey].name) || '练习';
        setStatus('完成！得分 ' + stats.score);
        showResultModal(stats, songName, inDemo);
        exitPractice();
      }
    });
    if (demoBtn) {
      demoBtn.addEventListener('click', function () {
        if (inDemo) {
          PianoFalling.stop();
          PianoFalling.setAutoMode(false);
          exitPractice();
          setStatus('已停止自动演示');
          return;
        }
        if (inPractice) return;
        var key = songSel.value;
        if (!key) {
          var fk = Object.keys(PianoSongs)[0];
          if (!fk) return;
          songSel.value = fk; key = fk;
        }
        var song = PianoSongs[key];
        if (!song) return;
        enterPractice(key);
        inDemo = true;
        demoBtn.classList.add('playing');
        demoBtn.innerHTML = '&#9632; 停止示例';
        setStatus('演示：' + song.name + '（自动演奏中）');
        PianoKeyboard.computeLeftPct();
        // 开启自动模式：命中时回调发声+高亮
        PianoFalling.setAutoMode(true, function (midi) {
          var vid = PianoAudio.noteOn(midi);
          activeVoice[midi] = vid;
          PianoKeyboard.highlightMidi(midi, true);
          // 220ms 后自动松开
          setTimeout(function () {
            var v = activeVoice[midi];
            if (v) { PianoAudio.noteOff(v); delete activeVoice[midi]; }
            PianoKeyboard.highlightMidi(midi, false);
          }, 220);
        });
      });
    }

    practiceBtn.addEventListener('click', function () {
      if (inPractice) return;
      var key = songSel.value;
      if (!key) {
        var first = Object.keys(PianoSongs)[0];
        if (!first) return;
        songSel.value = first; key = first;
      }
      enterPractice(key);
    });
    practiceStopBtn.addEventListener('click', function () {
      PianoFalling.stop();
      exitPractice();
      setStatus('已退出练习');
    });
  }

  var startTimer = null;
  function clearStartTimer() {
    if (startTimer !== null) { clearTimeout(startTimer); startTimer = null; }
  }

  function enterPractice(key) {
    currentSongKey = key;
    hideResultModal();
    PianoAudio.resume();
    clearStartTimer();
    Object.keys(activeVoice).forEach(function (m) { noteOff(parseInt(m, 10)); });
    inPractice = true;
    document.body.classList.add('practice');

    if (curScoreEl) curScoreEl.textContent = '0';
    if (bestScoreEl) bestScoreEl.textContent = getBest(currentSongKey);
    var songObj = PianoSongs[key];
    var songRange = PianoKeyboard.getSongRange(songObj);
    if (songRange) {
      PianoKeyboard.setRange(songRange, { onNoteOn: noteOn, onNoteOff: noteOff });
    } else {
      PianoKeyboard.buildLaneCols(laneEl);
      PianoKeyboard.computeLeftPct();
    }
    PianoFalling.load(songObj);
    startTimer = setTimeout(function () {
      startTimer = null;
      PianoFalling.start();
    }, 400);
    practiceBtn.disabled = true;
    practiceStopBtn.disabled = false;
    songSel.disabled = true;
    recBtn.disabled = true;
    setStatus('练习：' + PianoSongs[key].name + ' — 音符落到线时按键');
  }

  function exitPractice() {
    inDemo = false;
    if (typeof PianoFalling !== 'undefined' && PianoFalling.setAutoMode) PianoFalling.setAutoMode(false);
    if (window._demoTimers) { window._demoTimers.forEach(clearTimeout); window._demoTimers = null; }
    if (demoBtn) { demoBtn.classList.remove('playing'); demoBtn.innerHTML = '&#9654; 听示例'; }
    inPractice = false;
    clearStartTimer();
    document.body.classList.remove('practice');
    document.body.classList.remove('paused');
    practiceBtn.disabled = false;
    practiceStopBtn.disabled = true;
    songSel.disabled = false;
    recBtn.disabled = false;
    PianoKeyboard.computeLeftPct();
  }

  /* ---- 结算弹窗按钮 ---- */
  if (rankBtn) {
    rankBtn.addEventListener('click', function () { showRankModal(); });
  }
  if (rankClose) {
    rankClose.addEventListener('click', function () { rankModal.style.display = 'none'; });
  }
  if (resultClose) {
    resultClose.addEventListener('click', function () { hideResultModal(); });
  }
  if (resultRetry) {
    resultRetry.addEventListener('click', function () {
      hideResultModal();
      var k = currentSongKey || songSel.value;
      if (k && PianoSongs[k]) enterPractice(k);
    });
  }

  /* ---- 录音 / 回放 ---- */
  recBtn.addEventListener('click', function () {
    if (!PianoRecorder.isRecording) {
      PianoAudio.resume();
      PianoRecorder.start();
      recBtn.classList.add('active');
      recBtn.textContent = '● 录音中';
      playBtn.disabled = true; clearBtn.disabled = true; stopBtn.disabled = false;
      setStatus('录音中…', true);
    } else {
      finishRecording();
    }
  });
  function finishRecording() {
    var ev = PianoRecorder.stop();
    recBtn.classList.remove('active');
    recBtn.textContent = '● 录音';
    stopBtn.disabled = true;
    if (ev.length) {
      playBtn.disabled = false; clearBtn.disabled = false;
      setStatus('录音完成：' + ev.length + ' 个事件');
    } else { setStatus('无录音'); }
  }
  stopBtn.addEventListener('click', function () {
    if (PianoRecorder.isRecording) finishRecording();
    if (PianoRecorder.isPlaying) {
      PianoRecorder.stopPlay();
      Object.keys(playbackVoice).forEach(function (m) {
        PianoAudio.noteOff(playbackVoice[m]);
        PianoKeyboard.highlightMidi(parseInt(m, 10), false);
      });
      playbackVoice = {};
      setStatus('已停止回放');
    }
  });
  playBtn.addEventListener('click', function () {
    PianoAudio.resume();
    Object.keys(activeVoice).forEach(function (m) { noteOff(parseInt(m, 10)); });
    playbackVoice = {};
    var ok = PianoRecorder.play(function (midi, on) {
      if (on) {
        var vid = PianoAudio.noteOn(midi);
        playbackVoice[midi] = vid;
        PianoKeyboard.highlightMidi(midi, true);
      } else {
        if (playbackVoice[midi]) { PianoAudio.noteOff(playbackVoice[midi]); delete playbackVoice[midi]; }
        PianoKeyboard.highlightMidi(midi, false);
      }
    }, function () { setStatus('回放结束'); playbackVoice = {}; });
    if (ok) setStatus('回放中…');
  });
  clearBtn.addEventListener('click', function () {
    PianoRecorder.clear();
    playBtn.disabled = true; clearBtn.disabled = true; stopBtn.disabled = true;
    setStatus('已清除录音');
  });

  /* ---- 首次交互激活音频 ---- */
  ['pointerdown', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, function once() {
      PianoAudio.resume();
      document.removeEventListener(evt, once);
    }, { once: true, capture: true });
  });

  applyTranspose();
  PianoAudio.setVolume(volumeEl.value / 100);
  if (bestScoreEl) bestScoreEl.textContent = getBest();
  setStatus('就绪 — 点击琴键或按 A S D F… 弹奏');
})();