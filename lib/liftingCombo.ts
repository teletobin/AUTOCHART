import type { Treatment } from "@/lib/types";

// 시술명에서 단위값(샷 또는 줄)을 추출. "울쎄라 600샷"→600, "온다 7만줄"→70000, "온다 10000J"→10000
export function parseUnitValue(name: string): number | null {
  // "6000샷", "600 샷", "600샷" 등 샷 단위 (한글 뒤 경계 처리)
  const shotMatch = name.match(/(\d+(?:,\d{3})*)\s*샷(?:\s|$|[^가-힣])/);
  if (shotMatch) {
    const num = Number(shotMatch[1].replace(/,/g, ""));
    return num > 0 ? num : null;
  }

  // "7만줄", "70000줄", "70,000줄" 등 줄 단위. "만" 처리 필수.
  const lineMatch = name.match(/(\d+)\s*만\s*줄(?:\s|$|[^가-힣])/);
  if (lineMatch) return Number(lineMatch[1]) * 10000;

  const lineMatch2 = name.match(/(\d+(?:,\d{3})*)\s*줄(?:\s|$|[^가-힣])/);
  if (lineMatch2) {
    const num = Number(lineMatch2[1].replace(/,/g, ""));
    return num > 0 ? num : null;
  }

  // "10000J", "10,000J" 등 J 단위 (온다 등 라인/줄 단위)
  const jMatch = name.match(/(\d+(?:,\d{3})*)\s*J(?:\s|$|[^가-힣])/);
  if (jMatch) {
    const num = Number(jMatch[1].replace(/,/g, ""));
    return num > 0 ? num : null;
  }

  return null;
}

// 시술명에서 단위 이름("샷" 또는 "줄") 추출 (J도 줄로 간주)
export function getUnitType(name: string): "shot" | "line" | null {
  if (/\d+\s*샷(?:\s|$|[^가-힣])/.test(name)) return "shot";
  if (/(\d+\s*만\s*)?줄(?:\s|$|[^가-힣])/.test(name)) return "line";
  if (/\d+\s*J(?:\s|$|[^가-힣])/.test(name)) return "line";
  return null;
}

export type LiftingComboItem = { treatment: Treatment; count: number };
export type LiftingCombo = { items: LiftingComboItem[]; totalPrice: number };

const EPS = 1e-6;

function isOneTimeOffer(name: string): boolean {
  return /한정가|체험가/.test(name);
}
function maxCountFor(name: string): number {
  return isOneTimeOffer(name) ? 1 : Infinity;
}

// target 단위값을 candidates(같은 계열 시술들)로 채우는 조합을 찾는다.
// 시술 1종 x n회, 또는 서로 다른 시술 2종의 조합까지만 찾는다.
export function findLiftingCombos(target: number, candidates: Treatment[], maxResults = 8): LiftingCombo[] {
  const units = candidates
    .map((t) => ({ t, unit: parseUnitValue(t.name) }))
    .filter((x): x is { t: Treatment; unit: number } => x.unit !== null && x.unit > 0 && x.unit <= target + EPS);

  const combos: LiftingCombo[] = [];
  const seen = new Set<string>();
  const add = (items: LiftingComboItem[]) => {
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

  // 서로 다른 시술 2종 조합
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

// 시술명에서 단위값과 "회" 표기 제거해서 기본명만 남긴다
function deriveBaseName(name: string): string {
  return name
    .replace(/\d+(?:,\d{3})*\s*샷(?:\s|$|[^가-힣])/i, "")
    .replace(/(\d+\s*만\s*)?줄(?:\s|$|[^가-힣])/i, "")
    .replace(/\d+(?:,\d{3})*\s*J(?:\s|$|[^가-힣])/i, "")
    .replace(/한정가|체험가/g, "")
    .replace(/\d+\s*회차?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 숫자를 만 단위로 포매팅 (200000→20만, 100000→10만 등)
function formatLargeNumber(value: number): string {
  if (value >= 10000 && value % 10000 === 0) {
    return `${Math.floor(value / 10000)}만`;
  }
  return String(value);
}

// "울쎄라 600샷" + "울쎄라 300샷" 조합 x target=600 → "울쎄라 600샷" 또는 "울쎄라 300샷 2회"
// 한정가/체험가 조합은 그 정보를 표시
export function mergedLiftingName(combo: LiftingCombo, target: number): string {
  const names = combo.items.map((i) => deriveBaseName(i.treatment.name));
  const base = names.reduce((shortest, n) => (n.length < shortest.length ? n : shortest), names[0] ?? "");

  // 단위 타입 추출 (샷 또는 줄)
  const unitType = getUnitType(combo.items[0]?.treatment.name ?? "");
  const unitSuffix = unitType === "shot" ? "샷" : "줄";

  // 한정가/체험가 표시
  const notes: string[] = [];
  for (const i of combo.items) {
    const unitVal = parseUnitValue(i.treatment.name);
    const unitLabel = unitVal !== null ? `${formatLargeNumber(unitVal)}${unitSuffix} ` : "";
    if (i.treatment.name.includes("한정가")) notes.push(`${unitLabel}한정가 포함`);
    else if (i.treatment.name.includes("체험가")) notes.push(`${unitLabel}체험가 포함`);
  }
  const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";

  const formattedTarget = formatLargeNumber(target);
  return `${base} ${formattedTarget}${unitSuffix}${suffix}`;
}

export function formatComboLabel(combo: LiftingCombo): string {
  return combo.items.map((i) => `(${i.treatment.name} x ${i.count}회)`).join("+");
}

if (process.env.NODE_ENV !== "production") {
  const T = (name: string, price: number): Treatment => ({ name, price });
  if (parseUnitValue("울쎄라 600샷") !== 600) {
    console.error("[liftingCombo self-check FAIL] parseUnitValue shot");
  }
  if (parseUnitValue("온다 7만줄") !== 70000) {
    console.error("[liftingCombo self-check FAIL] parseUnitValue line");
  }
  if (getUnitType("울쎄라 600샷") !== "shot") {
    console.error("[liftingCombo self-check FAIL] getUnitType shot");
  }
  if (getUnitType("온다 7만줄") !== "line") {
    console.error("[liftingCombo self-check FAIL] getUnitType line");
  }
  const cands = [T("울쎄라 300샷", 100000), T("울쎄라 600샷", 180000), T("울쎄라 600샷 한정가", 150000)];
  const combos = findLiftingCombos(600, cands, 20);
  if (combos.length === 0) console.error("[liftingCombo self-check FAIL] no combos found");
  if (!combos.some((c) => c.items.length === 1 && c.items[0].count === 1)) {
    console.error("[liftingCombo self-check FAIL] missing single 600샷 combo", combos);
  }
}
