// Generates human-sounding narrator audio for the game with ElevenLabs.
// Runs inside GitHub Actions (see .github/workflows/voices.yml).
// Needs the ELEVENLABS_API_KEY secret. Only creates files that don't exist yet,
// so re-running is cheap and adding a new voice only costs that voice's credits.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY = process.env.ELEVENLABS_API_KEY;
const WANT = (process.env.VOICES || '').split(',').map(s => s.trim()).filter(Boolean);
const MODEL = process.env.MODEL || 'eleven_v3';
const REDO = (process.env.REDO || '').split(',').map(s => s.trim()).filter(Boolean); // voice names to regenerate from scratch
if (!KEY) { console.error('Missing ELEVENLABS_API_KEY secret.'); process.exit(1); }

const API = 'https://api.elevenlabs.io/v1';
const H = { 'xi-api-key': KEY };
const items = JSON.parse(fs.readFileSync('audio/items.json', 'utf8'));
const manifestPath = 'audio/voices.json';
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { voices: [] };

const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'voice';
const fileFor = k => crypto.createHash('sha1').update(k).digest('hex').slice(0, 12) + '.mp3';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function listVoices() {
  const r = await fetch(`${API}/voices`, { headers: H });
  if (!r.ok) throw new Error(`Could not list voices (${r.status}): ${await r.text()}`);
  return (await r.json()).voices;
}

let useLang = true;
async function tts(voiceId, text) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(useLang ? { text, model_id: MODEL, language_code: 'he' } : { text, model_id: MODEL }),
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const body = await r.text();
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * attempt); continue; }
    if (useLang && /language/i.test(body)) { useLang = false; continue; }
    if (/quota|credits/i.test(body)) throw new Error('Out of ElevenLabs credits for this month: ' + body);
    throw new Error(`TTS failed (${r.status}): ${body}`);
  }
  throw new Error('TTS kept failing after retries');
}

const all = await listVoices();
console.log('Voices in your ElevenLabs account:', all.map(v => v.name).join(', '));
const chosen = WANT.length ? WANT.map(n => {
  const v = all.find(x => x.name.toLowerCase() === n.toLowerCase()) || all.find(x => x.name.toLowerCase().startsWith(n.toLowerCase()));
  if (!v) console.warn(`Voice "${n}" not found in your account – skipped.`);
  return v;
}).filter(Boolean) : all.slice(0, 4);

let made = 0;
for (const v of chosen) {
  const name = v.name.split(/\s+-\s+|\s*\(/)[0].trim();
  const slug = slugify(name) + '-' + v.voice_id.slice(0, 4).toLowerCase();
  const dir = path.join('audio', slug);
  if (REDO.some(n => n.toLowerCase() === name.toLowerCase())) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let entry = manifest.voices.find(x => x.slug === slug);
  if (!entry) { entry = { slug, name, gender: v.labels?.gender || '', files: {} }; manifest.voices.push(entry); }
  entry.files = {};
  for (const it of items) {
    const f = path.join(dir, fileFor(it.key));
    if (!fs.existsSync(f)) {
      fs.writeFileSync(f, await tts(v.voice_id, it.text));
      made++;
      console.log(`${name}: ${it.key}`);
      await sleep(250);
    }
    entry.files[it.key] = `${slug}/${path.basename(f)}`;
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
}
console.log(`Done. ${made} new audio files.`);
