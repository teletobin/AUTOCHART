import { NextResponse } from "next/server";
import { runScrapeAndSync } from "@/lib/scrape";

export async function POST() {
  try {
    const result = await runScrapeAndSync();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
