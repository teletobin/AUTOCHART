import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const body = await request.json();

  const pattern = String(body.pattern ?? "").trim();
  if (!pattern) {
    return NextResponse.json({ error: "pattern은 필수입니다." }, { status: 400 });
  }

  const update: { pattern: string; replacement?: string | null } = { pattern };
  if (body.type === "replace") {
    update.replacement = String(body.replacement ?? "");
  }

  const { data, error } = await supabase
    .from("cleanup_rules")
    .update(update)
    .eq("id", id)
    .select("id, type, pattern, replacement, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rule: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { error } = await supabase.from("cleanup_rules").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
