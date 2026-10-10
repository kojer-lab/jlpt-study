/* Integrated JLPT N1 curated-news reader. No separate page or paid AI API. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const source=Array.isArray(window.KOJER_CURATED_NEWS?.articles)?window.KOJER_CURATED_NEWS.articles:[];
const archiveIndex=Array.isArray(window.KOJER_NEWS_INDEX?.articles)?window.KOJER_NEWS_INDEX.articles:[];
// Reviewed title translations for the existing sixteen archived articles.
// Future news data can provide its own titleTranslation field.
const titleTranslations={
 "2026-10-09-digger-mappa":"톰 크루즈, MAPPA 전시에서 애니메이션 제작 현장에 다가가다",
 "2026-10-08-boj-regional-inflation":"일본은행, 물가 상승의 확산을 경계… 기업과 가계에 미치는 영향",
 "2026-10-09-tokyo-cyber-emergency":"잇따르는 사이버 공격… 도쿄도가 긴급회의에서 대응을 확인",
 "2026-10-09-russia-icc-extradition":"러시아, ICC 소장 등의 인도를 요구… 국제 사법을 둘러싼 대립이 심화되다",
 "2026-10-09-tomoe-gozen-universe":"우주의 한순간을 포착하는 ‘토모에고젠’… 넓은 하늘을 고속으로 관측",
 "2026-10-09-nanji-hoshi-premiere":"영화 《그대, 별과 같이》 개봉… 요코하마 류세이와 마쓰무라 호쿠토가 말하는 공동 출연의 기억",
 "2026-10-09-generative-ai-usage-japan":"일본에서 생성형 AI의 이용이 확대… 이용자 수만으로는 보이지 않는 변화",
 "2026-10-08-satellite-5g-ntn-kashima":"위성과 지상의 통신을 연결… 일본 국내에 ‘5G NTN’ 실증 설비",
 "2026-10-09-children-smartphone-filtering":"초등학생의 스마트폰 이용, 필터링에 대한 이해가 과제로",
 "2026-10-09-suica-penguin-reissue":"인기 투표로 선정된 ‘Suica 펭귄’ 상품, 복각 판매 예정",
 "jlpt-news-2026-10-10-01":"쌀값 하락이 이어지는 가운데, 가격을 가늠하는 방법이 쟁점으로",
 "jlpt-news-2026-10-10-02":"수입 금지 육류 제품이 매장에서 확인돼, 검역의 역할을 생각하다",
 "jlpt-news-2026-10-10-03":"숙박 예약 시스템에 대한 부정 접근, 정보 관리의 맹점",
 "jlpt-news-2026-10-10-04":"중국과 EU의 통상 협의, 대립과 협조 사이에서",
 "jlpt-news-2026-10-10-05":"월드컵을 둘러싼 비방과 중상, 숫자가 들이민 과제",
 "jlpt-news-2026-10-10-06":"애니메이션과 공예가 만나는, 니지가사키의 가죽 제품 기획"
};
const inFlightAssets=new Map();
// Load a day's articles only when an article from that day is opened.
// All the other dates remain tiny index entries, not downloaded article bodies.
async function loadArchivedArticle(id){
 const cached=source.find(x=>x.id===id);
 if(cached)return cached;
 const meta=archiveIndex.find(x=>x.id===id);
 if(!meta)throw new Error("해당 기사를 찾지 못했어.");
 const asset=String(meta.asset||"");
 if(!/^data\/news-articles-\d{4}-\d{2}-\d{2}(?:-batch\d+)?\.json$/.test(asset))throw new Error("기사 파일 주소가 올바르지 않아.");
 if(!inFlightAssets.has(asset)){
  const request=fetch(asset+"?v=20261010-arabic-numerals2",{cache:"force-cache"})
   .then(response=>{if(!response.ok)throw new Error("기사 파일을 읽을 수 없어 ("+response.status+")");return response.json()})
   .then(payload=>{
    if(!Array.isArray(payload?.articles))throw new Error("기사 파일 형식이 올바르지 않아.");
    for(const item of payload.articles){
     if(!item||typeof item.id!=="string"||!Array.isArray(item.paragraphs)||!Array.isArray(item.translationParagraphs)||item.paragraphs.length!==item.translationParagraphs.length||!Array.isArray(item.expressions))continue;
     if(!source.some(x=>x.id===item.id))source.push(item);
    }
   })
   .catch(error=>{inFlightAssets.delete(asset);throw error});
  inFlightAssets.set(asset,request);
 }
 await inFlightAssets.get(asset);
 const item=source.find(x=>x.id===id);
 if(!item)throw new Error("선택한 기사 데이터가 파일에 없어.");
 return item;
}

window.KOJER_ADD_GENERATED_NEWS=function(articles){if(!Array.isArray(articles))return;for(const a of articles){if(a&&typeof a.id==="string"&&!source.some(x=>x.id===a.id))source.push(a)}if(typeof renderCuratedNewsHome==="function")renderCuratedNewsHome()};
const storeKey="jlpt-news-expression-test-v2";
let article=null,translationOpen=false,titleOpen=false,selectedExpression=null,expressionOpen=false;
let paragraphOpen=new Set(),lastProgressSave=0,suppressProgressSaveUntil=0;
const progressKey="jlptNewsReadProgressV1";
function savedProgress(){try{const v=JSON.parse(localStorage.getItem(progressKey)||"{}");return v&&typeof v==="object"?v:{}}catch{return {}}}
function progressFor(id){const p=savedProgress()[id];return p&&Number.isInteger(p.index)?p:null}
function newsReadCompleted(id){return Number(progressFor(id)?.completedAt)>0}
window.KOJER_NEWS_IS_READ=newsReadCompleted;
function updateNewsReadButton(){
 const button=$("newsMarkRead");
 if(!button)return;
 const done=!!article&&newsReadCompleted(article.id);
 button.setAttribute("aria-pressed",String(done));
 button.textContent="읽음";
 button.setAttribute("aria-label",done?"읽음 표시 취소":"이 기사를 다 읽었다고 표시");
 button.title=done?"읽음 완료 · 다시 눌러 취소":"읽음 표시";
}
function toggleNewsRead(){
 if(!article)return;
 const id=article.id,now=Date.now(),state=savedProgress(),old=state[id]||{};
 const completed=Number(old.completedAt)>0;
 state[id]={...old,index:Number.isInteger(old.index)?old.index:0,offset:Number(old.offset)||0,
  completedAt:completed?0:now,completionChangedAt:now,updatedAt:now};
 try{
  localStorage.setItem(progressKey,JSON.stringify(state));
  updateNewsReadButton();
  if(typeof renderCuratedNewsHome==="function")renderCuratedNewsHome();
  window.dispatchEvent(new Event("kojer-news:changed"));
 }catch(e){console.warn("뉴스 읽음 상태 저장 실패",e)}
}

function captureProgress(force=false){
 if(!article||!$("newsreaderView")?.classList.contains("active")||!$("newsCuratedDetail")||$("newsCuratedDetail").classList.contains("hidden"))return;
 const now=Date.now();
 if(!force&&(now-lastProgressSave<1400||now<suppressProgressSaveUntil))return;
 const nodes=[...$("newsArticleBody").querySelectorAll(".news-paragraph")];
 if(!nodes.length)return;
 let index=0;
 for(let i=0;i<nodes.length;i++){if(nodes[i].getBoundingClientRect().top<=Math.min(window.innerHeight*.43,280))index=i;else break}
 const offset=Math.max(0,Math.min(1100,Math.round(Math.min(window.innerHeight*.43,280)-nodes[index].getBoundingClientRect().top)));
 try{
  const state=savedProgress();
  const previous=state[article.id]||{};
  if(!force&&previous.index===index&&Math.abs((Number(previous.offset)||0)-offset)<45)return;
  state[article.id]={...previous,index,offset,positionUpdatedAt:now,updatedAt:now};
  localStorage.setItem(progressKey,JSON.stringify(state));
  lastProgressSave=now;
  window.dispatchEvent(new Event("kojer-news:changed"));
 }catch(e){console.warn("뉴스 읽기 위치 저장 실패",e)}
}
function restoreProgress(id){
 // Remember the last position but never jump there automatically when opening an article.
 // The reader always starts at the title; resume is an explicit optional action.
 suppressProgressSaveUntil=Date.now()+1200;
 const p=progressFor(id),button=$("newsReadResume");
 const canResume=!!(p&&(p.index>0||p.offset>120)&&$("newsParagraph"+p.index));
 button.classList.toggle("hidden",!canResume);
 button.textContent=canResume?"↪ 지난번 읽던 "+(p.index+1)+"번째 문단 이어 읽기":"";
}
function resumeProgress(){
 if(!article)return;
 const p=progressFor(article.id),target=p?$("newsParagraph"+p.index):null;
 if(!target)return;
 suppressProgressSaveUntil=Date.now()+1500;
 target.scrollIntoView({block:"start",behavior:"auto"});
 window.scrollBy(0,Math.min(p.offset||0,750));
}

const extra=new Map();
for(const row of "日本銀行|にほんぎんこう\n日本政府|にほんせいふ\n日本|にほん\n物価上昇|ぶっかじょうしょう\n物価|ぶっか\n原材料|げんざいりょう\n価格転嫁|かかくてんか\n輸入|ゆにゅう\n販売価格|はんばいかかく\n企業|きぎょう\n値上げ|ねあげ\n家計|かけい\n負担|ふたん\n景気|けいき\n金融政策|きんゆうせいさく\n政策金利|せいさくきんり\n金利|きんり\n判断|はんだん\n報告|ほうこく\n地域|ちいき\n影響|えいきょう\n経済|けいざい\n収益|しゅうえき\n利益|りえき\n設備投資|せつびとうし\n人工知能|じんこうちのう\n需要|じゅよう\n投資|とうし\n消費者|しょうひしゃ\n人手不足|ひとでぶそく\n人件費|じんけんひ\n上昇|じょうしょう\n増加|ぞうか\n回復|かいふく\n円安|えんやす\n見通し|みとおし\n銀行|ぎんこう\n全国|ぜんこく\n情報|じょうほう\n緊急|きんきゅう\n対策|たいさく\n会議|かいぎ\nサイバー攻撃|サイバーこうげき\n攻撃|こうげき\n東京都|とうきょうと\n小平市|こだいらし\n自治体|じちたい\n行政|ぎょうせい\n情報システム|じょうほうシステム\n関係機関|かんけいきかん\n職員|しょくいん\n参加|さんか\n確認|かくにん\n安全|あんぜん\n不正アクセス|ふせいアクセス\n個人情報|こじんじょうほう\n警察庁|けいさつちょう\n被害|ひがい\n障害|しょうがい\n復旧|ふっきゅう\n脆弱性|ぜいじゃくせい\n小池百合子|こいけゆりこ\n都知事|とちじ\n監視|かんし\n指示|しじ\n必要|ひつよう\n重要|じゅうよう\n国際刑事裁判所|こくさいけいじさいばんしょ\n国際社会|こくさいしゃかい\n国際司法|こくさいしほう\n裁判所|さいばんしょ\n最高検察庁|さいこうけんさつちょう\n身柄|みがら\n引き渡し|ひきわたし\n要求|ようきゅう\n要請|ようせい\n逮捕状|たいほじょう\n赤根智子|あかねともこ\n所長|しょちょう\n関係者|かんけいしゃ\n戦争犯罪|せんそうはんざい\n主権|しゅけん\n条約|じょうやく\n締約国|ていやくこく\n訴追|そつい\n証拠|しょうこ\n司法判断|しほうはんだん\n意思疎通|いしそつう\n独立|どくりつ\n支持|しじ\n立場|たちば\n国家|こっか\n連携|れんけい\n移送|いそう\n各国|かっこく\n国境|こっきょう\n一貫|いっかん\n今後|こんご\n問題|もんだい\n横浜流星|よこはまりゅうせい\n松村北斗|まつむらほくと\n広瀬すず|ひろせすず\n藤井道人|ふじいみちひと\n凪良ゆう|なぎらゆう\n俳優|はいゆう\n監督|かんとく\n映画|えいが\n新作映画|しんさくえいが\n公開|こうかい\n主演|しゅえん\n出演|しゅつえん\n共演|きょうえん\n作品|さくひん\n制作|せいさく\n撮影|さつえい\n原作|げんさく\n小説|しょうせつ\n舞台|ぶたい\n初日|しょにち\n漫画家|まんがか\n人物|じんぶつ\n相棒|あいぼう\n親友|しんゆう\n関係|かんけい\n演技|えんぎ\n表現|ひょうげん\n魅力|みりょく\n期待|きたい\n印象|いんしょう\n現場|げんば\n演じる|えんじる\n振り返る|ふりかえる\n扮する|ふんする\n敬意|けいい\n東京|とうきょう\n家族|かぞく\n言葉|ことば\n気持ち|きもち\n映画化|えいがか\n主人公|しゅじんこう\n世界観|せかいかん\n登場人物|とうじょうじんぶつ\n劇場版|げきじょうばん\n呪術廻戦|じゅじゅつかいせん\n進撃の巨人|しんげきのきょじん\n制作工程|せいさくこうてい\n平松禎史|ひらまつただし\n新作|しんさく\n原画|げんが\n構図|こうず\n描写|びょうしゃ\n色彩|しきさい\n音響|おんきょう\n効果音|こうかおん\n音楽|おんがく\n機会|きかい\n対談|たいだん\n会場|かいじょう\n記念展|きねんてん\n設立|せつりつ\n記念|きねん\n手描き|てがき\n鉛筆|えんぴつ\n制作者|せいさくしゃ\n世界|せかい\n細部|さいぶ\n展示|てんじ\n人間|にんげん\n個性|こせい\n進歩|しんぽ\n感覚|かんかく\n一方|いっぽう\n双方|そうほう\n背景|はいけい\n観客|かんきゃく\n関心|かんしん\n注目|ちゅうもく\n多彩|たさい\n実写|じっしゃ\n映像|えいぞう\n奥行き|おくゆき\n立体感|りったいかん\n現実|げんじつ\n体験|たいけん\n技術|ぎじゅつ\n場面|ばめん\n贈った|おくった\n描き下ろした|かきおろした\n垣根を越えて|かきねをこえて\n広がり|ひろがり\n幅広い|はばひろい\n望遠鏡|ぼうえんきょう\n宇宙|うちゅう\n星々|ほしぼし\n天体|てんたい\n観測|かんそく\n木曽観測所|きそかんそくじょ\n木曽|きそ\n東京大学|とうきょうだいがく\n科学技術振興機構|かがくぎじゅつしんこうきこう\n科学技術|かがくぎじゅつ\n研究|けんきゅう\n研究者|けんきゅうしゃ\n時間領域天文学|じかんりょういきてんもんがく\n時間|じかん\n領域|りょういき\n機器|きき\n装置|そうち\n高速|こうそく\n画像|がぞう\n現象|げんしょう\n変動|へんどう\n口径|こうけい\n平方度|へいほうど\n範囲|はんい\n速度|そくど\n視野|しや\n可視光|かしこう\n分解能|ぶんかいのう\n分析|ぶんせき\n解析|かいせき\n比較|ひかく\n撮影技術|さつえいぎじゅつ\n長野県|ながのけん\n波及|はきゅう\n継続|けいぞく\n記録|きろく\n明るさ|あかるさ\n変化|へんか\n訪れた|おとずれた\n訪れ|おとずれ\n作り|つくり\n作り手|つくりて\n異なる|ことなる\n来日|らいにち\n来日した|らいにちした\n周年|しゅうねん\n巡った|めぐった\n最初|さいしょ\n足を止めた|あしをとめた\n足を運んだ|あしをはこんだ\n髪|かみ\n描き|えがき\n描く|えがく\n向けた|むけた\n着目|ちゃくもく\n画面|がめん\n見つめた|みつめた\n食い入る|くいいる\n質問|しつもん\n質問した|しつもんした\n若い|わかい\n世代|せだい\n経験|けいけん\n意味|いみ\n説明|せつめい\n説明した|せつめいした\n共感|きょうかん\n共感し|きょうかんし\n手作業|てさぎょう\n残る|のこる\n応じた|おうじた\n反映|はんえい\n短い|みじかい\n共通|きょうつう\n課題|かだい\n抱える|かかえる\n続いて|つづいて\n話題|わだい\n移った|うつった\n二度|にど\n鑑賞|かんしょう\n明かし|あかし\n評価|ひょうか\n評価した|ひょうかした\n高く|たかく\n大きな|おおきな\n伝わる|つたわる\n追求|ついきゅう\n述べ|のべ\n約|やく\n費やした|ついやした\n紹介|しょうかい\n紹介した|しょうかいした\n実際|じっさい\n動物|どうぶつ\n鳴き声|なきごえ\n裏話|うらばなし\n披露|ひろう\n全体|ぜんたい\n構想|こうそう\n固め|かため\n使用|しよう\n活用|かつよう\n屋外|おくがい\n一切|いっさい\n取り巻く|とりまく\n引き上げ|ひきあげ\n引き上げる|ひきあげる\n圧力|あつりょく\n品目|ひんもく\n商品|しょうひん\n実態|じったい\n浮かび上がった|うかびあがった\n価格|かかく\n高騰|こうとう\n中東情勢|ちゅうとうじょうせい\n緊迫化|きんぱくか\n押し上げ|おしあげ\n踏み切る|ふみきる\n動き|うごき\n日々|ひび\n買い物|かいもの\n直結|ちょっけつ\n小さくない|ちいさくない\n仕入れ値|しいれね\n自社|じしゃ\n努力|どりょく\n吸収|きゅうしゅう\n難しい|むずかしい\n重なり|かさなり\n据え置く|すえおく\n据え置けば|すえおけば\n圧迫|あっぱく\n慎重|しんちょう\n呼び戻す|よびもどす\n割引|わりびき\n販売促進|はんばいそくしん\n確保|かくほ\n顧客離れ|こきゃくばなれ\n防ぐ|ふせぐ\n迫られる|せまられる\n停滞|ていたい\n各地域|かくちいき\n緩やかな|ゆるやかな\n見方|みかた\n賃金|ちんぎん\n下支え|したざさえ\n底堅さ|そこがたさ\n一定|いってい\n普及|ふきゅう\n拡大|かくだい\n電子部品|でんしぶひん\n製造装置|せいぞうそうち\n通信設備|つうしんせつび\n活発化|かっぱつか\n活動|かつどう\n一因|いちいん\n成長分野|せいちょうぶんや\n好調|こうちょう\n恩恵|おんけい\n産業|さんぎょう\n均等|きんとう\n限らない|かぎらない\n新たな|あらたな\n同時|どうじ\n存在|そんざい\n現在|げんざい\n複雑|ふくざつ\n今年|ことし\n二度|にど\n対応|たいおう\n狙った|ねらった\n相次ぐ|あいつぐ\n改めて|あらためて\n各局|かくきょく\n部長級|ぶちょうきゅう\n日頃|ひごろ\n備え|そなえ\n発生|はっせい\n場合|ばあい\n対応手順|たいおうてじゅん\n多く|おおく\n支えられる|ささえられる\n単なる|たんなる\n故障|こしょう\n今回|こんかい\n利用|りよう\n身代金|みのしろきん\n受けた|うけた\n閲覧|えつらん\n状態|じょうたい\n陥り|おちいり\n時点|じてん\n外部|がいぶ\n事業者|じぎょうしゃ\n業務|ぎょうむ\n効率化|こうりつか\n提供元|ていきょうもと\n弱点|じゃくてん\n浮き彫り|うきぼり\n部局|ぶきょく\n防御策|ぼうぎょさく\n点検|てんけん\n方針|ほうしん\n侵入|しんにゅう\n万一|まんいち\n発覚|はっかく\n部署|ぶしょ\n事態|じたい\n把握|はあく\n順番|じゅんばん\n共有|きょうゆう\n事前|じぜん\n初動対応|しょどうたいおう\n遅れ|おくれ\n住民|じゅうみん\n同日|どうじつ\n定例会見|ていれいかいけん\n都庁|とちょう\n常時|じょうじ\n人員|じんいん\n増強|ぞうきょう\n明らかに|あきらかに\n一度|いちど\n保証|ほしょう\n手口|てぐち\n見直し|みなおし\n欠かせない|かかせない\n流出|りゅうしゅつ\n対立|たいりつ\n複数|ふくすう\n裁く|さばく\n仕組み|しくみ\n再び|ふたたび\n示した|しめした\n遺憾|いかん\n活動|かつどう\n強調|きょうちょう\n八日|ようか\n九日|ここのか\n九人|きゅうにん\n求めた|もとめた\n明らか|あきらか\n自国民|じこくみん\n違法|いほう\n十分|じゅうぶん\n発付|はっぷ\n当局|とうきょく\n見解|けんかい\n認められた|みとめられた\n意味|いみ\n人道|じんどう\n罪|つみ\n重大|じゅうだい\n犯罪|はんざい\n刑事責任|けいじせきにん\n問う|とう\n設けられた|もうけられた\n大統領|だいとうりょう\n当時|とうじ\n裁判官|さいばんかん\n関わった|かかわった\n経緯|けいい\n昨年|さくねん\n十二月|じゅうにがつ\n本人|ほんにん\n出席|しゅっせき\n審理|しんり\n進める|すすめる\n欠席裁判|けっせきさいばん\n有罪判決|ゆうざいはんけつ\n一連|いちれん\n延長線上|えんちょうせんじょう\n位置付け|いちづけ\n措置|そち\n不当|ふとう\n尾崎官房副長官|おざきかんぼうふくちょうかん\n官房副長官|かんぼうふくちょうかん\n申し入れ|もうしいれ\n含めて|ふくめて\n実効性|じっこうせい\n疑惑|ぎわく\n手掛かり|てがかり\n広い|ひろい\n空|そら\n光|ひかり\n見える|みえる\n捉える|とらえる\n彼方|かなた\n夜空|よぞら\n短時間|たんじかん\n瞬間|しゅんかん\n放つ|はなつ\n起きる|おきる\n見逃す|みのがす\n動画|どうが\n搭載|とうさい\n百五|ひゃくご\n特徴|とくちょう\n一度|いちど\n一般|いっぱん\n大きく|おおきく\n見渡せる|みわたせる\n能力|のうりょく\n最大|さいだい\n毎秒|まいびょう\n一定|いってい\n間隔|かんかく\n一枚|いちまい\n写真|しゃしん\n撮る|とる\n連続|れんぞく\n得られた|えられた\n調べる|しらべる\n詳しく|くわしく\n大量|たいりょう\n進む|すすむ\n数え切れない|かぞえきれない\n見つけ出す|みつけだす\n作業|さぎょう\n同じ|おなじ\n繰り返し|くりかえし\n強さ|つよさ\n速さ|はやさ\n処理|しょり\n役割|やくわり\n担う|になう\n天域|てんいき\n追い掛ける|おいかける\n異なる|ことなる\n種類|しゅるい\n組み合わせる|くみあわせる\n頼らず|たよらず\n多く|おおく\n紹介|しょうかい\n訪問|ほうもん\n汝|なんじ\n本屋大賞|ほんやたいしょう\n受賞|じゅしょう\n瀬戸内|せとうち\n十五年|じゅうごねん\n男女|だんじょ\n選択|せんたく\n井上暁海|いのうえあけみ\n青埜櫂|あおのかい\n久住尚人|くずみなおと\n尚人|なおと\n櫂|かい\n夢|ゆめ\n目指す|めざす\n揺れ動く|ゆれうごく\n互い|たがい\n置かれた|おかれた\n環境|かんきょう\n人生|じんせい\n決断|けつだん\n一致|いっち\n物語|ものがたり\n追い掛ける|おいかける\n主役|しゅやく\n恋愛|れんあい\n支える|ささえる\n存在|そんざい\n楽しかった|たのしかった\n以前|いぜん\n以来|いらい\n再会|さいかい\n喜び|よろこび\n率直|そっちょく\n段階|だんかい\n感じていた|かんじていた\n仕事|しごと\n抱いていた|いだいていた\n持つ|もつ\n優しさ|やさしさ\n繊細|せんさい\n重なって|かさなって\n響き合う|ひびきあう\n説得力|せっとくりょく\n高揚感|こうようかん\n包まれる|つつまれる\n通じて|つうじて\n築かれた|きずかれた\n登壇|とうだん\n同士|どうし".split("\n")){
 const p=row.indexOf("|");if(p<1)continue;
 const surface=row.slice(0,p).trim(),reading=row.slice(p+1).trim(),initial=surface[0];
 if(!surface||!reading)continue;
 if(!extra.has(initial))extra.set(initial,[]);
 extra.get(initial).push({surface,reading});
}
// Article-by-article QA readings take precedence over the general vocabulary dictionary.
const reviewed=window.KOJER_NEWS_FURI_REVIEWED_V1||{};
for(const [surface,reading] of Object.entries(reviewed)){
 if(!surface||!reading||!/[一-龯々〇]/.test(surface))continue;
 const first=surface[0],arr=extra.get(first)||[];
 const old=arr.findIndex(entry=>entry.surface===surface);
 if(old>=0)arr.splice(old,1);
 arr.push({surface,reading,reviewed:true});
 extra.set(first,arr);
}
for(const arr of extra.values())arr.sort((a,b)=>b.surface.length-a.surface.length);
// Cross-checked reading aids for the current news expression synonyms.
// These are only shown when a kanji word is clicked, not pre-rendered ruby.
const reviewedSimilarReadings=new Map([["じっと見つめる","じっとみつめる"],["関心を寄せる","かんしんをよせる"],["見逃すおそれがある","みのがすおそれがある"],["推移","すいい"],["直接関わる","ちょくせつかかわる"],["注目を集める","ちゅうもくをあつめる"],["中断せず","ちゅうだんせず"],["判断する","はんだんする"],["一様に","いちように"],["注意を払う","ちゅういをはらう"],["傾向","けいこう"],["気を取られる","きをとられる"],["解釈する","かいしゃくする"],["明らかになる","あきらかになる"],["区分","くぶん"],["心配","しんぱい"],["与える恐れがある","あたえるおそれがある"],["終結する","しゅうけつする"],["実施","じっし"],["判断を誤る","はんだんをあやまる"],["促進する","そくしんする"],["検疫措置","けんえきそち"],["不正侵入","ふせいしんにゅう"],["漏えい","ろうえい"],["把握する","はあくする"],["用心深い","ようじんぶかい"],["顕在化","けんざいか"],["全体像","ぜんたいぞう"],["統合","とうごう"],["例外なく","れいがいなく"],["言い切ること","いいきること"],["予防措置","よぼうそち"],["大臣レベル","だいじんれべる"],["通商対立","つうしょうたいりつ"],["段階","だんかい"],["考慮する","こうりょする"],["組み入れる","くみいれる"],["性急","せいきゅう"],["取り違える","とりちがえる"],["別に","べつに"],["仕組み","しくみ"],["悪口","わるぐち"],["通る","とおる"],["背後","はいご"],["同じとみなす","おなじとみなす"],["排除する","はいじょする"],["抑え込む","おさえこむ"],["すぐ採用する","すぐさいようする"],["慎重に検討する","しんちょうにけんとうする"],["欠かせない","かかせない"],["共同事業","きょうどうじぎょう"],["慣れ親しむ","なれしたしむ"],["比較する","ひかくする"],["強調する","きょうちょうする"],["発見する","はっけんする"],["共存させる","きょうぞんさせる"],["左右される","さゆうされる"]]);
const kanaHiragana=s=>String(s||"").replace(/[ァ-ヺ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60));
function wordHTML(surface,reading){
 const hasKanji=/[一-龯々〇〆ヵヶ]/;
 surface=String(surface||"");reading=String(reading||"");
 if(!hasKanji.test(surface))return esc(surface);
 const runs=[];
 for(const char of surface){
  const type=hasKanji.test(char)?"kanji":"plain";
  if(runs.length&&runs[runs.length-1].type===type)runs[runs.length-1].text+=char;
  else runs.push({type,text:char});
 }
 let out="",position=0,valid=true;
 const kanaOnly=x=>/^[ぁ-ゖァ-ヺー]+$/.test(x);
 const normalizedReading=kanaHiragana(reading);
 for(let i=0;i<runs.length;i++){
  const run=runs[i];
  if(run.type==="plain"){
   if(kanaOnly(run.text)){
    if(!normalizedReading.startsWith(kanaHiragana(run.text),position)){valid=false;break}
    position+=run.text.length;
   }
   out+=esc(run.text);
   continue;
  }
  let end=reading.length;
  const next=runs.slice(i+1).find(run=>run.type==="plain"&&kanaOnly(run.text));
  if(next){
   const nextAt=runs.indexOf(next);
   const target=kanaHiragana(next.text);
   end=nextAt===runs.length-1?normalizedReading.lastIndexOf(target):normalizedReading.indexOf(target,position+1);
  }
  if(end<=position){valid=false;break}
  const sound=reading.slice(position,end);
  if(!/^[ぁ-ゖァ-ヺー]+$/.test(sound)){valid=false;break}
  out+='<span class="furi" data-r="'+esc(kanaHiragana(sound))+'">'+esc(run.text)+'</span>';
  position=end;
 }
 if(valid&&position===reading.length)return out;
 // Never invent a furigana segmentation if the stored reading is inconsistent.
 return esc(surface);
}
function expressionDetailRuby(form,reading){
 const converted=wordHTML(String(form||""),String(reading||""));
 return converted.includes('class="furi"')?converted:annotate(form).output;
}
function similarWithoutReading(value){
 return String(value||"").replace(/\s*[（(][ぁ-ゖァ-ヺー\s]+[）)]\s*$/u,"").trim();
}
function similarExpressionHTML(value){
 const raw=String(value||"").trim();
 const match=raw.match(/^(.+?)\s*[（(]([ぁ-ゖァ-ヺー\s]+)[）)]\s*$/u);
 const surface=match?match[1].trim():similarWithoutReading(raw);
 const reading=match?match[2].replace(/\s/g,""):reviewedSimilarReadings.get(surface);
 if(reading)return expressionDetailRuby(surface,reading);
 return annotate(surface).output;
}
// Ensure the vocabulary word uses its reviewed reading inside Japanese examples,
// rather than relying on a generic context dictionary that might omit it.
function annotateExpressionSentence(sentence,form,reading){
 const text=String(sentence||""),target=String(form||"");
 if(!target||!text.includes(target))return annotate(text).output;
 let cursor=0,out="",index;
 while((index=text.indexOf(target,cursor))!==-1){
  out+=annotate(text.slice(cursor,index)).output;
  out+=expressionDetailRuby(target,reading);
  cursor=index+target.length;
 }
 return out+annotate(text.slice(cursor)).output;
}
function expressionRuby(form,reading){
 // Expressions use visible <ruby>, not interactive .furi elements.
 // This keeps the expression button clickable, even when its entire label is kanji.
 const converted=wordHTML(String(form||""),String(reading||"")).replace(
  /<span class="furi" data-r="([^"]+)">([^<]+)<\/span>/g,
  "<ruby>$2<rt>$1</rt></ruby>"
 );
 return converted.includes("<ruby>")?converted:annotate(form).output.replace(
  /<span class="furi" data-r="([^"]+)">([^<]+)<\/span>/g,
  "<ruby>$2<rt>$1</rt></ruby>"
 );
}
function annotate(str){
 const text=String(str||"");let output="",offset=0,covered=0,kanji=0;
 kanji=(text.match(/[一-龯々〇]/g)||[]).length;
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
   const rendered=wordHTML(hit.surface,hit.reading);
   output+=rendered;
   if(rendered.includes('class="furi"'))covered+=(hit.surface.match(/[一-龯々〇]/g)||[]).length;
   offset+=hit.surface.length;
  }else{output+=esc(text[offset]);offset++}
 }
 return {output,covered,kanji};
}
// Fill title-only reading gaps without affecting context-dependent body readings.
const titleReadingFixes=[
 ["実証設備","じっしょうせつび"],["見極め方","みきわめかた"],
 ["突き付けた","つきつけた"],["警戒","けいかい"],["深まる","ふかまる"],
 ["一瞬","いっしゅん"],["語る","かたる"],["記憶","きおく"],
 ["盲点","もうてん"],["協調","きょうちょう"],["工芸","こうげい"],
 ["交わる","まじわる"],["W杯","わーるどかっぷ"],["展","てん"]
].sort((a,b)=>b[0].length-a[0].length);
function titleHTML(text){
 const title=String(text||"");let result="",unmatched="",i=0;
 const flush=()=>{if(unmatched){result+=annotate(unmatched).output;unmatched=""}};
 while(i<title.length){
  const hit=titleReadingFixes.find(([form])=>title.startsWith(form,i));
  if(hit){flush();result+=wordHTML(hit[0],hit[1]);i+=hit[0].length}
  else {unmatched+=title[i];i++}
 }
 flush();return result;
}
function getTitleTranslation(a){
 const meta=archiveIndex.find(x=>x.id===a?.id);
 return String(a?.titleTranslation||meta?.titleTranslation||titleTranslations[a?.id]||"").trim();
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
  const b=annotate(hit.exp.form);
  const reviewed=expressionDetailRuby(hit.exp.form,hit.exp.reading);
  covered+=reviewed.includes('class="furi"')?(hit.exp.form.match(/[一-龯々〇]/g)||[]).length:b.covered;
  kanji+=b.kanji;
  html+='<span class="news-phrase" data-news-expression="'+esc(hit.exp.form)+'">'+reviewed+"</span>";
  offset=hit.pos+hit.exp.form.length;
 }
 return {html,covered,kanji};
}
function saved(){
 try{const x=JSON.parse(localStorage.getItem(storeKey)||"[]");return Array.isArray(x)?x:[]}catch{return []}
}
function clearExpressionSelection(){
 selectedExpression=null;
 $("newsArticleBody").querySelectorAll("[data-news-expression]").forEach(el=>el.classList.remove("news-phrase-selected"));
 $("newsArticleExpressions").querySelectorAll("[data-news-expression-button]").forEach(el=>{
  el.classList.remove("active");
  el.setAttribute("aria-pressed","false");
 });
 $("newsArticleExpressionInfo").classList.add("hidden");
 $("newsArticleExpressionInfo").innerHTML="";
}
function expressionTab(open){
 expressionOpen=!!open;
 $("newsExpressionPanel").classList.toggle("hidden",!expressionOpen);
 $("newsExpressionToggle").setAttribute("aria-expanded",String(expressionOpen));
 $("newsExpressionArrow").textContent=expressionOpen?"－":"＋";
 if(!expressionOpen)clearExpressionSelection();
}

/* News-only spaced-expression review. Does not touch the main JLPT SRS deck. */
let reviewQueue=[],reviewIndex=0,reviewRevealed=false;
// One unbiased shuffle for each new session; unfinished sessions retain order.
function shuffleReviewCards(cards){
 const groups=[[],[],[],[]],now=Date.now();
 for(const card of cards){
  const review=card.review||{};
  const grade=review.lastGrade;
  const recent=Number(review.lastReviewedAt)>0&&now-Number(review.lastReviewedAt)<86400000;
  const priority=grade==="again"||grade==="hard"?0:
   !Number(review.lastReviewedAt)?1:grade==="easy"||recent?3:2;
  groups[priority].push(card.id);
 }
 for(const group of groups){
  for(let i=group.length-1;i>0;i--){
   const j=Math.floor(Math.random()*(i+1));
   [group[i],group[j]]=[group[j],group[i]];
  }
 }
 return groups.flat();
}
function dueExpressions(){
 const now=Date.now();
 return saved().filter(x=>x&&!x.deleted&&(!x.review||!Number.isFinite(x.review.due)||x.review.due<=now));
}
function countReviews(){
 const n=dueExpressions().length,all=saved().length;
 $("newsDueCount").textContent=all?"("+n+"개 복습 예정)":"(저장된 표현 없음)";
}
function beginReview(){
 if(!saved().length){
  $("newsSavedPanel").classList.remove("hidden");
  $("newsSavedToggle").setAttribute("aria-expanded","true");
  $("newsReviewArea").classList.remove("hidden");
  $("newsReviewQuestion").textContent="아직 저장한 표현이 없어. 기사 아래 실전 표현 탭에서 먼저 저장해 줘.";
  $("newsReviewProgress").textContent="";
  $("newsReviewAnswer").classList.add("hidden");
  $("newsReviewReveal").classList.add("hidden");
  $("newsReviewRatings").classList.add("hidden");
  return;
 }
 // Opening the review again after navigating tabs resumes the exact same
 // card (even a revealed answer) until the user exits or finishes the session.
 if(reviewQueue.length&&reviewIndex<reviewQueue.length){
  $("newsReviewArea").classList.remove("hidden");
  return;
 }
 const due=dueExpressions();
 reviewQueue=shuffleReviewCards(due.length?due:saved());
 reviewIndex=0;reviewRevealed=false;
 $("newsReviewArea").classList.remove("hidden");
 renderReviewCard();
}
function renderReviewCard(){
 $("newsReviewAnswer").classList.add("hidden");
 $("newsReviewRatings").classList.add("hidden");
 $("newsReviewReveal").classList.remove("hidden");
 reviewRevealed=false;
 if(reviewIndex>=reviewQueue.length){
  $("newsReviewProgress").textContent="오늘의 복습 완료";
  $("newsReviewQuestion").textContent="잘했어! 저장한 표현의 다음 복습 날짜가 갱신됐어.";
  $("newsReviewReveal").classList.add("hidden");
  $("newsReviewRatings").classList.add("hidden");
  countReviews();return;
 }
 const id=reviewQueue[reviewIndex],item=saved().find(x=>x.id===id);
 if(!item){reviewIndex++;renderReviewCard();return}
 const due=dueExpressions().length;
 $("newsReviewProgress").textContent=(reviewIndex+1)+" / "+reviewQueue.length+" · "+(due?"오늘 복습":"자유 복습");
 $("newsReviewQuestion").textContent=item.form;
 $("newsReviewAnswer").innerHTML="";
}
function revealReview(){
 if(reviewIndex>=reviewQueue.length)return;
 const item=saved().find(x=>x.id===reviewQueue[reviewIndex]);
 if(!item)return;
 const id=item.id,a=source.find(x=>id.startsWith(x.id+":"));
 const e=a?.expressions.find(x=>x.form===item.form);
 const reading=e?.reading||item.reading||"";
 const meaning=e?.meaning||item.meaning||"";
 const similar=e?.similar||item.compare||"";
 const note=e?.note||item.note||"";
 const paraIndex=a?.paragraphs.findIndex(x=>x.includes(item.form))??-1;
 const example=item.example||(paraIndex>=0?sentencesJP(a.paragraphs[paraIndex]).find(x=>x.includes(item.form)):"")||"";
 const sentenceKo=sentenceKoForItem(item,a,paraIndex,example);
 const answer=$("newsReviewAnswer");
 answer.innerHTML='<p><strong class="news-expression-ruby" lang="ja">'+expressionRuby(item.form,reading)+'</strong></p>'+
  '<p><b>뜻</b> '+esc(meaning)+'</p>'+
  (example?'<p lang="ja">'+esc(example)+'</p>':"")+
  (sentenceKo?'<p class="sub">'+esc(sentenceKo)+'</p>':"")+
  (similar?'<p class="sub"><b>유사 표현</b> '+esc(similarWithoutReading(similar))+'</p>':"")+
  (note?'<p class="sub"><b>사용 뉘앙스</b> '+esc(note)+'</p>':"");
 answer.classList.remove("hidden");
 $("newsReviewReveal").classList.add("hidden");
 $("newsReviewRatings").classList.remove("hidden");
 reviewRevealed=true;
}
function rateReview(grade){
 if(!reviewRevealed||!["again","hard","good","easy"].includes(grade)||reviewIndex>=reviewQueue.length)return;
 const id=reviewQueue[reviewIndex],now=Date.now();
 const cards=saved(),item=cards.find(x=>x.id===id);
 if(!item){reviewIndex++;renderReviewCard();return}
 const previous=item.review||{},days=Number(previous.intervalDays)||0;
 const intervalMs=grade==="again"?600000:86400000*(grade==="hard"?Math.max(1,Math.ceil(days*1.2)):grade==="good"?Math.max(3,Math.ceil(days*2.2)):Math.max(5,Math.ceil(days*3)));
 const review={
  due:now+intervalMs,intervalDays:grade==="again"?0:intervalMs/86400000,
  reps:(Number(previous.reps)||0)+1,
  lapses:(Number(previous.lapses)||0)+(grade==="again"?1:0),
  lastGrade:grade,lastReviewedAt:now,updatedAt:now
 };
 try{
  localStorage.setItem(storeKey,JSON.stringify(cards.map(x=>x.id===id?{...x,updatedAt:now,review}:x)));
  window.dispatchEvent(new Event("kojer-news:changed"));
 }catch(e){console.warn("뉴스 복습 기록 저장 실패",e);return}
 reviewIndex++;
 renderSavedNotebook();
 renderReviewCard();
}

