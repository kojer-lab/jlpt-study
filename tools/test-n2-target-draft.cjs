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
const reviewedSource=fs.readFileSync("data/n2-words-phase6.js","utf8");
const reviewed=JSON.parse(reviewedSource.slice(reviewedSource.indexOf("=[")+1).replace(/;\\s*$/,""));
assert.equal(reviewed.length,49);
const promotedIds=new Set(reviewed.map(x=>x.id));
assert.equal(draft.words.filter(x=>x.qa_status==="reviewed_promoted").length,49);
for(const x of reviewed){
 const original=draft.words.find(y=>y.id===x.id);
 assert.ok(original&&original.promoted_in==="data/n2-words-phase6.js");
 assert.equal(x.examples.length,1);
 assert.ok(x.examples[0].jp.length>=32&&x.examples[0].ko.length>=15);
}
for(const x of draft.words){
  assert.ok(x.w&&x.r&&x.meaning_en&&x.source_id);
  assert.ok(x.qa_status==="needs_ko_and_long_example"||x.qa_status==="reviewed_promoted");
  assert.equal(x.examples,undefined,"draft must not load directly as a card");
  assert.equal(x.meaning,undefined,"English gloss must not be shown as Korean");
}
const html=fs.readFileSync("index.html","utf8");
assert.ok(html.includes("data/n2-words-phase6.js"));
assert.ok(!html.includes("n2-target-2000-draft.json"),"draft N2 must not load into live Anki");
const seeded=draft.words.filter(x=>x.example_seed_jp).length;
console.log("PASS: 322 production cards + 1678 draft source entries = 2000 unique N2 candidate headwords; "+seeded+" Japanese sentence seeds; live Anki unchanged.");
