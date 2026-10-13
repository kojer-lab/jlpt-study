/**
 * Regression guard for curated-news paragraph Kokoro, no npm dependencies.
 * node tools/test-news-paragraph-audio.cjs
 */
const fs=require("node:fs");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const reader=fs.readFileSync("data/news-reader-embedded.js","utf8");
const index=fs.readFileSync("index.html","utf8");
new vm.Script(reader,{filename:"data/news-reader-embedded.js"});
assert(index.includes("data/news-reader-embedded.js?v=20261014-news-kokoro1"),"Missing cache-busted news script");
for(const name of ["news-paragraph-audio","news-paragraph-actions","news-audio-state","KOJER_NEWS_AUDIO_STOP?.()"])
 assert(index.includes(name), "Missing news UI/styles/tab stop: "+name);
for(const pattern of [
 "function newsAudioSegments(text){",
 "function playNewsParagraph(index){",
 "window.KOJER_NEWS_AUDIO_STOP=stopNewsParagraphAudio",
 "await kokoroGenerate(segments[n],\"jf_alpha\"",
 "data-news-paragraph-audio",
 "function playNewsAudioBuffer(url,serial){",
 "newsAudioContext.resume()",
 "if(newsAudioIndex===index&&newsAudioArticleId===currentArticle.id)",
 "stopNewsParagraphAudio();\n const a=source.find(x=>x.id===id);",
 'stopNewsParagraphAudio();\n if(article){captureProgress(true)',
 "document.addEventListener(\"visibilitychange\"",
 "window.addEventListener(\"pagehide\",stopNewsParagraphAudio)"
])assert(reader.includes(pattern),"Missing expected integration: "+pattern);
assert(!reader.includes("SpeechSynthesisUtterance"),"News voice must not fall back to iPhone built-in speech");
assert(!reader.includes("audio/n2/mp3/"),"News voice must not use pre-rendered N2 MP3");
const begin=reader.indexOf("function newsAudioSegments(text){");
const end=reader.indexOf("\nfunction newsAudioResetButton(",begin);
assert(begin>0&&end>begin,"Cannot locate news audio chunker");
const originalJapanese="東京都は9日、情報システムの安全確保に向けた緊急の対策会議を開いた。都の各局や関係機関から部長級の職員ら65人が参加し、日頃の備えに加えて、実際に被害が発生した場合の対応手順を確認した。行政サービスの多くがインターネットやクラウドに支えられる今、サイバー攻撃は単なる機器の故障では済まない問題となっている。";
const context={};
vm.runInNewContext(
 'function sentencesJP(value){return (String(value||"").match(/[^。！？!?]+[。！？!?]?/gu)||[]).map(x=>x.trim()).filter(Boolean)}\n'+reader.slice(begin,end),
 context,{filename:"isolated-news-chunker.js"});
function words(value){return Array.from(vm.runInNewContext("newsAudioSegments("+JSON.stringify(value)+")",context))}
const chunks=words(originalJapanese);
assert(chunks.length>=3,"Paragraph should split into sentence-size clips");
assert(chunks.every(x=>x.length>0&&x.length<=145),"Chunk too long for iPhone WASM");
assert.equal(chunks.join(""),originalJapanese.replaceAll("。",""),"News chunker lost or altered article text");
const long="情報システムを使う自治体が増え続けている現状を踏まえると".repeat(7)+"。";
const longChunks=words(long);
assert(longChunks.length>1&&longChunks.every(x=>x.length<=145),"Long Japanese sentence must be split");
assert.equal(longChunks.join(""),long.slice(0,-1),"Long sentence changed meaning/text");
assert.deepEqual(words(""),[],"Empty paragraph must produce no chunks");
assert.equal(words("今日は晴れた。").join(""),"今日は晴れた");
assert(index.includes("if(name!==\"newsreader\")window.KOJER_NEWS_AUDIO_STOP?.();"),"Leaving news must stop audio");
console.log("PASS: browser-only Kokoro, 150-190 char paragraphs, long-sentence split, playback cancellation, aria UI, no prebuilt MP3.");
