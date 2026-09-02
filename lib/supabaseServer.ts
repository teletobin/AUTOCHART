import { createClient } from "@supabase/supabase-js";

export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_KEY 환경변수가 설정되지 않았습니다.");
  }

  return createClient(url, key);
}
