import { TreatmentCategory } from "@/lib/types";

export function detectTreatmentCategory(
  name: string,
  mainCategory?: string
): TreatmentCategory | null {
  // 키워드 기반 분류 먼저 (가장 정확함)
  // 면역주사: 항노화주사 키워드
  if (name.includes("항노화주사")) return TreatmentCategory.면역주사;

  // 보톡스: "보톡스" 키워드 (필러, 주사보다 먼저 확인)
  if (name.includes("보톡스")) return TreatmentCategory.보톡스;

  // 필러, 주사: "필러", "하이코", "주사" 키워드
  if (name.includes("필러") || name.includes("하이코") || name.includes("주사"))
    return TreatmentCategory.필러주사;

  // 제모: "제모" 키워드
  if (name.includes("제모")) return TreatmentCategory.제모;

  // 피부관리: 특정 키워드들
  if (
    name.includes("MILD") ||
    name.includes("PDT") ||
    name.includes("여드름") ||
    name.includes("플라필") ||
    name.includes("라라필") ||
    name.includes("셀바이브") ||
    name.includes("엔바이론") ||
    name.includes("레블라이트") ||
    name.includes("토닝")
  )
    return TreatmentCategory.피부관리;

  // 리프팅
  if (
    name.includes("리프팅") ||
    name.includes("스레드") ||
    name.includes("고주파")
  )
    return TreatmentCategory.리프팅;

  // 레이저
  if (
    name.includes("레이저") ||
    name.includes("점빼기") ||
    name.includes("IPL")
  )
    return TreatmentCategory.레이저;

  if (name.includes("부스터")) return TreatmentCategory.부스터;

  // 섹션 기반 분류 (키워드로 판단 못할 때만)
  if (mainCategory === "쁘띠성형") return TreatmentCategory.필러주사;
  if (mainCategory === "리프팅") return TreatmentCategory.리프팅;
  if (mainCategory === "부스터") return TreatmentCategory.부스터;
  if (mainCategory === "제모") return TreatmentCategory.제모;

  return null;
}

export const CATEGORY_ORDER = [
  TreatmentCategory.피부관리,
  TreatmentCategory.제모,
  TreatmentCategory.레이저,
  TreatmentCategory.리프팅,
  TreatmentCategory.부스터,
  TreatmentCategory.보톡스,
  TreatmentCategory.필러주사,
  TreatmentCategory.면역주사,
];
