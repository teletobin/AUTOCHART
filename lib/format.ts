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
