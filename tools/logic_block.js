/* ---------- state ---------- */
const MIX=STAGES.length; // virtual "mixed challenge" stage
const S={view:'map',stage:0,act:null,q:0,mistakes:0,round:null,decks:{}};
const ACTS=[
 {id:'learn',icon:'👀',name:'הֶכֵּרוּת',sub:'פּוֹגְשִׁים אֶת הַתְּנוּעָה'},
 {id:'listen',icon:'👂',name:'שְׁמַע וּבְחַר',n:8},
 {id:'read',icon:'🖼️',name:'קְרָא וּבְחַר תְּמוּנָה',n:8},
 {id:'build',icon:'🧩',name:'בְּנֵה מִלָּה',n:5},
 {id:'story',icon:'📖',name:'סִפּוּר קָצָר',n:3},
 {id:'spell',icon:'🔍',name:'אֵיזוֹ מִלָּה נְכוֹנָה?',n:8,hard:1},
 {id:'missing',icon:'✏️',name:'הַשְׁלֵם אֶת הַחָסֵר',n:6,hard:1},
 {id:'sort',icon:'🎯',name:'אֵיזוֹ תְּנוּעָה?',n:8,hard:1,min:1},
 {id:'flash',icon:'⚡',name:'קְרִיאָה מְהִירָה',n:8,hard:1},
 {id:'memory',icon:'🃏',name:'מִשְׂחַק זִכָּרוֹן',n:6,hard:1}
];
const MIX_KINDS=['spell','missing','flash','read','sort'];
const actDef=id=>id==='mix'?{id:'mix',icon:'🏆',name:'אֶתְגָּר מְעֹרָב',n:12}:ACTS.find(a=>a.id===id);
const actsFor=i=>ACTS.filter(a=>!(a.min&&i<a.min));
const app=document.getElementById('app');
const starKey=(i,a)=>i+':'+a;
const starsOf=(i,a)=>(P.acts&&P.acts[starKey(i,a)])||0;
function stageStars(i){return actsFor(i).filter(a=>a.n).reduce((t,a)=>t+starsOf(i,a.id),0)}
const stageMax=i=>actsFor(i).filter(a=>a.n).length*3;
function totalStars(){return Object.values(P.acts||{}).reduce((a,b)=>a+b,0)}

