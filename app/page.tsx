"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildMatcher } from "@/lib/match";
import { formatNumber, todayYYMMDD } from "@/lib/format";
import type { Alias, Treatment } from "@/lib/types";
import { TreatmentCategory } from "@/lib/types";
import { CATEGORY_ORDER } from "@/lib/categoryDetection";
import { C, MAX_WIDTH } from "@/lib/theme";
import { BRANCH_STORAGE_KEY } from "@/lib/branches";
import BranchPicker from "@/components/BranchPicker";
import Dropdown from "@/components/Dropdown";

const VAT_RATE = 1.1;

type SelectedItem = {
  id: string;
  name: string;
  basePrice: number;
  count: number;
  unused: boolean;
  displayed: boolean;
  category?: TreatmentCategory;
};

function computeUnitPrice(item: SelectedItem): number {
  return Math.round(item.basePrice * item.count * VAT_RATE);
}

// 시술명 끝에 붙은 "N회"를 분리한다. 없으면 1회로 취급.
function splitCountSuffix(name: string): { base: string; n: string } {
  const m = name.match(/(\d+)\s*회\s*$/);
  if (!m) return { base: name.replace(/\s+/g, " ").trim(), n: "1" };
  return {
    base: name.slice(0, m.index).replace(/\s+/g, " ").trim(),
    n: m[1],
  };
}

