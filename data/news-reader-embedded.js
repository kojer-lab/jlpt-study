/* Integrated JLPT N1 curated-news reader. No separate page or paid AI API. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const source=Array.isArray(window.KOJER_CURATED_NEWS?.articles)?window.KOJER_CURATED_NEWS.articles:[];
const storeKey="jlpt-news-expression-test-v2";
let article=null,translationOpen=false;
const extra=new Map();
for(const row of "日本銀行|にほんぎんこう\n日本政府|にほんせいふ\n日本|にほん\n物価上昇|ぶっかじょうしょう\n物価|ぶっか\n原材料|げんざいりょう\n価格転嫁|かかくてんか\n輸入|ゆにゅう\n販売価格|はんばいかかく\n企業|きぎょう\n値上げ|ねあげ\n家計|かけい\n負担|ふたん\n景気|けいき\n金融政策|きんゆうせいさく\n政策金利|せいさくきんり\n金利|きんり\n判断|はんだん\n報告|ほうこく\n地域|ちいき\n影響|えいきょう\n経済|けいざい\n収益|しゅうえき\n利益|りえき\n設備投資|せつびとうし\n人工知能|じんこうちのう\n需要|じゅよう\n投資|とうし\n消費者|しょうひしゃ\n人手不足|ひとでぶそく\n人件費|じんけんひ\n上昇|じょうしょう\n増加|ぞうか\n回復|かいふく\n円安|えんやす\n見通し|みとおし\n銀行|ぎんこう\n全国|ぜんこく\n情報|じょうほう\n緊急|きんきゅう\n対策|たいさく\n会議|かいぎ\nサイバー攻撃|サイバーこうげき\n攻撃|こうげき\n東京都|とうきょうと\n小平市|こだいらし\n自治体|じちたい\n行政|ぎょうせい\n情報システム|じょうほうシステム\n関係機関|かんけいきかん\n職員|しょくいん\n参加|さんか\n確認|かくにん\n安全|あんぜん\n不正アクセス|ふせいアクセス\n個人情報|こじんじょうほう\n警察庁|けいさつちょう\n被害|ひがい\n障害|しょうがい\n復旧|ふっきゅう\n脆弱性|ぜいじゃくせい\n小池百合子|こいけゆりこ\n都知事|とちじ\n監視|かんし\n指示|しじ\n必要|ひつよう\n重要|じゅうよう\n国際刑事裁判所|こくさいけいじさいばんしょ\n国際社会|こくさいしゃかい\n国際司法|こくさいしほう\n裁判所|さいばんしょ\n最高検察庁|さいこうけんさつちょう\n身柄|みがら\n引き渡し|ひきわたし\n要求|ようきゅう\n要請|ようせい\n逮捕状|たいほじょう\n赤根智子|あかねともこ\n所長|しょちょう\n関係者|かんけいしゃ\n戦争犯罪|せんそうはんざい\n主権|しゅけん\n条約|じょうやく\n締約国|ていやくこく\n訴追|そつい\n証拠|しょうこ\n司法判断|しほうはんだん\n意思疎通|いしそつう\n独立|どくりつ\n支持|しじ\n立場|たちば\n国家|こっか\n連携|れんけい\n移送|いそう\n各国|かっこく\n国境|こっきょう\n一貫|いっかん\n今後|こんご\n問題|もんだい\n横浜流星|よこはまりゅうせい\n松村北斗|まつむらほくと\n広瀬すず|ひろせすず\n藤井道人|ふじいみちひと\n凪良ゆう|なぎらゆう\n俳優|はいゆう\n監督|かんとく\n映画|えいが\n新作映画|しんさくえいが\n公開|こうかい\n主演|しゅえん\n出演|しゅつえん\n共演|きょうえん\n作品|さくひん\n制作|せいさく\n撮影|さつえい\n原作|げんさく\n小説|しょうせつ\n舞台|ぶたい\n初日|しょにち\n漫画家|まんがか\n人物|じんぶつ\n相棒|あいぼう\n親友|しんゆう\n関係|かんけい\n演技|えんぎ\n表現|ひょうげん\n魅力|みりょく\n期待|きたい\n印象|いんしょう\n現場|げんば\n演じる|えんじる\n振り返る|ふりかえる\n扮する|ふんする\n敬意|けいい\n東京|とうきょう\n家族|かぞく\n言葉|ことば\n気持ち|きもち\n映画化|えいがか\n主人公|しゅじんこう\n世界観|せかいかん\n登場人物|とうじょうじんぶつ\n劇場版|げきじょうばん\n呪術廻戦|じゅじゅつかいせん\n進撃の巨人|しんげきのきょじん\n制作工程|せいさくこうてい\n平松禎史|ひらまつただし\n新作|しんさく\n原画|げんが\n構図|こうず\n描写|びょうしゃ\n色彩|しきさい\n音響|おんきょう\n効果音|こうかおん\n音楽|おんがく\n機会|きかい\n対談|たいだん\n会場|かいじょう\n記念展|きねんてん\n設立|せつりつ\n記念|きねん\n手描き|てがき\n鉛筆|えんぴつ\n制作者|せいさくしゃ\n世界|せかい\n細部|さいぶ\n展示|てんじ\n人間|にんげん\n個性|こせい\n進歩|しんぽ\n感覚|かんかく\n一方|いっぽう\n双方|そうほう\n背景|はいけい\n観客|かんきゃく\n関心|かんしん\n注目|ちゅうもく\n多彩|たさい\n実写|じっしゃ\n映像|えいぞう\n奥行き|おくゆき\n立体感|りったいかん\n現実|げんじつ\n体験|たいけん\n技術|ぎじゅつ\n場面|ばめん\n贈った|おくった\n描き下ろした|かきおろした\n垣根を越えて|かきねをこえて\n広がり|ひろがり\n幅広い|はばひろい\n望遠鏡|ぼうえんきょう\n宇宙|うちゅう\n星々|ほしぼし\n天体|てんたい\n観測|かんそく\n木曽観測所|きそかんそくじょ\n木曽|きそ\n東京大学|とうきょうだいがく\n科学技術振興機構|かがくぎじゅつしんこうきこう\n科学技術|かがくぎじゅつ\n研究|けんきゅう\n研究者|けんきゅうしゃ\n時間領域天文学|じかんりょういきてんもんがく\n時間|じかん\n領域|りょういき\n機器|きき\n装置|そうち\n高速|こうそく\n画像|がぞう\n現象|げんしょう\n変動|へんどう\n口径|こうけい\n平方度|へいほうど\n範囲|はんい\n速度|そくど\n視野|しや\n可視光|かしこう\n分解能|ぶんかいのう\n分析|ぶんせき\n解析|かいせき\n比較|ひかく\n撮影技術|さつえいぎじゅつ\n長野県|ながのけん\n波及|はきゅう\n継続|けいぞく\n記録|きろく\n明るさ|あかるさ\n変化|へんか".split("\n")){
 const p=row.indexOf("|");if(p<1)continue;
 const surface=row.slice(0,p).trim(),reading=row.slice(p+1).trim(),initial=surface[0];
 if(!surface||!reading)continue;
 if(!extra.has(initial))extra.set(initial,[]);
 extra.get(initial).push({surface,reading});
}
for(const arr of extra.values())arr.sort((a,b)=>b.surface.length-a.surface.length);
function wordHTML(surface,reading){
 const kanji=/[一-龯々]/;
 if(!kanji.test(surface))return esc(surface);
 const part=typeof furiganaParts==="function"?furiganaParts(surface,reading):{head:"",base:surface,reading,tail:""};
 if(!part.base||!part.reading||!kanji.test(part.base))return esc(surface);
 return esc(part.head)+'<span class="furi" data-r="'+esc(part.reading)+'">'+esc(part.base)+'</span>'+esc(part.tail);
}
function annotate(str){
 const text=String(str||"");let output="",offset=0,covered=0,kanji=0;
 kanji=(text.match(/[一-龯々]/g)||[]).length;
 while(offset<text.length){
  let hit=null;
  for(const entry of extra.get(text[offset])||[]){if(text.startsWith(entry.surface,offset)){hit=entry;break}}
  if(typeof exampleFuriLexicon!=="undefined"){
   const choices=exampleFuriLexicon.get(text[offset])||[];
   for(const entry of choices){
    if(text.startsWith(entry.surface,offset)&&(!hit||entry.surface.length>hit.surface.length)){hit=entry;break}
   }
  }
  if(hit){
   output+=wordHTML(hit.surface,hit.reading);
   covered+=(hit.surface.match(/[一-龯々]/g)||[]).length;
   offset+=hit.surface.length;
  }else{output+=esc(text[offset]);offset++}
 }
 return {output,covered,kanji};
}
function paragraphHTML(text){
 const expressions=(article?.expressions||[]).filter(e=>e?.form&&text.includes(e.form)).sort((a,b)=>b.form.length-a.form.length);
 let offset=0,html="",covered=0,kanji=0;
 while(offset<text.length){
  let hit=null;
  for(const exp of expressions){
   const i=text.indexOf(exp.form,offset);
   if(i<0)continue;
   if(!hit||i<hit.pos||(i===hit.pos&&exp.form.length>hit.exp.form.length))hit={pos:i,exp};
  }
  if(!hit){const a=annotate(text.slice(offset));html+=a.output;covered+=a.covered;kanji+=a.kanji;break}
  const a=annotate(text.slice(offset,hit.pos));covered+=a.covered;kanji+=a.kanji;html+=a.output;
  const b=annotate(hit.exp.form);covered+=b.covered;kanji+=b.kanji;
  html+='<span class="news-phrase" data-news-expression="'+esc(hit.exp.form)+'">'+b.output+"</span>";
  offset=hit.pos+hit.exp.form.length;
 }
 return {html,covered,kanji};
}
function saved(){
 try{const x=JSON.parse(localStorage.getItem(storeKey)||"[]");return Array.isArray(x)?x:[]}catch{return []}
}
function phrase(key){
 if(!article)return;
 const e=article.expressions.find(x=>x.form===key);if(!e)return;
 const index=article.paragraphs.findIndex(x=>x.includes(key));
 const jp=index>=0?article.paragraphs[index]:"";
 const sentence=jp.split(/(?<=[。！？!?])/).find(x=>x.includes(key))||jp;
 const ko=index>=0?(article.translationParagraphs?.[index]||""):"";
 const id=article.id+":"+key,already=saved().some(x=>x.id===id);
 const panel=$("newsArticleExpressionInfo");
 panel.innerHTML='<strong lang="ja">'+esc(key)+'</strong> <span class="tag">실전 표현</span><p>'+esc(e.meaning||"")+'</p><p lang="ja" style="font-size:14px">'+esc(sentence)+'</p><button type="button" class="secondary" id="newsSavePhrase">'+(already?"✓ 저장됨 · 해제":"＋ 실전 표현 수첩에 저장")+"</button>";
 panel.classList.remove("hidden");
 $("newsSavePhrase").addEventListener("click",()=>{
  const all=saved();
  const next=all.some(x=>x.id===id)?all.filter(x=>x.id!==id):[...all,{id,type:"뉴스 표현",form:key,reading:"",meaning:e.meaning||"",example:sentence,translation:ko,note:"보도를 바탕으로 재구성한 학습 기사에 등장하는 표현",compare:"",source:article.source,title:article.title,cat:article.category,savedAt:new Date().toISOString()}];
  try{localStorage.setItem(storeKey,JSON.stringify(next));phrase(key)}catch{$("newsSavePhrase").textContent="저장할 수 없어"}
 });
 panel.scrollIntoView({block:"nearest",behavior:"smooth"});
}
function refreshMode(){
 const m=localStorage.getItem("jlptN1FuriV3")||"interactive";
 $("newsArticleTools").querySelectorAll("[data-news-furi]").forEach(button=>{
  const active=button.dataset.newsFuri===m;
  button.classList.toggle("active",active);
  button.setAttribute("aria-pressed",String(active));
 });
}
function displayArticle(id){
 const a=source.find(x=>x.id===id);
 if(!a){displayList();return}
 article=a;translationOpen=false;
 $("newsCuratedBrowser").classList.add("hidden");
 $("newsCuratedDetail").classList.remove("hidden");
 $("newsArticleMeta").textContent=[a.category,a.source,a.date,a.bodyLength+"자"].join(" · ");
 $("newsArticleTitle").textContent=a.title;
 let marked=0,total=0;
 $("newsArticleBody").innerHTML=a.paragraphs.map(p=>{
  const r=paragraphHTML(p);marked+=r.covered;total+=r.kanji;
  return "<p>"+r.html+"</p>"
 }).join("");
 $("newsArticleTranslation").innerHTML=a.translationParagraphs.map(p=>"<p>"+esc(p)+"</p>").join("");
 $("newsArticleTranslation").classList.add("hidden");
 $("newsArticleTranslate").textContent="한국어 번역 보기";
 $("newsArticleExpressions").innerHTML='<h3 style="font-size:17px;margin:0 0 10px">이 기사에서 알아둘 표현</h3>'+
 a.expressions.map(e=>'<button class="secondary" type="button" data-news-expression-button="'+esc(e.form)+'">'+esc(e.form)+'</button>').join("");
 $("newsArticleExpressionInfo").classList.add("hidden");$("newsArticleExpressionInfo").innerHTML="";
 refreshMode();
 if(typeof restoreInteractiveFuriState==="function")restoreInteractiveFuriState($("newsArticleBody"));
 $("newsArticleBody").dataset.readingCoverage=total?String(Math.round(100*marked/total)):"100";
}
function displayList(){
 article=null;$("newsCuratedBrowser").classList.remove("hidden");$("newsCuratedDetail").classList.add("hidden");
}
function route(){
 let hash=location.hash||"";
 try{hash=decodeURIComponent(hash)}catch{}
 if(!hash.startsWith("#newsreader"))return;
 if(!$("newsreaderView")?.classList.contains("active")&&typeof showView==="function")showView("newsreader");
 const id=hash.startsWith("#newsreader/")?hash.slice("#newsreader/".length):"";
 if(id)displayArticle(id);else displayList();
 window.scrollTo({top:0,behavior:"instant"});
}
function init(){
 if(!$("newsCuratedDetail"))return;
 for(const id of ["newsCuratedBack","newsCuratedBottomBack"])$(id).addEventListener("click",()=>{location.hash="#newsreader"});
 $("newsArticleTranslate").addEventListener("click",()=>{
  if(!article)return;
  translationOpen=!translationOpen;
  $("newsArticleTranslation").classList.toggle("hidden",!translationOpen);
  $("newsArticleTranslate").textContent=translationOpen?"한국어 번역 숨기기":"한국어 번역 보기";
 });
 $("newsArticleTools").addEventListener("click",e=>{
  const button=e.target.closest("[data-news-furi]");if(!button)return;
  localStorage.setItem("jlptN1FuriV3",button.dataset.newsFuri);
  if(typeof applyFuri==="function")applyFuri();
  refreshMode();
 });
 $("newsArticleExpressions").addEventListener("click",e=>{
  const btn=e.target.closest("[data-news-expression-button]");
  if(btn)phrase(btn.dataset.newsExpressionButton);
 });
 $("newsArticleBody").addEventListener("click",e=>{
  if(e.target.closest(".furi"))return;
  const exp=e.target.closest("[data-news-expression]");
  if(exp)phrase(exp.dataset.newsExpression);
 });
 document.addEventListener("click",e=>{
  const link=e.target.closest('a[href^="#newsreader/"]');
  if(link&&location.hash!=="#newsreader")history.replaceState(null,"","#newsreader");
  if(e.target.closest('[data-view="newsreader"],[data-go="newsreader"]')){
   history.replaceState(null,"","#newsreader");displayList();
  }
 },true);
 window.addEventListener("hashchange",route);
 window.addEventListener("popstate",route);
 route();
}
init();
})();