function resetNewsPanels(){
 // Keep saved articles/SRS data, but reset only the open UI when entering News.
 const panel=$("newsSavedPanel"),toggle=$("newsSavedToggle"),list=$("newsSavedList");
 if(panel)panel.classList.add("hidden");
 if(toggle)toggle.setAttribute("aria-expanded","false");
 const review=$("newsReviewArea");
 if(review)review.classList.add("hidden");
 if(list){
  list.querySelectorAll("details.news-saved-card").forEach(node=>{node.open=false});
  list.querySelectorAll(".news-saved-answer.is-revealed").forEach(node=>node.classList.remove("is-revealed"));
  list.querySelectorAll("[data-news-reveal-answer]").forEach(button=>{
   button.textContent="번역 보기";
   button.setAttribute("aria-expanded","false");
  });
 }
 if($("newsExpressionPanel")&&!$("newsExpressionPanel").classList.contains("hidden"))expressionTab(false);
}
window.KOJER_NEWS_RESET_PANELS=resetNewsPanels;

function sentencesJP(value){return (String(value||"").match(/[^。！？!?]+[。！？!?]?/gu)||[]).map(x=>x.trim()).filter(Boolean)}
function sentencesKO(value){
 const text=String(value||""),out=[];let current="";
 for(let i=0;i<text.length;i++){
  const c=text[i];current+=c;
  if(!/[.!?。！？]/u.test(c))continue;
  // Japanese names written with initials (e.g. G.) and decimals (18.5%)
  // are not Korean sentence boundaries.
  if(c==="."&&/[0-9]/.test(text[i-1]||"")&&/[0-9]/.test(text[i+1]||""))continue;
  if(c==="."&&/(?:^|\s)[A-Z]\.$/.test(current)&&/\s/.test(text[i+1]||""))continue;
  if(current.trim())out.push(current.trim());
  current="";
 }
 if(current.trim())out.push(current.trim());
 return out;
}
// Align the Korean text with the selected Japanese sentence, not its paragraph.
function alignedSentenceKo(a,k,japaneseSentence){
 if(!a||k<0)return "";
 const jp=sentencesJP(a.paragraphs?.[k]),ko=sentencesKO(a.translationParagraphs?.[k]);
 const i=jp.findIndex(x=>x===String(japaneseSentence||"").trim());
 if(i<0)return "";
 if(jp.length===ko.length)return ko[i]||"";
 if(jp.length===1)return String(a.translationParagraphs?.[k]||"");
 return "";
}
function sentenceKoForItem(item,a,paraIndex,example){
 if(a&&paraIndex>=0){
  const computed=alignedSentenceKo(a,paraIndex,example);
  if(computed)return computed;
  // An older saved excerpt can still contain kanji dates or quantities.
  // If its expression occurs in exactly one current Japanese sentence, use
  // that sentence's Korean translation instead of exposing the whole paragraph.
  const jpLines=sentencesJP(a.paragraphs?.[paraIndex]);
  const koLines=sentencesKO(a.translationParagraphs?.[paraIndex]);
  const hits=jpLines.map((line,i)=>line.includes(item?.form||"")?i:-1).filter(i=>i>=0);
  if(item?.form&&hits.length===1&&jpLines.length===koLines.length)return koLines[hits[0]]||"";
 }
 if(item?.sentenceTranslation)return String(item.sentenceTranslation);
 const old=sentencesKO(item?.translation||"");
 return old.length===1?old[0]:"";
}
let loadingSavedSources=false;
async function loadSavedSources(){
 if(loadingSavedSources)return;
 const ids=[...new Set(saved().map(x=>String(x.id||"").split(":")[0]).filter(id=>archiveIndex.some(a=>a.id===id)&&!source.some(a=>a.id===id)))];
 if(!ids.length)return;
 loadingSavedSources=true;
 try{await Promise.allSettled(ids.map(id=>loadArchivedArticle(id)))}
 finally{loadingSavedSources=false;if(!$("newsSavedPanel").classList.contains("hidden"))renderSavedNotebook()}
}
function renderSavedNotebook(){
 const arr=saved().slice().sort((a,b)=>String(b.savedAt||"").localeCompare(String(a.savedAt||"")));
 $("newsSavedCount").textContent=String(arr.length);
 countReviews();
 const list=$("newsSavedList");
 const opened=new Set([...list.querySelectorAll("details.news-saved-card[open]")].map(node=>node.dataset.newsSavedId));
 if(!arr.length){list.innerHTML='<p class="sub">아직 저장한 표현이 없어. 기사를 읽은 뒤 아래 실전 표현 탭에서 저장해 봐.</p>';return}
 list.innerHTML=arr.map(item=>{
  const id=String(item.id||"");
  const matched=source.find(a=>id.startsWith(a.id+":"))||archiveIndex.find(a=>id.startsWith(a.id+":"));
  const e=matched?.expressions?.find(x=>matched.id+":"+x.form===id);
  const meaning=e?.meaning||item.meaning||"";
  const reading=e?.reading||item.reading||"";
  const similar=e?.similar||item.compare||"";
  const usage=e?.note||item.note||"";
  const paraIndex=matched?.paragraphs?.findIndex(p=>p.includes(e?.form||item.form))??-1;
  const example=item.example||(paraIndex>=0?matched.paragraphs[paraIndex].split(/(?<=[。！？!?])/).find(p=>p.includes(item.form)):"")||"";
  const ko=sentenceKoForItem(item,matched,paraIndex,example);
  const articleLink=matched?'<a href="#newsreader/'+encodeURIComponent(matched.id)+'" class="secondary" style="display:inline-block;padding:6px 10px;text-decoration:none">기사로 이동 →</a>':"";
  const answer=ko?'<div class="news-saved-answer" id="newsSavedAnswer-'+esc(id)+'">'+
   '<p class="news-saved-ko">'+esc(ko)+'</p></div>':"";
  return '<details class="news-saved-card" data-news-saved-id="'+esc(id)+'"'+(opened.has(id)?" open":"")+'>'+
   '<summary class="news-saved-summary"><span class="news-saved-head"><strong class="news-saved-form" lang="ja">'+expressionDetailRuby(item.form,reading)+'</strong></span><span class="news-saved-chevron" aria-hidden="true">⌄</span></summary>'+
   '<div class="news-saved-detail">'+
   '<p class="news-saved-direct-meaning"><b>뜻</b> '+esc(meaning)+'</p>'+
   (example?'<div class="news-sentence" lang="ja">'+annotateExpressionSentence(example,item.form,reading)+'</div>':"")+
   (similar?'<p><b>유사 표현</b> <span lang="ja">'+similarExpressionHTML(similar)+'</span></p>':"")+
   (usage?'<p><b>사용 뉘앙스</b> '+esc(usage)+'</p>':"")+
   (ko?'<button type="button" class="secondary news-saved-reveal" data-news-reveal-answer="'+esc(id)+'" aria-expanded="false">번역 보기</button>':"")+
   answer+
   '<div class="news-saved-actions">'+articleLink+
   '<button type="button" class="secondary" data-delete-news-expression="'+esc(id)+'" style="font-size:12px">수첩에서 삭제</button></div>'+
   '</div></details>';
 }).join("");
 list.querySelectorAll(".news-saved-card .furi").forEach(node=>{
  node.setAttribute("role","button");
  node.setAttribute("tabindex","0");
  node.setAttribute("aria-label",node.textContent+" 후리가나 보기");
 });
}
function updateParagraphTranslation(){
 if(!article)return;
 const titleKo=getTitleTranslation(article),showTitle=!!titleKo&&(translationOpen||titleOpen);
 const titleButton=$("newsTitleTranslate"),titleBody=$("newsTitleKo");
 titleButton.classList.toggle("hidden",!titleKo);
 titleButton.textContent=showTitle?"제목 번역 숨기기":"제목 번역 보기";
 titleButton.setAttribute("aria-expanded",String(showTitle));
 titleBody.textContent=titleKo;
 titleBody.classList.toggle("hidden",!showTitle);
 $("newsArticleBody").querySelectorAll(".news-paragraph").forEach((node,i)=>{
  const open=translationOpen||paragraphOpen.has(i);
  const body=node.querySelector(".news-paragraph-ko");
  const btn=node.querySelector(".news-paragraph-translate");
  if(body)body.classList.toggle("hidden",!open);
  if(btn){btn.textContent=open?"문단 번역 숨기기":"이 문단 번역 보기";btn.setAttribute("aria-expanded",String(open))}
 });
 $("newsArticleTranslate").textContent=translationOpen?"전체 번역 숨기기":"전체 번역 보기";
}
function phrase(key,{preserve=false}={}){
 if(!article||!expressionOpen)return;
 const e=article.expressions.find(x=>x.form===key);if(!e)return;
 if(!preserve&&selectedExpression===key){clearExpressionSelection();return;}
 selectedExpression=key;
 let firstHighlight=null;
 $("newsArticleBody").querySelectorAll("[data-news-expression]").forEach(el=>{
  const active=el.dataset.newsExpression===key;
  el.classList.toggle("news-phrase-selected",active);
  if(active&&!firstHighlight)firstHighlight=el;
 });
 $("newsArticleExpressions").querySelectorAll("[data-news-expression-button]").forEach(el=>{
  const active=el.dataset.newsExpressionButton===key;
  el.classList.toggle("active",active);
  el.setAttribute("aria-pressed",String(active));
 });
 const index=article.paragraphs.findIndex(x=>x.includes(key));
 const jp=index>=0?article.paragraphs[index]:"";
 const sentence=sentencesJP(jp).find(x=>x.includes(key))||jp;
 const ko=index>=0?alignedSentenceKo(article,index,sentence):"";
 const id=article.id+":"+key,already=saved().some(x=>x.id===id);
 const panel=$("newsArticleExpressionInfo");
 panel.innerHTML='<div class="news-expression-info-heading"><strong class="news-expression-ruby news-expression-interactive" lang="ja">'+expressionDetailRuby(key,e.reading)+'</strong> <span class="tag">실전 표현</span>'+
 '<button type="button" class="secondary news-jump-to-expression" id="newsJumpToExpression" aria-label="본문에서 이 표현의 위치로 이동" title="본문의 표현 위치로 이동">↗ <span>본문으로</span></button></div>'+
 '<p style="margin:8px 0">뜻 · '+esc(e.meaning||"")+'</p>'+
 '<p lang="ja" class="news-expression-example" style="font-size:17px;margin:11px 0;line-height:2.15">'+annotateExpressionSentence(sentence,key,e.reading)+'</p>'+
 (e.similar?'<p class="news-similar-expression" style="margin:8px 0"><b>유사 표현</b> '+similarExpressionHTML(e.similar)+'</p>':"")+
 (e.note?'<p style="margin:8px 0"><b>사용 뉘앙스</b> '+esc(e.note)+'</p>':"")+
 '<button type="button" class="secondary" id="newsSavePhrase">'+(already?"✓ 저장됨 · 해제":"＋ 실전 표현 수첩에 저장")+"</button>";
 panel.classList.remove("hidden");
 // The global furigana click delegate is scoped to the article body.
 // Handle explanation-only furigana locally, without toggling the expression selection.
 panel.querySelectorAll(".news-expression-interactive .furi, .news-expression-example .furi, .news-similar-expression .furi").forEach(node=>{
  node.setAttribute("role","button");
  node.setAttribute("tabindex","0");
  node.setAttribute("aria-label",node.textContent+" 후리가나 보기");
  const toggle=()=>{if(!document.body.classList.contains("furi-off"))node.classList.toggle("show")};
  node.addEventListener("click",e=>{e.stopPropagation();toggle()});
  node.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle()}});
 });
 $("newsJumpToExpression").addEventListener("click",()=>{
  // The only action that scrolls from expression notes to the highlighted article text.
  const target=$("newsArticleBody").querySelector(".news-phrase-selected");
  if(target)target.scrollIntoView({block:"center",behavior:"smooth"});
 });
 $("newsSavePhrase").addEventListener("click",()=>{
  const all=saved();
  const now=Date.now();
  const next=all.some(x=>x.id===id)?all.filter(x=>x.id!==id):[...all,{id,type:"뉴스 표현",form:key,reading:e.reading||"",meaning:e.meaning||"",example:sentence,translation:ko,sentenceTranslation:ko,note:e.note||"보도를 바탕으로 재구성한 학습 기사 표현",compare:e.similar||"",source:article.source,title:article.title,cat:article.category,savedAt:new Date(now).toISOString(),updatedAt:now,review:{due:now,intervalDays:0,reps:0,lapses:0,updatedAt:now}}];
  try{
   localStorage.setItem(storeKey,JSON.stringify(next));
   if(already)window.KOJER_NEWS_SYNC?.markDeleted(id);
   window.dispatchEvent(new Event("kojer-news:changed"));
   phrase(key,{preserve:true});renderSavedNotebook()
  }catch{$("newsSavePhrase").textContent="저장할 수 없어"}
 });
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
 article=a;translationOpen=false;titleOpen=false;paragraphOpen=new Set();
 $("newsCuratedBrowser").classList.add("hidden");
 $("newsCuratedDetail").classList.remove("hidden");
 $("newsArticleMeta").textContent=[a.category,a.date,a.bodyLength+"자"].join(" · ");
 $("newsArticleTitle").innerHTML=titleHTML(a.title);
 if(typeof restoreInteractiveFuriState==="function")restoreInteractiveFuriState($("newsArticleTitle"));
 let marked=0,total=0;
 $("newsArticleBody").innerHTML=a.paragraphs.map((p,i)=>{
  const r=paragraphHTML(p);marked+=r.covered;total+=r.kanji;
  return '<section class="news-paragraph" id="newsParagraph'+i+'" data-paragraph="'+i+'"><p class="news-japanese-paragraph">'+r.html+'</p>'+
  '<button type="button" class="news-paragraph-translate" aria-expanded="false" data-news-paragraph-translate="'+i+'">이 문단 번역 보기</button>'+
  '<div class="news-paragraph-ko hidden" lang="ko">'+esc(a.translationParagraphs?.[i]||"번역 준비 중")+'</div></section>';
 }).join("");
 updateParagraphTranslation();
 $("newsExpressionCount").textContent="("+a.expressions.length+"개)";
 $("newsArticleExpressions").innerHTML=a.expressions.map(e=>'<button class="secondary" type="button" aria-pressed="false" data-news-expression-button="'+esc(e.form)+'"><span lang="ja">'+esc(e.form)+'</span></button>').join("");
 expressionTab(false);
 refreshMode();
 if(typeof restoreInteractiveFuriState==="function")restoreInteractiveFuriState($("newsArticleBody"));
 $("newsArticleBody").dataset.readingCoverage=total?String(Math.round(100*marked/total)):"100";
 restoreProgress(a.id);
 updateNewsReadButton();
}
function displayList(){
 if(article){captureProgress(true);expressionTab(false)}
 article=null;$("newsCuratedBrowser").classList.remove("hidden");$("newsCuratedDetail").classList.add("hidden");
}
let routeSerial=0;
async function route(){
 let hash=location.hash||"";
 try{hash=decodeURIComponent(hash)}catch{}
 if(!hash.startsWith("#newsreader"))return;
 if(!$("newsreaderView")?.classList.contains("active")&&typeof showView==="function")showView("newsreader");
 const id=hash.startsWith("#newsreader/")?hash.slice("#newsreader/".length):"";
 const serial=++routeSerial;
 if(!id){
  displayList();
  window.scrollTo({top:0,behavior:"auto"});
  return;
 }
 if(article&&article.id!==id)captureProgress(true);
 if(!source.some(x=>x.id===id)){
  $("newsCuratedBrowser").classList.add("hidden");
  $("newsCuratedDetail").classList.remove("hidden");
  $("newsArticleMeta").textContent="";
  $("newsArticleTitle").textContent="기사를 불러오는 중…";
   $("newsTitleTranslate").classList.add("hidden");$("newsTitleKo").classList.add("hidden");
  $("newsArticleBody").textContent="";
  $("newsArticleExpressions").textContent="";
  $("newsReadResume").classList.add("hidden");
 }
 window.scrollTo({top:0,behavior:"auto"});
 try{
  await loadArchivedArticle(id);
  // Ignore a stale request when the user picked another article or left the news tab.
  if(serial!==routeSerial||!location.hash.startsWith("#newsreader/")||decodeURIComponent(location.hash.slice(12))!==id)return;
  displayArticle(id);
  window.scrollTo({top:0,behavior:"auto"});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(serial===routeSerial&&article?.id===id)window.scrollTo({top:0,behavior:"auto"});
  }));
 }catch(error){
  if(serial!==routeSerial||!location.hash.startsWith("#newsreader/"))return;
  $("newsArticleTitle").textContent="기사를 불러오지 못했어";
   $("newsTitleTranslate").classList.add("hidden");$("newsTitleKo").classList.add("hidden");
  $("newsArticleBody").textContent=error.message||"잠시 후 다시 시도해 줘.";
  $("newsArticleExpressions").textContent="";
  $("newsArticleMeta").textContent="기사 파일을 확인해 줘. 뒤로 이동 후 다시 열면 재시도할 수 있어.";
 }
}
function init(){
 if(!$("newsCuratedDetail"))return;
 for(const id of ["newsCuratedBack","newsCuratedBottomBack"])$(id).addEventListener("click",()=>{location.hash="#newsreader"});
 $("newsReadResume").addEventListener("click",resumeProgress);
 $("newsMarkRead").addEventListener("click",toggleNewsRead);
 $("newsTitleTranslate").addEventListener("click",()=>{
  if(!article||!getTitleTranslation(article))return;
  if(translationOpen){translationOpen=false;paragraphOpen=new Set(article.paragraphs.map((_,i)=>i));titleOpen=false}
  else titleOpen=!titleOpen;
  updateParagraphTranslation();
 });
 $("newsArticleTranslate").addEventListener("click",()=>{
  if(!article)return;
  translationOpen=!translationOpen;
  if(!translationOpen){paragraphOpen.clear();titleOpen=false}
  updateParagraphTranslation();
 });
 $("newsArticleTools").addEventListener("click",e=>{
  const button=e.target.closest("[data-news-furi]");if(!button)return;
  localStorage.setItem("jlptN1FuriV3",button.dataset.newsFuri);
  if(typeof applyFuri==="function")applyFuri();
  refreshMode();
 });
 $("newsArticleBody").addEventListener("click",e=>{
  const btn=e.target.closest("[data-news-paragraph-translate]");
  if(!btn)return;
  const n=Number(btn.dataset.newsParagraphTranslate);
  if(translationOpen){translationOpen=false;paragraphOpen=new Set(article.paragraphs.map((_,i)=>i))}
  if(paragraphOpen.has(n))paragraphOpen.delete(n);else paragraphOpen.add(n);
  updateParagraphTranslation();
 });
 $("newsSavedToggle").addEventListener("click",()=>{
  const target=$("newsSavedPanel"),open=target.classList.contains("hidden");
  if(!open){
   resetNewsPanels();
  }else{
   target.classList.remove("hidden");
   $("newsSavedToggle").setAttribute("aria-expanded","true");
   renderSavedNotebook();
   loadSavedSources();
  }
 });
 $("newsStartReview").addEventListener("click",beginReview);
 $("newsReviewReveal").addEventListener("click",revealReview);
 $("newsReviewExit").addEventListener("click",()=>{
  reviewQueue=[];reviewIndex=0;$("newsReviewArea").classList.add("hidden")
 });
 $("newsReviewRatings").addEventListener("click",e=>{
  const b=e.target.closest("[data-news-grade]");if(b)rateReview(b.dataset.newsGrade);
 });
 $("newsSavedList").addEventListener("click",e=>{
  const ruby=e.target.closest(".news-saved-card .furi");
  if(ruby){
   // The expression heading is inside a <summary>; clicking a kanji must
   // reveal its furigana without accidentally folding the card.
   e.preventDefault();
   e.stopPropagation();
   if(!document.body.classList.contains("furi-off"))ruby.classList.toggle("show");
   return;
  }
  const reveal=e.target.closest("[data-news-reveal-answer]");
  if(reveal){
   const answer=reveal.closest(".news-saved-detail")?.querySelector(".news-saved-answer");
   if(!answer)return;
   const showing=answer.classList.toggle("is-revealed");
   reveal.textContent=showing?"번역 숨기기":"번역 보기";
   reveal.setAttribute("aria-expanded",String(showing));
   return;
  }
  const btn=e.target.closest("[data-delete-news-expression]");
  if(!btn)return;
  const remaining=saved().filter(x=>x.id!==btn.dataset.deleteNewsExpression);
  try{
   localStorage.setItem(storeKey,JSON.stringify(remaining));
   window.KOJER_NEWS_SYNC?.markDeleted(btn.dataset.deleteNewsExpression);
   window.dispatchEvent(new Event("kojer-news:changed"));
   renderSavedNotebook()
  }catch(e){console.warn(e)}
 });
 $("newsSavedList").addEventListener("toggle",e=>{
  const details=e.target;
  if(!details.matches?.("details.news-saved-card")||details.open)return;
  const answer=details.querySelector(".news-saved-answer");
  if(answer)answer.classList.remove("is-revealed");
  const button=details.querySelector("[data-news-reveal-answer]");
  if(button){button.textContent="번역 보기";button.setAttribute("aria-expanded","false")}
 },true);
 $("newsSavedList").addEventListener("keydown",e=>{
  const ruby=e.target.closest(".news-saved-card .furi");
  if(ruby&&(e.key==="Enter"||e.key===" ")){
   e.preventDefault();
   if(!document.body.classList.contains("furi-off"))ruby.classList.toggle("show");
  }
 });
 window.addEventListener("scroll",()=>captureProgress(),{passive:true});
 window.addEventListener("pagehide",()=>captureProgress(true));
 $("newsExpressionToggle").addEventListener("click",()=>expressionTab(!expressionOpen));
 $("newsArticleExpressions").addEventListener("click",e=>{
  const btn=e.target.closest("[data-news-expression-button]");
  if(btn)phrase(btn.dataset.newsExpressionButton);
 });
 document.addEventListener("click",e=>{
  const link=e.target.closest('a[href^="#newsreader/"]');
  if(link&&location.hash!=="#newsreader")history.replaceState(null,"","#newsreader");
  if(e.target.closest('[data-view="newsreader"],[data-go="newsreader"]')){
   // The news list is a normal tab and should not leave #newsreader in the URL.
   history.replaceState(history.state,"",location.pathname+location.search);
   displayList();
  }
 },true);
 window.addEventListener("hashchange",route);
 window.addEventListener("popstate",route);
 window.addEventListener("kojer-news:updated",()=>{
  renderSavedNotebook();
  if(article&&$("newsreaderView").classList.contains("active")){
   restoreProgress(article.id);
   updateNewsReadButton();
  }
  if(typeof renderCuratedNewsHome==="function"&&$("newsreaderView").classList.contains("active"))renderCuratedNewsHome();
 });
 renderSavedNotebook();
 if(typeof renderCuratedNewsHome==="function")renderCuratedNewsHome();
 route();
}
init();
})();
