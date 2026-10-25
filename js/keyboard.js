/* ============ PianoKeyboard · 88键渲染与输入 ============ */
(function (global) {
  'use strict';

  var START_MIDI = 21;  // A0
  var END_MIDI = 108;   // C8
  var BLACK = { 1: true, 3: true, 6: true, 8: true, 10: true }; // 音级(相对C)为黑键
  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // 键盘映射（从 C4=60 起的一排，实际按 midi 偏移）
  var KEYMAP = {
    'KeyA': 0, 'KeyW': 1, 'KeyS': 2, 'KeyE': 3, 'KeyD': 4, 'KeyF': 5,
    'KeyT': 6, 'KeyG': 7, 'KeyY': 8, 'KeyH': 9, 'KeyU': 10, 'KeyJ': 11, 'KeyK': 12
  };
  var BASE_MIDI = 60; // C4
  var octaveShift = 0; // 上下箭头

  var container = null;
  var laneEl = null;     // 音符轨道容器，用于对齐百分比
  var keyEls = {};       // midi -> element
  var handlers = { onNoteOn: null, onNoteOff: null };
  var mouseDown = false;
  var pressedByKeyboard = {}; // code -> voiceId
  var currentRange = { start: 21, end: 108 };
  var isFullMode = true;

  function midiName(m) {
    return NAMES[m % 12] + (Math.floor(m / 12) - 1);
  }

  function build(containerEl, cbs, midiRange) {
    container = containerEl;
    handlers = Object.assign({ onNoteOn: null, onNoteOff: null }, cbs || {});
    container.innerHTML = '';
    keyEls = {};

    var startMidi, endMidi, twoRow;
    if (midiRange && typeof midiRange.start === 'number' && typeof midiRange.end === 'number') {
      startMidi = midiRange.start;
      endMidi = midiRange.end;
      twoRow = false;
      isFullMode = false;
    } else {
      startMidi = 21;
      endMidi = 108;
      twoRow = true;
      isFullMode = true;
    }
    currentRange = { start: startMidi, end: endMidi };

    if (twoRow) {
      renderRow(container, 21, 59, 'row-low');
      renderRow(container, 60, 108, 'row-high');
    } else {
      renderRow(container, startMidi, endMidi, 'row-single');
    }

    bindInput();
    requestAnimationFrame(computeLeftPct);
    window.addEventListener('resize', computeLeftPct);
  }

  function renderRow(containerEl, startMidi, endMidi, rowClass) {
    var row = document.createElement('div');
    row.className = 'piano-row ' + rowClass;

    var whites = [];
    for (var m = startMidi; m <= endMidi; m++) {
      if (!BLACK[m % 12]) whites.push(m);
    }
    var whiteCount = whites.length;
    var whiteIndex = 0;

    for (var i = startMidi; i <= endMidi; i++) {
      var isBlack = !!BLACK[i % 12];
      var el = document.createElement('div');
      el.className = isBlack ? 'key-black' : 'key-white';
      el.dataset.midi = i;
      var label = document.createElement('span');
      label.className = 'note-label';
      label.textContent = midiName(i);
      el.appendChild(label);
      keyEls[i] = el;

      if (isBlack) {
        var leftPct = (whiteIndex / whiteCount) * 100;
        el.style.left = 'calc(' + leftPct + '% - 0.55%)';
        row.appendChild(el);
      } else {
        row.appendChild(el);
        whiteIndex++;
      }
    }
    containerEl.appendChild(row);
  }

  function press(midi, source) {
    var el = keyEls[midi];
    if (!el || el.classList.contains('active')) return;
    el.classList.add('active');
    if (handlers.onNoteOn) handlers.onNoteOn(midi, midiName(midi));
  }

  function release(midi) {
    var el = keyEls[midi];
    if (!el) return;
    el.classList.remove('active');
    if (handlers.onNoteOff) handlers.onNoteOff(midi);
  }

  // midi -> 左边缘百分比(相对容器宽度)
  var keyLeftPct = {};

  function computeLeftPct() {
    if (!container) return;
    var cw = container.clientWidth;
    if (!cw) return;
    // 音符的定位父级是 lane，百分比必须以 lane 的坐标系为基准
    var refEl = laneEl || container;
    var refRect = refEl.getBoundingClientRect();
    var refW = refEl.clientWidth || refRect.width;
    if (!refW) return;
    Object.keys(keyEls).forEach(function (m) {
      var el = keyEls[m];
      var rect = el.getBoundingClientRect();
      // 琴键中心相对于 lane 左边的像素偏移
      var centerPx = (rect.left + rect.width / 2) - refRect.left;
      keyLeftPct[m] = (centerPx / refW) * 100;
    });
  }

  function getKeyLeftPct(midi) {
    if (keyLeftPct[midi] === undefined) computeLeftPct();
    return keyLeftPct[midi] !== undefined ? keyLeftPct[midi] : null;
  }

  // 返回琴键中心相对 lane 左边缘的像素值（用于音符直接像素定位）
  function getKeyCenterPx(midi) {
    var el = keyEls[midi];
    if (!el) return null;
    var refEl = laneEl || container;
    if (!refEl) return null;
    var rect = el.getBoundingClientRect();
    var refRect = refEl.getBoundingClientRect();
    return (rect.left + rect.width / 2) - refRect.left;
  }

  // ===== 列布局 =====
  var laneCols = {}; // midi -> column element

  function buildLaneCols(laneElement) {
    if (!laneElement) return;
    laneEl = laneElement;
    // 清理旧的列
    var old = laneElement.querySelectorAll('.lane-col');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    laneCols = {};

    // 生成与白键一一对应的 flex 列容器
    var colWrap = document.createElement('div');
    colWrap.className = 'lane-cols';
    laneElement.appendChild(colWrap);

    var startMidi = currentRange.start;
    var endMidi = currentRange.end;
    var whiteCount = 0;
    for (var m = startMidi; m <= endMidi; m++) {
      if (!BLACK[m % 12]) whiteCount++;
    }

    var whiteIdx = 0;
    for (var midi = startMidi; midi <= endMidi; midi++) {
      var isBlack = !!BLACK[midi % 12];
      var col = document.createElement('div');
      col.className = 'lane-col' + (isBlack ? ' col-black' : ' col-white');
      col.dataset.midi = midi;
      // 黑键列：绝对定位在白键列右边界，宽度取白键宽度的 60%
      if (isBlack) {
        var leftPct = (whiteIdx / whiteCount) * 100;
        col.style.left = leftPct + '%';
      }
      colWrap.appendChild(col);
      laneCols[midi] = col;
      if (!isBlack) whiteIdx++;
    }
  }

  function getColForMidi(midi) {
    return laneCols[midi] || null;
  }
  function bindInput() {
    // 鼠标/触摸
    container.addEventListener('mousedown', function (e) {
      var k = e.target.closest('[data-midi]');
      if (!k) return;
      mouseDown = true;
      press(parseInt(k.dataset.midi, 10), 'mouse');
      e.preventDefault();
    });
    container.addEventListener('mouseover', function (e) {
      if (!mouseDown) return;
      var k = e.target.closest('[data-midi]');
      if (!k) return;
      press(parseInt(k.dataset.midi, 10), 'mouse');
    });
    container.addEventListener('mouseout', function (e) {
      if (!mouseDown) return;
      var k = e.target.closest('[data-midi]');
      if (!k) return;
      release(parseInt(k.dataset.midi, 10));
    });
    global.addEventListener('mouseup', function () {
      if (!mouseDown) return;
      mouseDown = false;
      Object.keys(keyEls).forEach(function (m) {
        if (keyEls[m].classList.contains('active')) release(parseInt(m, 10));
      });
    });

    // 键盘
    document.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (e.code === 'ArrowLeft') { shiftTranspose(-1); e.preventDefault(); return; }
      if (e.code === 'ArrowRight') { shiftTranspose(1); e.preventDefault(); return; }
      if (e.code === 'ArrowUp') { octaveShift = Math.min(3, octaveShift + 1); e.preventDefault(); return; }
      if (e.code === 'ArrowDown') { octaveShift = Math.max(-3, octaveShift - 1); e.preventDefault(); return; }

      if (KEYMAP.hasOwnProperty(e.code)) {
        var midi = BASE_MIDI + KEYMAP[e.code] + octaveShift * 12;
        if (midi < START_MIDI || midi > END_MIDI) return;
        if (pressedByKeyboard[e.code]) return;
        pressedByKeyboard[e.code] = true;
        press(midi, 'key');
        e.preventDefault();
      }
    });

    document.addEventListener('keyup', function (e) {
      if (KEYMAP.hasOwnProperty(e.code)) {
        var midi = BASE_MIDI + KEYMAP[e.code] + octaveShift * 12;
        delete pressedByKeyboard[e.code];
        release(midi);
      }
    });
  }

  var onTransposeChange = null;
  function shiftTranspose(delta) {
    if (onTransposeChange) onTransposeChange(delta);
  }

  function highlightMidi(midi, on) {
    var el = keyEls[midi];
    if (!el) return;
    el.classList.toggle('active', !!on);
  }

  function getSongRange(song) {
    if (!song || !song.notes || !song.notes.length) return null;
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < song.notes.length; i++) {
      var m = song.notes[i].m;
      if (m < min) min = m;
      if (m > max) max = m;
    }
    if (min === Infinity) return null;
    while (min % 12 !== 0 && min > 21) min--;
    while (max % 12 !== 0 && max < 108) max++;
    return { start: min, end: max };
  }

  function setRange(range, cbs) {
    if (!container) return;
    build(container, cbs || handlers, range);
    if (laneEl) buildLaneCols(laneEl);
    requestAnimationFrame(computeLeftPct);
  }

  function restoreFullRange(cbs) {
    setRange(null, cbs);
  }

  global.PianoKeyboard = {
    build: build,
    midiName: midiName,
    highlightMidi: highlightMidi,
    getKeyLeftPct: getKeyLeftPct,
    getKeyCenterPx: getKeyCenterPx,
    buildLaneCols: buildLaneCols,
    getColForMidi: getColForMidi,
    computeLeftPct: computeLeftPct,
    onTranspose: function (fn) { onTransposeChange = fn; },
    setOctave: function (n) { octaveShift = n; },
    setLane: function (el) { laneEl = el; computeLeftPct(); },
    setRange: setRange,
    restoreFullRange: restoreFullRange,
    getSongRange: getSongRange
  };
})(window);