import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("cleanup_rules")
    .select("id, type, pattern, replacement, branch, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  const body = await request.json();

  const type = body.type === "replace" ? "replace" : "exclude";
  const pattern = String(body.pattern ?? "").trim();
  const replacement = type === "replace" ? String(body.replacement ?? "") : null;
  const branch = body.branch ? String(body.branch).trim() : null;

  if (!pattern) {
    return NextResponse.json({ error: "pattern은 필수입니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cleanup_rules")
    .insert({ type, pattern, replacement, branch })
    .select("id, type, pattern, replacement, branch, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule: data });
}
