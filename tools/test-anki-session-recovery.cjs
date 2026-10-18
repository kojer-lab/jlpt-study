// Regression checks for the current stable Anki session denominator.
// Newly due cards are counted as "extra review" but must not silently
// increase the saved session target; new-card fairness has a separate test.
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
// Mock the production function's complete data dependencies. When its logic
// changes, keep the test harness in sync rather than changing user SRS/FSRS.
const ctx={
 wordMode:"daily",wordStudyLevel:"ALL",
 wordSessionQueue:[],wordLearningQueue:[],wordSessionHistory:[],
 wordQuickRepeats:[],wordQuickActive:null,wordSessionDone:6,wordSessionTotal:6,
 wordIndex:0,canonicalWordId:x=>x,
 now:()=>10000,
 wordsForLevel:()=>pending,
 getSrs:()=>({reviews:2,focusPending:false,due:0}),
 wordById:new Map(pending.map(w=>[w.id,w])),
 state:{dailyNew:{date:"2026-10-18",ids:[]}},
 todayKey:()=>"2026-10-18",
 ensureDailyNew:()=>[],
 buildWordStudyQueue:()=>pending,persistWordSession:()=>events.push("saved")
};
vm.runInNewContext(section("function reconcileDailyWordSession(","function wordTop("),ctx);
// The old 6-card session's target must not grow just because other cards
// become due while it is active. The UI can separately show 31 extra reviews.
assert.equal(ctx.reconcileDailyWordSession(),31);
assert.equal(ctx.wordSessionQueue.length,0);
assert.equal(ctx.wordSessionTotal,6);
assert.equal(ctx.wordIndex,0);
assert.deepEqual(events,[]);
assert.equal(ctx.reconcileDailyWordSession(),31,"Checking must not insert cards or inflate the denominator");
// Completed cards are not double counted as fresh extra reviews.
ctx.wordSessionHistory=[{id:"word3",countedDone:true}];
assert.equal(ctx.reconcileDailyWordSession(),30);
// Learning/quick repeat cards already pending cannot be double counted.
ctx.wordSessionHistory=[];
ctx.wordSessionQueue=[];ctx.wordSessionDone=5;ctx.wordSessionTotal=6;
ctx.wordLearningQueue=[{id:"word0"}];ctx.wordQuickRepeats=[{id:"word1",turn:7}];
ctx.wordQuickActive={id:"word2"};
assert.equal(ctx.reconcileDailyWordSession(),28);
assert.equal(ctx.wordSessionQueue.length,0);
assert.equal(ctx.wordSessionTotal,6);
// Finish view preserves the original denominator and clears the session key.
const dom=new Map();
const $=id=>{if(!dom.has(id))dom.set(id,{textContent:"",innerHTML:"",disabled:false,
 classList:{added:[],removed:[],add(v){this.added.push(v)},remove(v){this.removed.push(v)}},
 dataset:{}});return dom.get(id)};
const finish={localStorage:{removeItem:k=>events.push("remove "+k)},
 wordSessionStorageKey:()=>"session",wordSessionDone:6,wordSessionTotal:6,wordSessionQueue:[],
 wordLearningQueue:[],wordQuickRepeats:[],wordQuickActive:null,
 updateWordUndo:()=>{},$};
vm.runInNewContext(section("function finishWordStudy(","function renderWord("),finish);
finish.finishWordStudy();
assert.equal(dom.get("wordStudyProgress").textContent,"6 / 6");
assert.equal(finish.wordSessionTotal,6);
assert(events.includes("remove session"));
// While a card is visible, newly due cards are labelled "additional reviews"
// without inserting them into this session or growing its saved denominator.
// An empty session instead finishes or waits for its timed learning cards.
const render=section("function renderWord(){","/* Reference-matched rating icons");
assert(render.includes("const queue=currentWordQueue();"),"Render must use its established session queue");
assert(render.includes('const extraDue=wordMode==="daily"?reconcileDailyWordSession():0;'),
 "An active daily card must still show the separately counted extra reviews");
assert(render.includes('if(!queue.length){')&&render.includes("finishWordStudy();return;"),
 "Empty sessions must finish rather than silently absorb the next session backlog");
console.log("PASS: fixed Anki session target, separate extra-due count, exclusions, finish UI");
