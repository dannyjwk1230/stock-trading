import { supabase } from "./supabaseClient";

const backendUrl = (
  import.meta.env.VITE_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8000")
).replace(/\/$/, "");

async function getAccessToken() {
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

async function backendRequest(path, options = {}) {
  const token = await getAccessToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${backendUrl}${path}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.detail === "string"
      ? payload.detail
      : payload.detail?.message || payload.message || "백엔드 요청에 실패했습니다.";
    throw new Error(detail);
  }

  return payload;
}

export function getBackendConfig() {
  return backendRequest("/api/config");
}

export function getKiwoomStatus(mode = "mock") {
  const params = new URLSearchParams();
  params.set("mode", mode);
  return backendRequest(`/api/brokerage/kiwoom/status?${params.toString()}`);
}

export function getBrokerageAccount(mode = "mock") {
  const params = new URLSearchParams();
  params.set("mode", mode);
  return backendRequest(`/api/brokerage/kiwoom/account?${params.toString()}`);
}

export function getHoldingLocks(mode = "mock") {
  const params = new URLSearchParams();
  params.set("mode", mode);
  return backendRequest(`/api/brokerage/kiwoom/holding-locks?${params.toString()}`);
}

export function setHoldingLock({ mode = "mock", code, lockedQuantity = 0, note = "" } = {}) {
  return backendRequest(`/api/brokerage/kiwoom/holding-locks/${encodeURIComponent(code)}`, {
    method: "PUT",
    body: JSON.stringify({ mode, lockedQuantity, note })
  });
}

export function deleteHoldingLock({ mode = "mock", code } = {}) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  return backendRequest(`/api/brokerage/kiwoom/holding-locks/${encodeURIComponent(code)}?${params.toString()}`, {
    method: "DELETE"
  });
}

export function connectKiwoomCredentials(payload) {
  return backendRequest("/api/brokerage/kiwoom/connect", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function disconnectKiwoomCredentials(mode = "mock") {
  const params = new URLSearchParams();
  params.set("mode", mode);
  return backendRequest(`/api/brokerage/kiwoom/connect?${params.toString()}`, {
    method: "DELETE"
  });
}

export function searchMarketStocks({ query = "", limit = 30, mode = "mock" } = {}) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  params.set("limit", String(limit));
  params.set("mode", mode);
  return backendRequest(`/api/market/stocks?${params.toString()}`);
}

export function getMarketStock(code, { mode = "mock" } = {}) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  return backendRequest(`/api/market/stocks/${encodeURIComponent(code)}?${params.toString()}`);
}

export function getMarketOrderBook(code, { mode = "mock" } = {}) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  return backendRequest(`/api/market/stocks/${encodeURIComponent(code)}/orderbook?${params.toString()}`);
}

export function getMarketChartCandles(code, { mode = "mock", interval = "10m", limit = 160 } = {}) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  params.set("interval", interval);
  params.set("limit", String(limit));
  return backendRequest(`/api/market/stocks/${encodeURIComponent(code)}/chart?${params.toString()}`);
}

export async function getKiwoomRealtimeSocketConfig({ mode = "mock", symbols = [], types = ["0B", "0D"] } = {}) {
  const token = await getAccessToken();
  const url = new URL(`${backendUrl}/ws/kiwoom/realtime`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("mode", mode);
  url.searchParams.set("symbols", symbols.filter(Boolean).join(","));
  url.searchParams.set("types", types.filter(Boolean).join(","));
  return { url: url.toString(), accessToken: token };
}

export function requestStrategyAnalysis(payload) {
  return backendRequest("/api/analysis/strategy-summary", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function runStrategyBacktest(payload) {
  return backendRequest("/api/backtests/run", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getBacktestHistory(mode = "mock", limit = 30) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  params.set("limit", String(limit));
  return backendRequest(`/api/backtests/history?${params.toString()}`);
}

export function planStrategyRuntime(payload) {
  return backendRequest("/api/strategies/runtime-plan", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function syncStrategyScheduler(payload) {
  return backendRequest("/api/strategies/scheduler/sync", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getStrategySchedulerStatus(mode = "mock") {
  const params = new URLSearchParams();
  params.set("mode", mode);
  return backendRequest(`/api/strategies/scheduler/status?${params.toString()}`);
}

export function getStrategyRuntimeHistory(mode = "mock", limit = 100) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  params.set("limit", String(limit));
  return backendRequest(`/api/strategies/history?${params.toString()}`);
}

export function stopStrategyScheduler(mode = "mock") {
  const params = new URLSearchParams();
  params.set("mode", mode);
  return backendRequest(`/api/strategies/scheduler/stop?${params.toString()}`, {
    method: "POST"
  });
}

export function recordStrategyFill(payload) {
  return backendRequest("/api/strategies/scheduler/fills", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function approveStrategyAction(payload) {
  return backendRequest("/api/strategies/scheduler/actions/approve", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function rejectStrategyAction(payload) {
  return backendRequest("/api/strategies/scheduler/actions/reject", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function cancelStrategyActionOrder(payload) {
  return backendRequest("/api/strategies/scheduler/actions/cancel-order", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function amendStrategyActionOrder(payload) {
  return backendRequest("/api/strategies/scheduler/actions/amend-order", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function submitBackendOrder(payload) {
  return backendRequest("/api/brokerage/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function amendBackendOrder(payload) {
  return backendRequest("/api/brokerage/orders/amend", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function cancelBackendOrder(payload) {
  return backendRequest("/api/brokerage/orders/cancel", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getBackendOrderStatus({ mode = "mock", orderNo = "", code = "" } = {}) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (orderNo) params.set("orderNo", orderNo);
  if (code) params.set("code", code);
  return backendRequest(`/api/brokerage/orders/status?${params.toString()}`);
}
