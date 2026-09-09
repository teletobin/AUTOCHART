import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const BRANCH = "홍대점";

export async function GET() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("treatments")
    .select("id, name, price")
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

  if (!name || !price || price <= 0) {
    return NextResponse.json({ error: "시술명과 가격을 입력하세요." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("treatments")
    .insert({
      branch: BRANCH,
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
