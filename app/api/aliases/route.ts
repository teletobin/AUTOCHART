import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("aliases")
    .select("id, alias, keyword")
    .order("alias", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ aliases: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  const body = await request.json();

  const alias = String(body.alias ?? "").trim();
  const keyword = String(body.keyword ?? "").trim();

  if (!alias || !keyword) {
    return NextResponse.json(
      { error: "축약어와 검색 키워드를 모두 입력하세요." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("aliases")
    .insert({ alias, keyword })
    .select("id, alias, keyword")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "이미 등록된 매칭항목입니다. 기존 항목을 수정하거나 삭제한 뒤 다시 등록해 주세요." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alias: data });
}
