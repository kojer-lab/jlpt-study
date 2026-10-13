// Dynamic N2 source, app wiring and FSRS regression checks.
// Phase count and totals are derived from files; no stale phase-specific constants.
// Maintained separately from batch-specific generated validation scripts.
"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const phaseNumbers=fs.readdirSync("data")
  .map(name=>/^n2-words-phase(\d+)\.js$/.exec(name))
  .filter(Boolean)
  .map(match=>Number(match[1]))
  .sort((a,b)=>a-b);
assert.ok(phaseNumbers.length>=6,"expected existing N2 phase data");
assert.deepEqual(phaseNumbers,Array.from({length:phaseNumbers.length},(_,i)=>i+1),
  "N2 phase files must be numbered contiguously");
const phaseData=phaseNumbers.map(n=>{
 const path="data/n2-words-phase"+n+".js";
 const context={window:{}};
 vm.runInNewContext(fs.readFileSync(path,"utf8"),context,{timeout:5000,filename:path});
 const words=context.window["N2_WORDS_PHASE"+n];
 assert.ok(Array.isArray(words),path+" must export an array");
 return {n,path,words};
});
const entries=phaseData.flatMap(p=>p.words);
const base=phaseData.filter(p=>p.n<=5).flatMap(p=>p.words);
const promotions=phaseData.filter(p=>p.n>=6).flatMap(p=>p.words);
const draft=JSON.parse(fs.readFileSync("data/n2-target-2000-draft.json","utf8"));
const progress=JSON.parse(fs.readFileSync("data/n2-promotion-progress.json","utf8"));
const target=draft.meta.target_total;
const readyGoal=draft.meta.target_ready_cards||target;
assert.equal(draft.meta.status,"source_candidates_only");
assert.equal(draft.meta.ready_existing,base.length);
assert.equal(target,base.length+draft.words.length,"source pool total");
assert.equal(progress.source_target,target);
assert.equal(progress.target_ready_cards,readyGoal);
assert.equal(progress.existing_n2_ready,base.length);
const canonical=s=>s.normalize("NFKC").replace(/\s+/g,"");
const sourcePool=[...base,...draft.words];
assert.equal(new Set(sourcePool.map(w=>canonical(w.w))).size,target,"duplicate N2 source headword");
assert.equal(new Set(sourcePool.map(w=>w.id)).size,target,"duplicate N2 source ID");
assert.ok(sourcePool.every(w=>w.level==="N2"),"source word level must be N2");
const promotedFromPhase=new Map();
for(const {n,path,words} of phaseData.filter(p=>p.n>=6)){
 assert.ok(words.length>0,"promoted phase must not be empty: "+path);
 for(const word of words){
  assert.ok(!promotedFromPhase.has(word.id),"same card promoted twice: "+word.id);
  promotedFromPhase.set(word.id,path);
 }
}
const count=status=>draft.words.filter(w=>w.qa_status===status).length;
const ready=count("reviewed_promoted");
const duplicates=count("duplicate_exact_n1");
const homographs=count("needs_homograph_review");
const waiting=count("needs_ko_and_long_example");
const unsuitable=count("excluded_low_utility");
assert.equal(ready,promotions.length,"promoted card files must match reviewed status");
assert.equal(draft.words.length,ready+duplicates+homographs+waiting+unsuitable,"unrecognized draft QA status");
assert.equal(draft.meta.reviewed_new,ready,"draft reviewed metadata out of sync");
assert.equal(draft.meta.pending_new,draft.words.length-ready,"draft pending metadata out of sync");
assert.equal(draft.meta.unreviewed_unflagged,waiting);
assert.ok(draft.words.filter(w=>["duplicate_exact_n1","excluded_low_utility"].includes(w.qa_status)).every(w=>w.excluded_from_promotion));
const sourceById=new Map(draft.words.map(w=>[w.id,w]));
for(const word of promotions){
 const original=sourceById.get(word.id);
 assert.ok(original&&original.qa_status==="reviewed_promoted",
  "promotion lacks reviewed source card: "+word.id);
 assert.equal(original.promoted_in,promotedFromPhase.get(word.id),"promotion phase mismatch: "+word.id);
}
for(const word of draft.words){
 assert.ok(word.w&&word.r&&word.meaning_en&&word.source_id,"draft entry must have a source and reading");
 assert.equal(word.examples,undefined,"unreviewed source must never contain live examples");
 assert.equal(word.meaning,undefined,"raw English gloss must never be presented as Korean");
}
assert.equal(entries.length,base.length+promotions.length);
assert.equal(new Set(entries.map(w=>w.id)).size,entries.length,"duplicate N2 card ID");
assert.equal(new Set(entries.map(w=>w.w+"\t"+w.r)).size,entries.length,"duplicate N2 card and reading");
for(const word of entries){
 assert.match(word.id,/^n2p\d{3,4}$/);
 assert.equal(word.level,"N2");
 assert.ok(word.w&&word.r&&word.meaning&&word.source);
 assert.equal(word.examples.length,1,"exactly one contextual example for "+word.w);
 assert.ok(!word.w.includes("<")&&!word.meaning.includes("<"),"unsafe card text");
 const ex=word.examples[0];
 assert.ok(ex.jp.trim().length>=32&&ex.ko.trim().length>=15,"long bilingual example: "+word.w);
 assert.ok(/[。！？]/.test(ex.jp),"example punctuation: "+word.w);
 assert.ok(!ex.jp.includes("<")&&!ex.ko.includes("<"),"unsafe example text");
}
const audit=JSON.parse(fs.readFileSync("data/n2-duplicate-audit-20261013.json","utf8"));
const collided=new Map(audit.collisions.filter(x=>x.source==="draft").map(x=>[x.id,x]));
for(const word of promotions){
 const collision=collided.get(word.id);
 if(!collision)continue;
 const reviewed=sourceById.get(word.id);
 assert.equal(collision.collision_type,"same_written_form_different_reading","exact N1 duplicate may not be promoted: "+word.w);
 assert.equal(reviewed.homograph_review_verified,true,"N1 homograph not reviewed: "+word.w);
 assert.ok(reviewed.homograph_n1_reading,"missing matched N1 reading for "+word.w);
 assert.notEqual(canonical(word.r),canonical(reviewed.homograph_n1_reading),"N1 homograph reading identical: "+word.w);
}
const totalReady=base.length+ready;
assert.equal(progress.promoted_new,ready);
assert.equal(progress.source_ready_total,totalReady);
assert.equal(progress.pending_general,waiting);
assert.equal(progress.pending_homograph,homographs);
assert.equal(progress.excluded_low_utility,unsuitable);
assert.equal(progress.excluded_exact_n1,duplicates);
assert.equal(progress.pending_total_including_exclusions,draft.words.length-ready);
assert.equal(Number(progress.progress_percent),Number((100*totalReady/readyGoal).toFixed(2)));
assert.equal(totalReady,readyGoal,"N2 reviewed source goal not reached");
const latest=phaseData.at(-1);
assert.equal(progress.latest_phase,latest.path);
assert.equal(progress.latest_phase_count,latest.words.length);
const progressHtml=fs.readFileSync("n2-progress.html","utf8");
assert.ok(progressHtml.includes("data/n2-progress-live.js"));
assert.ok(progressHtml.includes(progress.progress_percent.toFixed(2)+"%"),
 "progress page initial percent must match final promoted data");
