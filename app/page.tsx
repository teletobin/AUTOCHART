"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildMatcher } from "@/lib/match";
import { formatNumber, todayYYMMDD, subscriptionExpiryYYMMDD } from "@/lib/format";
import type { Alias, Treatment } from "@/lib/types";
import { TreatmentCategory } from "@/lib/types";
import { CATEGORY_ORDER } from "@/lib/categoryDetection";
import { C, MAX_WIDTH } from "@/lib/theme";
import { BRANCH_STORAGE_KEY } from "@/lib/branches";
import { mergeGeneratedText } from "@/lib/mergeText";
import { findCcCombos, formatComboLabel, mergedComboName, deriveBaseName, type CcCombo } from "@/lib/ccCombo";
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

// panelItems가 null이면 금액 직접입력, 배열이면 팝업에서 시술을 골라
// 자동 합산한 금액을 쓴다.
type TransferRecipient = {
  id: string;
  name: string; // 양수인(받는 사람) 이름
  amount: string;
  panelDiscountPercent: 0 | 5 | 10;
  panelItems: SelectedItem[] | null;
  panelInput: string;
  panelHighlightedIndex: number;
  panelManualName: string;
  panelManualPrice: string;
  panelManualCategory: TreatmentCategory | null;
  panelEditableText: string;
};

