// 메인 페이지와 상세설정 페이지가 공유하는 디자인 토큰.
// 여기 값만 바꾸면 두 페이지의 색상이 함께 바뀐다. 화면 코드에는 색 코드를 직접 쓰지 않는다.
// (예외: app/globals.css의 :root 변수 --c-primary-lt, --c-border는 CSS라 여기 값을 따로 맞춰야 한다.)
export const C = {
  // 배경
  page:       "#F5F6F8",       // 가장 바깥 배경, 팝업 패널, 비활성 입력칸 (연한 회색)
  surface:    "#ffffff",       // 카드·팝업·드롭다운 배경

  // 선·구분
  border:     "#e6e7ea",       // 테두리

  // 글자·주요색
  primary:    "#5f6368",       // 주요 텍스트/버튼
  primaryLt:  "rgba(255,241,246,0.7)", // 연한 핑크 70% 불투명: 모든 드롭다운·목록 호버, 시술 차트 박스
  accent:     "#FFE8F2",       // 핑크 기조: 선택된 회원권 금액·시술 카드
  onPrimary:  "#ffffff",       // 주요색 버튼 위의 글자
  sub:        "#8a8f98",       // 보조 텍스트

  // 위험·경고
  danger:     "#C92E55",
  dangerBg:   "rgba(201,46,85,0.07)", // danger를 옅게 (오류 박스 배경)

  // 팝업 뒤 어두운 배경 (검정, 투명도만 조절)
  scrim:      "rgba(20,22,26,0.5)",
};

// 그림자: 모두 검정이고 크기와 투명도만 다르다.
export const S = {
  sm:    "0 2px 6px rgba(30,35,45,0.1)",                           // 버튼
  card:  "0 1px 3px rgba(30,35,45,0.06), 0 2px 8px rgba(30,35,45,0.08)", // 카드, 헤더
  menu:  "0 8px 24px rgba(30,35,45,0.1)",                          // 드롭다운, 툴팁, 메뉴
  modal: "0 20px 48px rgba(30,35,45,0.25)",                        // 팝업, 모달
};

export const MAX_WIDTH = 1100;
