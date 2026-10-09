import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { DOMParser } from "npm:linkedom@0.18.12";
import { Readability } from "npm:@mozilla/readability@0.6.0";
// User-initiated, authenticated, transient reading of publicly accessible news.
// No paywall bypass, no persistent article cache, no batch scraping.
const ORIGIN = "https://kojer-lab.github.io";
const CORS = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
const ok = (body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const HOSTS = new Set([
 "news.google.com","news.web.nhk","ja.wikinews.org","www3.nhk.or.jp","www.nhk.or.jp",
 "www.asahi.com","www.yomiuri.co.jp","mainichi.jp","www.nikkei.com",
 "news.yahoo.co.jp","www.nikkansports.com","www.sponichi.co.jp",
 "www.oricon.co.jp","news.tv-asahi.co.jp","www.fnn.jp","www.tokyo-np.co.jp",
 "www.jiji.com","www.sankei.com","www.kyodonews.jp","kyodonews.jp",
 "www.reuters.com","jp.reuters.com","www.bbc.com","www.digital.go.jp","www.meti.go.jp",
 "www.cao.go.jp","www3.nhk.or.jp","news.livedoor.com","cinema.eiga.com",
]);
function validUrl(value: string) {
 try{
  const u=new URL(value);
  return u.protocol==="https:" && !u.username && !u.password && u.port==="" && HOSTS.has(u.hostname.toLowerCase()) && !/\.{2,}/.test(u.hostname);
 } catch{return false;}
}
async function checkedFetch(initial: string) {
 let url=initial;
 for(let i=0;i<4;i++){
  if(!validUrl(url))throw new Error("지원하지 않는 뉴스 출처입니다.");
  const res=await fetch(url,{redirect:"manual",headers:{"Accept":"text/html,application/xhtml+xml","User-Agent":"Mozilla/5.0 (compatible; KojerReader/0.1; personal educational reader)"},signal:AbortSignal.timeout(8500)});
  if([301,302,303,307,308].includes(res.status)){
    const location=res.headers.get("location");if(!location)throw new Error("기사 위치를 확인할 수 없습니다.");
    url=new URL(location,url).toString();continue;
  }
  if(!res.ok)throw new Error(res.status===403||res.status===401?"언론사의 접근 제한으로 본문을 불러올 수 없습니다.":"본문 요청 실패 ("+res.status+")");
  if(!/text\/html|application\/xhtml\+xml/i.test(res.headers.get("content-type")||""))throw new Error("HTML 형식의 본문이 아닙니다.");
  const len=Number(res.headers.get("content-length")||0);
  if(len>1200000)throw new Error("페이지가 너무 커서 자동 추출하지 않았습니다.");
  const text=await res.text();
  if(text.length>1300000)throw new Error("페이지 크기 제한을 넘었습니다.");
  return {text,url};
 }
 throw new Error("기사 링크가 너무 많이 이동했습니다.");
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(req.method!=="POST")return ok({error:"Method not allowed"},405);
 const bearer=req.headers.get("Authorization")||"";
 if(!/^Bearer\s+[\w-]+\.[\w-]+\.[\w-]+$/.test(bearer))return ok({error:"Supabase 로그인이 필요합니다."},401);
 const project=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!project||!anon)return ok({error:"인증 서비스 구성이 필요합니다."},500);
 try{
  const auth=await fetch(project+"/auth/v1/user",{headers:{"Authorization":bearer,"apikey":anon},signal:AbortSignal.timeout(3500)});
  if(!auth.ok)return ok({error:"로그인 정보를 확인해주세요."},401);
 }catch{return ok({error:"인증 요청에 실패했습니다."},503)}
 let payload: {url?:string};
 try{payload=await req.json()}catch{return ok({error:"잘못된 요청입니다."},400)}
 if(typeof payload.url!=="string"||payload.url.length>2000||!validUrl(payload.url))return ok({error:"지원하지 않는 기사 링크입니다."},400);
 try{
  const page=await checkedFetch(payload.url);
  const doc=new DOMParser().parseFromString(page.text,"text/html");
  if(!doc)throw new Error("HTML을 해석하지 못했습니다.");
  const summaryMeta=(
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="description"]')?.getAttribute("content") || ""
  ).trim().replace(/\\s+/g," ").slice(0,500);
  const cleanMeta=summaryMeta.length>=65
    && /[一-龯ぁ-ゖァ-ヺ]/.test(summaryMeta)
    && !/ログイン|登録が必要|ご利用案内|プライバシーポリシー|クッキー|視聴のご案内/.test(summaryMeta);
  const excerpt=(title: string) => cleanMeta && summaryMeta!==title && summaryMeta.length>=title.length+10
    ? ok({title,source:new URL(page.url).hostname,url:page.url,paragraphs:[summaryMeta],
          chars:summaryMeta.length,contentScope:"preview",notice:"이 출처는 기사 전문 대신 공개 소개문만 제공했습니다."})
    : null;
  for(const elem of doc.querySelectorAll("script,style,iframe,form,nav,footer,aside"))elem.remove();
  const parsed=new Readability(doc as unknown as Document,{charThreshold:120,keepClasses:false}).parse();
  if(!parsed?.content || !parsed?.textContent){
    const preview=excerpt(doc.title||"");
    if(preview)return preview;
    throw new Error("이 언론사의 본문에 접근할 수 없습니다.");
  }
  const body=new DOMParser().parseFromString("<main>"+parsed.content+"</main>","text/html");
  const main=body?.querySelector("main");
  if(!main)throw new Error("본문 추출에 실패했습니다.");
  const paragraphs=[...main.querySelectorAll("p,h2,h3,li")].map(el=>(el.textContent||"").trim().replace(/\s+/g," ")).filter(x=>x.length>=18 && /[\u3040-\u30ff\u3400-\u9fff]/.test(x)).slice(0,110);
  if(!paragraphs.length){const txt=(parsed.textContent||"").trim();if(txt.length>160)paragraphs.push(...txt.split(/\n+/).map(x=>x.trim()).filter(x=>x.length>18).slice(0,90));}
  const clean=paragraphs.join("\n\n");
  if(clean.length<180) {
    const preview=excerpt(String(parsed.title||doc.title||"").slice(0,240));
    if(preview)return preview;
    throw new Error("기사 본문이 매우 짧거나 제한되어 자동 추출하지 못했습니다.");
  }
  const source=new URL(page.url).hostname;
  return ok({title:String(parsed.title||"").slice(0,240),source,url:page.url,paragraphs:paragraphs.map(p=>p.slice(0,1600)),chars:clean.length,contentScope:"full",notice:"공개 접근 가능한 본문을 가져왔습니다."});
 }catch(e){return ok({error:e instanceof Error?e.message:"기사 본문을 불러오지 못했습니다."},422)}
});
