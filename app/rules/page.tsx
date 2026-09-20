"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/format";
import type { Alias, Treatment } from "@/lib/types";
import { TreatmentCategory } from "@/lib/types";
import { CATEGORY_ORDER } from "@/lib/categoryDetection";
import { C, MAX_WIDTH } from "@/lib/theme";
import { BRANCH_STORAGE_KEY } from "@/lib/branches";
import BranchPicker from "@/components/BranchPicker";
import Dropdown from "@/components/Dropdown";

function TabSearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: "relative", width: 100, flex: "0 0 auto" }}>
      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", flexShrink: 0 }}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="검색"
        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px 6px 26px", fontSize: 13, height: 32, outline: "none", background: "#fff", color: C.primary, boxSizing: "border-box" }}
      />
    </div>
  );
}

type Rule = {
  id: string;
  type: "exclude" | "replace";
  pattern: string;
  replacement: string | null;
  branch: string | null;
};

type ManualTreatment = {
  id: string;
  name: string;
  price: number;
  category: TreatmentCategory | null;
};

type ApplyResult = {
  updated: number;
  skipped: { id: string; oldName: string; newName: string }[];
  errors: { id: string; message: string }[];
};

type Tab = "exclude" | "replaceGlobal" | "alias" | "manual" | "category" | "branchRules";

const TABS: { key: Tab; label: string }[] = [
  { key: "category", label: "시술별 카테고리" },
  { key: "branchRules", label: "지점별 규칙" },
  { key: "manual", label: "지점별 시술 추가" },
  { key: "alias", label: "검색어 매칭" },
  { key: "exclude", label: "시술명 정리" },
  { key: "replaceGlobal", label: "시술명 치환" },
];

const SETUP_SQL = `create table cleanup_rules (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('exclude', 'replace')),
  pattern text not null,
  replacement text,
  created_at timestamptz not null default now()
);`;

