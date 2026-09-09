"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/format";
import type { Alias } from "@/lib/types";
import { TreatmentCategory } from "@/lib/types";
import { CATEGORY_ORDER } from "@/lib/categoryDetection";

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
};

type UnclassifiedTreatment = {
  id: string;
  name: string;
  price: number;
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
  { key: "alias", label: "축약어 매칭단어" },
  { key: "manual", label: "홈페이지 미등재시술 추가" },
];

const SETUP_SQL = `create table cleanup_rules (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('exclude', 'replace')),
  pattern text not null,
  replacement text,
  created_at timestamptz not null default now()
);`;

export default function RulesPage() {
  const [tab, setTab] = useState<Tab>("replace");

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

  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const [editManualName, setEditManualName] = useState("");
  const [editManualPrice, setEditManualPrice] = useState("");

  const [unclassified, setUnclassified] = useState<UnclassifiedTreatment[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<TreatmentCategory | null>(null);

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

  function loadManualTreatments() {
    fetch("/api/manual-treatments")
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

  function loadUnclassified() {
    fetch("/api/treatments/unclassified")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setCategoryError(data.error);
        else {
          setCategoryError(null);
          setUnclassified(data.treatments ?? []);
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
    loadManualTreatments();
    loadUnclassified();
    loadAliases();
  }, []);

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
      }
    } catch (e) {
      setApplyError(String(e));
    } finally {
      setApplying(false);
    }
  }

  async function addManualTreatment() {
    if (!newManualName.trim() || !newManualPrice) return;
    const res = await fetch("/api/manual-treatments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newManualName, price: Number(newManualPrice) }),
    });
    const data = await res.json();
    if (data.error) {
      setManualError(data.error);
      return;
    }
    setManualTreatments((prev) => [...prev, data.treatment]);
    setNewManualName("");
    setNewManualPrice("");
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

  async function updateCategory(id: string, category: TreatmentCategory) {
    const res = await fetch("/api/treatments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category }),
    });
    const data = await res.json();
    if (data.error) {
      setCategoryError(data.error);
      return;
    }
    setUnclassified((prev) => prev.filter((t) => t.id !== id));
    setEditingCategoryId(null);
    setSelectedCategory(null);
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h1 className="text-lg font-semibold">상세설정</h1>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
            ← 메인으로
          </Link>
        </div>
      </header>

      {loadError && (
        <div className="mx-auto max-w-3xl px-6 pt-4">
          <p className="text-sm text-red-500">에러: {loadError}</p>
          {tableMissing && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">
                cleanup_rules 테이블이 아직 없습니다. Supabase 대시보드 → SQL Editor에서
                아래 SQL을 한 번 실행한 뒤 이 페이지를 새로고침하세요.
              </p>
              <pre className="mt-2 overflow-x-auto rounded-md bg-white p-2 text-xs text-gray-700">
                {SETUP_SQL}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="border-b border-gray-200 bg-white px-4">
        <div className="mx-auto flex max-w-3xl gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-3 text-sm font-medium ${
                tab === t.key
                  ? "border-b-2 border-gray-800 text-gray-900"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-3xl p-4">
        {tab === "replace" && (
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-medium text-gray-500">
              치환 규칙 (찾을 문자열 → 바꿀 문자열)
            </h2>

            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={newFind}
                onChange={(e) => setNewFind(e.target.value)}
                placeholder="찾을 문자열"
                className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <input
                type="text"
                value={newReplacement}
                onChange={(e) => setNewReplacement(e.target.value)}
                placeholder="바꿀 문자열"
                className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <button
                onClick={() => {
                  addRule("replace", newFind, newReplacement);
                  setNewFind("");
                  setNewReplacement("");
                }}
                className="shrink-0 rounded-md bg-gray-800 px-3 py-2 text-sm text-white"
              >
                추가
              </button>
            </div>

            <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
              {replaceRules.length === 0 && (
                <p className="text-xs text-gray-400">등록된 치환 규칙이 없습니다.</p>
              )}
              {replaceRules.map((r) =>
                editingRuleId === r.id ? (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm"
                  >
                    <input
                      type="text"
                      value={editPattern}
                      onChange={(e) => setEditPattern(e.target.value)}
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1 outline-none focus:border-gray-400"
                    />
                    <input
                      type="text"
                      value={editReplacement}
                      onChange={(e) => setEditReplacement(e.target.value)}
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1 outline-none focus:border-gray-400"
                    />
                    <button
                      onClick={() => saveEditRule(r)}
                      className="shrink-0 text-gray-700 hover:text-black"
                    >
                      저장
                    </button>
                    <button
                      onClick={cancelEditRule}
                      className="shrink-0 text-gray-400 hover:text-gray-700"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm text-gray-700"
                  >
                    <span className="truncate">
                      {r.pattern} → {r.replacement}
                    </span>
                    <div className="ml-2 flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => startEditRule(r)}
                        className="text-gray-400 hover:text-gray-700"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => deleteRule(r.id)}
                        className="text-gray-400 hover:text-gray-700"
                        aria-label="삭제"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "exclude" && (
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-medium text-gray-500">
              제외 문구 (해당 문자열을 삭제)
            </h2>

            <div className="mb-3 flex gap-2">
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
                className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <button
                onClick={() => {
                  addRule("exclude", newExclude);
                  setNewExclude("");
                }}
                className="rounded-md bg-gray-800 px-3 py-2 text-sm text-white"
              >
                추가
              </button>
            </div>

            <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
              {excludeRules.length === 0 && (
                <p className="text-xs text-gray-400">등록된 제외 문구가 없습니다.</p>
              )}
              {excludeRules.map((r) =>
                editingRuleId === r.id ? (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm"
                  >
                    <input
                      type="text"
                      value={editPattern}
                      onChange={(e) => setEditPattern(e.target.value)}
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1 outline-none focus:border-gray-400"
                    />
                    <button
                      onClick={() => saveEditRule(r)}
                      className="shrink-0 text-gray-700 hover:text-black"
                    >
                      저장
                    </button>
                    <button
                      onClick={cancelEditRule}
                      className="shrink-0 text-gray-400 hover:text-gray-700"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm text-gray-700"
                  >
                    <span className="truncate">{r.pattern}</span>
                    <div className="ml-2 flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => startEditRule(r)}
                        className="text-gray-400 hover:text-gray-700"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => deleteRule(r.id)}
                        className="text-gray-400 hover:text-gray-700"
                        aria-label="삭제"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "alias" && (
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-medium text-gray-500">
              축약어 매칭단어 (예: 포마 → FORMA)
            </h2>
            <p className="mb-3 text-xs text-gray-400">
              시술 입력창에 축약어를 타이핑하면 검색 키워드로 치환되어, 그 키워드가
              들어간 모든 시술이 후보로 뜹니다.
            </p>

            {aliasError && <p className="mb-2 text-sm text-red-500">에러: {aliasError}</p>}

            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={newAliasText}
                onChange={(e) => setNewAliasText(e.target.value)}
                placeholder="축약어/오타 (예: 포마)"
                className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <span className="flex items-center text-gray-400">→</span>
              <input
                type="text"
                value={newAliasKeyword}
                onChange={(e) => setNewAliasKeyword(e.target.value)}
                placeholder="실제 검색 키워드 (예: FORMA)"
                className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <button
                onClick={addAlias}
                disabled={!newAliasText.trim() || !newAliasKeyword.trim()}
                className="shrink-0 rounded-md bg-gray-800 px-3 py-2 text-sm text-white disabled:bg-gray-300"
              >
                추가
              </button>
            </div>

            <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
              {aliases.length === 0 && (
                <p className="text-xs text-gray-400">등록된 축약어가 없습니다.</p>
              )}
              {aliases.map((a) =>
                editingAliasId === a.id ? (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm"
                  >
                    <input
                      type="text"
                      value={editAliasText}
                      onChange={(e) => setEditAliasText(e.target.value)}
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1 outline-none focus:border-gray-400"
                    />
                    <span className="text-gray-400">→</span>
                    <input
                      type="text"
                      value={editAliasKeyword}
                      onChange={(e) => setEditAliasKeyword(e.target.value)}
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1 outline-none focus:border-gray-400"
                    />
                    <button
                      onClick={() => saveEditAlias(a.id)}
                      className="shrink-0 text-gray-700 hover:text-black"
                    >
                      저장
                    </button>
                    <button
                      onClick={cancelEditAlias}
                      className="shrink-0 text-gray-400 hover:text-gray-700"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm text-gray-700"
                  >
                    <span className="truncate">
                      {a.alias} → {a.keyword}
                    </span>
                    <div className="ml-2 flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => startEditAlias(a)}
                        className="text-gray-400 hover:text-gray-700"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => deleteAlias(a.id)}
                        className="text-gray-400 hover:text-gray-700"
                        aria-label="삭제"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "manual" && (
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-medium text-gray-500">
              홈페이지에 없는 시술 추가
            </h2>

            {manualError && <p className="mb-2 text-sm text-red-500">에러: {manualError}</p>}

            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={newManualName}
                onChange={(e) => setNewManualName(e.target.value)}
                placeholder="시술명"
                className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <input
                type="number"
                value={newManualPrice}
                onChange={(e) => setNewManualPrice(e.target.value)}
                placeholder="가격(원)"
                className="w-40 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
              <button
                onClick={addManualTreatment}
                className="shrink-0 rounded-md bg-gray-800 px-3 py-2 text-sm text-white"
              >
                추가
              </button>
            </div>

            <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
              {manualTreatments.length === 0 && (
                <p className="text-xs text-gray-400">직접 추가한 시술이 없습니다.</p>
              )}
              {manualTreatments.map((t) =>
                editingManualId === t.id ? (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm"
                  >
                    <input
                      type="text"
                      value={editManualName}
                      onChange={(e) => setEditManualName(e.target.value)}
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1 outline-none focus:border-gray-400"
                    />
                    <input
                      type="number"
                      value={editManualPrice}
                      onChange={(e) => setEditManualPrice(e.target.value)}
                      className="w-32 rounded-md border border-gray-200 px-2 py-1 outline-none focus:border-gray-400"
                    />
                    <button
                      onClick={() => saveEditManual(t.id)}
                      className="shrink-0 text-gray-700 hover:text-black"
                    >
                      저장
                    </button>
                    <button
                      onClick={cancelEditManual}
                      className="shrink-0 text-gray-400 hover:text-gray-700"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm text-gray-700"
                  >
                    <span className="truncate">{t.name}</span>
                    <div className="ml-2 flex shrink-0 items-center gap-3">
                      <span className="tabular-nums">{formatNumber(t.price)}원</span>
                      <button
                        onClick={() => startEditManual(t)}
                        className="text-gray-400 hover:text-gray-700"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => deleteManualTreatment(t.id)}
                        className="text-gray-400 hover:text-gray-700"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {tab === "category" && (
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-medium text-gray-800">
              미분류 시술 카테고리 지정
            </h2>
            <p className="mb-3 text-xs text-gray-600">
              아래 시술들에 카테고리를 지정해주세요. 지정하면 이 목록에서 사라집니다.
            </p>

            {categoryError && <p className="mb-2 text-sm text-red-500">에러: {categoryError}</p>}

            <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
              {unclassified.length === 0 && (
                <p className="text-xs text-gray-600">모든 시술이 분류되었습니다!</p>
              )}
              {unclassified.map((t) =>
                editingCategoryId === t.id ? (
                  <div key={t.id} className="rounded-md border border-gray-200 p-3">
                    <div className="mb-2">
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-700">{formatNumber(t.price)}원</p>
                    </div>
                    <select
                      value={selectedCategory ?? ""}
                      onChange={(e) => setSelectedCategory(e.target.value as TreatmentCategory)}
                      className="mb-2 w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-gray-400"
                    >
                      <option value="">카테고리 선택</option>
                      {CATEGORY_ORDER.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (selectedCategory) {
                            updateCategory(t.id, selectedCategory);
                          }
                        }}
                        disabled={!selectedCategory}
                        className="flex-1 rounded-md bg-gray-800 px-2 py-1 text-sm text-white disabled:bg-gray-300"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => {
                          setEditingCategoryId(null);
                          setSelectedCategory(null);
                        }}
                        className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-700"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm text-gray-700"
                  >
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-gray-500">{formatNumber(t.price)}원</p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingCategoryId(t.id);
                        setSelectedCategory(null);
                      }}
                      className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                    >
                      분류하기
                    </button>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {(tab === "replace" || tab === "exclude") && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <button
              onClick={handleApply}
              disabled={applying}
              className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
            >
              {applying ? "적용 중..." : "지금 기존 데이터에 적용"}
            </button>

            {applyError && <p className="mt-3 text-sm text-red-500">에러: {applyError}</p>}

            {applyResult && (
              <div className="mt-3 text-sm text-gray-700">
                <p>업데이트: {applyResult.updated}건</p>
                {applyResult.skipped.length > 0 && (
                  <div className="mt-1">
                    <p className="text-amber-600">
                      중복으로 건너뜀: {applyResult.skipped.length}건
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-gray-500">
                      {applyResult.skipped.map((s) => (
                        <li key={s.id}>
                          {s.oldName} → {s.newName}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {applyResult.errors.length > 0 && (
                  <p className="mt-1 text-red-500">에러: {applyResult.errors.length}건</p>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
