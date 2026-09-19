import type { Treatment } from "@/lib/types";

// 이름에서 그 상품 "1개"가 실제로 제공하는 총 용량(cc)을 뽑아낸다. 없으면 null.
// "리쥬란힐러 2cc"는 2cc. "리쥬란힐러 2cc 3회"는 1회당 2cc를 3번 시술하는 상품이므로
// 총 용량은 2*3=6cc — cc 뒤에 붙는 회차 수를 반드시 곱해야 한다(빠뜨리면 용량을 과소
// 계산해서 엉뚱한 조합이 나온다).
export function parseCcUnit(name: string): number | null {
  const m = name.match(/(\d+(?:\.\d+)?)\s*cc\b/i);
  if (!m) return null;
  const ccPerSession = Number(m[1]);
  if (!(ccPerSession > 0)) return null;
  const afterCc = name.slice((m.index ?? 0) + m[0].length);
  const sessionsMatch = afterCc.match(/^\s*(\d+)\s*회/);
  const sessions = sessionsMatch ? Number(sessionsMatch[1]) : 1;
  return ccPerSession * sessions;
}

export type CcComboItem = { treatment: Treatment; count: number };
export type CcCombo = { items: CcComboItem[]; totalPrice: number };

const EPS = 1e-6;

// "한정가"/"체험가"가 붙은 시술은 1인당 1회 한정 특가라 2개 이상 살 수 없다.
function isOneTimeOffer(name: string): boolean {
  return /한정가|체험가/.test(name);
}
function maxCountFor(name: string): number {
  return isOneTimeOffer(name) ? 1 : Infinity;
}

// target cc를 candidates(같은 계열 시술들, 각자 단위 cc가 다름)로 채우는 조합을
// 찾는다. 시술 1종 x n회, 또는 서로 다른 시술 2종의 조합까지만 찾는다(실무에서
// 3종 이상 섞어 쓰는 경우는 없음). 한정가/체험가 시술은 수량 1회로 고정한다.
// 가격 오름차순으로 정렬해 반환.
export function findCcCombos(target: number, candidates: Treatment[], maxResults = 8): CcCombo[] {
  const units = candidates
    .map((t) => ({ t, unit: parseCcUnit(t.name) }))
    .filter((x): x is { t: Treatment; unit: number } => x.unit !== null && x.unit > 0 && x.unit <= target + EPS);

  const combos: CcCombo[] = [];
  const seen = new Set<string>();
  const add = (items: CcComboItem[]) => {
    const key = items
      .map((i) => `${i.treatment.name}x${i.count}`)
      .sort()
      .join("|");
    if (seen.has(key)) return;
    seen.add(key);
    combos.push({ items, totalPrice: items.reduce((sum, i) => sum + i.treatment.price * i.count, 0) });
  };

  // 단일 시술 x n회
  for (const { t, unit } of units) {
    const count = Math.round(target / unit);
    if (count >= 1 && count <= maxCountFor(t.name) && Math.abs(count * unit - target) < EPS) {
      add([{ treatment: t, count }]);
    }
  }

  // 서로 다른 시술 2종 조합. 단, 한정가/체험가는 조합 전체에서 한 개까지만 — 두
  // 시술 모두 한정가/체험가면(체험가+체험가, 체험가+한정가, 한정가+한정가) 아예
  // 조합을 만들지 않는다.
  const maxCount = Math.ceil(target / Math.min(...units.map((u) => u.unit), target)) || 1;
  for (let i = 0; i < units.length; i++) {
    for (let j = 0; j < units.length; j++) {
      if (i === j) continue;
      const a = units[i], b = units[j];
      if (isOneTimeOffer(a.t.name) && isOneTimeOffer(b.t.name)) continue;
      const c1Limit = Math.min(maxCount, maxCountFor(a.t.name));
      const c2Limit = maxCountFor(b.t.name);
      for (let c1 = 1; c1 <= c1Limit; c1++) {
        const remaining = target - c1 * a.unit;
        if (remaining <= EPS) break;
        const c2 = remaining / b.unit;
        const c2Rounded = Math.round(c2);
        if (c2Rounded >= 1 && c2Rounded <= c2Limit && Math.abs(c2Rounded - c2) < EPS) {
          add([
            { treatment: a.t, count: c1 },
            { treatment: b.t, count: c2Rounded },
          ]);
        }
      }
    }
  }

  return combos.sort((x, y) => x.totalPrice - y.totalPrice).slice(0, maxResults);
}

