"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildMatcher } from "@/lib/match";
import { formatNumber, todayYYMMDD } from "@/lib/format";
import type { Alias, Treatment } from "@/lib/types";
import { TreatmentCategory } from "@/lib/types";
import { CATEGORY_ORDER } from "@/lib/categoryDetection";

const VAT_RATE = 1.1;

type SelectedItem = {
  id: string;
  name: string;
  basePrice: number;
  count: number;
  unused: boolean;
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
      <input
        type="number"
        min={1}
        value={count}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        style={{ width: 24, border: "none", padding: 0, textAlign: "right", fontSize: 14, outline: "none", background: "transparent" }}
      />
      <div className="flex flex-col leading-none">
        <button onClick={() => onChange(count + 1)} style={{ fontSize: 9, color: "#a89f9a" }} aria-label="증가">▲</button>
        <button onClick={() => onChange(Math.max(1, count - 1))} style={{ fontSize: 9, color: "#a89f9a" }} aria-label="감소">▼</button>
      </div>
    </div>
  );
}

/* ── 디자인 토큰 ── */
const C = {
  bg:         "#faf8f6",       // 전체 배경
  surface:    "#ffffff",       // 카드 배경
  border:     "#e3dfdc",       // 테두리
  borderSoft: "rgba(227,223,220,0.6)",
  primary:    "#6f6864",       // 주요 텍스트/버튼
  primaryHov: "#5a5451",
  primaryLt:  "#e9e5e2",       // 연한 강조
  sub:        "#a89f9a",       // 보조 텍스트
  accent:     "#FFE8F2",       // 핑크 포인트 (badge 등)
  danger:     "#c0392b",
};

