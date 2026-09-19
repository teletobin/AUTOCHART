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

// "옵션1) 자갈턱보톡스추가 1회"처럼 다른 대표 시술에 곁들이는 추가 옵션은
// 이름 자체에 검색어가 그대로 들어있는 경우가 많아(...보톡스추가) 대표
// 시술과 매칭 점수가 동점이 되기 쉽다. 이런 항목은 항상 후순위로 민다.
const OPTION_ITEM_PATTERN = /^옵션\s*\d+\s*\)/;

type Indexed = { t: Treatment; nameTokens: string[]; sectionTokens: string[]; sectionNoSpace: string; order: number; isOption: boolean };
type Scored = { t: Treatment; nameMatchedChars: number; matchedChars: number; score: number; order: number; exactPhrase: boolean; isOption: boolean; ownSection: boolean };

function scoreAgainst(qTokens: string[], indexed: Indexed[], queryNoSpace: string): Scored[] {
  if (qTokens.length === 0) return [];

  return indexed.map(({ t, nameTokens, sectionTokens, sectionNoSpace, order, isOption }) => {
    let matched = 0;
    let matchedChars = 0;
    let nameMatchedChars = 0;
    for (const q of qTokens) {
      // 시술명 자체에서 먼저 찾고, 없을 때만 섹션명("내맘" 검색 시 그 섹션의
      // 하위 시술이 뜨게 하는 기능)에서 찾는다. "슈링크 유니버스"를 검색했을
      // 때 실제 이름에 그 문구가 들어간 시술이, 섹션명만 우연히 같은 다른
      // 옵션 상품보다 항상 위로 오게 하려면 이 둘을 구분해야 한다.
      const nameHit = nameTokens.find((n) => tokensMatch(n, q));
      if (nameHit) {
        matched++;
        const overlap = overlapLength(q, nameHit);
        matchedChars += overlap;
        nameMatchedChars += overlap;
        continue;
      }
      const sectionHit = sectionTokens.find((n) => tokensMatch(n, q));
      if (sectionHit) {
        matched++;
        matchedChars += overlapLength(q, sectionHit);
      }
    }
    if (matched === 0) return { t, nameMatchedChars: 0, matchedChars: 0, score: 0, order, exactPhrase: false, isOption, ownSection: false };

    const totalTokens = nameTokens.length + sectionTokens.length;
    // coverage: 입력한 키워드 중 몇 개가 후보 이름에 있는가
    const coverage = matched / qTokens.length;
    // precision: 후보 이름 중 몇 개가 입력 키워드와 겹치는가 (동점 시 더 짧고 정확한 이름 선호)
    const precision = matched / totalTokens;
    const score = coverage * 0.7 + precision * 0.3;

    // "리쥬란HB플러스"처럼 검색어를 붙여 쓰면 토큰 하나가 되어 "리쥬란"
    // 같은 짧은 이름 토큰에도 부분일치로 걸려버린다(긴 쿼리 토큰이 짧은
    // 이름 토큰을 포함하는 역방향 매치). 그 경우 매칭 글자수는 크게 잡히지만
    // 실제로는 "HB", "플러스" 부분이 무시된 헐거운 매치이므로, 입력한 문구가
    // 이름에 통째로(공백 무시) 들어있는지를 최우선 신호로 따로 잡아
    // 이런 헐거운 매치보다 항상 위로 오게 한다.
    const nameNoSpace = t.name.toLowerCase().replace(/\s/g, "");
    const exactPhrase = queryNoSpace.length > 0 && nameNoSpace.includes(queryNoSpace);

    // "리쥬란힐러"를 검색했을 때, 실제로 "리쥬란힐러" 섹션에 진열된 시술이
    // 이름에 "리쥬란힐러"가 우연히 들어간 다른 섹션의 패키지 상품(예: 다른
    // 프로모션 섹션의 "리쥬란힐러 2cc 체험가")보다 항상 먼저 오게 한다.
    // 그렇지 않으면 매칭 점수가 같아졌을 때 서로 다른 섹션의 order끼리
    // 비교되어 뒤섞인다.
    const ownSection = queryNoSpace.length > 0 && sectionNoSpace.includes(queryNoSpace);

    return { t, nameMatchedChars, matchedChars, score, order, exactPhrase, isOption, ownSection };
  });
}

