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
    .select("id, name, price, category, section")
    .eq("branch", branch)
    .order("name", { ascending: true });

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
