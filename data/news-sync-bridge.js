/* Private per-user sync for saved JLPT news expressions and reading positions.
 * The main JLPT app owns the Supabase authentication session.
 * Existing Anki/SRS progress remains in its original table and is never mutated here.
 */
(function(){
"use strict";
const EXPR="jlpt-news-expression-test-v2";
const PROGRESS="jlptNewsReadProgressV1";
const TOMBSTONES="jlptNewsDeletedExpressionsV1";
const TABLE="jlpt_news_user_items";
const MAX_ROWS=1500;
let working=false,requested=false,timer=null,currentUser=null;
const $=id=>document.getElementById(id);
function storageRead(k,fallback){try{const v=JSON.parse(localStorage.getItem(k)||"null");return v===null?fallback:v}catch{return fallback}}
function save(k,value){localStorage.setItem(k,JSON.stringify(value))}
function timestamp(value){if(typeof value==="number")return Number.isFinite(value)?value:0;if(!value)return 0;const n=Date.parse(value);return Number.isFinite(n)?n:0}
function items(){
 const results=new Map();
 const stored=storageRead(EXPR,[]);
 for(const expression of Array.isArray(stored)?stored:[]){
  if(!expression||typeof expression.id!=="string"||!expression.id||expression.id.length>200)continue;
  const stamp=timestamp(expression.updatedAt)||timestamp(expression.savedAt)||1;
  const data={...expression,updatedAt:stamp};
  results.set("expression:"+expression.id,{item_type:"expression",item_key:expression.id,data,ts:stamp});
 }
 const deleted=storageRead(TOMBSTONES,{});
 for(const [id,value] of Object.entries(deleted&&typeof deleted==="object"?deleted:{})){
  const ts=timestamp(value);if(!ts||id.length>200)continue;
  const key="expression:"+id;const current=results.get(key);
  if(!current||current.ts<ts)results.set(key,{item_type:"expression",item_key:id,data:{id,deleted:true,updatedAt:ts},ts});
 }
 const progress=storageRead(PROGRESS,{});
 for(const [id,p] of Object.entries(progress&&typeof progress==="object"?progress:{})){
  if(!p||id.length>200||!Number.isInteger(p.index))continue;
  const ts=timestamp(p.updatedAt);if(!ts)continue;
  results.set("progress:"+id,{item_type:"progress",item_key:id,ts,data:{index:Math.max(0,p.index),offset:Math.max(0,Math.min(1300,Number(p.offset)||0)),completedAt:Math.max(0,Number(p.completedAt)||0),updatedAt:ts}});
 }
 return results;
}
function markDeleted(id){
 if(typeof id!=="string"||!id)return;
 const d=storageRead(TOMBSTONES,{});
 d[id]=Date.now();
 save(TOMBSTONES,d);
 schedule();
}
function applyRemote(type,key,data,ms){
 if(type==="expression"){
  const savedItems=storageRead(EXPR,[]);
  const arr=Array.isArray(savedItems)?savedItems:[];
  const remote={...data,id:key,updatedAt:ms};
  const without=arr.filter(x=>x.id!==key);
  if(data.deleted){
   save(EXPR,without);
   const tomb=storageRead(TOMBSTONES,{});
   tomb[key]=ms;save(TOMBSTONES,tomb);
  }else{
   save(EXPR,[...without,remote]);
   const tomb=storageRead(TOMBSTONES,{});
   if(timestamp(tomb[key])<=ms){delete tomb[key];save(TOMBSTONES,tomb)}
  }
 }else if(type==="progress"&&Number.isInteger(data.index)){
  const all=storageRead(PROGRESS,{});
  all[key]={index:Math.max(0,data.index),offset:Math.max(0,Math.min(1300,Number(data.offset)||0)),completedAt:Math.max(0,Number(data.completedAt)||0),updatedAt:ms};
  save(PROGRESS,all);
 }
}
function available(){
 return typeof cloudClient!=="undefined"&&!!cloudClient&&typeof cloudUser!=="undefined"&&!!cloudUser&&navigator.onLine;
}
function status(message){
 const el=$("newsSyncState");if(el)el.textContent=message;
}
async function sync(){
 if(working){requested=true;return false}
 if(!available()){
  currentUser=null;
  status("뉴스 기록: 이 기기에 저장 · PC·모바일 동기화 메뉴에서 로그인 필요");
  return false;
 }
 if(currentUser&&currentUser!==cloudUser.id){currentUser=cloudUser.id;}
 else currentUser=cloudUser.id;
 working=true;requested=false;status("뉴스 기록: 동기화 중…");
 let updated=false,errors=0;
 try{
  const {data:remote,error}=await cloudClient.from(TABLE).select("item_type,item_key,data,updated_at").eq("user_id",cloudUser.id).limit(MAX_ROWS);
  if(error)throw error;
  const current=items();
  const remoteMap=new Map;
  for(const item of Array.isArray(remote)?remote:[]){
   if(!item||!["expression","progress"].includes(item.item_type)||typeof item.item_key!=="string")continue;
   remoteMap.set(item.item_type+":"+item.item_key,item);
  }
  // Merge all known keys individually. A guarded RPC prevents an old device from overwriting newer rows.
  const allKeys=new Set([...current.keys(),...remoteMap.keys()]);
  for(const id of allKeys){
   if(currentUser!==cloudUser?.id)break;
   const existing=items().get(id);
   const cloud=remoteMap.get(id);
   const remoteTime=timestamp(cloud?.updated_at);
   const localTime=existing?.ts||0;
   if(cloud&&remoteTime>localTime){
    applyRemote(cloud.item_type,cloud.item_key,cloud.data||{},remoteTime);
    updated=true;
    continue;
   }
   if(existing&&(!cloud||localTime>remoteTime)){
    const {error:saveError}=await cloudClient.rpc("jlpt_news_merge_item",{
     p_item_type:existing.item_type,
     p_item_key:existing.item_key,
     p_data:existing.data,
     p_updated_at:new Date(existing.ts).toISOString()
    });
    if(saveError){errors++;console.warn("뉴스 항목 동기화 실패",saveError.message)}
   }
  }
  if(updated)window.dispatchEvent(new Event("kojer-news:updated"));
  status(errors?"뉴스 기록: 일부 항목 동기화 실패 ("+errors+"건)":"뉴스 기록: PC·아이폰 동기화 완료");
  return !errors;
 }catch(e){status("뉴스 동기화 오류 · 로컬 기록은 유지됨");console.warn("뉴스 동기화 오류",e);return false}
 finally{working=false;if(requested)schedule(650);}
}
function schedule(delay=2200){clearTimeout(timer);timer=setTimeout(sync,delay)}
window.KOJER_NEWS_SYNC={sync,schedule,markDeleted,localEntries:items};
const manual=$("newsSyncButton");if(manual)manual.addEventListener("click",()=>sync());
window.addEventListener("kojer-news:changed",()=>schedule());
window.addEventListener("focus",()=>{if(!document.hidden)schedule(500)});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedule(550)});
window.addEventListener("online",()=>schedule(700));
setInterval(()=>{if(!document.hidden&&available())schedule(600)},45000);
schedule(1600);
})();