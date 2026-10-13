/**
 * Regression tests for the actual Anki queue helpers in index.html.
 * Run: node tools/test-anki-new-interleave.mjs
 * No browser profile or saved study state is touched.
 */
import {readFileSync} from "node:fs";
import {strict as assert} from "node:assert";
import vm from "node:vm";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
function extractFunction(name){
 const token="function "+name+"(";
 const pos=html.indexOf(token);
 assert.ok(pos>=0,"function missing: "+name);
 const opening=html.indexOf("{",pos), count=html.indexOf(token,pos+1);
 assert.equal(count,-1,"duplicate function: "+name);
 let depth=0,end=-1;
 for(let i=opening;i<html.length;i++){
  const c=html[i];
  if(c==="{")depth++;
  if(c==="}"&&!--depth){end=i+1;break}
 }
 assert.ok(end>opening,"unbalanced function: "+name);
 return html.slice(pos,end);
}
const d=Array.from({length:35},(_,i)=>({id:"due"+i}));
const fresh=Array.from({length:6},(_,i)=>({id:"new"+i}));
const map=new Map([...d,...fresh].map(w=>[w.id,w]));
const studiedIds=new Set(d.map(w=>w.id));
const ctx=vm.createContext({
 wordMode:"daily",wordNonNewStreak:0,
 wordSessionQueue:[],wordLearningQueue:[],wordSessionHistory:[],wordSessionDone:0,wordSessionTotal:0,
 wordQuickRepeats:[],wordQuickActive:null,wordQuickTurn:0,wordIndex:0,wordStudyLevel:"N1",
 wordById:map,
 getSrs:id=>({reviews:studiedIds.has(id)?2:0,due:Date.now()-1,state:"review"}),
 canonicalWordId:id=>id,
 todayNewPending:()=>fresh.slice(0,4),
 promoteLearningCards:(queue,delayed)=>{if(delayed.length)queue.unshift(map.get(delayed.shift().id))},
 promoteQuickWord:()=>{},
 localStorage:{getItem:()=>null,removeItem:()=>{}},
 wordSessionStorageKey:()=> "anki-test",now:()=>Date.now(),
});
for(const name of ["interleaveDueAndNew","prioritizePendingNewWord","currentWordQueue","includeMissingDailyNewInSession","restoreWordSession"]){
 vm.runInContext(extractFunction(name),ctx);
}
function ids(){return Array.from(ctx.wordSessionQueue,x=>x.id)}
function reset(items=d.concat(fresh.slice(0,4)),gap=0){
 ctx.wordMode="daily";ctx.wordNonNewStreak=gap;ctx.wordSessionQueue=[...items];
 ctx.wordLearningQueue=[];ctx.wordSessionHistory=[];ctx.wordSessionTotal=items.length;
}
function test(name,fn){fn();console.log("PASS",name)}
test("new session starts with 4 due then 1 new",()=>{
 reset();
 const mixed=ctx.interleaveDueAndNew(d,fresh.slice(0,4));
 assert.equal(mixed[4].id,"new0");
 assert.equal(mixed[9].id,"new1");
});
test("after four actual reviews, new is next even with 30 due",()=>{
 reset(d.concat(fresh.slice(0,4)),4);
 ctx.currentWordQueue();
 assert.equal(ids()[0],"new0");
 assert.equal(ids().length,39);
});
test("time-due learning review cannot permanently starve new cards",()=>{
 reset(d.slice(0,30).concat(fresh.slice(0,4)),4);
 ctx.wordLearningQueue=[{id:"due34"}];
 ctx.currentWordQueue();
 assert.equal(ids()[0],"new0");
 assert.equal(ids()[1],"due34");
});
test("no early promotion below four reviews",()=>{
 reset(d.concat(fresh.slice(0,4)),3);
 ctx.currentWordQueue();
 assert.equal(ids()[0],"due0");
});
test("if today's quota is exhausted, no extra new is invented",()=>{
 reset(d.slice(0,20),4);
 ctx.todayNewPending=()=>[];
 assert.equal(ctx.includeMissingDailyNewInSession(),0);
 assert.equal(ids().length,20);
 ctx.todayNewPending=()=>fresh.slice(0,4);
});
test("resume old due-only session adds today's reserved unseen words once",()=>{
 reset(d.slice(0,20),4);
 const first=ctx.includeMissingDailyNewInSession();
 assert.equal(first,4);
 assert.equal(ctx.wordSessionTotal,24);
 assert.equal(ctx.includeMissingDailyNewInSession(),0);
 assert.equal(ctx.wordSessionTotal,24);
 ctx.currentWordQueue();
 assert.equal(ids()[0],"new0");
});
test("already-queued new words are not duplicated",()=>{
 reset(d.slice(0,20).concat(fresh.slice(0,2)),4);
 assert.equal(ctx.includeMissingDailyNewInSession(),2);
 assert.equal(ids().filter(x=>x==="new0").length,1);
 assert.equal(ctx.wordSessionTotal,24);
});
test("restore older persisted sessions derives the four-review gap",()=>{
 reset([],0);
 const saved={mode:"daily",total:20,done:0,index:0,
  immediate:d.slice(0,20).map(x=>x.id),learning:[],mixedOrder:true,
  history:d.slice(0,7).map(x=>({id:x.id,before:{reviews:2},countedDone:false}))};
 ctx.localStorage.getItem=()=>JSON.stringify(saved);
 assert.equal(ctx.restoreWordSession(),true);
 assert.equal(ctx.wordNonNewStreak,4);
 assert.equal(ctx.wordSessionQueue.length,20);
 assert.equal(ctx.includeMissingDailyNewInSession(),4);
 ctx.currentWordQueue();
 assert.equal(ids()[0],"new0");
});
test("restoring a previous five-review streak clamps at four without losing cards",()=>{
 reset([],0);
 const saved={mode:"daily",total:20,done:0,index:0,immediate:d.slice(0,20).map(w=>w.id),
   learning:[],mixedOrder:true,newGap:5,history:[]};
 ctx.localStorage.getItem=()=>JSON.stringify(saved);
 assert.equal(ctx.restoreWordSession(),true);
 assert.equal(ctx.wordNonNewStreak,4);
 assert.equal(ctx.wordSessionQueue.length,20);
 assert.equal(ctx.includeMissingDailyNewInSession(),4);
 ctx.currentWordQueue();
 assert.equal(ids()[0],"new0");
});
test("undo and local save store the pre-rating gap",()=>{
 assert.ok(html.includes("newGapBefore:wordNonNewStreak"));
 assert.ok(html.includes("wordNonNewStreak=h.newGapBefore"));
 assert.ok(html.includes("newGap:wordNonNewStreak"));
 assert.ok(html.includes('wordNonNewStreak=before?.reviews>0?Math.min(4,wordNonNewStreak+1):0'));
});
console.log("Anki interleaving regression suite: 10 scenarios verified.");