/* ---------- words & distractors ---------- */
const ALLW=STAGES.flatMap(s=>s.words);
const curWords=()=>S.stage===MIX?ALLW:STAGES[S.stage].words;
const sounds=()=>STAGES.slice(0,Math.min(S.stage,MIX-1)+1).filter(s=>s.sound).map(s=>s.sound);
function draw(key,pool){if(!S.decks[key]||!S.decks[key].length)S.decks[key]=shuffle(pool);return S.decks[key].pop()}
function pickWord(f){
  f=f||(()=>true);
  const cur=curWords().filter(f),rev=(S.stage>0&&S.stage<MIX)?wordsUpTo(S.stage-1).filter(f):[];
  const useRev=rev.length&&(Math.random()<.3||!cur.length);
  return draw((useRev?'r:':'c:')+S.act+':'+f.name,useRev?rev:cur);
}
const MK={'ָ':'a','ַ':'a','ֲ':'a','ִ':'i','ֹ':'o','ֵ':'e','ֶ':'e','ֻ':'u','ְ':'shva'};
const NUC={a:'ַ',i:'ִ',o:'וֹ',e:'ֶ',u:'וּ'};
const SND_LABEL={a:'אַ',i:'אִי',o:'אוֹ',e:'אֶ',u:'אוּ'};
function parseSyl(s){
  let i=1,marks='';while(i<s.length&&/[֑-ׇ]/.test(s[i])){marks+=s[i];i++}
  const v=[...marks].find(c=>MK[c]),other=[...marks].filter(c=>!MK[c]).join(''),rest=s.slice(i);
  if(v)return{head:s[0]+other,nuc:v,snd:MK[v],tail:rest};
  if(rest.startsWith('וֹ'))return{head:s[0]+other,nuc:'וֹ',snd:'o',tail:rest.slice(2)};
  if(rest.startsWith('וּ'))return{head:s[0]+other,nuc:'וּ',snd:'u',tail:rest.slice(2)};
  return{head:s[0]+other,nuc:'',snd:null,tail:rest};
}
const LOOK={'ב':'כ','כ':'ב','ד':'ר','ר':'ד','ה':'ח','ח':'ה','ת':'ח','ג':'נ','נ':'ג','מ':'ט','ט':'מ','ס':'ם','ש':'ע','ע':'צ','צ':'ע','פ':'כ','ק':'ה','ל':'ך','י':'ו','ו':'ז','ז':'ו','א':'ע'};
function sylVariants(s){
  const p=parseSyl(s),out=[];
  if(p.snd&&p.snd!=='shva')sounds().forEach(x=>{if(x!==p.snd)out.push(p.head+NUC[x]+p.tail)});
  const c=s[0];if(LOOK[c]){const keep=[...p.head.slice(1)].filter(m=>m!=='ׁ'&&m!=='ׂ').join('');out.push(LOOK[c]+keep+p.nuc+p.tail)}
  return [...new Set(out)].filter(x=>x!==s);
}
function wordVariants(w,n){
  const out=new Set();
  w[2].forEach((s,i)=>sylVariants(s).forEach(v=>{const a=w[2].slice();a[i]=v;out.add(a.join(''))}));
  out.delete(w[0]);ALLW.forEach(x=>out.delete(x[0]));
  return shuffle([...out]).slice(0,n);
}

