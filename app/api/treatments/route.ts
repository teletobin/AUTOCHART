import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch");
  if (!branch) {
    return NextResponse.json({ error: "branch는 필수입니다." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  let { data, error } = await supabase
    .from("treatments")
    .select("id, name, price, category, section, scraped_at, order")
    .eq("branch", branch)
    .order("section", { ascending: true })
    .order("order", { ascending: true });

  // DB에 order 컬럼 마이그레이션이 아직 적용되지 않은 환경에서는 order 없이
  // 재조회한다. PostgREST는 컬럼 미존재를 상황에 따라 42703(column does not
  // exist) 또는 PGRST204(스키마 캐시에 없음)로 보고하므로 둘 다 잡는다.
  // 검색 정렬은 lib/match.ts의 배열 순서 폴백으로 동작한다.
  if (
    error?.message.toLowerCase().includes("order") &&
    (error.code === "42703" || error.code === "PGRST204")
  ) {
    const retry = await supabase
      .from("treatments")
      .select("id, name, price, category, section, scraped_at")
      .eq("branch", branch)
      .order("scraped_at", { ascending: true });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ treatments: data ?? [] });
}

export async function PATCH(req: Request) {
  const supabase = getSupabaseServerClient();
  const { id, category } = await req.json();

  if (!id || !category) {
    return NextResponse.json(
      { error: "id와 category는 필수입니다" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("treatments")
    .update({ category, category_manual: true })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch");
  if (!branch) {
    return NextResponse.json({ error: "branch는 필수입니다." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("treatments")
    .delete()
    .eq("branch", branch)
    .eq("is_manual", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
