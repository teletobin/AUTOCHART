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

type Rule = {
  id: string;
  type: "exclude" | "replace";
  pattern: string;
  replacement: string | null;
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

type Tab = "replace" | "exclude" | "alias" | "manual" | "category";

const TABS: { key: Tab; label: string }[] = [
  { key: "category", label: "시술 카테고리 분류" },
  { key: "replace", label: "치환" },
  { key: "exclude", label: "삭제" },
  { key: "alias", label: "매칭" },
  { key: "manual", label: "홈페이지에 없는 시술" },
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
  header:    { borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "14px 28px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(111,104,100,0.06)" },
  headerInner: { width: "100%", maxWidth: "none", margin: "0", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box" },
  title:     { fontSize: 17, fontWeight: 700, color: C.primary },
  logo:      { display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 17, color: C.primary },
  backLink:  { fontSize: 12, color: C.sub, textDecoration: "none" },
  tabBar:    { borderBottom: `1px solid ${C.border}`, background: C.surface, width: "100%" },
  tabBarInner: { width: "100%", maxWidth: "none", margin: "0", display: "flex", gap: 4, padding: "0 28px", overflowX: "auto" as const, boxSizing: "border-box" },
  main:      { width: "100%", maxWidth: "none", margin: "0", padding: "24px 28px", boxSizing: "border-box" },
  card:      { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" },
  cardTitle: { fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 6, letterSpacing: "0.04em" },
  cardHint:  { fontSize: 11, color: C.sub, marginBottom: 14 },
  input:     { flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", background: "#fff", color: C.primary, boxSizing: "border-box" as const },
  btnPrimary: { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  btnGhost: { background: "transparent", color: C.sub, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  row:       { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: "9px 12px", fontSize: 13 },
  rowEdit:   { display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13 },
  linkBtn:   { background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 12, padding: 0 },
  list:      { display: "flex", flexDirection: "column" as const, gap: 6, maxHeight: "60vh", overflowY: "auto" as const },
  empty:     { fontSize: 12, color: C.sub },
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: active ? C.primary : C.sub,
    background: "none",
    border: "none",
    borderBottom: active ? `2px solid ${C.primary}` : "2px solid transparent",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export default function RulesPage() {
  const [tab, setTab] = useState<Tab>("replace");
  const [branch, setBranch] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((tb) => tb.key === t)) setTab(t);
    const saved = localStorage.getItem(BRANCH_STORAGE_KEY);
    if (saved) setBranch(saved);
  }, []);

  function handleBranchChange(next: string) {
    setBranch(next);
    localStorage.setItem(BRANCH_STORAGE_KEY, next);
  }

  const [rules, setRules] = useState<Rule[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const [newExclude, setNewExclude] = useState("");
  const [newFind, setNewFind] = useState("");
  const [newReplacement, setNewReplacement] = useState("");

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editPattern, setEditPattern] = useState("");
  const [editReplacement, setEditReplacement] = useState("");

  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const [manualTreatments, setManualTreatments] = useState<ManualTreatment[]>([]);
  const [manualError, setManualError] = useState<string | null>(null);
  const [newManualName, setNewManualName] = useState("");
  const [newManualPrice, setNewManualPrice] = useState("");
  const [newManualCategory, setNewManualCategory] = useState<TreatmentCategory | null>(null);

  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const [editManualName, setEditManualName] = useState("");
  const [editManualPrice, setEditManualPrice] = useState("");

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

  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyError, setReclassifyError] = useState<string | null>(null);

  const [reclassifyingLdm, setReclassifyingLdm] = useState(false);
  const [reclassifyLdmError, setReclassifyLdmError] = useState<string | null>(null);

  const [aliases, setAliases] = useState<Alias[]>([]);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [newAliasText, setNewAliasText] = useState("");
  const [newAliasKeyword, setNewAliasKeyword] = useState("");
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [editAliasText, setEditAliasText] = useState("");
  const [editAliasKeyword, setEditAliasKeyword] = useState("");

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
    if (!forBranch) { setManualTreatments([]); return; }
    fetch(`/api/manual-treatments?branch=${encodeURIComponent(forBranch)}`)
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
    if (!forBranch) { setCategoryTreatments([]); return; }
    fetch(`/api/treatments?branch=${encodeURIComponent(forBranch)}`)
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

  async function addRule(type: "exclude" | "replace", pattern: string, replacement?: string) {
    if (!pattern.trim()) return;
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, pattern, replacement }),
    });
    const data = await res.json();
    if (data.error) {
      setLoadError(data.error);
      return;
    }
    setRules((prev) => [...prev, data.rule]);
  }

  async function deleteRule(id: string) {
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== id));
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
  }

  async function handleApply() {
    setApplying(true);
    setApplyResult(null);
    setApplyError(null);
    try {
      const res = await fetch("/api/cleanup", { method: "POST" });
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
  }

  function startEditManual(t: ManualTreatment) {
    setEditingManualId(t.id);
    setEditManualName(t.name);
    setEditManualPrice(String(t.price));
  }

  function cancelEditManual() {
    setEditingManualId(null);
    setEditManualName("");
    setEditManualPrice("");
  }

  async function saveEditManual(id: string) {
    const res = await fetch(`/api/manual-treatments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editManualName, price: Number(editManualPrice) }),
    });
    const data = await res.json();
    if (data.error) {
      setManualError(data.error);
      return;
    }
    setManualTreatments((prev) => prev.map((t) => (t.id === id ? data.treatment : t)));
    cancelEditManual();
  }

  async function deleteManualTreatment(id: string) {
    await fetch(`/api/manual-treatments/${id}`, { method: "DELETE" });
    setManualTreatments((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleSync() {
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

  async function handleReset() {
    if (!branch) return;
    if (!confirm("홈페이지에서 불러온 시술을 모두 삭제합니다 (미등재 시술은 유지됩니다). 계속할까요?")) return;
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

  async function handleReclassifyLaser() {
    if (!branch) return;
    setReclassifying(true);
    setReclassifyError(null);
    try {
      const res = await fetch("/api/treatments/reclassify-laser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      const data = await res.json();
      if (data.error) {
        setReclassifyError(data.error);
      } else {
        loadCategoryTreatments(branch);
      }
    } catch (e) {
      setReclassifyError(String(e));
    } finally {
      setReclassifying(false);
    }
  }

  async function handleReclassifyLdm() {
    if (!branch) return;
    setReclassifyingLdm(true);
    setReclassifyLdmError(null);
    try {
      const res = await fetch("/api/treatments/reclassify-ldm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      const data = await res.json();
      if (data.error) {
        setReclassifyLdmError(data.error);
      } else {
        loadCategoryTreatments(branch);
      }
    } catch (e) {
      setReclassifyLdmError(String(e));
    } finally {
      setReclassifyingLdm(false);
    }
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
    setAliases((prev) => [...prev, data.alias]);
    setNewAliasText("");
    setNewAliasKeyword("");
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
  }

  async function deleteAlias(id: string) {
    await fetch(`/api/aliases/${id}`, { method: "DELETE" });
    setAliases((prev) => prev.filter((a) => a.id !== id));
  }

  const excludeRules = rules.filter((r) => r.type === "exclude");
  const replaceRules = rules.filter((r) => r.type === "replace");

  const applySection = (
    <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
      <button
        onClick={handleApply}
        disabled={applying}
        style={{ ...styles.btnPrimary, opacity: applying ? 0.6 : 1 }}
      >
        {applying ? "적용 중..." : "연동된 데이터에 적용"}
      </button>

      {applyError && <p style={{ marginTop: 10, fontSize: 13, color: C.danger }}>에러: {applyError}</p>}

      {applyResult && (
        <div style={{ marginTop: 10, fontSize: 13, color: C.primary }}>
          <p>업데이트: {applyResult.updated}건</p>
          {applyResult.skipped.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <p style={{ color: "#b8860b" }}>중복으로 건너뜀: {applyResult.skipped.length}건</p>
              <ul style={{ marginTop: 4, paddingLeft: 18, fontSize: 11, color: C.sub, listStyle: "disc" }}>
                {applyResult.skipped.map((s) => (
                  <li key={s.id}>{s.oldName} → {s.newName}</li>
                ))}
              </ul>
            </div>
          )}
          {applyResult.errors.length > 0 && (
            <p style={{ marginTop: 4, color: C.danger }}>에러: {applyResult.errors.length}건</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <img src="/logo.png" alt="차팅 서포트" style={{ height: 36, width: "auto" }} />
            <span style={{ fontWeight: 700 }}>차팅 서포트</span>
            <span style={{ color: C.sub, fontWeight: 400, fontSize: 16.5 }}>&gt;</span>
            <span style={{ fontWeight: 500, color: C.sub, fontSize: 16.5 }}>상세설정</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BranchPicker value={branch} onChange={handleBranchChange} />
            <Link
              href="/"
              style={{ ...styles.btnGhost, fontSize: 11, padding: "6px 10px", textDecoration: "none", display: "inline-block" }}
            >
              메인으로
            </Link>
          </div>
        </div>
      </header>

      {loadError && (
        <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto", padding: "16px 20px 0" }}>
          <p style={{ fontSize: 13, color: C.danger }}>에러: {loadError}</p>
          {tableMissing && (
            <div style={{ marginTop: 8, borderRadius: 10, border: `1px solid ${C.danger}`, background: "#fdf1ef", padding: 12 }}>
              <p style={{ fontSize: 13, color: C.danger }}>
                cleanup_rules 테이블이 아직 없습니다. Supabase 대시보드 → SQL Editor에서
                아래 SQL을 한 번 실행한 뒤 이 페이지를 새로고침하세요.
              </p>
              <pre style={{ marginTop: 8, overflowX: "auto", borderRadius: 8, background: "#fff", padding: 8, fontSize: 11, color: C.primary }}>
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
            : { ...styles.main, maxWidth: tab === "manual" ? 760 : 640, margin: "0" }
        }
      >
        {tab === "replace" && (
          <section style={styles.card}>
            <p style={styles.cardTitle}>치환 규칙 (찾을 문자열 → 바꿀 문자열)</p>

            {applySection}

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={newFind}
                onChange={(e) => setNewFind(e.target.value)}
                placeholder="찾을 문자열"
                style={styles.input}
              />
              <input
                type="text"
                value={newReplacement}
                onChange={(e) => setNewReplacement(e.target.value)}
                placeholder="바꿀 문자열"
                style={styles.input}
              />
              <button
                onClick={() => {
                  addRule("replace", newFind, newReplacement);
                  setNewFind("");
                  setNewReplacement("");
                }}
                style={styles.btnPrimary}
              >
                추가
              </button>
            </div>

            <div style={styles.list}>
              {replaceRules.length === 0 && <p style={styles.empty}>등록된 치환 규칙이 없습니다.</p>}
              {replaceRules.map((r) =>
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
                      <button onClick={() => deleteRule(r.id)} style={styles.linkBtn} aria-label="삭제">×</button>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "exclude" && (
          <section style={styles.card}>
            <p style={styles.cardTitle}>제외 문구 (해당 문자열을 삭제)</p>

            {applySection}

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
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
                style={styles.input}
              />
              <button
                onClick={() => {
                  addRule("exclude", newExclude);
                  setNewExclude("");
                }}
                style={styles.btnPrimary}
              >
                추가
              </button>
            </div>

            <div style={styles.list}>
              {excludeRules.length === 0 && <p style={styles.empty}>등록된 제외 문구가 없습니다.</p>}
              {excludeRules.map((r) =>
                editingRuleId === r.id ? (
                  <div key={r.id} style={styles.rowEdit}>
                    <input
                      type="text"
                      value={editPattern}
                      onChange={(e) => setEditPattern(e.target.value)}
                      style={styles.input}
                    />
                    <button onClick={() => saveEditRule(r)} style={{ ...styles.linkBtn, color: C.primary }}>저장</button>
                    <button onClick={cancelEditRule} style={styles.linkBtn}>취소</button>
                  </div>
                ) : (
                  <div key={r.id} style={styles.row}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.pattern}</span>
                    <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 10 }}>
                      <button onClick={() => startEditRule(r)} style={styles.linkBtn}>수정</button>
                      <button onClick={() => deleteRule(r.id)} style={styles.linkBtn} aria-label="삭제">×</button>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "alias" && (
          <section style={styles.card}>
            <p style={styles.cardTitle}>매칭 (예: 포마 → FORMA)</p>
            <p style={styles.cardHint}>
              시술 입력창에 축약어를 타이핑하면 검색 키워드로 치환되어, 그 키워드가
              들어간 모든 시술이 후보로 뜹니다.
            </p>

            {aliasError && <p style={{ marginBottom: 8, fontSize: 13, color: C.danger }}>에러: {aliasError}</p>}

            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
              <input
                type="text"
                value={newAliasText}
                onChange={(e) => setNewAliasText(e.target.value)}
                placeholder="축약어/오타 (예: 포마)"
                style={styles.input}
              />
              <span style={{ color: C.sub }}>→</span>
              <input
                type="text"
                value={newAliasKeyword}
                onChange={(e) => setNewAliasKeyword(e.target.value)}
                placeholder="실제 검색 키워드 (예: FORMA)"
                style={styles.input}
              />
              <button
                onClick={addAlias}
                disabled={!newAliasText.trim() || !newAliasKeyword.trim()}
                style={{ ...styles.btnPrimary, opacity: !newAliasText.trim() || !newAliasKeyword.trim() ? 0.4 : 1 }}
              >
                추가
              </button>
            </div>

            <div style={styles.list}>
              {aliases.length === 0 && <p style={styles.empty}>등록된 축약어가 없습니다.</p>}
              {aliases.map((a) =>
                editingAliasId === a.id ? (
                  <div key={a.id} style={styles.rowEdit}>
                    <input
                      type="text"
                      value={editAliasText}
                      onChange={(e) => setEditAliasText(e.target.value)}
                      style={styles.input}
                    />
                    <span style={{ color: C.sub }}>→</span>
                    <input
                      type="text"
                      value={editAliasKeyword}
                      onChange={(e) => setEditAliasKeyword(e.target.value)}
                      style={styles.input}
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
                      <button onClick={() => startEditAlias(a)} style={styles.linkBtn}>수정</button>
                      <button onClick={() => deleteAlias(a.id)} style={styles.linkBtn} aria-label="삭제">×</button>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "manual" && (
          <section style={styles.card}>
            <p style={styles.cardTitle}>홈페이지에 없는 시술</p>

            {!branch && <p style={{ marginBottom: 8, fontSize: 13, color: C.sub }}>상단에서 지점을 먼저 선택하세요.</p>}
            {manualError && <p style={{ marginBottom: 8, fontSize: 13, color: C.danger }}>에러: {manualError}</p>}

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={newManualName}
                onChange={(e) => setNewManualName(e.target.value)}
                placeholder="시술명"
                style={{ ...styles.input, flex: 1, minWidth: 0 }}
              />
              <input
                type="number"
                value={newManualPrice}
                onChange={(e) => setNewManualPrice(e.target.value)}
                placeholder="가격(원)"
                style={{ ...styles.input, flex: "0 0 90px", minWidth: 0 }}
              />
              <Dropdown
                value={newManualCategory ?? ""}
                onChange={(v) => setNewManualCategory(v ? (v as TreatmentCategory) : null)}
                placeholder="카테고리"
                options={CATEGORY_ORDER.map((cat) => ({ value: cat, label: cat }))}
                style={{ flex: "0 0 110px" }}
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
              {manualTreatments.map((t) =>
                editingManualId === t.id ? (
                  <div key={t.id} style={styles.rowEdit}>
                    <input
                      type="text"
                      value={editManualName}
                      onChange={(e) => setEditManualName(e.target.value)}
                      style={styles.input}
                    />
                    <input
                      type="number"
                      value={editManualPrice}
                      onChange={(e) => setEditManualPrice(e.target.value)}
                      style={{ ...styles.input, flex: "0 0 120px" }}
                    />
                    <button onClick={() => saveEditManual(t.id)} style={{ ...styles.linkBtn, color: C.primary }}>저장</button>
                    <button onClick={cancelEditManual} style={styles.linkBtn}>취소</button>
                  </div>
                ) : (
                  <div key={t.id} style={styles.row}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                    <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 10 }}>
                      {t.category && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.sub, background: C.primaryLt, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>{t.category}</span>
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
                <p style={styles.cardTitle}>시술 카테고리 분류</p>
                <p style={styles.cardHint}>
                  분류별로 속한 시술 목록입니다. 체크박스로 여러 개 선택한 뒤 원하는 분류로 한번에 이동할 수 있습니다.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={handleSync} disabled={syncing || !branch} style={{ ...styles.btnPrimary, opacity: syncing || !branch ? 0.6 : 1 }}>
                  {syncing ? "연동 중..." : "시술연동"}
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetting || !branch}
                  style={{ ...styles.btnPrimary, background: C.danger, opacity: resetting || !branch ? 0.6 : 1 }}
                >
                  {resetting ? "삭제 중..." : "데이터리셋"}
                </button>
              </div>
            </div>

            {!branch && <p style={{ marginTop: 8, fontSize: 13, color: C.sub }}>상단에서 지점을 먼저 선택하세요.</p>}

            {syncError && <p style={{ marginTop: 8, fontSize: 13, color: C.danger }}>연동 에러: {syncError}</p>}
            {syncResult && <p style={{ marginTop: 8, fontSize: 12, color: C.sub }}>연동 완료: {syncResult.scraped}건 수집, {syncResult.saved}건 저장</p>}
            {resetError && <p style={{ marginTop: 8, fontSize: 13, color: C.danger }}>리셋 에러: {resetError}</p>}
            {reclassifyError && <p style={{ marginTop: 8, fontSize: 13, color: C.danger }}>재분류 에러: {reclassifyError}</p>}
            {reclassifyLdmError && <p style={{ marginTop: 8, fontSize: 13, color: C.danger }}>재분류 에러: {reclassifyLdmError}</p>}

            {categoryError && <p style={{ marginTop: 8, marginBottom: 8, fontSize: 13, color: C.danger }}>에러: {categoryError}</p>}

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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
              {CATEGORY_ORDER.map((cat) => {
                const q = categorySearch.trim().toLowerCase();
                const items = categoryTreatments.filter((t) => {
                  if (t.category !== cat) return false;
                  return q === "" || t.name.toLowerCase().includes(q);
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
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, color: C.primary, whiteSpace: "nowrap" }}>
                      <span>{cat} <span style={{ fontWeight: 400, color: C.sub, fontSize: 11 }}>({items.length})</span></span>
                      {cat === TreatmentCategory.레이저 && (
                        <button
                          onClick={handleReclassifyLaser}
                          disabled={reclassifying}
                          title="섹션 타이틀 기준으로 피부관리/주사시술을 다시 분류합니다"
                          style={{ fontSize: 10, fontWeight: 600, color: C.sub, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 6px", cursor: "pointer", opacity: reclassifying ? 0.6 : 1, flexShrink: 0 }}
                        >
                          {reclassifying ? "재분류 중..." : "재분류"}
                        </button>
                      )}
                      {cat === TreatmentCategory.리프팅 && (
                        <button
                          onClick={handleReclassifyLdm}
                          disabled={reclassifyingLdm}
                          title="시술명에 LDM이 포함된 항목을 피부관리로 다시 분류합니다"
                          style={{ fontSize: 10, fontWeight: 600, color: C.sub, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 6px", cursor: "pointer", opacity: reclassifyingLdm ? 0.6 : 1, flexShrink: 0 }}
                        >
                          {reclassifyingLdm ? "재분류 중..." : "재분류"}
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, maxHeight: "70vh", overflowY: "auto" }}>
                      {items.length === 0 && <p style={{ fontSize: 11, color: C.sub, padding: "4px 0" }}>없음</p>}
                      {items.map((t) => (
                        <label
                          key={t.id}
                          style={{ display: "flex", gap: 6, alignItems: "flex-start", border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: "6px 8px", fontSize: 11, lineHeight: 1.3, cursor: "pointer", background: "#fafafa" }}
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
                            style={{ marginTop: 2, cursor: "pointer", flexShrink: 0 }}
                          />
                          <span style={{ flex: 1, wordBreak: "break-word" as const, minWidth: 0 }}>
                            <span style={{ display: "block", color: C.primary }}>{t.name}</span>
                            <span style={{ display: "block", color: C.sub, fontVariantNumeric: "tabular-nums", fontSize: 10 }}>{formatNumber(t.price)}원</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: `2px solid ${C.border}`, paddingTop: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.primary, marginBottom: 10 }}>
                미분류 시술 ({categoryTreatments.filter(t => !t.category).length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "50vh", overflowY: "auto" }}>
                {categoryTreatments.filter(t => !t.category).length === 0 ? (
                  <p style={{ fontSize: 11, color: C.sub }}>없음</p>
                ) : (
                  categoryTreatments
                    .filter((t) => {
                      if (t.category) return false;
                      const q = categorySearch.trim().toLowerCase();
                      return q === "" || t.name.toLowerCase().includes(q);
                    })
                    .map((t) => (
                      <label
                        key={t.id}
                        style={{ display: "flex", gap: 6, alignItems: "flex-start", border: `1px dashed ${C.sub}`, borderRadius: 6, padding: "6px 8px", fontSize: 11, lineHeight: 1.3, cursor: "pointer", background: "#fdfcfb" }}
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
                          style={{ marginTop: 2, cursor: "pointer", flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, wordBreak: "break-word" as const, minWidth: 0 }}>
                          <span style={{ display: "block", color: C.primary }}>{t.name}</span>
                          <span style={{ display: "block", color: C.sub, fontVariantNumeric: "tabular-nums", fontSize: 10 }}>{formatNumber(t.price)}원</span>
                        </span>
                      </label>
                    ))
                )}
              </div>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
