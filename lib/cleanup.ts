export type CleanupRule = {
  id?: string;
  type: "exclude" | "replace";
  pattern: string;
  replacement: string | null;
  branch?: string | null;
};

// "+" 앞뒤 공백을 없애고("A + B" → "A+B"), 회차가 모두 같으면 뒤로 옮긴다.
// "A 1회+B 1회" → "A+B 1회", "A 3회+B 3회+C 3회" → "A+B+C 3회"
function tidyPlusSegments(name: string): string {
  let result = name.replace(/\s*\+\s*/g, "+");

  const countMatches = result.match(/(\d+)회/g) ?? [];
  if (countMatches.length > 0) {
    const counts = countMatches.map((m) => m.match(/(\d+)/)![1]);
    const uniqueCounts = new Set(counts);

    if (uniqueCounts.size === 1) {
      const count = counts[0];
      const cleaned = result.replace(/\s*\d+\s*회\s*([+])?/g, (match, plus) => plus || "");
      result = `${cleaned} ${count}회`;
    }
  }

  return result.replace(/\s+/g, " ").trim();
}

// 괄호 속 텍스트는 보톡스/필러 제품명뿐 아니라 부위, 구성(A+B+...), 색상,
// 파장수처럼 가격을 구분 짓는 핵심 정보인 경우가 많아 자동으로 판별해서
// 지우는 규칙은 안전하지 않다. 특정 문구를 지우고 싶으면 상세설정의
// "삭제" 탭에서 그 문구를 정확히 등록해 명시적으로 처리한다.
//
// exclude 규칙은 pattern을 제거(빈 문자열로 치환), replace 규칙은 pattern을
// replacement로 치환한다. 순서: exclude 먼저 전체 적용 후 replace 전체 적용,
// 마지막으로 "+" 관련 표기를 항상 정리한다.
export function applyCleanupRules(name: string, rules: CleanupRule[]): string {
  let result = name;

  for (const r of rules) {
    if (r.type === "exclude") {
      result = result.split(r.pattern).join("");
    }
  }
  for (const r of rules) {
    if (r.type === "replace") {
      result = result.split(r.pattern).join(r.replacement ?? "");
    }
  }

  return tidyPlusSegments(result);
}