// 이름에서 cc 단위·한정가/체험가·회차 표기를 지운 "진짜 시술명"만 남긴다.
// "필로드PN 2cc", "필로드PN 1cc", "필로드PN 2cc 한정가", "필로드PN 2cc 3회"는 모두
// "필로드PN"으로 같아지고, "필로드PN 콤플렉스"는 다르게 남아 서로 구분된다.
// 한정가/체험가 프로모션 상품은 site 섹션이 본품과 다른 경우가 많아 section으로
// 묶으면 오히려 정작 같은 시술명끼리도 빠뜨리거나(한정가 배제) 다른 제품끼리도
// 섞이는(section 공유) 문제가 생겨서, section 대신 이 이름 기준으로 묶는다.
export function deriveBaseName(name: string): string {
  return name
    .replace(/\d+(?:\.\d+)?\s*cc\b/i, "")
    .replace(/한정가|체험가/g, "")
    .replace(/\d+\s*회차?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// "메가세일 물광주사(고농도 히알루론산) 1cc 체험가"처럼 프로모션 배지가 이름 맨
// 앞에 붙는 경우가 있어, 정확히 같은 문자열이 아니어도 한쪽 이름이 다른 쪽 이름의
// "끝부분과 일치"하면 같은 시술로 본다(배지는 앞에 붙지 뒤에 붙지 않으므로 접미사
// 비교가 안전하다 — "필로드PN 콤플렉스"처럼 뒤에 다른 단어가 붙는 별개 제품은
// 접미사가 서로 다르므로 여전히 구분된다).
export function sameTreatmentFamily(nameA: string, nameB: string): boolean {
  const a = deriveBaseName(nameA);
  const b = deriveBaseName(nameB);
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 2 && longer.endsWith(shorter);
}

// 조합 안내 문구: "(리쥬란힐러 2cc 체험가 x 1회)+(리쥬란힐러 2cc x 1회)"
export function formatComboLabel(combo: CcCombo): string {
  return combo.items.map((i) => `(${i.treatment.name} x ${i.count}회)`).join("+");
}

// 차트에는 조합을 한 줄로 합쳐서 넣는다: "리쥬란힐러 2cc 체험가"+"리쥬란힐러 2cc" 조합 x
// target=4cc → "리쥬란힐러 4cc". 프로모션 배지가 안 붙은(가장 짧은) 이름을 기준으로 쓴다.
export function mergedComboName(combo: CcCombo, target: number): string {
  const names = combo.items.map((i) => deriveBaseName(i.treatment.name));
  const base = names.reduce((shortest, n) => (n.length < shortest.length ? n : shortest), names[0] ?? "");
  // 한정가/체험가가 섞인 조합은 실장이 나중에 구분할 수 있도록 반드시 표시해준다.
  const notes: string[] = [];
  if (combo.items.some((i) => i.treatment.name.includes("한정가"))) notes.push("한정가 포함");
  if (combo.items.some((i) => i.treatment.name.includes("체험가"))) notes.push("체험가 포함");
  const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";
  return `${base} ${target}cc${suffix}`;
}

if (process.env.NODE_ENV !== "production") {
  const T = (name: string, price: number): Treatment => ({ name, price });
  if (deriveBaseName("필로드PN 2cc 한정가") !== "필로드PN") {
    console.error("[ccCombo self-check FAIL] deriveBaseName이 한정가를 못 지움", deriveBaseName("필로드PN 2cc 한정가"));
  }
  if (deriveBaseName("필로드PN 콤플렉스 2cc") === deriveBaseName("필로드PN 2cc")) {
    console.error("[ccCombo self-check FAIL] 서로 다른 제품(필로드PN vs 콤플렉스)이 같은 이름으로 묶임");
  }
  // 프로모션 배지가 앞에 붙은 경우: 같은 시술로 묶여야 한다.
  if (!sameTreatmentFamily("메가세일 물광주사(고농도 히알루론산) 1cc 체험가", "물광주사(고농도 히알루론산) 2cc 1회")) {
    console.error("[ccCombo self-check FAIL] 프로모션 배지가 붙은 이름을 같은 시술로 못 묶음");
  }
  // 뒤에 다른 단어가 붙어 실제로 다른 제품인 경우: 여전히 구분돼야 한다.
  if (sameTreatmentFamily("필로드PN 2cc", "필로드PN 콤플렉스 2cc")) {
    console.error("[ccCombo self-check FAIL] 접미사 비교인데도 서로 다른 제품이 묶임");
  }
  const cands = [T("리쥬란힐러 1cc", 100000), T("리쥬란힐러 2cc", 180000), T("리쥬란힐러 2cc 한정가", 150000)];
  const combos = findCcCombos(6, cands, 20); // 20: 개수 제한(maxResults)에 걸려 자가진단용 조합이 잘려나가지 않도록
  if (combos.length === 0) console.error("[ccCombo self-check FAIL] no combos found for 6cc");
  if (!combos.some((c) => c.items.length === 1 && c.items[0].count === 6)) {
    console.error("[ccCombo self-check FAIL] missing 1cc x6 combo", combos);
  }
  // 한정가는 1회 한정이므로 "2cc 한정가 x3" 같은 조합은 나오면 안 된다.
  if (combos.some((c) => c.items.some((i) => i.treatment.name.includes("한정가") && i.count >= 2))) {
    console.error("[ccCombo self-check FAIL] 한정가 시술이 2회 이상 조합됨", combos);
  }
  if (!combos.some((c) => c.items.length === 2 && c.items.some((i) => i.treatment.name.includes("한정가") && i.count === 1))) {
    console.error("[ccCombo self-check FAIL] missing combo with 한정가 x1 mixed in", combos);
  }
  if (combos[0].totalPrice !== Math.min(...combos.map((c) => c.totalPrice))) {
    console.error("[ccCombo self-check FAIL] not sorted by price ascending", combos);
  }
  if (parseCcUnit("리쥬란힐러 2cc 한정가") !== 2) {
    console.error("[ccCombo self-check FAIL] parseCcUnit wrong");
  }
  // 한정가/체험가는 조합 전체에서 한 개까지만: 체험가+체험가, 체험가+한정가,
  // 한정가+한정가는 절대 나오면 안 된다.
  const offerCombos = findCcCombos(3, [
    T("물광 1cc 체험가", 9900),
    T("물광 2cc 체험가", 49000),
    T("물광 1cc 한정가", 12000),
  ], 20);
  const offerCountIn = (c: CcCombo) => c.items.filter((i) => /한정가|체험가/.test(i.treatment.name)).length;
  if (offerCombos.some((c) => offerCountIn(c) >= 2)) {
    console.error("[ccCombo self-check FAIL] 한정가/체험가가 한 조합에 2개 이상 들어감", offerCombos);
  }
  // "2cc 3회"는 1회당 2cc를 3번 시술 = 총 6cc. 회차를 곱하지 않으면 이 상품을 사도
  // 목표 용량에 못 미친다고 오판해서 엉뚱한 조합을 추천하게 된다.
  if (parseCcUnit("리쥬란힐러 2cc 3회") !== 6) {
    console.error("[ccCombo self-check FAIL] parseCcUnit이 cc 뒤 회차를 곱하지 않음", parseCcUnit("리쥬란힐러 2cc 3회"));
  }
  const packageCombos = findCcCombos(6, [
    T("리쥬란힐러 1cc", 100000),
    T("리쥬란힐러 2cc 3회", 500000),
  ], 20);
  if (!packageCombos.some((c) => c.items.length === 1 && c.items[0].treatment.name === "리쥬란힐러 2cc 3회" && c.items[0].count === 1)) {
    console.error("[ccCombo self-check FAIL] '2cc 3회' 단품(총 6cc) 조합이 안 나옴", packageCombos);
  }
  const labelSample = formatComboLabel({
    items: [
      { treatment: T("리쥬란힐러 2cc 체험가", 150000), count: 1 },
      { treatment: T("리쥬란힐러 2cc", 180000), count: 1 },
    ],
    totalPrice: 330000,
  });
  if (labelSample !== "(리쥬란힐러 2cc 체험가 x 1회)+(리쥬란힐러 2cc x 1회)") {
    console.error("[ccCombo self-check FAIL] formatComboLabel wrong", labelSample);
  }
  const nameSample = mergedComboName(
    { items: [{ treatment: T("리쥬란힐러 2cc 한정가", 150000), count: 2 }], totalPrice: 300000 },
    4
  );
  if (nameSample !== "리쥬란힐러 4cc (한정가 포함)") {
    console.error("[ccCombo self-check FAIL] mergedComboName wrong", nameSample);
  }
  const nameSample2 = mergedComboName(
    {
      items: [
        { treatment: T("리쥬란힐러 2cc 한정가", 150000), count: 1 },
        { treatment: T("리쥬란힐러 1cc 체험가", 100000), count: 2 },
      ],
      totalPrice: 350000,
    },
    4
  );
  if (nameSample2 !== "리쥬란힐러 4cc (한정가 포함, 체험가 포함)") {
    console.error("[ccCombo self-check FAIL] mergedComboName both-offer wrong", nameSample2);
  }
}