const styles: Record<string, React.CSSProperties> = {
  wrap:    { display: "flex", flexDirection: "column", minHeight: "100vh", background: C.bg, color: C.primary, fontFamily: "Pretendard, -apple-system, sans-serif" },
  header:  { borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "14px 28px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(111,104,100,0.06)" },
  headerInner: { maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo:    { display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 17, color: C.primary },
  btnPrimary: { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnGhost:   { background: "transparent", color: C.sub, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  main:    { maxWidth: 1100, margin: "0 auto", width: "100%", padding: "24px 20px", display: "grid", gridTemplateColumns: "1fr", gap: 16 },
  card:    { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" },
  cardTitle: { fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 14, letterSpacing: "0.04em" },
  input:   { width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", background: "#fff", color: C.primary, boxSizing: "border-box" as const },
  hint:    { fontSize: 11, color: C.sub, marginTop: 6 },
  candidateBox: { position: "absolute" as const, zIndex: 20, marginTop: 4, width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(111,104,100,0.10)", overflow: "hidden" },
  candidateRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${C.borderSoft}` },
  tableHead: { display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 8, fontSize: 11, color: C.sub, marginBottom: 4 },
  tableRow:  { display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.borderSoft}`, padding: "8px 0", fontSize: 13 },
  totalRow:  { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 8, fontWeight: 700, fontSize: 14 },
  textarea:  { width: "100%", resize: "none" as const, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, padding: "12px 14px", fontSize: 13, color: C.primary, outline: "none", lineHeight: 1.8, boxSizing: "border-box" as const },
  subSection: { display: "flex", flexDirection: "column" as const, gap: 10, border: `1px solid ${C.primaryLt}`, borderRadius: 10, padding: "14px 16px", background: "#fdfcfb" },
  label:  { fontSize: 12, color: C.sub, textAlign: "right" as const, minWidth: 88, flexShrink: 0 },
  numInput: { width: 120, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 13, textAlign: "right" as const, outline: "none", background: "#fff", color: C.primary },
  divider: { borderTop: `1px dashed ${C.border}`, margin: "2px 0" },
  dividerSolid: { borderTop: `2px solid ${C.primaryLt}`, margin: "2px 0" },
  footer: { marginTop: "auto", borderTop: `1px solid ${C.border}`, background: C.surface, padding: "16px", textAlign: "center" as const, fontSize: 11, color: C.sub },
};

export default function Home() {
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
  const [copied, setCopied] = useState(false);
  const [includeHeader, setIncludeHeader] = useState(false);
  const [membershipType, setMembershipType] = useState<"VIP" | "쁘띠">("VIP");
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [transferName, setTransferName] = useState("");
  const [transferAmountInput, setTransferAmountInput] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  function loadTreatments() {
    return fetch("/api/treatments").then((res) => res.json()).then((data) => {
      if (data.error) setLoadError(data.error);
      else { setLoadError(null); setTreatments(data.treatments ?? []); }
    }).catch((e) => setLoadError(String(e)));
  }
  function loadAliases() {
    return fetch("/api/aliases").then((res) => res.json()).then((data) => {
      if (!data.error) setAliases(data.aliases ?? []);
    }).catch(() => {});
  }
  useEffect(() => { loadTreatments(); loadAliases(); }, []);

  async function handleSync() {
    setSyncing(true); setSyncMessage(null);
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      const data = await res.json();
      if (data.error) setSyncMessage(`동기화 실패: ${data.error}`);
      else { setSyncMessage(`동기화 완료 (${data.saved}건 저장)`); await loadTreatments(); }
    } catch (e) { setSyncMessage(`동기화 실패: ${String(e)}`); }
    finally { setSyncing(false); }
  }

  const matcher = useMemo(() => buildMatcher(treatments, aliases), [treatments, aliases]);
  const candidates = useMemo(() => (inputValue.trim().length >= 2 ? matcher(inputValue, 12) : []), [inputValue, matcher]);

  function selectCandidate(candidate: Treatment) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSelectedItems((prev) => [...prev, { id, name: candidate.name, basePrice: candidate.price, count: 1, unused: false, category: candidate.category }]);
    setInputValue(""); setHighlightedIndex(0);
  }
  function removeItem(id: string) { setSelectedItems((prev) => prev.filter((i) => i.id !== id)); }
  // 실장 이름(staffName)은 새로고침 전까지 유지하는 값이라 여기서 건드리지 않는다.
  function clearAllItems() {
    setSelectedItems([]);
    setCreditInput("");
    setExtraCreditInput("");
    setExistingBalanceInput("");
    setTransferAmountInput("");
    setTransferName("");
    setTransferEnabled(false);
    setIncludeHeader(false);
    setMembershipType("VIP");
  }
  function updateItemName(id: string, name: string) { setSelectedItems((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i))); }
  function updateItemCount(id: string, count: number) {
    setSelectedItems((prev) => prev.map((i) => (i.id === id ? { ...i, count: Math.max(1, count || 1) } : i)));
  }
  function toggleItemUnused(id: string) {
    setSelectedItems((prev) => prev.map((i) => (i.id === id ? { ...i, unused: !i.unused } : i)));
  }
  function addManualItem() {
    const price = Number(manualPrice);
    if (!manualName.trim() || !price || price <= 0) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSelectedItems((prev) => [...prev, { id, name: manualName.trim(), basePrice: price, count: 1, unused: false, category: TreatmentCategory.피부관리 }]);
    setManualName(""); setManualPrice("");
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
  const transferAmount = transferEnabled ? Number(transferAmountInput) || 0 : 0;
  const totalPrice = selectedItems.reduce((sum, i) => sum + computeUnitPrice(i), 0);
  const totalCreditWon = paymentAmount + extraCredit + existingBalance;
  const balance = totalCreditWon - totalPrice - transferAmount;
  const RED_DOT = " 🔸";
  const headerVisible = includeHeader && paymentAmount > 0 && extraCredit > 0;

  const finalText = useMemo(() => {
    const staffDisplay = staffName.trim() ? `${staffName.trim()}S` : "";
    const paymentManwon = Math.round(paymentAmount / 10000);
    const extraManwon = Math.round(extraCredit / 10000);
    const header = `${membershipType}${paymentManwon}+${extraManwon}(${staffDisplay}/${todayYYMMDD()})`;
    const normalItems = selectedItems.filter((i) => !i.unused);
    const unusedItems = selectedItems.filter((i) => i.unused);
    const sortedNormalItems = normalItems.sort((a, b) => {
      const catA = a.category ?? TreatmentCategory.피부관리;
      const catB = b.category ?? TreatmentCategory.피부관리;
      return CATEGORY_ORDER.indexOf(catA) - CATEGORY_ORDER.indexOf(catB);
    });
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
      return `${displayName} ${n}-1 ${formatNumber(computeUnitPrice(i))}원${dot}`;
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
    const transferLine = includeHeader && transferEnabled && transferAmount > 0
      ? [`+${transferName.trim() || "___"}님께 ${formatNumber(transferAmount)}원 양도함`] : [];
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
  }, [headerVisible, includeHeader, membershipType, staffName, paymentAmount, extraCredit, selectedItems, totalPrice, existingBalance, transferEnabled, transferAmount, transferName, balance]);

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
            <img src="/logo.png" alt="완전자동차팅" style={{ height: 36, width: "auto" }} />
            완전자동차팅
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={handleSync} disabled={syncing} style={{ ...styles.btnPrimary, opacity: syncing ? 0.6 : 1 }}>
              {syncing ? "동기화 중…" : "수가 동기화"}
            </button>
            <Link href="/rules" style={{ fontSize: 12, color: C.sub, textDecoration: "none" }}>상세설정 →</Link>
          </div>
        </div>
      </header>

      {syncMessage && <p style={{ maxWidth: 1100, margin: "8px auto 0", padding: "0 20px", fontSize: 12, color: C.primary }}>{syncMessage}</p>}
      {loadError && <p style={{ maxWidth: 1100, margin: "8px auto 0", padding: "0 20px", fontSize: 12, color: C.danger }}>시술 데이터를 불러오지 못했습니다: {loadError}</p>}

      {/* 메인 그리드 */}
      <main style={styles.main}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 16 }}>

          {/* ── 좌: 시술 입력 ── */}
          <div style={styles.card}>
            <p style={styles.cardTitle}>시술 입력</p>

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
              <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="시술 직접 입력" style={{ ...styles.input, flex: 1 }} />
              <input type="number" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="세전 금액" style={{ ...styles.input, width: 110 }} />
              <button onClick={addManualItem} disabled={!manualName.trim() || !manualPrice}
                style={{ ...styles.btnPrimary, opacity: (!manualName.trim() || !manualPrice) ? 0.4 : 1, flexShrink: 0 }}>
                직접추가
              </button>
            </div>

            {/* 시술 목록 */}
            <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              {selectedItems.length === 0 ? (
                <p style={{ ...styles.hint, textAlign: "center", padding: "20px 0" }}>추가된 시술이 없습니다</p>
              ) : (
                <>
                  <div style={styles.tableHead}>
                    <span style={{ width: 40, textAlign: "center" }}>미사용</span>
                    <span style={{ flex: 1 }}>시술명</span>
                    <span style={{ width: 58, textAlign: "right" }}>단가</span>
                    <span style={{ width: 40, textAlign: "center" }}>수량</span>
                    <span style={{ width: 76, textAlign: "right" }}>합계</span>
                    <span style={{ width: 16 }} />
                  </div>
                  {selectedItems.map((item) => (
                    <div key={item.id} style={styles.tableRow}>
                      <span style={{ width: 40, display: "flex", justifyContent: "center" }}>
                        <input
                          type="checkbox"
                          checked={item.unused}
                          onChange={() => toggleItemUnused(item.id)}
                          style={{ accentColor: C.primary }}
                          aria-label="미사용"
                        />
                      </span>
                      <AutoGrowInput
                        value={item.name}
                        onChange={(v) => updateItemName(item.id, v)}
                        className=""
                        style={{ flex: 1, minWidth: 120, border: `1px solid transparent`, borderRadius: 6, padding: "2px 4px", background: "transparent", fontSize: 13, color: C.primary, lineHeight: 1.5 } as React.CSSProperties}
                      />
                      <span style={{ width: 58, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.sub, fontSize: 12 }}>{formatNumber(item.basePrice)}</span>
                      <CountDial count={item.count} onChange={(count) => updateItemCount(item.id, count)} />
                      <span style={{ width: 76, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(computeUnitPrice(item))}</span>
                      <button onClick={() => removeItem(item.id)} style={{ width: 16, background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </>
              )}
            </div>

            {selectedItems.length > 0 && (
              <div style={styles.totalRow}>
                <span>총 금액</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(totalPrice)}원</span>
              </div>
            )}
          </div>

          {/* ── 우: 선택 결과 ── */}
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
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
              {copied ? "복사됨 ✓" : "최종차트 복사"}
            </button>

            {/* 회원권 / 양도 토글 */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {(["회원권", "양도"] as const).map((label) => {
                const checked = label === "회원권" ? includeHeader : transferEnabled;
                const toggle = label === "회원권" ? () => setIncludeHeader((v) => !v) : () => setTransferEnabled((v) => !v);
                return (
                  <label key={label} onClick={toggle} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, border: `1px solid ${checked ? C.primary : C.border}`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", background: checked ? C.primaryLt : "#fff", fontSize: 13, fontWeight: 600, color: C.primary }}>
                    <input type="checkbox" checked={checked} onChange={() => {}} style={{ accentColor: C.primary }} />
                    {label}
                  </label>
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(membershipType === "VIP" ? [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] : [20, 50]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setCreditInput(String(v * 10000))}
                      style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 11 }}
                    >
                      {v}
                    </button>
                  ))}
                </div>

                {/* 금액 입력 행들 */}
                {[
                  { label: "결제금액", val: creditInput, set: setCreditInput },
                  { label: "+ 추가적립금", val: extraCreditInput, set: setExtraCreditInput },
                  { label: "+ 기존적립금", val: existingBalanceInput, set: setExistingBalanceInput },
                ].map(({ label, val, set }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                    <span style={styles.label}>{label}</span>
                    <input type="number" value={val} onChange={(e) => set(e.target.value)} style={styles.numInput} />
                    <span style={{ fontSize: 11, color: C.sub, width: 14 }}>원</span>
                  </div>
                ))}

                <div style={styles.divider} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, fontSize: 13, color: C.primary }}>
                  <span style={styles.label}>− 총 금액</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", width: 120, textAlign: "right" }}>{formatNumber(totalPrice)}원</span>
                  <span style={{ width: 14 }} />
                </div>

                {transferEnabled && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                    <span style={styles.label}>양도금액</span>
                    <input type="text" value={transferName} onChange={(e) => setTransferName(e.target.value)} placeholder="이름" style={{ ...styles.numInput, width: 64, textAlign: "left" }} />
                    <span style={{ fontSize: 12, color: C.sub }}>님께</span>
                    <input type="number" value={transferAmountInput} onChange={(e) => setTransferAmountInput(e.target.value)} style={styles.numInput} />
                    <span style={{ fontSize: 11, color: C.sub, width: 14 }}>원</span>
                  </div>
                )}

                <div style={styles.dividerSolid} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, fontWeight: 700, fontSize: 14 }}>
                  <span style={styles.label}>잔액</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", width: 120, textAlign: "right" }}>{formatNumber(balance)}원</span>
                  <span style={{ width: 14 }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer style={styles.footer}>© 2026. Designed & Developed by EUNBIN GA</footer>
    </div>
  );
}
