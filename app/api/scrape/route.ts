import { NextResponse } from "next/server";
import { runScrapeAndSync } from "@/lib/scrape";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const branch = String(body.branch ?? "").trim();
    if (!branch) {
      return NextResponse.json({ error: "branch는 필수입니다." }, { status: 400 });
    }
    const result = await runScrapeAndSync(branch);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
