# -*- coding: utf-8 -*-
"""
简谱文本 -> 直接写入 js/songs.js

用法:
  python jianpu2song.py song.txt               直接追加写入 js/songs.js
  python jianpu2song.py song.txt --print       只打印 JS, 不写文件
  python jianpu2song.py song.txt --out 路径    写入指定 js 文件

文本格式:
  头部三行:  name=晴天(完整版)
             key=qingtian
             bpm=72
  之后每行一小节, 也可用 | 分隔小节; 4/4 拍, 每小节正好 4 拍(不是 4 拍会报警)。

音符记号(以 1 为例):
  1        四分音符     1 拍
  1_       八分音符     1/2 拍
  1__      十六分音符   1/4 拍
  1-       二分音符     2 拍
  1--      附点二分     3 拍
  1---     全音符       4 拍
  1.       附点四分     1.5 拍
  1_.      附点八分     0.75 拍
  1'       高八度       1'' 高两个八度
  1,       低八度       1,, 低两个八度
  4#  5b   升号/降号(黑键), 写在数字后
  0        休止符, 时值写法同上

和弦(多个键一起按, 游戏里会用线连起来):
  1+3+5        中音 1/3/5 同时弹, 四分
  1+3+5_       三个音同时弹, 八分
  1,+3+5,      每个音可各自带八度、升降号, 时值统一取最后一个音的记号

示例:
  name=和弦小片段
  key=chorddemo
  bpm=100
  1+3+5 2 1+3+5 2
  1+3+5_- 0 0
"""
import sys, re
from pathlib import Path

DEG = {1: 60, 2: 62, 3: 64, 4: 65, 5: 67, 6: 69, 7: 71}
TOKEN = re.compile(r'^([0-7])([#b]?)([,\']*)([-_=.]*)$')


def parse_single(tok):
    m = TOKEN.match(tok)
    if not m:
        raise ValueError('无法识别的记号: %s' % tok)
    deg, acc, octv, dur = m.groups()
    deg = int(deg)
    beats = 1.0
    beats *= 0.5 ** dur.count('_')
    beats += dur.count('-')
    beats += 0.5 * dur.count('=')
    for _ in range(dur.count('.')):
        beats *= 1.5
    if deg == 0:
        return None, beats
    midi = DEG[deg] + 12 * (octv.count("'") - octv.count(','))
    if acc == '#':
        midi += 1
    elif acc == 'b':
        midi -= 1
    return midi, beats


def parse_token(tok):
    """返回 (midi列表, 时值)。midi 列表长度>1 即和弦。"""
    if '+' not in tok:
        midi, beats = parse_single(tok)
        return [midi], beats
    parts = tok.split('+')
    # 时值记号统一写在最后一个音后面，其余音只写音高和八度/升降
    beat_tok = re.match(r'^[0-7][#b]?[,\']*([-_=.]*)$', parts[-1])
    beats = parse_single(parts[-1])[1]
    if not beat_tok:
        raise ValueError('无法识别的和弦记号: %s' % tok)
    midis = []
    for i, p in enumerate(parts):
        pp = p if i == len(parts) - 1 else re.sub(r'[-_=.]+$', '', p)
        m, d = parse_single(pp)
        if m is None:
            raise ValueError('和弦里不能写休止符 0: %s' % tok)
        if i != len(parts) - 1 and abs(d - 1.0) > 1e-9:
            print('  [警告] 和弦时值只认最后一个音，已忽略 %s 上的时值' % p)
        midis.append(m)
    return midis, beats


def parse_text(text):
    meta = {'name': '未命名', 'key': 'mysong', 'bpm': 100}
    bars = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        mm = re.match(r'^(name|key|bpm)\s*=\s*(.+)$', line)
        if mm:
            meta[mm.group(1)] = mm.group(2).strip()
            continue
        for chunk in line.split('|'):
            toks = chunk.split()
            if not toks:
                continue
            bar, total = [], 0.0
            for t in toks:
                midis, beats = parse_token(t)
                bar.append((midis, beats))
                total += beats
            if abs(total - 4.0) > 1e-6:
                print('  [警告] 小节 %d 共 %g 拍, 不是 4 拍: %s'
                      % (len(bars) + 1, total, ' '.join(toks)))
            bars.append(bar)
    meta['bpm'] = int(meta['bpm'])
    return meta, bars


def build_js(meta, bars):
    items, t, cid = [], 0.0, 0
    for bar in bars:
        for midis, beats in bar:
            if len(midis) >= 2:
                cid += 1
                for m in midis:
                    items.append('        {m:%d,t:%g,d:%g,c:%d}' % (m, round(t, 3), round(beats, 3), cid))
            elif midis[0] is not None:
                items.append('        {m:%d,t:%g,d:%g}' % (midis[0], round(t, 3), round(beats, 3)))
            t += beats
    return ("    %s: {\n      name: '%s',\n      bpm: %d,\n      notes: [\n"
            % (meta['key'], meta['name'], meta['bpm'])
            + ',\n'.join(items) + "\n      ]\n    }")


def inject(block, path, key):
    js = path.read_text(encoding='utf-8')
    if re.search(r'^\s*%s\s*:' % re.escape(key), js, re.M):
        print('[跳过] %s 里已存在 key=%s' % (path, key))
        return False
    m = re.search(r'    \},?\s*\n  \};', js)
    if not m:
        print('[失败] 找不到 SONGS 对象结尾，请用 --print 手动复制')
        return False
    js = js[:m.start()] + '    },\n\n' + block + '\n  };' + js[m.end():]
    path.write_text(js, encoding='utf-8', newline='')
    return True


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    src = Path(sys.argv[1])
    meta, bars = parse_text(src.read_text(encoding='utf-8-sig'))
    block = build_js(meta, bars)
    n = sum(1 for b in bars for ms, _ in b for m in ms if m is not None)
    ch = sum(1 for b in bars for ms, _ in b if len(ms) >= 2)
    print('共 %d 小节, %d 个音, %d 个和弦, 时长约 %g 秒'
          % (len(bars), n, ch,
             round(sum(d for b in bars for _, d in b) / meta['bpm'] * 60, 1)))

    if '--print' in sys.argv:
        print(block)
        return
    if '--out' in sys.argv:
        target = Path(sys.argv[sys.argv.index('--out') + 1])
    else:
        target = Path(__file__).resolve().parent / 'js' / 'songs.js'
    if inject(block, target, meta['key']):
        print('[完成] 已写入 %s' % target)
        print('请把 index.html 里的 ?v= 加 1 再 Ctrl+F5 强刷')


if __name__ == '__main__':
    main()
