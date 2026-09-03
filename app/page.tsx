"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildMatcher } from "@/lib/match";
import { formatNumber, todayYYMMDD } from "@/lib/format";
import type { Alias, Treatment } from "@/lib/types";

const VAT_RATE = 1.1;

type SelectedItem = {
  id: string;
  name: string;
  basePrice: number;
  count: number;
};

function computeUnitPrice(item: SelectedItem): number {
  return Math.round(item.basePrice * item.count * VAT_RATE);
}

// 시술명이 길어도 잘리지 않고 줄바꿈되도록, 높이가 내용에 맞춰 자동으로
// 늘어나는 한 줄짜리 textarea.
function AutoGrowInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(resize, [value]);

  // 창 크기가 바뀌어 이 필드의 폭이 달라질 때도(단어가 줄바꿈되어 줄 수가
  // 바뀌므로) 높이를 다시 계산해야 잘리지 않는다.
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
    />
  );
}

// 상하 화살표로만 조절하는 최소 폭 횟수/용량 다이얼.
function CountDial({
  count,
  onChange,
}: {
  count: number;
  onChange: (count: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <input
        type="number"
        min={1}
        value={count}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="w-6 rounded border-none p-0 text-right text-sm outline-none"
      />
      <div className="flex flex-col leading-none">
        <button
          onClick={() => onChange(count + 1)}
          className="text-[9px] text-gray-400 hover:text-gray-700"
          aria-label="증가"
        >
          ▲
        </button>
        <button
          onClick={() => onChange(Math.max(1, count - 1))}
          className="text-[9px] text-gray-400 hover:text-gray-700"
          aria-label="감소"
        >
          ▼
        </button>
      </div>
    </div>
  );
}

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
    return fetch("/api/treatments")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setLoadError(data.error);
        } else {
          setLoadError(null);
          setTreatments(data.treatments ?? []);
        }
      })
      .catch((e) => setLoadError(String(e)));
  }

  function loadAliases() {
    return fetch("/api/aliases")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setAliases(data.aliases ?? []);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadTreatments();
    loadAliases();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncMessage(`동기화 실패: ${data.error}`);
      } else {
        setSyncMessage(`동기화 완료 (${data.saved}건 저장)`);
        await loadTreatments();
      }
    } catch (e) {
      setSyncMessage(`동기화 실패: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  const matcher = useMemo(() => buildMatcher(treatments, aliases), [treatments, aliases]);
  const candidates = useMemo(
    () => (inputValue.trim() ? matcher(inputValue, 5) : []),
    [inputValue, matcher]
  );

  function selectCandidate(candidate: Treatment) {
    // 방향키 + Enter로 바로바로 여러 개 추가한다. 횟수/용량은 추가된 목록의
    // 스테퍼로 나중에 조율한다.
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSelectedItems((prev) => [
      ...prev,
      { id, name: candidate.name, basePrice: candidate.price, count: 1 },
    ]);
    setInputValue("");
    setHighlightedIndex(0);
  }

  function removeItem(id: string) {
    setSelectedItems((prev) => prev.filter((i) => i.id !== id));
  }

  function clearAllItems() {
    setSelectedItems([]);
  }

  function updateItemName(id: string, name: string) {
    setSelectedItems((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  }

  function updateItemCount(id: string, count: number) {
    const safeCount = Math.max(1, count || 1);
    setSelectedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, count: safeCount } : i))
    );
  }

  function addManualItem() {
    const price = Number(manualPrice);
    if (!manualName.trim() || !price || price <= 0) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSelectedItems((prev) => [
      ...prev,
      { id, name: manualName.trim(), basePrice: price, count: 1 },
    ]);
    setManualName("");
    setManualPrice("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (candidates.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, candidates.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectCandidate(candidates[highlightedIndex]);
    }
  }

  // 결제금액/추가적립금은 원 단위로 직접 입력받고, 헤더 표시용 "VIP500+80" 형식만
  // 내부적으로 만원 단위로 환산한다.
  const paymentAmount = Number(creditInput) || 0;
  const extraCredit = Number(extraCreditInput) || 0;
  const existingBalance = Number(existingBalanceInput) || 0;

  const transferAmount = transferEnabled ? Number(transferAmountInput) || 0 : 0;

  const totalPrice = selectedItems.reduce((sum, i) => sum + computeUnitPrice(i), 0);
  const totalCreditWon = paymentAmount + extraCredit + existingBalance;
  const balance = totalCreditWon - totalPrice - transferAmount;

  // 방문 회차 표기는 항상 "1-1"(스테퍼는 가격 계산에만 반영). 횟수/용량을
  // 1에서 조정한 항목은 화면에서 눈에 띄도록 금액 끝에 표시를 붙이는데,
  // 실제 복사할 때는 handleCopy에서 이 표시를 제거한다. textarea는 일반
  // 텍스트만 표시하므로 색은 줄 수 없어, 눈에 띄면서도 크기가 작은
  // 기호(🔸)를 대신 쓴다.
  const RED_DOT = " 🔸";

  // 결제금액/추가적립금 둘 다 입력되어야만 "VIP0+0(...)" 같은 헤더를 보여준다.
  // 둘 다 비어있으면 그날 새로 결제한 게 아니라 기존 잔액만 쓰는 경우라서
  // 헤더 없이 나머지(총액/잔액 등)만 표시한다.
  const headerVisible = includeHeader && paymentAmount > 0 && extraCredit > 0;

  const finalText = useMemo(() => {
    const staffDisplay = staffName.trim() ? `${staffName.trim()}S` : "";
    const paymentManwon = Math.round(paymentAmount / 10000);
    const extraManwon = Math.round(extraCredit / 10000);
    const header = `${membershipType}${paymentManwon}+${extraManwon}(${staffDisplay}/${todayYYMMDD()})`;
    const itemLines = selectedItems.map((i) => {
      // 우측 출력에서는 "1회" 단독 표기를 제거한다 ("21회"처럼 숫자에
      // 붙은 경우는 건드리지 않음).
      const displayName = i.name.replace(/(?<!\d)1회(?!\d)/g, "").replace(/\s+/g, " ").trim();
      const dot = i.count !== 1 ? RED_DOT : "";
      return `${displayName} 1-1 ${formatNumber(computeUnitPrice(i))}원${dot}`;
    });
    // 시술이 1개뿐이면 그 줄에 이미 금액이 있으니 "총" 줄은 불필요.
    const totalLine = selectedItems.length > 1 ? [`총 ${formatNumber(totalPrice)}원`] : [];

    const transferLine =
      includeHeader && transferEnabled && transferAmount > 0
        ? [`+${transferName.trim() || "___"}님께 ${formatNumber(transferAmount)}원 양도함`]
        : [];

    // 적립금(결제+추가+기존)을 다 써도 총액을 못 채우면 기존 적립금을 전액
    // 사용한 뒤 차액을 결제하는 것으로, 남는 적립금을 채우면 그냥 잔액을
    // 보여주는 것으로 표시하고 이때는 기존 적립금 사용 여부를 언급하지 않는다.
    let creditLines: string[] = [];
    if (includeHeader) {
      if (balance < 0) {
        const existingLine =
          existingBalance > 0
            ? [`기존 적립금 ${formatNumber(existingBalance)}원 전액 사용 후`]
            : [];
        creditLines = [...existingLine, `차액 ${formatNumber(-balance)}원 결제`, "잔액: 없음"];
      } else {
        creditLines = [`잔액: ${formatNumber(balance)}원`];
      }
    }

    return [
      ...(headerVisible ? [header] : []),
      ...itemLines,
      ...totalLine,
      ...transferLine,
      ...creditLines,
    ].join("\n");
  }, [
    headerVisible,
    includeHeader,
    membershipType,
    staffName,
    paymentAmount,
    extraCredit,
    selectedItems,
    totalPrice,
    existingBalance,
    transferEnabled,
    transferAmount,
    transferName,
    balance,
  ]);

  const [editableText, setEditableText] = useState("");
  useEffect(() => {
    setEditableText(finalText);
  }, [finalText]);

  async function handleCopy() {
    const cleaned = editableText.split(RED_DOT).join("");
    await navigator.clipboard.writeText(cleaned);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <img src="/logo.png" alt="완전자동차팅" className="h-7 w-auto" />
            완전자동차팅
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white disabled:bg-gray-300"
            >
              {syncing ? "동기화 중..." : "홈페이지 수가 동기화"}
            </button>
            <Link href="/rules" className="text-sm text-gray-500 hover:text-gray-800">
              상세설정 →
            </Link>
          </div>
        </div>
      </header>
      {syncMessage && (
        <p className="mx-auto max-w-7xl px-6 pt-2 text-sm text-gray-600">{syncMessage}</p>
      )}
      {loadError && (
        <p className="mx-auto max-w-7xl px-6 pt-2 text-sm text-red-500">
          시술 데이터를 불러오지 못했습니다: {loadError}
        </p>
      )}

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 lg:grid-cols-7">
        {/* 좌측: 검색 입력 + 자동완성 */}
        <section className="rounded-lg border border-gray-200 bg-white p-4 lg:col-span-4">
          <h2 className="mb-3 text-sm font-medium text-gray-500">시술 입력</h2>

          <div className="relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="예: 써마지 600샷 체험가"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />

            {candidates.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
                {candidates.map((c, idx) => (
                  <button
                    key={c.name}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => selectCandidate(c)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                      idx === highlightedIndex
                        ? "bg-gray-800 text-white"
                        : "bg-white text-gray-700"
                    }`}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="ml-2 shrink-0 tabular-nums">
                      {formatNumber(c.price)}원
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="mt-2 text-xs text-gray-400">
            입력 후 방향키로 후보를 고르고 Enter로 바로 추가하세요. 수량은
            아래 목록에서 조율할 수 있습니다.
          </p>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="시술직접 입력"
              className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
            <input
              type="number"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder="세전 금액"
              className="w-28 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
            <button
              onClick={addManualItem}
              disabled={!manualName.trim() || !manualPrice}
              className="shrink-0 rounded-md bg-gray-800 px-3 py-2 text-sm text-white disabled:bg-gray-300"
            >
              직접추가
            </button>
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3">
            {selectedItems.length === 0 ? (
              <p className="text-xs text-gray-400">추가된 시술이 없습니다.</p>
            ) : (
              <div className="flex flex-col">
                <div className="flex items-center gap-2 border-b border-gray-200 pb-2 text-xs text-gray-500">
                  <span className="min-w-0 flex-1">시술명</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="w-14 text-right">가격</span>
                    <span className="w-8 text-center">수량</span>
                    <span className="w-20 text-right">합계</span>
                    <span className="w-3" />
                  </div>
                </div>
                {selectedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center gap-2 border-b border-gray-50 py-2 text-sm"
                  >
                    <AutoGrowInput
                      value={item.name}
                      onChange={(v) => updateItemName(item.id, v)}
                      className="min-w-[140px] flex-1 rounded border border-transparent px-1 py-0.5 leading-snug outline-none hover:border-gray-200 focus:border-gray-400"
                    />
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="w-14 text-right tabular-nums text-gray-500">
                        {formatNumber(item.basePrice)}
                      </span>
                      <CountDial
                        count={item.count}
                        onChange={(count) => updateItemCount(item.id, count)}
                      />
                      <span className="w-20 text-right tabular-nums">
                        {formatNumber(computeUnitPrice(item))}
                      </span>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-gray-400 hover:text-gray-700"
                        aria-label="삭제"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedItems.length > 0 && (
            <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3 text-sm font-semibold text-gray-900">
              <span>총 금액</span>
              <span className="tabular-nums">{formatNumber(totalPrice)}원</span>
            </div>
          )}
        </section>

        {/* 우측: 선택 결과 + 계산 + 최종 텍스트 */}
        <section className="rounded-lg border border-gray-200 bg-white p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-500">선택 결과</h2>
            <button
              onClick={clearAllItems}
              disabled={selectedItems.length === 0}
              className="text-xs font-medium text-gray-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              CLEAR
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <textarea
              value={editableText}
              onChange={(e) => setEditableText(e.target.value)}
              className="h-64 w-full resize-none whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 outline-none focus:border-gray-400"
            />

            <button
              onClick={handleCopy}
              disabled={selectedItems.length === 0}
              className="rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {copied ? "복사됨!" : "최종차트 복사"}
            </button>

            <div className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={(e) => setIncludeHeader(e.target.checked)}
                  className="h-4 w-4"
                />
                회원권
              </label>
              <label className="flex flex-1 items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={transferEnabled}
                  onChange={(e) => setTransferEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                양도
              </label>
            </div>

            {includeHeader && (
              <div className="flex flex-col gap-3 rounded-md border border-gray-100 p-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      lang="ko"
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      maxLength={4}
                      size={4}
                      placeholder="이름"
                      className="w-16 rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-gray-400"
                    />
                    <span className="text-gray-500">S</span>
                  </div>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={membershipType === "VIP"}
                      onChange={() => setMembershipType("VIP")}
                      className="h-4 w-4"
                    />
                    <span>VIP</span>
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={membershipType === "쁘띠"}
                      onChange={() => setMembershipType("쁘띠")}
                      className="h-4 w-4"
                    />
                    <span>쁘띠</span>
                  </label>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-end gap-2">
                    <span className="w-24 shrink-0 text-right text-gray-600">결제금액</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={creditInput}
                        onChange={(e) => setCreditInput(e.target.value)}
                        className="w-32 rounded-md border border-gray-200 px-2 py-1.5 text-right outline-none focus:border-gray-400"
                      />
                      <span className="shrink-0 text-xs text-gray-400">원</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <span className="w-24 shrink-0 text-right text-gray-600">+ 추가적립금</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={extraCreditInput}
                        onChange={(e) => setExtraCreditInput(e.target.value)}
                        className="w-32 rounded-md border border-gray-200 px-2 py-1.5 text-right outline-none focus:border-gray-400"
                      />
                      <span className="shrink-0 text-xs text-gray-400">원</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <span className="w-24 shrink-0 text-right text-gray-600">+ 기존적립금</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={existingBalanceInput}
                        onChange={(e) => setExistingBalanceInput(e.target.value)}
                        className="w-32 rounded-md border border-gray-200 px-2 py-1.5 text-right outline-none focus:border-gray-400"
                      />
                      <span className="shrink-0 text-xs text-gray-400">원</span>
                    </div>
                  </div>

                  <div className="my-1 border-t border-dashed border-gray-300" />

                  <div className="flex items-center justify-end gap-2 text-gray-700">
                    <span className="w-24 shrink-0 text-right">− 총 금액</span>
                    <span className="tabular-nums">{formatNumber(totalPrice)}원</span>
                  </div>

                  {transferEnabled && (
                    <div className="flex items-center justify-end gap-2 py-1">
                      <span className="w-24 shrink-0 text-right text-gray-600">양도금액</span>
                      <input
                        type="text"
                        lang="ko"
                        value={transferName}
                        onChange={(e) => setTransferName(e.target.value)}
                        placeholder="이름"
                        className="w-32 rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-gray-400"
                      />
                      <span className="shrink-0 text-gray-600">님께</span>
                      <input
                        type="number"
                        value={transferAmountInput}
                        onChange={(e) => setTransferAmountInput(e.target.value)}
                        className="w-32 rounded-md border border-gray-200 px-2 py-1.5 text-right outline-none focus:border-gray-400"
                      />
                      <span className="shrink-0 text-xs text-gray-400">원</span>
                    </div>
                  )}

                  <div className="my-1 border-t-2 border-gray-400" />

                  <div className="flex items-center justify-end gap-2 font-semibold text-gray-900">
                    <span className="w-24 shrink-0 text-right">잔액</span>
                    <span className="tabular-nums">{formatNumber(balance)}원</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-gray-200 bg-white px-6 py-4 text-center text-xs text-gray-400">
        © 2026. Designed & Developed by EUNBIN GA
      </footer>
    </div>
  );
}
