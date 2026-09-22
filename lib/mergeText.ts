// 자동 생성된 차트 텍스트(oldGen -> newGen)가 바뀔 때, 사용자가 직접 편집해 둔 curText 안의
// "생성 텍스트에 없던 줄"들을 새 텍스트의 같은 위치(앞뒤 줄 기준)에 다시 끼워 넣는다.
// 매칭은 가격 숫자·강조점(🔸)·회차 표기("1-1", "2-1" 등)를 지운 정규화된 줄로 비교한다 —
// 수량/금액/회차만 바뀐 줄은 같은 줄로 취급해서 그 줄에 붙여둔 메모의 위치를 잃지 않기
// 위함이다. 회차를 정규화하지 않으면, 수량을 늘렸다 줄이는 과정에서 "1-1"이 "2-1"로
// 바뀐 줄을 완전히 다른 줄로 오인해 옛 줄과 새 줄이 둘 다 남는 중복 문제가 생긴다.
function normalizeLine(line: string): string {
  return line.replace(/[\d,]+원/g, "").replace(/🔸/g, "").replace(/\d+-\d+/g, "").replace(/\s+/g, " ").trim();
}

function lcsMatch(a: string[], b: string[]): [number, number][] {
  const na = a.map(normalizeLine);
  const nb = b.map(normalizeLine);
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (na[i] === nb[j] && dp[i][j] === dp[i + 1][j + 1] + 1) {
      pairs.push([i, j]);
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

export function mergeGeneratedText(oldGen: string, curText: string, newGen: string): string {
  if (oldGen === curText) return newGen;
  if (curText === "") return newGen;

  const oldLines = oldGen === "" ? [] : oldGen.split("\n");
  const curLines = curText.split("\n");
  const newLines = newGen === "" ? [] : newGen.split("\n");

  const oldToCur = lcsMatch(oldLines, curLines);
  const matchedCur = new Set(oldToCur.map(([, cj]) => cj));

  // curText에서 oldGen과 매칭되지 않는 줄들 = 사용자가 끼워 넣은 줄. 직전 매칭된 oldIdx에 소속시킨다(-1 = 맨 앞).
  const insertsAfterOld = new Map<number, string[]>();
  let cursor = 0;
  let anchor = -1;
  for (let cj = 0; cj < curLines.length; cj++) {
    if (cursor < oldToCur.length && oldToCur[cursor][1] === cj) {
      anchor = oldToCur[cursor][0];
      cursor++;
      continue;
    }
    if (!matchedCur.has(cj)) {
      const arr = insertsAfterOld.get(anchor) ?? [];
      arr.push(curLines[cj]);
      insertsAfterOld.set(anchor, arr);
    }
  }
  if (insertsAfterOld.size === 0) return newGen;

  const oldToNew = lcsMatch(oldLines, newLines);
  const newIdxForOld = new Map<number, number>(oldToNew.map(([oi, nj]) => [oi, nj]));

  // 해당 oldIdx 줄이 newGen에서 사라졌으면(예: 시술 삭제), 그 앞의 살아있는 oldIdx에 이어붙인다.
  function resolvedNewAnchor(oldIdx: number): number {
    for (let k = oldIdx; k >= 0; k--) {
      const found = newIdxForOld.get(k);
      if (found !== undefined) return found;
    }
    return -1;
  }

  const insertsAfterNewIdx = new Map<number, string[]>();
  for (const [oldIdx, lines] of insertsAfterOld) {
    const newIdx = oldIdx === -1 ? -1 : resolvedNewAnchor(oldIdx);
    const arr = insertsAfterNewIdx.get(newIdx) ?? [];
    arr.push(...lines);
    insertsAfterNewIdx.set(newIdx, arr);
  }

  const result: string[] = [];
  const before = insertsAfterNewIdx.get(-1);
  if (before) result.push(...before);
  for (let nj = 0; nj < newLines.length; nj++) {
    result.push(newLines[nj]);
    const after = insertsAfterNewIdx.get(nj);
    if (after) result.push(...after);
  }
  return result.join("\n");
}

if (process.env.NODE_ENV !== "production") {
  const assertEq = (label: string, actual: string, expected: string) => {
    if (actual !== expected) {
      console.error(`[mergeText self-check FAIL] ${label}\n--- actual ---\n${actual}\n--- expected ---\n${expected}`);
    }
  };
  // 메모를 끝에 덧붙인 뒤 항목 가격만 바뀐 경우: 메모 유지
  assertEq(
    "append at end",
    mergeGeneratedText("A 100원", "A 100원\n메모", "A 200원"),
    "A 200원\n메모"
  );
  // 항목 사이에 메모를 끼워 넣었고, 그 항목 가격(수량)이 바뀐 경우: 그 자리 유지
  assertEq(
    "insert in middle, price of anchor line changes (quantity edit)",
    mergeGeneratedText("A\nB 100원\nC", "A\nB 100원\n메모\nC", "A\nB 200원🔸\nC"),
    "A\nB 200원🔸\n메모\nC"
  );
  // 새 시술이 추가되어 줄이 하나 늘어도 기존 메모 위치 유지
  assertEq(
    "new item added",
    mergeGeneratedText("A\nB", "A\n메모\nB", "A\nB\nC"),
    "A\n메모\nB\nC"
  );
  // 편집 없음: 그대로 새 텍스트
  assertEq("no edit", mergeGeneratedText("A\nB", "A\nB", "A2\nB"), "A2\nB");
  // 수량을 2로 늘렸다가(회차 표기가 1-1->2-1로 바뀜, curText는 그 상태) 다시 1로
  // 낮추면(newGen이 1-1로 복귀), 옛 "2-1" 줄이 남지 않고 새 "1-1" 한 줄만 남아야 한다.
  assertEq(
    "quantity raised then lowered doesn't duplicate the line",
    mergeGeneratedText(
      "슈링크 300샷 1-1  100,000원🔸",
      "슈링크 300샷 2-1  100,000원🔸",
      "슈링크 300샷 1-1  100,000원"
    ),
    "슈링크 300샷 1-1  100,000원"
  );
}
