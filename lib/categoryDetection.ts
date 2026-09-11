import { TreatmentCategory } from "@/lib/types";

// 스크래핑 출처 탭(mainCategory, scrape.ts의 sField)에 따라 카테고리를 정한다.
// 카테고리1(피부관리)은 아직 규칙이 정해지지 않아, 일단 레이저(피부 탭)에
// 함께 묶어두고 나중에 키워드 규칙이 정해지면 그중 일부를 분리할 예정이다.
export function detectTreatmentCategory(
  name: string,
  mainCategory?: string
): TreatmentCategory | null {
  // 제모 탭: 이름에 "제모"가 포함된 시술만 제모로 분류한다.
  if (mainCategory === "제모") {
    return name.includes("제모") ? TreatmentCategory.제모 : null;
  }

  // 피부 탭 전체 → 레이저 (피부관리는 추후 키워드로 분리 예정)
  if (mainCategory === "피부") return TreatmentCategory.레이저;

  // 리프팅 탭 전체 → 리프팅
  if (mainCategory === "리프팅") return TreatmentCategory.리프팅;

  // 부스터 탭 전체 → 부스터
  if (mainCategory === "부스터") return TreatmentCategory.부스터;

  // 쁘띠성형 탭 전체 → 주사시술 및 기타
  if (mainCategory === "쁘띠성형") return TreatmentCategory.주사기타;

  // 비만 탭: 기본은 리프팅이지만, "블리비s"/"카복시"/"주사"가 이름에
  // 포함되면 주사시술 및 기타로 분류한다.
  if (mainCategory === "비만") {
    if (
      name.toLowerCase().includes("블리비s") ||
      name.includes("카복시") ||
      name.includes("주사")
    ) {
      return TreatmentCategory.주사기타;
    }
    return TreatmentCategory.리프팅;
  }

  return null;
}

export const CATEGORY_ORDER = [
  TreatmentCategory.피부관리,
  TreatmentCategory.제모,
  TreatmentCategory.레이저,
  TreatmentCategory.리프팅,
  TreatmentCategory.부스터,
  TreatmentCategory.주사기타,
];
