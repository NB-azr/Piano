/* ============ custom.js · 自定义曲目 ============
   把你自己的曲子加进下面的 CUSTOM_SONGS 列表里，保存后刷新页面，
   曲目下拉框里就会出现，练习模式直接能选。

   推荐用「简易写法」：按顺序写音名，每个音默认占 1 拍；
   想让某个音占 N 拍，写成 "音名:N"；"R:N" 表示休止 N 拍。
   音名格式：字母 C D E F G A B + 升降号（# 或 b）+ 八度数字，
   例如 C4=中央C、C#4=升C4、Bb3=降B3。

   示例：
   { name: '我的小曲', bpm: 100, seq: ['C4','C4','G4','G4','A4:2','R:1','G4:2'] }

   也支持完整写法（m=MIDI 音高，t=起始拍，d=时值拍）：
   { name: '另一首', bpm: 120, notes: [{m:60,t:0,d:1},{m:62,t:1,d:2}] }
   常用 MIDI：C4=60 D4=62 E4=64 F4=65 G4=67 A4=69 B4=71 C5=72
==================================================== */
(function (global) {
  'use strict';

  var CUSTOM_SONGS = [
    // ↓↓↓ 把前面的 // 去掉并改成你的曲子即可，可加任意多首 ↓↓↓
    // { name: '我的小曲', bpm: 100, seq: ['C4','C4','G4','G4','A4:2','R:1','G4:2'] }
  ];

  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function noteNameToMidi(name) {
    var m = /^([A-Ga-g])(#|b)?(-?\d)$/.exec(String(name).trim());
    if (!m) return null;
    var semi = SEMI[m[1].toUpperCase()];
    if (m[2] === '#') semi++;
    else if (m[2] === 'b') semi--;
    var oct = parseInt(m[3], 10);
    return (oct + 1) * 12 + semi;
  }

  function normalize(song) {
    if (!song || !song.name) return null;
    var out = { name: song.name, bpm: song.bpm || 100, notes: [] };
    if (song.notes && song.notes.length) {
      out.notes = song.notes.map(function (n) {
        return { m: n.m, t: n.t, d: n.d || 1 };
      });
    } else if (song.seq && song.seq.length) {
      var t = 0;
      song.seq.forEach(function (token) {
        var parts = String(token).split(':');
        var name = parts[0].trim();
        var d = parts[1] ? parseFloat(parts[1]) : 1;
        if (!d || d <= 0) d = 1;
        if (name.toUpperCase() !== 'R') {
          var midi = noteNameToMidi(name);
          if (midi !== null) out.notes.push({ m: midi, t: t, d: d });
        }
        t += d;
      });
    }
    return out.notes.length ? out : null;
  }

  global.PianoCustom = {
    list: CUSTOM_SONGS,
    normalize: normalize,
    noteNameToMidi: noteNameToMidi
  };
})(window);
