export type CleanupRule = {
  id?: string;
  type: "exclude" | "replace";
  pattern: string;
  replacement: string | null;
};

// "+" 앞뒤 공백을 없애고("A + B" → "A+B"), "A N회+B N회"처럼 양쪽 회차가
// 같으면 하나로 합친다("A 1회+B 1회" → "A+B", "A 3회+B 3회" → "A+B 3회").
function tidyPlusSegments(name: string): string {
  let result = name.replace(/\s*\+\s*/g, "+");

  const m = result.match(/^(.*?)(\d+)회\+(.*?)\2회(.*)$/);
  if (m) {
    const [, before, n, middle, after] = m;
    result =
      n === "1"
        ? `${before.trim()}+${middle.trim()}${after}`
        : `${before.trim()}+${middle.trim()} ${n}회${after}`;
  }

  return result.replace(/\s+/g, " ").trim();
}

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
