import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch");
  if (!branch) {
    return NextResponse.json({ error: "branch는 필수입니다." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("treatments")
    .select("id, name, price, category")
    .eq("branch", branch)
    .eq("is_manual", true)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ treatments: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  const body = await request.json();

  const name = String(body.name ?? "").trim();
  const price = Number(body.price);
  const category = body.category ?? null;
  const branch = String(body.branch ?? "").trim();

  if (!branch) {
    return NextResponse.json({ error: "branch는 필수입니다." }, { status: 400 });
  }
  if (!name || !price || price <= 0) {
    return NextResponse.json({ error: "시술명과 가격을 입력하세요." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("treatments")
    .insert({
      branch,
      name,
      price,
      category,
      is_manual: true,
      scraped_at: new Date().toISOString(),
    })
    .select("id, name, price, category")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ treatment: data });
}
