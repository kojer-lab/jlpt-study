// Minimal regression checks for the inline Anki scheduler. No external packages.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>!/\bsrc\s*=/.test(m[1])).map(m=>m[2]);
assert(scripts.length>=1,"Expected inline application script");
for(let i=0;i<scripts.length;i++){new vm.Script(scripts[i],{filename:`index-inline-${i+1}.js`});}
const source=scripts.join("\n");
function section(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert(a>=0&&b>a,`Missing function boundary: ${start} / ${end}`);
 return source.slice(a,b);
}
const mixed=vm.runInNewContext(section("function interleaveDueAndNew(","function buildWordStudyQueue(")+"\ninterleaveDueAndNew");
const d=Array.from({length:12},(_,i)=>({id:"r"+(i+1)})),n=Array.from({length:3},(_,i)=>({id:"n"+(i+1)}));
assert.deepEqual(Array.from(mixed(d,n)).map(x=>x.id),["r1","r2","r3","r4","r5","n1","r6","r7","r8","r9","r10","n2","r11","r12","n3"]);
assert.deepEqual(Array.from(mixed([],n)).map(x=>x.id),["n1","n2","n3"]);
assert.deepEqual(Array.from(mixed(d,[])).map(x=>x.id),d.map(x=>x.id));
assert.equal(mixed([{id:"one"}],[{id:"one"},{id:"two"}]).length,2,"Duplicate words should appear only once");
const state={a:{reviews:2,due:0},b:{reviews:2,due:0,focusPending:true,focusUntil:20000},c:{reviews:0,due:0}};
const context={words:[{id:"a"},{id:"b"},{id:"c"}],getSrs:id=>state[id],setSrs:(id,s)=>state[id]=s,now:()=>10000,Date};
vm.runInNewContext(section("function focusPendingWords(","function unseenWords("),context);
assert.deepEqual(Array.from(context.dueWords()).map(x=>x.id),["a"]);
assert.equal(context.focusDueWords().length,0,"Deferred cards must wait until tomorrow");
context.deferWordForFocus("a");
assert.equal(state.a.focusPending,true);
assert(state.a.focusUntil>10000&&state.a.due>=state.a.focusUntil);
assert.deepEqual(Array.from(context.dueWords()).map(x=>x.id),[]);
assert.equal(context.focusPendingWords().length,2);
console.log("PASS: inline JavaScript syntax, review:new 5:1, focus deferral and FSRS selection");