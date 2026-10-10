// Grammar furigana regression tests. Runs without a browser or new dependencies.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const source=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(x=>!/\bsrc\s*=/.test(x[1])).map(x=>x[2]).join("\n");
function between(a,b){
 const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
 assert(i>=0&&j>i,"Missing: "+a+" -> "+b);
 return source.slice(i,j);
}
assert(html.includes('id="quizFuriganaTip"'));
assert(source.includes('classList.toggle("hidden",quizMode!=="grammar")'));
assert(source.includes('classList.toggle("hidden",entry.type!=="grammar")'));
assert(source.includes('return quizMode==="grammar"?enrichGrammarFurigana(markup):markup;'));
const opts=[
 {classList:{added:[],add(x){this.added.push(x)}},dataset:{},disabled:false},
 {classList:{added:[],add(x){this.added.push(x)}},dataset:{},disabled:false},
 {classList:{added:[],add(x){this.added.push(x)}},dataset:{},disabled:false}
];
const gradeCtx={$:id=>id==="quizChoices"?{children:opts}:null};
vm.runInNewContext(between("function lockQuizAnswerChoices(","// Supplement grammar furigana"),gradeCtx);
gradeCtx.lockQuizAnswerChoices({a:1},0);
assert(opts.every(x=>x.disabled===false&&x.dataset.answerLocked==="true"));
assert(opts[0].classList.added.includes("wrong"));
assert(opts[1].classList.added.includes("correct"));
const handler=between('$("quizChoices").addEventListener("click"', '$("quizExplanation").addEventListener("click"');
assert(handler.includes('if(e.target.closest(".furi"))return;'),"Tapping furigana must not grade");
assert(handler.includes('if(quizAnswered)return;'),"Further answers must be ignored");
assert(!handler.includes("disabled=true"),"Never disable clickable ruby buttons");
const retryHandler=between("function answerMistakeRetry(","function startQuiz(");
assert(retryHandler.includes("lockQuizAnswerChoices(item,idx)"));
const sampleBank={one:{passage:'<span class="furi" data-r="はんたい">反対</span>を<span class="furi" data-r="しょうち">承知</span>する<span class="furi" data-r="うえ">上</span>で',questions:[{q:'<span class="furi" data-r="じょう">上</span>には',c:[]}]}};
const ctx={window:{N1_READING_FURIGANA:sampleBank}};
const extra=between("let grammarExtraFuriIndex=null;","function enrichGrammarFurigana(");
vm.runInNewContext(extra,ctx);
const map=ctx.grammarFuriganaLexicon();
assert.equal(map.get("反")[0].reading,"はんたい");
assert.equal(map.get("承")[0].reading,"しょうち");
assert.equal(map.has("上"),false,"Conflicting kanji readings must not be invented");
console.log("PASS: grammar question, options, post-answer ruby taps, explanations and attested readings");