/* ---------- rounds ---------- */
function makeListen(){
  const st=STAGES[S.stage];
  if(!st.sound){
    const t=pickWord(x=>canSay(wordKey(x[0])))||rnd(st.words);
    const rest=shuffle(curWords().filter(w=>w!==t));
    return {kind:'listen',say:t[0],key:wordKey(t[0]),answer:t[0],opts:shuffle([t[0],rest[0][0],rest[1][0]])};
  }
  const sayable=LETTERS.filter(x=>canSay(sylKey(st.sound,x)));
  const v=rnd(st.vowels),L=rnd(sayable.length?sayable:LETTERS),target=v.f(L);
  const learned=STAGES.slice(0,S.stage+1).filter(s=>s.sound),cands=[];
  learned.forEach(s=>{if(s.sound!==st.sound)cands.push({t:rnd(s.vowels).f(L),k:L+s.sound})});
  shuffle(LETTERS.filter(x=>x!==L)).slice(0,3).forEach(x=>cands.push({t:rnd(st.vowels).f(x),k:x+st.sound}));
  const seen=new Set([L+st.sound]),d=[];
  for(const c of shuffle(cands)){if(!seen.has(c.k)){seen.add(c.k);d.push(c.t)}if(d.length===2)break}
  return {kind:'listen',say:SAY[st.sound](L),key:sylKey(st.sound,L),answer:target,opts:shuffle([target,...d])};
}
function pictureOpts(t,n){
  const pool=S.stage===MIX?ALLW:wordsUpTo(S.stage);
  return shuffle([t[1],...shuffle(pool.filter(w=>w[1]!==t[1])).slice(0,n-1).map(o=>o[1])]);
}
function makeRead(){const t=pickWord();return {kind:'read',word:t[0],answer:t[1],opts:pictureOpts(t,S.stage>=2?4:3)}}
function makeBuild(){
  const t=pickWord(function multi(x){return x[2].length>1});
  const extra=shuffle([...new Set([...t[2].flatMap(sylVariants),...curWords().flatMap(w=>w[2])])].filter(s=>!t[2].includes(s))).slice(0,S.stage>=2?3:2);
  return {kind:'build',word:t[0],emoji:t[1],syl:t[2],filled:0,tiles:shuffle([...t[2],...extra]).map((s,i)=>({s,i,used:false}))};
}
function makeSpell(){
  let t,v;for(let k=0;k<20;k++){t=pickWord();v=wordVariants(t,S.stage>=2?3:2);if(v.length>=2)break}
  return {kind:'spell',word:t[0],emoji:t[1],answer:t[0],opts:shuffle([t[0],...v])};
}
function makeMissing(){
  let t,i,v;for(let k=0;k<20;k++){t=pickWord(function multi(x){return x[2].length>1});i=Math.floor(Math.random()*t[2].length);v=shuffle(sylVariants(t[2][i])).slice(0,S.stage>=2?3:2);if(v.length>=2)break}
  return {kind:'missing',word:t[0],emoji:t[1],syl:t[2],gap:i,answer:t[2][i],opts:shuffle([t[2][i],...v])};
}
function makeSort(){
  const t=pickWord(function sortable(x){const p=parseSyl(x[2][0]);return !!p.snd&&p.snd!=='shva'});
  const p=parseSyl(t[2][0]);
  return {kind:'sort',word:t[0],syl:t[2],answer:p.snd,opts:sounds()};
}
function makeFlash(){
  const t=pickWord();
  const ms=S.stage===MIX?1400:Math.max(1300,3000-S.stage*300);
  return {kind:'flash',word:t[0],answer:t[1],opts:pictureOpts(t,4),ms,hidden:false};
}
function makeMemory(){
  const ws=[];for(const w of shuffle(curWords().concat(S.stage>0&&S.stage<MIX?wordsUpTo(S.stage-1):[]))){if(!ws.some(x=>x[1]===w[1]))ws.push(w);if(ws.length===6)break}
  const cards=shuffle(ws.flatMap((w,i)=>[{p:i,t:w[0],w:1},{p:i,t:w[1],w:0}])).map((c,i)=>Object.assign(c,{i,up:false,done:false}));
  return {kind:'memory',cards,open:[],moves:0,pairs:0};
}
function listenPossible(){
  if(heVoice)return true;
  const st=STAGES[S.stage];if(!st)return false;
  return st.sound?LETTERS.filter(x=>hasClip(sylKey(st.sound,x))).length>=3:st.words.filter(w=>hasClip(wordKey(w[0]))).length>=3;
}
function newRound(){
  let k=S.act;
  if(k==='mix'){k=rnd(MIX_KINDS)}
  const m={listen:()=>listenPossible()?makeListen():Object.assign(makeListen(),{kind:'match'}),read:makeRead,build:makeBuild,spell:makeSpell,missing:makeMissing,sort:makeSort,flash:makeFlash,memory:makeMemory};
  S.round=m[k]();S.locked=false;
  if(S.round.kind==='flash')scheduleFlash();
}
let flashTimer=null;
function scheduleFlash(){clearTimeout(flashTimer);const r=S.round;flashTimer=setTimeout(()=>{if(S.round===r&&!S.locked){r.hidden=true;render()}},r.ms)}

