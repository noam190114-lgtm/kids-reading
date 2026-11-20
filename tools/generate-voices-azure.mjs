// Generates narrator audio with Microsoft Azure Speech (Hebrew neural voices: Hila, Avri).
// Runs inside GitHub Actions (see .github/workflows/voices-azure.yml).
// Needs the AZURE_SPEECH_KEY and AZURE_SPEECH_REGION secrets.
// Only creates files that don't exist yet, so re-running is cheap.
// The free (F0) tier allows ~20 requests a minute, so a full run takes a while.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY = process.env.AZURE_SPEECH_KEY;
const REGION = (process.env.AZURE_SPEECH_REGION || '').trim().toLowerCase().replace(/\s+/g, '');
const RATE = process.env.RATE || '-8%';               // a little slower = easier for young readers
const GAP = +(process.env.GAP_MS || 3100);            // pace requests for the free tier (20 / minute)
const VOICES = (process.env.VOICES || 'הילה=he-IL-HilaNeural:female,אברי=he-IL-AvriNeural:male')
  .split(',').map(s => s.trim()).filter(Boolean).map(e => {
    const [name, rest] = e.split('='); const [id, gender] = rest.split(':');
    return { name, id, gender: gender || '' };
  });
const REDO = (process.env.REDO || '').split(',').map(s => s.trim()).filter(Boolean);
if (!KEY || !REGION) { console.error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION secret.'); process.exit(1); }

const URL_TTS = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
const items = JSON.parse(fs.readFileSync('audio/items.json', 'utf8'));
const manifestPath = 'audio/voices.json';
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { voices: [] };
const fileFor = k => crypto.createHash('sha1').update(k).digest('hex').slice(0, 12) + '.mp3';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const xml = s => String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

async function tts(voice, text) {
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="he-IL"><voice name="${voice}"><prosody rate="${RATE}">${xml(text)}</prosody></voice></speak>`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const r = await fetch(URL_TTS, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'kids-reading',
      },
      body: ssml,
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const body = await r.text();
    if (r.status === 429 || r.status >= 500) {
      const wait = (+r.headers.get('retry-after') || 10 * attempt) * 1000;
      console.warn(`Busy (${r.status}), waiting ${wait / 1000}s`); await sleep(wait); continue;
    }
    if (r.status === 401) throw new Error('Azure rejected the key (401). Check AZURE_SPEECH_KEY and that AZURE_SPEECH_REGION matches the resource region (e.g. westeurope).');
    if (r.status === 403) throw new Error('Azure refused (403) – the free monthly quota may be used up. ' + body);
    throw new Error(`TTS failed (${r.status}): ${body}`);
  }
  throw new Error('TTS kept failing after retries');
}

let made = 0;
const ours = [];
for (const v of VOICES) {
  const slug = 'v-az-' + v.id.replace(/^he-IL-|Neural$/g, '').toLowerCase();
  const dir = path.join('audio', slug);
  if (REDO.includes(v.name)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let entry = manifest.voices.find(x => x.slug === slug);
  if (!entry) entry = { slug, name: v.name, gender: v.gender, files: {} };
  manifest.voices = manifest.voices.filter(x => x !== entry);
  ours.push(entry);
  entry.files = {};
  for (const it of items) {
    const f = path.join(dir, fileFor(it.key));
    if (!fs.existsSync(f)) {
      fs.writeFileSync(f, await tts(v.id, it.text));
      made++; console.log(`${v.name}: ${it.key}`);
      await sleep(GAP);
    }
    entry.files[it.key] = `${slug}/${path.basename(f)}`;
  }
  // save progress after each voice, so a stopped run keeps what it made
  manifest.voices = [...ours, ...manifest.voices];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  manifest.voices = manifest.voices.filter(x => !ours.includes(x));
}
manifest.voices = [...ours, ...manifest.voices];   // Azure voices first = the game's default narrator
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(`Done. ${made} new audio files.`);
