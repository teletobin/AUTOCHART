import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { applyCleanupRules, type CleanupRule } from "@/lib/cleanup";

// 현재 저장된 규칙을 treatments 테이블의 기존 데이터에 즉시 적용한다.
export async function POST() {
  const supabase = getSupabaseServerClient();

  const { data: rules, error: rulesError } = await supabase
    .from("cleanup_rules")
    .select("id, type, pattern, replacement");

  if (rulesError) {
    return NextResponse.json({ error: rulesError.message }, { status: 500 });
  }

  // Supabase/PostgREST는 한 번의 select에 최대 1000행까지만 응답하므로,
  // 지점이 많아 전체 시술 수가 1000건을 넘으면 range()로 나눠서 전부 가져와야
  // 특정 지점의 데이터만 누락되는 일이 없다.
  const treatments: { id: string; branch: string; name: string }[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error: treatmentsError } = await supabase
      .from("treatments")
      .select("id, branch, name")
      .range(from, from + PAGE_SIZE - 1);

    if (treatmentsError) {
      return NextResponse.json({ error: treatmentsError.message }, { status: 500 });
    }
    treatments.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }

  const cleanupRules = (rules ?? []) as CleanupRule[];
  const cleaned = (treatments ?? []).map((t) => ({
    id: t.id as string,
    branch: t.branch as string,
    oldName: t.name as string,
    newName: applyCleanupRules(t.name as string, cleanupRules),
  }));

  // 정리 후 같은 branch+name으로 겹치는 항목은 unique 제약 위반이므로 건너뛴다.
  const nameCount = new Map<string, number>();
  for (const c of cleaned) {
    const key = `${c.branch}|${c.newName}`;
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
  }

  const skipped: { id: string; oldName: string; newName: string }[] = [];
  const updates: typeof cleaned = [];

  for (const c of cleaned) {
    if (c.newName === c.oldName) continue;
    const key = `${c.branch}|${c.newName}`;
    if ((nameCount.get(key) ?? 0) > 1) {
      skipped.push(c);
      continue;
    }
    updates.push(c);
  }

  const errors: { id: string; message: string }[] = [];
  let updatedCount = 0;

  for (const u of updates) {
    const { error } = await supabase
      .from("treatments")
      .update({ name: u.newName })
      .eq("id", u.id);

    if (error) {
      errors.push({ id: u.id, message: error.message });
    } else {
      updatedCount++;
    }
  }

  return NextResponse.json({ updated: updatedCount, skipped, errors });
}
