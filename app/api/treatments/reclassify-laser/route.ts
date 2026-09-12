import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { detectCategoryBySkinSection } from "@/lib/categoryDetection";
import { TreatmentCategory } from "@/lib/types";

// "레이저" 카테고리로 분류된 시술 중, 섹션 타이틀이 피부관리/주사 계열
// 키워드를 포함하는 것들을 재계산해서 옮긴다. 재스크래핑 없이 기존 DB
// 데이터(section)만 보고 즉시 재분류할 때 사용한다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const branch = String(body.branch ?? "").trim();
  if (!branch) {
    return NextResponse.json({ error: "branch는 필수입니다." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("treatments")
    .select("id, section")
    .eq("branch", branch)
    .eq("category", TreatmentCategory.레이저)
    .eq("is_manual", false)
    .eq("category_manual", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const skinIds: string[] = [];
  const injectIds: string[] = [];
  for (const t of data ?? []) {
    const category = detectCategoryBySkinSection(t.section);
    if (category === TreatmentCategory.피부관리) skinIds.push(t.id);
    else if (category === TreatmentCategory.주사기타) injectIds.push(t.id);
  }

  if (skinIds.length > 0) {
    const { error: skinError } = await supabase
      .from("treatments")
      .update({ category: TreatmentCategory.피부관리 })
      .in("id", skinIds);
    if (skinError) return NextResponse.json({ error: skinError.message }, { status: 500 });
  }

  if (injectIds.length > 0) {
    const { error: injectError } = await supabase
      .from("treatments")
      .update({ category: TreatmentCategory.주사기타 })
      .in("id", injectIds);
    if (injectError) return NextResponse.json({ error: injectError.message }, { status: 500 });
  }

  return NextResponse.json({ movedToSkin: skinIds.length, movedToInject: injectIds.length });
}
