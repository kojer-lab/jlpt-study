// Unified N1+N2 Anki regression. Run: node tools/test-unified-n2-anki.cjs
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const parts=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].map(n=>{
 const src=fs.readFileSync("data/n2-words-phase"+n+".js","utf8");
 const context={window:{}};vm.runInNewContext(src,context,{timeout:3000});
 return context.window["N2_WORDS_PHASE"+n];
});
const entries=parts.flat();
assert.equal(parts[0].length,46);
assert.equal(parts[1].length,61);
assert.equal(parts[2].length,60);
assert.equal(parts[3].length,60);
assert.equal(parts[4].length,95);
assert.equal(parts[5].length,49);
assert.equal(parts[6].length,52);
assert.equal(parts[7].length,49);
assert.equal(parts[8].length,63);
assert.equal(parts[9].length,71);
assert.equal(parts[10].length,62);
assert.equal(parts[11].length,67);
assert.equal(parts[12].length,36);
assert.equal(parts[13].length,70);
assert.equal(parts[14].length,50);
assert.equal(parts[15].length,50);
assert.equal(parts[16].length,50);
assert.equal(parts[17].length,50);
assert.equal(entries.length,1041);
assert.equal(new Set(entries.map(x=>x.id)).size,1041);
assert.equal(new Set(entries.map(x=>x.w+"\t"+x.r)).size,1041);
for(const w of entries){
 assert.match(w.id,/^n2p\d{3,4}$/);
 assert.equal(w.level,"N2");
 assert.ok(w.w&&w.r&&w.meaning&&w.source);
 assert.equal(w.examples.length,1,"one contextual example for "+w.w);
 assert.ok(!w.w.includes("<")&&!w.meaning.includes("<"));
 for(const ex of w.examples){
  assert.ok(ex.jp.trim().length>=32&&ex.ko.trim().length>=15,"long contextual example: "+w.w);
  assert.ok(ex.jp.includes("。")||/[。！？]$/.test(ex.jp));
  assert.ok(!ex.jp.includes("<")&&!ex.ko.includes("<"));
 }
}
assert.ok(html.includes('const wordStudyLevel="ALL"'));
assert.ok(html.includes('function wordSessionStorageKey(){return "jlptN1ActiveWordSessionV1"}'));
assert.ok(!html.includes('id="wordLevelN1"')&&!html.includes('id="wordLevelN2"'));
assert.ok(html.includes('localStorage.getItem("jlptN2ActiveWordSessionV1")'));
assert.ok(html.includes('w.examples.slice(0,2)'));
assert.ok(html.includes('data/n2-words-phase2.js'));
assert.ok(html.includes('data/n2-words-phase3.js'));
assert.ok(html.includes('data/n2-words-phase4.js'));
assert.ok(html.includes('data/n2-words-phase5.js'));
assert.ok(html.includes('data/n2-words-phase6.js'));
assert.ok(html.includes('data/n2-words-phase7.js'));
assert.ok(html.includes('data/n2-words-phase8.js'));
assert.ok(html.includes('data/n2-words-phase9.js'));
assert.ok(html.includes('data/n2-words-phase10.js'));
assert.ok(html.includes('data/n2-words-phase11.js'));
assert.ok(html.includes('data/n2-words-phase12.js'));
assert.ok(html.includes('data/n2-words-phase13.js'));
assert.ok(html.includes('data/n2-words-phase14.js'));
assert.ok(html.includes('data/n2-words-phase15.js'));
assert.ok(html.includes('data/n2-words-phase16.js'));
assert.ok(html.includes('data/n2-words-phase17.js'));
assert.ok(html.includes('data/n2-words-phase18.js'));
assert.ok(html.includes('window.N2_WORDS_PHASE5'));
assert.ok(html.includes('window.N2_WORDS_PHASE6'));
assert.ok(html.includes('window.N2_WORDS_PHASE7'));
assert.ok(html.includes('window.N2_WORDS_PHASE8'));
assert.ok(html.includes('window.N2_WORDS_PHASE9'));
assert.ok(html.includes('window.N2_WORDS_PHASE10'));
assert.ok(html.includes('window.N2_WORDS_PHASE11'));
assert.ok(html.includes('window.N2_WORDS_PHASE12'));
assert.ok(html.includes('window.N2_WORDS_PHASE13'));
assert.ok(html.includes('window.N2_WORDS_PHASE14'));
assert.ok(html.includes('window.N2_WORDS_PHASE15'));
assert.ok(html.includes('window.N2_WORDS_PHASE16'));
assert.ok(html.includes('window.N2_WORDS_PHASE17'));
assert.ok(html.includes('window.N2_WORDS_PHASE18'));
assert.ok(html.includes('(x.examples||[]).slice(0,1)'));
assert.ok(html.includes('const wordStudyLevel="ALL"'));
assert.ok(html.includes('window.N2_WORDS_PHASE3'));
assert.ok(html.includes('window.N2_WORDS_PHASE4'));
assert.ok(html.includes('existingWordsByKey.set(key,entry)'));
assert.ok(!html.includes('localStorage.clear('));
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
for(const tag of scriptTags){if(tag[1].trim())new vm.Script(tag[1])}
console.log("PASS N1+N2 unified Anki: 1041 reviewed N2 candidates, one contextual example per card, common daily cap, FSRS preserved");
