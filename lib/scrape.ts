import axios from "axios";
import * as cheerio from "cheerio";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { applyCleanupRules, type CleanupRule } from "@/lib/cleanup";
import { detectTreatmentCategory } from "@/lib/categoryDetection";
import { TreatmentCategory } from "@/lib/types";

// 시술명에 슬래시가 있으면 각각을 분리된 시술명으로 확장한다.
//
// 슬래시가 괄호 안에 있으면("수액주사(신데렐라/비타민C)") 괄호를 그대로
// 유지한 채 안쪽 키워드만 나눠서 각각 괄호로 열고 닫아준다.
// 예: "영양 수액주사(신데렐라/비타민C) 한정가"
//  -> ["영양 수액주사(신데렐라) 한정가", "영양 수액주사(비타민C) 한정가"]
// (괄호 없이 "수액주사(신데렐라"와 "비타민C) 한정가"처럼 어긋나게 잘리면 안 됨)
//
// 슬래시가 괄호 밖에 있으면 그 토큰만 분리한다.
// 예: "(여자) 종아리/허벅지 제모" -> ["(여자) 종아리 제모", "(여자) 허벅지 제모"]
function expandSlashTreatments(name: string): string[] {
  const parenSlashMatch = name.match(/\(([^()/]+)\/([^()/]+)\)/);
  if (parenSlashMatch) {
    const [full, partA, partB] = parenSlashMatch;
    return [partA, partB].map((part) => name.replace(full, `(${part})`));
  }

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

const CATEGORY_FIELDS = [
  { sField: 1, mainCategory: "기획전" },
  { sField: 2, mainCategory: "쁘띠성형" },
  { sField: 3, mainCategory: "피부" },
  { sField: 4, mainCategory: "리프팅" },
  { sField: 5, mainCategory: "부스터" },
  { sField: 6, mainCategory: "제모" },
  { sField: 7, mainCategory: "비만" },
];

function buildUrls(branch: string) {
  return CATEGORY_FIELDS.map((item) => ({
    ...item,
    url: `https://www.velyb.kr/community/community01.php?tb=event_multi&etc5=${encodeURIComponent(branch)}&sField=${item.sField}`,
  }));
}

type ScrapedTreatment = {
  branch: string;
  name: string;
  price: number;
  category: TreatmentCategory | null;
  category_manual: boolean;
  scraped_at: string;
  is_manual: boolean;
  section?: string;
};

// axios/네트워크 에러 코드를 사용자에게 보여줄 한국어 메시지로 변환한다.
function toKoreanNetworkError(e: unknown): Error {
  const code = (e as { code?: string })?.code;
  if (code === "EAI_AGAIN" || code === "ENOTFOUND") {
    return new Error("홈페이지 서버에 연결하지 못했습니다. 인터넷 연결 상태를 확인한 뒤 다시 시도해주세요.");
  }
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
    return new Error("홈페이지 응답이 너무 느려 시간 초과되었습니다. 잠시 후 다시 시도해주세요.");
  }
  if (code === "ECONNREFUSED") {
    return new Error("홈페이지 서버가 연결을 거부했습니다. 잠시 후 다시 시도해주세요.");
  }
  return e instanceof Error ? e : new Error(String(e));
}

async function scrapeOnePage(
  url: string,
  cleanupRules: CleanupRule[],
  branch: string,
  mainCategory?: string
): Promise<ScrapedTreatment[]> {
  let html: string;
  try {
    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    html = res.data;
  } catch (e) {
    throw toKoreanNetworkError(e);
  }

  const $ = cheerio.load(html);
  const treatments: ScrapedTreatment[] = [];

  // 페이지를 순회하면서 섹션명 추적
  // 실제 사이트는 섹션 제목을 h2~h6가 아니라 <div class="title"><p class="t01">...</p></div>
  // 형태로 렌더링하므로 p.t01도 함께 섹션 타이틀 후보로 추적한다.
  let currentSection = "";
  $("h2, h3, h4, h5, h6, p.t01, ul.slist > li").each((_, el) => {
    const tag = $(el).prop("tagName")?.toLowerCase();
    const isSectionTitle = ["h2", "h3", "h4", "h5", "h6"].includes(tag || "") || (tag === "p" && $(el).hasClass("t01"));

    if (isSectionTitle) {
      const text = $(el).text().trim();
      if (text && text.length > 0 && text.length < 100) {
        currentSection = text;
      }
      return;
    }

    if (tag === "li") {
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
        if (currentSection) {
          console.log(`[SECTION] 시술: ${expandedName}, 섹션: ${currentSection}`);
        }
        treatments.push({
          branch,
          name: expandedName,
          price,
          category: detectTreatmentCategory(expandedName, mainCategory, currentSection),
          category_manual: false,
          scraped_at: new Date().toISOString(),
          is_manual: false,
          section: currentSection || undefined,
        });
      }
    }
  });

  return treatments;
}

