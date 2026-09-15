export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

export function todayYYMMDD(): string {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

// 구독권 만료일: 오늘로부터 1년 뒤 하루 전(1년 이용 마지막 날)을 YY.MM.DD로 반환한다.
export function subscriptionExpiryYYMMDD(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}
