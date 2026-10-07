import { readFile, writeFile, mkdir } from "node:fs/promises";
import vm from "node:vm";

const html=await readFile("index.html","utf8");
const match=html.match(/const words=(\[[\s\S]*?\]);\s*\n\nconst quizData=/);
if(!match)throw new Error("Could not find words array in index.html");

const context={};
vm.createContext(context);
const words=vm.runInContext(`(()=>{const F=(b,r)=>'<span class="furi" data-r="'+r+'">'+b+'</span>';return ${match[1]}})()`,context);

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

const items=[];
for(const w of words){
  items.push({id:w.id,kind:"word",index:null,text:readingText(w.w),voice:"jf_alpha",path:`audio/vocab/${w.id}-word.wav`});
  for(const [i,ex] of w.examples.entries()){
    items.push({id:w.id,kind:"example",index:i,text:baseText(ex.jp),voice:"jf_alpha",path:`audio/vocab/${w.id}-ex${i+1}.wav`});
  }
}
await mkdir("audio/vocab",{recursive:true});
await writeFile("audio/vocab/source.json",JSON.stringify({version:2,count:items.length,items},null,2)+"\n");
console.log(`Exported ${items.length} clips for ${words.length} words.`);
