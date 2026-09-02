export type Treatment = {
  id?: string;
  name: string;
  price: number;
};

// alias(오타/줄임말) → keyword(실제로 검색할 문자열) 치환 사전.
// 예: alias="포마", keyword="FORMA" 로 저장하면 "포마" 입력 시 이름에
// "FORMA"가 들어간 모든 시술을 검색한다.
export type Alias = {
  id: string;
  alias: string;
  keyword: string;
};