/* ── 디자인 토큰 (메인 페이지와 공유) ── */
const styles: Record<string, React.CSSProperties> = {
  wrap:      { minHeight: "100vh", background: C.bg, color: C.primary, fontFamily: "Pretendard, -apple-system, sans-serif" },
  header:    { background: C.surface, padding: "14px 28px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(111,104,100,0.06)" },
  headerInner: { width: "100%", maxWidth: "none", margin: "0", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box" },
  title:     { fontSize: 19, fontWeight: 700, color: C.primary },
  logo:      { display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 19, color: C.primary },
  backLink:  { fontSize: 13, color: C.sub, textDecoration: "none" },
  tabBar:    { borderBottom: `1px solid ${C.border}`, background: C.primaryLt, width: "100%", position: "sticky" as const, top: "64px", zIndex: 50 },
  tabBarInner: { width: "100%", maxWidth: "none", margin: "0", display: "flex", gap: 4, padding: "0 28px", overflowX: "auto" as const, boxSizing: "border-box" },
  main:      { width: "100%", maxWidth: "none", margin: "0", padding: "24px 28px", boxSizing: "border-box" },
  card:      { background: C.surface, borderRadius: 14, padding: "20px 22px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.08)" },
  cardTitle: { fontSize: 18, fontWeight: 700, color: C.primary, marginBottom: 6, letterSpacing: "0.04em" },
  cardHint:  { fontSize: 14, color: C.primary, marginBottom: 14, lineHeight: 1.6 },
  input:     { flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", background: "#fff", color: C.primary, boxSizing: "border-box" as const },
  btnPrimary: { background: C.primary, color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 },
  btnGhost: { background: "transparent", color: C.sub, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  row:       { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  rowEdit:   { display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  linkBtn:   { background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 13, padding: 0 },
  list:      { display: "flex", flexDirection: "column" as const, gap: 6, maxHeight: "60vh", overflowY: "auto" as const },
  empty:     { fontSize: 13, color: C.sub },
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    fontSize: 15,
    fontWeight: 600,
    color: active ? C.primary : C.sub,
    background: active ? C.surface : "none",
    borderRadius: active ? "8px 8px 0 0" : 0,
    border: "none",
    borderBottom: active ? `2px solid ${C.primary}` : "2px solid transparent",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export default function RulesPage() {
  const [tab, setTab] = useState<Tab>("category");
  const [branch, setBranch] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((tb) => tb.key === t)) setTab(t);
    const saved = localStorage.getItem(BRANCH_STORAGE_KEY);
    if (saved) setBranch(saved);
  }, []);

  // 지점 변경 확인/진행 상태 팝업. confirm(변경할지 물어보는 중) -> loading(불러오는 중)
  // -> done(완료 표시 후 자동 닫힘) 순서로 진행된다.
  const [branchSwitch, setBranchSwitch] = useState<{ target: string; phase: "confirm" | "loading" | "done" } | null>(null);
  // 지점 변경을 취소했을 때 BranchPicker 내부에 이미 그려진 입력값을 원래
  // 지점명으로 되돌리기 위해 key를 바꿔 강제로 다시 마운트시키는 용도.
  const [branchPickerResetKey, setBranchPickerResetKey] = useState(0);

  async function applyBranchChange(target: string) {
    setBranchSwitch({ target, phase: "loading" });
    setBranch(target);
    localStorage.setItem(BRANCH_STORAGE_KEY, target);
    await Promise.all([loadManualTreatments(target), loadCategoryTreatments(target)]);
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

  const [rules, setRules] = useState<Rule[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const [newExclude, setNewExclude] = useState("");
  const [newBranchFind, setNewBranchFind] = useState("");
  const [newBranchReplacement, setNewBranchReplacement] = useState("");
  const [newGlobalReplaceFind, setNewGlobalReplaceFind] = useState("");
  const [newGlobalReplaceReplacement, setNewGlobalReplaceReplacement] = useState("");

  // 시술명 정리/검색어 매칭 탭에서 수정·삭제 버튼을 누르면 바로 실행하지 않고,
  // 그 줄 안에서 "수정할까요?/삭제할까요?"를 인라인으로 먼저 확인받는다.
  const [pendingRowAction, setPendingRowAction] = useState<{ scope: "exclude" | "alias" | "replaceGlobal"; id: string; type: "edit" | "delete" } | null>(null);
  function InlineConfirm({ scope, id, onConfirm }: { scope: "exclude" | "alias" | "replaceGlobal"; id: string; onConfirm: () => void }) {
    if (pendingRowAction?.scope !== scope || pendingRowAction.id !== id) return null;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.danger, whiteSpace: "nowrap" }}>
        {pendingRowAction.type === "edit" ? "수정할까요?" : "삭제할까요?"}
        <button
          onClick={() => { onConfirm(); setPendingRowAction(null); }}
          style={{ ...styles.linkBtn, fontSize: 12, color: C.danger, fontWeight: 700 }}
        >
          YES
        </button>
        <button onClick={() => setPendingRowAction(null)} style={{ ...styles.linkBtn, fontSize: 12, color: C.danger }}>NO</button>
      </span>
    );
  }

  // 수정/삭제 성공 시 카드 타이틀 옆에 잠깐 보여주는 인라인 완료 메시지.
  const [rowToast, setRowToast] = useState<string | null>(null);
  function showRowToast(message: string) {
    setRowToast(message);
    setTimeout(() => setRowToast(null), 1000);
  }
  function RowToast() {
    if (!rowToast) return null;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: C.primary, background: C.primaryLt, borderRadius: 12, padding: "3px 9px" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {rowToast}
      </span>
    );
  }

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editPattern, setEditPattern] = useState("");
  const [editReplacement, setEditReplacement] = useState("");

  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [branchApplying, setBranchApplying] = useState(false);
  const [branchApplyResult, setBranchApplyResult] = useState<ApplyResult | null>(null);
  const [branchApplyError, setBranchApplyError] = useState<string | null>(null);

  const [manualTreatments, setManualTreatments] = useState<ManualTreatment[]>([]);
  const [manualError, setManualError] = useState<string | null>(null);
  const [newManualName, setNewManualName] = useState("");
  const [newManualPrice, setNewManualPrice] = useState("");
  const [newManualCategory, setNewManualCategory] = useState<TreatmentCategory | null>(null);

  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const [editManualName, setEditManualName] = useState("");
  const [editManualPrice, setEditManualPrice] = useState("");
  const [editManualCategory, setEditManualCategory] = useState<TreatmentCategory | null>(null);

  const [categoryTreatments, setCategoryTreatments] = useState<Treatment[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<TreatmentCategory | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ scraped: number; saved: number } | null>(null);

  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [aliases, setAliases] = useState<Alias[]>([]);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [aliasSearch, setAliasSearch] = useState("");
  const [newAliasText, setNewAliasText] = useState("");
  const [newAliasKeyword, setNewAliasKeyword] = useState("");
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [editAliasText, setEditAliasText] = useState("");
  const [editAliasKeyword, setEditAliasKeyword] = useState("");

  const [excludeSearch, setExcludeSearch] = useState("");
  const [branchRulesSearch, setBranchRulesSearch] = useState("");
  const [globalReplaceSearch, setGlobalReplaceSearch] = useState("");
  const [manualSearch, setManualSearch] = useState("");

  function loadRules() {
    fetch("/api/rules")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setLoadError(data.error);
          setTableMissing(String(data.error).includes("cleanup_rules"));
        } else {
          setLoadError(null);
          setTableMissing(false);
          setRules(data.rules ?? []);
        }
      })
      .catch((e) => setLoadError(String(e)));
  }

  function loadManualTreatments(forBranch: string) {
    if (!forBranch) { setManualTreatments([]); return Promise.resolve(); }
    return fetch(`/api/manual-treatments?branch=${encodeURIComponent(forBranch)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setManualError(data.error);
        else {
          setManualError(null);
          setManualTreatments(data.treatments ?? []);
        }
      })
      .catch((e) => setManualError(String(e)));
  }

  function loadCategoryTreatments(forBranch: string) {
    if (!forBranch) { setCategoryTreatments([]); return Promise.resolve(); }
    return fetch(`/api/treatments?branch=${encodeURIComponent(forBranch)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setCategoryError(data.error);
        else {
          setCategoryError(null);
          setCategoryTreatments(data.treatments ?? []);
        }
      })
      .catch((e) => setCategoryError(String(e)));
  }

  function loadAliases() {
    fetch("/api/aliases")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setAliasError(data.error);
        else {
          setAliasError(null);
          setAliases(data.aliases ?? []);
        }
      })
      .catch((e) => setAliasError(String(e)));
  }

  useEffect(() => {
    loadRules();
    loadAliases();
  }, []);

  useEffect(() => {
    loadManualTreatments(branch);
    loadCategoryTreatments(branch);
  }, [branch]);

  useEffect(() => {
    if (tab === "category" && branch) loadCategoryTreatments(branch);
  }, [tab, branch]);

  async function addRule(type: "exclude" | "replace", pattern: string, replacement?: string, ruleBranch?: string) {
    if (!pattern.trim()) return;
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, pattern, replacement, branch: ruleBranch ?? null }),
    });
    const data = await res.json();
    if (data.error) {
      setLoadError(data.error);
      return;
    }
    setRules((prev) => [data.rule, ...prev]);
    showRowToast("추가 완료");
  }

  async function deleteRule(id: string) {
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== id));
    showRowToast("삭제 완료");
  }

  function startEditRule(rule: Rule) {
    setEditingRuleId(rule.id);
    setEditPattern(rule.pattern);
    setEditReplacement(rule.replacement ?? "");
  }

  function cancelEditRule() {
    setEditingRuleId(null);
    setEditPattern("");
    setEditReplacement("");
  }

  async function saveEditRule(rule: Rule) {
    const res = await fetch(`/api/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: rule.type,
        pattern: editPattern,
        replacement: editReplacement,
      }),
    });
    const data = await res.json();
    if (data.error) {
      setLoadError(data.error);
      return;
    }
    setRules((prev) => prev.map((r) => (r.id === rule.id ? data.rule : r)));
    cancelEditRule();
    showRowToast("수정 완료");
  }

  async function handleApply() {
    setApplying(true);
    setApplyResult(null);
    setApplyError(null);
    try {
      const res = await fetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.error) {
        setApplyError(data.error);
      } else {
        setApplyResult(data);
        if (branch) loadCategoryTreatments(branch);
      }
    } catch (e) {
      setApplyError(String(e));
    } finally {
      setApplying(false);
    }
  }

  async function handleApplyBranch() {
    if (!branch) return;
    setBranchApplying(true);
    setBranchApplyResult(null);
    setBranchApplyError(null);
    try {
      const res = await fetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      const data = await res.json();
      if (data.error) {
        setBranchApplyError(data.error);
      } else {
        setBranchApplyResult(data);
        loadCategoryTreatments(branch);
      }
    } catch (e) {
      setBranchApplyError(String(e));
    } finally {
      setBranchApplying(false);
    }
  }

  async function addManualTreatment() {
    if (!branch || !newManualName.trim() || !newManualPrice) return;
    const res = await fetch("/api/manual-treatments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch, name: newManualName, price: Number(newManualPrice), category: newManualCategory }),
    });
    const data = await res.json();
    if (data.error) {
      setManualError(data.error);
      return;
    }
    setManualTreatments((prev) => [...prev, data.treatment]);
    setNewManualName("");
    setNewManualPrice("");
    setNewManualCategory(null);
    showRowToast("추가 완료");
  }

  function startEditManual(t: ManualTreatment) {
    setEditingManualId(t.id);
    setEditManualName(t.name);
    setEditManualPrice(String(t.price));
    setEditManualCategory(t.category ?? null);
  }

  function cancelEditManual() {
    setEditingManualId(null);
    setEditManualName("");
    setEditManualPrice("");
    setEditManualCategory(null);
  }

  async function saveEditManual(id: string) {
    const res = await fetch(`/api/manual-treatments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editManualName, price: Number(editManualPrice), category: editManualCategory }),
    });
    const data = await res.json();
    if (data.error) {
      setManualError(data.error);
      return;
    }
    setManualTreatments((prev) => prev.map((t) => (t.id === id ? data.treatment : t)));
    cancelEditManual();
    showRowToast("수정 완료");
  }

  async function deleteManualTreatment(id: string) {
    await fetch(`/api/manual-treatments/${id}`, { method: "DELETE" });
    setManualTreatments((prev) => prev.filter((t) => t.id !== id));
    showRowToast("삭제 완료");
  }

  async function runSync() {
    if (!branch) return;
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      const data = await res.json();
      if (data.error) {
        setSyncError(data.error);
      } else {
        setSyncResult(data);
        loadCategoryTreatments(branch);
      }
    } catch (e) {
      setSyncError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  function handleSync() {
    if (!branch) return;
    setConfirmModal({
      message: "매일 오전 9시마다 홈페이지 시술 정보가 연동됩니다.\n가격 변동이 확인되어 재연동이 필요할 때만 눌러주세요.",
      confirmLabel: "확인 후 연동",
      onConfirm: runSync,
    });
  }

  async function runReset() {
    if (!branch) return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/treatments?branch=${encodeURIComponent(branch)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) {
        setResetError(data.error);
      } else {
        loadCategoryTreatments(branch);
      }
    } catch (e) {
      setResetError(String(e));
    } finally {
      setResetting(false);
    }
  }

  function handleReset() {
    if (!branch) return;
    setConfirmModal({
      message: "홈페이지에서 연동된 시술을 모두 삭제합니다.\n직접 추가한 시술은 유지됩니다. 데이터를 리셋할까요?",
      confirmLabel: "확인 후 삭제",
      danger: true,
      onConfirm: runReset,
    });
  }

  async function updateCategory(id: string, category: TreatmentCategory) {
    const res = await fetch("/api/treatments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category }),
    });
    const data = await res.json();
    if (data.error) {
      setCategoryError(data.error);
      return false;
    }
    setCategoryTreatments((prev) => prev.map((t) => (t.id === id ? { ...t, category } : t)));
    return true;
  }

  async function bulkMoveCategory() {
    if (selectedForBulk.size === 0 || !bulkCategory) return;

    for (const id of selectedForBulk) {
      await updateCategory(id, bulkCategory);
    }
    setSelectedForBulk(new Set());
    setBulkCategory(null);
  }

  async function addAlias() {
    if (!newAliasText.trim() || !newAliasKeyword.trim()) return;
    const res = await fetch("/api/aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias: newAliasText, keyword: newAliasKeyword }),
    });
    const data = await res.json();
    if (data.error) {
      setAliasError(data.error);
      return;
    }
    setAliases((prev) => [data.alias, ...prev]);
    setNewAliasText("");
    setNewAliasKeyword("");
    showRowToast("추가 완료");
  }

  function startEditAlias(a: Alias) {
    setEditingAliasId(a.id);
    setEditAliasText(a.alias);
    setEditAliasKeyword(a.keyword);
  }

  function cancelEditAlias() {
    setEditingAliasId(null);
    setEditAliasText("");
    setEditAliasKeyword("");
  }

  async function saveEditAlias(id: string) {
    const res = await fetch(`/api/aliases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias: editAliasText, keyword: editAliasKeyword }),
    });
    const data = await res.json();
    if (data.error) {
      setAliasError(data.error);
      return;
    }
    setAliases((prev) => prev.map((a) => (a.id === id ? data.alias : a)));
    cancelEditAlias();
    showRowToast("수정 완료");
  }

  async function deleteAlias(id: string) {
    await fetch(`/api/aliases/${id}`, { method: "DELETE" });
    setAliases((prev) => prev.filter((a) => a.id !== id));
    showRowToast("삭제 완료");
  }

  const excludeRules = rules.filter((r) => r.type === "exclude");
  const branchRules = rules.filter((r) => r.type === "replace" && r.branch === branch);
  const globalReplaceRules = rules.filter((r) => r.type === "replace" && !r.branch);

  const applySection = (
    <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={handleApply}
          disabled={applying}
          style={{ ...styles.btnPrimary, opacity: applying ? 0.6 : 1 }}
        >
          {applying ? "적용 중..." : "전지점 데이터에 적용"}
        </button>
        {applyResult && <span style={{ fontSize: 14, color: C.primary }}>업데이트: {applyResult.updated}건</span>}
      </div>

      {applyError && <p style={{ marginTop: 10, fontSize: 14, color: C.danger }}>에러: {applyError}</p>}

      {applyResult && applyResult.errors.length > 0 && (
        <p style={{ marginTop: 10, fontSize: 14, color: C.danger }}>에러: {applyResult.errors.length}건</p>
      )}
    </div>
  );

  const branchApplySection = (
    <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={handleApplyBranch}
          disabled={branchApplying || !branch}
          style={{ ...styles.btnPrimary, opacity: branchApplying || !branch ? 0.6 : 1 }}
        >
          {branchApplying ? "적용 중..." : `${branch || "지점"} 데이터에 적용`}
        </button>
        {branchApplyResult && <span style={{ fontSize: 14, color: C.primary }}>업데이트: {branchApplyResult.updated}건</span>}
      </div>

      {branchApplyError && <p style={{ marginTop: 10, fontSize: 14, color: C.danger }}>에러: {branchApplyError}</p>}

      {branchApplyResult && branchApplyResult.errors.length > 0 && (
        <p style={{ marginTop: 10, fontSize: 14, color: C.danger }}>에러: {branchApplyResult.errors.length}건</p>
      )}
    </div>
  );

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: C.primary, textDecoration: "none" }}>
              <img src="/logo.png" alt="차팅 서포트" style={{ height: 36, width: "auto" }} />
              <span style={{ fontWeight: 700 }}>차팅 서포트</span>
            </Link>
            <span style={{ color: C.sub, fontWeight: 400, fontSize: 18.5 }}>&gt;</span>
            <span style={{ fontWeight: 500, color: C.sub, fontSize: 18.5 }}>상세설정</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BranchPicker key={`${branch}-${branchPickerResetKey}`} value={branch} onChange={handleBranchChange} />
            <Link
              href="/"
              style={{ ...styles.btnGhost, fontSize: 12, padding: "6px 10px", textDecoration: "none", display: "inline-block" }}
            >
              메인으로
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

      {loadError && (
        <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto", padding: "16px 20px 0" }}>
          <p style={{ fontSize: 14, color: C.danger }}>에러: {loadError}</p>
          {tableMissing && (
            <div style={{ marginTop: 8, borderRadius: 10, border: `1px solid ${C.danger}`, background: "#fdf1ef", padding: 12 }}>
              <p style={{ fontSize: 14, color: C.danger }}>
                cleanup_rules 테이블이 아직 없습니다. Supabase 대시보드 → SQL Editor에서
                아래 SQL을 한 번 실행한 뒤 이 페이지를 새로고침하세요.
              </p>
              <pre style={{ marginTop: 8, overflowX: "auto", borderRadius: 8, background: "#fff", padding: 8, fontSize: 12, color: C.primary }}>
                {SETUP_SQL}
              </pre>
            </div>
          )}
        </div>
      )}

      <div style={styles.tabBar}>
        <div style={styles.tabBarInner}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={tabButtonStyle(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main
        style={
          tab === "category"
            ? styles.main
            : { ...styles.main, maxWidth: 760, margin: "0" }
        }
      >
        {tab === "exclude" && (
          <section style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p style={{ ...styles.cardTitle, marginBottom: 0 }}>시술명 정리</p>
                <RowToast />
              </div>
              <TabSearchInput value={excludeSearch} onChange={setExcludeSearch} />
            </div>
            <p style={styles.cardHint}>
              차팅에 불필요한 홈페이지 시술명 속 괄호 부분(장비, 제품, 시술 설명)을 삭제해 줍니다.
              <br />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.danger }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M12 3.5 L22 20.5 H2 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <line x1="12" y1="10" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="18" r="1.1" fill="currentColor" />
                </svg>
                모든 지점의 검색 결과에 적용되므로 신중한 추가/수정/삭제가 필요합니다.
              </span>
            </p>

            {applySection}

            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
              <input
                type="text"
                value={newExclude}
                onChange={(e) => setNewExclude(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addRule("exclude", newExclude);
                    setNewExclude("");
                  }
                }}
                placeholder="예: (고농도 히알루론산)"
                style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
              />
              <button
                onClick={() => {
                  addRule("exclude", newExclude);
                  setNewExclude("");
                }}
                style={{ ...styles.btnPrimary, height: 34 }}
              >
                추가
              </button>
            </div>

            <div style={styles.list}>
              {excludeRules.length === 0 && <p style={styles.empty}>등록된 제외 문구가 없습니다.</p>}
              {excludeRules.filter((r) => r.pattern.includes(excludeSearch)).map((r) =>
                editingRuleId === r.id ? (
                  <div key={r.id} style={styles.rowEdit}>
                    <input
                      type="text"
                      value={editPattern}
                      onChange={(e) => setEditPattern(e.target.value)}
                      style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
                    />
                    <button onClick={() => saveEditRule(r)} style={{ ...styles.linkBtn, color: C.primary }}>저장</button>
                    <button onClick={cancelEditRule} style={styles.linkBtn}>취소</button>
                  </div>
                ) : (
                  <div key={r.id} style={styles.row}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.pattern}</span>
                    <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 10 }}>
                      {pendingRowAction?.scope === "exclude" && pendingRowAction.id === r.id ? (
                        <InlineConfirm
                          scope="exclude"
                          id={r.id}
                          onConfirm={() => (pendingRowAction.type === "edit" ? startEditRule(r) : deleteRule(r.id))}
                        />
                      ) : (
                        <>
                          <button onClick={() => setPendingRowAction({ scope: "exclude", id: r.id, type: "edit" })} style={styles.linkBtn}>수정</button>
                          <button onClick={() => setPendingRowAction({ scope: "exclude", id: r.id, type: "delete" })} style={styles.linkBtn}>삭제</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "replaceGlobal" && (
          <section style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p style={{ ...styles.cardTitle, marginBottom: 0 }}>시술명 치환</p>
                <RowToast />
              </div>
              <TabSearchInput value={globalReplaceSearch} onChange={setGlobalReplaceSearch} />
            </div>
            <p style={styles.cardHint}>
              간결하고 깔끔한 시술명 검색과 차팅을 위해 홈페이지의 시술명과 치환할 시술명을 입력해 주세요.
              <br />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.danger }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M12 3.5 L22 20.5 H2 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <line x1="12" y1="10" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="18" r="1.1" fill="currentColor" />
                </svg>
                모든 지점의 검색 결과에 적용되므로 신중한 추가/수정/삭제가 필요합니다.
              </span>
            </p>

            {applySection}

            <div style={{ display: "flex", gap: 8, fontSize: 13, color: C.sub, fontWeight: 500 }}>
              <div style={{ flex: 1, textAlign: "center" as const }}>홈페이지 시술명</div>
              <div style={{ flexShrink: 0, width: 24 }} />
              <div style={{ flex: 1, textAlign: "center" as const }}>차팅용(검색용) 시술명</div>
              <div style={{ flexShrink: 0, width: 60 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, marginBottom: 12, alignItems: "center" }}>
              <input
                type="text"
                value={newGlobalReplaceFind}
                onChange={(e) => setNewGlobalReplaceFind(e.target.value)}
                placeholder="예: 써마지 FLX 리프팅"
                style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, flexShrink: 0, width: 24, fontSize: 13 }}>→</div>
              <input
                type="text"
                value={newGlobalReplaceReplacement}
                onChange={(e) => setNewGlobalReplaceReplacement(e.target.value)}
                placeholder="예: 써마지"
                style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
              />
              <button
                onClick={() => {
                  addRule("replace", newGlobalReplaceFind, newGlobalReplaceReplacement);
                  setNewGlobalReplaceFind("");
                  setNewGlobalReplaceReplacement("");
                }}
                style={{ ...styles.btnPrimary, height: 34 }}
              >
                추가
              </button>
            </div>

            <div style={styles.list}>
              {globalReplaceRules.length === 0 && <p style={styles.empty}>등록된 치환 규칙이 없습니다.</p>}
              {globalReplaceRules.filter((r) => r.pattern.includes(globalReplaceSearch) || (r.replacement?.includes(globalReplaceSearch) ?? false)).map((r) =>
                editingRuleId === r.id ? (
                  <div key={r.id} style={styles.rowEdit}>
                    <input
                      type="text"
                      value={editPattern}
                      onChange={(e) => setEditPattern(e.target.value)}
                      style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
                    />
                    <input
                      type="text"
                      value={editReplacement}
                      onChange={(e) => setEditReplacement(e.target.value)}
                      style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
                    />
                    <button onClick={() => saveEditRule(r)} style={{ ...styles.linkBtn, color: C.primary }}>저장</button>
                    <button onClick={cancelEditRule} style={styles.linkBtn}>취소</button>
                  </div>
                ) : (
                  <div key={r.id} style={styles.row}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.pattern} → {r.replacement}
                    </span>
                    <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 10 }}>
                      {pendingRowAction?.scope === "replaceGlobal" && pendingRowAction.id === r.id ? (
                        <InlineConfirm
                          scope="replaceGlobal"
                          id={r.id}
                          onConfirm={() => (pendingRowAction.type === "edit" ? startEditRule(r) : deleteRule(r.id))}
                        />
                      ) : (
                        <>
                          <button onClick={() => setPendingRowAction({ scope: "replaceGlobal", id: r.id, type: "edit" })} style={styles.linkBtn}>수정</button>
                          <button onClick={() => setPendingRowAction({ scope: "replaceGlobal", id: r.id, type: "delete" })} style={styles.linkBtn}>삭제</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "alias" && (
          <section style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p style={{ ...styles.cardTitle, marginBottom: 0 }}>검색어 매칭</p>
                <RowToast />
              </div>
              <TabSearchInput value={aliasSearch} onChange={setAliasSearch} />
            </div>
            <p style={styles.cardHint}>
              자주 쓰는 시술 줄임말, 오타, 별칭 등을 입력해 홈페이지에 등록된 정식 시술명으로 검색되도록 키워드를 매칭해 주세요.
              <br />
              (줄임말 예: 스보 → 스킨보톡스)
              <br />
              (오타 예: 울쎼라 → 울쎄라)
              <br />
              (한글 입력 예: 포마 → FORMA)
              <br />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.danger }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M12 3.5 L22 20.5 H2 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <line x1="12" y1="10" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="18" r="1.1" fill="currentColor" />
                </svg>
                모든 지점의 검색 결과에 적용되므로 신중한 추가/수정/삭제가 필요합니다.
              </span>
            </p>

            {aliasError && <p style={{ marginBottom: 8, fontSize: 14, color: C.danger }}>에러: {aliasError}</p>}

            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
              <input
                type="text"
                value={newAliasText}
                onChange={(e) => setNewAliasText(e.target.value)}
                placeholder="축약어/오타 (예: 포마)"
                style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
              />
              <span style={{ color: C.sub, fontSize: 13 }}>→</span>
              <input
                type="text"
                value={newAliasKeyword}
                onChange={(e) => setNewAliasKeyword(e.target.value)}
                placeholder="실제 검색 키워드 (예: FORMA)"
                style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
              />
              <button
                onClick={addAlias}
                disabled={!newAliasText.trim() || !newAliasKeyword.trim()}
                style={{ ...styles.btnPrimary, height: 34, opacity: !newAliasText.trim() || !newAliasKeyword.trim() ? 0.4 : 1 }}
              >
                추가
              </button>
            </div>

            <div style={styles.list}>
              {aliases.length === 0 && <p style={styles.empty}>등록된 축약어가 없습니다.</p>}
              {aliases.filter((a) => a.alias.includes(aliasSearch) || a.keyword.includes(aliasSearch)).map((a) =>
                editingAliasId === a.id ? (
                  <div key={a.id} style={styles.rowEdit}>
                    <input
                      type="text"
                      value={editAliasText}
                      onChange={(e) => setEditAliasText(e.target.value)}
                      style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
                    />
                    <span style={{ color: C.sub, fontSize: 13 }}>→</span>
                    <input
                      type="text"
                      value={editAliasKeyword}
                      onChange={(e) => setEditAliasKeyword(e.target.value)}
                      style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
                    />
                    <button onClick={() => saveEditAlias(a.id)} style={{ ...styles.linkBtn, color: C.primary }}>저장</button>
                    <button onClick={cancelEditAlias} style={styles.linkBtn}>취소</button>
                  </div>
                ) : (
                  <div key={a.id} style={styles.row}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.alias} → {a.keyword}
                    </span>
                    <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 10 }}>
                      {pendingRowAction?.scope === "alias" && pendingRowAction.id === a.id ? (
                        <InlineConfirm
                          scope="alias"
                          id={a.id}
                          onConfirm={() => (pendingRowAction.type === "edit" ? startEditAlias(a) : deleteAlias(a.id))}
                        />
                      ) : (
                        <>
                          <button onClick={() => setPendingRowAction({ scope: "alias", id: a.id, type: "edit" })} style={styles.linkBtn}>수정</button>
                          <button onClick={() => setPendingRowAction({ scope: "alias", id: a.id, type: "delete" })} style={styles.linkBtn}>삭제</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "branchRules" && (
          <section style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p style={{ ...styles.cardTitle, marginBottom: 0 }}>지점별 규칙</p>
                <RowToast />
              </div>
              <TabSearchInput value={branchRulesSearch} onChange={setBranchRulesSearch} />
            </div>
            <p style={styles.cardHint}>
              {branch || "우리 지점"}만의 시술명 치환 규칙을 등록해 주세요.
              <br />
              <span style={{ color: C.danger }}>*규칙을 등록한 다음 "{branch || "우리 지점"} 데이터에 적용" 버튼을 꼭 눌러 주세요.</span>
              <br />
              예1) 국산 고순도 → 코어
              <br />
              예2) 저통증 멀티석션 인젝터 → 하이쿡스
              <br />
              예3) 이중턱 개선 주사 → 브이올렛
              <br />
              예4) 물방울 리프팅 → LDM
            </p>

            {branchApplySection}

            {!branch && <p style={{ marginBottom: 8, fontSize: 14, color: C.sub }}>상단에서 지점을 먼저 선택하세요.</p>}
            {loadError && <p style={{ marginBottom: 8, fontSize: 14, color: C.danger }}>에러: {loadError}</p>}

            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              <div style={{ display: "flex", gap: 8, fontSize: 13, color: C.sub, fontWeight: 500 }}>
                <div style={{ flex: 1, textAlign: "center" as const }}>홈페이지 시술명</div>
                <div style={{ flexShrink: 0, width: 24 }} />
                <div style={{ flex: 1, textAlign: "center" as const }}>차팅용(검색용) 시술명</div>
                <div style={{ flexShrink: 0, width: 60 }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  value={newBranchFind}
                  onChange={(e) => setNewBranchFind(e.target.value)}
                  placeholder="예) 독일 고순도"
                  disabled={!branch}
                  style={{ ...styles.input, flex: 1, height: 34, padding: "6px 10px", fontSize: 13 }}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, flexShrink: 0, width: 24 }}>→</div>
                <input
                  type="text"
                  value={newBranchReplacement}
                  onChange={(e) => setNewBranchReplacement(e.target.value)}
                  placeholder="예) 제오민"
                  disabled={!branch}
                  style={{ ...styles.input, flex: 1, height: 34, padding: "6px 10px", fontSize: 13 }}
                />
                <button
                  onClick={() => {
                    addRule("replace", newBranchFind, newBranchReplacement, branch);
                    setNewBranchFind("");
                    setNewBranchReplacement("");
                  }}
                  disabled={!branch}
                  style={{ ...styles.btnPrimary, opacity: !branch ? 0.4 : 1 }}
                >
                  추가
                </button>
              </div>
            </div>

            <div style={styles.list}>
              {branch && branchRules.length === 0 && <p style={styles.empty}>등록된 지점별 규칙이 없습니다.</p>}
              {branchRules.filter((r) => r.pattern.includes(branchRulesSearch) || (r.replacement?.includes(branchRulesSearch) ?? false)).map((r) =>
                editingRuleId === r.id ? (
                  <div key={r.id} style={styles.rowEdit}>
                    <input
                      type="text"
                      value={editPattern}
                      onChange={(e) => setEditPattern(e.target.value)}
                      style={styles.input}
                    />
                    <input
                      type="text"
                      value={editReplacement}
                      onChange={(e) => setEditReplacement(e.target.value)}
                      style={styles.input}
                    />
                    <button onClick={() => saveEditRule(r)} style={{ ...styles.linkBtn, color: C.primary }}>저장</button>
                    <button onClick={cancelEditRule} style={styles.linkBtn}>취소</button>
                  </div>
                ) : (
                  <div key={r.id} style={styles.row}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.pattern} → {r.replacement}
                    </span>
                    <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 10 }}>
                      <button onClick={() => startEditRule(r)} style={styles.linkBtn}>수정</button>
                      <button onClick={() => deleteRule(r.id)} style={styles.linkBtn}>삭제</button>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "manual" && (
          <section style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p style={{ ...styles.cardTitle, marginBottom: 0 }}>지점별 시술 추가</p>
                <RowToast />
              </div>
              <TabSearchInput value={manualSearch} onChange={setManualSearch} />
            </div>
            <p style={styles.cardHint}>
              홈페이지에는 없는 {branch || "우리 지점"}만의 시술을 추가해 주세요.
              <br />
              예1: 포텐자 기미팁 33,000원
              <br />
              예2: 눈밑 쥬베룩스킨(케뉼라) 2cc 220,000원
            </p>

            {!branch && <p style={{ marginBottom: 8, fontSize: 14, color: C.sub }}>상단에서 지점을 먼저 선택하세요.</p>}
            {manualError && <p style={{ marginBottom: 8, fontSize: 14, color: C.danger }}>에러: {manualError}</p>}

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={newManualName}
                onChange={(e) => setNewManualName(e.target.value)}
                placeholder="시술명"
                style={{ ...styles.input, flex: 1, minWidth: 0, height: 34, padding: "6px 10px", fontSize: 13 }}
              />
              <input
                type="number"
                value={newManualPrice}
                onChange={(e) => setNewManualPrice(e.target.value)}
                placeholder="가격(원)"
                style={{ ...styles.input, flex: "0 0 90px", minWidth: 0, height: 34, padding: "6px 10px", fontSize: 13 }}
              />
              <Dropdown
                value={newManualCategory ?? ""}
                onChange={(v) => setNewManualCategory(v ? (v as TreatmentCategory) : null)}
                placeholder="카테고리"
                options={CATEGORY_ORDER.map((cat) => ({ value: cat, label: cat }))}
                style={{ flex: "0 0 110px", height: 34 }}
              />
              <button
                onClick={addManualTreatment}
                disabled={!branch}
                style={{ ...styles.btnPrimary, opacity: !branch ? 0.4 : 1, flexShrink: 0 }}
              >
                추가
              </button>
            </div>

            <div style={styles.list}>
              {manualTreatments.length === 0 && <p style={styles.empty}>직접 추가한 시술이 없습니다.</p>}
              {manualTreatments.filter((t) => t.name.includes(manualSearch)).sort((a, b) => a.name.localeCompare(b.name, "ko")).map((t) =>
                editingManualId === t.id ? (
                  <div key={t.id} style={styles.rowEdit}>
                    <input
                      type="text"
                      value={editManualName}
                      onChange={(e) => setEditManualName(e.target.value)}
                      style={{ ...styles.input, height: 34, padding: "6px 10px", fontSize: 13 }}
                    />
                    <input
                      type="number"
                      value={editManualPrice}
                      onChange={(e) => setEditManualPrice(e.target.value)}
                      style={{ ...styles.input, flex: "0 0 120px", height: 34, padding: "6px 10px", fontSize: 13 }}
                    />
                    <Dropdown
                      value={editManualCategory ?? ""}
                      onChange={(v) => setEditManualCategory(v ? (v as TreatmentCategory) : null)}
                      placeholder="카테고리"
                      options={CATEGORY_ORDER.map((cat) => ({ value: cat, label: cat }))}
                      style={{ flex: "0 0 110px", height: 34 }}
                    />
                    <button onClick={() => saveEditManual(t.id)} style={{ ...styles.linkBtn, color: C.primary }}>저장</button>
                    <button onClick={cancelEditManual} style={styles.linkBtn}>취소</button>
                  </div>
                ) : (
                  <div key={t.id} style={styles.row}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                    <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 10 }}>
                      {t.category && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, background: C.primaryLt, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>{t.category}</span>
                      )}
                      <span style={{ fontVariantNumeric: "tabular-nums", color: C.primary }}>{formatNumber(t.price)}원</span>
                      <button onClick={() => startEditManual(t)} style={styles.linkBtn}>수정</button>
                      <button onClick={() => deleteManualTreatment(t.id)} style={styles.linkBtn}>삭제</button>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "category" && (
          <section style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={styles.cardTitle}>시술별 카테고리</p>
                  {categoryTreatments.filter(t => !t.category).length > 0 && (
                    <p style={{ fontSize: 13, color: C.danger, margin: 0 }}>
                      (미분류 시술: {categoryTreatments.filter(t => !t.category).length}건 있습니다. 카테고리를 지정해주세요)
                    </p>
                  )}
                </div>
                <p style={styles.cardHint}>
                  각 카테고리 순서대로 차트를 출력합니다.
                  <br />
                  자동 분류되지만 오류가 있을 경우 체크박스를 선택해 원하는 카테고리로 변경해 주세요.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={handleSync} disabled={syncing || !branch} style={{ ...styles.btnPrimary, padding: "10px 18px", fontSize: 14, boxShadow: "0 2px 6px rgba(0,0,0,0.12)", opacity: syncing || !branch ? 0.6 : 1 }}>
                  {syncing ? "연동 중..." : "홈페이지 연동"}
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetting || !branch}
                  style={{ ...styles.btnPrimary, background: C.danger, padding: "10px 18px", fontSize: 14, boxShadow: "0 2px 6px rgba(0,0,0,0.12)", opacity: resetting || !branch ? 0.6 : 1 }}
                >
                  {resetting ? "삭제 중..." : "데이터 리셋"}
                </button>
              </div>
            </div>

            {!branch && <p style={{ marginTop: 8, fontSize: 14, color: C.sub }}>상단에서 지점을 먼저 선택하세요.</p>}

            {syncError && <p style={{ marginTop: 8, fontSize: 14, color: C.danger }}>연동 에러: {syncError}</p>}
            {syncResult && <p style={{ marginTop: 8, fontSize: 13, color: C.sub }}>연동 완료: {syncResult.scraped}건 수집, {syncResult.saved}건 저장</p>}
            {resetError && <p style={{ marginTop: 8, fontSize: 14, color: C.danger }}>리셋 에러: {resetError}</p>}

            {categoryError && <p style={{ marginTop: 8, marginBottom: 8, fontSize: 14, color: C.danger }}>에러: {categoryError}</p>}

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="시술명 검색"
                style={styles.input}
              />
              <Dropdown
                value={bulkCategory ?? ""}
                onChange={(v) => setBulkCategory(v ? (v as TreatmentCategory) : null)}
                placeholder="이동할 분류 선택"
                options={CATEGORY_ORDER.map((cat) => ({ value: cat, label: cat }))}
                style={{ flex: "0 0 170px" }}
              />
              <button
                onClick={bulkMoveCategory}
                disabled={selectedForBulk.size === 0 || !bulkCategory}
                style={{ ...styles.btnPrimary, opacity: selectedForBulk.size === 0 || !bulkCategory ? 0.4 : 1 }}
              >
                {selectedForBulk.size}개 이동
              </button>
            </div>

            <div style={{ marginTop: 14, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 10 }}>
                미분류 시술 ({categoryTreatments.filter(t => !t.category).length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "50vh", overflowY: "auto" }}>
                {categoryTreatments.filter(t => !t.category).length === 0 ? (
                  <p style={{ fontSize: 12, color: C.sub }}>없음</p>
                ) : (
                  categoryTreatments
                    .filter((t) => {
                      if (t.category) return false;
                      const q = categorySearch.trim().toLowerCase().replace(/\s/g, "");
                      if (q === "") return true;
                      const normalized = t.name.toLowerCase().replace(/\s/g, "");
                      return normalized.includes(q);
                    })
                    .map((t) => (
                      <label
                        key={t.id}
                        style={{ display: "flex", gap: 6, alignItems: "flex-start", border: `1px dashed ${C.sub}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, lineHeight: 1.3, cursor: "pointer", background: "#fdfcfb" }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedForBulk.has(t.id!)}
                          onChange={(e) => {
                            const newSet = new Set(selectedForBulk);
                            if (e.target.checked) newSet.add(t.id!);
                            else newSet.delete(t.id!);
                            setSelectedForBulk(newSet);
                          }}
                          style={{ marginTop: 2, cursor: "pointer", flexShrink: 0, accentColor: C.primary }}
                        />
                        <span style={{ flex: 1, wordBreak: "break-word" as const, minWidth: 0 }}>
                          <span style={{ display: "block", color: C.primary }}>{t.name}</span>
                          <span style={{ display: "block", color: C.sub, fontVariantNumeric: "tabular-nums", fontSize: 11 }}>{formatNumber(t.price)}원</span>
                        </span>
                      </label>
                    ))
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
              {CATEGORY_ORDER.map((cat) => {
                const q = categorySearch.trim().toLowerCase().replace(/\s/g, "");
                const items = categoryTreatments.filter((t) => {
                  if (t.category !== cat) return false;
                  if (q === "") return true;
                  const normalized = t.name.toLowerCase().replace(/\s/g, "");
                  return normalized.includes(q);
                });
                return (
                  <div
                    key={cat}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      minWidth: 0,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      background: C.surface,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700, color: C.primary, whiteSpace: "nowrap" }}>
                      <span>{cat} <span style={{ fontWeight: 400, color: C.sub, fontSize: 12 }}>({items.length})</span></span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, maxHeight: "70vh", overflowY: "auto" }}>
                      {items.length === 0 && <p style={{ fontSize: 12, color: C.sub, padding: "4px 0" }}>없음</p>}
                      {items.map((t) => (
                        <label
                          key={t.id}
                          style={{ display: "flex", gap: 6, alignItems: "flex-start", border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, lineHeight: 1.3, cursor: "pointer", background: "#fafafa" }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedForBulk.has(t.id!)}
                            onChange={(e) => {
                              const newSet = new Set(selectedForBulk);
                              if (e.target.checked) newSet.add(t.id!);
                              else newSet.delete(t.id!);
                              setSelectedForBulk(newSet);
                            }}
                            style={{ marginTop: 2, cursor: "pointer", flexShrink: 0, accentColor: C.primary }}
                          />
                          <span style={{ flex: 1, wordBreak: "break-word" as const, minWidth: 0 }}>
                            <span style={{ display: "block", color: C.primary }}>{t.name}</span>
                            <span style={{ display: "block", color: C.sub, fontVariantNumeric: "tabular-nums", fontSize: 11 }}>{formatNumber(t.price)}원</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

          </section>
        )}

      </main>

      {confirmModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(40,36,34,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "22px 22px 18px",
              maxWidth: 380,
              width: "100%",
              boxShadow: "0 12px 32px rgba(40,36,34,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.primary, marginBottom: 18, whiteSpace: "pre-line" }}>
              {confirmModal.message}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setConfirmModal(null)} style={styles.btnGhost}>
                취소
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                style={{
                  ...styles.btnPrimary,
                  background: confirmModal.danger ? C.danger : C.primary,
                }}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
