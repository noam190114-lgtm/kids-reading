# Builds compare.html: the same words read by several narrator setups, so a person can
# pick the one with natural Hebrew stress (most words are stressed on the last syllable).
# Runs in GitHub Actions (.github/workflows/voices-compare.yml). No keys needed.
import asyncio, json, os, re, subprocess, sys, traceback, urllib.request
import edge_tts

OUT = 'compare'
os.makedirs(OUT, exist_ok=True)
SAMPLES = ['מְכוֹנִית', 'עַכָּבִישׁ', 'צִפּוֹר', 'תַּרְנְגוֹל', 'מִכְתָּב', 'שׁוֹפָר',
           'הַכַּדּוּר נָפַל לְתוֹךְ כּוֹס קָפֶה!', 'אַרְנָב קָטָן יָצָא לְטַיֵּל.']
plain = lambda t: re.sub('[֑-ׇ]', '', t)
rows = {s: {} for s in SAMPLES}
labels = {}


async def edge(tag, label, voice, rate, strip):
    labels[tag] = label
    for i, s in enumerate(SAMPLES):
        f = f'{OUT}/{tag}-{i}.mp3'
        try:
            await edge_tts.Communicate(plain(s) if strip else s, voice, rate=rate).save(f)
            rows[s][tag] = f
        except Exception as e:
            print(tag, s, e, file=sys.stderr)

asyncio.run(edge('A', 'הילה – כמו היום (עם ניקוד, איטי)', 'he-IL-HilaNeural', '-8%', False))
asyncio.run(edge('B', 'הילה – בלי ניקוד, קצב רגיל', 'he-IL-HilaNeural', '+0%', True))
asyncio.run(edge('C', 'אברי – בלי ניקוד, קצב רגיל', 'he-IL-AvriNeural', '+0%', True))

# the ElevenLabs narrator we already have (Sara), where a recording exists
try:
    v = json.load(open('audio/voices.json', encoding='utf8'))['voices']
    sara = next(x for x in v if x['slug'] == 'v-exavitqu')
    labels['E'] = 'שרה – הקריינית הקיימת'
    for s in SAMPLES:
        for k in ('w:' + s, 'st:' + s):
            if k in sara['files']:
                rows[s]['E'] = 'audio/' + sara['files'][k]
except Exception:
    traceback.print_exc()

# Phonikud: open-source Hebrew engine that marks the stress explicitly
try:
    from phonikud_onnx import Phonikud
    from phonikud import phonemize
    from piper_onnx import Piper
    import soundfile as sf

    def get(url, path):
        if not os.path.exists(path):
            urllib.request.urlretrieve(url, path)
        return path
    nik = Phonikud(get('https://huggingface.co/thewh1teagle/phonikud-onnx/resolve/main/phonikud-1.0.int8.onnx', 'phonikud.onnx'))
    repo = 'Phonikud/phonikud-tts-checkpoints'
    files = [x['rfilename'] for x in json.load(urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}'))['siblings']]
    print('checkpoint files:', files)
    models = [f for f in files if f.endswith('.onnx')]
    for n, m in enumerate(models[:3]):
        cfg = next((c for c in files if c.endswith('.json') and (c.startswith(m[:-5]) or c == m + '.json')), None) \
            or next((c for c in files if c.endswith('config.json')), None)
        if not cfg:
            continue
        base = f'https://huggingface.co/{repo}/resolve/main/'
        piper = Piper(get(base + m, f'm{n}.onnx'), get(base + cfg, f'm{n}.json'))
        tag = f'P{n}'
        labels[tag] = f'מנוע עברי פתוח עם הטעמה ({os.path.basename(m)[:-5]})'
        for i, s in enumerate(SAMPLES):
            try:
                ph = phonemize(nik.add_diacritics(plain(s)))
                samples, sr = piper.create(ph, is_phonemes=True)
                w = f'{OUT}/{tag}-{i}.wav'
                sf.write(w, samples, sr)
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', w, '-b:a', '96k', w[:-4] + '.mp3'], check=True)
                os.remove(w)
                rows[s][tag] = w[:-4] + '.mp3'
                print(tag, s, ph)
            except Exception as e:
                print(tag, s, e, file=sys.stderr)
except Exception:
    traceback.print_exc()

order = [t for t in ['A', 'E', 'B', 'C', 'P0', 'P1', 'P2'] if t in labels]
letters = 'אבגדהוז'
html = ['<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>השוואת קריינים</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:auto;padding:12px;background:#fdf6ec}',
        'h1{font-size:24px}.w{background:#fff;border-radius:16px;padding:10px 14px;margin:12px 0;box-shadow:0 2px 6px #0001}',
        '.t{font-size:28px;font-weight:800}.r{display:flex;align-items:center;gap:8px;margin:6px 0}.r b{min-width:28px;font-size:20px}',
        'audio{height:36px;flex:1}.k{background:#fff;border-radius:16px;padding:10px 14px}</style></head><body>',
        '<h1>🎧 איזה קריין נשמע הכי טבעי?</h1><div class="k">']
for n, t in enumerate(order):
    html.append(f'<div><b>{letters[n]}</b> – {labels[t]}</div>')
html.append('</div>')
for s in SAMPLES:
    html.append(f'<div class="w"><div class="t">{s}</div>')
    for n, t in enumerate(order):
        if t in rows[s]:
            html.append(f'<div class="r"><b>{letters[n]}</b><audio controls preload="none" src="{rows[s][t]}"></audio></div>')
    html.append('</div>')
html.append('</body></html>')
open('compare.html', 'w', encoding='utf8').write('\n'.join(html))
print('labels', labels)
