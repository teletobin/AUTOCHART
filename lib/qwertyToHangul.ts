import Hangul from "hangul-js";

// 두벌식(2벌식) 키보드 매핑: 한글 자판인데 영문 자판으로 오인식된 상태로
// 타이핑했을 때, 그 글자들을 실제로 눌렀을 한글 자모로 되돌린다.
// Caps Lock은 대문자만 만들 뿐 실제 한글 자판의 Shift(쌍자음)와는 무관하므로,
// 대소문자를 구분하지 않고 소문자 매핑 하나로만 처리한다.
const DUBEOLSIK_MAP: Record<string, string> = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
  a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
  z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
};

// 매핑에 없는 문자(숫자, 공백, 이미 한글/조합된 글자 등)는 그대로 두고,
// 매핑되는 라틴 문자만 자모로 바꿔서 hangul-js로 조합한다.
export function qwertyToHangul(input: string): string {
  const jamo = input.split("").map((ch) => DUBEOLSIK_MAP[ch.toLowerCase()] ?? ch);
  return Hangul.assemble(jamo);
}
