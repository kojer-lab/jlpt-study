/**
 * Export the exact 100 JLPT listening questions without executing the browser UI.
 * MP3 filenames contain a UTF-16 FNV-1a signature of the spoken text and voices,
 * so a later content change cannot accidentally play an obsolete recording.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {join} from "node:path";
import vm from "node:vm";

const root=process.cwd();
const html=readFileSync(join(root,"index.html"),"utf8");
const intro="const aiListeningProblems=";
const begin=html.indexOf(intro);
const end=html.indexOf("\naiListeningProblems.push(",begin);
if(begin<0||end<0)throw new Error("Cannot isolate the 3 built-in listening questions");
const expression=html.slice(begin+intro.length,end).trim().replace(/;\s*$/,"");
const core=vm.runInNewContext(expression,Object.create(null),{timeout:3000});
const context={window:{}};
vm.runInNewContext(readFileSync(join(root,"data/n1-extra-listening.js"),"utf8"),context,{timeout:3000});
const additional=context.window.N1_EXTRA_LISTENING;
if(!Array.isArray(core)||!Array.isArray(additional))throw new Error("Invalid listening question source");
const problems=[...core,...additional];
if(problems.length!==100)throw new Error(`Expected 100 listening problems, found ${problems.length}`);
const voices=new Set(["jf_alpha","jf_tebukuro","jm_kumo"]);
function signature(p){
 const body=JSON.stringify(p.lines.map(line=>[line[0],line[1]]));
 let hash=2166136261;
 for(let i=0;i<body.length;i++)hash=Math.imul(hash^body.charCodeAt(i),16777619);
 return (hash>>>0).toString(16).padStart(8,"0");
}
const seen=new Set();
const items=problems.map((p,index)=>{
 if(!Array.isArray(p.lines)||p.lines.length<2)throw new Error(`Question ${index+1}: invalid lines`);
 for(const line of p.lines){
  if(!Array.isArray(line)||typeof line[0]!=="string"||!line[0].trim()||!voices.has(line[1]))throw new Error(`Question ${index+1}: invalid voice/text`);
 }
 const key=signature(p);
 if(seen.has(key))throw new Error(`Duplicate spoken script signature: ${key}`);
 seen.add(key);
 return {index:index+1,key,path:`audio/listening/q${String(index+1).padStart(3,"0")}-${key}.mp3`,lines:p.lines.map(x=>[x[0],x[1]])};
});
const dir=join(root,"audio/listening");
mkdirSync(dir,{recursive:true});
if(process.argv.includes("--manifest")){
 const missing=items.filter(item=>!existsSync(join(root,item.path)));
 if(missing.length)throw new Error(`Cannot publish listening MP3 manifest: ${missing.length} clips are missing`);
 const files=Object.fromEntries(items.map(item=>[item.key,item.path]));
 writeFileSync(join(dir,"manifest.json"),JSON.stringify({version:1,format:"mp3",count:items.length,files},null,2)+"\n");
 console.log(`PASS: manifest contains ${items.length} finished question MP3s`);
}else{
 writeFileSync(join(dir,"source.json"),JSON.stringify({version:1,count:items.length,lines:items.reduce((sum,item)=>sum+item.lines.length,0),items},null,2)+"\n");
 console.log(`Listening source exported: ${items.length} questions / ${items.reduce((sum,item)=>sum+item.lines.length,0)} voice lines`);
}
