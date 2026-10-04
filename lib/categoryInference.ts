import type { TreatmentCategory } from "@/lib/types";

// 홈페이지 시술명을 키워드 목록만으로 분류하면 새 이벤트명(예: "리제반2cc 체험가",
// "울긋불긋 홍조 피부 탈출 (엑셀v 홍조모드+진정관리)")이 계속 미분류로 남는다.
// 같은 지점에서 이미 분류된 시술들의 이름 조각(토큰)을 모아 두고, 미분류 시술이
// 그중 "한 카테고리에서만 나오는 토큰"을 포함하면 그 카테고리로 채운다.

// 여러 카테고리에 흔히 쓰여 분류 근거가 못 되는 말(프로모션 문구, 일반 명사 등)
const STOP_TOKENS = new Set([
  "체험가", "한정가", "구독권", "이벤트", "체험전", "프로모션", "할인", "특가", "세일",
  "진정관리", "진정", "관리", "케어", "레이저", "모드", "옵션", "추가", "얼굴전체", "얼굴",
  "전체", "부위", "남자", "여자", "남성", "여성", "저자극", "고농도", "프리미엄", "플러스",
  "솔루션", "시술", "패키지", "세트", "회차", "무제한", "선택", "기본",
]);

const UNIT_RE = /\d+(?:\.\d+)?\s*(?:cc|ml|mg|회차?|샷|줄|j|유닛|u|개|부위|시간|분|년|개월|세트|ea)/gi;

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/♥️?[^♥]*♥️?/g, " ")
    .replace(UNIT_RE, " ")
    .split(/[\s()[\]+/,·\-~&]+/)
    .map((t) => t.replace(/[^가-힣a-z0-9]/g, ""))
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOP_TOKENS.has(t));
}

// 한 토큰의 카테고리별 근거 중 이 비율 이상을 차지해야 분류 근거로 쓴다.
const MIN_SHARE = 0.7;
// 묶음 시술(A+B, A/B)은 여러 시술이 섞여 있어 단독 시술보다 근거 비중을 낮춘다.
const BUNDLE_WEIGHT = 1;
const SINGLE_WEIGHT = 3;

// "옵션3) 리제반 2cc추가 1회"처럼 다른 시술에 붙는 추가 옵션은 부모 시술의
// 카테고리를 따라갈 뿐이라 이름만으로 카테고리를 알려주지 못한다.
const isOptionItem = (name: string) => /^\s*옵션\s*\d*\s*\)/.test(name);
const isBundle = (name: string) => /[+/]/.test(name);

// category가 비어 있는 항목을 같은 목록의 분류된 항목들을 근거로 채운다.
// 근거가 부족하거나 카테고리가 엇갈리면 건드리지 않는다. 채운 개수를 반환한다.
export function inferMissingCategories<T extends { name: string; rawName?: string; category: TreatmentCategory | null }>(items: T[]): number {
  // 정리 규칙으로 지워진 단서도 근거로 쓰도록 홈페이지 원본 이름까지 함께 토큰화한다.
  const textOf = (it: T) => `${it.name} ${it.rawName ?? ""}`;
  const stats = new Map<string, Map<TreatmentCategory, number>>();
  const itemCount = new Map<string, number>();
  for (const it of items) {
    if (!it.category || isOptionItem(it.name)) continue;
    const weight = isBundle(it.name) ? BUNDLE_WEIGHT : SINGLE_WEIGHT;
    for (const tok of new Set(tokenize(textOf(it)))) {
      const cats = stats.get(tok) ?? new Map<TreatmentCategory, number>();
      cats.set(it.category, (cats.get(it.category) ?? 0) + weight);
      stats.set(tok, cats);
      itemCount.set(tok, (itemCount.get(tok) ?? 0) + 1);
    }
  }

  let filled = 0;
  for (const it of items) {
    if (it.category) continue;
    const score = new Map<TreatmentCategory, number>();
    for (const tok of new Set(tokenize(textOf(it)))) {
      const cats = stats.get(tok);
      if (!cats) continue;
      const total = [...cats.values()].reduce((a, b) => a + b, 0);
      const [cat, weight] = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
      if (weight / total < MIN_SHARE) continue;
      // 몇 개 시술에만 나오는 토큰(상품명)일수록, 여러 시술에 흔한 설명어(히알루론산 등)보다 신뢰한다.
      score.set(cat, (score.get(cat) ?? 0) + (tok.length * (weight / total)) / itemCount.get(tok)!);
    }
    const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0 || (ranked.length > 1 && ranked[0][1] === ranked[1][1])) continue;
    it.category = ranked[0][0];
    filled++;
  }
  return filled;
}
