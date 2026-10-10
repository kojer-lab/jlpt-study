// Regression: focus-learning detection is based on mature review failures
// occurring on three distinct calendar days within a rolling 30-day window.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
 .filter(m=>!/\bsrc\s*=/.test(m[1])).map(m=>m[2]);
for(const code of scripts)new vm.Script(code);
const src=scripts.join("\n");
function extract(start,end){
 const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
 assert(a>=0&&b>a,"Missing "+start+" -> "+end);
 return src.slice(a,b);
}
const ctx=vm.createContext({state:{settings:{desiredRetention:.9},fsrsProfile:{stabilityScale:1}},Date,Math,JSON,Number});
vm.runInContext("const DAY=86400000,MIN=60000;function now(){return Date.now()};"+
 extract("const FSRS_W=","function fsrsEligibleReviews(")+
 extract("function fsrsShortTermStability(","function rateWord(")+
 extract("function nextLocalDayStart(","function deferWordForFocus("),ctx);
const t=new Date("2026-10-10T12:00:00+09:00").getTime(),day=86400000,minute=60000;
const mature={reviews:9,state:"review",firstStudyDay:"2026-09-01",last:t-day,due:t,stability:2,difficulty:5,lapses:4,reviewFailureDays:[]};
let x=ctx.scheduleFsrs(mature,"again",t);
assert.equal(x.reviewFailureDays.length,1,"First mature failure counted once");
assert.equal(x.reviewFailureDays[0],"2026-10-10");
assert.equal(x.focusPending,undefined,"One review failure is not enough");
assert.equal(x.due,t+10*minute,"Learning retry is still 10 minutes");
// Five extra learning failures the same day must not count as another failed review day.
for(let i=0;i<5;i++)x=ctx.scheduleFsrs(x,"again",t+(i+1)*10*minute);
assert.equal(x.reviewFailureDays.length,1,"Relearning attempts are not counted");
assert.equal(x.focusPending,undefined,"No five-consecutive-misses focus rule");
x=ctx.scheduleFsrs(x,"good",t+75*minute);
assert.equal(x.state,"review");
const nextDay=t+day;
x=ctx.scheduleFsrs(x,"again",nextDay);
assert.equal(x.reviewFailureDays.length,2);
assert.equal(x.focusPending,undefined);
x=ctx.scheduleFsrs(x,"hard",nextDay+10*minute);
assert.equal(x.reviewFailureDays.length,2,"Hard during relearning does not count");
x=ctx.scheduleFsrs(x,"good",nextDay+30*minute);
const thirdDay=t+2*day;
x=ctx.scheduleFsrs(x,"again",thirdDay);
assert.deepEqual(Array.from(x.reviewFailureDays),["2026-10-10","2026-10-11","2026-10-12"]);
assert.equal(x.focusPending,true,"Three distinct mature review failures trigger focus");
assert.equal(x.focusUntil,ctx.nextLocalDayStart(thirdDay),"Focus begins on next local day");
assert(x.due>=x.focusUntil,"No competing 10-minute general review");
assert.equal(x.state,"relearning");
const afterAgain=ctx.scheduleFsrs(x,"again",thirdDay+10*minute);
assert.equal(afterAgain.reviewFailureDays.length,3,"Suspended focus card cannot accumulate failures");
assert.equal(afterAgain.focusPending,true);
// A card first learned today is not counted even if prematurely in the review state.
const firstToday={...mature,firstStudyDay:"2026-10-10",reviewFailureDays:[]};
assert.equal(ctx.scheduleFsrs(firstToday,"again",t).reviewFailureDays.length,0);
const newCard=ctx.scheduleFsrs({reviews:0,state:"new"},"again",t);
assert.equal(newCard.reviewFailureDays.length,0);
// Older SRS records remain intact and don't trigger focus retroactively.
const legacy={...mature,lapses:100};
delete legacy.reviewFailureDays;
assert.equal(ctx.scheduleFsrs(legacy,"good",t).focusPending,undefined);
// Rolling window: a failed review 30+ calendar days ago is no longer counted.
const oldDates={...mature,reviewFailureDays:["2026-09-09","2026-09-11","2026-10-09"]};
const current=ctx.scheduleFsrs(oldDates,"again",t);
assert.deepEqual(Array.from(current.reviewFailureDays),["2026-09-11","2026-10-09","2026-10-10"]);
assert.equal(current.focusPending,true);
const expired={...mature,reviewFailureDays:["2026-09-09","2026-09-10","2026-10-09"]};
const stillTwo=ctx.scheduleFsrs(expired,"again",t);
assert.deepEqual(Array.from(stillTwo.reviewFailureDays),["2026-10-09","2026-10-10"]);
assert.equal(stillTwo.focusPending,undefined);
const rating=extract('const isQuick=!!wordQuickActive&&wordQuickActive.id===currentId','$("undoWordRating").addEventListener("click"');
assert(rating.includes("const toFocus=!before?.focusPending&&after.focusPending===true;"));
assert(!rating.includes("wordSessionFails"),"Old same-session five-failure counter must be gone");
const lesson=extract('function renderFocusStudy(){','function startFocusStudy(){');
assert(lesson.includes("서로 다른 3일"),"Explain criterion in focus lesson");
const focused=extract('$("focusRating").addEventListener("click"','$("focusLesson").addEventListener("click"');
assert(focused.includes("x.reviewFailureDays=[]"),"Reset review failures after successful focus study");
assert(focused.includes('rating==="again"'),"Failed focus returns tomorrow");
assert(src.includes('if(r.focusPending)return "집중 학습"'),"Focused cards show even if mastery is high");
console.log("PASS: 3 distinct mature review-failure days within 30 days; no new/quick retries; clean focus return");
