import { NextResponse } from "next/server";
import { runScrapeAndSyncAll } from "@/lib/scrape";
import { ALL_BRANCHES } from "@/lib/branches";

export const maxDuration = 300;

// Vercel Cron이 매일 정해진 시각에 이 엔드포인트를 호출해 전체 지점을
// 자동으로 재동기화한다. Vercel이 CRON_SECRET 환경변수를 Authorization
// 헤더로 자동 첨부하므로, 외부에서 아무나 이 URL을 호출하지 못하게 여기서 검증한다.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runScrapeAndSyncAll(ALL_BRANCHES);
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json({
    total: results.length,
    succeeded: results.length - failed.length,
    failed,
  });
}
