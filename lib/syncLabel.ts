import type { Treatment } from "@/lib/types";

// 홈페이지 연동 시각: 스크래핑으로 채워진 시술(직접 추가 제외) 중 가장 최근 저장 시각.
// DB는 UTC를 오프셋 없이 내려주므로 Z를 붙여 해석한다.
export function syncedLabel(treatments: Treatment[]): string | null {
  let latest: Date | null = null;
  for (const t of treatments) {
    if (t.is_manual || !t.scraped_at) continue;
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t.scraped_at) ? t.scraped_at : t.scraped_at + "Z");
    if (!latest || d > latest) latest = d;
  }
  if (!latest) return null;
  const day = latest.toDateString() === new Date().toDateString() ? "오늘" : `${latest.getMonth() + 1}월 ${latest.getDate()}일`;
  const h = latest.getHours();
  const time = `${h < 12 ? "오전" : "오후"} ${String(h % 12 || 12).padStart(2, "0")}:${String(latest.getMinutes()).padStart(2, "0")}`;
  return `${day} ${time} 연동완료`;
}
