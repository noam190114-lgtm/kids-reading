# Generates narrator audio with the Hebrew neural voices (Hila, Avri) through the
# free edge-tts tool (the read-aloud voices of Microsoft Edge). No account or key needed.
# Runs inside GitHub Actions (see .github/workflows/voices-edge.yml).
# Only creates files that don't exist yet, so re-running is cheap.
import asyncio, hashlib, json, os, re, sys
import edge_tts

RATE = os.environ.get('RATE', '+0%')

# Words and sentences are read WITHOUT niqqud: the voices then use their own Hebrew knowledge and
# put the stress in the right place (mostly on the last syllable). Niqqud is kept only where it is
# needed: single syllables (syl:, ds:), vowel sounds like "אַ", and words that are ambiguous without it.
# Words that look different in full spelling are written that way (מטה -> מיטה).
PLENE = {'מלה': 'מילה', 'במלה': 'במילה', 'המלה': 'המילה', 'נקדה': 'נקודה', 'נקדות': 'נקודות',
         'תעלם': 'תיעלם', 'לטיל': 'לטייל', 'שחק': 'שיחק', 'והקבוץ': 'והקובוץ', 'השוא': 'השווא',
         'מטה': 'מיטה', 'חטה': 'חיטה', 'שנים': 'שיניים', 'צפור': 'ציפור', 'כנור': 'כינור', 'קפוד': 'קיפוד',
         'כסא': 'כיסא', 'אזן': 'אוזן', 'אהל': 'אוהל', 'דבי': 'דובי', 'סכריה': 'סוכרייה', 'מטריה': 'מטרייה',
         'עפרון': 'עיפרון', 'מכנסים': 'מכנסיים', 'משקפים': 'משקפיים', 'עינים': 'עיניים'}
KEEP = {'א', 'אי', 'או', 'שרה', 'מלון'}  # keep these exactly as written, with niqqud
NIQ = re.compile('[\u0591-\u05C7]')


def speakable(key, text):
    if key.split(':')[0] in ('syl', 'ds'):
        return text
    def tok(m):
        t = m.group(0); bare = NIQ.sub('', t)
        return t if bare in KEEP else PLENE.get(bare, bare)
    return re.sub('[א-ת][א-ת\u0591-\u05C7]*', tok, text)
VOICES = [
    {'slug': 'v-hila', 'name': 'הילה', 'gender': 'female', 'id': 'he-IL-HilaNeural'},
    {'slug': 'v-avri', 'name': 'אברי', 'gender': 'male', 'id': 'he-IL-AvriNeural'},
]
items = json.load(open('audio/items.json', encoding='utf8'))
mpath = 'audio/voices.json'
manifest = json.load(open(mpath, encoding='utf8')) if os.path.exists(mpath) else {'voices': []}
file_for = lambda k: hashlib.sha1(k.encode('utf8')).hexdigest()[:12] + '.mp3'


async def tts(voice, text, out):
    for attempt in range(1, 6):
        try:
            await edge_tts.Communicate(text, voice, rate=RATE).save(out + '.tmp')
            if os.path.getsize(out + '.tmp') < 500:
                raise RuntimeError('audio too short')
            os.replace(out + '.tmp', out)
            return
        except Exception as e:  # network hiccups: wait and retry
            print(f'retry {attempt} for {text!r}: {e}', file=sys.stderr)
            await asyncio.sleep(3 * attempt)
    raise RuntimeError(f'failed: {text!r}')


def save(entries):
    others = [v for v in manifest['voices'] if v['slug'] not in {e['slug'] for e in entries}]
    manifest['voices'] = entries + others  # our voices first = the game's default narrator
    json.dump(manifest, open(mpath, 'w', encoding='utf8'), ensure_ascii=False, indent=1)


async def main():
    made, entries = 0, []
    for v in VOICES:
        d = os.path.join('audio', v['slug'])
        if os.environ.get('REDO') == 'yes':  # re-record everything (e.g. after changing how text is read)
            import shutil; shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d, exist_ok=True)
        entry = {'slug': v['slug'], 'name': v['name'], 'gender': v['gender'], 'files': {}}
        entries.append(entry)
        for it in items:
            f = os.path.join(d, file_for(it['key']))
            if not os.path.exists(f):
                await tts(v['id'], speakable(it['key'], it['text']), f)
                made += 1
                print(v['name'], it['key'])
                await asyncio.sleep(0.3)
            entry['files'][it['key']] = f"{v['slug']}/{os.path.basename(f)}"
        save(entries)  # keep progress after each voice
    print(f'Done. {made} new audio files.')

asyncio.run(main())
