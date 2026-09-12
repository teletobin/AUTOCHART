import axios from "axios";
import * as cheerio from "cheerio";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { applyCleanupRules, type CleanupRule } from "@/lib/cleanup";
import { detectTreatmentCategory } from "@/lib/categoryDetection";
import { TreatmentCategory } from "@/lib/types";

// 시술명에 슬래시가 있으면 각각을 분리된 시술명으로 확장한다
// 예: "(여자) 종아리/허벅지 제모" -> ["(여자) 종아리 제모", "(여자) 허벅지 제모"]
function expandSlashTreatments(name: string): string[] {
  const tokens = name.split(/\s+/);
  const slashTokenIdx = tokens.findIndex((t) => t.includes("/"));
  if (slashTokenIdx === -1) return [name];

  const slashToken = tokens[slashTokenIdx];
  const parts = slashToken.split("/");
  if (parts.length !== 2) return [name]; // 슬래시가 정확히 하나만 있는 경우만 처리

  return parts.map((part) => {
    const newTokens = [...tokens];
    newTokens[slashTokenIdx] = part;
    return newTokens.join(" ");
  });
}

const BRANCH = "홍대점";

const URLS = [
  { sField: 1, mainCategory: "기획전", name: "기획전" },
  { sField: 2, mainCategory: "쁘띠성형", name: "쁘띠성형" },
  { sField: 3, mainCategory: "피부", name: "피부" },
  { sField: 4, mainCategory: "리프팅", name: "리프팅" },
  { sField: 5, mainCategory: "부스터", name: "부스터" },
  { sField: 6, mainCategory: "제모", name: "제모" },
  { sField: 7, mainCategory: "비만", name: "비만" },
].map((item) => ({
  ...item,
  url: `https://www.velyb.kr/community/community01.php?tb=event_multi&etc5=%ED%99%8D%EB%8C%80%EC%A0%90&sField=${item.sField}`,
}));

type ScrapedTreatment = {
  branch: string;
  name: string;
  price: number;
  category: TreatmentCategory | null;
  scraped_at: string;
  is_manual: boolean;
  section?: string;
};

async function scrapeOnePage(
  url: string,
  cleanupRules: CleanupRule[],
  mainCategory?: string
): Promise<ScrapedTreatment[]> {
  const { data: html } = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const $ = cheerio.load(html);
  const treatments: ScrapedTreatment[] = [];

  // 시술 목록은 ul.slist > li 구조이며, 각 li는 strong(시술명)과
  // p.price01 > span.o_price01(이벤트가) / span.s_price01(정가)로 구성됨
  $("ul.slist > li").each((_, el) => {
    const rawName = $(el).find("strong").first().text().trim();
    const priceText = $(el).find("span.o_price01").first().text().trim();

    if (!rawName || !priceText) return;

    const name = applyCleanupRules(rawName, cleanupRules);
    const price = parseInt(priceText.replace(/[^0-9]/g, ""), 10);

    if (name.length < 5 || !price || price <= 0) return;
    if (!/[가-힣]/.test(name)) return;

    // 슬래시가 있으면 각각으로 분리해서 추가
    const expandedNames = expandSlashTreatments(name);
    for (const expandedName of expandedNames) {
      treatments.push({
        branch: BRANCH,
        name: expandedName,
        price,
        category: detectTreatmentCategory(expandedName, mainCategory),
        scraped_at: new Date().toISOString(),
        is_manual: false,
      });
    }
  });

  return treatments;
}

export async function runScrapeAndSync() {
  const supabase = getSupabaseServerClient();

  const { data: rules, error: rulesError } = await supabase
    .from("cleanup_rules")
    .select("type, pattern, replacement");

  if (rulesError) {
    throw new Error(`정리 규칙을 불러오지 못했습니다: ${rulesError.message}`);
  }

  const cleanupRules = (rules ?? []) as CleanupRule[];

  const treatments: ScrapedTreatment[] = [];
  for (const item of URLS) {
    const pageTreatments = await scrapeOnePage(item.url, cleanupRules, item.mainCategory);
    treatments.push(...pageTreatments);
  }

  // 같은 시술명이 여러 섹션에 중복 노출되는 경우가 있어 branch+name 기준으로
  // 중복 제거 (마지막에 나온 값으로 덮어씀) 하지 않으면 upsert가 실패함
  const dedupedMap = new Map<string, ScrapedTreatment>();
  for (const t of treatments) {
    dedupedMap.set(`${t.branch}|${t.name}`, t);
  }
  const deduped = Array.from(dedupedMap.values());

  // 기존 카테고리 보존: 사용자가 수정한 카테고리가 스크래핑으로 덮어씌워지지 않도록
  const { data: existingTreatments } = await supabase
    .from("treatments")
    .select("branch, name, category")
    .eq("is_manual", false);

  const categoryMap = new Map<string, string | null>();
  for (const t of existingTreatments || []) {
    if (t.category) {
      categoryMap.set(`${t.branch}|${t.name}`, t.category);
    }
  }

  for (const t of deduped) {
    const key = `${t.branch}|${t.name}`;
    const existing = categoryMap.get(key);
    if (existing) {
      t.category = existing as TreatmentCategory;
    }
  }

  // 홈페이지에 없어서 직접 추가한(is_manual=true) 시술은 스크래핑 동기화 때
  // 지워지지 않도록 남겨두고, 스크래핑으로 채워졌던 항목만 갈아엎는다.
  const { error: deleteError } = await supabase
    .from("treatments")
    .delete()
    .eq("is_manual", false);

  if (deleteError) {
    throw new Error(`삭제 실패: ${deleteError.message}`);
  }

  const { error: upsertError } = await supabase
    .from("treatments")
    .upsert(deduped, { onConflict: "branch,name" });

  if (upsertError) {
    throw new Error(`저장 실패: ${upsertError.message}`);
  }

  return { scraped: treatments.length, saved: deduped.length };
}