/* ---------- views ---------- */
function topBar(title,back){
  return `<div class="top"><button class="iconbtn" data-a="home" aria-label="למפה">🏠</button>${back?`<button class="iconbtn" data-a="back" aria-label="חזרה לשלב">↩️</button>`:''}<h1 class="heb">${title}</h1><span class="pill">⭐ ${totalStars()}</span></div>`;
}
function render(){
  if(S.view==='map')return renderMap();
  if(S.view==='studio')return renderStudio();
  if(S.view==='stage')return renderStage();
  const st=STAGES[S.stage]||{animal:'🏆',title:'אֶתְגָּר מְעֹרָב'},d=actDef(S.act);
  let h=topBar(`${d.icon} ${d.name}`,S.stage!==MIX);
  if(S.act==='learn')h+=renderLearn(st);
  else if(S.done)h+=renderDone(st);
  else if(S.act==='story')h+=renderStory(st);
  else h+=renderGame(st);
  app.innerHTML=h;
}
function renderMap(){
  let h=`<div class="top"><h1>📚 קוראים עם החברים</h1><span class="pill">⭐ ${totalStars()}</span></div>
  <p class="sub heb">בְּחַר חָבֵר וְשַׂחֵק! כָּל הַשְּׁלָבִים פְּתוּחִים.</p><div class="map">`;
  STAGES.forEach((s,i)=>{
    const got=stageStars(i),max=stageMax(i);
    h+=`<button class="stage" data-a="open" data-i="${i}">
      <div class="ani" style="background:${s.color}">${s.animal}</div>
      <div><div class="num">שלב ${i+1} · ${s.guide}</div><div class="ttl heb">${s.title}</div>
      <div class="meter"><i style="width:${Math.round(got/max*100)}%"></i></div><div class="num">⭐ ${got}/${max}</div></div></button>`;
  });
  h+=`<button class="stage mixcard" data-a="mix"><div class="ani" style="background:#ffe9a8">🏆</div>
      <div><div class="num">לְאַלּוּפִים</div><div class="ttl heb">אֶתְגָּר מְעֹרָב</div><div class="num">${'⭐'.repeat(starsOf(MIX,'mix'))}${'☆'.repeat(3-starsOf(MIX,'mix'))} · מִלִּים מִכָּל הַשְּׁלָבִים</div></div></button>`;
  h+=`</div>${renderParent()}`;
  app.innerHTML=h;
}
function renderParent(){
  return `<details class="parent"><summary>👨‍👩‍👧 פינת ההורים</summary>
  <p>סדר השלבים בנוי כמו בהוראת הקריאה בבית הספר: קמץ ופתח (צליל אַ), חיריק, חולם, צירי וסגול, שורוק וקובוץ, ובסוף שווא. כל השלבים פתוחים. בכל שלב יש היכרות, סיפור קצר עם שאלות הבנה, ומשחקי תרגול. המשחקים שמסומנים 🔥 הם אתגר: מילה עם שגיאת כתיב, הברה חסרה, זיהוי תנועה, קריאה מהירה וזיכרון. המילים מתחלפות ולא חוזרות עד שעוברים על כולן, ובכל שלב משולבות גם מילים משלבים קודמים לחזרה.</p>
  <div class="voicebox"><b>🎙️ הקריין</b>
    <div>הכי מדויק לילד שלומד לקרוא: <b>להקליט את הקול שלכם</b>. ${Object.keys(CLIPS).length?`כבר הוקלטו ${Object.keys(CLIPS).length} קטעים.`:''}</div>
    <button class="btn small" data-a="studio">🎙️ פתח את חדר ההקלטות</button>
    <label>מי מקריא: <select data-c="narrator">
      ${AIV.length?`<optgroup label="קריינים מקצועיים">${AIV.map(v=>`<option value="ai:${v.slug}" ${P.narrator==='ai:'+v.slug?'selected':''}>${gIcon(v.gender)} ${esc(v.name)}</option>`).join('')}</optgroup>`:''}
      <optgroup label="קולות שהקלטתם">${P.voices.map(v=>`<option value="rec:${v.id}" ${P.narrator==='rec:'+v.id?'selected':''}>🎙️ ${esc(v.name)} (${voiceCount(v.id)} הקלטות)</option>`).join('')}</optgroup>
      ${HE_VOICES.length?`<optgroup label="קולות המכשיר">${HE_VOICES.map(v=>`<option value="tts:${esc(v.name)}" ${!useRec()&&v===heVoice?'selected':''}>🔊 ${esc(v.name)}</option>`).join('')}</optgroup>`:''}
    </select></label>
    <button class="btn ghost small" data-a="testnarr">נסה ▶</button>
    <div>מה שחסר בקול שנבחר (למשל מילים חדשות וסיפורים) יושמע בקול המכשיר.</div>
  </div>
  ${heVoice?`<div class="voicebox"><b>🔊 קול המכשיר</b>
    <label>קול: <select data-c="voice">${HE_VOICES.map(v=>`<option value="${esc(v.name)}" ${v===heVoice?'selected':''}>${esc(v.name)}</option>`).join('')}</select></label>
    <label>גובה: <select data-c="pitch">${[['1','רגיל'],['1.15','חמים'],['1.3','גבוה (כמו דמות מצוירת)']].map(([v,l])=>`<option value="${v}" ${String(P.pitch||1.15)===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <label>מהירות: <select data-c="speed"><option value="normal" ${P.speed!=='slow'?'selected':''}>רגילה</option><option value="slow" ${P.speed==='slow'?'selected':''}>איטית</option></select></label>
    <button class="btn ghost small" data-a="testvoice">נסה ▶</button></div>`
  :'<p>🔇 לא נמצא במכשיר הזה קול עברי. מה שתקליטו בחדר ההקלטות יושמע.</p>'}
  <p>ההתקדמות נשמרת בדפדפן הזה. <button class="linkbtn" data-a="reset">${S.confirmReset?'בטוח? לחץ שוב כדי למחוק את כל הכוכבים':'לאפס את הכוכבים'}</button></p></details>`;
}
function renderStage(){
  const st=STAGES[S.stage];
  let h=topBar(`${st.animal} ${st.title}`,false);
  h+=`<div class="guide"><div class="ani">${st.animal}</div><div class="bubble heb">בְּחַר מִשְׂחָק! ${st.guide} מְחַכֶּה לְךָ. 🔥 = אֶתְגָּר</div></div><div class="acts">`;
  actsFor(S.stage).forEach((a,n)=>{
    const s=starsOf(S.stage,a.id);
    h+=`<button class="actcard ${a.hard?'hard':''}" data-a="act" data-id="${a.id}"><span class="anum">${n+1}</span><div class="aicon">${a.icon}</div><div class="aname heb">${a.name}</div>
      <div class="astars">${a.n?'⭐'.repeat(s)+'☆'.repeat(3-s):'<span class="heb">'+a.sub+'</span>'}</div>${a.hard?'<span class="fire">🔥</span>':''}</button>`;
  });
  h+=`</div>`;
  app.innerHTML=h;
}
function renderLearn(st){
  let h=`<div class="guide"><div class="ani">${st.animal}</div><div class="bubble heb">${canSay('intro:'+S.stage)?`<button class="speak say" data-a="sayintro" aria-label="הקרא">🔊</button>`:''}${esc(st.intro)}</div></div>`;
  h+=`<div class="panel"><div class="vowels">${st.vowels.map(v=>`<div class="vowel heb" style="background:${st.color}"><div class="mark">${v.f('מ')}</div><div class="vn">${v.n}</div><div class="vh">${v.h}</div></div>`).join('')}</div></div>`;
  if(st.sound){
    const any=LETTERS.some(L=>canSay(sylKey(st.sound,L)));
    h+=`<div class="panel"><p class="q heb">${any?'לְחַץ עַל הַבְרָה וְתִשְׁמַע אוֹתָהּ:':'קְרָא אֶת הַהֲבָרוֹת:'}</p>`;
    st.vowels.forEach(v=>{h+=`<div class="grid heb" style="margin-bottom:10px">${LETTERS.map(L=>`<button class="tile" data-a="sayk" data-k="${esc(sylKey(st.sound,L))}" data-t="${esc(SAY[st.sound](L))}">${v.f(L)}</button>`).join('')}</div>`});
    h+=`</div>`;
  }
  h+=`<div class="panel"><p class="q heb">מִלִּים שֶׁל ${st.guide}${st.sound?'':' (הַשְּׁוָא צָבוּעַ בְּוָרֹד)'}:</p><div class="wordrow heb">${st.words.map(w=>`<button class="wordcard" data-a="sayk" data-k="${esc(wordKey(w[0]))}" data-t="${esc(w[0])}"><div class="e">${w[1]}</div><div class="w">${hiShva(w[0])}</div></button>`).join('')}</div></div>`;
  h+=`<div class="center"><button class="btn" data-a="back">לַמִּשְׂחָקִים ▶</button></div>`;
  return h;
}
function progress(n){return `<div class="prog">${Array.from({length:n},(_,i)=>`<i class="${i<S.q?'d':i===S.q?'c':''}"></i>`).join('')}</div>`}
const wtxt=w=>S.stage>=5?hiShva(w):esc(w);
function optBtns(r,cls,fmt){return `<div class="opts ${r.opts.length===4?'four':''} ${cls||''}">${r.opts.map(o=>`<button class="opt ${cls||''}" data-a="pick" data-v="${esc(o)}">${fmt?fmt(o):o}</button>`).join('')}</div>`}
function renderGame(st){
  const r=S.round,d=actDef(S.act);
  let h=`<div class="panel">${r.kind==='memory'?'':progress(d.n)}`;
  if(r.kind==='listen'){
    h+=`<p class="q heb">הַקְשֵׁב וּבְחַר מָה ${st.guide} אָמַר:</p><div class="center"><button class="speak big" data-a="replay" aria-label="השמע שוב">🔊</button></div>`;
    h+=optBtns(r,'heb',o=>st.sound?o:hiShva(o));
  }else if(r.kind==='match'){
    h+=`<p class="q heb">מְצָא אֶת אוֹתוֹ הַדָּבָר בְּדִיּוּק:</p><div class="target heb">${esc(r.answer)}</div>`+optBtns(r,'heb',esc);
  }else if(r.kind==='read'){
    h+=`<p class="q heb">קְרָא אֶת הַמִּלָּה וּבְחַר אֶת הַתְּמוּנָה:</p><div class="target heb">${wtxt(r.word)}</div>`+optBtns(r,'e');
  }else if(r.kind==='spell'){
    h+=`<p class="q heb">אֵיזוֹ מִלָּה כְּתוּבָה נָכוֹן? 🔍</p><div class="emoji">${r.emoji}</div>`+optBtns(r,'heb word',wtxt);
  }else if(r.kind==='missing'){
    h+=`<p class="q heb">אֵיזוֹ הֲבָרָה חֲסֵרָה? ✏️</p><div class="emoji">${r.emoji}</div><div class="slots heb">${r.syl.map((s,i)=>`<div class="slot ${i===r.gap?(S.locked?'f':''):'f'}">${i===r.gap&&!S.locked?'?':esc(s)}</div>`).join('')}</div>`+optBtns(r,'heb',esc);
  }else if(r.kind==='sort'){
    h+=`<p class="q heb">אֵיזוֹ תְּנוּעָה יֵשׁ בַּהֲבָרָה הַצְּבוּעָה? 🎯</p><div class="target heb"><span class="hl">${esc(r.syl[0])}</span>${esc(r.syl.slice(1).join(''))}</div>`;
    h+=`<div class="opts snd">${r.opts.map(o=>`<button class="opt heb" data-a="pick" data-v="${o}">${SND_LABEL[o]}</button>`).join('')}</div>`;
  }else if(r.kind==='flash'){
    h+=`<p class="q heb">קְרָא מַהֵר! הַמִּלָּה תֵּעָלֵם ⚡</p><div class="target heb flashw">${r.hidden?'<span class="gone">❓</span>':wtxt(r.word)}</div>`;
    if(r.hidden)h+=`<div class="center"><button class="linkbtn" data-a="flashshow">👁 לְהַרְאוֹת שׁוּב</button></div>`+optBtns(r,'e');
  }else if(r.kind==='build'){
    h+=`<p class="q heb">בְּנֵה אֶת הַמִּלָּה – לְחַץ עַל הַהֲבָרוֹת לְפִי הַסֵּדֶר:</p><div class="emoji">${r.emoji}</div>`;
    if(canSay(wordKey(r.word)))h+=`<div class="center"><button class="speak" data-a="replay" aria-label="השמע">🔊</button></div>`;
    h+=`<div class="slots heb">${r.syl.map((s,i)=>`<div class="slot ${i<r.filled?'f':''}">${i<r.filled?esc(s):''}</div>`).join('')}</div>`;
    h+=`<div class="tiles heb">${r.tiles.map(t=>`<button class="tile ${t.used?'used':''}" data-a="tile" data-i="${t.i}">${esc(t.s)}</button>`).join('')}</div>`;
  }else if(r.kind==='memory'){
    h+=`<p class="q heb">מְצָא זוּגוֹת: מִלָּה + תְּמוּנָה 🃏 <span class="note">צְעָדִים: ${r.moves}</span></p><div class="mem">${r.cards.map(c=>`<button class="mcard ${c.up||c.done?'up':''} ${c.done?'done':''}" data-a="mem" data-i="${c.i}">${c.up||c.done?`<span class="${c.w?'heb mw':'me'}">${c.w?wtxt(c.t):c.t}</span>`:'❔'}</button>`).join('')}</div>`;
  }
  h+=`<div class="feedback heb" id="fb"></div></div>`;
  return h;
}
function renderStory(st){
  const s=st.story;
  if(S.storyQ<0){
    return `<div class="panel story"><div class="emoji">${s.pic}</div>${s.lines.map((l,i)=>`<button class="sline heb" data-a="sline" data-i="${i}">${wtxt(l)}</button>`).join('')}
      <p class="note heb">${heVoice||AIV.length?'לְחַץ עַל שׁוּרָה כְּדֵי לִשְׁמֹעַ אוֹתָהּ':''}</p><div class="center"><button class="btn" data-a="storygo">קָרָאתִי! לַשְּׁאֵלוֹת ▶</button></div></div>`;
  }
  const q=s.qs[S.storyQ];S.round={kind:'storyq',answer:q.a,opts:q.opts};
  const isPic=q.opts.every(o=>!/[א-ת]/.test(o));
  return `<div class="panel">${progress(s.qs.length)}<details class="peek"><summary class="heb">📖 לְהָצִיץ בַּסִּפּוּר</summary>${s.lines.map(l=>`<div class="heb">${wtxt(l)}</div>`).join('')}</details>
    <p class="q heb big">${wtxt(q.q)}</p>${optBtns(S.round,isPic?'e':'heb word',isPic?null:wtxt)}<div class="feedback heb" id="fb"></div></div>`;
}
function renderDone(st){
  const s=S.lastStars||1,list=actsFor(S.stage===MIX?0:S.stage).filter(a=>a.n),idx=list.findIndex(a=>a.id===S.act),nx=S.stage!==MIX&&list[idx+1];
  return `<div class="panel center"><div class="done-ani">${st.animal}</div>
  <h2 class="heb" style="font-size:34px;margin:8px 0">כָּל הַכָּבוֹד!</h2>
  <div class="bigstars">${'⭐'.repeat(s)}${'☆'.repeat(3-s)}</div>
  <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:10px">
  ${nx?`<button class="btn" data-a="act" data-id="${nx.id}">${nx.icon} לַמִּשְׂחָק הַבָּא</button>`:''}
  <button class="btn ghost" data-a="again">עוֹד פַּעַם 🔁</button>
  <button class="btn ghost" data-a="${S.stage===MIX?'home':'back'}">${S.stage===MIX?'לַמַּפָּה 🗺️':'לְכָל הַמִּשְׂחָקִים ↩️'}</button></div></div>`;
}
