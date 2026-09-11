import type { Alias, Treatment } from "@/lib/types";
import { qwertyToHangul } from "@/lib/qwertyToHangul";

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// 사용자가 줄 끝에 붙이는 "1-1", "3-1" 같은 방문 회차 표기는 시술 정체성과
// 무관하므로 매칭 시에만 제거한다. 원본 입력 텍스트 자체는 그대로 보존된다.
function cleanForMatch(rawLine: string): string {
  return rawLine.replace(/\d+\s*-\s*\d+\s*$/, "").trim();
}

// 숫자만으로 된 토큰(예: "2")은 부분일치를 허용하면 "200샷" 같은 토큰에
// 잘못 매칭되므로, 숫자 토큰은 완전히 같을 때만 매칭으로 인정한다.
// 마찬가지로 한 글자짜리 토큰은 아무 데나 붙는 부분일치를 허용하면
// 관련 없는 후보가 쏟아지므로, 완전히 같을 때만 매칭으로 인정한다.
function tokensMatch(a: string, b: string): boolean {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum || bNum) return a === b;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < 2) return a === b;
  return longer.includes(shorter);
}

// 매칭된 토큰들의 글자수 합 (요청한 "일치하는 글자수" 지표) — 부분일치인
// 경우 겹치는 실제 글자수(짧은 쪽의 길이)만 센다.
function overlapLength(a: string, b: string): number {
  return Math.min(a.length, b.length);
}

type Indexed = { t: Treatment; tokens: string[] };
type Scored = { t: Treatment; matchedChars: number; score: number };

function scoreAgainst(qTokens: string[], indexed: Indexed[]): Scored[] {
  if (qTokens.length === 0) return [];

  return indexed.map(({ t, tokens: nameTokens }) => {
    let matched = 0;
    let matchedChars = 0;
    for (const q of qTokens) {
      const hit = nameTokens.find((n) => tokensMatch(n, q));
      if (hit) {
        matched++;
        matchedChars += overlapLength(q, hit);
      }
    }
    if (matched === 0) return { t, matchedChars: 0, score: 0 };

    // coverage: 입력한 키워드 중 몇 개가 후보 이름에 있는가
    const coverage = matched / qTokens.length;
    // precision: 후보 이름 중 몇 개가 입력 키워드와 겹치는가 (동점 시 더 짧고 정확한 이름 선호)
    const precision = matched / nameTokens.length;
    const score = coverage * 0.7 + precision * 0.3;

    return { t, matchedChars, score };
  });
}

export function buildMatcher(treatments: Treatment[], aliases: Alias[] = []) {
  const indexed = treatments.map((t) => ({ t, tokens: tokenize(t.name) }));
  const aliasEntries = aliases
    .filter((a) => a.alias && a.keyword)
    .map((a) => ({
      tokens: tokenize(a.alias),
      keywordTokens: tokenize(a.keyword),
    }));

  return function match(rawLine: string, limit = 5): Treatment[] {
    const query = cleanForMatch(rawLine);
    let qTokens = tokenize(query);
    if (qTokens.length === 0) return [];

    // 축약어/오타("포마" 등)가 입력에 통째로 들어있으면 그 토큰을 지우고
    // 등록된 실제 검색 키워드("FORMA")의 토큰으로 바꿔 넣는다. 특정 시술
    // 하나로 고정되는 게 아니라, 그 키워드를 포함하는 모든 후보가 일반
    // 검색과 똑같이 랭킹되어 함께 뜬다.
    for (const entry of aliasEntries) {
      if (entry.tokens.length === 0) continue;
      const allTokensPresent = entry.tokens.every((at) =>
        qTokens.some((q) => tokensMatch(q, at))
      );
      if (allTokensPresent) {
        const aliasTokenSet = new Set(entry.tokens);
        qTokens = [
          ...qTokens.filter((q) => !aliasTokenSet.has(q)),
          ...entry.keywordTokens,
        ];
      }
    }

    // 한글 자판인 채로 영문 자판에 입력한 경우("dlsahem" → "인모드")도
    // 검색되도록, 두벌식 변환 결과로도 매칭을 시도해서 결과를 합친다.
    const converted = qwertyToHangul(query);
    const qTokensConverted = converted !== query ? tokenize(converted) : [];

    const resultsA = scoreAgainst(qTokens, indexed);
    const resultsB = scoreAgainst(qTokensConverted, indexed);

    const bestByName = new Map<string, Scored>();
    for (const r of [...resultsA, ...resultsB]) {
      if (r.matchedChars === 0) continue;
      const existing = bestByName.get(r.t.name);
      if (
        !existing ||
        r.matchedChars > existing.matchedChars ||
        (r.matchedChars === existing.matchedChars && r.score > existing.score)
      ) {
        bestByName.set(r.t.name, r);
      }
    }

    return Array.from(bestByName.values())
      // 요청한 대로 "일치하는 글자수"가 가장 중요한 기준이고, 동점일 때만
      // coverage/precision 점수로 순위를 가른다.
      .sort((a, b) => b.matchedChars - a.matchedChars || b.score - a.score)
      .slice(0, limit)
      .map((s) => s.t);
  };
}
