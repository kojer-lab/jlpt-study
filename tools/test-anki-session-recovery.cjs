// Regression test: an old/resumed Anki queue cannot complete while more cards
// are due today. Uses only Node's built-in VM/assert modules.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
 .filter(m=>!/\bsrc\s*=/.test(m[1])).map(m=>m[2]);
const src=scripts.join("\n");
for(const code of scripts)new vm.Script(code);
function section(from,to){
 const a=src.indexOf(from),b=src.indexOf(to,a+from.length);
 assert(a>=0&&b>a,"Could not extract "+from+" -> "+to);
 return src.slice(a,b);
}
const pending=Array.from({length:31},(_,i)=>({id:"word"+i}));
const events=[];
const ctx={
 wordMode:"daily",wordSessionQueue:[],wordLearningQueue:[],
 wordQuickRepeats:[],wordQuickActive:null,wordSessionDone:6,wordSessionTotal:6,
 wordIndex:0,canonicalWordId:x=>x,
 buildWordStudyQueue:()=>pending, persistWordSession:()=>events.push("saved")
};
vm.runInNewContext(section("function reconcileDailyWordSession(","function wordTop("),ctx);
// Recreate reported bug: the old six-card session has no more immediate cards,
// but today's dashboard still shows 31 available.
assert.equal(ctx.reconcileDailyWordSession(),31);
assert.equal(ctx.wordSessionQueue.length,31);
assert.equal(ctx.wordSessionTotal,37);
assert.equal(ctx.wordIndex,0);
assert.deepEqual(events,["saved"]);
assert.equal(ctx.reconcileDailyWordSession(),0,"Same cards cannot be queued twice");
assert.equal(ctx.wordSessionQueue.length,31);
// Pending re-learning and quick-repeat cards cannot be duplicated by syncing.
ctx.wordSessionQueue=[];ctx.wordSessionDone=5;ctx.wordSessionTotal=6;
ctx.wordLearningQueue=[{id:"word0"}];ctx.wordQuickRepeats=[{id:"word1",turn:7}];
ctx.wordQuickActive={id:"word2"};
assert.equal(ctx.reconcileDailyWordSession(),28);
assert(!ctx.wordSessionQueue.some(w=>["word0","word1","word2"].includes(w.id)));
assert.equal(ctx.wordSessionTotal,36);
// A finished UI must show the right denominator rather than 6/0.
const dom=new Map();
const $=id=>{if(!dom.has(id))dom.set(id,{textContent:"",innerHTML:"",disabled:false,
 classList:{added:[],removed:[],add(v){this.added.push(v)},remove(v){this.removed.push(v)}},
 dataset:{}});return dom.get(id)};
const finish={localStorage:{removeItem:k=>events.push("remove "+k)},WORD_SESSION_KEY:"session",
 wordSessionDone:6,wordSessionTotal:6,wordSessionQueue:[],
 wordLearningQueue:[],wordQuickRepeats:[],wordQuickActive:null,
 updateWordUndo:()=>{},$};
vm.runInNewContext(section("function finishWordStudy(","function renderWord("),finish);
finish.finishWordStudy();
assert.equal(dom.get("wordStudyProgress").textContent,"6 / 6");
assert.equal(finish.wordSessionTotal,6,"Preserve completed session count");
assert(src.includes('if(wordMode==="daily")reconcileDailyWordSession();\n const queue=currentWordQueue();'),
 "Live backlog must be consulted before checking the empty queue");
console.log("PASS: stale six-card Anki session resumes 31 pending cards; no premature 6/0 completion");