// 시술명의 "N회"를 분리한다. 없으면 1회로 취급.
// 1. "N회" 뒤에 텍스트가 있으면 뒤로 이동 (예: "20회 한정가" → base + " 한정가", n="20")
// 2. 끝에만 N회가 있으면 분리 (예: "20회" → base, n="20")
// 3. 괄호 안에 N회가 있고 안전하면 분리해서 뒤로 이동
// 4. 여러 회차가 섞여있으면 안전상 그대로 두기
function splitCountSuffix(name: string): { base: string; n: string } {
  // "base N회 suffix" 패턴 (N회 뒤에 다른 텍스트가 있는 경우)
  const middleMatch = name.match(/^(.+?)\s+(\d+)\s*회(?:\s+(.+))?$/);
  if (middleMatch && middleMatch[3]) {
    const base = middleMatch[1];
    const n = middleMatch[2];
    const suffix = middleMatch[3];
    return {
      base: `${base} ${suffix}`.replace(/\s+/g, " ").trim(),
      n,
    };
  }

  const endMatch = name.match(/(\d+)\s*회\s*$/);
  if (endMatch) {
    return {
      base: name.slice(0, endMatch.index).replace(/\s+/g, " ").trim(),
      n: endMatch[1],
    };
  }

  const parenMatch = name.match(/^(.*?)\(([^()]*?(\d+)\s*회[^()]*?)\)(.*)$/);
  if (parenMatch) {
    const [, before, insideParen, , after] = parenMatch;
    const counts = insideParen.match(/(\d+)\s*회/g) ?? [];
    const countValues = counts.map((c) => {
      const m = c.match(/(\d+)/);
      return m ? m[1] : "";
    }).filter((c) => c);
    const uniqueCounts = new Set(countValues);

    if (counts.length === 1 || (counts.length > 0 && uniqueCounts.size === 1)) {
      const countVal = countValues[0];
      const cleanedParen = insideParen.replace(/\s*\d+\s*회\s*/, "").trim();
      const base = `${before.trim()}(${cleanedParen})${after}`.replace(/\s+/g, " ").trim();
      return { base, n: countVal };
    }
  }

  return { base: name.replace(/\s+/g, " ").trim(), n: "1" };
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
        style={{ width: 24, border: "none", padding: 0, textAlign: "center", fontSize: 14, outline: "none", background: "transparent" }}
      />
      <div className="flex flex-col leading-none gap-0">
        <button onClick={() => onChange(count + 1)} style={{ fontSize: 7, color: "#a89f9a", padding: "1px 0", lineHeight: 1 }} aria-label="증가">▲</button>
        <button onClick={() => onChange(Math.max(1, count - 1))} style={{ fontSize: 7, color: "#a89f9a", padding: "1px 0", lineHeight: 1 }} aria-label="감소">▼</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap:    { display: "flex", flexDirection: "column", minHeight: "100vh", background: C.bg, color: C.primary, fontFamily: "Pretendard, -apple-system, sans-serif" },
  header:  { background: C.surface, padding: "14px 0", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(111,104,100,0.06)" },
  headerInner: { maxWidth: MAX_WIDTH, margin: "0 auto", padding: "0 20px", boxSizing: "border-box" as const, display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo:    { display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 19, color: C.primary },
  btnPrimary: { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnGhost:   { background: "transparent", color: C.sub, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  main:    { maxWidth: MAX_WIDTH, margin: "0 auto", width: "100%", padding: "24px 20px", display: "grid", gridTemplateColumns: "1fr", gap: 16 },
  card:    { background: C.surface, borderRadius: 14, padding: "20px 22px" },
  cardTitle: { fontSize: 15, fontWeight: 700, color: C.sub, marginBottom: 14, letterSpacing: "0.04em" },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 34, marginBottom: 14 },
  input:   { width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", background: "#fff", color: C.primary, boxSizing: "border-box" as const },
  hint:    { fontSize: 12, color: C.sub, marginTop: 6 },
  candidateBox: { position: "absolute" as const, zIndex: 20, marginTop: 4, width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(111,104,100,0.10)", overflow: "hidden" },
  candidateRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", fontSize: 14, cursor: "pointer", borderBottom: `1px solid ${C.borderSoft}` },
  tableHead: { display: "flex", alignItems: "center", gap: 4, borderBottom: `1px solid ${C.border}`, padding: "8px 0", fontSize: 12, color: C.sub, marginBottom: 4 },
  tableRow:  { display: "flex", alignItems: "center", gap: 4, borderBottom: `1px solid ${C.borderSoft}`, padding: "8px 0", fontSize: 14 },
  totalRow:  { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 8, fontWeight: 700, fontSize: 15 },
  textarea:  { width: "100%", resize: "none" as const, border: "none", borderRadius: 10, background: C.bg, padding: "12px 14px", fontSize: 14, color: C.primary, outline: "none", lineHeight: 1.8, boxSizing: "border-box" as const },
  subSection: { display: "flex", flexDirection: "column" as const, gap: 6, border: `1px solid ${C.primaryLt}`, borderRadius: 10, padding: "14px 16px", background: "#fdfcfb" },
  label:  { fontSize: 14, fontWeight: 600, color: C.primary, textAlign: "right" as const, minWidth: 88, flexShrink: 0 },
  numInput: { width: 120, border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 10px", fontSize: 14, textAlign: "right" as const, outline: "none", background: "#fff", color: C.primary },
  divider: { borderTop: `1px dashed ${C.border}`, margin: "2px 0" },
  dividerSolid: { borderTop: `2px solid ${C.primaryLt}`, margin: "2px 0" },
};

export default function Home() {
  const [branch, setBranch] = useState("");
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
  const [discountPercent, setDiscountPercent] = useState<0 | 5 | 10>(0);
  const [discountMenuOpen, setDiscountMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [panelCopied, setPanelCopied] = useState(false);
  const [includeHeader, setIncludeHeader] = useState(false);
  const [membershipType, setMembershipType] = useState<"VIP" | "쁘띠">("VIP");
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [transferRecipients, setTransferRecipients] = useState<TransferRecipient[]>([]);
  const [openTransferPanelId, setOpenTransferPanelId] = useState<string | null>(null);
  // 양도자(회원권 보유 고객, A) 이름은 여러 양도차트에서 하나로 통일해서 써야 하므로
  // 팝업마다 따로 두지 않고 여기서 한 곳에서만 관리한다.
  const [giverName, setGiverName] = useState("");
  const [giverBirthdate, setGiverBirthdate] = useState("");
  const [showGiverPrompt, setShowGiverPrompt] = useState(false);
  const [giverPromptInput, setGiverPromptInput] = useState("");
  const [giverPromptBirthdate, setGiverPromptBirthdate] = useState("");
  const [showSearchTip, setShowSearchTip] = useState(false);
  const [showChartTip, setShowChartTip] = useState(false);
  const [showClearTip, setShowClearTip] = useState(false);
  const [showBoosterTip, setShowBoosterTip] = useState(false);
  const [panelDiscountMenuOpen, setPanelDiscountMenuOpen] = useState(false);

  // 지점 변경 확인/진행 상태 팝업. confirm(변경할지 물어보는 중) -> loading(불러오는 중)
  // -> done(완료 표시 후 자동 닫힘) 순서로 진행된다.
  const [branchSwitch, setBranchSwitch] = useState<{ target: string; phase: "confirm" | "loading" | "done" } | null>(null);
  // 지점 변경을 취소했을 때 BranchPicker 내부에 이미 그려진 입력값을 원래
  // 지점명으로 되돌리기 위해 key를 바꿔 강제로 다시 마운트시키는 용도.
  const [branchPickerResetKey, setBranchPickerResetKey] = useState(0);

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

  async function applyBranchChange(target: string) {
    setBranchSwitch({ target, phase: "loading" });
    setBranch(target);
    setInputValue("");
    setHighlightedIndex(0);
    setSelectedItems([]);
    localStorage.setItem(BRANCH_STORAGE_KEY, target);
    await loadTreatments(target);
    setBranchSwitch({ target, phase: "done" });
    setTimeout(() => setBranchSwitch(null), 1200);
  }

  function handleBranchChange(next: string) {
    if (!next || next === branch) return;
    // 아직 지점이 선택되지 않은 최초 선택은 "변경"이 아니므로 바로 적용한다.
    if (!branch) {
      applyBranchChange(next);
      return;
    }
    setBranchSwitch({ target: next, phase: "confirm" });
  }

  function confirmBranchSwitch() {
    if (!branchSwitch) return;
    applyBranchChange(branchSwitch.target);
  }

  function cancelBranchSwitch() {
    setBranchSwitch(null);
    setBranchPickerResetKey((k) => k + 1);
  }


  const matcher = useMemo(() => buildMatcher(treatments, aliases), [treatments, aliases]);
  const candidates = useMemo(() => (inputValue.trim().length >= 2 ? matcher(inputValue, 20) : []), [inputValue, matcher]);

  function selectCandidate(candidate: Treatment) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSelectedItems((prev) => [...prev, { id, name: candidate.name, basePrice: candidate.price, count: 1, unused: false, displayed: true, category: candidate.category }]);
    setInputValue(""); setHighlightedIndex(0);
  }

  // 부스터 조합 팝업: "리쥬란HB 6cc"처럼 입력하면, 검색된 후보 중 "동일 시술명(섹션)"인
  // 것들끼리만 묶어서 목표 cc를 채우는 조합을 가격 오름차순으로 보여준다. 섹션이 다르면
  // (예: 리쥬란힐러 vs 리쥬란스킨부스터 vs 리쥬란HB플러스) 절대 서로 섞이지 않는다.
  const [boosterOpen, setBoosterOpen] = useState(false);
  const [boosterQuery, setBoosterQuery] = useState("");
  const boosterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!boosterOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (boosterRef.current && !boosterRef.current.contains(e.target as Node)) setBoosterOpen(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [boosterOpen]);
  const boosterRequest = useMemo(() => {
    const m = boosterQuery.match(/^(.+?)\s*(\d+(?:\.\d+)?)\s*cc\s*$/i);
    if (!m) return null;
    const baseQuery = m[1].trim();
    const target = Number(m[2]);
    if (baseQuery.length < 2 || !(target > 0)) return null;
    return { baseQuery, target };
  }, [boosterQuery]);
  const boosterCombos = useMemo(() => {
    if (!boosterRequest) return [];
    // 매칭 상위 30개만 보면 같은 시술명의 다른 변형(예: 무할인 1cc 1회)이 순위 밖으로
    // 밀려 조합 후보에서 아예 빠질 수 있어, 넉넉히 크게 가져온다.
    const matched = matcher(boosterRequest.baseQuery, 200);
    if (matched.length === 0) return [];
    // 정규화된 이름(cc/한정가·체험가/회차 제거)이 정확하게 같은 시술만 조합한다.
    // 예: "리쥬란힐러 4cc" 검색 시 "아이리쥬란힐러", "리쥬란HB플러스" 등은 제외.
    const anchorName = matched[0].name;
    const anchorBaseName = deriveBaseName(anchorName);
    const sameFamily = matched.filter((t) => deriveBaseName(t.name) === anchorBaseName);
    return findCcCombos(boosterRequest.target, sameFamily, 15);
  }, [boosterRequest, matcher]);
  function selectBoosterCombo(combo: CcCombo) {
    const target = boosterRequest?.target ?? 0;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSelectedItems((prev) => [
      ...prev,
      {
        id,
        name: mergedComboName(combo, target),
        basePrice: combo.totalPrice,
        count: 1,
        unused: false,
        displayed: true,
        category: combo.items[0]?.treatment.category,
      },
    ]);
    setBoosterQuery("");
    setBoosterOpen(false);
  }
  function removeItem(id: string) { setSelectedItems((prev) => prev.filter((i) => i.id !== id)); }

  function makeEmptyRecipient(): TransferRecipient {
    return {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: "",
      amount: "0",
      panelDiscountPercent: 0,
      panelItems: [],
      panelInput: "",
      panelHighlightedIndex: 0,
      panelManualName: "",
      panelManualPrice: "",
      panelManualCategory: null,
      panelEditableText: "",
    };
  }
  // "양도" 토글을 켜면 바로 팝업이 뜨도록, 동행인이 없으면 하나 만들어서 연다.
  // 단, 양도자(A) 이름이 아직 없으면 그것부터 먼저 물어봐서 여러 양도차트에
  // 항상 같은 양도자 이름이 쓰이도록 한다.
  function handleToggleTransfer() {
    const turningOn = !transferEnabled;
    setTransferEnabled(turningOn);
    if (!turningOn) { setOpenTransferPanelId(null); return; }
    if (!giverName.trim()) {
      setGiverPromptInput("");
      setGiverPromptBirthdate("");
      setShowGiverPrompt(true);
      return;
    }
    openFirstOrNewRecipientPanel();
  }
  function openFirstOrNewRecipientPanel() {
    if (transferRecipients.length === 0) {
      const recipient = makeEmptyRecipient();
      setTransferRecipients([recipient]);
      setOpenTransferPanelId(recipient.id);
    } else {
      setOpenTransferPanelId(transferRecipients[0].id);
    }
  }
  function confirmGiverPrompt() {
    if (!giverPromptInput.trim() || !giverPromptBirthdate.trim()) return;
    setGiverName(giverPromptInput.trim());
    setGiverBirthdate(giverPromptBirthdate.trim());
    setShowGiverPrompt(false);
    openFirstOrNewRecipientPanel();
  }
  function addTransferRecipient() {
    if (!giverName.trim()) {
      setGiverPromptInput("");
      setGiverPromptBirthdate("");
      setShowGiverPrompt(true);
      return;
    }
    const recipient = makeEmptyRecipient();
    setTransferRecipients((prev) => [...prev, recipient]);
    setOpenTransferPanelId(recipient.id);
  }
  function updateTransferRecipient(id: string, patch: Partial<TransferRecipient>) {
    setTransferRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeTransferRecipient(id: string) {
    setTransferRecipients((prev) => prev.filter((r) => r.id !== id));
    setOpenTransferPanelId((cur) => (cur === id ? null : cur));
  }
  function panelRecalcTotal(items: SelectedItem[]) {
    return items.filter((i) => i.displayed).reduce((sum, i) => sum + computeUnitPrice(i), 0);
  }
  function panelSelectCandidate(id: string, candidate: Treatment) {
    setTransferRecipients((prev) => prev.map((r) => {
      if (r.id !== id || r.panelItems === null) return r;
      const newItem: SelectedItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: candidate.name,
        basePrice: candidate.price,
        count: 1,
        unused: false,
        displayed: true,
        category: candidate.category,
      };
      const items = [...r.panelItems, newItem];
      return { ...r, panelItems: items, amount: String(panelRecalcTotal(items)), panelInput: "", panelHighlightedIndex: 0 };
    }));
  }
  function panelAddManualItem(id: string) {
    setTransferRecipients((prev) => prev.map((r) => {
      if (r.id !== id || r.panelItems === null) return r;
      const price = Number(r.panelManualPrice);
      if (!r.panelManualName.trim() || !price || price <= 0) return r;
      const newItem: SelectedItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: r.panelManualName.trim(),
        basePrice: price,
        count: 1,
        unused: false,
        displayed: true,
        category: r.panelManualCategory ?? undefined,
      };
      const items = [...r.panelItems, newItem];
      return { ...r, panelItems: items, amount: String(panelRecalcTotal(items)), panelManualName: "", panelManualPrice: "", panelManualCategory: null };
    }));
  }
  function panelRemoveItem(id: string, itemId: string) {
    setTransferRecipients((prev) => prev.map((r) => {
      if (r.id !== id || r.panelItems === null) return r;
      const items = r.panelItems.filter((it) => it.id !== itemId);
      return { ...r, panelItems: items, amount: String(panelRecalcTotal(items)) };
    }));
  }
  function panelUpdateCount(id: string, itemId: string, count: number) {
    setTransferRecipients((prev) => prev.map((r) => {
      if (r.id !== id || r.panelItems === null) return r;
      const items = r.panelItems.map((it) => (it.id === itemId ? { ...it, count: Math.max(1, count || 1) } : it));
      return { ...r, panelItems: items, amount: String(panelRecalcTotal(items)) };
    }));
  }
  function panelUpdateItemName(id: string, itemId: string, name: string) {
    setTransferRecipients((prev) => prev.map((r) => {
      if (r.id !== id || r.panelItems === null) return r;
      const items = r.panelItems.map((it) => (it.id === itemId ? { ...it, name } : it));
      return { ...r, panelItems: items };
    }));
  }
  function panelToggleDisplayed(id: string, itemId: string) {
    setTransferRecipients((prev) => prev.map((r) => {
      if (r.id !== id || r.panelItems === null) return r;
      const items = r.panelItems.map((it) => (it.id === itemId ? { ...it, displayed: !it.displayed } : it));
      return { ...r, panelItems: items, amount: String(panelRecalcTotal(items)) };
    }));
  }
  function panelToggleUnused(id: string, itemId: string) {
    setTransferRecipients((prev) => prev.map((r) => {
      if (r.id !== id || r.panelItems === null) return r;
      const items = r.panelItems.map((it) => (it.id === itemId ? { ...it, unused: !it.unused } : it));
      return { ...r, panelItems: items };
    }));
  }
  // 양도인/양수인 이름은 유지한 채 팝업 안의 시술 내역만 초기화한다.
  function panelClearChart(id: string) {
    setTransferRecipients((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      return {
        ...r,
        amount: "0",
        panelDiscountPercent: 0,
        panelItems: [],
        panelInput: "",
        panelHighlightedIndex: 0,
        panelManualName: "",
        panelManualPrice: "",
        panelManualCategory: null,
        panelEditableText: "",
      };
    }));
  }
  // 실장 이름(staffName)은 새로고침 전까지 유지하는 값이라 여기서 건드리지 않는다.
  function clearAllItems() {
    setSelectedItems([]);
    setCreditInput("");
    setExtraCreditInput("");
    setExistingBalanceInput("");
    setTransferRecipients([]);
    setOpenTransferPanelId(null);
    setGiverName("");
    setGiverBirthdate("");
    setTransferEnabled(false);
    setIncludeHeader(false);
    setMembershipType("VIP");
    setDiscountPercent(0);
    setDiscountMenuOpen(false);
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
    if (e.key === "Escape") {
      e.preventDefault();
      setInputValue("");
      setHighlightedIndex(0);
      return;
    }
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
  const discountedTotal = discountPercent > 0 ? Math.round(totalPrice * (1 - discountPercent / 100)) : totalPrice;
  const discountLabel = discountPercent === 10 ? "3인 동반" : discountPercent === 5 ? "2인 동반" : "";
  const totalCreditWon = paymentAmount + extraCredit + existingBalance;
  const balance = totalCreditWon - discountedTotal - transferAmount;
  const RED_DOT = " 🔸";
  const headerVisible = includeHeader && paymentAmount > 0 && extraCredit > 0;

  // 동행인 팝업 안에서 보여줄 미니 차트 텍스트 (시술 목록 + TOTAL + 양도받음 문구)
  function buildPanelText(items: SelectedItem[], giverName: string, giverBirthdate: string, discount: 0 | 5 | 10 = 0): string {
    const displayedItems = items.filter((i) => i.displayed);
    const normalItems = displayedItems.filter((i) => !i.unused);
    const unusedItems = displayedItems.filter((i) => i.unused);
    const itemLines = normalItems.map((i) => {
      const { base, n } = splitCountSuffix(i.name);
      const dot = i.count !== 1 ? RED_DOT : "";
      return `${base} ${n}-1  ${formatNumber(computeUnitPrice(i))}원${dot}`;
    });
    const unusedLines = unusedItems.length > 0
      ? ["=".repeat(20), ...unusedItems.map((i) => {
          const { base, n } = splitCountSuffix(i.name);
          const displayName = base.replace(/\s+/g, " ").trim();
          const dot = i.count !== 1 ? RED_DOT : "";
          const countDisplay = n === "1" ? " 1회" : ` ${n}회`;
          return `${displayName}${countDisplay} ${formatNumber(computeUnitPrice(i))}원${dot} *미시술`;
        })]
      : [];
    const subtotal = panelRecalcTotal(items);
    const total = discount > 0 ? Math.round(subtotal * (1 - discount / 100)) : subtotal;
    const discountLabel = discount === 10 ? "3인 동반" : discount === 5 ? "2인 동반" : "";
    const totalLine = displayedItems.length > 0 && (displayedItems.length > 1 || discount > 0)
      ? [discount > 0
          ? `총 ${formatNumber(subtotal)}원 → ${discountLabel} ${discount}% OFF ${formatNumber(total)}원`
          : `총 ${formatNumber(total)}원`]
      : [];
    const birthdateFormatted = giverBirthdate.trim()
      ? `${giverBirthdate.slice(0, 2)}.${giverBirthdate.slice(2, 4)}.${giverBirthdate.slice(4, 6)}`
      : "__.__.__ ";
    const bottomLine = `ㄴ ${giverName.trim() || "___"}(${birthdateFormatted})님께 총 ${formatNumber(total)}원 양도받음`;
    return [...itemLines, ...unusedLines, ...totalLine, bottomLine].join("\n");
  }

  const openPanelRecipient = transferRecipients.find((r) => r.id === openTransferPanelId) ?? null;
  const panelGeneratedText = useMemo(() => {
    if (!openPanelRecipient || openPanelRecipient.panelItems === null) return "";
    return buildPanelText(openPanelRecipient.panelItems, giverName, giverBirthdate, openPanelRecipient.panelDiscountPercent);
  }, [openPanelRecipient, giverName, giverBirthdate]);

  useEffect(() => {
    if (openTransferPanelId && panelGeneratedText) {
      updateTransferRecipient(openTransferPanelId, { panelEditableText: panelGeneratedText });
    }
  }, [panelGeneratedText, openTransferPanelId]);

  useEffect(() => {
    if (!openTransferPanelId) setPanelDiscountMenuOpen(false);
  }, [openTransferPanelId]);

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
      // 제모 시술 중 "구독권"이 포함된 이름은 예외 규칙: 만료일을 "구독권" 옆에 붙이고,
      // 최초 차팅일이므로 회차는 항상 "1회차 1-1"로 고정한다.
      if (i.name.includes("제모") && i.name.includes("구독권")) {
        const base2 = base.replace("구독권", `구독권(~${subscriptionExpiryYYMMDD()})`);
        return `${base2} 1회차 1-1  ${formatNumber(computeUnitPrice(i))}원${dot}`;
      }
      return `${base} ${n}-1  ${formatNumber(computeUnitPrice(i))}원${dot}`;
    });
    // 미시술 체크된 시술은 원래 이름 그대로, 맨 마지막 구분선 아래에 표시한다.
    const unusedLines = unusedItems.length > 0
      ? ["=".repeat(20), ...unusedItems.map((i) => {
          const { base, n } = splitCountSuffix(i.name);
          const displayName = base.replace(/\s+/g, " ").trim();
          const dot = i.count !== 1 ? RED_DOT : "";
          const countDisplay = n === "1" ? " 1회" : ` ${n}회`;
          return `${displayName}${countDisplay} ${formatNumber(computeUnitPrice(i))}원${dot} *미시술`;
        })]
      : [];
    const totalLine = selectedItems.length > 1 || discountPercent > 0
      ? [discountPercent > 0
          ? `총 ${formatNumber(totalPrice)}원 → ${discountLabel} ${discountPercent}% OFF ${formatNumber(discountedTotal)}원`
          : `총 ${formatNumber(totalPrice)}원`]
      : [];
    // A(메인페이지)의 차트에는 B의 시술 내역이 섞이지 않도록, 여기서는 요약 한 줄만 남긴다.
    // B의 시술 내역 + 총액은 팝업 안의 별도 차트(panelEditableText)로만 존재하고, 병원 시스템에는 따로 붙여넣는다.
    const transferLine = includeHeader && transferEnabled && transferRecipients.length > 0
      ? transferRecipients.map((r) => `+${r.name.trim() || "___"}님께 ${formatNumber(Number(r.amount) || 0)}원 양도함`)
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
  }, [headerVisible, includeHeader, membershipType, staffName, paymentAmount, extraCredit, selectedItems, totalPrice, discountPercent, discountedTotal, discountLabel, existingBalance, transferEnabled, transferAmount, transferRecipients, balance]);

  const [editableText, setEditableText] = useState("");
  const prevFinalTextRef = useRef("");
  useEffect(() => {
    // StrictMode(dev)는 setState 업데이터 함수를 두 번 호출한다. 업데이터 안에서 ref를 직접 건드리면
    // 두 번째 호출이 이미 바뀐 ref를 읽어버려 통째로 "삽입된 줄"로 오인해 중복된다.
    // 그래서 oldGen을 미리 상수로 고정해 업데이터를 순수 함수로 만든다.
    const oldGen = prevFinalTextRef.current;
    setEditableText((prev) => mergeGeneratedText(oldGen, prev, finalText));
    prevFinalTextRef.current = finalText;
  }, [finalText]);

  async function handleCopy() {
    const cleaned = editableText.split(RED_DOT).join("");
    await navigator.clipboard.writeText(cleaned);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  async function handlePanelCopy(text: string) {
    const cleaned = text.split(RED_DOT).join("");
    await navigator.clipboard.writeText(cleaned);
    setPanelCopied(true); setTimeout(() => setPanelCopied(false), 1500);
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
            <BranchPicker key={`${branch}-${branchPickerResetKey}`} value={branch} onChange={handleBranchChange} />
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

      {branchSwitch && (
        <div
          onClick={() => { if (branchSwitch.phase === "confirm") cancelBranchSwitch(); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 700,
            display: "flex",
            justifyContent: "center",
            paddingTop: 90,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              height: "fit-content",
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(40,36,34,0.18)",
              padding: "16px 22px",
              minWidth: 260,
              textAlign: "center",
            }}
          >
            {branchSwitch.phase === "confirm" && (
              <>
                <p style={{ fontSize: 15, color: C.primary, marginBottom: 14 }}>
                  지점을 {branchSwitch.target}으로 변경할까요?
                </p>
                <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                  <button onClick={cancelBranchSwitch} style={styles.btnGhost}>아니오</button>
                  <button onClick={confirmBranchSwitch} style={styles.btnPrimary}>예</button>
                </div>
              </>
            )}
            {branchSwitch.phase === "loading" && (
              <p style={{ fontSize: 15, color: C.primary }}>
                {branchSwitch.target} 시술을 불러오는 중입니다...
              </p>
            )}
            {branchSwitch.phase === "done" && (
              <p style={{ fontSize: 15, color: C.primary }}>
                연동이 완료되었습니다.
              </p>
            )}
          </div>
        </div>
      )}

      {!branch && (
        <p style={{ maxWidth: MAX_WIDTH, margin: "12px auto 0", padding: "0 20px", fontSize: 14, color: C.primary }}>
          상단에서 지점을 선택해주세요.
        </p>
      )}
      {loadError && <p style={{ maxWidth: MAX_WIDTH, margin: "8px auto 0", padding: "0 20px", fontSize: 13, color: C.danger }}>시술 데이터를 불러오지 못했습니다: {loadError}</p>}

      {/* 메인 그리드 */}
      <main style={styles.main}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 5}}>

          {/* ── 좌: 시술 입력 ── */}
          <div style={{ ...styles.card, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.08)" }}>
            <div style={styles.titleRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
                <p style={{ ...styles.cardTitle, marginBottom: 0 }}>시술 검색</p>
                <button
                  onMouseEnter={() => setShowSearchTip(true)}
                  onMouseLeave={() => setShowSearchTip(false)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    borderRadius: 16,
                    fontSize: 12,
                    color: C.sub,
                    cursor: "help",
                    fontWeight: 600,
                    padding: "2px 6px",
                    marginLeft: 4,
                    height: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  TIP!
                </button>
                {showSearchTip && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "100%",
                      marginLeft: 8,
                      width: "max-content",
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 12,
                      color: C.primary,
                      lineHeight: 1.5,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                      zIndex: 50,
                      whiteSpace: "nowrap",
                    }}
                  >
                    "온다 6만", "얼전 스보 제오민", "겨제 5회" 같이 편하게 입력해도 검색됩니다.
                  </div>
                )}
              </div>
            </div>

            <div ref={boosterRef} style={{ display: "flex", gap: 6, alignItems: "flex-start", position: "relative" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); setHighlightedIndex(0); }}
                onKeyDown={handleKeyDown}
                onBlur={() => { setInputValue(""); setHighlightedIndex(0); }}
                placeholder="예: 슈링크 300샷 한정가"
                style={{ ...styles.input, height: 36, boxSizing: "border-box" }}
              />
              {candidates.length > 0 && (
                <div style={styles.candidateBox}>
                  {candidates.map((c, idx) => (
                    <button
                      key={c.name}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onMouseDown={(e) => { e.preventDefault(); selectCandidate(c); }}
                      style={{
                        ...styles.candidateRow,
                        background: idx === highlightedIndex ? C.primaryLt : C.surface,
                        color: idx === highlightedIndex ? C.primary : "#555",
                        fontWeight: idx === highlightedIndex ? 700 : 400,
                        width: "100%", border: "none", textAlign: "left",
                      }}
                    >
                      <span style={{ flex: 1, whiteSpace: "normal", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{c.name}</span>
                      <span style={{ marginLeft: 12, flexShrink: 0, fontVariantNumeric: "tabular-nums", color: C.sub }}>{formatNumber(c.price)}원</span>
                    </button>
                  ))}
                </div>
              )}
              </div>
              <div
                style={{ position: "relative" }}
                onMouseEnter={() => setShowBoosterTip(true)}
                onMouseLeave={() => setShowBoosterTip(false)}
              >
                <button
                  onClick={() => setBoosterOpen((v) => !v)}
                  style={{
                    background: boosterOpen ? C.primaryLt : C.borderSoft,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontSize: 13,
                    color: C.primary,
                    cursor: "pointer",
                    fontWeight: 600,
                    padding: "0 12px",
                    height: 36,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  부스터
                </button>
                {showBoosterTip && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      right: 0,
                      marginBottom: 6,
                      width: "max-content",
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "5px 8px",
                      fontSize: 12,
                      fontWeight: 500,
                      color: C.primary,
                      lineHeight: 1.3,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                      zIndex: 50,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {"리쥬란 같이 CC별 수가를 조합해 목표 용량을 만들 때\n최저가~최고가 조합을 확인할 수 있어요."}
                  </div>
                )}
              </div>
              {boosterOpen && (
                <div onClick={() => setBoosterOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 40 }} />
              )}
              {boosterOpen && (
                <div
                  style={{
                    position: "fixed",
                    top: "20%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 500,
                    maxHeight: "60vh",
                    overflowY: "auto",
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 13,
                    color: C.primary,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                    zIndex: 50,
                  }}
                >
                  <input
                    type="text"
                    value={boosterQuery}
                    onChange={(e) => setBoosterQuery(e.target.value)}
                    placeholder="예: 리쥬란HB 6cc"
                    autoFocus
                    style={{ ...styles.input, height: 34, boxSizing: "border-box", width: "100%" }}
                  />
                  <p style={{ ...styles.hint, marginTop: 6, marginBottom: 0, whiteSpace: "pre-line", textAlign: "center" }}>
                    <span style={{ color: C.danger }}>부스터 시술명과 용량을 입력하면 여러 조합 중 선택할 수 있습니다. (예: 리쥬란힐러 6cc)</span>
                    {"\n* 체험가 또는 한정가는 중복으로 조합하지 않습니다.\n* 체험가 또는 한정가 적용이 가능한지 미리 체크해 주세요."}
                  </p>
                  {boosterRequest && boosterCombos.length === 0 && (
                    <p style={{ ...styles.hint, marginTop: 8, marginBottom: 0, color: C.danger }}>조합을 만들 수 있는 시술을 찾지 못했습니다.</p>
                  )}
                  {boosterCombos.length > 0 && (
                    <div style={{ marginTop: 8, maxHeight: 350, overflowY: "auto" }}>
                      {boosterCombos.map((combo, idx) => {
                        const label = formatComboLabel(combo);
                        return (
                          <div key={label}>
                            <button
                              onClick={() => selectBoosterCombo(combo)}
                              style={{
                                ...styles.candidateRow,
                                width: "100%", textAlign: "left",
                                background: C.surface,
                                color: "#555",
                                alignItems: "flex-start",
                                fontSize: 12,
                                border: "none",
                                paddingBottom: 6,
                                paddingTop: 6,
                              }}
                            >
                              <span style={{ flex: 1, whiteSpace: "normal", wordBreak: "keep-all", lineHeight: 1.4 }}>{label}</span>
                              <span style={{ marginLeft: 12, flexShrink: 0, fontVariantNumeric: "tabular-nums", color: C.sub }}>{formatNumber(combo.totalPrice)}원</span>
                            </button>
                            {idx < boosterCombos.length - 1 && (
                              <div style={{
                                height: "1px",
                                borderTop: "1px dashed #ccc",
                                margin: "3px 0",
                                background: "transparent"
                              }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <p style={{ ...styles.hint, whiteSpace: "pre-line" }}>{"키보드 방향키 + Enter로 추가하거나 마우스로 선택 가능해요.\n수량을 변경하는 경우 우측에 생성된 차트도 수정해주세요."}</p>

            {/* 직접 입력 */}
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="시술 직접 입력 (예: 얼굴 CO2 5개)" className="manual-input-sm" style={{ ...styles.input, flex: 2, minWidth: 0, height: 36, boxSizing: "border-box" }} />
              <input type="text" value={manualPrice ? Number(manualPrice).toLocaleString() : ""} onChange={(e) => setManualPrice(e.target.value.replace(/[^0-9]/g, ''))} placeholder="세전 금액" className="manual-input-sm" style={{ ...styles.input, flex: "0 0 76px", minWidth: 0, height: 36, boxSizing: "border-box" }} />
              <Dropdown
                value={manualCategory ?? ""}
                onChange={(v) => setManualCategory(v ? (v as TreatmentCategory) : null)}
                placeholder="카테고리"
                options={CATEGORY_ORDER.map((cat) => ({ value: cat, label: cat }))}
                style={{ flex: "0 0 116px", height: 36 }}
              />
              <button onClick={addManualItem} disabled={!manualName.trim() || !manualPrice}
                style={{ ...styles.btnPrimary, height: 36, boxSizing: "border-box", padding: "0 8px", fontSize: 14, opacity: (!manualName.trim() || !manualPrice) ? 0.4 : 1, flexShrink: 0 }}>
                추가
              </button>
            </div>

            {/* 시술 목록 */}
            <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}` }}>
              {selectedItems.length === 0 ? (
                <p style={{ ...styles.hint, textAlign: "center", padding: "20px 0" }}>추가된 시술이 없습니다</p>
              ) : (
                <>
                  <div style={styles.tableHead}>
                    <span style={{ width: 16 }} />
                    <span style={{ width: 13 }} />
                    <span style={{ flex: 1, textAlign: "center" }}>시술명</span>
                    <span style={{ width: 60, textAlign: "center" }}>단가</span>
                    <span style={{ width: 50, textAlign: "center" }}>수량</span>
                    <span style={{ width: 80, textAlign: "center" }}>합계</span>
                    <div style={{ width: 24, display: "flex", justifyContent: "center" }}>
                      <span style={{ whiteSpace: "nowrap" }}>미시술</span>
                    </div>
                  </div>
                  {selectedItems.map((item) => (
                    <div key={item.id} style={styles.tableRow}>
                      <div style={{ width: 16, display: "flex", justifyContent: "center" }}>
                        <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, displayed: !i.displayed } : i)));
                        }}
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: "50%",
                          border: `1px solid ${C.primary}`,
                          background: "transparent",
                          color: C.primary,
                          fontSize: 10,
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
                        style={{ flex: 1, minWidth: 120, border: `1px solid transparent`, borderRadius: 6, padding: "2px 4px", background: "transparent", fontSize: 14, color: C.primary, lineHeight: 1.5 } as React.CSSProperties}
                      />
                      <span style={{ width: 60, textAlign: "center", fontVariantNumeric: "tabular-nums", color: C.primary, fontSize: 14 }}>{formatNumber(item.basePrice)}</span>
                      <div style={{ width: 50, display: "flex", justifyContent: "center" }}>
                        <CountDial count={item.count} onChange={(count) => updateItemCount(item.id, count)} />
                      </div>
                      <span style={{ width: 80, textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: 14 }}>{formatNumber(computeUnitPrice(item))}</span>
                      <div style={{ width: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <input
                          type="checkbox"
                          checked={item.unused}
                          onChange={() => {
                            setSelectedItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, unused: !i.unused } : i)));
                          }}
                          style={{ accentColor: C.primary, cursor: "pointer" }}
                          aria-label="미시술"
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {selectedItems.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 8, gap: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>TOTAL</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 14, fontWeight: 700, color: C.primary }}>{formatNumber(totalPrice)}원</span>
              </div>
            )}

            {selectedItems.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6, position: "relative" }}>
                <button
                  onClick={() => setDiscountMenuOpen((v) => !v)}
                  style={{ ...styles.btnGhost, fontSize: 11, padding: "4px 8px", color: C.primary, fontWeight: 700 }}
                >
                  {discountPercent > 0 ? `할인적용 (${discountPercent}%)` : "할인적용"}
                </button>
                {discountMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 4,
                      zIndex: 20,
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(111,104,100,0.10)",
                      display: "flex",
                      gap: 4,
                      padding: 6,
                    }}
                  >
                    {([5, 10] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setDiscountPercent(discountPercent === p ? 0 : p);
                          setDiscountMenuOpen(false);
                        }}
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          background: discountPercent === p ? C.primaryLt : "transparent",
                          color: C.primary,
                          cursor: "pointer",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {p}%
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setDiscountPercent(0);
                        setDiscountMenuOpen(false);
                      }}
                      style={{
                        padding: "4px 8px",
                        fontSize: 11,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        background: "transparent",
                        color: C.sub,
                        cursor: "pointer",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      해제
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 우: 선택 결과 ── */}
          <div style={{ ...styles.card, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.08)" }}>
            <div style={styles.titleRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
                <p style={{ ...styles.cardTitle, marginBottom: 0 }}>차트 생성</p>
                <button
                  onMouseEnter={() => setShowChartTip(true)}
                  onMouseLeave={() => setShowChartTip(false)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    borderRadius: 16,
                    fontSize: 12,
                    color: C.sub,
                    cursor: "help",
                    fontWeight: 600,
                    padding: "2px 6px",
                    marginLeft: 4,
                    height: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  TIP!
                </button>
                {showChartTip && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      marginTop: 6,
                      width: 280,
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "6px 8px",
                      fontSize: 12,
                      color: C.primary,
                      lineHeight: 1.4,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                      zIndex: 50,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {"시술을 검색하거나 직접 추가한 다음\n부위, 총 용량, 고객 요청 등을 추가 수정할 수 있습니다."}
                  </div>
                )}
              </div>
              <div
                style={{ position: "relative" }}
                onMouseEnter={() => setShowClearTip(true)}
                onMouseLeave={() => setShowClearTip(false)}
              >
                <button onClick={clearAllItems} disabled={selectedItems.length === 0}
                  style={{ ...styles.btnGhost, fontSize: 11, padding: "4px 8px", color: C.primary, fontWeight: 700, boxShadow: "0 2px 4px rgba(0,0,0,0.1)", opacity: selectedItems.length === 0 ? 0.4 : 1 }}>
                  CLEAR
                </button>
                {showClearTip && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      right: 0,
                      marginBottom: 6,
                      width: "max-content",
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "5px 8px",
                      fontSize: 11,
                      color: C.primary,
                      lineHeight: 1.3,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                      zIndex: 50,
                      whiteSpace: "nowrap",
                    }}
                  >
                    CLEAR 버튼을 눌러도 상담실장 이름은 유지됩니다.
                  </div>
                )}
              </div>
            </div>

            <AutoGrowInput
              value={editableText}
              onChange={setEditableText}
              style={{ ...styles.textarea, minHeight: 220 }}
            />

            <button onClick={handleCopy} disabled={selectedItems.length === 0}
              style={{ ...styles.btnPrimary, width: "100%", marginTop: 10, height: 36, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", opacity: selectedItems.length === 0 ? 0.4 : 1 }}>
              {copied ? "복사됨 ✓" : "최종 차트 복사"}
            </button>

            {/* 회원권 / 양도 토글 */}
            <div style={{ display: "flex", gap: 6, marginTop: 12, background: C.borderSoft, borderRadius: 10, padding: 6, height: 36 }}>
              {(["회원권", "양도"] as const).map((label, idx) => {
                const checked = label === "회원권" ? includeHeader : transferEnabled;
                const toggle = label === "회원권" ? () => setIncludeHeader((v) => !v) : handleToggleTransfer;
                return (
                  <div key={label} style={{ flex: 1, display: "flex", alignItems: "center" }}>
                    {idx > 0 && <div style={{ width: "1px", height: "20px", background: "rgba(0,0,0,0.08)", opacity: checked ? 0 : 1, transition: "opacity 0.2s ease" }} />}
                    <button onClick={toggle} style={{ flex: 1, padding: "0 18px", border: "none", borderRadius: checked ? 6 : 0, fontSize: 14, fontWeight: 600, cursor: "pointer", background: checked ? "#fff" : "transparent", color: checked ? C.primary : C.sub, transition: "all 0.2s ease", boxShadow: checked ? "0 2px 4px rgba(0,0,0,0.1)" : "none", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {label}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 회원권 상세 */}
            {includeHeader && (
              <div style={{ ...styles.subSection, marginTop: 12 }}>
                {/* 담당자 + 멤버십 */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: C.sub, fontSize: 14 }}>상담실장 :</span>
                    <input
                      type="text"
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      maxLength={4}
                      placeholder="이름"
                      style={{
                        width: 36,
                        border: "none",
                        borderBottom: `1px solid ${C.border}`,
                        borderRadius: 0,
                        padding: "2px 0",
                        fontSize: 14,
                        textAlign: "center",
                        outline: "none",
                        background: "transparent",
                        color: C.primary,
                      }}
                    />
                    <span style={{ color: C.sub, fontSize: 14 }}>S</span>
                  </div>
                  {(["VIP", "쁘띠"] as const).map((t) => (
                    <label key={t} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, cursor: "pointer", fontWeight: membershipType === t ? 700 : 400, color: membershipType === t ? C.primary : C.sub }}>
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
                              fontSize: 12,
                              flex: 1,
                              minWidth: 0,
                              whiteSpace: "nowrap",
                              border: `1px solid ${isSelected ? C.primaryLt : C.borderSoft}`,
                              borderRadius: 8,
                              background: isSelected ? C.primaryLt : "#fff",
                              color: isSelected ? C.primary : C.sub,
                              fontWeight: isSelected ? 700 : 500,
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
                              fontSize: 12,
                              flex: 1,
                              minWidth: 0,
                              whiteSpace: "nowrap",
                              border: `1px solid ${isSelected ? C.primaryLt : C.borderSoft}`,
                              borderRadius: 8,
                              background: isSelected ? C.primaryLt : "#fff",
                              color: isSelected ? C.primary : C.sub,
                              fontWeight: isSelected ? 700 : 500,
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
                            fontSize: 12,
                            flex: 1,
                            minWidth: 0,
                            whiteSpace: "nowrap",
                            border: `1px solid ${isSelected ? C.primaryLt : C.borderSoft}`,
                            borderRadius: 8,
                            background: isSelected ? C.primaryLt : "#fff",
                            color: isSelected ? C.primary : C.sub,
                            fontWeight: isSelected ? 700 : 500,
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
                    <input type="text" value={val ? Number(val).toLocaleString() : ""} onChange={(e) => set(e.target.value.replace(/[^0-9]/g, ''))} style={styles.numInput} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.primary, width: 20, textAlign: "left" }}>원</span>
                  </div>
                ))}

                <div style={styles.divider} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.primary, textAlign: "right", minWidth: 88, flexShrink: 0 }}>− TOTAL</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", width: 120, textAlign: "right", fontSize: 14, fontWeight: 700, color: C.primary }}>{formatNumber(discountedTotal)}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.primary, width: 20, textAlign: "left" }}>원</span>
                </div>

                {transferEnabled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.primary }}>양도</span>
                      {transferRecipients.length < 5 && (
                        <button onClick={addTransferRecipient}
                          style={{ ...styles.btnGhost, fontSize: 11, padding: "4px 8px", color: C.primary, fontWeight: 700 }}>
                          양도차트 추가
                        </button>
                      )}
                    </div>
                    {transferRecipients.map((recipient) => (
                      <div key={recipient.id} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                        <button onClick={() => setOpenTransferPanelId(recipient.id)}
                          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, border: "none", background: "transparent", color: C.sub, fontWeight: 500, fontSize: 14, cursor: "pointer", padding: "4px 0", textDecoration: "underline", textDecorationColor: "rgba(0,0,0,0.1)" }}>
                          <span>{recipient.name || "OOO"}님께</span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(Number(recipient.amount) || 0)}원</span>
                          <span>양도함</span>
                        </button>
                        <button onClick={() => removeTransferRecipient(recipient.id)}
                          style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 15 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={styles.dividerSolid} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.primary, textAlign: "right", minWidth: 88, flexShrink: 0 }}>잔액</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", width: 120, textAlign: "right", fontSize: 14, fontWeight: 700, color: C.primary }}>{formatNumber(balance)}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.primary, width: 20, textAlign: "left" }}>원</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {showGiverPrompt && (
        <div
          onClick={() => setShowGiverPrompt(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(360px, 92vw)", background: C.surface, borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.35)", padding: 22 }}
          >
            <p style={{ fontSize: 17, fontWeight: 700, color: C.primary, marginBottom: 6 }}>회원권 보유 고객(양도인)</p>
            <p style={{ fontSize: 13, color: C.sub, marginBottom: 14, lineHeight: 1.5 }}>
              회원권을 보유한 고객(양도인) 이름과 생년월일(6자리)을 입력해주세요.
            </p>
            <input
              type="text"
              autoFocus
              value={giverPromptInput}
              onChange={(e) => setGiverPromptInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmGiverPrompt(); }}
              placeholder="양도인 이름"
              style={{ ...styles.input, marginBottom: 10 }}
            />
            <input
              type="text"
              value={giverPromptBirthdate}
              onChange={(e) => setGiverPromptBirthdate(e.target.value.slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") confirmGiverPrompt(); }}
              placeholder="생년월일 (예: 950101)"
              maxLength={6}
              style={styles.input}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowGiverPrompt(false)} style={styles.btnGhost}>취소</button>
              <button onClick={confirmGiverPrompt} disabled={!giverPromptInput.trim() || !giverPromptBirthdate.trim()}
                style={{ ...styles.btnPrimary, opacity: (!giverPromptInput.trim() || !giverPromptBirthdate.trim()) ? 0.4 : 1 }}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {openTransferPanelId && (() => {
        const panelRecipient = transferRecipients.find((r) => r.id === openTransferPanelId);
        if (!panelRecipient || panelRecipient.panelItems === null) return null;
        const panelIndex = transferRecipients.findIndex((r) => r.id === openTransferPanelId);
        const items = panelRecipient.panelItems;
        const panelCandidates = panelRecipient.panelInput.trim().length >= 2 ? matcher(panelRecipient.panelInput, 20) : [];
        const panelTotal = panelRecalcTotal(items);
        return (
          <div
            onClick={() => setOpenTransferPanelId(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: "min(1000px, 96vw)", overflowY: "auto", background: C.bg, borderRadius: 18, boxShadow: "0 24px 64px rgba(0,0,0,0.35)", padding: 24 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.primary }}>양도차트 {panelIndex + 1}</span>
                <button onClick={() => setOpenTransferPanelId(null)} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 24, lineHeight: 1 }}>×</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                {/* 좌: 시술 검색 */}
                <div style={styles.card}>
                  <p style={{ ...styles.cardTitle, marginBottom: 14 }}>시술 검색</p>

                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={panelRecipient.panelInput}
                      onChange={(e) => updateTransferRecipient(panelRecipient.id, { panelInput: e.target.value, panelHighlightedIndex: 0 })}
                      onKeyDown={(e) => {
                        if (panelCandidates.length === 0) return;
                        if (e.key === "ArrowDown") { e.preventDefault(); updateTransferRecipient(panelRecipient.id, { panelHighlightedIndex: Math.min(panelRecipient.panelHighlightedIndex + 1, panelCandidates.length - 1) }); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); updateTransferRecipient(panelRecipient.id, { panelHighlightedIndex: Math.max(panelRecipient.panelHighlightedIndex - 1, 0) }); }
                        else if (e.key === "Enter") { e.preventDefault(); panelSelectCandidate(panelRecipient.id, panelCandidates[panelRecipient.panelHighlightedIndex]); }
                      }}
                      placeholder="예: 슈링크 300샷 한정가"
                      style={styles.input}
                    />
                    {panelCandidates.length > 0 && (
                      <div style={styles.candidateBox}>
                        {panelCandidates.map((c, idx) => (
                          <button
                            key={c.name}
                            onMouseEnter={() => updateTransferRecipient(panelRecipient.id, { panelHighlightedIndex: idx })}
                            onClick={() => panelSelectCandidate(panelRecipient.id, c)}
                            style={{
                              ...styles.candidateRow,
                              background: idx === panelRecipient.panelHighlightedIndex ? C.primaryLt : C.surface,
                              color: idx === panelRecipient.panelHighlightedIndex ? C.primary : "#555",
                              fontWeight: idx === panelRecipient.panelHighlightedIndex ? 700 : 400,
                              width: "100%", border: "none", textAlign: "left",
                            }}
                          >
                            <span style={{ flex: 1, whiteSpace: "normal", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{c.name}</span>
                            <span style={{ marginLeft: 12, flexShrink: 0, fontVariantNumeric: "tabular-nums", color: C.sub }}>{formatNumber(c.price)}원</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <p style={{ ...styles.hint, whiteSpace: "pre-line" }}>{"키보드 방향키 + Enter로 추가하거나 마우스로 선택 가능해요.\n수량을 변경하는 경우 우측에 생성된 차트도 수정해주세요."}</p>

                  <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                    <input type="text" value={panelRecipient.panelManualName}
                      onChange={(e) => updateTransferRecipient(panelRecipient.id, { panelManualName: e.target.value })}
                      placeholder="시술 직접 입력 (예: 얼굴 CO2 5개)" className="manual-input-sm" style={{ ...styles.input, flex: 2, minWidth: 0, height: 36, boxSizing: "border-box" }} />
                    <input type="text" value={panelRecipient.panelManualPrice ? Number(panelRecipient.panelManualPrice).toLocaleString() : ""}
                      onChange={(e) => updateTransferRecipient(panelRecipient.id, { panelManualPrice: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="세전 금액" className="manual-input-sm" style={{ ...styles.input, flex: "0 0 76px", minWidth: 0, height: 36, boxSizing: "border-box" }} />
                    <Dropdown
                      value={panelRecipient.panelManualCategory ?? ""}
                      onChange={(v) => updateTransferRecipient(panelRecipient.id, { panelManualCategory: v ? (v as TreatmentCategory) : null })}
                      placeholder="카테고리"
                      options={CATEGORY_ORDER.map((cat) => ({ value: cat, label: cat }))}
                      style={{ flex: "0 0 116px", height: 36 }}
                    />
                    <button onClick={() => panelAddManualItem(panelRecipient.id)} disabled={!panelRecipient.panelManualName.trim() || !panelRecipient.panelManualPrice}
                      style={{ ...styles.btnPrimary, height: 36, boxSizing: "border-box", padding: "0 8px", fontSize: 14, opacity: (!panelRecipient.panelManualName.trim() || !panelRecipient.panelManualPrice) ? 0.4 : 1, flexShrink: 0 }}>
                      추가
                    </button>
                  </div>

                  <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                    {items.length === 0 ? (
                      <p style={{ ...styles.hint, textAlign: "center", padding: "20px 0" }}>추가된 시술이 없습니다</p>
                    ) : (
                      <>
                        <div style={styles.tableHead}>
                          <span style={{ width: 16 }} />
                          <span style={{ width: 20, textAlign: "center" }} />
                          <span style={{ flex: 1, textAlign: "center" }}>시술명</span>
                          <span style={{ width: 60, textAlign: "center" }}>단가</span>
                          <span style={{ width: 50, textAlign: "center" }}>수량</span>
                          <span style={{ width: 80, textAlign: "center" }}>합계</span>
                          <span style={{ width: 24, textAlign: "left", whiteSpace: "nowrap" }}>미시술</span>
                        </div>
                        {items.map((item) => (
                          <div key={item.id} style={styles.tableRow}>
                            <div style={{ width: 16, display: "flex", justifyContent: "center" }}>
                              <button onClick={() => panelRemoveItem(panelRecipient.id, item.id)} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                            </div>
                            <button
                              onClick={() => panelToggleDisplayed(panelRecipient.id, item.id)}
                              style={{
                                width: 13, height: 13, borderRadius: "50%", border: `1px solid ${C.primary}`,
                                background: "transparent", color: C.primary, fontSize: 10, fontWeight: "bold",
                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                              }}
                              aria-label="선택결과 표시"
                            >
                              {item.displayed ? "+" : "−"}
                            </button>
                            <AutoGrowInput
                              value={item.name}
                              onChange={(v) => panelUpdateItemName(panelRecipient.id, item.id, v)}
                              className=""
                              style={{ flex: 1, minWidth: 120, border: `1px solid transparent`, borderRadius: 6, padding: "2px 4px", background: "transparent", fontSize: 14, color: C.primary, lineHeight: 1.5 } as React.CSSProperties}
                            />
                            <span style={{ width: 60, textAlign: "center", fontVariantNumeric: "tabular-nums", color: C.primary, fontSize: 14 }}>{formatNumber(item.basePrice)}</span>
                            <div style={{ width: 50, display: "flex", justifyContent: "center" }}>
                              <CountDial count={item.count} onChange={(count) => panelUpdateCount(panelRecipient.id, item.id, count)} />
                            </div>
                            <span style={{ width: 80, textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: 14 }}>{formatNumber(computeUnitPrice(item))}</span>
                            <div style={{ width: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <input
                                type="checkbox"
                                checked={item.unused}
                                onChange={() => panelToggleUnused(panelRecipient.id, item.id)}
                                style={{ accentColor: C.primary, cursor: "pointer" }}
                                aria-label="미시술"
                              />
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  {items.length > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 8, gap: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>TOTAL</span>
                        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 14, fontWeight: 700, color: C.primary }}>
                          {panelRecipient.panelDiscountPercent > 0
                            ? `${formatNumber(panelTotal)}원 → ${panelRecipient.panelDiscountPercent}% OFF ${formatNumber(Math.round(panelTotal * (1 - panelRecipient.panelDiscountPercent / 100)))}원`
                            : `${formatNumber(panelTotal)}원`}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6, position: "relative" }}>
                        <button
                          onClick={() => setPanelDiscountMenuOpen((v) => !v)}
                          style={{ ...styles.btnGhost, fontSize: 11, padding: "4px 8px", color: C.primary, fontWeight: 700 }}
                        >
                          {panelRecipient.panelDiscountPercent > 0 ? `할인적용 (${panelRecipient.panelDiscountPercent}%)` : "할인적용"}
                        </button>
                        {panelDiscountMenuOpen && (
                          <div
                            style={{
                              position: "absolute",
                              top: "100%",
                              right: 0,
                              marginTop: 4,
                              zIndex: 20,
                              background: C.surface,
                              border: `1px solid ${C.border}`,
                              borderRadius: 8,
                              boxShadow: "0 8px 24px rgba(111,104,100,0.10)",
                              display: "flex",
                              gap: 4,
                              padding: 6,
                            }}
                          >
                            {([5, 10] as const).map((p) => (
                              <button
                                key={p}
                                onClick={() => {
                                  updateTransferRecipient(panelRecipient.id, { panelDiscountPercent: panelRecipient.panelDiscountPercent === p ? 0 : p });
                                  setPanelDiscountMenuOpen(false);
                                }}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  border: `1px solid ${C.border}`,
                                  borderRadius: 8,
                                  background: panelRecipient.panelDiscountPercent === p ? C.primaryLt : "transparent",
                                  color: C.primary,
                                  cursor: "pointer",
                                  fontWeight: 700,
                                  whiteSpace: "nowrap",
                                  flex: 1,
                                }}
                              >
                                {p}%
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                updateTransferRecipient(panelRecipient.id, { panelDiscountPercent: 0 });
                                setPanelDiscountMenuOpen(false);
                              }}
                              style={{
                                padding: "4px 8px",
                                fontSize: 11,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                background: "transparent",
                                color: C.sub,
                                cursor: "pointer",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                flex: 1,
                              }}
                            >
                              해제
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* 우: 차트 생성 */}
                <div style={styles.card}>
                  <div style={styles.titleRow}>
                    <p style={{ ...styles.cardTitle, marginBottom: 0 }}>차트 생성</p>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => panelClearChart(panelRecipient.id)}
                        style={{ ...styles.btnGhost, fontSize: 11, padding: "4px 8px", color: C.primary, fontWeight: 700 }}>
                        CLEAR
                      </button>
                    </div>
                  </div>
                  <AutoGrowInput
                    value={panelRecipient.panelEditableText}
                    onChange={(v) => updateTransferRecipient(panelRecipient.id, { panelEditableText: v })}
                    style={{ ...styles.textarea, minHeight: 160 }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.primary, flexShrink: 0, width: 50 }}>양도인 :</span>
                    <input
                      type="text"
                      value={giverName}
                      readOnly
                      disabled
                      style={{ ...styles.input, flex: 1, background: C.bg, color: C.sub, cursor: "not-allowed" }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.primary, flexShrink: 0, width: 50 }}>양수인 :</span>
                    <input
                      type="text"
                      value={panelRecipient.name}
                      onChange={(e) => updateTransferRecipient(panelRecipient.id, { name: e.target.value })}
                      placeholder="양수인 이름"
                      style={{ ...styles.input, flex: 1 }}
                    />
                  </div>
                  <button
                    onClick={async () => {
                      await handlePanelCopy(panelRecipient.panelEditableText);
                      setOpenTransferPanelId(null);
                    }}
                    style={{ ...styles.btnPrimary, width: "100%", marginTop: 16 }}
                  >
                    차트 복사 및 확인
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <footer style={{ display: "none" }}>
        2026. Designed & Developed by EUNBIN GA
      </footer>
    </div>
  );
}
