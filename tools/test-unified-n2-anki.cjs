// Unified N1+N2 Anki regression. Run: node tools/test-unified-n2-anki.cjs
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const parts=[1,2].map(n=>{
 const src=fs.readFileSync("data/n2-words-phase"+n+".js","utf8");
 const context={window:{}};vm.runInNewContext(src,context,{timeout:3000});
 return context.window["N2_WORDS_PHASE"+n];
});
const entries=parts.flat();
assert.equal(parts[0].length,46);
assert.equal(parts[1].length,61);
assert.equal(entries.length,107);
assert.equal(new Set(entries.map(x=>x.id)).size,107);
assert.equal(new Set(entries.map(x=>x.w+"\t"+x.r)).size,107);
for(const w of entries){
 assert.match(w.id,/^n2p\d{3}$/);
 assert.equal(w.level,"N2");
 assert.ok(w.w&&w.r&&w.meaning&&w.source);
 assert.equal(w.examples.length,2,"two examples for "+w.w);
 assert.ok(!w.w.includes("<")&&!w.meaning.includes("<"));
 for(const ex of w.examples){
  assert.ok(ex.jp.trim().length>=10&&ex.ko.trim().length>=7,"example content: "+w.w);
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
assert.deepEqual(selected.map(x=>x.id),first);
assert.equal(saves,1);
const firstId=first[0],prior={reviews:3,due:1770000000000,stability:40};
srs[firstId]=prior;
selected=context.ensureDailyNew(true,"ALL");
assert.strictEqual(srs[firstId],prior);
assert.ok(selected.some(w=>w.id===firstId));
assert.equal(selected.length,20);
day="2026-10-14";state.dailyNew={date:day,ids:n1.slice(0,20).map(x=>x.id),updatedAt:0};
const existing=context.ensureDailyNew(true,"ALL");
assert.deepEqual(existing.map(x=>x.id),state.dailyNew.ids);
assert.equal(existing.filter(x=>x.level==="N2").length,0);
srs["n2-4"]={reviews:12,due:123,stability:12};
const before=srs["n2-4"];
day="2026-10-15";state.dailyNew={date:"",ids:[],updatedAt:0};
selected=context.ensureDailyNew(true,"ALL");
assert.strictEqual(srs["n2-4"],before);
assert.equal(selected.length,20);
const scriptTags=html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g);
for(const tag of scriptTags){if(tag[1].trim())new Function(tag[1])}
console.log("PASS N1+N2 unified Anki: 107 candidates, 214 examples, common limit, N2 blending and SRS preservation");
