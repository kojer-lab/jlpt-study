import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import vm from "node:vm";

const html=await readFile("index.html","utf8");
const match=html.match(/const words=(\[[\s\S]*?\]);\s*\n\nconst quizData=/);
if(!match)throw new Error("Could not find words array in index.html");

const context={};
vm.createContext(context);
const baseWords=vm.runInContext(`(()=>{const F=(b,r)=>'<span class="furi" data-r="'+r+'">'+b+'</span>';return ${match[1]}})()`,context);

// Load every external vocabulary bank automatically.
// Any future data/n1-extra-words-*.js file is included without editing this script.
const dataFiles=(await readdir("data"))
  .filter(name=>/^n1-extra-words-.*\.js$/.test(name))
  .filter(name=>name!=="n1-extra-words-openjlpt.js")
  .sort();

const extraWords=[];
for(const file of dataFiles){
  const src=await readFile("data/"+file,"utf8");
  const eq=src.indexOf("=");
  if(eq<0)continue;
  const raw=src.slice(eq+1).trim().replace(/;\s*$/,"");
  const list=JSON.parse(raw);
  if(Array.isArray(list))extraWords.push(...list);
}

const baseText=html=>String(html)
  .replace(/<span class="furi" data-r="[^"]*">([^<]*)<\/span>/g,"$1")
  .replace(/<[^>]+>/g,"")
  .replace(/&nbsp;/g," ")
  .replace(/&amp;/g,"&");

const readingText=html=>String(html)
  .replace(/<span class="furi" data-r="([^"]*)">[^<]*<\/span>/g,"$1")
  .replace(/<[^>]+>/g,"")
  .replace(/&nbsp;/g," ")
  .replace(/&amp;/g,"&");

const normalizedExtras=extraWords.map(w=>({
  id:w.id,
  w:w.w,
  reading:w.r||"",
  examples:Array.isArray(w.examples)?w.examples:[],
  source:w.source||"curated"
}));

const seen=new Set();
const words=[];
for(const w of baseWords){
  if(!w||!w.id||seen.has(w.id))continue;
  seen.add(w.id);
  words.push({id:w.id,w:w.w,reading:readingText(w.w),examples:w.examples||[]});
}
for(const w of normalizedExtras){
  if(!w||!w.id||seen.has(w.id))continue;
  seen.add(w.id);
  words.push(Object.assign({source:"curated"},w));
}

const items=[];
for(const w of words){
  const wordText=(w.reading||readingText(w.w)||baseText(w.w)).trim();
  const imported=String(w.source||"").toLowerCase()==="openjlpt";
  if(wordText)items.push({id:w.id,kind:"word",index:null,text:wordText,voice:"jf_alpha",path:imported?`audio/vocab/openjlpt/${w.id}-word.mp3`:`audio/vocab/${w.id}-word.wav`});
  // Imported N1 bank: pre-generate the word pronunciation only.
  // Its example audio stays on-demand in the browser cache to keep the repo compact.
  if(imported)continue;
  for(const [i,ex] of (w.examples||[]).entries()){
    const text=baseText(ex.jp||"").trim();
    if(!text)continue;
    items.push({id:w.id,kind:"example",index:i,text,voice:"jf_alpha",path:`audio/vocab/${w.id}-ex${i+1}.wav`});
  }
}
await mkdir("audio/vocab",{recursive:true});
await writeFile("audio/vocab/source.json",JSON.stringify({version:3,wordCount:words.length,count:items.length,items},null,2)+"\n");
console.log(`Loaded ${baseWords.length} inline + ${extraWords.length} external entries from ${dataFiles.length} files.`);
console.log(`Exported ${items.length} clips for ${words.length} unique words.`);
