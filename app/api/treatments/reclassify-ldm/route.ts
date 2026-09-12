import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { TreatmentCategory } from "@/lib/types";

// "리프팅" 카테고리로 분류된 시술 중, 이름에 "LDM"이 포함된 것들을
// 피부관리 카테고리로 옮긴다. 재스크래핑 없이 기존 DB 데이터만 보고
// 즉시 재분류할 때 사용한다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const branch = String(body.branch ?? "").trim();
  if (!branch) {
    return NextResponse.json({ error: "branch는 필수입니다." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("treatments")
    .select("id, name")
    .eq("branch", branch)
    .eq("category", TreatmentCategory.리프팅)
    .eq("is_manual", false)
    .eq("category_manual", false)
    .ilike("name", "%LDM%");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (data ?? []).map((t) => t.id);

  if (ids.length > 0) {
    const { error: updateError } = await supabase
      .from("treatments")
      .update({ category: TreatmentCategory.피부관리 })
      .in("id", ids);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ movedToSkin: ids.length });
}
