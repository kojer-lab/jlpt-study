// Verify exact Anki learning intervals and that first-day cards aren't leeches.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
 .filter(m=>!/\bsrc\s*=/.test(m[1])).map(m=>m[2]);
const src=scripts.join("\n");
for(const script of scripts)new vm.Script(script);
function extract(start,end){
 const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
 assert(a>=0&&b>a,"Missing code region "+start);
 return src.slice(a,b);
}
const state={settings:{desiredRetention:.90},fsrsProfile:{stabilityScale:1},srs:{}};
const sandbox=vm.createContext({state,Date,Math,Number,JSON});
vm.runInContext("const DAY=86400000,MIN=60000;function now(){return Date.now()};"+
 extract("const FSRS_W=","function fsrsEligibleReviews(")+
 extract("function fsrsShortTermStability(","function rateWord("),sandbox);
const when=new Date("2026-10-10T12:00:00+09:00").getTime(),MIN=60000,DAY=86400000;
const fromNew={reviews:0,state:"new"};
const again=sandbox.scheduleFsrs(fromNew,"again",when);
assert.equal(again.due-when,10*MIN,"New card Again = precisely 10min");
assert.equal(again.state,"learning");
assert.equal(again.firstStudyDay,"2026-10-10");
const hard=sandbox.scheduleFsrs(fromNew,"hard",when);
assert.equal(hard.due-when,15*MIN,"New card Hard = precisely 15min");
assert.equal(hard.state,"learning");
const good=sandbox.scheduleFsrs(fromNew,"good",when),easy=sandbox.scheduleFsrs(fromNew,"easy",when);
assert.equal(good.state,"review");
assert.equal(easy.state,"review");
assert(good.due-when>=DAY && easy.due>good.due);
assert.equal(sandbox.nextPreview(fromNew,"again"),"10분");
assert.equal(sandbox.nextPreview(fromNew,"hard"),"15분");
const back=sandbox.scheduleFsrs(again,"again",when+10*MIN);
assert.equal(back.due-(when+10*MIN),10*MIN,"Repeated Again never drops to 1min");
const struggling=sandbox.scheduleFsrs(again,"hard",when+10*MIN);
assert.equal(struggling.due-(when+10*MIN),15*MIN,"Hard after Again is 15min");
const review={...good,reviews:3,state:"review",last:when-DAY,due:when};
const reviewAgain=sandbox.scheduleFsrs(review,"again",when);
assert.equal(reviewAgain.due-when,10*MIN,"Failed old card: 10m relearning");
assert.equal(reviewAgain.state,"relearning");
const reviewHard=sandbox.scheduleFsrs(review,"hard",when);
assert.equal(reviewHard.state,"review","Hard on established review stays FSRS");
assert(reviewHard.due-when>=DAY,"Hard on established review is day-based");
assert.equal(sandbox.focusMissEligible(again,when+5*MIN),false,"First-day learning is exempt");
assert.equal(sandbox.focusMissEligible(again,when+DAY),true,"Later calendar day is eligible");
assert.equal(sandbox.focusMissEligible({reviews:3},when),true,"Existing legacy progress remains eligible");
assert.equal(sandbox.focusMissEligible(fromNew,when),false,"Never-studied cards are exempt");
assert(!extract("function promoteQuickWord(){","function persistWordSession(){").includes("wordSessionQueue.unshift"),"No early turn-based shortcut");
const grading=extract('const failsBefore=Number(wordSessionFails[currentId])','$("undoWordRating").addEventListener("click"');
assert(grading.includes("focusMissEligible(getSrs(currentId))"),"Misses are only counted after the first calendar day");
assert(!grading.includes("wordQuickRepeats.push("),"Ratings don't schedule early repeats");
const restore=extract("function restoreWordSession(){","function clearWordSession(){");
assert(restore.includes("for(const entry of data.quick||[])"),"Legacy quick repeats migrate");
assert(restore.includes("queueLearningCard(wordLearningQueue,w)"),"Legacy repeats honor due-time queue");
console.log("PASS: Again 10m, Hard 15m, FSRS day-scale Good/Easy/review Hard, first-day exemption, no early repeats");
