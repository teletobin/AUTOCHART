function expandSlashTreatments(name: string): string[] {
  // 괄호 안에 슬래시가 있는 경우: "+"로 묶인 항목들 중 "/"가 있는
  // 항목만 둘로 쪼개고, 나머지 항목(공통 부분)은 양쪽에 그대로 유지한다.
  // 예: "(포텐자/프락셀+카프리 레이저+모공 타이트닝 앰플)"
  //  -> ["(포텐자+카프리 레이저+모공 타이트닝 앰플)", "(프락셀+카프리 레이저+모공 타이트닝 앰플)"]
  const parenMatch = name.match(/\(([^()]*\/[^()]*)\)/);
  if (parenMatch) {
    const [full, insideParen] = parenMatch;
    const items = insideParen.split("+");
    const slashItemIdx = items.findIndex((it) => it.includes("/"));
    if (slashItemIdx !== -1) {
      const parts = items[slashItemIdx].split("/");
      if (parts.length === 2) {
        return parts.map((part) => {
          const newItems = [...items];
          newItems[slashItemIdx] = part;
          return name.replace(full, `(${newItems.join("+")})`);
        });
      }
    }
  }

  // 괄호 밖에 슬래시가 있으면 그 토큰만 분리한다.
  // 예: "(여자) 종아리/허벅지 제모" -> ["(여자) 종아리 제모", "(여자) 허벅지 제모"]
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
