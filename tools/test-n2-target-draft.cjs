// N2 target bank source QA. Does NOT imply cards are ready for study.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const phases=[1,2,3,4,5].flatMap(n=>{
  const sandbox={window:{}};
  vm.runInNewContext(fs.readFileSync("data/n2-words-phase"+n+".js","utf8"),sandbox,{timeout:5000});
  return sandbox.window["N2_WORDS_PHASE"+n];
});
const draft=JSON.parse(fs.readFileSync("data/n2-target-2000-draft.json","utf8"));
assert.equal(phases.length,322);
assert.equal(draft.words.length,1678);
assert.equal(draft.meta.target_total,2000);
assert.equal(draft.meta.status,"source_candidates_only");
const cards=[...phases,...draft.words];
const canonical=s=>s.normalize("NFKC").replace(/\s+/g,"");
assert.equal(new Set(cards.map(x=>canonical(x.w))).size,2000,"duplicate headword in N2 target");
assert.equal(new Set(cards.map(x=>x.id)).size,2000,"duplicate N2 card ID");
assert.equal(cards.filter(x=>x.level==="N2").length,2000);
const promotedFromPhase=new Map();
const completed=[6,7,8,9,10,11,12,13].flatMap(n=>{
 const content=fs.readFileSync("data/n2-words-phase"+n+".js","utf8");
 const items=JSON.parse(content.slice(content.indexOf("=[")+1).replace(/;\s*$/,""));
 for(const item of items)promotedFromPhase.set(item.id,"data/n2-words-phase"+n+".js");
 return items;
});
assert.equal(completed.length,449);
const promotedIds=new Set(completed.map(x=>x.id));
assert.equal(promotedIds.size,449);
assert.equal(draft.words.filter(x=>x.qa_status==="reviewed_promoted").length,449);
assert.equal(draft.words.filter(x=>x.qa_status==="duplicate_exact_n1").length,9);
assert.equal(draft.words.filter(x=>x.qa_status==="needs_homograph_review").length,20);
assert.ok(draft.words.filter(x=>x.qa_status==="duplicate_exact_n1").every(x=>x.excluded_from_promotion));
for(const x of completed){
 const original=draft.words.find(y=>y.id===x.id);
 assert.ok(original&&original.promoted_in===promotedFromPhase.get(x.id));
 assert.equal(x.examples.length,1);
 assert.ok(x.examples[0].jp.length>=32&&x.examples[0].ko.length>=15);
}
for(const x of draft.words){
  assert.ok(x.w&&x.r&&x.meaning_en&&x.source_id);
  assert.ok(["needs_ko_and_long_example","reviewed_promoted","duplicate_exact_n1","needs_homograph_review"].includes(x.qa_status));
  assert.equal(x.examples,undefined,"draft must not load directly as a card");
  assert.equal(x.meaning,undefined,"English gloss must not be shown as Korean");
}
const html=fs.readFileSync("index.html","utf8");
assert.ok(html.includes("data/n2-words-phase6.js"));
assert.ok(html.includes("data/n2-words-phase7.js"));
assert.ok(html.includes("data/n2-words-phase8.js"));
assert.ok(html.includes("data/n2-words-phase9.js"));
assert.ok(html.includes("data/n2-words-phase10.js"));
assert.ok(html.includes("data/n2-words-phase11.js"));
assert.ok(html.includes("data/n2-words-phase12.js"));
assert.ok(html.includes("data/n2-words-phase13.js"));
assert.ok(!html.includes("n2-target-2000-draft.json"),"draft N2 must not load into live Anki");
const seeded=draft.words.filter(x=>x.example_seed_jp).length;
console.log("PASS: 322 production cards + 1678 draft source entries = 2000 unique N2 candidate headwords; "+seeded+" Japanese sentence seeds; live Anki unchanged.");