function AutoGrowInput({
  value,
  onChange,
  className,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(resize, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      className={`resize-none overflow-hidden ${className ?? ""}`}
      style={style}
    />
  );
}

function CountDial({ count, onChange }: { count: number; onChange: (count: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <style>{`input[type="number"]::-webkit-outer-spin-button,input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}input[type="number"]{-moz-appearance:textfield}`}</style>
      <input
        type="number"
        min={1}
        value={count}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        style={{ width: 24, border: "none", padding: 0, textAlign: "right", fontSize: 13, outline: "none", background: "transparent" }}
      />
      <div className="flex flex-col leading-none gap-0">
        <button onClick={() => onChange(count + 1)} style={{ fontSize: 6, color: "#a89f9a", padding: "1px 0", lineHeight: 1 }} aria-label="증가">▲</button>
        <button onClick={() => onChange(Math.max(1, count - 1))} style={{ fontSize: 6, color: "#a89f9a", padding: "1px 0", lineHeight: 1 }} aria-label="감소">▼</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap:    { display: "flex", flexDirection: "column", minHeight: "100vh", background: C.bg, color: C.primary, fontFamily: "Pretendard, -apple-system, sans-serif" },
  header:  { borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "14px 0", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(111,104,100,0.06)" },
  headerInner: { maxWidth: MAX_WIDTH, margin: "0 auto", padding: "0 20px", boxSizing: "border-box" as const, display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo:    { display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 17, color: C.primary },
  btnPrimary: { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnGhost:   { background: "transparent", color: C.sub, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  main:    { maxWidth: MAX_WIDTH, margin: "0 auto", width: "100%", padding: "24px 20px", display: "grid", gridTemplateColumns: "1fr", gap: 16 },
  card:    { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" },
  cardTitle: { fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 14, letterSpacing: "0.04em" },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 34, marginBottom: 14 },
  input:   { width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", background: "#fff", color: C.primary, boxSizing: "border-box" as const },
  hint:    { fontSize: 11, color: C.sub, marginTop: 6 },
  candidateBox: { position: "absolute" as const, zIndex: 20, marginTop: 4, width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(111,104,100,0.10)", overflow: "hidden" },
  candidateRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${C.borderSoft}` },
  tableHead: { display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, fontSize: 11, color: C.sub, marginBottom: 4 },
  tableRow:  { display: "flex", alignItems: "center", gap: 4, borderBottom: `1px solid ${C.borderSoft}`, padding: "8px 0", fontSize: 13 },
  totalRow:  { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 8, fontWeight: 700, fontSize: 14 },
  textarea:  { width: "100%", resize: "none" as const, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, padding: "12px 14px", fontSize: 13, color: C.primary, outline: "none", lineHeight: 1.8, boxSizing: "border-box" as const },
  subSection: { display: "flex", flexDirection: "column" as const, gap: 6, border: `1px solid ${C.primaryLt}`, borderRadius: 10, padding: "14px 16px", background: "#fdfcfb" },
  label:  { fontSize: 13, fontWeight: 600, color: C.primary, textAlign: "right" as const, minWidth: 88, flexShrink: 0 },
  numInput: { width: 120, border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 10px", fontSize: 13, textAlign: "right" as const, outline: "none", background: "#fff", color: C.primary },
  divider: { borderTop: `1px dashed ${C.border}`, margin: "2px 0" },
  dividerSolid: { borderTop: `2px solid ${C.primaryLt}`, margin: "2px 0" },
};

export default function Home() {
  const [branch, setBranch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [creditInput, setCreditInput] = useState("");
  const [extraCreditInput, setExtraCreditInput] = useState("");
  const [staffName, setStaffName] = useState("");
  const [existingBalanceInput, setExistingBalanceInput] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualCategory, setManualCategory] = useState<TreatmentCategory | null>(null);
  const [copied, setCopied] = useState(false);
  const [includeHeader, setIncludeHeader] = useState(false);
  const [membershipType, setMembershipType] = useState<"VIP" | "쁘띠">("VIP");
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [transferRecipients, setTransferRecipients] = useState<Array<{ name: string; amount: string }>>([]);

  function loadTreatments(forBranch: string) {
    return fetch(`/api/treatments?branch=${encodeURIComponent(forBranch)}`).then((res) => res.json()).then((data) => {
      if (data.error) setLoadError(data.error);
      else { setLoadError(null); setTreatments(data.treatments ?? []); }
    }).catch((e) => setLoadError(String(e)));
  }
  function loadAliases() {
    return fetch("/api/aliases").then((res) => res.json()).then((data) => {
      if (!data.error) setAliases(data.aliases ?? []);
    }).catch(() => {});
  }
  useEffect(() => {
    loadAliases();
    const saved = localStorage.getItem(BRANCH_STORAGE_KEY);
    if (saved) setBranch(saved);
  }, []);
  useEffect(() => {
    if (branch) loadTreatments(branch);
  }, [branch]);

  function handleBranchChange(next: string) {
    setBranch(next);
    localStorage.setItem(BRANCH_STORAGE_KEY, next);
  }

  async function handleSyncBranch() {
    if (!branch) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      const data = await res.json();
      if (data.error) setLoadError(data.error);
      else await loadTreatments(branch);
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  const matcher = useMemo(() => buildMatcher(treatments, aliases), [treatments, aliases]);
  const candidates = useMemo(() => (inputValue.trim().length >= 2 ? matcher(inputValue, 12) : []), [inputValue, matcher]);

  function selectCandidate(candidate: Treatment) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSelectedItems((prev) => [...prev, { id, name: candidate.name, basePrice: candidate.price, count: 1, unused: false, displayed: true, category: candidate.category }]);
    setInputValue(""); setHighlightedIndex(0);
  }
  function removeItem(id: string) { setSelectedItems((prev) => prev.filter((i) => i.id !== id)); }
  // 실장 이름(staffName)은 새로고침 전까지 유지하는 값이라 여기서 건드리지 않는다.
  function clearAllItems() {
    setSelectedItems([]);
    setCreditInput("");
    setExtraCreditInput("");
    setExistingBalanceInput("");
    setTransferRecipients([]);
    setTransferEnabled(false);
    setIncludeHeader(false);
    setMembershipType("VIP");
  }
  function updateItemName(id: string, name: string) { setSelectedItems((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i))); }
  function updateItemCount(id: string, count: number) {
    setSelectedItems((prev) => prev.map((i) => (i.id === id ? { ...i, count: Math.max(1, count || 1) } : i)));
  }
  function addManualItem() {
    const price = Number(manualPrice);
    if (!manualName.trim() || !price || price <= 0) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSelectedItems((prev) => [...prev, { id, name: manualName.trim(), basePrice: price, count: 1, unused: false, displayed: true, category: manualCategory ?? undefined }]);
    setManualName(""); setManualPrice(""); setManualCategory(null);
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (candidates.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIndex((i) => Math.min(i + 1, candidates.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); selectCandidate(candidates[highlightedIndex]); }
  }

  const paymentAmount = Number(creditInput) || 0;
  const extraCredit = Number(extraCreditInput) || 0;
  const existingBalance = Number(existingBalanceInput) || 0;
  const transferAmount = transferEnabled ? transferRecipients.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) : 0;
  const totalPrice = selectedItems.filter((i) => i.displayed).reduce((sum, i) => sum + computeUnitPrice(i), 0);
  const totalCreditWon = paymentAmount + extraCredit + existingBalance;
  const balance = totalCreditWon - totalPrice - transferAmount;
  const RED_DOT = " 🔸";
  const headerVisible = includeHeader && paymentAmount > 0 && extraCredit > 0;

  const finalText = useMemo(() => {
    const staffDisplay = staffName.trim() ? `${staffName.trim()}S` : "";
    const paymentManwon = Math.round(paymentAmount / 10000);
    const extraManwon = Math.round(extraCredit / 10000);
    const header = `${membershipType}${paymentManwon}+${extraManwon}(${staffDisplay}/${todayYYMMDD()})`;
    const normalItems = selectedItems.filter((i) => i.displayed && !i.unused);
    const unusedItems = selectedItems.filter((i) => i.displayed && i.unused);
    const unclassified = normalItems.filter((i) => !i.category);
    const classified = normalItems.filter((i) => i.category).sort((a, b) =>
      CATEGORY_ORDER.indexOf(a.category!) - CATEGORY_ORDER.indexOf(b.category!)
    );
    const sortedNormalItems = [...unclassified, ...classified];
    const itemLines = sortedNormalItems.map((i) => {
      // 시술명 끝의 "N회"는 "N-1" 표기로 옮겨 붙인다 (없으면 "1-1").
      const { base, n } = splitCountSuffix(i.name);
      const dot = i.count !== 1 ? RED_DOT : "";
      let displayName = base;
      // "구독"이 포함되면 1년 뒤 전날(1년 동안 사용 가능)과 "1차" 표기 추가
      if (i.name.includes("구독")) {
        const oneYearLater = new Date();
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
        oneYearLater.setDate(oneYearLater.getDate() - 1);
        const yy = String(oneYearLater.getFullYear()).slice(-2);
        const mm = String(oneYearLater.getMonth() + 1).padStart(2, "0");
        const dd = String(oneYearLater.getDate()).padStart(2, "0");
        displayName = `${base}(~${yy}.${mm}.${dd}) 1차`;
      }
      return `${displayName} ${n}-1  ${formatNumber(computeUnitPrice(i))}원${dot}`;
    });
    // 미사용 체크된 시술은 원래 이름 그대로, 맨 마지막 구분선 아래에 표시한다.
    const unusedLines = unusedItems.length > 0
      ? ["=".repeat(20), ...unusedItems.map((i) => {
          const displayName = i.name.replace(/\s+/g, " ").trim();
          const dot = i.count !== 1 ? RED_DOT : "";
          return `${displayName} ${formatNumber(computeUnitPrice(i))}원${dot} *미사용`;
        })]
      : [];
    const totalLine = selectedItems.length > 1 ? [`총 ${formatNumber(totalPrice)}원`] : [];
    const transferLine = includeHeader && transferEnabled && transferRecipients.length > 0
      ? transferRecipients.map(r => `+${r.name.trim() || "___"}님께 ${formatNumber(Number(r.amount) || 0)}원 양도함`)
      : [];
    let creditLines: string[] = [];
    if (includeHeader) {
      if (balance < 0) {
        const existingLine = existingBalance > 0 ? [`기존 적립금 ${formatNumber(existingBalance)}원 전액 사용 후`] : [];
        creditLines = [...existingLine, `차액 ${formatNumber(-balance)}원 결제`, "잔액: 없음"];
      } else {
        creditLines = [`잔액: ${formatNumber(balance)}원`];
      }
    }
    return [...(headerVisible ? [header] : []), ...itemLines, ...unusedLines, ...totalLine, ...transferLine, ...creditLines].join("\n");
  }, [headerVisible, includeHeader, membershipType, staffName, paymentAmount, extraCredit, selectedItems, totalPrice, existingBalance, transferEnabled, transferAmount, transferRecipients, balance]);

  const [editableText, setEditableText] = useState("");
  useEffect(() => { setEditableText(finalText); }, [finalText]);

  async function handleCopy() {
    const cleaned = editableText.split(RED_DOT).join("");
    await navigator.clipboard.writeText(cleaned);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={styles.wrap}>
      {/* 헤더 */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <img src="/logo.png" alt="차팅 서포트" style={{ height: 36, width: "auto" }} />
            차팅 서포트
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BranchPicker value={branch} onChange={handleBranchChange} />
            {branch && (
              <button
                onClick={handleSyncBranch}
                disabled={syncing}
                title="홈페이지 수가가 변경되었다면 눌러주세요"
                style={{ ...styles.btnGhost, fontSize: 11, padding: "6px 10px", opacity: syncing ? 0.6 : 1 }}
              >
                {syncing ? "연동 중..." : "홈페이지 연동"}
              </button>
            )}
            <Link
              href="/rules?tab=category"
              aria-label="상세설정"
              title="상세설정"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, color: C.sub, textDecoration: "none" }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {!branch && (
        <p style={{ maxWidth: MAX_WIDTH, margin: "12px auto 0", padding: "0 20px", fontSize: 13, fontWeight: 700, color: C.primary }}>
          상단에서 지점을 선택한 후 홈페이지 연동 버튼을 눌러주세요.
        </p>
      )}
      {loadError && <p style={{ maxWidth: MAX_WIDTH, margin: "8px auto 0", padding: "0 20px", fontSize: 12, color: C.danger }}>시술 데이터를 불러오지 못했습니다: {loadError}</p>}

      {/* 메인 그리드 */}
      <main style={styles.main}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 5}}>

          {/* ── 좌: 시술 입력 ── */}
          <div style={styles.card}>
            <div style={styles.titleRow}>
              <p style={{ ...styles.cardTitle, marginBottom: 0 }}>시술 입력</p>
            </div>

            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); setHighlightedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="예: 써마지 600샷 체험가"
                style={styles.input}
              />
              {candidates.length > 0 && (
                <div style={styles.candidateBox}>
                  {candidates.map((c, idx) => (
                    <button
                      key={c.name}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => selectCandidate(c)}
                      style={{
                        ...styles.candidateRow,
                        background: idx === highlightedIndex ? C.primaryLt : C.surface,
                        color: idx === highlightedIndex ? C.primary : "#555",
                        fontWeight: idx === highlightedIndex ? 700 : 400,
                        width: "100%", border: "none", textAlign: "left",
                      }}
                    >
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      <span style={{ marginLeft: 12, flexShrink: 0, fontVariantNumeric: "tabular-nums", color: C.sub }}>{formatNumber(c.price)}원</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p style={styles.hint}>방향키로 후보 선택 후 Enter로 추가 · 수량은 아래 목록에서 조절</p>

            {/* 직접 입력 */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="시술 직접 입력" style={{ ...styles.input, flex: 2, minWidth: 0, height: 36, boxSizing: "border-box" }} />
              <input type="number" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="세전 금액" style={{ ...styles.input, flex: "0 0 96px", minWidth: 0, height: 36, boxSizing: "border-box" }} />
              <Dropdown
                value={manualCategory ?? ""}
                onChange={(v) => setManualCategory(v ? (v as TreatmentCategory) : null)}
                placeholder="분류"
                options={CATEGORY_ORDER.map((cat) => ({ value: cat, label: cat }))}
                style={{ flex: "0 0 140px", height: 36 }}
              />
              <button onClick={addManualItem} disabled={!manualName.trim() || !manualPrice}
                style={{ ...styles.btnPrimary, height: 36, boxSizing: "border-box", padding: "0 14px", fontSize: 13, opacity: (!manualName.trim() || !manualPrice) ? 0.4 : 1, flexShrink: 0 }}>
                추가
              </button>
            </div>

            {/* 시술 목록 */}
            <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              {selectedItems.length === 0 ? (
                <p style={{ ...styles.hint, textAlign: "center", padding: "20px 0" }}>추가된 시술이 없습니다</p>
              ) : (
                <>
                  <div style={styles.tableHead}>
                    <span style={{ width: 16 }} />
                    <span style={{ width: 24, textAlign: "center" }} />
                    <span style={{ flex: 1, textAlign: "center" }}>시술명</span>
                    <span style={{ width: 58, textAlign: "center" }}>단가</span>
                    <span style={{ width: 40, textAlign: "center" }}>수량</span>
                    <span style={{ width: 76, textAlign: "center" }}>합계</span>
                    <span style={{ width: 24, textAlign: "center", whiteSpace: "nowrap" }}>미사용</span>
                  </div>
                  {selectedItems.map((item) => (
                    <div key={item.id} style={styles.tableRow}>
                      <div style={{ width: 16, display: "flex", justifyContent: "center" }}>
                        <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, displayed: !i.displayed } : i)));
                        }}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          border: `1px solid ${C.primary}`,
                          background: "transparent",
                          color: C.primary,
                          fontSize: 11,
                          fontWeight: "bold",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0
                        }}
                        aria-label="선택결과 표시"
                      >
                        {item.displayed ? "+" : "−"}
                      </button>
                      <AutoGrowInput
                        value={item.name}
                        onChange={(v) => updateItemName(item.id, v)}
                        className=""
                        style={{ flex: 1, minWidth: 120, border: `1px solid transparent`, borderRadius: 6, padding: "2px 4px", background: "transparent", fontSize: 13, color: C.primary, lineHeight: 1.5 } as React.CSSProperties}
                      />
                      <span style={{ width: 58, textAlign: "center", fontVariantNumeric: "tabular-nums", color: C.primary, fontSize: 13 }}>{formatNumber(item.basePrice)}</span>
                      <div style={{ width: 40, display: "flex", justifyContent: "center" }}>
                        <CountDial count={item.count} onChange={(count) => updateItemCount(item.id, count)} />
                      </div>
                      <span style={{ width: 76, textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{formatNumber(computeUnitPrice(item))}</span>
                      <div style={{ width: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <input
                          type="checkbox"
                          checked={item.unused}
                          onChange={() => {
                            setSelectedItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, unused: !i.unused } : i)));
                          }}
                          style={{ accentColor: C.primary, cursor: "pointer" }}
                          aria-label="미사용"
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {selectedItems.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 8, gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>TOTAL</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 700, color: C.primary }}>{formatNumber(totalPrice)}원</span>
              </div>
            )}
          </div>

          {/* ── 우: 선택 결과 ── */}
          <div style={styles.card}>
            <div style={styles.titleRow}>
              <p style={{ ...styles.cardTitle, marginBottom: 0 }}>선택 결과</p>
              <button onClick={clearAllItems} disabled={selectedItems.length === 0}
                style={{ ...styles.btnGhost, fontSize: 11, opacity: selectedItems.length === 0 ? 0.4 : 1 }}>
                CLEAR
              </button>
            </div>

            <textarea
              value={editableText}
              onChange={(e) => setEditableText(e.target.value)}
              style={{ ...styles.textarea, height: 220 }}
            />

            <button onClick={handleCopy} disabled={selectedItems.length === 0}
              style={{ ...styles.btnPrimary, width: "100%", marginTop: 10, padding: "10px", opacity: selectedItems.length === 0 ? 0.4 : 1 }}>
              {copied ? "복사됨 ✓" : "최종 차트 복사"}
            </button>

            {/* 회원권 / 양도 토글 */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {(["회원권", "양도"] as const).map((label) => {
                const checked = label === "회원권" ? includeHeader : transferEnabled;
                const toggle = label === "회원권" ? () => setIncludeHeader((v) => !v) : () => setTransferEnabled((v) => !v);
                return (
                  <button key={label} onClick={toggle} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px solid ${checked ? C.primary : C.border}`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", background: checked ? C.primaryLt : "#fff", fontSize: 13, fontWeight: 600, color: C.primary }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* 회원권 상세 */}
            {includeHeader && (
              <div style={{ ...styles.subSection, marginTop: 12 }}>
                {/* 담당자 + 멤버십 */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="text" value={staffName} onChange={(e) => setStaffName(e.target.value)} maxLength={4} placeholder="이름" style={{ ...styles.numInput, width: 64, textAlign: "left" }} />
                    <span style={{ color: C.sub, fontSize: 13 }}>S</span>
                  </div>
                  {(["VIP", "쁘띠"] as const).map((t) => (
                    <label key={t} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer", fontWeight: membershipType === t ? 700 : 400, color: membershipType === t ? C.primary : C.sub }}>
                      <input type="checkbox" checked={membershipType === t} onChange={() => setMembershipType(t)} style={{ accentColor: C.primary }} />
                      {t}
                    </label>
                  ))}
                </div>

                {/* 회원권 종류별 결제금액 빠른 선택 */}
                {membershipType === "VIP" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[100, 200, 300, 400, 500].map((v) => {
                        const isSelected = creditInput === String(v * 10000);
                        return (
                          <button
                            key={v}
                            onClick={() => setCreditInput(String(v * 10000))}
                            style={{
                              padding: "4px 10px",
                              fontSize: 11,
                              flex: 1,
                              border: `1px solid ${isSelected ? C.primary : C.border}`,
                              borderRadius: 8,
                              background: isSelected ? C.primary : "#fff",
                              color: isSelected ? "#fff" : C.primary,
                              fontWeight: isSelected ? 700 : 600,
                              cursor: "pointer"
                            }}
                          >
                            VIP {v}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[600, 700, 800, 900, 1000].map((v) => {
                        const isSelected = creditInput === String(v * 10000);
                        return (
                          <button
                            key={v}
                            onClick={() => setCreditInput(String(v * 10000))}
                            style={{
                              padding: "4px 10px",
                              fontSize: 11,
                              flex: 1,
                              border: `1px solid ${isSelected ? C.primary : C.border}`,
                              borderRadius: 8,
                              background: isSelected ? C.primary : "#fff",
                              color: isSelected ? "#fff" : C.primary,
                              fontWeight: isSelected ? 700 : 600,
                              cursor: "pointer"
                            }}
                          >
                            VIP {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 4 }}>
                    {[20, 50].map((v) => {
                      const isSelected = creditInput === String(v * 10000);
                      return (
                        <button
                          key={v}
                          onClick={() => setCreditInput(String(v * 10000))}
                          style={{
                            padding: "4px 10px",
                            fontSize: 11,
                            flex: 1,
                            border: `1px solid ${isSelected ? C.primary : C.border}`,
                            borderRadius: 8,
                            background: isSelected ? C.primary : "#fff",
                            color: isSelected ? "#fff" : C.primary,
                            fontWeight: isSelected ? 700 : 600,
                            cursor: "pointer"
                          }}
                        >
                          쁘띠{v}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 금액 입력 행들 */}
                {[
                  { label: "결제금액", val: creditInput, set: setCreditInput },
                  { label: "+ 추가적립금", val: extraCreditInput, set: setExtraCreditInput },
                  { label: "+ 기존적립금", val: existingBalanceInput, set: setExistingBalanceInput },
                ].map(({ label, val, set }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                    <span style={styles.label}>{label}</span>
                    <input type="number" value={val} onChange={(e) => set(e.target.value)} style={styles.numInput} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.primary, width: 20, textAlign: "left" }}>원</span>
                  </div>
                ))}

                <div style={styles.divider} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.primary, textAlign: "right", minWidth: 88, flexShrink: 0 }}>− TOTAL</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", width: 120, textAlign: "right", fontSize: 13, fontWeight: 700, color: C.primary }}>{formatNumber(totalPrice)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.primary, width: 20, textAlign: "left" }}>원</span>
                </div>

                {transferEnabled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ ...styles.label, textAlign: "left" }}>양도금액</span>
                    {transferRecipients.map((recipient, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                        <input type="text" value={recipient.name} onChange={(e) => {
                          const newRecipients = [...transferRecipients];
                          newRecipients[idx].name = e.target.value;
                          setTransferRecipients(newRecipients);
                        }} placeholder="이름" style={{ ...styles.numInput, width: 64, textAlign: "left" }} />
                        <span style={{ fontSize: 12, color: C.sub }}>님께</span>
                        <input type="number" value={recipient.amount} onChange={(e) => {
                          const newRecipients = [...transferRecipients];
                          newRecipients[idx].amount = e.target.value;
                          setTransferRecipients(newRecipients);
                        }} style={styles.numInput} />
                        <span style={{ fontSize: 11, color: C.sub, width: 14 }}>원</span>
                        <button onClick={() => {
                          setTransferRecipients(transferRecipients.filter((_, i) => i !== idx));
                        }} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 14 }}>×</button>
                      </div>
                    ))}
                    {transferRecipients.length < 5 && (
                      <button onClick={() => {
                        setTransferRecipients([...transferRecipients, { name: "", amount: "" }]);
                      }} style={{ alignSelf: "flex-end", width: 32, height: 32, borderRadius: "50%", border: `1px solid ${C.border}`, background: C.surface, cursor: "pointer", fontSize: 18, fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.primary, padding: 0 }}>
                        +
                      </button>
                    )}
                  </div>
                )}

                <div style={styles.dividerSolid} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.primary, textAlign: "right", minWidth: 88, flexShrink: 0 }}>잔액</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", width: 120, textAlign: "right", fontSize: 13, fontWeight: 700, color: C.primary }}>{formatNumber(balance)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.primary, width: 20, textAlign: "left" }}>원</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
