/** Gate: inspect ACTUAL production article/title furigana renderer. */
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const read=p=>fs.readFileSync(p,"utf8");
// Always audit the newest published day, not a frozen 2026-10-18 test set.
const index=read("index.html");
const context=vm.createContext({window:{},console});
new vm.Script(read("data/news-index-v1.js"),{filename:"news-index-v1.js"}).runInContext(context);
const entries=context.window.KOJER_NEWS_INDEX?.articles||[];
assert(entries.length>0,"News index is empty");
const latestDate=entries.map(x=>x.date).sort().at(-1);
assert(/^\d{4}-\d{2}-\d{2}$/.test(latestDate),"Invalid latest news date");
const latest=entries.filter(x=>x.date===latestDate),ids=new Set(latest.map(x=>x.id));
assert(ids.size===latest.length&&latest.length>0,"Duplicate or missing latest article IDs");
const assets=[...new Set(latest.map(x=>x.asset))];
assert(assets.every(p=>/^data\/news-articles-\d{4}-\d{2}-\d{2}(?:-batch\d+)?\.json$/.test(p)),"Unsafe news asset");
const articles=assets.flatMap(path=>JSON.parse(read(path)).articles||[]).filter(x=>ids.has(x.id));
assert.equal(articles.length,latest.length,"Some indexed latest news articles are missing from their source data");
// Load dictionaries in the same order as the actual index.html tags.
// An unregistered new-day ruby asset must fail the coverage gate rather than
// silently producing missing furigana in the released app.
const scripts=[...index.matchAll(/<script\s+src="(data\/news-furi-[^"?]+\.js)(?:\?[^"]*)?"\s*><\/script>/g)].map(x=>x[1]);
assert(scripts.includes("data/news-furi-reviewed-v1.js"),"Base reviewed dictionary not loaded");
assert(scripts.length>=2,"No day-specific reviewed readings loaded");
for(const file of scripts){
 assert(index.indexOf(file)<index.indexOf("data/news-reader-embedded.js"),"Furigana dictionary must load before reader");
 new vm.Script(read(file),{filename:file}).runInContext(context);
}
const reader=read("data/news-reader-embedded.js");
const start=reader.indexOf("const extra=new Map();"),finish=reader.indexOf("function saved(){",start);
assert(start>0&&finish>start,"Cannot isolate production furigana renderer");
const prefix=[
 'const esc=s=>String(s??"").replace(/[&<>"\x27]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",[String.fromCharCode(34)]:"&quot;",[String.fromCharCode(39)]:"&#39;"}[c]));',
 'const archiveIndex=[],titleTranslations={},exampleFuriLexicon=new Map();',
 'let article=null;'
].join("\n")+"\n";
const expose="\nglobalThis.renderNewsFuri=(entry)=>{article=entry;return [titleHTML(entry.title),...entry.paragraphs.map(p=>paragraphHTML(p).html)]};";
new vm.Script(prefix+reader.slice(start,finish)+expose,{filename:"production-news-ruby-qa.js"}).runInContext(context);
const kanji=/[一-龯々〇]/u,entity={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'"};
const asText=text=>text.replace(/&(?:amp|lt|gt|quot|#39);/gu,m=>entity[m]||m);
function inspect(html,expected){
 const tokens=html.match(/<span class="furi" data-r="[^"]*">[^<]*<\/span>|<[^>]+>|[^<]+/gu)||[];
 const visible=[],covered=[];
 for(const token of tokens){
  if(token.startsWith('<span class="furi"')){
   const match=token.match(/^<span class="furi" data-r="([^"]+)">([^<]*)<\/span>$/u);
   assert(match&&match[1]&&/^[ぁ-ゖァ-ヺー]+$/u.test(asText(match[1])),"Malformed ruby reading");
   for(const c of [...asText(match[2])]){visible.push(c);covered.push(true)}
  }else if(!token.startsWith("<")){
   for(const c of [...asText(token)]){visible.push(c);covered.push(false)}
  }
 }
 assert.equal(visible.join(""),expected,"Ruby renderer altered article text");
 const misses=[];
 for(let i=0;i<visible.length;i++)if(kanji.test(visible[i])&&!covered[i]){
  let j=i+1;while(j<visible.length&&kanji.test(visible[j])&&!covered[j])j++;
  misses.push({word:visible.slice(i,j).join(""),context:visible.slice(Math.max(0,i-9),Math.min(visible.length,j+13)).join("")});
  i=j-1;
 }
 return misses;
}
const errors=[];let total=0;
for(const entry of articles){
 assert.equal(entry.date,latestDate);
 const htmls=context.renderNewsFuri(entry);
 const blocks=[["title",entry.title],...entry.paragraphs.map((p,i)=>["p"+(i+1),p])];
 assert.equal(htmls.length,blocks.length);
 for(let i=0;i<blocks.length;i++){
  const gaps=inspect(htmls[i],blocks[i][1]);
  total+=[...blocks[i][1]].filter(c=>kanji.test(c)).length;
  for(const gap of gaps)errors.push({article:entry.id,part:blocks[i][0],...gap});
 }
}
if(errors.length){
 console.error("FAIL "+latestDate+": "+errors.length+" unannotated kanji across "+articles.length+" articles ("+total+" total kanji).");
 for(const gap of errors)console.error(JSON.stringify(gap));
 process.exitCode=1;
}else console.log("PASS "+latestDate+": "+total+" kanji checked across "+articles.length+" titles and "+articles.reduce((n,x)=>n+x.paragraphs.length,0)+" paragraphs.");