export function buildMatcher(treatments: Treatment[], aliases: Alias[] = []) {
  // order 필드가 없는 시술(DB 마이그레이션 전, 또는 수동 추가분)은 배열에
  // 담긴 순서(스크래핑/조회 순서)를 그대로 폴백으로 사용한다.
  const indexed = treatments.map((t, i) => ({
    t,
    nameTokens: tokenize(t.name),
    sectionTokens: tokenize((t.section ?? "").replace(/\s/g, "")),
    sectionNoSpace: (t.section ?? "").toLowerCase().replace(/\s/g, ""),
    order: t.order ?? i,
    isOption: OPTION_ITEM_PATTERN.test(t.name),
  }));
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

    // 축약어/오타("포마" 등)가 입력에 통째로 들어있으면 등록된 실제 검색
    // 키워드("FORMA")의 토큰을 추가로 더해 준다. 원래 입력한 토큰은 그대로
    // 남겨 두는데, "컬러"처럼 별칭이면서 동시에 시술명에 그대로 등장하는
    // 단어일 수도 있기 때문이다(지워버리면 "컬러"가 들어간 이름은 별칭
    // 키워드에 없는 한 더 이상 검색되지 않는 문제가 생긴다). 특정 시술
    // 하나로 고정되는 게 아니라, 그 키워드를 포함하는 모든 후보가 일반
    // 검색과 똑같이 랭킹되어 함께 뜬다.
    for (const entry of aliasEntries) {
      if (entry.tokens.length === 0) continue;
      const allTokensPresent = entry.tokens.every((at) =>
        qTokens.some((q) => tokensMatch(q, at))
      );
      if (allTokensPresent) {
        const existing = new Set(qTokens);
        qTokens = [
          ...qTokens,
          ...entry.keywordTokens.filter((k) => !existing.has(k)),
        ];
      }
    }

    // 한글 자판인 채로 영문 자판에 입력한 경우("dlsahem" → "인모드")도
    // 검색되도록, 두벌식 변환 결과로도 매칭을 시도해서 결과를 합친다.
    const converted = qwertyToHangul(query);
    const qTokensConverted = converted !== query ? tokenize(converted) : [];

    const queryNoSpace = query.toLowerCase().replace(/\s/g, "");
    const convertedNoSpace = converted.toLowerCase().replace(/\s/g, "");

    const resultsA = scoreAgainst(qTokens, indexed, queryNoSpace);
    const resultsB = scoreAgainst(qTokensConverted, indexed, convertedNoSpace);

    const bestByName = new Map<string, Scored>();
    for (const r of [...resultsA, ...resultsB]) {
      if (r.matchedChars === 0) continue;
      const existing = bestByName.get(r.t.name);
      if (
        !existing ||
        (r.ownSection && !existing.ownSection) ||
        (r.ownSection === existing.ownSection && r.exactPhrase && !existing.exactPhrase) ||
        (r.ownSection === existing.ownSection && r.exactPhrase === existing.exactPhrase && r.nameMatchedChars > existing.nameMatchedChars) ||
        (r.ownSection === existing.ownSection && r.exactPhrase === existing.exactPhrase && r.nameMatchedChars === existing.nameMatchedChars && r.matchedChars > existing.matchedChars) ||
        (r.ownSection === existing.ownSection && r.exactPhrase === existing.exactPhrase && r.nameMatchedChars === existing.nameMatchedChars && r.matchedChars === existing.matchedChars && r.score > existing.score)
      ) {
        bestByName.set(r.t.name, r);
      }
    }

    // 검색어와 일치하는 섹션에 실제로 진열된 시술을 최우선으로 한다(예:
    // "리쥬란힐러"를 검색했을 때, 이름에 "리쥬란힐러"가 우연히 들어간 다른
    // 프로모션 섹션의 패키지 상품보다 "리쥬란힐러" 섹션 자체의 시술이 먼저
    // 오게). 그 다음 입력한 문구가 이름에 통째로(공백 무시) 들어있는 시술을
    // 우선하고, "옵션1) OO추가"처럼 다른 대표 시술에 곁들이는 부가 옵션은
    // 항상 뒤로 민다. 그 다음으로 이름 자체에서 매칭된 시술이 섹션명에서만
    // 매칭된 시술(예: "내맘" 검색 시 "내 맘대로 피부관리" 섹션의 하위
    // 옵션들)보다 먼저 오도록, 그 다음으로 전체 매칭도 > 정확도 > 섹션별
    // 홈페이지 순서로 정렬한다.
    const sortFn = (a: Scored, b: Scored) => {
      if (a.ownSection !== b.ownSection) return a.ownSection ? -1 : 1;
      if (a.exactPhrase !== b.exactPhrase) return a.exactPhrase ? -1 : 1;
      if (a.isOption !== b.isOption) return a.isOption ? 1 : -1;
      if (b.nameMatchedChars !== a.nameMatchedChars) return b.nameMatchedChars - a.nameMatchedChars;
      if (b.matchedChars !== a.matchedChars) return b.matchedChars - a.matchedChars;
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order;
    };

    return Array.from(bestByName.values())
      .sort(sortFn)
      .slice(0, limit)
      .map((s) => s.t);
  };
}