export async function runScrapeAndSync(branch: string, presetRules?: CleanupRule[]) {
  const supabase = getSupabaseServerClient();

  let allRules = presetRules;
  if (!allRules) {
    const { data: rules, error: rulesError } = await supabase
      .from("cleanup_rules")
      .select("type, pattern, replacement, branch");

    if (rulesError) {
      throw new Error(`정리 규칙을 불러오지 못했습니다: ${rulesError.message}`);
    }
    allRules = (rules ?? []) as CleanupRule[];
  }

  // branch가 없는 규칙(null)은 전지점 공통 규칙, branch가 있으면 그 지점 전용 규칙이다.
  const cleanupRules = allRules.filter((r) => !r.branch || r.branch === branch);

  const pageResults = await Promise.all(
    buildUrls(branch).map((item) => scrapeOnePage(item.url, cleanupRules, branch, item.mainCategory))
  );
  const treatments: ScrapedTreatment[] = pageResults.flat();

  // 같은 시술명이 여러 섹션에 중복 노출되는 경우가 있어 branch+name 기준으로
  // 중복 제거 (마지막에 나온 값으로 덮어씀) 하지 않으면 upsert가 실패함
  const dedupedMap = new Map<string, ScrapedTreatment>();
  for (const t of treatments) {
    dedupedMap.set(`${t.branch}|${t.name}`, t);
  }
  const deduped = Array.from(dedupedMap.values());

  // 기존 카테고리 보존: 상세설정 화면에서 사용자가 "수동으로" 옮긴 카테고리만
  // 재스크래핑 때 덮어씌워지지 않도록 하고, 자동 분류였던 항목은 매번
  // detectTreatmentCategory()의 최신 로직으로 다시 계산한다.
  const { data: existingTreatments } = await supabase
    .from("treatments")
    .select("branch, name, category, category_manual")
    .eq("branch", branch)
    .eq("is_manual", false)
    .eq("category_manual", true);

  const manualCategoryMap = new Map<string, string | null>();
  for (const t of existingTreatments || []) {
    if (t.category) {
      manualCategoryMap.set(`${t.branch}|${t.name}`, t.category);
    }
  }

  for (const t of deduped) {
    const key = `${t.branch}|${t.name}`;
    const manual = manualCategoryMap.get(key);
    if (manual) {
      t.category = manual as TreatmentCategory;
      t.category_manual = true;
    }
  }

  // 홈페이지에 없어서 직접 추가한(is_manual=true) 시술은 스크래핑 동기화 때
  // 지워지지 않도록 남겨두고, 스크래핑으로 채워졌던 항목만 갈아엎는다.
  const { error: deleteError } = await supabase
    .from("treatments")
    .delete()
    .eq("branch", branch)
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

// 크론에서 전체 지점을 한 번에 돌릴 때 쓴다. velyb.kr에 부담을 주지 않도록
// BATCH_SIZE만큼만 동시에 진행하고, 한 지점이 실패해도 나머지 지점은 계속 처리한다.
export async function runScrapeAndSyncAll(branches: readonly string[]) {
  const supabase = getSupabaseServerClient();

  const { data: rules, error: rulesError } = await supabase
    .from("cleanup_rules")
    .select("type, pattern, replacement, branch");

  if (rulesError) {
    throw new Error(`정리 규칙을 불러오지 못했습니다: ${rulesError.message}`);
  }

  const allRules = (rules ?? []) as CleanupRule[];

  const BATCH_SIZE = 8;
  const results: { branch: string; ok: boolean; scraped?: number; saved?: number; error?: string }[] = [];

  for (let i = 0; i < branches.length; i += BATCH_SIZE) {
    const batch = branches.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((branch) => runScrapeAndSync(branch, allRules))
    );

    batchResults.forEach((r, idx) => {
      const branch = batch[idx];
      if (r.status === "fulfilled") {
        results.push({ branch, ok: true, scraped: r.value.scraped, saved: r.value.saved });
      } else {
        results.push({ branch, ok: false, error: String(r.reason instanceof Error ? r.reason.message : r.reason) });
      }
    });
  }

  return results;
}
