"use client";

import { useEffect, useRef, useState } from "react";
import { ALL_BRANCHES } from "@/lib/branches";
import { C } from "@/lib/theme";

// 한글 초성을 영문으로 변환 (영타 검색용)
function getKoreanInitial(korean: string): string {
  const initials = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅄㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const initialToEnglish: Record<string, string> = {
    "ㄱ": "g", "ㄲ": "g", "ㄴ": "n", "ㄷ": "d", "ㄸ": "d", "ㄹ": "l", "ㅁ": "m",
    "ㅂ": "b", "ㅃ": "b", "ㅄ": "b", "ㅅ": "s", "ㅆ": "s", "ㅇ": "", "ㅈ": "j", "ㅉ": "j", "ㅊ": "c",
    "ㅋ": "k", "ㅌ": "t", "ㅍ": "p", "ㅎ": "h"
  };
  return korean.split("").map((char) => {
    const code = char.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const index = Math.floor((code - 0xAC00) / 588);
      const initial = initials[index];
      return initialToEnglish[initial] || initial;
    }
    return char;
  }).join("");
}

const SEARCH_WIDTH = 130;
const MIN_PICKED_WIDTH = 64;

let measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidth(text: string, font: string): number {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return SEARCH_WIDTH;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export default function BranchPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (branch: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pickedWidth, setPickedWidth] = useState(SEARCH_WIDTH);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (!value) return;
    const w = measureTextWidth(value, "600 13px Pretendard, -apple-system, sans-serif");
    setPickedWidth(Math.max(MIN_PICKED_WIDTH, Math.ceil(w) + 34));
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const q = query.trim().toLowerCase().replace(/\s/g, "");
  // 완성된 한글(가~힣)을 하나라도 입력했으면 실제 글자 검색이 목적이므로
  // 초성 매치(영타 검색용)는 쓰지 않는다. 안 그러면 "부산"을 쳤는데 초성이
  // 우연히 같은 "발산점"까지 후보로 뜨는 문제가 생긴다. 초성 매치는 자판이
  // 한글로 안 바뀐 채 로마자를 그대로 친 경우("bsj")에만 쓴다.
  const hasHangulSyllable = /[가-힣]/.test(q);
  const qInitial = hasHangulSyllable ? "" : getKoreanInitial(q);
  const matches = !q
    ? ALL_BRANCHES
    : ALL_BRANCHES
        .map((b) => {
          const normalized = b.toLowerCase().replace(/\s/g, "");
          const textMatch = normalized.includes(q);
          const initialMatch = !hasHangulSyllable && getKoreanInitial(b).toLowerCase().includes(qInitial);
          if (!textMatch && !initialMatch) return null;
          // 0: 이름이 검색어로 시작 1: 이름에 검색어 포함 2: 초성만 일치
          const rank = normalized.startsWith(q) ? 0 : textMatch ? 1 : 2;
          return { b, rank };
        })
        .filter((x): x is { b: string; rank: number } => x !== null)
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.b);
  const width = value && !open ? pickedWidth : SEARCH_WIDTH;

  function pick(b: string) {
    onChange(b);
    setQuery(b);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); setActiveIndex(-1); return; }
    if (!matches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(matches[activeIndex >= 0 ? activeIndex : 0]); }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width, transition: "width 0.15s ease" }}>
      <svg
        width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", flexShrink: 0 }}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={query}
        placeholder="지점명 검색"
        autoComplete="off"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{
          width: "100%",
          padding: "9px 4px 9px 18px",
          border: "none",
          borderBottom: `1.5px solid ${C.border}`,
          borderRadius: 0,
          fontSize: 13,
          fontWeight: 600,
          outline: "none",
          color: C.primary,
          background: "transparent",
          textAlign: value ? "right" : "left",
        }}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: "max-content",
            minWidth: "100%",
            maxWidth: 260,
            maxHeight: 220,
            overflowY: "auto",
            padding: 5,
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
            zIndex: 300,
          }}
        >
          {matches.map((b, idx) => (
            <button
              key={b}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => pick(b)}
              style={{
                display: "block",
                width: "100%",
                padding: "4px 10px",
                border: "none",
                borderRadius: 7,
                textAlign: "left",
                fontSize: 13,
                whiteSpace: "nowrap",
                cursor: "pointer",
                background: idx === activeIndex || b === value ? C.primaryLt : "#fff",
                color: idx === activeIndex || b === value ? "#5f5854" : "#555",
                fontWeight: idx === activeIndex || b === value ? 700 : 400,
              }}
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
