import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const body = await request.json();

  const name = String(body.name ?? "").trim();
  const price = Number(body.price);

  if (!name || !price || price <= 0) {
    return NextResponse.json({ error: "시술명과 가격을 입력하세요." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("treatments")
    .update({ name, price })
    .eq("id", id)
    .eq("is_manual", true)
    .select("id, name, price")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ treatment: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("treatments")
    .delete()
    .eq("id", id)
    .eq("is_manual", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
