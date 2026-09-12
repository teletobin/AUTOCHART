import { TreatmentCategory } from "@/lib/types";

// 프로모션 태그(♥️메가세일♥️, [구독권 적용] 등)를 제거해 실제 시술명을 추출한다.
// 기획전 탭 시술들은 실제 이름으로 분류해야 정확하다.
function extractCleanName(name: string): string {
  let clean = name
    .replace(/♥️.*?♥️\s*/, "") // ♥️메가세일♥️ 제거
    .replace(/^\[.*?\]\s*/, ""); // [구독권 적용] 등 제거
  return clean.trim();
}

// 스크래핑 출처 탭(mainCategory, scrape.ts의 sField)에 따라 카테고리를 정한다.
// 기획전(sField=1)은 프로모션 태그를 제거한 실제 시술명으로 분류한다.
// 카테고리1(피부관리)은 아직 규칙이 정해지지 않아, 일단 레이저(피부 탭)에
// 함께 묶어두고 나중에 키워드 규칙이 정해지면 그중 일부를 분리할 예정이다.
export function detectTreatmentCategory(
  name: string,
  mainCategory?: string
): TreatmentCategory | null {
  const lowerName = name.toLowerCase();

  // 최우선: "주사", "보톡스", "필러", "케뉼라" 키워드가 있으면 무조건 주사시술(6)으로 분류
  if (
    lowerName.includes("주사") ||
    lowerName.includes("보톡스") ||
    lowerName.includes("필러") ||
    lowerName.includes("케뉼라")
  ) {
    return TreatmentCategory.주사기타;
  }

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

  // 기획전 탭: 프로모션 태그를 제거한 실제 시술명으로 분류한다.
  // 기획전은 다른 탭 시술들의 프로모션 버전이므로, 실제 이름으로 판단하면
  // 자동으로 올바른 카테고리에 들어간다.
  if (mainCategory === "기획전") {
    const clean = extractCleanName(name).toLowerCase();

    if (clean.includes("제모")) return TreatmentCategory.제모;

    if (
      clean.includes("점빼기") ||
      clean.includes("ipl") ||
      clean.includes("토닝") ||
      clean.includes("레이저")
    ) {
      return TreatmentCategory.레이저;
    }

    if (
      clean.includes("프라임") ||
      clean.includes("써마지") ||
      clean.includes("울쎄") ||
      clean.includes("스레드") ||
      clean.includes("고주파") ||
      clean.includes("슈링크") ||
      clean.includes("리프팅") ||
      clean.includes("온다") ||
      clean.includes("덴서티")
    ) {
      return TreatmentCategory.리프팅;
    }

    // 기획전 섹션에서도 주사 관련 키워드들 처리
    // (최상단의 일반 규칙에서 이미 처리되었지만, 기획전 분기에서도 명시적으로 처리)
    if (
      clean.includes("블리비") ||
      clean.includes("카복시") ||
      clean.includes("리투오") ||
      clean.includes("지방분해") ||
      clean.includes("쥬베룩") ||
      clean.includes("리쥬란") ||
      clean.includes("아이리") ||
      clean.includes("서브시전") ||
      clean.includes("올리디") ||
      clean.includes("레디") ||
      clean.includes("아큐") ||
      clean.includes("필로드")
    ) {
      return TreatmentCategory.주사기타;
    }

    if (
      clean.includes("아쿠아필") ||
      clean.includes("엔바이론") ||
      clean.includes("이온자임") ||
      clean.includes("인모드") ||
      clean.includes("포텐자")
    ) {
      return TreatmentCategory.피부관리;
    }

    if (clean.includes("부스터") || clean.includes("prp")) {
      return TreatmentCategory.부스터;
    }

    // 기획전이지만 분류 규칙에 안 맞으면 null로 남김
    return null;
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
