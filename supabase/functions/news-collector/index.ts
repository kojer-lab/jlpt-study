import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// JLPT News Reading: authenticated, title-only Japanese RSS retrieval.
// No article-body scraping, no AI billing, and no writes to JLPT study tables.
const CATEGORIES = [
  ["시사", "政治 OR 政策 OR 社会"],
  ["사건·사고", "事件 OR 事故 OR 逮捕"],
  ["국제", "国際 OR 世界 OR 外交"],
  ["스포츠", "スポーツ OR プロ野球 OR サッカー"],
  ["과학", "科学 OR 研究 OR 宇宙"],
  ["경제", "経済 OR 日経平均 OR 企業"],
  ["연예", "芸能 OR アイドル OR 音楽"],
  ["영화·애니", "映画 OR アニメ OR ドラマ"],
  ["생활·IT", "暮らし OR テクノロジー OR 生活"],
] as const;
type News = { id: string; category: string; title: string; source: string; url: string; publishedAt: string };
const ALLOWED_ORIGIN = "https://kojer-lab.github.io";
const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=60" },
});
let cache: { time: number; body: unknown } | null = null;
function decodeXML(s: string) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x[0-9a-fA-F]+|\d+);/g, (_m, n) => {
      const num = n[0]?.toLowerCase() === "x" ? parseInt(n.slice(1), 16) : parseInt(n, 10);
      try { return String.fromCodePoint(num); } catch { return ""; }
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_m, n) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[n] || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f]/g, " ").trim();
}
function tag(xml: string, name: string) {
  const match = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i").exec(xml);
  return match ? decodeXML(match[1]) : "";
}
async function loadFeed(category: string, query: string): Promise<News[]> {
  const params = new URLSearchParams({
    q: query + " when:2d", hl: "ja", gl: "JP", ceid: "JP:ja",
  });
  const url = "https://news.google.com/rss/search?" + params.toString();
  const response = await fetch(url, {
    headers: { "Accept": "application/rss+xml, application/xml, text/xml", "User-Agent": "Mozilla/5.0 JPNewsReader/1.0" },
    signal: AbortSignal.timeout(9500),
  });
  if (!response.ok) throw new Error("RSS HTTP " + response.status);
  const feed = await response.text();
  if (!/<rss\b/i.test(feed)) throw new Error("RSS format unavailable");
  const cutoff = Date.now() - 72 * 3600_000;
  const items = [...feed.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  const result: News[] = [];
  for (const [, item] of items.slice(0, 45)) {
    const title = tag(item, "title").slice(0, 260);
    const link = tag(item, "link");
    const pub = tag(item, "pubDate");
    const source = tag(item, "source").slice(0, 70) || "Google ニュース";
    const ms = Date.parse(pub);
    if (!title || !link.startsWith("https://") || !Number.isFinite(ms) || ms < cutoff || ms > Date.now() + 3600_000) continue;
    if (!/^[\u3040-\u30ff\u3400-\u9fff]/.test(title) && !/[\u3040-\u30ff\u3400-\u9fff]/.test(title)) continue;
    result.push({
      id: category + ":" + link,
      category, title, source, url: link,
      publishedAt: new Date(ms).toISOString(),
    });
    if (result.length >= 4) break;
  }
  return result;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const bearer = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+[\w-]+\.[\w-]+\.[\w-]+$/.test(bearer)) {
    return json({ error: "Supabase 로그인 후 이용할 수 있습니다." }, 401);
  }
  // Platform verifies the JWT signature (verify_jwt=true); additionally verify user is active.
  const project = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!project || !anon) return json({ error: "Supabase 환경 설정 오류" }, 500);
  try {
    const userResult = await fetch(project + "/auth/v1/user", {
      headers: { "Authorization": bearer, "apikey": anon }, signal: AbortSignal.timeout(4500),
    });
    if (!userResult.ok) return json({ error: "로그인 상태를 다시 확인해주세요." }, 401);
  } catch { return json({ error: "인증 서버에 연결할 수 없습니다." }, 503); }
  if (cache && Date.now() - cache.time < 5 * 60_000) return json(cache.body);
  const results = await Promise.allSettled(CATEGORIES.map(([category, query]) => loadFeed(category, query)));
  const unique = new Set<string>();
  const articles: News[] = [];
  const errors: string[] = [];
  results.forEach((result, i) => {
    const category = CATEGORIES[i][0];
    if (result.status === "rejected") { errors.push(category); return; }
    if (!result.value.length) { errors.push(category); return; }
    for (const entry of result.value) {
      const key = entry.title.replace(/\s*-\s*[^-]{2,40}$/, "").replace(/[\s　]/g, "");
      if (unique.has(key)) continue;
      unique.add(key);
      articles.push(entry);
    }
  });
  if (!articles.length) return json({ error: "실시간 뉴스 수집에 실패했습니다. 잠시 뒤 다시 시도해주세요.", failedCategories: errors }, 502);
  const body = { version: 1, generatedAt: new Date().toISOString(), rangeHours: 72, articles, failedCategories: errors, contentScope: "headlines" };
  cache = { time: Date.now(), body };
  return json(body);
});
