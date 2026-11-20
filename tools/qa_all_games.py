# בדיקה אוטומטית: משחק בכל השלבים ובכל המשחקים עד הסוף ובודק שאין תקלות.
# הרצה: python3 tools/qa_all_games.py  (צריך playwright)
import json, subprocess, time, sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d",__import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__)))],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
INIT="""
(()=>{const st=window.setTimeout;window.setTimeout=(f,ms,...a)=>st(f,Math.min(ms||0,2000)/20,...a);
window.__said=[];})();
"""
HOOK="""
(()=>{const orig=say;window.say=function(k,t,r){__said.push({k,t,clip:hasClip(k),act:S.act,stage:S.stage});return orig(k,t,r)};
const os=sayIns;window.sayIns=function(t){return os(t)};})()
"""
PLAY="""async ()=>{
const sleep=ms=>new Promise(r=>setTimeout(r,ms*20));const W=()=>sleep(120);
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const log=[];let guard=0;
// press every visible speaker / say button once
const pressSpeakers=()=>qa('[data-a=sayk],[data-a=sayintro],[data-a=replay]').forEach(b=>b.click());
if(S.act==='learn'){pressSpeakers();return {ok:true,learn:true}}
if(S.act==='story'){qa('[data-a=sline]').forEach(b=>b.click());q('[data-a=storygo]').click();await W();}
let wrongDone=false;
while(!S.done&&guard++<80){
  const r=S.round;pressSpeakers();
  if(!r){log.push('no round');break}
  if(r.kind==='flash'&&!r.hidden){await sleep(r.ms/20+200);continue}
  if(r.kind==='build'){
    for(let i=r.filled;i<r.syl.length;i++){const t=r.tiles.find(t=>!t.used&&t.s===r.syl[i]);const b=q(`[data-a=tile][data-i="${t.i}"]`);if(!b){log.push('tile missing');break}b.click();}
    await W();continue}
  if(r.kind==='memory'){
    for(let p=0;p<6;p++){const cs=r.cards.filter(c=>c.p===p);for(const c of cs){const b=q(`[data-a=mem][data-i="${c.i}"]`);b.click()}await sleep(5)}
    await W();continue}
  const btns=qa('[data-a=pick]');
  if(!btns.length){log.push('no answer buttons for '+r.kind+' q'+S.q);break}
  const right=btns.find(b=>b.dataset.v===r.answer);
  if(!right){log.push('answer not among buttons: '+r.kind+' '+r.answer);break}
  if(!wrongDone){const w=btns.find(b=>b!==right);if(w){w.click();wrongDone=true}}
  const before=S.q+':'+(S.storyQ??'');
  right.click();
  if(!S.locked&&r.kind!=='memory'){log.push('click on correct answer ignored: '+r.kind+' q'+S.q);break}
  await W();
  if(!S.done&&S.q+':'+(S.storyQ??'')===before){log.push('did not advance after correct answer: '+r.kind);break}
}
return {ok:S.done&&!log.length,done:S.done,log,stars:S.lastStars,qs:S.q}
}"""
res=[];errs=[]
with sync_playwright() as p:
  b=p.chromium.launch()
  for narr in ["ai","tts"]:
    pg=b.new_page();pg.add_init_script(INIT)
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto("http://localhost:8765/index.html");pg.wait_for_function("AIV.length>0",timeout=8000)
    if narr=="tts":pg.evaluate("P.narrator='tts';P.narratorSet=true")
    pg.evaluate(HOOK)
    stages=pg.evaluate("STAGES.length")
    for s in range(stages+1):
      acts=["mix"] if s==stages else pg.evaluate(f"actsFor({s}).map(a=>a.id)")
      for a in acts:
        for rep in range(2):
          if a=="mix":pg.evaluate("S.stage=MIX;openAct('mix')")
          else:pg.evaluate(f"openStage({s});openAct('{a}')")
          r=pg.evaluate(PLAY);r.update(stage=s,act=a,narr=narr,rep=rep);res.append(r)
    said=pg.evaluate("__said")
    json.dump(said,open(f"/tmp/said_{narr}.json","w"),ensure_ascii=False)
    pg.close()
  b.close()
srv.terminate()
json.dump(res,open("/tmp/res.json","w"),ensure_ascii=False)
bad=[r for r in res if not r["ok"]]
print("runs",len(res),"failed",len(bad))
for r in bad:print(r)
print("js errors",errs[:10])
