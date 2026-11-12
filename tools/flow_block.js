/* ---------- flow ---------- */
function openStage(i){S.view='stage';S.stage=i;S.act=null;S.done=false;stopAudio();render()}
function openAct(id){
  S.view='act';S.act=id;S.q=0;S.mistakes=0;S.done=false;S.storyQ=-1;S.round=null;
  if(id!=='learn'&&id!=='story')newRound();
  render();autoSay();
}
function finishAct(){
  clearTimeout(flashTimer);
  let s;
  if(S.act==='memory'){const extra=S.round.moves-6;s=extra<=3?3:extra<=7?2:1}
  else{const n=actDef(S.act).n,ratio=S.mistakes/n;s=ratio<=.15?3:ratio<=.4?2:1}
  P.acts=P.acts||{};const k=starKey(S.stage,S.act);P.acts[k]=Math.max(P.acts[k]||0,s);
  S.lastStars=s;S.done=true;save();render();confetti();say('praise',PRAISE[0]);
}
function autoSay(){const r=S.round;if(!r)return;if(r.kind==='listen')setTimeout(()=>say(r.key,r.say),350)}
function feedback(ok){
  const fb=document.getElementById('fb');if(!fb)return;
  fb.className='feedback heb '+(ok?'good':'try');fb.textContent=ok?rnd(PRAISE):rnd(TRY);
}
function advance(){
  if(S.act==='story'){S.storyQ++;S.q++;if(S.storyQ>=STAGES[S.stage].story.qs.length)return finishAct();render();return}
  S.q++;
  if(S.q>=actDef(S.act).n)return finishAct();
  newRound();render();autoSay();
}
function wrong(b){S.mistakes++;b.classList.remove('bad');void b.offsetWidth;b.classList.add('bad');feedback(false)}

app.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b)return;
  const a=b.dataset.a;
  if(a==='home'){if(REC.on)return;clearTimeout(flashTimer);S.view='map';S.confirmReset=false;stopAudio();render();return}
  if(a==='studio'){S.view='studio';S.sVoice=activeRec()||P.voices[0].id;S.confirmDel=null;S.sStage=S.sStage||0;S.sIdx=0;REC.err='';render();return}
  if(a==='rec'){toggleRec();return}
  if(REC.on)return;
  if(a==='sstage'){S.sStage=+b.dataset.i;S.sIdx=0;render();return}
  if(a==='sjump'){S.sIdx=+b.dataset.i;render();return}
  if(a==='sprev'){if(S.sIdx>0)S.sIdx--;render();return}
  if(a==='snext'){if(S.sIdx<studioItems(S.sStage).length-1)S.sIdx++;render();return}
  if(a==='splay'){const u=clipFor(studioItems(S.sStage)[S.sIdx].k,S.sVoice);stopAudio();if(u){curAudio=new Audio(u);curAudio.play().catch(()=>{})}return}
  if(a==='sdel'){const k=studioItems(S.sStage)[S.sIdx].k;delClip(ck(S.sVoice,k));if(S.sVoice==='v1')delClip(k);render();return}
  if(a==='svoice'){S.sVoice=b.dataset.id;S.confirmDel=null;render();return}
  if(a==='addvoice'){const inp=document.getElementById('newvoice');const name=(inp&&inp.value||'').trim();if(!name){inp&&inp.focus();return}
    const id='v'+Date.now().toString(36);P.voices.push({id,name});S.sVoice=id;P.narrator='rec:'+id;P.narratorSet=true;save();render();return}
  if(a==='delvoice'){const id=S.sVoice;if(S.confirmDel!==id){S.confirmDel=id;render();return}
    Object.keys(CLIPS).filter(k=>k.startsWith(id+'|')||(id==='v1'&&!k.includes('|'))).forEach(delClip);
    P.voices=P.voices.filter(v=>v.id!==id);if(P.narrator==='rec:'+id)P.narrator='rec:'+P.voices[0].id;S.sVoice=P.voices[0].id;S.confirmDel=null;save();render();return}
  if(a==='sayk'){say(b.dataset.k,b.dataset.t);b.classList.add('flash');setTimeout(()=>b.classList.remove('flash'),400);return}
  if(a==='open'){openStage(+b.dataset.i);return}
  if(a==='mix'){S.stage=MIX;openAct('mix');return}
  if(a==='act'){openAct(b.dataset.id);return}
  if(a==='back'){clearTimeout(flashTimer);openStage(S.stage);return}
  if(a==='again'){openAct(S.act);return}
  if(a==='reset'){if(!S.confirmReset){S.confirmReset=true;render();return}P.acts={};S.confirmReset=false;save();render();return}
  if(a==='testnarr'){say('intro:0',STAGES[0].intro,.9);return}
  if(a==='testvoice'){speak('שָׁלוֹם! אֲנִי אַרְנָבִי. בּוֹא נִקְרָא יַחַד: אַבָּא, סַבָּא, גַּמָּל!',.9);return}
  if(a==='sayintro'){say('intro:'+S.stage,STAGES[S.stage].intro,.9);return}
  if(a==='sline'){const l=STAGES[S.stage].story.lines[+b.dataset.i];say('st:'+l,l,.85);document.querySelectorAll('.sline').forEach(x=>x.classList.remove('on'));b.classList.add('on');return}
  if(a==='storygo'){S.storyQ=0;S.q=0;render();return}
  const r=S.round;if(!r)return;
  if(a==='replay'){if(r.kind==='build')say(wordKey(r.word),r.word);else say(r.key,r.say);return}
  if(a==='flashshow'){S.mistakes++;r.hidden=false;render();scheduleFlash();return}
  if(a==='pick'){
    if(S.locked)return;
    if(b.dataset.v===r.answer){
      S.locked=true;clearTimeout(flashTimer);
      if(r.kind==='missing'||r.kind==='flash'){if(r.kind==='flash')r.hidden=false;render();const nb=document.querySelector(`[data-a=pick][data-v="${CSS.escape(r.answer)}"]`);nb&&nb.classList.add('ok')}
      else b.classList.add('ok');
      feedback(true);
      if(r.word&&r.kind!=='sort')say(wordKey(r.word),r.word);
      setTimeout(advance,1200);
    }else{
      wrong(b);
      if(r.kind==='listen')setTimeout(()=>say(r.key,r.say),500);
    }
    return;
  }
  if(a==='tile'){
    if(S.locked)return;
    const t=r.tiles[+b.dataset.i];if(t.used)return;
    if(t.s===r.syl[r.filled]){
      t.used=true;r.filled++;
      if(r.filled===r.syl.length){S.locked=true;render();feedback(true);say(wordKey(r.word),r.word);setTimeout(advance,1400)}
      else render();
    }else wrong(b);
    return;
  }
  if(a==='mem'){
    if(S.locked)return;
    const c=r.cards[+b.dataset.i];if(c.up||c.done)return;
    c.up=true;r.open.push(c);
    if(r.open.length===2){
      r.moves++;const [x,y]=r.open;
      if(x.p===y.p&&x.w!==y.w){
        x.done=y.done=true;r.open=[];r.pairs++;S.q=r.pairs;
        const w=x.w?x.t:y.t;say(wordKey(w),w);
        render();feedback(true);
        if(r.pairs===6){S.locked=true;setTimeout(finishAct,1300)}
      }else{
        S.locked=true;render();
        setTimeout(()=>{x.up=y.up=false;r.open=[];S.locked=false;render()},1000);
      }
    }else render();
  }
});
