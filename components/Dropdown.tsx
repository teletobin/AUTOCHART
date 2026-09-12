"use client";

import { useEffect, useRef, useState } from "react";
import { C } from "@/lib/theme";

type Option = { value: string; label: string };

export default function Dropdown({
  value,
  options,
  placeholder,
  onChange,
  style,
  compact,
}: {
  value: string;
  options: Option[];
  placeholder?: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={wrapRef} style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setActiveIndex(-1); }}
        style={{
          width: "100%",
          height: "100%",
          textAlign: "left",
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: compact ? "9px 5px" : "9px 12px",
          fontSize: compact ? 11 : 13,
          fontWeight: 500,
          background: "#fff",
          color: selected ? C.primary : "#aaa",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
          boxSizing: "border-box",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder ?? "선택"}
        </span>
        <span style={{ color: C.sub, fontSize: 10, flexShrink: 0 }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
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
          {options.map((o, idx) => (
            <button
              key={o.value}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => { onChange(o.value); setOpen(false); setActiveIndex(-1); }}
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
                background: idx === activeIndex || o.value === value ? C.primaryLt : "#fff",
                color: idx === activeIndex || o.value === value ? "#5f5854" : "#555",
                fontWeight: idx === activeIndex || o.value === value ? 700 : 400,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