assert.ok(!html.includes("n2-target-2000-draft.json"),
 "unreviewed source must not load into the live Anki app");
for(const {n,path} of phaseData.filter(p=>p.n>=2)){
 assert.ok(html.includes(path),"app missing N2 file: "+path);
 if(n>=5)assert.ok(html.includes("window.N2_WORDS_PHASE"+n),"app missing N2 cards: "+n);
}
assert.ok(html.includes('const wordStudyLevel="ALL"'));
assert.ok(html.includes('function wordSessionStorageKey(){return "jlptN1ActiveWordSessionV1"}'));
assert.ok(html.includes('localStorage.getItem("jlptN2ActiveWordSessionV1")'));
assert.ok(html.includes('w.examples.slice(0,2)'));
assert.ok(html.includes('(x.examples||[]).slice(0,1)'));
assert.ok(html.includes("existingWordsByKey.set(key,entry)"));
assert.ok(!html.includes('id="wordLevelN1"')&&!html.includes('id="wordLevelN2"'));
assert.ok(!html.includes("localStorage.clear("));

function segment(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>0&&b>a,"unable to find function "+start);
 return html.slice(a,b);
}
const mixed=segment("function mixedUnseenWordsForToday(){","function ensureDailyNew(");
const daily=segment("function ensureDailyNew(","function todayNewPending(");
const n1=Array.from({length:70},(_,i)=>({id:"n1-"+i,level:"N1"}));
const n2=Array.from({length:60},(_,i)=>({id:"n2-"+i,level:"N2"}));
const words=[...n1,...n2];
let saves=0,day="2026-10-13";
const srs={},state={settings:{dailyNewLimit:20},dailyNew:{date:"",ids:[],updatedAt:0}};
const context={
 words,state,wordById:new Map(words.map(x=>[x.id,x])),
 now:()=>0,todayKey:()=>day,
 unseenWords:level=>words.filter(x=>(level==="ALL"||x.level===level)&&(srs[x.id]?.reviews||0)===0),
 wordsForLevel:level=>level==="ALL"?words:words.filter(x=>x.level===level),
 getSrs:id=>srs[id]||{reviews:0},
 saveState:()=>saves++,console,Set,Map,Math,JSON
};
vm.createContext(context);
vm.runInContext(mixed+"\n"+daily,context,{timeout:3000});
let selected=context.ensureDailyNew(true,"ALL");
assert.equal(selected.length,20);
assert.equal(selected.filter(x=>x.level==="N2").length,6);
assert.equal(selected.filter(x=>x.level==="N1").length,14);
const first=selected.map(x=>x.id);
selected=context.ensureDailyNew(true,"ALL");
assert.deepEqual(Array.from(selected,x=>x.id),Array.from(first));
assert.equal(saves,1);
const firstId=first[0],prior={reviews:3,due:1770000000000,stability:40};
srs[firstId]=prior;
selected=context.ensureDailyNew(true,"ALL");
assert.strictEqual(srs[firstId],prior);
assert.ok(selected.some(w=>w.id===firstId));
assert.equal(selected.length,20);
day="2026-10-14";state.dailyNew={date:day,ids:n1.slice(0,20).map(x=>x.id),updatedAt:0};
const existing=context.ensureDailyNew(true,"ALL");
assert.equal(JSON.stringify(Array.from(existing,x=>x.id)),JSON.stringify(Array.from(state.dailyNew.ids)));
assert.equal(existing.filter(x=>x.level==="N2").length,0);
srs["n2-4"]={reviews:12,due:123,stability:12};
const before=srs["n2-4"];
day="2026-10-15";state.dailyNew={date:"",ids:[],updatedAt:0};
selected=context.ensureDailyNew(true,"ALL");
assert.strictEqual(srs["n2-4"],before);
assert.equal(selected.length,20);

const scriptTags=html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g);
for(const tag of scriptTags){if(tag[1].trim())new vm.Script(tag[1]);}
console.log("PASS dynamic N2 validation: "+totalReady+" / "+target+
 " N2 source cards; "+ready+" new reviews; "+waiting+" pending; unified Anki and FSRS verified");
