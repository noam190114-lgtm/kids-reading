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
    if (r.status === 402 || /paid_plan_required/i.test(body)) { const e = new Error('Free plan cannot use this library voice via the API (needs a paid plan): ' + voiceId); e.skipVoice = true; throw e; }
    if (/voice_not_found|not found/i.test(body)) throw new Error('Voice not available to this API key. Add it to "My Voices" in ElevenLabs (Voice Library → Add) and run again. ' + body);
    throw new Error(`TTS failed (${r.status}): ${body}`);
  }
  throw new Error('TTS kept failing after retries');
}

// VOICES entries: "Name=VOICE_ID:gender" (gender optional), a bare VOICE_ID, or a voice name from your account.
let all = [];
try { all = await listVoices(); console.log('Voices in your ElevenLabs account:', all.map(v => v.name).join(', ')); }
catch (e) { console.warn(e.message); }
const isId = x => /^[A-Za-z0-9]{20}$/.test(x);
const chosen = (WANT.length ? WANT : all.slice(0, 4).map(v => v.voice_id)).map(entry => {
  let [name, rest] = entry.includes('=') ? entry.split('=') : [null, entry];
  let [id, gender] = (rest || '').split(':');
  if (!isId(id)) {
    const v = all.find(x => x.name.toLowerCase() === id.toLowerCase()) || all.find(x => x.name.toLowerCase().startsWith(id.toLowerCase()));
    if (!v) { console.warn(`Voice "${entry}" not found – skipped.`); return null; }
    return { voice_id: v.voice_id, name: name || v.name, labels: { gender: gender || v.labels?.gender } };
  }
  const v = all.find(x => x.voice_id === id);
  return { voice_id: id, name: name || v?.name || id, labels: { gender: gender || v?.labels?.gender || '' } };
}).filter(Boolean);

let made = 0;
for (const v of chosen) {
  const name = v.name.split(/\s+-\s+|\s*\(/)[0].trim();
  const slug = 'v-' + v.voice_id.slice(0, 8).toLowerCase();
  const dir = path.join('audio', slug);
  if (REDO.some(n => n.toLowerCase() === name.toLowerCase())) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let entry = manifest.voices.find(x => x.slug === slug);
  if (!entry) { entry = { slug, name, gender: v.labels?.gender || '', files: {} }; manifest.voices.push(entry); }
  entry.files = {};
  let skip = false;
  for (const it of items) {
    const f = path.join(dir, fileFor(it.key));
    if (!fs.existsSync(f)) {
      let audio;
      try { audio = await tts(v.voice_id, it.text); }
      catch (e) { if (e.skipVoice) { console.warn(`${name}: ${e.message}`); skip = true; break; } throw e; }
      fs.writeFileSync(f, audio);
      made++;
      console.log(`${name}: ${it.key}`);
      await sleep(250);
    }
    entry.files[it.key] = `${slug}/${path.basename(f)}`;
  }
  if (skip) { manifest.voices = manifest.voices.filter(x => x !== entry); fs.rmSync(dir, { recursive: true, force: true }); }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
}
console.log(`Done. ${made} new audio files.`);
