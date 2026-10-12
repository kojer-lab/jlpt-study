/**
 * Create independent 96 / 64 kbps MP3 comparisons from the already-approved
 * 128 kbps browser Kokoro examples. The 128 kbps production audio is READ ONLY.
 * The lower bitrate comparison is a real MP3 -> MP3 conversion test; if chosen
 * for production, this is exactly the same process we can apply in bulk.
 *
 * Run: node tools/make-audio-bitrate-qa.mjs
 */
import {readFile,writeFile,mkdir,stat} from "node:fs/promises";
import {resolve,join,basename} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

const root=resolve(".");
const outFolder="audio/vocab/bitrate-qa-20";
const outDir=join(root,outFolder);
const originalDir="audio/vocab/";
const source=JSON.parse(await readFile(join(root,"audio/vocab/browser-qa-20/manifest.json"),"utf8"));
if(source.count!==20||source.items.length!==20)throw new Error("The approved QA sample must contain 20 examples");
const hash=data=>createHash("sha256").update(data).digest("hex");
const getProbe=file=>{
 const output=execFileSync("ffprobe",["-v","error","-show_entries","stream=codec_name,sample_rate,channels:format=duration,bit_rate","-of","json",file],{encoding:"utf8"});
 const json=JSON.parse(output),stream=json.streams?.[0],duration=Number(json.format?.duration),bitrate=Number(json.format?.bit_rate);
 if(stream?.codec_name!=="mp3"||stream?.sample_rate!=="24000"||stream?.channels!==1||!(duration>.25&&duration<45))
  throw new Error("Audio codec/sample rate mismatch: "+file);
 return {duration,bitrate};
};
await mkdir(outDir,{recursive:true});
const result=[];
for(let i=0;i<source.items.length;i++){
 const row=source.items[i];
 if(row.kind!=="example"||!row.original_path.startsWith(originalDir)||!row.original_path.endsWith(".mp3")||
    row.original_path.includes("..")||!row.text?.trim()){
  throw new Error("Invalid existing example path: "+row.original_path);
 }
 const original=join(root,row.original_path);
 await stat(original);
 const oldBytes=await readFile(original),before=hash(oldBytes),originInfo=getProbe(original);
 if(!(originInfo.bitrate>=120000&&originInfo.bitrate<=135000))
  throw new Error("Not an existing 128 kbps MP3: "+row.original_path+" ("+originInfo.bitrate+")");
 const name=basename(row.original_path,".mp3");
 const clips={"128":{path:row.original_path,bytes:oldBytes.length,sha256:before,duration_s:+originInfo.duration.toFixed(3)}};
 for(const bitrate of [96,64]){
  const targetRelative=outFolder+"/"+name+"-"+bitrate+"k.mp3",target=join(root,targetRelative);
  // Recompress the already-generated 128 kbps MP3, do NOT synthesize again.
  execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-nostdin","-y",
    "-i",original,"-map","0:a:0","-vn","-map_metadata","-1","-c:a","libmp3lame",
    "-ar","24000","-ac","1","-b:a",bitrate+"k",target],{timeout:45000});
  const bytes=await readFile(target),info=getProbe(target);
  if(!(info.bitrate>=bitrate*1000*.95&&info.bitrate<=bitrate*1000*1.10)||
   Math.abs(info.duration-originInfo.duration)>.15||bytes.length>=oldBytes.length||bytes.length<2000){
   throw new Error("Invalid converted sample "+targetRelative);
  }
  clips[String(bitrate)]={path:targetRelative,bytes:bytes.length,sha256:hash(bytes),duration_s:+info.duration.toFixed(3)};
 }
 if(hash(await readFile(original))!==before)throw new Error("The 128 kbps production file changed: "+row.original_path);
 result.push({index:i+1,word_id:row.word_id,example_index:row.index,text:row.text,audio:clips});
 console.log("CHECKED",i+1,"/20",row.original_path,
  "128:",clips["128"].bytes,"96:",clips["96"].bytes,"64:",clips["64"].bytes);
}
const totals=Object.fromEntries([128,96,64].map(k=>[String(k),result.reduce((a,x)=>a+x.audio[String(k)].bytes,0)]));
const manifest={version:1,count:result.length,codec:"mp3",voice:"jf_alpha",sample_rate:24000,
 source:"approved browser Kokoro re-generated examples (already 128kbps)",
 process:"libmp3lame MP3-to-MP3 conversion; no new synthesis",
 production_replaced:false,options_kbps:[128,96,64],total_bytes:totals,items:result};
await writeFile(join(outDir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log("PASS: 20 blind bitrate comparison sets ready. All 128 kbps production MP3s untouched.");
