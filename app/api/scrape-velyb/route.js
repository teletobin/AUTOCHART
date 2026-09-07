import * as cheerio from "cheerio";

const BASE =
  "https://www.velyb.kr/community/community01.php?tb=event_multi";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ── CORS 헤더 (GitHub Pages 등 외부에서 호출 허용) ──
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── OPTIONS (브라우저 프리플라이트) ──
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function tidyPlusSegments(name) {
  let r = name.replace(/\s*\+\s*/g, "+");
  const m = r.match(/^(.*?)(\d+)회\+(.*?)\2회(.*)$/);
  if (m) {
    const [, before, n, middle, after] = m;
    r =
      n === "1"
        ? `${before.trim()}+${middle.trim()}${after}`
        : `${before.trim()}+${middle.trim()} ${n}회${after}`;
  }
  return r.replace(/\s+/g, " ").trim();
}

async function scrapeOnePage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const items = [];

  $("ul.slist > li").each((_, el) => {
    const rawName = $(el).find("strong").first().text().trim();
    const priceText = $(el).find("span.o_price01").first().text().trim();
    if (!rawName || !priceText) return;

    const name = tidyPlusSegments(rawName);
    const price = parseInt(priceText.replace(/[^0-9]/g, ""), 10);

    if (name.length < 5 || !price || price <= 0) return;
    if (!/[가-힣]/.test(name)) return;

    items.push({ name, price: `${price.toLocaleString("ko-KR")}원` });
  });

  return items;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const etc5 = searchParams.get("etc5") || "홍대점";
  const sField = searchParams.get("sField");

  try {
    const fields = sField ? [sField] : ["1", "2", "3", "4", "5", "6", "7"];
    const all = [];

    for (const f of fields) {
      const url = `${BASE}&etc5=${encodeURIComponent(etc5)}&sField=${f}`;
      const items = await scrapeOnePage(url);
      all.push(...items);
    }

    const map = new Map();
    for (const t of all) map.set(t.name, t);
    const deduped = Array.from(map.values());

    return Response.json(
      { branch: etc5, count: deduped.length, treatments: deduped },
      { headers: CORS }
    );
  } catch (e) {
    return Response.json(
      { error: String(e) },
      { status: 500, headers: CORS }
    );
  }
}