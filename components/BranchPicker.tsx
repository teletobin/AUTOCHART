"use client";

import { useEffect, useRef, useState } from "react";
import { ALL_BRANCHES } from "@/lib/branches";
import { C } from "@/lib/theme";

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

  const q = query.trim().toLowerCase();
  const matches = ALL_BRANCHES.filter((b) => !q || b.toLowerCase().includes(q));
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
