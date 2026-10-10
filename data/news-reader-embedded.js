/* Integrated JLPT N1 curated-news reader. No separate page or paid AI API. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const source=Array.isArray(window.KOJER_CURATED_NEWS?.articles)?window.KOJER_CURATED_NEWS.articles:[];
window.KOJER_ADD_GENERATED_NEWS=function(articles){if(!Array.isArray(articles))return;for(const a of articles){if(a&&typeof a.id==="string"&&!source.some(x=>x.id===a.id))source.push(a)}if(typeof renderCuratedNewsHome==="function")renderCuratedNewsHome()};
const storeKey="jlpt-news-expression-test-v2";
const savedMeaningPreferenceKey="jlpt-news-saved-hide-meaning-v1";
let newsHideSavedMeanings=false;
try{newsHideSavedMeanings=localStorage.getItem(savedMeaningPreferenceKey)==="1"}catch{}
function updateSavedMeaningVisibility(){
 const panel=$("newsSavedPanel"),button=$("newsToggleMeanings");
 if(panel)panel.classList.toggle("news-meanings-hidden",newsHideSavedMeanings);
 if(button){
  button.textContent=newsHideSavedMeanings?"뜻 보기":"뜻 숨기기";
  button.setAttribute("aria-pressed",String(newsHideSavedMeanings));
  button.setAttribute("aria-label",newsHideSavedMeanings?"저장한 표현의 한국어 뜻 모두 보기":"저장한 표현의 한국어 뜻 모두 숨기기");
 }
}

let article=null,translationOpen=false,selectedExpression=null,expressionOpen=false;
let paragraphOpen=new Set(),lastProgressSave=0,suppressProgressSaveUntil=0;
const progressKey="jlptNewsReadProgressV1";
function savedProgress(){try{const v=JSON.parse(localStorage.getItem(progressKey)||"{}");return v&&typeof v==="object"?v:{}}catch{return {}}}
function progressFor(id){const p=savedProgress()[id];return p&&Number.isInteger(p.index)?p:null}
function captureProgress(force=false){
 if(!article||!$("newsreaderView")?.classList.contains("active")||!$("newsCuratedDetail")||$("newsCuratedDetail").classList.contains("hidden"))return;
 const now=Date.now();
 if(!force&&(now-lastProgressSave<400||now<suppressProgressSaveUntil))return;
 const nodes=[...$("newsArticleBody").querySelectorAll(".news-paragraph")];
 if(!nodes.length)return;
 let index=0;
 for(let i=0;i<nodes.length;i++){if(nodes[i].getBoundingClientRect().top<=Math.min(window.innerHeight*.43,280))index=i;else break}
 const offset=Math.max(0,Math.min(1100,Math.round(Math.min(window.innerHeight*.43,280)-nodes[index].getBoundingClientRect().top)));
 try{
  const state=savedProgress();
  state[article.id]={index,offset,updatedAt:now};
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
function wordHTML(surface,reading){
 const hasKanji=/[一-龯々〇〆ヵヶ]/;
 if(!hasKanji.test(surface))return esc(surface);
 // Only Kanji runs may receive furigana. Preserve visible hiragana/katakana as plain text.
 // Never annotate mixed kana/kanji text with one large ruby spanning the kana.
 const runs=[];
 for(const char of surface){
   const type=hasKanji.test(char)?"kanji":"plain";
   if(runs.length&&runs[runs.length-1].type===type)runs[runs.length-1].text+=char;
   else runs.push({type,text:char});
 }
 let out="",position=0,valid=true;
 const kanaOnly=x=>/^[ぁ-ゖァ-ヺー]+$/.test(x);
 for(let i=0;i<runs.length;i++){
  const run=runs[i];
  if(run.type==="plain"){
   if(kanaOnly(run.text)){
    if(!reading.startsWith(run.text,position)){valid=false;break}
    position+=run.text.length;
   }
   out+=esc(run.text);
   continue;
  }
  let end=reading.length;
  const next=runs.slice(i+1).find(run=>run.type==="plain"&&kanaOnly(run.text));
  if(next){
   const nextAt=runs.indexOf(next);
   end=nextAt===runs.length-1?reading.lastIndexOf(next.text):reading.indexOf(next.text,position+1);
  }
  if(end<=position){valid=false;break}
  const sound=reading.slice(position,end);
  if(!/^[ぁ-ゖァ-ヺー]+$/.test(sound)){valid=false;break}
  out+='<span class="furi" data-r="'+esc(sound)+'">'+esc(run.text)+'</span>';
  position=end;
 }
 if(valid&&position===reading.length)return out;
 // Bad or ambiguous segmentation: keep the actual text unchanged, no misleading ruby.
 return esc(surface);
}
function expressionDetailRuby(form,reading){
 const converted=wordHTML(String(form||""),String(reading||""));
 return converted.includes('class="furi"')?converted:annotate(form).output;
}
// Hide parenthesized kana readings in similar expressions, but preserve
// click-to-reveal furigana in the expanded expression detail.
function similarWithoutReading(value){
 return String(value||"").replace(/\s*[（(][ぁ-ゖァ-ヺー\s]+[）)]\s*$/u,"").trim();
}
function similarExpressionHTML(value){
 const raw=String(value||"").trim();
 const match=raw.match(/^(.+?)\s*[（(]([ぁ-ゖァ-ヺー\s]+)[）)]\s*$/u);
 if(!match)return annotate(similarWithoutReading(raw)).output;
 const surface=match[1].trim(),reading=match[2].replace(/\s/g,"");
 return expressionDetailRuby(surface,reading);
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
 const due=dueExpressions();
 reviewQueue=(due.length?due:saved()).map(x=>x.id).sort(()=>Math.random()-.5);
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
 const example=item.example||a?.paragraphs.find(x=>x.includes(item.form))?.split(/(?<=[。！？!?])/).find(x=>x.includes(item.form))||"";
 const answer=$("newsReviewAnswer");
 answer.innerHTML='<p><strong class="news-expression-ruby" lang="ja">'+expressionRuby(item.form,reading)+'</strong></p>'+
  '<p><b>뜻</b> '+esc(meaning)+'</p>'+
  (example?'<p lang="ja">'+esc(example)+'</p>':"")+
  (item.translation?'<p class="sub">'+esc(item.translation)+'</p>':"")+
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

function renderSavedNotebook(){
 const arr=saved().slice().sort((a,b)=>String(b.savedAt||"").localeCompare(String(a.savedAt||"")));
 $("newsSavedCount").textContent=String(arr.length);
 countReviews();
 const list=$("newsSavedList");
 const opened=new Set([...list.querySelectorAll("details.news-saved-card[open]")].map(node=>node.dataset.newsSavedId));
 updateSavedMeaningVisibility();
 $("newsToggleMeanings").disabled=!arr.length;
 if(!arr.length){list.innerHTML='<p class="sub">아직 저장한 표현이 없어. 기사를 읽은 뒤 아래 실전 표현 탭에서 저장해 봐.</p>';return}
 list.innerHTML=arr.map(item=>{
  const id=String(item.id||"");
  const matched=source.find(a=>id.startsWith(a.id+":"));
  const e=matched?.expressions?.find(x=>matched.id+":"+x.form===id);
  const meaning=e?.meaning||item.meaning||"";
  const similar=e?.similar||item.compare||"";
  const usage=e?.note||item.note||"";
  const paraIndex=matched?.paragraphs?.findIndex(p=>p.includes(e?.form||item.form))??-1;
  const example=item.example||(paraIndex>=0?matched.paragraphs[paraIndex].split(/(?<=[。！？!?])/).find(p=>p.includes(item.form)):"")||"";
  const ko=item.translation||(paraIndex>=0?matched.translationParagraphs[paraIndex]:"")||"";
  const articleLink=matched?'<a href="#newsreader/'+encodeURIComponent(matched.id)+'" class="secondary" style="display:inline-block;padding:6px 10px;text-decoration:none">기사로 이동 →</a>':"";
  const answer='<div class="news-saved-answer"><p><b>뜻</b> '+esc(meaning)+'</p>'+
   (ko?'<p class="news-saved-ko">'+esc(ko)+'</p>':"")+
   (usage?'<p><b>사용 뉘앙스</b> '+esc(usage)+'</p>':"")+'</div>';
  return '<details class="news-saved-card" data-news-saved-id="'+esc(id)+'"'+(opened.has(id)?" open":"")+'>'+
   '<summary class="news-saved-summary"><span class="news-saved-head"><strong class="news-saved-form" lang="ja">'+esc(item.form)+'</strong><span class="news-saved-meaning">'+esc(meaning)+'</span></span><span class="news-saved-chevron" aria-hidden="true">⌄</span></summary>'+
   '<div class="news-saved-detail">'+
   (example?'<div class="news-saved-label">기사 속 예문</div><div class="news-sentence" lang="ja">'+annotate(example).output+'</div>':"")+
   (similar?'<p><b>유사 표현</b> <span lang="ja">'+similarExpressionHTML(similar)+'</span></p>':"")+
   answer+
   '<div class="news-saved-actions"><button type="button" class="secondary news-saved-reveal" data-news-reveal-answer="'+esc(id)+'" aria-expanded="false">뜻·해설 확인</button>'+
   articleLink+'<button type="button" class="secondary" data-delete-news-expression="'+esc(id)+'" style="font-size:12px">수첩에서 삭제</button></div>'+
   '</div></details>';
 }).join("");
 list.querySelectorAll(".news-saved-detail .furi").forEach(node=>{
  node.setAttribute("role","button");
  node.setAttribute("tabindex","0");
  node.setAttribute("aria-label",node.textContent+" 후리가나 보기");
 });
}
function updateParagraphTranslation(){
 if(!article)return;
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
 const sentence=jp.split(/(?<=[。！？!?])/).find(x=>x.includes(key))||jp;
 const ko=index>=0?(article.translationParagraphs?.[index]||""):"";
 const id=article.id+":"+key,already=saved().some(x=>x.id===id);
 const panel=$("newsArticleExpressionInfo");
 panel.innerHTML='<div class="news-expression-info-heading"><strong class="news-expression-ruby news-expression-interactive" lang="ja">'+expressionDetailRuby(key,e.reading)+'</strong> <span class="tag">실전 표현</span>'+
 '<button type="button" class="secondary news-jump-to-expression" id="newsJumpToExpression" aria-label="본문에서 이 표현의 위치로 이동" title="본문의 표현 위치로 이동">↗ <span>본문으로</span></button></div>'+
 '<p style="margin:8px 0">뜻 · '+esc(e.meaning||"")+'</p>'+
 '<p lang="ja" class="news-expression-example" style="font-size:17px;margin:11px 0;line-height:2.15">'+annotate(sentence).output+'</p>'+
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
  const next=all.some(x=>x.id===id)?all.filter(x=>x.id!==id):[...all,{id,type:"뉴스 표현",form:key,reading:e.reading||"",meaning:e.meaning||"",example:sentence,translation:ko,note:e.note||"보도를 바탕으로 재구성한 학습 기사 표현",compare:e.similar||"",source:article.source,title:article.title,cat:article.category,savedAt:new Date(now).toISOString(),updatedAt:now,review:{due:now,intervalDays:0,reps:0,lapses:0,updatedAt:now}}];
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
 article=a;translationOpen=false;paragraphOpen=new Set();
 $("newsCuratedBrowser").classList.add("hidden");
 $("newsCuratedDetail").classList.remove("hidden");
 $("newsArticleMeta").textContent=[a.category,a.date,a.bodyLength+"자"].join(" · ");
 $("newsArticleTitle").textContent=a.title;
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
}
function displayList(){
 if(article){captureProgress(true);expressionTab(false)}
 article=null;$("newsCuratedBrowser").classList.remove("hidden");$("newsCuratedDetail").classList.add("hidden");
}
function route(){
 let hash=location.hash||"";
 try{hash=decodeURIComponent(hash)}catch{}
 if(!hash.startsWith("#newsreader"))return;
 if(!$("newsreaderView")?.classList.contains("active")&&typeof showView==="function")showView("newsreader");
 const id=hash.startsWith("#newsreader/")?hash.slice("#newsreader/".length):"";
 if(id){
  if(article&&article.id!==id)captureProgress(true);
  displayArticle(id);
  // A hash route keeps the previous scroll position unless explicitly reset.
  // Set it immediately and after the article layout is painted (including Safari).
  window.scrollTo({top:0,behavior:"auto"});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(article&&article.id===id)window.scrollTo({top:0,behavior:"auto"});
  }));
 }else{
  displayList();
  window.scrollTo({top:0,behavior:"auto"});
 }
}
function init(){
 if(!$("newsCuratedDetail"))return;
 for(const id of ["newsCuratedBack","newsCuratedBottomBack"])$(id).addEventListener("click",()=>{location.hash="#newsreader"});
 $("newsReadResume").addEventListener("click",resumeProgress);
 $("newsArticleTranslate").addEventListener("click",()=>{
  if(!article)return;
  translationOpen=!translationOpen;
  if(!translationOpen)paragraphOpen.clear();
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
  target.classList.toggle("hidden",!open);
  $("newsSavedToggle").setAttribute("aria-expanded",String(open));
  if(open)renderSavedNotebook();
 });
 $("newsToggleMeanings").addEventListener("click",()=>{
  newsHideSavedMeanings=!newsHideSavedMeanings;
  try{localStorage.setItem(savedMeaningPreferenceKey,newsHideSavedMeanings?"1":"0")}catch{}
  updateSavedMeaningVisibility();
  if(newsHideSavedMeanings){
   $("newsSavedList").querySelectorAll(".news-saved-answer.is-revealed").forEach(node=>node.classList.remove("is-revealed"));
   $("newsSavedList").querySelectorAll("[data-news-reveal-answer]").forEach(button=>{
    button.textContent="뜻·해설 확인";
    button.setAttribute("aria-expanded","false");
   });
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
  const ruby=e.target.closest(".news-saved-detail .furi");
  if(ruby){
   if(!document.body.classList.contains("furi-off"))ruby.classList.toggle("show");
   e.stopPropagation();return;
  }
  const reveal=e.target.closest("[data-news-reveal-answer]");
  if(reveal){
   const answer=reveal.closest(".news-saved-detail")?.querySelector(".news-saved-answer");
   if(!answer)return;
   const showing=answer.classList.toggle("is-revealed");
   reveal.textContent=showing?"뜻·해설 다시 숨기기":"뜻·해설 확인";
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
 $("newsSavedList").addEventListener("keydown",e=>{
  const ruby=e.target.closest(".news-saved-detail .furi");
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
   history.replaceState(null,"","#newsreader");displayList();
  }
 },true);
 window.addEventListener("hashchange",route);
 window.addEventListener("popstate",route);
 window.addEventListener("kojer-news:updated",()=>{
  renderSavedNotebook();
  if(article&&$("newsreaderView").classList.contains("active")){
   restoreProgress(article.id);
  }
 });
 renderSavedNotebook();
 route();
}
init();
})();
