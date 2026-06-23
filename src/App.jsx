import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart, createSeriesMarkers } from "lightweight-charts";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { amendBackendOrder, amendStrategyActionOrder, approveStrategyAction, cancelBackendOrder, cancelStrategyActionOrder, connectKiwoomCredentials, deleteHoldingLock, disconnectKiwoomCredentials, getBackendOrderStatus, getBacktestHistory, getBrokerageAccount, getKiwoomRealtimeSocketConfig, getKiwoomStatus, getMarketChartCandles, getMarketOrderBook, getMarketStock, getStrategyRuntimeHistory, getStrategySchedulerStatus, rejectStrategyAction, runStrategyBacktest, searchMarketStocks, setHoldingLock, stopStrategyScheduler, submitBackendOrder, syncStrategyScheduler } from "./lib/backendClient";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";
import { loadUserAppState, saveUserAppState } from "./lib/userAppState";

const THEME_KEY = "aerotrade.theme";
const NICKNAME_KEY = "aerotrade.nickname";
const PIN_KEY = "aerotrade.pin";
const EXECUTION_MODE_KEY = "aerotrade.executionMode";
const AUTH_SESSION_KEY = "aerotrade.authSession";
const FAVORITE_GROUPS_KEY = "aerotrade.favoriteGroups";
const PIN_UNLOCK_DURATION_MS = 10 * 60 * 1000;
const MAX_ACTIVE_STRATEGIES_PER_MODE = 3;
const MAX_STRATEGIES_PER_MODE = 8;
const DEFAULT_STRATEGY_LOSS_LIMIT = "500,000";
const DEFAULT_STRATEGY_ORDER_LIMIT = "2,000,000";
const STRATEGY_POSITION_MODES = [
  {
    value: "distributed",
    label: "분산 투자",
    description: "검색 대상 중 여러 종목에 전략별 주문 한도를 나눠 적용합니다."
  },
  {
    value: "single",
    label: "단일 투자",
    description: "신호가 가장 강한 한 종목에만 전략별 주문 한도를 적용합니다."
  }
];
const SIGNAL_CONFLICT_PRIORITY_OPTIONS = [
  {
    value: "sell",
    label: "매도 우선",
    description: "매수와 매도 신호가 동시에 발생하면 보유 리스크를 줄이기 위해 매도를 우선합니다."
  },
  {
    value: "buy",
    label: "매수 우선",
    description: "매수와 매도 신호가 동시에 발생하면 진입 기회를 우선합니다."
  }
];

const PinAuthContext = createContext({
  pinUnlocked: false,
  requirePin: () => false
});

function usePinAuth() {
  return useContext(PinAuthContext);
}

const validPages = ["dashboard", "market", "strategy", "backtest", "record", "setting", "login"];

const navItems = [
  { page: "dashboard", label: "대시보드", icon: "dashboard" },
  { page: "market", label: "시장", icon: "monitoring" },
  { page: "strategy", label: "전략 관리", icon: "psychology" },
  { page: "backtest", label: "백테스트", icon: "science" },
  { page: "record", label: "기록 및 알림", icon: "history" },
  { page: "setting", label: "설정", icon: "settings" }
];

const stocks = [];

const initialGroups = {};

const OPEN_ORDER_STATUSES = ["접수", "부분 체결"];

const holdingQuantities = {};

const accountProfiles = {
  real: {
    label: "실전 투자 모드",
    shortLabel: "실전",
    orderableCash: 0,
    holdings: holdingQuantities,
    hasAccountData: false,
    dashboardCards: [
      ["총 자산", "--", "--", "neutral"],
      ["오늘 실현손익", "--", "--", "neutral"],
      ["주문 가능 현금", "--", "--", "neutral"],
      ["주식 평가액", "--", "--", "neutral"]
    ],
    riskBars: [
      ["일중 손실 한도", "--", "bg-secondary"],
      ["주문 대기 금액", "--", "bg-primary"],
      ["전략 집중도", "--", "bg-tertiary"]
    ]
  },
  mock: {
    label: "모의 투자 모드",
    shortLabel: "모의",
    orderableCash: 0,
    holdings: {},
    hasAccountData: false,
    dashboardCards: [
      ["총 자산", "--", "--", "neutral"],
      ["오늘 실현손익", "--", "--", "neutral"],
      ["주문 가능 현금", "--", "--", "neutral"],
      ["주식 평가액", "--", "--", "neutral"]
    ],
    riskBars: [
      ["일중 손실 한도", "--", "bg-tertiary"],
      ["주문 대기 금액", "--", "bg-primary"],
      ["전략 집중도", "--", "bg-secondary"]
    ]
  }
};

const emptyAccountProfiles = {
  real: {
    label: "실전 투자 모드",
    shortLabel: "실전",
    orderableCash: 0,
    holdings: {},
    hasAccountData: false,
    dashboardCards: [
      ["총 자산", "--", "--", "neutral"],
      ["오늘 실현손익", "--", "--", "neutral"],
      ["주문 가능 현금", "--", "--", "neutral"],
      ["주식 평가액", "--", "--", "neutral"]
    ],
    riskBars: [
      ["일중 손실 한도", "--", "bg-secondary"],
      ["주문 대기 금액", "--", "bg-primary"],
      ["전략 집중도", "--", "bg-tertiary"]
    ]
  },
  mock: {
    label: "모의 투자 모드",
    shortLabel: "모의",
    orderableCash: 0,
    holdings: {},
    hasAccountData: false,
    dashboardCards: [
      ["총 자산", "--", "--", "neutral"],
      ["오늘 실현손익", "--", "--", "neutral"],
      ["주문 가능 현금", "--", "--", "neutral"],
      ["주식 평가액", "--", "--", "neutral"]
    ],
    riskBars: [
      ["일중 손실 한도", "--", "bg-secondary"],
      ["주문 대기 금액", "--", "bg-primary"],
      ["전략 집중도", "--", "bg-tertiary"]
    ]
  }
};

function cloneAccountProfile(profile) {
  return {
    ...profile,
    holdings: { ...(profile.holdings || {}) },
    dashboardCards: (profile.dashboardCards || []).map((card) => [...card]),
    riskBars: (profile.riskBars || []).map((bar) => [...bar]),
    assetTrend: normalizeAssetTrendRows(profile.assetTrend)
  };
}

function createAccountProfilesByMode() {
  return {
    real: cloneAccountProfile(emptyAccountProfiles.real),
    mock: cloneAccountProfile(emptyAccountProfiles.mock)
  };
}

function normalizeAccountProfile(mode, profile) {
  const base = cloneAccountProfile(emptyAccountProfiles[mode] || emptyAccountProfiles.mock);
  if (!profile) return base;

  return {
    ...base,
    ...profile,
    label: base.label,
    shortLabel: base.shortLabel,
    orderableCash: Number(profile.orderableCash) || 0,
    holdings: { ...(profile.holdings || {}) },
    dashboardCards: profile.dashboardCards || base.dashboardCards,
    riskBars: profile.riskBars || base.riskBars,
    assetTrend: normalizeAssetTrendRows(profile.assetTrend),
    totalAsset: Number(profile.totalAsset) || getAccountDashboardValue(profile, "총 자산"),
    hasAccountData: profile.hasAccountData !== false
  };
}

const initialMarketOrders = [];

const marketOrdersByModeSeed = {
  real: initialMarketOrders,
  mock: initialMarketOrders.map((order) => ({
    ...order,
    id: order.id + 2000,
    status: order.status === "체결" ? "체결" : order.status === "취소" ? "취소" : "접수"
  }))
};

const DEFAULT_ORDER_MODE = "승인 후 주문";
const DEFAULT_NOTIFICATION_PREFERENCES = {
  orderFills: true,
  strategyStatus: true,
  systemHealth: false
};
const DEFAULT_MARKET_STATE = {
  selectedCode: "",
  tab: "all",
  chartInterval: "10m"
};
const MARKET_CHART_INTERVAL_OPTIONS = [
  { value: "10m", label: "10분봉" },
  { value: "daily", label: "일봉" }
];
const ASSET_TREND_PERIOD_OPTIONS = [
  { value: "daily", label: "일 단위" },
  { value: "monthly", label: "월 단위" }
];
const DEFAULT_BACKTEST_INPUT = {
  strategyId: "",
  symbol: "",
  startDate: "",
  tradingDays: "240",
  initialCash: "10,000,000",
  lastRunAt: "",
  history: []
};
const MAX_ACTIVITY_ITEMS = 120;
const MAX_ASSET_TREND_POINTS = 72;
const ASSET_TREND_VISIBLE_POINTS = 12;
const MAX_BACKTEST_TRADING_DAYS = 240;
const MAX_BACKTEST_HISTORY_ITEMS = 20;
const TRADING_FEE_RATE = Number(import.meta.env.VITE_TRADING_FEE_RATE || 0.00015);
const KOREA_MARKET_HOLIDAYS = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-02": "삼일절 대체휴일",
  "2026-05-01": "근로자의 날",
  "2026-05-05": "어린이날",
  "2026-05-25": "부처님오신날 대체휴일",
  "2026-06-03": "전국동시지방선거",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-28": "추석 대체휴일",
  "2026-10-05": "개천절 대체휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
  "2026-12-31": "연말 휴장"
};

function parseChartNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text || text === "--") return 0;
  const sign = text.includes("-") ? -1 : 1;
  const match = text.match(/\d+(?:\.\d+)?/u);
  if (!match) return 0;
  let number = Number(match[0]) * sign;
  if (text.includes("억")) number *= 100000000;
  else if (text.includes("만")) number *= 10000;
  return number;
}

function clampNumber(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function formatCompactChartValue(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 100000000) return `${(number / 100000000).toFixed(1)}억`;
  if (Math.abs(number) >= 10000) return `${Math.round(number / 10000).toLocaleString("ko-KR")}만`;
  return number.toLocaleString("ko-KR");
}

function getChartColor(element, cssVar, fallback) {
  const value = getComputedStyle(element || document.documentElement).getPropertyValue(cssVar).trim();
  return value || fallback;
}

function getChartTimestamp(rawTime, interval = "10m") {
  const now = new Date();
  const digits = String(rawTime || "").replace(/\D/g, "");
  if (digits.length === 6) {
    now.setHours(Number(digits.slice(0, 2)), Number(digits.slice(2, 4)), Number(digits.slice(4, 6)), 0);
  }
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  if (interval === "daily") {
    return Math.floor(Date.UTC(year, month, date, 0, 0, 0) / 1000);
  }
  const bucketMinutes = interval === "10m" ? 10 : 1;
  const hour = now.getHours();
  const minute = Math.floor(now.getMinutes() / bucketMinutes) * bucketMinutes;
  return Math.floor(Date.UTC(year, month, date, hour, minute, 0) / 1000);
}

function formatCurrencyChartValue(value) {
  const number = Number(value) || 0;
  return `${Math.round(number).toLocaleString("ko-KR")}원`;
}

function formatFeeRate(value = TRADING_FEE_RATE) {
  return `${(Number(value || 0) * 100).toFixed(4)}%`;
}

function estimateTradingFee(amount, feeRate = TRADING_FEE_RATE) {
  const numericAmount = Number(amount) || 0;
  if (numericAmount <= 0) return 0;
  return Math.ceil(numericAmount * Math.max(0, Number(feeRate) || 0));
}

function formatSignedCurrencyChartValue(value) {
  const number = Number(value) || 0;
  if (!number) return "0원";
  return `${number > 0 ? "+" : ""}${Math.round(number).toLocaleString("ko-KR")}원`;
}

function getAccountDashboardCard(accountProfile, label) {
  return (accountProfile?.dashboardCards || []).find(([cardLabel]) => cardLabel === label);
}

function getAccountDashboardValue(accountProfile, label) {
  return parseChartNumber(getAccountDashboardCard(accountProfile, label)?.[1]);
}

function normalizeAssetTrendRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const value = parseChartNumber(row?.value);
      const time = typeof row?.time === "string" && row.time ? row.time : "";
      const label = typeof row?.label === "string" && row.label ? row.label : time.slice(5, 16) || "현재";
      return value > 0 ? { time, label, value, displayValue: formatCurrencyChartValue(value) } : null;
    })
    .filter(Boolean)
    .slice(-MAX_ASSET_TREND_POINTS);
}

function createAssetTrendPoint(accountProfile) {
  const value = Number(accountProfile?.totalAsset) || getAccountDashboardValue(accountProfile, "총 자산");
  if (!accountProfile || accountProfile.hasAccountData === false || value <= 0) return null;
  const time = getKoreanMinuteTimestamp();
  return {
    time,
    label: time.slice(5, 16),
    value,
    displayValue: formatCurrencyChartValue(value)
  };
}

function appendAssetTrendPoint(rows, accountProfile) {
  const point = createAssetTrendPoint(accountProfile);
  if (!point) return normalizeAssetTrendRows(rows);
  const currentRows = normalizeAssetTrendRows(rows);
  const last = currentRows[currentRows.length - 1];
  const nextRows = last?.time === point.time
    ? [...currentRows.slice(0, -1), point]
    : [...currentRows, point];
  return nextRows.slice(-MAX_ASSET_TREND_POINTS);
}

function buildAccountAssetTrendData(accountProfile) {
  const savedRows = normalizeAssetTrendRows(accountProfile?.assetTrend);
  if (savedRows.length) return savedRows;
  const point = createAssetTrendPoint(accountProfile);
  return point ? [point] : [];
}

function buildAssetTrendPeriodData(data, period = "daily") {
  const rows = normalizeAssetTrendRows(data);
  const grouped = new Map();

  rows.forEach((row) => {
    const key = period === "monthly" ? row.time.slice(0, 7) : row.time.slice(0, 10);
    if (!key) return;
    const current = grouped.get(key);
    grouped.set(key, {
      ...row,
      key,
      label: period === "monthly" ? key.replace("-", ".") : key.slice(5),
      snapshotCount: (current?.snapshotCount || 0) + 1
    });
  });

  return Array.from(grouped.values())
    .sort((first, second) => first.key.localeCompare(second.key))
    .slice(-ASSET_TREND_VISIBLE_POINTS);
}

function formatSignedPercentValue(value) {
  const number = Number(value) || 0;
  if (!number) return "0.0%";
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function buildAssetTrendSummary(data, period = "daily") {
  const latest = data[data.length - 1];
  const previous = data.length > 1 ? data[data.length - 2] : null;
  const change = latest && previous ? latest.value - previous.value : 0;
  const changeRate = latest && previous && previous.value > 0 ? (change / previous.value) * 100 : 0;
  const periodLabel = period === "monthly" ? "전월" : "전일";
  const countLabel = period === "monthly" ? "표시 개월" : "표시 일수";
  return [
    [`${periodLabel} 대비 손익`, latest && previous ? formatSignedCurrencyChartValue(change) : "--"],
    [`${periodLabel} 대비 수익률`, latest && previous ? formatSignedPercentValue(changeRate) : "--"],
    [countLabel, data.length ? `${data.length}/${ASSET_TREND_VISIBLE_POINTS}${period === "monthly" ? "개월" : "일"}` : "--"]
  ];
}

function getAccountProfitRate(accountProfile) {
  const directRate = parsePercentValue(accountProfile?.totalProfitRate);
  if (directRate) return directRate;
  const profitCard = getAccountDashboardCard(accountProfile, "총 평가손익");
  return parsePercentValue(profitCard?.[2]);
}

function getHoldingItemValue(item) {
  const evaluationAmount = parseChartNumber(item?.evaluationAmount);
  if (evaluationAmount > 0) return evaluationAmount;
  const quantity = parseChartNumber(item?.quantity);
  const currentPrice = parseChartNumber(item?.currentPrice || item?.currentPriceText);
  return quantity > 0 && currentPrice > 0 ? quantity * currentPrice : 0;
}

function formatRiskPercentValue(value) {
  const number = Number(value) || 0;
  return `${number.toFixed(1)}%`;
}

function getRiskToneByValue(value, warning = 50, danger = 75) {
  if (value >= danger) return "tertiary";
  if (value >= warning) return "primary";
  return "secondary";
}

function buildRiskChartData(accountProfile) {
  const totalAsset = Number(accountProfile?.totalAsset) || getAccountDashboardValue(accountProfile, "총 자산");
  const stockValue = Number(accountProfile?.stockValue) || getAccountDashboardValue(accountProfile, "주식 평가액");
  const orderableCash = Number(accountProfile?.orderableCash) || getAccountDashboardValue(accountProfile, "주문 가능 현금");
  const totalProfitLoss = Number(accountProfile?.totalProfitLoss) || getAccountDashboardValue(accountProfile, "총 평가손익");
  const totalProfitRate = getAccountProfitRate(accountProfile);
  const holdingItems = Array.isArray(accountProfile?.holdingItems) ? accountProfile.holdingItems : [];
  const holdingCount = holdingItems.length || Object.keys(accountProfile?.holdings || {}).length;
  const topHolding = holdingItems
    .map((item) => ({ name: item.name || item.code || "최대 보유", value: getHoldingItemValue(item) }))
    .sort((first, second) => second.value - first.value)[0];
  const stockWeight = totalAsset > 0 ? (stockValue / totalAsset) * 100 : 0;
  const cashWeight = totalAsset > 0 ? (orderableCash / totalAsset) * 100 : 0;
  const topHoldingWeight = totalAsset > 0 && topHolding?.value > 0
    ? (topHolding.value / totalAsset) * 100
    : holdingCount <= 1 ? stockWeight : 0;
  const exposureRisk = clampNumber(stockWeight) * 0.34;
  const concentrationRisk = clampNumber(topHoldingWeight) * 0.28;
  const lossRisk = clampNumber(totalProfitRate < 0 ? Math.abs(totalProfitRate) * 4 : Math.max(0, 8 - totalProfitRate) * 0.8, 0, 32);
  const liquidityRisk = clampNumber(25 - cashWeight, 0, 25) * 0.55;
  const diversificationRisk = holdingCount <= 0 ? 0 : holdingCount === 1 ? 14 : holdingCount <= 3 ? 8 : holdingCount <= 10 ? 3 : 7;
  const score = Math.round(clampNumber(exposureRisk + concentrationRisk + lossRisk + liquidityRisk + diversificationRisk));
  const level = score >= 70 ? "높음" : score >= 40 ? "주의" : "낮음";
  const tone = score >= 70 ? "tertiary" : score >= 40 ? "primary" : "secondary";

  return {
    score,
    level,
    tone,
    description: score >= 70
      ? "보유 비중이나 손익 변동을 낮춰야 하는 구간입니다."
      : score >= 40
        ? "노출 비중과 집중도를 계속 확인해야 합니다."
        : "현재 계좌 리스크는 비교적 안정적인 구간입니다.",
    items: [
      {
        label: "주식 비중",
        value: totalAsset > 0 ? formatRiskPercentValue(stockWeight) : "--",
        meta: "총자산 대비",
        tone: getRiskToneByValue(stockWeight, 65, 85)
      },
      {
        label: "최대 종목 비중",
        value: topHoldingWeight > 0 ? formatRiskPercentValue(topHoldingWeight) : "--",
        meta: topHolding?.name || "집중도",
        tone: getRiskToneByValue(topHoldingWeight, 25, 45)
      },
      {
        label: "총 평가손익률",
        value: totalProfitRate || totalProfitRate === 0 ? formatSignedPercentValue(totalProfitRate) : "--",
        meta: totalProfitLoss ? formatSignedCurrencyChartValue(totalProfitLoss) : "평가손익",
        tone: totalProfitRate < 0 ? "tertiary" : "secondary"
      },
      {
        label: "현금 비중",
        value: totalAsset > 0 ? formatRiskPercentValue(cashWeight) : "--",
        meta: orderableCash ? `주문 가능 ${formatCompactChartValue(orderableCash)}원` : "주문 가능 현금",
        tone: cashWeight < 10 ? "tertiary" : cashWeight < 25 ? "primary" : "secondary"
      },
      {
        label: "보유 종목 수",
        value: holdingCount ? `${holdingCount}개` : "--",
        meta: holdingCount === 1 ? "집중 점검" : "분산 상태",
        tone: holdingCount === 1 ? "tertiary" : holdingCount <= 3 ? "primary" : "secondary"
      }
    ]
  };
}

function normalizeStockCode(value) {
  let text = String(value || "").trim().toUpperCase();
  if (text.includes(":")) {
    text = text.split(":").pop();
  }
  text = text.replace(/[^0-9A-Z_]/g, "").replace(/_(AL|NX)$/u, "");
  if (/^A\d{6}$/u.test(text)) {
    text = text.slice(1);
  }
  return text;
}

function normalizeMarketStock(stock) {
  const code = normalizeStockCode(stock?.code);
  const name = String(stock?.name || code || "종목을 선택하세요").trim();
  const price = String(stock?.price || stock?.current || "--");
  return {
    code,
    name,
    market: stock?.market || "--",
    price,
    change: stock?.change || "--",
    value: stock?.value || "--",
    volume: stock?.volume || "--",
    sector: stock?.sector || "--",
    high: stock?.high || "--",
    low: stock?.low || "--",
    current: stock?.current || (price === "--" ? "0" : price),
    marketCap: stock?.marketCap || "--",
    per: stock?.per || "--",
    pbr: stock?.pbr || "--",
    roe: stock?.roe || "--",
    rsi: stock?.rsi || "--",
    macd: stock?.macd || "--",
    ma20: stock?.ma20 || "--",
    foreign: stock?.foreign || "--",
    institution: stock?.institution || "--",
    summary: stock?.summary || "아직 상세 분석 데이터가 없습니다. 실시간 시세/기업 데이터 연동 후 업데이트됩니다."
  };
}

function mergeStockList(...stockLists) {
  const byCode = new Map();
  stockLists.flat().forEach((stock) => {
    const normalized = normalizeMarketStock(stock);
    if (normalized.code) byCode.set(normalized.code, { ...(byCode.get(normalized.code) || {}), ...normalized });
  });
  return Array.from(byCode.values());
}

const indicatorDefinitions = [
  {
    name: "이동평균선",
    category: "추세",
    usage: "5일선, 20일선, 60일선 돌파/이탈"
  },
  {
    name: "지수이동평균선",
    category: "추세/단타",
    usage: "9EMA, 20EMA 기준 단타 추세 판단"
  },
  {
    name: "RSI",
    category: "모멘텀/과열",
    usage: "RSI 30 이하 매수, 70 이상 매도"
  },
  {
    name: "MACD",
    category: "추세/모멘텀",
    usage: "MACD 골든크로스, 데드크로스"
  },
  {
    name: "볼린저밴드",
    category: "변동성/평균회귀",
    usage: "하단 터치 후 반등, 밴드 상단 돌파"
  },
  {
    name: "거래량",
    category: "수급",
    usage: "평균 거래량 대비 급증 여부"
  },
  {
    name: "거래대금",
    category: "유동성/필터",
    usage: "거래 가능한 종목 필터링"
  },
  {
    name: "현재가",
    category: "가격",
    usage: "현재가가 입력한 금액 이상/이하인지 판단"
  },
  {
    name: "보유 수익률",
    category: "수익/청산",
    usage: "평균단가 대비 수익률 기준 익절/손절"
  },
  {
    name: "보유 손익",
    category: "수익/청산",
    usage: "평균단가와 보유 수량 기준 손익 금액 판단"
  },
  {
    name: "VWAP",
    category: "단타/기관 기준가",
    usage: "현재가가 VWAP 위인지 아래인지 판단"
  },
  {
    name: "ATR",
    category: "리스크/손절",
    usage: "변동성 기반 손절폭 계산"
  },
  {
    name: "동력률",
    category: "단타/검색",
    usage: "당일 급등락 종목 탐색"
  }
];

const conditionIndicatorOptions = indicatorDefinitions.map((indicator) => indicator.name);
const CONDITION_LOGIC_OPTIONS = [
  { value: "and", label: "AND" },
  { value: "or", label: "OR" }
];

const indicatorConditionRules = {
  이동평균선: {
    operators: [
      { value: "상향 돌파", defaultFor: ["buy"], valueType: "select", valueOptions: ["5일선", "20일선", "60일선"], defaultValue: "20일선" },
      { value: "하향 이탈", defaultFor: ["sell"], valueType: "select", valueOptions: ["5일선", "20일선", "60일선"], defaultValue: "20일선" }
    ]
  },
  지수이동평균선: {
    operators: [
      { value: "상향 돌파", defaultFor: ["buy"], valueType: "select", valueOptions: ["9EMA", "20EMA"], defaultValue: "20EMA" },
      { value: "하향 이탈", defaultFor: ["sell"], valueType: "select", valueOptions: ["9EMA", "20EMA"], defaultValue: "20EMA" }
    ]
  },
  RSI: {
    operators: [
      { value: "이하", defaultFor: ["buy"], valueType: "number", defaultValue: "30", unit: "RSI", placeholder: "30", min: 0, max: 100 },
      { value: "이상", defaultFor: ["sell"], valueType: "number", defaultValue: "70", unit: "RSI", placeholder: "70", min: 0, max: 100 }
    ]
  },
  MACD: {
    operators: [
      { value: "골든크로스", defaultFor: ["buy"], valueType: "none", displayValue: "신호선 기준" },
      { value: "데드크로스", defaultFor: ["sell"], valueType: "none", displayValue: "신호선 기준" }
    ]
  },
  볼린저밴드: {
    operators: [
      { value: "하단 터치 후 반등", defaultFor: ["buy"], valueType: "select", valueOptions: ["20일/2σ", "20일/2.5σ", "60일/2σ"], defaultValue: "20일/2σ" },
      { value: "상단 돌파", defaultFor: ["sell"], valueType: "select", valueOptions: ["20일/2σ", "20일/2.5σ", "60일/2σ"], defaultValue: "20일/2σ" }
    ]
  },
  거래량: {
    operators: [
      { value: "급증", defaultFor: ["buy", "sell"], valueType: "number", defaultValue: "120", prefix: "평균 대비", unit: "% 이상", placeholder: "120", min: 1 }
    ]
  },
  거래대금: {
    operators: [
      { value: "필터 통과", defaultFor: ["buy", "sell"], valueType: "number", defaultValue: "500", unit: "억 이상", placeholder: "500", min: 1 }
    ]
  },
  현재가: {
    operators: [
      { value: "이하", defaultFor: ["buy"], valueType: "number", defaultValue: "100000", unit: "원 이하", placeholder: "100000", min: 1 },
      { value: "이상", defaultFor: ["sell"], valueType: "number", defaultValue: "100000", unit: "원 이상", placeholder: "100000", min: 1 }
    ]
  },
  "보유 수익률": {
    operators: [
      { value: "이상", defaultFor: ["sell"], valueType: "number", defaultValue: "5", unit: "% 이상", placeholder: "5" },
      { value: "이하", defaultFor: ["sell"], valueType: "number", defaultValue: "-3", unit: "% 이하", placeholder: "-3" }
    ]
  },
  "보유 손익": {
    operators: [
      { value: "이상", defaultFor: ["sell"], valueType: "number", defaultValue: "100000", unit: "원 이상", placeholder: "100000" },
      { value: "이하", defaultFor: ["sell"], valueType: "number", defaultValue: "-50000", unit: "원 이하", placeholder: "-50000" }
    ]
  },
  VWAP: {
    operators: [
      { value: "VWAP 위", defaultFor: ["buy"], valueType: "none", displayValue: "현재가 기준" },
      { value: "VWAP 아래", defaultFor: ["sell"], valueType: "none", displayValue: "현재가 기준" }
    ]
  },
  ATR: {
    operators: [
      { value: "손절폭 계산", defaultFor: ["sell"], valueType: "number", defaultValue: "2", unit: "ATR", placeholder: "2", min: 0.1 }
    ]
  },
  동력률: {
    operators: [
      { value: "급등락 탐색", defaultFor: ["buy", "sell"], valueType: "number", defaultValue: "10", prefix: "상위", unit: "% 이내", placeholder: "10", min: 1, max: 100 }
    ]
  }
};

const filterOnlyIndicators = new Set(["거래량", "거래대금"]);
const oppositeOperatorPairs = [
  ["상향 돌파", "하향 이탈"],
  ["골든크로스", "데드크로스"],
  ["VWAP 위", "VWAP 아래"],
  ["하단 터치 후 반등", "상단 돌파"]
];

function normalizeIndicatorName(indicator) {
  const value = String(indicator || "").trim();
  const legacyMap = {
    "이동평균선, MA/SMA": "이동평균선",
    "지수이동평균선, EMA": "지수이동평균선",
    "체결강도": "거래량",
    "거래량 증가율": "거래량",
    "거래량 감소율": "거래량",
    "외국인 순매수": "거래대금",
    "기관 순매수": "거래대금",
    "손절률": "ATR",
    "수익률": "보유 수익률",
    "손익": "보유 손익",
    "손익금액": "보유 손익",
    "금액": "보유 손익"
  };

  return legacyMap[value] || value || conditionIndicatorOptions[0];
}

function getIndicatorConditionRule(indicator) {
  const normalizedIndicator = normalizeIndicatorName(indicator);
  return indicatorConditionRules[normalizedIndicator] || indicatorConditionRules[conditionIndicatorOptions[0]];
}

function getDefaultOperatorRule(indicator, side = "buy") {
  const rule = getIndicatorConditionRule(indicator);
  return rule.operators.find((operator) => operator.defaultFor?.includes(side)) || rule.operators[0];
}

function getConditionOperatorRule(indicator, operator, side = "buy") {
  const rule = getIndicatorConditionRule(indicator);
  return rule.operators.find((item) => item.value === operator) || getDefaultOperatorRule(indicator, side);
}

function getConditionOperatorOptions(indicator) {
  return getIndicatorConditionRule(indicator).operators.map((operator) => operator.value);
}

function getOperatorDefaultValue(operatorRule, side = "buy") {
  if (!operatorRule) return "";
  if (typeof operatorRule.defaultValue === "object") {
    return operatorRule.defaultValue?.[side] || operatorRule.defaultValue?.default || "";
  }
  return operatorRule.defaultValue || operatorRule.valueOptions?.[0] || "";
}

function normalizeConditionOperator(indicator, operator, side = "buy") {
  return getConditionOperatorRule(indicator, operator, side).value;
}

function extractConditionNumber(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? match[0] : "";
}

function normalizeConditionValue(indicator, operator, value, side = "buy") {
  const operatorRule = getConditionOperatorRule(indicator, operator, side);
  if (operatorRule.valueType === "none") return "";

  const fallbackValue = getOperatorDefaultValue(operatorRule, side);
  const rawValue = String(value ?? "").trim();

  if (operatorRule.valueType === "select") {
    const options = operatorRule.valueOptions || [];
    if (!rawValue) return fallbackValue || options[0] || "";
    return options.find((option) => option === rawValue) ||
      options.find((option) => rawValue.includes(option) || option.includes(rawValue)) ||
      fallbackValue ||
      options[0] ||
      "";
  }

  if (operatorRule.valueType === "number") {
    if (!rawValue) return fallbackValue;
    if (/^-?\d*([.,]\d*)?$/.test(rawValue)) return rawValue.replace(",", ".");
    return extractConditionNumber(rawValue) || fallbackValue;
  }

  return rawValue || fallbackValue;
}

function normalizeStrategyCondition(condition, side = "buy", fallbackLogic = "and") {
  const fallback = createEmptyCondition(side);
  const source = Array.isArray(condition)
    ? condition
    : [condition?.indicator, condition?.operator, condition?.value, condition?.logic || condition?.conditionLogic];
  const indicator = normalizeIndicatorName(source?.[0] || fallback[0]);
  const operator = normalizeConditionOperator(indicator, source?.[1] || fallback[1], side);
  const value = normalizeConditionValue(indicator, operator, source?.[2], side);
  const logic = normalizeConditionLogic(source?.[3] || fallbackLogic);
  return [indicator, operator, value, logic];
}

function createEmptyCondition(side = "buy") {
  return side === "sell" ? ["RSI", "이상", "70"] : ["이동평균선", "상향 돌파", "20일선"];
}

function cloneStrategyConditions(conditions, side = "buy", fallbackLogic = "and") {
  const source = Array.isArray(conditions) && conditions.length ? conditions : [createEmptyCondition(side)];
  return source.map((condition, index) => normalizeStrategyCondition(condition, side, index === 0 ? "and" : fallbackLogic));
}

function normalizeConditionLogic(value) {
  return value === "or" ? "or" : "and";
}

function createStageId(side = "buy") {
  return `${side}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createStrategyStage(side = "buy", order = 1, conditions = null, allocation = "") {
  const isPrimary = order === 1;
  return {
    id: isPrimary ? `${side}-primary` : createStageId(side),
    allocation: allocation || (isPrimary ? "50" : "25"),
    triggerType: isPrimary ? "conditions" : "percent",
    triggerOperator: isPrimary ? "충족" : side === "buy" ? "하락" : "상승",
    triggerValue: isPrimary ? "" : side === "buy" ? "3" : "5",
    conditionLogic: "and",
    conditions: isPrimary ? cloneStrategyConditions(conditions, side) : []
  };
}

function cloneStrategyStages(strategy, side = "buy") {
  const stageKey = side === "buy" ? "buyStages" : "sellStages";
  const conditionKey = side === "buy" ? "buyConditions" : "sellConditions";
  const hasExplicitStages = Object.prototype.hasOwnProperty.call(strategy || {}, stageKey);
  const sourceStages = hasExplicitStages && Array.isArray(strategy?.[stageKey])
    ? strategy[stageKey]
    : [createStrategyStage(side, 1, strategy?.[conditionKey])];

  return sourceStages.map((stage, index) => {
    const isPrimary = index === 0;
    const fallback = createStrategyStage(side, index + 1, isPrimary ? strategy?.[conditionKey] : null);
    const stageConditionLogic = normalizeConditionLogic(stage.conditionLogic ?? fallback.conditionLogic);
    return {
      ...fallback,
      ...stage,
      id: stage.id || fallback.id,
      allocation: String(stage.allocation ?? fallback.allocation),
      triggerType: isPrimary ? "conditions" : "percent",
      triggerOperator: isPrimary ? "충족" : stage.triggerOperator || fallback.triggerOperator,
      triggerValue: isPrimary ? "" : String(stage.triggerValue ?? fallback.triggerValue),
      conditionLogic: isPrimary ? stageConditionLogic : "and",
      conditions: isPrimary ? cloneStrategyConditions(stage.conditions || strategy?.[conditionKey], side, stageConditionLogic) : []
    };
  });
}

function getSignalPriorityValue(strategy) {
  return strategy?.signalConflictPriority === "buy" ? "buy" : "sell";
}

function getSignalPriorityOption(strategy) {
  const priority = getSignalPriorityValue(strategy);
  return SIGNAL_CONFLICT_PRIORITY_OPTIONS.find((option) => option.value === priority) || SIGNAL_CONFLICT_PRIORITY_OPTIONS[0];
}

function getSignalSideLabel(side) {
  return side === "buy" ? "매수" : side === "sell" ? "매도" : "대기";
}

function getPrimaryStageConditions(strategy, side) {
  const stages = cloneStrategyStages(strategy, side);
  return cloneStrategyConditions(stages[0]?.conditions, side);
}

function normalizeConditionForCompare(condition, side) {
  const [indicator, operator, value] = normalizeStrategyCondition(condition, side);
  return [indicator, operator, String(value || "").trim()];
}

function parseConditionNumber(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function getConditionRange(operator, value) {
  const numberValue = parseConditionNumber(value);
  if (numberValue === null) return null;
  if (operator === "이상") return [numberValue, Number.POSITIVE_INFINITY];
  if (operator === "이하") return [Number.NEGATIVE_INFINITY, numberValue];
  return null;
}

function rangesOverlap(firstRange, secondRange) {
  if (!firstRange || !secondRange) return false;
  return Math.max(firstRange[0], secondRange[0]) <= Math.min(firstRange[1], secondRange[1]);
}

function areOppositeOperators(firstOperator, secondOperator) {
  return oppositeOperatorPairs.some(([first, second]) =>
    (firstOperator === first && secondOperator === second) ||
    (firstOperator === second && secondOperator === first)
  );
}

function formatConditionText(condition, side) {
  const [indicator, operator, value] = normalizeStrategyCondition(condition, side);
  const rule = getConditionOperatorRule(indicator, operator, side);
  const valueText = rule.valueType === "none" ? "" : ` ${value}`;
  return `${indicator} ${operator}${valueText}`;
}

function createConditionConflictDetail(buyCondition, sellCondition) {
  const [buyIndicator, buyOperator, buyValue] = normalizeConditionForCompare(buyCondition, "buy");
  const [sellIndicator, sellOperator, sellValue] = normalizeConditionForCompare(sellCondition, "sell");

  if (buyIndicator !== sellIndicator) return null;
  if (filterOnlyIndicators.has(buyIndicator)) return null;
  if (areOppositeOperators(buyOperator, sellOperator)) return null;

  const buyText = formatConditionText(buyCondition, "buy");
  const sellText = formatConditionText(sellCondition, "sell");

  if (buyOperator === sellOperator && buyValue === sellValue) {
    return {
      indicator: buyIndicator,
      buyText,
      sellText,
      message: invalidInputMessage(`매수/매도 조건이 동일합니다: ${buyText}`)
    };
  }

  const buyRange = getConditionRange(buyOperator, buyValue);
  const sellRange = getConditionRange(sellOperator, sellValue);
  if (rangesOverlap(buyRange, sellRange)) {
    return {
      indicator: buyIndicator,
      buyText,
      sellText,
      message: invalidInputMessage(`매수/매도 ${buyIndicator} 조건 범위가 겹칩니다. 매수 ${buyOperator} ${buyValue}, 매도 ${sellOperator} ${sellValue}`)
    };
  }

  return null;
}

function createConditionWatchDetail(buyCondition, sellCondition) {
  const [buyIndicator, buyOperator, buyValue] = normalizeConditionForCompare(buyCondition, "buy");
  const [sellIndicator, sellOperator, sellValue] = normalizeConditionForCompare(sellCondition, "sell");

  if (buyIndicator !== sellIndicator) return null;
  if (filterOnlyIndicators.has(buyIndicator)) return null;
  if (areOppositeOperators(buyOperator, sellOperator)) return null;

  const buyRange = getConditionRange(buyOperator, buyValue);
  const sellRange = getConditionRange(sellOperator, sellValue);
  if (buyRange && sellRange && !rangesOverlap(buyRange, sellRange)) return null;

  return {
    indicator: buyIndicator,
    buyText: formatConditionText(buyCondition, "buy"),
    sellText: formatConditionText(sellCondition, "sell"),
    message: `${buyIndicator} 조건이 같은 방향으로 설정되어 동시 신호 가능성을 점검해야 합니다.`
  };
}

function getConditionConflictError(buyCondition, sellCondition) {
  return createConditionConflictDetail(buyCondition, sellCondition)?.message || "";
}

function getSignalConditionConflictDetails(strategy) {
  const buyConditions = getPrimaryStageConditions(strategy, "buy");
  const sellConditions = getPrimaryStageConditions(strategy, "sell");
  const buyHasDirectionalCondition = buyConditions.some(([indicator]) => !filterOnlyIndicators.has(normalizeIndicatorName(indicator)));
  const sellHasDirectionalCondition = sellConditions.some(([indicator]) => !filterOnlyIndicators.has(normalizeIndicatorName(indicator)));
  const details = {
    directionalError: "",
    conflicts: [],
    watchItems: []
  };

  if (!buyHasDirectionalCondition || !sellHasDirectionalCondition) {
    details.directionalError = invalidInputMessage("매수와 매도 조건에는 각각 방향성 지표가 하나 이상 필요합니다. RSI, MACD, 이동평균선, 현재가, 보유 수익률 등을 추가하세요.");
  }

  for (const buyCondition of buyConditions) {
    for (const sellCondition of sellConditions) {
      const conflict = createConditionConflictDetail(buyCondition, sellCondition);
      if (conflict) {
        details.conflicts.push(conflict);
        continue;
      }

      const watchItem = createConditionWatchDetail(buyCondition, sellCondition);
      if (watchItem) details.watchItems.push(watchItem);
    }
  }

  return details;
}

function getSignalConditionConflictError(strategy) {
  const details = getSignalConditionConflictDetails(strategy);
  return details.directionalError || "";
}

function getSignalConflictSummary(strategy) {
  const priorityOption = getSignalPriorityOption(strategy);
  const details = getSignalConditionConflictDetails(strategy);
  const priorityOutcome = priorityOption.value === "buy" ? "매수 실행 · 매도 보류" : "매도 실행 · 매수 보류";

  if (details.directionalError) {
    return {
      ...details,
      tone: "watch",
      badgeTone: "tertiary",
      label: "조건 보완",
      priorityLabel: priorityOption.label,
      priorityOutcome,
      message: details.directionalError
    };
  }

  if (details.conflicts.length) {
    return {
      ...details,
      tone: "error",
      badgeTone: "error",
      label: `${details.conflicts.length}건 충돌`,
      priorityLabel: priorityOption.label,
      priorityOutcome,
      message: "저장 전 매수/매도 조건을 조정해야 합니다."
    };
  }

  if (details.watchItems.length) {
    return {
      ...details,
      tone: "watch",
      badgeTone: "tertiary",
      label: `${details.watchItems.length}건 점검`,
      priorityLabel: priorityOption.label,
      priorityOutcome,
      message: "직접 충돌은 아니지만 같은 지표 방향이 겹칩니다. 실시간 동시 신호는 우선순위로 처리합니다."
    };
  }

  return {
    ...details,
    tone: "ok",
    badgeTone: "secondary",
    label: "충돌 없음",
    priorityLabel: priorityOption.label,
    priorityOutcome,
    message: "직접 충돌 조건이 없습니다. 실시간 동시 신호는 우선순위로 처리합니다."
  };
}

function resolveStrategySignals(strategy, signals = {}) {
  const buyActive = Boolean(signals.buy);
  const sellActive = Boolean(signals.sell);
  const priority = getSignalPriorityValue(strategy);

  if (buyActive && sellActive) {
    const suppressedSignal = priority === "buy" ? "sell" : "buy";
    return {
      signal: priority,
      conflict: true,
      priority,
      suppressedSignal,
      label: getSignalSideLabel(priority),
      suppressedLabel: getSignalSideLabel(suppressedSignal),
      priorityLabel: getSignalPriorityOption(strategy).label
    };
  }

  if (buyActive || sellActive) {
    const signal = buyActive ? "buy" : "sell";
    return {
      signal,
      conflict: false,
      priority,
      suppressedSignal: "",
      label: getSignalSideLabel(signal),
      suppressedLabel: "",
      priorityLabel: getSignalPriorityOption(strategy).label
    };
  }

  return {
    signal: "",
    conflict: false,
    priority,
    suppressedSignal: "",
    label: "대기",
    suppressedLabel: "",
    priorityLabel: getSignalPriorityOption(strategy).label
  };
}

function getAllocationAmount(value) {
  const amount = Number.parseFloat(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function formatAllocationAmount(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function getStockByCode(code) {
  return stocks.find((stock) => stock.code === code);
}

function formatStockOptionValue(stock) {
  return `${stock.name} (${stock.code})`;
}

function getTargetStockCodes(strategy) {
  if (Array.isArray(strategy?.targetStocks)) {
    return [...new Set(strategy.targetStocks.filter((code) => getStockByCode(code)))];
  }

  const target = String(strategy?.target || "");
  return stocks
    .filter((stock) => target.includes(stock.name) || target.includes(stock.code))
    .map((stock) => stock.code);
}

function summarizeTargetStocks(codes) {
  const uniqueCodes = [...new Set(codes.filter((code) => getStockByCode(code)))];
  if (!uniqueCodes.length) return "대상 미지정";
  const firstStock = getStockByCode(uniqueCodes[0]);
  return uniqueCodes.length === 1 ? firstStock.name : `${firstStock.name} 외 ${uniqueCodes.length - 1}개`;
}

function findStockBySearchValue(value) {
  const query = String(value || "").trim().toLowerCase();
  if (!query) return null;

  return stocks.find((stock) => {
    const name = stock.name.toLowerCase();
    return query.includes(stock.code) || query.includes(name) || stock.code.includes(query) || name.includes(query);
  });
}

const defaultBuyConditions = [createEmptyCondition("buy")];

const defaultSellConditions = [createEmptyCondition("sell")];

const strategiesSeed = [];

const strategiesByModeSeed = {
  real: [],
  mock: []
};

const removedSeedStrategyNames = new Set([
  "시가 돌파 전략",
  "종가 회귀 전략",
  "수급 추적 전략"
]);

function createEmptyStrategiesByMode() {
  return { real: [], mock: [] };
}

function createEmptyOrdersByMode() {
  return { real: [], mock: [] };
}

function createEmptyRecordsByMode() {
  return { real: [], mock: [] };
}

function createEmptyAlertsByMode() {
  return { real: [], mock: [] };
}

function createEmptyAssetTrendByMode() {
  return { real: [], mock: [] };
}

function createDefaultBacktestInput() {
  return { ...DEFAULT_BACKTEST_INPUT, history: [] };
}

function createDefaultBacktestStateByMode() {
  return {
    real: createDefaultBacktestInput(),
    mock: createDefaultBacktestInput()
  };
}

function normalizeModeArrayState(value) {
  return {
    real: Array.isArray(value?.real) ? value.real : [],
    mock: Array.isArray(value?.mock) ? value.mock : []
  };
}

function normalizeStoredOrdersByMode(value) {
  return normalizeModeArrayState(value);
}

function normalizeStoredRecordsByMode(value) {
  return normalizeModeArrayState(value);
}

function normalizeStoredAlertsByMode(value) {
  return normalizeModeArrayState(value);
}

function normalizeStoredSettings(value) {
  const raw = isPlainRecord(value) ? value : {};
  const notificationPreferences = isPlainRecord(raw.notificationPreferences) ? raw.notificationPreferences : {};
  const assetTrendByMode = isPlainRecord(raw.assetTrendByMode) ? raw.assetTrendByMode : {};

  return {
    theme: raw.theme === "light" ? "light" : "dark",
    emergencyEnabled: typeof raw.emergencyEnabled === "boolean" ? raw.emergencyEnabled : true,
    orderMode: typeof raw.orderMode === "string" && raw.orderMode.trim() ? raw.orderMode : DEFAULT_ORDER_MODE,
    notificationPreferences: {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...Object.fromEntries(
        Object.entries(notificationPreferences).filter(([, enabled]) => typeof enabled === "boolean")
      )
    },
    assetTrendByMode: {
      real: normalizeAssetTrendRows(assetTrendByMode.real),
      mock: normalizeAssetTrendRows(assetTrendByMode.mock)
    }
  };
}

function normalizeStoredMarketState(value) {
  const raw = isPlainRecord(value) ? value : {};
  return {
    selectedCode: typeof raw.selectedCode === "string" ? raw.selectedCode : DEFAULT_MARKET_STATE.selectedCode,
    tab: raw.tab === "favorites" ? "favorites" : DEFAULT_MARKET_STATE.tab,
    chartInterval: MARKET_CHART_INTERVAL_OPTIONS.some((option) => option.value === raw.chartInterval) ? raw.chartInterval : DEFAULT_MARKET_STATE.chartInterval
  };
}

function normalizeStoredBacktestState(value) {
  const normalizeHistory = (historyValue) => (
    Array.isArray(historyValue)
      ? historyValue
        .filter((item) => isPlainRecord(item) && item.id)
        .slice(0, MAX_BACKTEST_HISTORY_ITEMS)
      : []
  );
  const normalizeMode = (modeValue) => {
    const raw = isPlainRecord(modeValue) ? modeValue : {};
    return {
      strategyId: raw.strategyId || DEFAULT_BACKTEST_INPUT.strategyId,
      symbol: typeof raw.symbol === "string" ? raw.symbol : DEFAULT_BACKTEST_INPUT.symbol,
      startDate: DEFAULT_BACKTEST_INPUT.startDate,
      tradingDays: DEFAULT_BACKTEST_INPUT.tradingDays,
      initialCash: typeof raw.initialCash === "string" && raw.initialCash.trim() ? raw.initialCash : DEFAULT_BACKTEST_INPUT.initialCash,
      lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : DEFAULT_BACKTEST_INPUT.lastRunAt,
      history: normalizeHistory(raw.history)
    };
  };

  return {
    real: normalizeMode(value?.real),
    mock: normalizeMode(value?.mock)
  };
}

function getStrategySeedNamesByMode() {
  return {
    real: new Set((strategiesByModeSeed.real || []).map((strategy) => strategy.name)),
    mock: new Set((strategiesByModeSeed.mock || []).map((strategy) => strategy.name))
  };
}

function normalizeStoredStrategiesByMode(value) {
  const empty = createEmptyStrategiesByMode();
  if (!isPlainRecord(value)) return empty;

  return {
    real: Array.isArray(value.real) ? value.real.filter((strategy) => !removedSeedStrategyNames.has(strategy?.name)) : [],
    mock: Array.isArray(value.mock) ? value.mock.filter((strategy) => !removedSeedStrategyNames.has(strategy?.name)) : []
  };
}

function isSeedOnlyStrategiesByMode(value) {
  const seedNamesByMode = getStrategySeedNamesByMode();
  return ["real", "mock"].every((mode) => {
    const strategies = value[mode] || [];
    const seedNames = seedNamesByMode[mode];
    return strategies.length === seedNames.size && strategies.every((strategy) => seedNames.has(strategy?.name));
  });
}

function normalizeStoredFavoriteGroups(value) {
  if (!isPlainRecord(value)) return {};

  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([groupName, codes]) => groupName.trim() && Array.isArray(codes))
      .map(([groupName, codes]) => [
        groupName,
        codes.filter((code) => typeof code === "string" && stocks.some((stock) => stock.code === code))
      ])
      .filter(([, codes]) => codes.length > 0)
  );

  return JSON.stringify(normalized) === JSON.stringify(initialGroups) ? {} : normalized;
}

const recordRows = [];

const alerts = [];

function getInitialTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function getInitialNickname() {
  try {
    return localStorage.getItem(NICKNAME_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function getInitialExecutionMode() {
  try {
    return localStorage.getItem(EXECUTION_MODE_KEY) === "mock" ? "mock" : "real";
  } catch {
    return "real";
  }
}

function getInitialAuthSession() {
  try {
    return localStorage.getItem(AUTH_SESSION_KEY) === "active";
  } catch {
    return false;
  }
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredInputMessage(label = "필수 입력란") {
  return `입력값을 확인하세요. ${label}을 입력해야 합니다.`;
}

function invalidInputMessage(detail) {
  return `입력값을 확인하세요. ${detail}`;
}

function AccountAssetTrendChart({ data, hasAccountData, className = "h-[520px]" }) {
  const chartClassName = `${className} min-w-0 rounded border border-outline-variant bg-surface-container-low`;
  if (!hasAccountData || !data.length) {
    return (
      <div className={`${chartClassName} flex items-center justify-center border-dashed font-body-md text-body-md text-on-surface-variant`}>
        계좌 데이터가 연결되면 자산 추이가 표시됩니다.
      </div>
    );
  }

  return (
    <div className={`${chartClassName} p-3`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="var(--outline-variant)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--on-surface-variant)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={18} />
          <YAxis tick={{ fill: "var(--on-surface-variant)", fontSize: 11 }} tickFormatter={formatCompactChartValue} tickLine={false} axisLine={false} width={54} />
          <Tooltip
            cursor={{ fill: "rgb(var(--primary-rgb) / 0.08)" }}
            contentStyle={{ background: "var(--surface-container)", border: "1px solid var(--outline-variant)", borderRadius: 6, color: "var(--on-surface)" }}
            formatter={(_, __, item) => [item?.payload?.displayValue || "--", "총자산"]}
            labelStyle={{ color: "var(--on-surface)" }}
          />
          <Area
            dataKey="value"
            fill="rgb(var(--primary-rgb) / 0.16)"
            stroke="var(--primary)"
            strokeWidth={2}
            type="monotone"
            activeDot={{ r: 4, fill: "var(--primary)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DashboardRiskChart({ data, hasAccountData }) {
  const hasVisibleData = hasAccountData && data?.items?.length > 0;
  if (!hasVisibleData) {
    return (
      <div className="h-[220px] flex items-center justify-center rounded border border-dashed border-outline-variant bg-surface-container-low font-body-md text-body-md text-on-surface-variant">
        리스크 지표가 연결되면 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-gutter">
      <div className="rounded border border-outline-variant bg-surface-container-low p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-label-caps text-label-caps text-on-surface-variant">리스크 점수</p>
            <strong className={`mt-1 block font-display-sm text-display-sm ${data.tone === "tertiary" ? "text-tertiary" : data.tone === "primary" ? "text-primary" : "text-secondary"}`}>
              {data.score}
            </strong>
          </div>
          <Badge tone={data.tone}>{data.level}</Badge>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-highest">
          <div
            className={`${data.tone === "tertiary" ? "bg-tertiary" : data.tone === "primary" ? "bg-primary" : "bg-secondary"} h-full rounded-full`}
            style={{ width: `${clampNumber(data.score)}%` }}
          />
        </div>
        <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">{data.description}</p>
        <p className="mt-1 font-label-mono text-label-mono text-on-surface-variant">0 안정 · 100 고위험</p>
      </div>

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2">
        {data.items.map((item) => (
          <div className="rounded border border-outline-variant bg-surface-container-low p-3" key={item.label}>
            <div className="flex items-start justify-between gap-2">
              <span className="font-body-sm text-body-sm text-on-surface-variant">{item.label}</span>
              <Badge tone={item.tone}>수치</Badge>
            </div>
            <strong className="mt-2 block font-title-md text-title-md text-on-surface">{item.value}</strong>
            <p className="mt-1 truncate font-label-mono text-label-mono text-on-surface-variant">{item.meta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardRecentOrders({ orders }) {
  const visibleOrders = orders.slice(0, 4);

  return (
    <div className="mt-gutter overflow-hidden rounded border border-outline-variant bg-surface-container-low">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="text-primary text-[18px]">receipt_long</Icon>
          <h4 className="font-title-sm text-title-sm text-on-surface">최근 주문 현황</h4>
        </div>
        <span className="font-label-mono text-label-mono text-on-surface-variant">{visibleOrders.length}건</span>
      </div>
      <div className="divide-y divide-outline-variant/40">
        {visibleOrders.map((order) => (
          <article className="grid grid-cols-12 items-center gap-3 px-3 py-2" key={order.id}>
            <span className="col-span-3 font-label-mono text-label-mono text-on-surface-variant">{order.time || "--"}</span>
            <span className="col-span-2">
              <Badge tone={order.side === "매수" ? "secondary" : "tertiary"}>{order.side || "--"}</Badge>
            </span>
            <span className="col-span-4 truncate font-title-sm text-title-sm text-on-surface">{order.name || order.code || "--"}</span>
            <span className="col-span-3 truncate text-right font-body-sm text-body-sm text-on-surface-variant">{order.orderType || "--"} · {order.status || "--"}</span>
          </article>
        ))}
        {!visibleOrders.length ? (
          <div className="px-3 py-5 text-center font-body-md text-body-md text-on-surface-variant">최근 주문이 없습니다.</div>
        ) : null}
      </div>
    </div>
  );
}

function getInitialFavoriteGroups() {
  try {
    const saved = localStorage.getItem(FAVORITE_GROUPS_KEY);
    if (!saved) return initialGroups;

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return initialGroups;

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([groupName, codes]) => groupName.trim() && Array.isArray(codes))
        .map(([groupName, codes]) => [
          groupName,
          codes.filter((code) => typeof code === "string" && stocks.some((stock) => stock.code === code))
        ])
        .filter(([, codes]) => codes.length > 0)
    );
  } catch {
    return initialGroups;
  }
}

function readRoute() {
  const raw = window.location.hash.replace(/^#\/?/, "") || "dashboard";
  const [rawPage, rawAnchor] = raw.split(":");
  const page = rawPage.replace(/^\/+/, "").split(/[/?&]/)[0] || "dashboard";
  const anchor = rawAnchor?.replace(/^\/+/, "").split(/[/?&]/)[0] || "";
  const validPage = validPages.includes(page) ? page : "dashboard";
  return { page: validPage, anchor };
}

function Icon({ children, className = "", ...props }) {
  return <span className={`material-symbols-outlined ${className}`} {...props}>{children}</span>;
}

function Section({ children, className = "" }) {
  return <section className={`bg-surface-container rounded-lg border border-outline-variant overflow-hidden ${className}`}>{children}</section>;
}

function SectionTitle({ icon, title, meta, tone = "text-primary", action }) {
  return (
    <div className="p-widget-padding border-b border-outline-variant flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon ? <Icon className={tone}>{icon}</Icon> : null}
        <h3 className="font-headline-md text-headline-md text-on-surface">{title}</h3>
      </div>
      <div className="flex items-center gap-2">
        {meta ? <span className="font-label-mono text-label-mono text-secondary">{meta}</span> : null}
        {action}
      </div>
    </div>
  );
}

function PageHeader({ title, description, action }) {
  return (
    <section className="bg-surface-container rounded-lg border border-outline-variant p-widget-padding">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">{title}</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">{description}</p>
        </div>
        {action}
      </div>
    </section>
  );
}

function Badge({ children, tone = "primary" }) {
  const colors = {
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/10 text-secondary",
    tertiary: "bg-tertiary/10 text-tertiary",
    error: "bg-error/10 text-error",
    neutral: "bg-surface-container-highest text-on-surface-variant"
  };
  return <span className={`px-2 py-1 rounded font-label-caps text-label-caps ${colors[tone]}`}>{children}</span>;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function formatBackendTimestamp(value) {
  return value ? String(value).replace("T", " ").slice(0, 19) : "";
}

function mapBrokerOrderStatus(status, fallbackStatus = "접수") {
  return {
    open: "접수",
    partial: "부분 체결",
    filled: "체결",
    cancelled: "취소",
    rejected: "거부",
    unknown: fallbackStatus
  }[status] || fallbackStatus;
}

function isFinishedOrderStatus(status) {
  return ["체결", "취소", "거부"].includes(status);
}

function getKoreanOrderTime() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

function getKoreanTimestamp() {
  return `${formatKoreanDate()} ${getKoreanOrderTime()}`;
}

function getKoreanMinuteTimestamp() {
  return getKoreanTimestamp().slice(0, 16);
}

function formatKoreanDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getKoreanDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday,
    hour: Number(values.hour) || 0,
    minute: Number(values.minute) || 0
  };
}

function getKoreanMarketSession(date = new Date()) {
  const parts = getKoreanDateTimeParts(date);
  const minutes = parts.hour * 60 + parts.minute;
  const holidayName = KOREA_MARKET_HOLIDAYS[parts.date];
  const isWeekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const base = {
    date: parts.date,
    detail: "",
    className: "border-outline-variant bg-surface-container-high text-on-surface-variant",
    dotClass: "bg-outline"
  };

  if (holidayName || isWeekend) {
    return {
      ...base,
      status: "closed",
      label: "휴장",
      detail: `${parts.date} ${holidayName || "주말"} 휴장`
    };
  }

  if (minutes >= 9 * 60 && minutes < 15 * 60 + 30) {
    return {
      ...base,
      status: "open",
      label: "장중",
      detail: "정규장 09:00-15:30",
      className: "border-secondary bg-secondary/10 text-secondary",
      dotClass: "bg-secondary animate-pulse"
    };
  }

  if (minutes >= 7 * 60 + 30 && minutes < 9 * 60) {
    return {
      ...base,
      status: "preopen",
      label: "장전",
      detail: "장전 시간외 07:30-09:00",
      className: "border-primary bg-primary/10 text-primary",
      dotClass: "bg-primary"
    };
  }

  if (minutes >= 15 * 60 + 30 && minutes < 18 * 60) {
    return {
      ...base,
      status: "postclose",
      label: "장후",
      detail: "장후 시간외 15:30-18:00",
      className: "border-tertiary bg-tertiary/10 text-tertiary",
      dotClass: "bg-tertiary"
    };
  }

  return {
    ...base,
    status: "offhours",
    label: "장외",
    detail: "정규 거래 시간 외"
  };
}

function shiftDateString(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getInitialBacktestDates() {
  const todayDate = formatKoreanDate();
  const minStartDate = shiftDateString(todayDate, -365);
  const defaultStartDate = shiftDateString(todayDate, -180);
  return {
    startDate: defaultStartDate,
    endDate: todayDate,
    minStartDate,
    maxEndDate: todayDate,
    warning: ""
  };
}

function App() {
  const [route, setRoute] = useState(readRoute);
  const [theme, setThemeState] = useState(getInitialTheme);
  const [nickname, setNicknameState] = useState(getInitialNickname);
  const [executionMode, setExecutionModeState] = useState(getInitialExecutionMode);
  const [strategiesByMode, setStrategiesByMode] = useState(() => isSupabaseConfigured ? createEmptyStrategiesByMode() : strategiesByModeSeed);
  const [ordersByMode, setOrdersByMode] = useState(() => isSupabaseConfigured ? createEmptyOrdersByMode() : marketOrdersByModeSeed);
  const [recordsByMode, setRecordsByMode] = useState(createEmptyRecordsByMode);
  const [alertsByMode, setAlertsByMode] = useState(createEmptyAlertsByMode);
  const [assetTrendByMode, setAssetTrendByMode] = useState(createEmptyAssetTrendByMode);
  const [accountProfilesByMode, setAccountProfilesByMode] = useState(createAccountProfilesByMode);
  const [favoriteGroups, setFavoriteGroups] = useState(() => isSupabaseConfigured ? {} : getInitialFavoriteGroups());
  const [emergencyEnabled, setEmergencyEnabled] = useState(true);
  const [orderMode, setOrderMode] = useState(DEFAULT_ORDER_MODE);
  const [notificationPreferences, setNotificationPreferences] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [marketState, setMarketState] = useState(DEFAULT_MARKET_STATE);
  const [backtestStateByMode, setBacktestStateByMode] = useState(createDefaultBacktestStateByMode);
  const [emergencyNotice, setEmergencyNotice] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState(null);
  const [appStateLoaded, setAppStateLoaded] = useState(false);
  const [clock, setClock] = useState("");
  const [marketSession, setMarketSession] = useState(() => getKoreanMarketSession());
  const [strategySchedulerStatusByMode, setStrategySchedulerStatusByMode] = useState({ real: null, mock: null });
  const [kiwoomStatusByMode, setKiwoomStatusByMode] = useState({ real: null, mock: null });
  const activeStrategiesForScheduler = useMemo(
    () => (strategiesByMode[executionMode] || []).filter((strategy) => strategy.status === "활성"),
    [executionMode, strategiesByMode]
  );
  const schedulerStrategiesSignature = useMemo(
    () => JSON.stringify(activeStrategiesForScheduler),
    [activeStrategiesForScheduler]
  );
  const favoriteGroupsSignature = useMemo(() => JSON.stringify(favoriteGroups), [favoriteGroups]);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthReady(true);
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const nextSession = data.session;
      setSession(nextSession);
      setIsAuthenticated(Boolean(nextSession));
      setAuthReady(true);

      if (nextSession && readRoute().page === "login") {
        navigate("dashboard");
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsAuthenticated(Boolean(nextSession));

      if (nextSession) {
        localStorage.setItem(AUTH_SESSION_KEY, "active");
        if (readRoute().page === "login") navigate("dashboard");
        return;
      }

      localStorage.removeItem(AUTH_SESSION_KEY);
      setAppStateLoaded(false);
      navigate("login");
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    root.style.colorScheme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    localStorage.setItem(FAVORITE_GROUPS_KEY, JSON.stringify(favoriteGroups));
  }, [favoriteGroups]);

  useEffect(() => {
    if (!session?.user?.id) {
      setAppStateLoaded(false);
      return undefined;
    }

    let mounted = true;
    setAppStateLoaded(false);
    setStrategiesByMode(createEmptyStrategiesByMode());
    setOrdersByMode(createEmptyOrdersByMode());
    setRecordsByMode(createEmptyRecordsByMode());
    setAlertsByMode(createEmptyAlertsByMode());
    setAssetTrendByMode(createEmptyAssetTrendByMode());
    setFavoriteGroups({});
    setMarketState({ ...DEFAULT_MARKET_STATE });
    setBacktestStateByMode(createDefaultBacktestStateByMode());

    loadUserAppState(session.user.id)
      .then((storedState) => {
        if (!mounted) return;

        if (storedState) {
          if (typeof storedState.nickname === "string") {
            updateNickname(storedState.nickname);
          } else if (typeof session.user.user_metadata?.nickname === "string") {
            updateNickname(session.user.user_metadata.nickname);
          } else {
            updateNickname("");
          }

          if (storedState.execution_mode === "real" || storedState.execution_mode === "mock") {
            updateExecutionMode(storedState.execution_mode);
          } else {
            updateExecutionMode("real");
          }

          setFavoriteGroups(normalizeStoredFavoriteGroups(storedState.favorite_groups));

          const storedStrategiesByMode = normalizeStoredStrategiesByMode(storedState.strategies_by_mode);
          setStrategiesByMode(isSeedOnlyStrategiesByMode(storedStrategiesByMode) ? createEmptyStrategiesByMode() : storedStrategiesByMode);
          setOrdersByMode(normalizeStoredOrdersByMode(storedState.orders_by_mode));
          setRecordsByMode(normalizeStoredRecordsByMode(storedState.records_by_mode));
          setAlertsByMode(normalizeStoredAlertsByMode(storedState.alerts_by_mode));

          const storedSettings = normalizeStoredSettings(storedState.settings);
          setThemeState(storedSettings.theme);
          setEmergencyEnabled(storedSettings.emergencyEnabled);
          setOrderMode(storedSettings.orderMode);
          setNotificationPreferences(storedSettings.notificationPreferences);
          setAssetTrendByMode(storedSettings.assetTrendByMode);
          setMarketState(normalizeStoredMarketState(storedState.market_state));
          setBacktestStateByMode(normalizeStoredBacktestState(storedState.backtest_state));
        } else if (typeof session.user.user_metadata?.nickname === "string") {
          updateNickname(session.user.user_metadata.nickname);
          updateExecutionMode("real");
        } else {
          updateNickname("");
          updateExecutionMode("real");
        }
      })
      .catch((error) => {
        console.error("Supabase app state load failed:", error);
      })
      .finally(() => {
        if (mounted) setAppStateLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || !appStateLoaded || !isSupabaseConfigured) return undefined;

    const timer = window.setTimeout(() => {
      saveUserAppState(session.user.id, {
        nickname,
        executionMode,
        favoriteGroups,
        strategiesByMode,
        ordersByMode,
        recordsByMode,
        alertsByMode,
        settings: {
          theme,
          emergencyEnabled,
          orderMode,
          notificationPreferences,
          assetTrendByMode
        },
        marketState,
        backtestState: backtestStateByMode
      }).catch((error) => {
        console.error("Supabase app state save failed:", error);
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [session?.user?.id, appStateLoaded, nickname, executionMode, favoriteGroups, strategiesByMode, ordersByMode, recordsByMode, alertsByMode, theme, emergencyEnabled, orderMode, notificationPreferences, assetTrendByMode, marketState, backtestStateByMode]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      setClock(`${formatter.format(now)} KST`);
      setMarketSession(getKoreanMarketSession(now));
    };
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!route.anchor) return;
    window.setTimeout(() => {
      document.getElementById(route.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, [route]);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return undefined;
    if (session?.user?.id && !appStateLoaded) return undefined;

    let cancelled = false;
    const payload = {
      mode: executionMode,
      strategies: activeStrategiesForScheduler,
      favoriteGroups,
      scanIntervalSeconds: 60,
      maxCandidatesPerStrategy: 30,
      chartLimit: 240
    };

    const request = activeStrategiesForScheduler.length
      ? syncStrategyScheduler(payload)
      : stopStrategyScheduler(executionMode);

    request
      .then((status) => {
        if (cancelled) return;
        setStrategySchedulerStatusByMode((current) => ({ ...current, [executionMode]: status }));
      })
      .catch((error) => {
        if (cancelled) return;
        setStrategySchedulerStatusByMode((current) => ({
          ...current,
          [executionMode]: {
            mode: executionMode,
            status: "error",
            running: false,
            activeStrategyCount: activeStrategiesForScheduler.length,
            watchSymbols: [],
            messages: [error.message || "전략 실행 루프 동기화에 실패했습니다."]
          }
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activeStrategiesForScheduler, appStateLoaded, authReady, executionMode, favoriteGroups, favoriteGroupsSignature, isAuthenticated, schedulerStrategiesSignature, session?.user?.id]);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return undefined;

    let cancelled = false;
    const refresh = () => {
      getStrategySchedulerStatus(executionMode)
        .then((status) => {
          if (!cancelled) setStrategySchedulerStatusByMode((current) => ({ ...current, [executionMode]: status }));
        })
        .catch(() => {});
    };

    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authReady, executionMode, isAuthenticated]);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return undefined;

    const status = strategySchedulerStatusByMode[executionMode];
    const watchSymbols = Array.isArray(status?.watchSymbols) ? status.watchSymbols.filter(Boolean).slice(0, 20) : [];
    if (!watchSymbols.length) return undefined;

    let socket = null;
    let cancelled = false;
    getKiwoomRealtimeSocketConfig({
      mode: executionMode,
      symbols: watchSymbols,
      types: ["0B", "0D"]
    })
      .then(({ url, accessToken }) => {
        if (cancelled) return;
        socket = new WebSocket(url);
        socket.addEventListener("open", () => {
          if (accessToken) {
            socket?.send(JSON.stringify({ event: "auth", accessToken }));
          }
        });
        socket.addEventListener("message", (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.event === "error") {
              console.warn("Strategy realtime subscription error:", message.message);
            }
          } catch {
            // Ignore non-JSON upstream noise in the background strategy stream.
          }
        });
        socket.addEventListener("error", () => {
          console.warn("Strategy realtime subscription failed.");
        });
      })
      .catch((error) => {
        console.warn("Strategy realtime subscription config failed:", error);
      });

    return () => {
      cancelled = true;
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close(1000, "strategy-watch-symbols-updated");
      }
    };
  }, [
    authReady,
    executionMode,
    isAuthenticated,
    JSON.stringify(strategySchedulerStatusByMode[executionMode]?.watchSymbols || [])
  ]);

  function navigate(page, anchor = "") {
    const nextPage = validPages.includes(page) ? page : "dashboard";
    const nextAnchor = anchor || "";
    const nextHash = nextAnchor ? `/${nextPage}:${nextAnchor}` : `/${nextPage}`;
    if (window.location.hash !== `#${nextHash}`) {
      window.location.hash = nextHash;
    }
    setRoute({ page: nextPage, anchor: nextAnchor });
  }

  async function signIn(email, password) {
    if (!supabase) throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    if (!data.session) throw new Error("로그인 세션을 만들 수 없습니다. 이메일 인증 상태를 확인하세요.");

    setSession(data.session);
    setIsAuthenticated(true);
    localStorage.setItem(AUTH_SESSION_KEY, "active");
    navigate("dashboard");
  }

  async function signUp({ email, password, nickname: nextNickname, pin }) {
    if (!supabase) throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");

    const cleanNickname = nextNickname.trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: cleanNickname ? { nickname: cleanNickname } : {}
      }
    });

    if (error) throw error;

    if (cleanNickname) updateNickname(cleanNickname);
    updatePin(pin);

    if (data.session) {
      setSession(data.session);
      setIsAuthenticated(true);
      localStorage.setItem(AUTH_SESSION_KEY, "active");
      navigate("dashboard");
    }

    return { needsEmailConfirmation: !data.session };
  }

  async function sendPasswordReset(email) {
    if (!supabase) throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");

    const redirectTo = `${window.location.origin}${window.location.pathname}#/login`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function verifyCurrentPassword(currentPassword) {
    if (!supabase) throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");

    const email = session?.user?.email;
    if (!email) throw new Error("현재 로그인한 이메일을 확인할 수 없습니다.");

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword
    });

    if (verifyError) throw new Error("현재 비밀번호가 올바르지 않습니다.");
  }

  async function changePassword({ currentPassword, newPassword }) {
    if (!supabase) throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");

    await verifyCurrentPassword(currentPassword);

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;
  }

  async function signOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }

    setSession(null);
    setIsAuthenticated(false);
    setAppStateLoaded(false);
    localStorage.removeItem(AUTH_SESSION_KEY);
    navigate("login");
  }

  function updateNickname(nextName) {
    const cleanName = nextName.trim();
    setNicknameState(cleanName);
    if (cleanName) {
      localStorage.setItem(NICKNAME_KEY, cleanName);
    } else {
      localStorage.removeItem(NICKNAME_KEY);
    }
  }

  function updatePin(nextPin) {
    if (/^\d{4}$/.test(nextPin)) localStorage.setItem(PIN_KEY, nextPin);
  }

  function updateExecutionMode(nextMode) {
    setExecutionModeState(nextMode);
    localStorage.setItem(EXECUTION_MODE_KEY, nextMode);
  }

  function updateCurrentStrategies(updater) {
    setStrategiesByMode((current) => ({
      ...current,
      [executionMode]: typeof updater === "function" ? updater(current[executionMode] || []) : updater
    }));
  }

  function updateCurrentOrders(updater) {
    setOrdersByMode((current) => ({
      ...current,
      [executionMode]: typeof updater === "function" ? updater(current[executionMode] || []) : updater
    }));
  }

  function appendCurrentRecord({ type = "시스템", target = "시스템", body = "", status = "완료" }) {
    const nextRecord = [getKoreanTimestamp(), type, target, body, status];
    setRecordsByMode((current) => ({
      ...current,
      [executionMode]: [nextRecord, ...(current[executionMode] || [])].slice(0, MAX_ACTIVITY_ITEMS)
    }));
  }

  function appendCurrentAlert({ icon = "notifications", color = "text-primary", title = "알림", body = "", preferenceKey = "systemHealth" }) {
    if (preferenceKey && notificationPreferences[preferenceKey] === false) return;

    const nextAlert = [icon, color, title, body, getKoreanMinuteTimestamp()];
    setAlertsByMode((current) => ({
      ...current,
      [executionMode]: [nextAlert, ...(current[executionMode] || [])].slice(0, MAX_ACTIVITY_ITEMS)
    }));
  }

  function recordActivity(record, alert = null) {
    appendCurrentRecord(record);
    if (alert) appendCurrentAlert(alert);
  }

  const handleAccountProfileLoaded = useCallback((mode, profile) => {
    const normalizedProfile = normalizeAccountProfile(mode, profile);
    setAssetTrendByMode((current) => ({
      ...current,
      [mode]: appendAssetTrendPoint(current[mode], normalizedProfile)
    }));
    setAccountProfilesByMode((current) => ({
      ...current,
      [mode]: normalizedProfile
    }));
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !authReady) return undefined;

    let cancelled = false;
    getBrokerageAccount(executionMode)
      .then((profile) => {
        if (!cancelled) handleAccountProfileLoaded(executionMode, profile);
      })
      .catch(() => {
        if (!cancelled) {
          setAccountProfilesByMode((current) => ({
            ...current,
            [executionMode]: normalizeAccountProfile(executionMode, null)
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, executionMode, handleAccountProfileLoaded, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !authReady) return undefined;

    let cancelled = false;
    async function refreshKiwoomStatus() {
      try {
        const status = await getKiwoomStatus(executionMode);
        if (!cancelled) {
          setKiwoomStatusByMode((current) => ({ ...current, [executionMode]: status }));
        }
      } catch {
        if (!cancelled) {
          setKiwoomStatusByMode((current) => ({ ...current, [executionMode]: null }));
        }
      }
    }

    refreshKiwoomStatus();
    const timer = window.setInterval(refreshKiwoomStatus, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authReady, executionMode, isAuthenticated]);

  function triggerEmergencyStop() {
    if (!emergencyEnabled) {
      setEmergencyNotice("설정에서 긴급 중지 버튼이 비활성화되어 있습니다.");
      return;
    }

    const modeLabel = accountProfiles[executionMode].shortLabel;
    const now = getKoreanOrderTime();
    const currentOrders = ordersByMode[executionMode] || [];
    const currentStrategies = strategiesByMode[executionMode] || [];
    const canceledOrderCount = currentOrders.filter((order) => OPEN_ORDER_STATUSES.includes(order.status)).length;
    const stoppedStrategyCount = currentStrategies.filter((strategy) => strategy.status === "활성").length;

    updateCurrentOrders((orders) =>
      orders.map((order) =>
        OPEN_ORDER_STATUSES.includes(order.status)
          ? { ...order, status: "취소", time: now }
          : order
      )
    );
    updateCurrentStrategies((strategies) =>
      strategies.map((strategy) =>
        strategy.status === "활성"
          ? { ...strategy, status: "중지" }
          : strategy
      )
    );

    setEmergencyNotice(`${modeLabel} 모드에서 미체결 주문 ${canceledOrderCount}건을 취소하고 활성 전략 ${stoppedStrategyCount}개를 중지했습니다.`);
    recordActivity(
      {
        type: "리스크",
        target: "긴급 중지",
        body: `${modeLabel} 모드에서 미체결 주문 ${canceledOrderCount}건을 취소하고 활성 전략 ${stoppedStrategyCount}개를 중지했습니다.`,
        status: "완료"
      },
      {
        icon: "warning",
        color: "text-error",
        title: "긴급 중지 실행",
        body: `${modeLabel} 모드의 주문과 전략을 긴급 중지했습니다.`,
        preferenceKey: "systemHealth"
      }
    );
  }

  const profileName = nickname || "프로필";
  const accountProfile = {
    ...(accountProfilesByMode[executionMode] || emptyAccountProfiles[executionMode]),
    assetTrend: assetTrendByMode[executionMode] || []
  };
  const currentStrategies = strategiesByMode[executionMode] || [];
  const currentOrders = ordersByMode[executionMode] || [];
  const currentRecords = recordsByMode[executionMode] || [];
  const currentAlerts = alertsByMode[executionMode] || [];
  const otherMode = executionMode === "real" ? "mock" : "real";
  const appRoute = isAuthenticated && route.page === "login" ? { page: "dashboard", anchor: "" } : route;
  const dashboardAlerts = currentAlerts;
  const records = currentRecords;
  const recordAlerts = currentAlerts;

  if (!authReady) {
    return (
      <main className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-6 font-body-md text-body-md text-on-surface">
        Supabase 세션을 확인하는 중입니다.
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginPage
        isSupabaseReady={isSupabaseConfigured}
        onPasswordReset={sendPasswordReset}
        onSignIn={signIn}
        onSignUp={signUp}
      />
    );
  }

  if (session?.user?.id && !appStateLoaded) {
    return (
      <main className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-6 font-body-md text-body-md text-on-surface">
        사용자 데이터를 확인하는 중입니다.
      </main>
    );
  }

  return (
    <Shell
      route={appRoute}
      navigate={navigate}
      profileName={profileName}
      clock={clock}
      marketSession={marketSession}
      brokerageStatus={kiwoomStatusByMode[executionMode]}
      executionMode={executionMode}
      emergencyEnabled={emergencyEnabled}
      emergencyNotice={emergencyNotice}
      onEmergencyStop={triggerEmergencyStop}
      onSignOut={signOut}
    >
      {appRoute.page === "dashboard" && <DashboardPage navigate={navigate} accountProfile={accountProfile} strategies={currentStrategies} orders={currentOrders} alerts={dashboardAlerts} />}
      {appRoute.page === "market" && (
        <MarketPage
          accountProfile={accountProfile}
          executionMode={executionMode}
          orders={currentOrders}
          setOrders={updateCurrentOrders}
          favoriteGroups={favoriteGroups}
          setFavoriteGroups={setFavoriteGroups}
          marketState={marketState}
          setMarketState={setMarketState}
          onAccountProfileLoaded={handleAccountProfileLoaded}
          onRecordActivity={recordActivity}
        />
      )}
      {appRoute.page === "strategy" && (
        <StrategyPage
          navigate={navigate}
          favoriteGroups={favoriteGroups}
          executionMode={executionMode}
          strategies={currentStrategies}
          setStrategies={updateCurrentStrategies}
          sourceStrategies={strategiesByMode[otherMode] || []}
          sourceMode={otherMode}
          schedulerStatus={strategySchedulerStatusByMode[executionMode]}
          onSchedulerStatusChange={(status) => setStrategySchedulerStatusByMode((current) => ({ ...current, [executionMode]: status }))}
          onRecordActivity={recordActivity}
        />
      )}
      {appRoute.page === "backtest" && (
        <BacktestPage
          strategies={currentStrategies}
          executionMode={executionMode}
          backtestState={backtestStateByMode[executionMode] || createDefaultBacktestInput()}
          setBacktestState={(updater) =>
            setBacktestStateByMode((current) => ({
              ...current,
              [executionMode]: typeof updater === "function" ? updater(current[executionMode] || createDefaultBacktestInput()) : updater
            }))
          }
          onRecordActivity={recordActivity}
        />
      )}
      {appRoute.page === "record" && <RecordPage records={records} alerts={recordAlerts} />}
      {appRoute.page === "setting" && (
        <SettingsPage
          theme={theme}
          setTheme={setThemeState}
          nickname={nickname}
          updateNickname={updateNickname}
          executionMode={executionMode}
          setExecutionMode={updateExecutionMode}
          emergencyEnabled={emergencyEnabled}
          setEmergencyEnabled={setEmergencyEnabled}
          orderMode={orderMode}
          setOrderMode={setOrderMode}
          notificationPreferences={notificationPreferences}
          setNotificationPreferences={setNotificationPreferences}
          onAccountProfileLoaded={handleAccountProfileLoaded}
          onPasswordChange={changePassword}
          onVerifyCurrentPassword={verifyCurrentPassword}
        />
      )}
    </Shell>
  );
}

function Shell({ children, route, navigate, profileName, clock, marketSession, brokerageStatus, executionMode, emergencyEnabled, emergencyNotice, onEmergencyStop, onSignOut }) {
  const modeProfile = accountProfiles[executionMode];
  const brokerageStatusInfo = (() => {
    if (!brokerageStatus) {
      return {
        label: "키움 확인 중",
        title: "키움 API 연결 상태를 확인하는 중입니다.",
        className: "border-outline-variant bg-surface-container-low text-on-surface-variant",
        dotClass: "bg-outline"
      };
    }
    if (!brokerageStatus.credentialConfigured) {
      return {
        label: "키움 미연결",
        title: "키움 앱 키와 앱 시크릿이 필요합니다.",
        className: "border-error/30 bg-error/10 text-error",
        dotClass: "bg-error"
      };
    }
    if (!brokerageStatus.accountConfigured) {
      return {
        label: "계좌번호 필요",
        title: "키움 토큰 정보는 있지만 계좌번호가 없어 잔고/주문을 사용할 수 없습니다.",
        className: "border-tertiary/30 bg-tertiary/10 text-tertiary",
        dotClass: "bg-tertiary"
      };
    }
    if (brokerageStatus.tokenReady) {
      return {
        label: "키움 토큰 활성",
        title: "키움 API 토큰이 활성 상태입니다.",
        className: "border-secondary/30 bg-secondary/10 text-secondary",
        dotClass: "bg-secondary"
      };
    }
    return {
      label: brokerageStatus.credentialSource === "browser" ? "키움 연결됨" : "키움 설정됨",
      title: "키움 API 키와 계좌번호가 설정되어 있습니다. 첫 API 호출 때 토큰을 발급합니다.",
      className: "border-primary/30 bg-primary/10 text-primary",
      dotClass: "bg-primary"
    };
  })();
  const [pinInput, setPinInput] = useState("");
  const [pinUnlockedUntil, setPinUnlockedUntil] = useState(0);
  const [pinNow, setPinNow] = useState(Date.now());
  const [pinMessage, setPinMessage] = useState("");
  const [pinMessageTone, setPinMessageTone] = useState("");
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogInput, setPinDialogInput] = useState("");
  const [pinDialogMessage, setPinDialogMessage] = useState("");
  const pinInputRef = useRef(null);
  const pinDialogInputRef = useRef(null);
  const pinMessageTimerRef = useRef(null);
  const pinRemainingMs = Math.max(0, pinUnlockedUntil - pinNow);
  const pinUnlocked = pinRemainingMs > 0;
  const pinHasError = pinMessageTone === "error";
  const pinStatus = pinUnlocked
    ? formatPinRemaining(pinRemainingMs)
    : pinUnlockedUntil
      ? "재입력"
      : "";

  useEffect(() => {
    const timer = window.setInterval(() => setPinNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      if (pinMessageTimerRef.current) window.clearTimeout(pinMessageTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pinDialogOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => pinDialogInputRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [pinDialogOpen]);

  function clearPinMessageTimer() {
    if (!pinMessageTimerRef.current) return;
    window.clearTimeout(pinMessageTimerRef.current);
    pinMessageTimerRef.current = null;
  }

  function showTemporaryPinError(message) {
    clearPinMessageTimer();
    setPinMessage(message);
    setPinMessageTone("error");

    if (pinUnlocked) {
      pinMessageTimerRef.current = window.setTimeout(() => {
        setPinMessage("");
        setPinMessageTone("");
        pinMessageTimerRef.current = null;
      }, 3000);
    }
  }

  function unlockPin(nextPin, onError) {
    if (!/^\d{4}$/.test(nextPin)) {
      onError("숫자 4자리");
      return false;
    }

    const savedPin = localStorage.getItem(PIN_KEY);
    if (savedPin && savedPin !== nextPin) {
      onError("불일치");
      return false;
    }

    if (!savedPin) localStorage.setItem(PIN_KEY, nextPin);

    const nextUnlockUntil = Date.now() + PIN_UNLOCK_DURATION_MS;
    setPinUnlockedUntil(nextUnlockUntil);
    setPinNow(Date.now());
    setPinInput("");
    setPinMessage("");
    setPinMessageTone("");
    setPinDialogOpen(false);
    setPinDialogInput("");
    setPinDialogMessage("");
    return true;
  }

  function verifyTopbarPin(nextPin) {
    const accepted = unlockPin(nextPin, showTemporaryPinError);
    if (!accepted && /^\d{4}$/.test(nextPin)) setPinInput("");
  }

  function updateTopbarPin(nextPin) {
    const cleanPin = nextPin.replace(/\D/g, "").slice(0, 4);
    setPinInput(cleanPin);
    clearPinMessageTimer();
    setPinMessage("");
    setPinMessageTone("");
  }

  function submitTopbarPin(event) {
    event.preventDefault();
    verifyTopbarPin(pinInput);
  }

  function updatePinDialogInput(nextPin) {
    setPinDialogInput(nextPin.replace(/\D/g, "").slice(0, 4));
    setPinDialogMessage("");
  }

  function closePinDialog() {
    setPinDialogOpen(false);
    setPinDialogInput("");
    setPinDialogMessage("");
  }

  function submitPinDialog(event) {
    event.preventDefault();
    const accepted = unlockPin(pinDialogInput, (message) => {
      setPinDialogMessage(message === "불일치" ? "PIN이 일치하지 않습니다." : message);
    });

    if (!accepted && /^\d{4}$/.test(pinDialogInput)) {
      setPinDialogInput("");
      window.setTimeout(() => pinDialogInputRef.current?.focus(), 0);
    }
  }

  function requirePin() {
    if (pinUnlocked) return true;
    clearPinMessageTimer();
    setPinMessage("");
    setPinMessageTone("");
    setPinDialogMessage("");
    setPinDialogOpen(true);
    return false;
  }

  function handleEmergencyStop() {
    if (!requirePin()) return;
    onEmergencyStop();
  }

  return (
    <PinAuthContext.Provider value={{ pinUnlocked, requirePin }}>
    <div className="custom-scrollbar font-body-md text-body-md">
      {pinDialogOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePinDialog();
          }}
        >
          <form
            aria-describedby="pin-auth-description"
            aria-labelledby="pin-auth-title"
            aria-modal="true"
            className="w-full max-w-sm rounded-lg border border-outline-variant bg-surface-container p-widget-padding shadow-2xl"
            role="dialog"
            onSubmit={submitPinDialog}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <Icon className="text-primary">lock</Icon>
                <h2 className="font-headline-md text-headline-md text-on-surface" id="pin-auth-title">PIN 입력 필요</h2>
              </div>
              <button
                aria-label="닫기"
                className="inline-flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
                type="button"
                onClick={closePinDialog}
              >
                <Icon className="text-[18px]">close</Icon>
              </button>
            </div>
            <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant" id="pin-auth-description">
              보호된 작업을 계속하려면 PIN 4자리를 입력하세요.
            </p>
            <label className="mt-5 block font-label-caps text-label-caps text-on-surface-variant" htmlFor="pin-dialog-input">
              PIN 번호
            </label>
            <input
              ref={pinDialogInputRef}
              className="mt-2 w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-title-sm text-title-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              id="pin-dialog-input"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              placeholder="4자리"
              type="password"
              value={pinDialogInput}
              onChange={(event) => updatePinDialogInput(event.target.value)}
              autoComplete="off"
            />
            {pinDialogMessage ? (
              <p className="mt-3 rounded border border-error/30 bg-error/10 p-2 font-body-sm text-body-sm text-error" role="alert">
                {pinDialogMessage}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded border border-outline-variant px-3 py-2 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-highest"
                type="button"
                onClick={closePinDialog}
              >
                취소
              </button>
              <button
                className="rounded bg-primary px-4 py-2 font-label-caps text-label-caps text-on-primary transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                disabled={pinDialogInput.length !== 4}
                type="submit"
              >
                인증
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <aside className="flex flex-col h-screen fixed left-0 top-0 py-container-margin border-r border-outline-variant bg-surface-container-low w-64 z-50">
        <div className="px-6 mb-8">
          <h1 className="app-wordmark font-display text-display text-primary uppercase">AeroTrade</h1>
          <p className="app-brand-meta font-label-caps text-label-caps text-on-surface-variant opacity-70">Institutional Grade</p>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const active = route.page === item.page;
            return (
              <button
                className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors text-left ${
                  active
                    ? "text-secondary font-bold bg-surface-container-high"
                    : "text-on-surface-variant font-body-md hover:bg-surface-container-highest"
                }`}
                key={item.page}
                type="button"
                onClick={() => navigate(item.page)}
              >
                <Icon className="mr-3">{item.icon}</Icon>
                <span className="font-body-md text-body-md">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="px-4 mt-auto">
          <button
            className="w-full py-3 bg-error-container text-on-error-container font-title-sm text-title-sm font-bold rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-45 disabled:hover:brightness-100"
            disabled={!emergencyEnabled}
            type="button"
            onClick={handleEmergencyStop}
          >
            <Icon className="text-[20px]">warning</Icon>
            긴급 중지
          </button>
          {emergencyNotice ? (
            <p className="mt-3 rounded border border-error/20 bg-error/10 p-2 font-body-sm text-body-sm text-on-error-container">
              {emergencyNotice}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 mt-6 px-2">
            {[
              ["dns", "서버"],
              ["database", "DB"],
              ["api", "API"],
              ["sync_alt", "소켓"]
            ].map(([icon, label]) => (
              <div className="flex items-center gap-1" key={label}>
                <Icon className="text-[14px] text-secondary">{icon}</Icon>
                <span className="font-label-mono text-label-mono text-on-surface-variant">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <header className="app-header flex justify-between items-center h-12 px-container-margin ml-64 w-[calc(100%-16rem)] bg-surface-container border-b border-outline-variant fixed top-0 z-40">
        <div className="app-header-status flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="app-mode-label font-label-mono text-label-mono text-secondary" title={modeProfile.label}>{modeProfile.label}</span>
          </div>
          <span
            className={`app-header-market inline-flex items-center gap-1.5 rounded border px-2 py-1 font-label-mono text-label-mono ${marketSession.className}`}
            title={marketSession.detail}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${marketSession.dotClass}`} />
            한국장: {marketSession.label}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-label-mono text-label-mono ${brokerageStatusInfo.className}`}
            title={brokerageStatusInfo.title}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${brokerageStatusInfo.dotClass}`} />
            {brokerageStatusInfo.label}
          </span>
          <span className="app-header-clock font-label-mono text-label-mono text-on-surface-variant">{clock}</span>
        </div>
        <div className="app-header-actions flex items-center gap-3">
          <form
            className={`app-pin-form flex h-8 items-center gap-2 rounded border px-2 transition-colors ${
              pinHasError
                ? "border-error/40 bg-error/10"
                : pinUnlocked
                ? "border-secondary/50 bg-secondary/10"
                : "border-outline-variant bg-surface-container-lowest"
            }`}
            onSubmit={submitTopbarPin}
          >
            <span className={`font-label-caps text-label-caps ${pinHasError ? "text-error" : pinUnlocked ? "text-secondary" : "text-on-surface-variant"}`}>PIN</span>
            <input
              ref={pinInputRef}
              aria-label="핀번호"
              className="app-pin-input w-24 appearance-none border-0 bg-transparent p-0 font-label-mono text-label-mono text-on-surface placeholder:text-outline shadow-none outline-none focus:border-transparent focus:outline-none focus:ring-0"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              placeholder="4자리"
              type="password"
              value={pinInput}
              onChange={(event) => updateTopbarPin(event.target.value)}
              autoComplete="off"
              style={{ boxShadow: "none" }}
            />
            <button
              className="app-pin-submit rounded bg-surface-container-highest px-2 py-1 font-label-caps text-label-caps text-on-surface-variant transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              disabled={pinInput.length !== 4}
              type="submit"
            >
              {pinUnlocked ? "연장" : "확인"}
            </button>
            <span className={`app-pin-status min-w-[76px] font-label-mono text-label-mono ${pinHasError ? "text-error" : pinUnlocked ? "text-secondary" : "text-on-surface-variant"}`}>
              {pinMessage || pinStatus}
            </span>
          </form>
          <button
            className="app-notification-button inline-flex items-center justify-center p-1 text-on-surface-variant hover:text-primary transition-opacity"
            type="button"
            aria-label="알림 보기"
            onClick={() => navigate("record", "alerts")}
          >
            <Icon>notifications</Icon>
          </button>
          <button
            className="app-profile-button flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-container-highest cursor-pointer transition-colors"
            type="button"
            onClick={() => navigate("setting", "profile-security")}
          >
            <span className="app-profile-name font-label-mono text-label-mono text-on-surface-variant">{profileName}</span>
            <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center">
              <Icon className="text-[16px] text-on-primary-container">person</Icon>
            </div>
          </button>
          <button
            className="app-signout-button inline-flex items-center gap-1 rounded border border-outline-variant px-2 py-1 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-highest"
            type="button"
            onClick={onSignOut}
          >
            <Icon className="text-[16px]">logout</Icon>
            <span className="app-logout-label">로그아웃</span>
          </button>
        </div>
      </header>

      <main className="ml-64 mt-12 min-h-[calc(100vh-3rem)] p-container-margin bg-surface-container-lowest">
        <div className="max-w-[1600px] mx-auto space-y-gutter">{children}</div>
      </main>
    </div>
    </PinAuthContext.Provider>
  );
}

function DashboardPage({ navigate, accountProfile, strategies, orders, alerts: dashboardAlerts }) {
  const [assetTrendPeriod, setAssetTrendPeriod] = useState("daily");
  const activeStrategyCount = strategies.filter((strategy) => strategy.status === "활성").length;
  const hasAccountData = accountProfile.hasAccountData !== false;
  const rawAssetTrendData = useMemo(() => buildAccountAssetTrendData(accountProfile), [accountProfile]);
  const assetTrendData = useMemo(() => buildAssetTrendPeriodData(rawAssetTrendData, assetTrendPeriod), [rawAssetTrendData, assetTrendPeriod]);
  const assetTrendSummary = useMemo(() => buildAssetTrendSummary(assetTrendData, assetTrendPeriod), [assetTrendData, assetTrendPeriod]);
  const riskMetricData = useMemo(() => buildRiskChartData(accountProfile), [accountProfile]);
  const recentOrders = orders.slice(0, 5);
  const visibleAlerts = dashboardAlerts.slice(0, 4);
  const assetTrendMeta = assetTrendData.length
    ? `최근 ${ASSET_TREND_VISIBLE_POINTS}${assetTrendPeriod === "monthly" ? "개월" : "일"}`
    : "집계 대기";
  const riskMetricMeta = hasAccountData && riskMetricData?.items?.length ? `${riskMetricData.score}점 · ${riskMetricData.level}` : "점수 대기";

  return (
    <>
      <PageHeader
        title="대시보드"
        description="국내장 기준으로 계좌 상태, 전략 실행 현황, 최근 주문과 시스템 알림을 확인합니다."
        action={
          <button className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-label-caps text-label-caps hover:brightness-110 transition-all flex items-center gap-2" type="button" onClick={() => navigate("strategy")}>
            <Icon className="text-[16px]">add</Icon>
            전략 추가
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter">
        {accountProfile.dashboardCards.map(([label, value, meta, tone]) => (
          <div className="bg-surface-container rounded-lg border border-outline-variant p-widget-padding" key={label}>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{label}</p>
            <div className="flex items-end justify-between mt-2">
              <strong className={`font-headline-lg text-headline-lg ${tone === "secondary" ? "text-secondary" : tone === "tertiary" ? "text-tertiary" : tone === "primary" ? "text-primary" : "text-on-surface"}`}>{value}</strong>
              <span className="font-label-mono text-label-mono text-on-surface-variant">{meta}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
        <Section className="xl:col-span-8 flex flex-col">
          <div className="border-b border-outline-variant p-widget-padding">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <Icon className="text-primary">show_chart</Icon>
                <h3 className="font-headline-md text-headline-md text-on-surface">자산 추이</h3>
                <span className="font-label-mono text-label-mono text-secondary">{assetTrendMeta}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded border border-outline-variant bg-surface-container-lowest p-1">
                {ASSET_TREND_PERIOD_OPTIONS.map((option) => {
                  const active = assetTrendPeriod === option.value;
                  return (
                    <button
                      className={`h-8 rounded px-3 font-label-caps text-label-caps transition-colors ${active ? "bg-surface-container-highest text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                      key={option.value}
                      type="button"
                      onClick={() => setAssetTrendPeriod(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="p-widget-padding flex flex-1 flex-col">
            <AccountAssetTrendChart data={assetTrendData} hasAccountData={hasAccountData} className="min-h-[360px] xl:min-h-[520px] flex-1" />
            <div className="grid grid-cols-3 gap-gutter mt-gutter">
              {assetTrendSummary.map(([label, value]) => (
                <div className="bg-surface-container-low rounded border border-outline-variant p-3" key={label}>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{label}</p>
                  <p className="font-title-sm text-title-sm text-on-surface mt-1">{value}</p>
                </div>
              ))}
            </div>
            <DashboardRecentOrders orders={recentOrders} />
          </div>
        </Section>

        <div className="xl:col-span-4 flex flex-col gap-gutter">
          <Section>
            <SectionTitle icon="shield" title="리스크 지표" meta={riskMetricMeta} />
            <div className="p-widget-padding">
              <DashboardRiskChart data={riskMetricData} hasAccountData={hasAccountData} />
            </div>
          </Section>

          <Section className="flex-[1.35] min-h-[360px] flex flex-col">
            <SectionTitle icon="notifications" title="시스템 알림" meta={`${visibleAlerts.length}건`} />
            <div className="divide-y divide-outline-variant/40 section-body-scroll custom-scrollbar flex-1 min-h-0">
              {visibleAlerts.map(([icon, color, title, body, time]) => (
                <article className="p-widget-padding flex items-start gap-3" key={title}>
                  <Icon className={`${color} mt-0.5`}>{icon}</Icon>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-title-sm text-title-sm text-on-surface">{title}</h4>
                      <span className="font-label-mono text-label-mono text-on-surface-variant">{time.slice(11)}</span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{body}</p>
                  </div>
                </article>
              ))}
              {!visibleAlerts.length ? (
                <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">표시할 알림이 없습니다.</div>
              ) : null}
            </div>
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-gutter">
        <Section className="section-scroll-sm">
          <SectionTitle icon="psychology" title="활성 전략" meta={`${activeStrategyCount}개 실행 중`} />
          <div className="divide-y divide-outline-variant/40">
            {strategies.map((strategy) => (
              <article className="p-widget-padding flex items-center justify-between gap-3" key={strategy.id}>
                <div>
                  <h4 className="font-title-sm text-title-sm text-on-surface">{strategy.name}</h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{strategy.description}</p>
                </div>
                <Badge tone={strategy.status === "활성" ? "secondary" : "neutral"}>{strategy.status}</Badge>
              </article>
            ))}
            {!strategies.length ? (
              <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">등록된 전략이 없습니다.</div>
            ) : null}
          </div>
        </Section>
      </div>
    </>
  );
}

function MarketPage({ accountProfile, executionMode, orders, setOrders, favoriteGroups, setFavoriteGroups, marketState, setMarketState, onAccountProfileLoaded, onRecordActivity }) {
  const { requirePin } = usePinAuth();
  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState(() => marketState?.selectedCode || stocks[0]?.code || "");
  const [tab, setTab] = useState(() => marketState?.tab || "all");
  const [chartInterval, setChartInterval] = useState(() =>
    MARKET_CHART_INTERVAL_OPTIONS.some((option) => option.value === marketState?.chartInterval)
      ? marketState.chartInterval
      : DEFAULT_MARKET_STATE.chartInterval
  );
  const [openGroups, setOpenGroups] = useState(() => Object.fromEntries(Object.keys(favoriteGroups).map((groupName) => [groupName, true])));
  const [pendingStock, setPendingStock] = useState(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupError, setGroupError] = useState("");
  const [modalGroupNameDraft, setModalGroupNameDraft] = useState("");
  const [modalGroupError, setModalGroupError] = useState("");
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [marketStocks, setMarketStocks] = useState(() => stocks.map(normalizeMarketStock));
  const [stockCache, setStockCache] = useState(() =>
    Object.fromEntries(stocks.map((stock) => {
      const normalized = normalizeMarketStock(stock);
      return [normalized.code, normalized];
    }))
  );
  const [stockSearchStatus, setStockSearchStatus] = useState("idle");
  const [stockSearchMessage, setStockSearchMessage] = useState("");
  const [stockSearchRefresh, setStockSearchRefresh] = useState(0);
  const [orderSubmitMessage, setOrderSubmitMessage] = useState("");
  const [orderSubmitTone, setOrderSubmitTone] = useState("neutral");
  const [realtimeStatus, setRealtimeStatus] = useState("idle");
  const [realtimeMessage, setRealtimeMessage] = useState("키움 실시간 연결 대기 중입니다.");
  const [realtimeQuote, setRealtimeQuote] = useState(null);
  const [realtimeOrderBook, setRealtimeOrderBook] = useState(null);
  const [accountRefreshStatus, setAccountRefreshStatus] = useState("idle");
  const [accountRefreshMessage, setAccountRefreshMessage] = useState("");
  const [accountRefreshedAt, setAccountRefreshedAt] = useState("");
  const [holdingLockBusyCode, setHoldingLockBusyCode] = useState("");
  const [orderSyncStatus, setOrderSyncStatus] = useState("idle");
  const [orderSyncMessage, setOrderSyncMessage] = useState("");
  const [orderSyncedAt, setOrderSyncedAt] = useState("");

  const groups = favoriteGroups;
  const getCachedStock = (code) => {
    const normalizedCode = normalizeStockCode(code);
    if (stockCache[normalizedCode]) return stockCache[normalizedCode];
    const fallbackStock = stocks.find((stock) => normalizeStockCode(stock.code) === normalizedCode);
    return fallbackStock ? normalizeMarketStock(fallbackStock) : null;
  };
  const selected = getCachedStock(selectedCode) || normalizeMarketStock(stocks[0]);
  const [orderPrice, setOrderPrice] = useState(selected.current);
  const editingOrder = orders.find((order) => order.id === editingOrderId && OPEN_ORDER_STATUSES.includes(order.status)) || null;
  const openOrderSignature = useMemo(
    () => orders
      .filter((order) => OPEN_ORDER_STATUSES.includes(order.status) && order.brokerOrderNo)
      .map((order) => `${order.id}:${order.status}:${order.filledQuantity || 0}:${order.brokerOrderNo}`)
      .join("|"),
    [orders]
  );
  const favoriteCodes = useMemo(() => new Set(Object.values(groups).flat()), [groups]);
  const normalizedQuery = query.trim().toLowerCase();
  const matchesStockQuery = (stock) => `${stock.name} ${stock.code} ${stock.sector}`.toLowerCase().includes(normalizedQuery);
  const localFilteredStocks = stocks.map(normalizeMarketStock).filter(matchesStockQuery);
  const filteredStocks = marketStocks;
  const groupEntries = Object.entries(groups);
  const filteredFavoriteGroups = groupEntries
    .map(([groupName, codes]) => [
      groupName,
      codes.filter((code) => {
        const stock = getCachedStock(code);
        return stock ? matchesStockQuery(stock) : String(code).includes(normalizedQuery);
      })
    ])
    .filter(([, codes]) => codes.length > 0 || !normalizedQuery);
  const visibleStockCount = tab === "all"
    ? filteredStocks.length
    : filteredFavoriteGroups.reduce((count, [, codes]) => count + codes.length, 0);
  const realtimeStatusClass = {
    live: "bg-secondary/10 text-secondary",
    subscribed: "bg-secondary/10 text-secondary",
    connected: "bg-primary/10 text-primary",
    connecting: "bg-primary/10 text-primary",
    error: "bg-error/10 text-error",
    closed: "bg-surface-container-high text-on-surface-variant",
    idle: "bg-surface-container-high text-on-surface-variant"
  }[realtimeStatus] || "bg-surface-container-high text-on-surface-variant";
  const realtimeDotClass = {
    live: "bg-secondary",
    subscribed: "bg-secondary",
    connected: "bg-primary",
    connecting: "bg-primary",
    error: "bg-error",
    closed: "bg-outline",
    idle: "bg-outline"
  }[realtimeStatus] || "bg-outline";

  const refreshAccountProfile = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setAccountRefreshStatus("loading");
      setAccountRefreshMessage("잔고를 업데이트하는 중입니다.");
    }

    try {
      const profile = await getBrokerageAccount(executionMode);
      onAccountProfileLoaded?.(executionMode, profile);
      const refreshedAt = getKoreanOrderTime();
      setAccountRefreshedAt(refreshedAt);
      setAccountRefreshStatus("success");
      setAccountRefreshMessage(`잔고가 업데이트되었습니다. ${refreshedAt}`);
      return true;
    } catch (error) {
      if (!silent) {
        setAccountRefreshStatus("error");
        setAccountRefreshMessage(error.message || "잔고 업데이트에 실패했습니다.");
      }
      return false;
    }
  }, [executionMode, onAccountProfileLoaded]);

  const syncOpenOrders = useCallback(async ({ silent = false } = {}) => {
    const targetOrders = orders
      .filter((order) => OPEN_ORDER_STATUSES.includes(order.status) && order.brokerOrderNo)
      .slice(0, 12);

    if (!targetOrders.length) {
      if (!silent) {
        setOrderSyncStatus("idle");
        setOrderSyncMessage("동기화할 미체결 주문이 없습니다.");
      }
      return false;
    }

    if (!silent) {
      setOrderSyncStatus("loading");
      setOrderSyncMessage("키움 주문조회 API로 미체결 주문을 확인하는 중입니다.");
    }

    try {
      const statuses = await Promise.all(targetOrders.map(async (order) => {
        const status = await getBackendOrderStatus({
          mode: executionMode,
          orderNo: order.brokerOrderNo,
          code: order.code
        });
        return [order.id, status];
      }));
      const statusById = Object.fromEntries(statuses);
      const statusSummary = targetOrders.reduce((summary, order) => {
        const brokerStatus = statusById[order.id];
        if (!brokerStatus) return summary;
        const nextStatus = brokerStatus.matched
          ? mapBrokerOrderStatus(brokerStatus.status, order.status)
          : order.status;
        return {
          matchedCount: summary.matchedCount + (brokerStatus.matched ? 1 : 0),
          finishedCount: summary.finishedCount + (isFinishedOrderStatus(nextStatus) ? 1 : 0)
        };
      }, { matchedCount: 0, finishedCount: 0 });

      setOrders((current) => current.map((order) => {
        const brokerStatus = statusById[order.id];
        if (!brokerStatus) return order;

        const nextStatus = brokerStatus.matched
          ? mapBrokerOrderStatus(brokerStatus.status, order.status)
          : order.status;
        const nextFilledQuantity = Math.max(
          Number(order.filledQuantity || 0),
          Number(brokerStatus.filledQuantity || 0)
        );

        return {
          ...order,
          status: nextStatus,
          filledQuantity: nextFilledQuantity,
          brokerOrderNo: brokerStatus.orderNo || order.brokerOrderNo,
          brokerOrderStatus: brokerStatus,
          orderSyncMessage: brokerStatus.message || "",
          lastSyncedAt: formatBackendTimestamp(brokerStatus.checkedAt) || getKoreanOrderTime()
        };
      }));

      const syncedAt = getKoreanOrderTime();
      setOrderSyncedAt(syncedAt);
      setOrderSyncStatus("success");
      setOrderSyncMessage(`${targetOrders.length}건 조회 · ${statusSummary.matchedCount}건 확인 · ${statusSummary.finishedCount}건 완료`);

      if (statusSummary.finishedCount > 0) {
        refreshAccountProfile({ silent: true });
      }
      return true;
    } catch (error) {
      if (!silent) {
        setOrderSyncStatus("error");
        setOrderSyncMessage(error.message || "미체결 주문 동기화에 실패했습니다.");
      }
      return false;
    }
  }, [executionMode, orders, refreshAccountProfile, setOrders]);

  const updateHoldingLock = useCallback(async ({ code, lockedQuantity }) => {
    const normalizedCode = normalizeStockCode(code);
    if (!normalizedCode) return false;
    if (!requirePin()) return false;

    const quantity = Math.max(0, Math.floor(Number(lockedQuantity) || 0));
    setHoldingLockBusyCode(normalizedCode);
    setAccountRefreshStatus("loading");
    setAccountRefreshMessage(quantity > 0 ? `${normalizedCode} 잠금 수량을 저장하는 중입니다.` : `${normalizedCode} 잠금을 해제하는 중입니다.`);

    try {
      if (quantity > 0) {
        await setHoldingLock({ mode: executionMode, code: normalizedCode, lockedQuantity: quantity });
      } else {
        await deleteHoldingLock({ mode: executionMode, code: normalizedCode });
      }
      await refreshAccountProfile({ silent: true });
      setAccountRefreshStatus("success");
      setAccountRefreshMessage(quantity > 0
        ? `${normalizedCode} ${quantity.toLocaleString("ko-KR")}주를 전략 잠금으로 저장했습니다.`
        : `${normalizedCode} 전략 잠금을 해제했습니다.`);
      return true;
    } catch (error) {
      setAccountRefreshStatus("error");
      setAccountRefreshMessage(error.message || "잠금 수량 저장에 실패했습니다.");
      return false;
    } finally {
      setHoldingLockBusyCode("");
    }
  }, [executionMode, refreshAccountProfile, requirePin]);

  function applyRealtimeTrade(payload) {
    const code = normalizeStockCode(payload?.code || selectedCode);
    if (!code) return;

    const previous = getCachedStock(code) || {};
    const nextStock = normalizeMarketStock({
      ...previous,
      code,
      name: previous.name || payload.name || code,
      price: payload.price || previous.price,
      current: payload.current || previous.current,
      change: payload.changeRate || previous.change,
      volume: payload.volume || previous.volume,
      value: payload.value ? `${payload.value}백만` : previous.value,
      high: payload.high || previous.high,
      low: payload.low || previous.low,
      marketCap: payload.marketCap || previous.marketCap,
      summary: previous.summary || "키움 실시간 체결 데이터가 반영된 종목입니다."
    });

    setRealtimeQuote(payload);
    setStockCache((current) => ({
      ...current,
      [code]: nextStock
    }));
    setMarketStocks((current) => mergeStockList(current, [nextStock]));
  }

  useEffect(() => {
    setMarketState?.((current) => ({
      ...current,
      selectedCode,
      tab,
      chartInterval
    }));
  }, [selectedCode, tab, chartInterval, setMarketState]);

  useEffect(() => {
    if (accountProfile?.hasAccountData === false) return undefined;
    const timer = window.setInterval(() => {
      refreshAccountProfile({ silent: true });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [accountProfile?.hasAccountData, refreshAccountProfile]);

  useEffect(() => {
    if (!openOrderSignature) return undefined;
    const timer = window.setInterval(() => {
      syncOpenOrders({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [openOrderSignature, syncOpenOrders]);

  useEffect(() => {
    if (!selectedCode && marketStocks[0]?.code) {
      setSelectedCode(marketStocks[0].code);
    }
  }, [marketStocks, selectedCode]);

  useEffect(() => {
    if (!editingOrderId) {
      setOrderPrice(selected.current);
    }
  }, [selected.code, selected.current, editingOrderId]);

  useEffect(() => {
    const requestCode = normalizeStockCode(selectedCode);
    if (!requestCode) return undefined;

    let cancelled = false;
    getMarketStock(requestCode, { mode: executionMode })
      .then((stock) => {
        if (cancelled) return;
        const normalized = normalizeMarketStock(stock);
        setStockCache((current) => ({
          ...current,
          [normalized.code]: normalized
        }));
        setMarketStocks((current) => mergeStockList(current, [normalized]));
        if (!editingOrderId) {
          setOrderPrice(normalized.current);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [editingOrderId, executionMode, selectedCode, stockSearchRefresh]);

  useEffect(() => {
    const realtimeCode = normalizeStockCode(selectedCode);
    if (!realtimeCode) {
      setRealtimeStatus("idle");
      setRealtimeMessage("실시간으로 구독할 종목을 선택하세요.");
      setRealtimeQuote(null);
      setRealtimeOrderBook(null);
      return undefined;
    }

    let cancelled = false;
    let socket = null;
    let hasRealtimeOrderBook = false;
    setRealtimeStatus("connecting");
    setRealtimeMessage("키움 실시간 서버에 연결하는 중입니다.");
    setRealtimeQuote(null);
    setRealtimeOrderBook(null);

    getMarketOrderBook(realtimeCode, { mode: executionMode })
      .then((orderBook) => {
        if (cancelled || hasRealtimeOrderBook) return;
        setRealtimeOrderBook({
          ...orderBook,
          code: normalizeStockCode(orderBook?.code) || realtimeCode
        });
        setRealtimeMessage(orderBook?.time ? `키움 호가 스냅샷 ${orderBook.time}` : "키움 호가 스냅샷을 불러왔습니다.");
      })
      .catch(() => {});

    getKiwoomRealtimeSocketConfig({
      mode: executionMode,
      symbols: [realtimeCode],
      types: ["0B", "0D"]
    })
      .then(({ url, accessToken }) => {
        if (cancelled) return;
        socket = new WebSocket(url);
        socket.onopen = () => {
          if (!cancelled) {
            socket.send(JSON.stringify({ event: "auth", accessToken }));
            setRealtimeStatus("connecting");
            setRealtimeMessage("키움 실시간 로그인 중입니다.");
          }
        };
        socket.onmessage = (event) => {
          if (cancelled) return;
          let message = null;
          try {
            message = JSON.parse(event.data);
          } catch {
            setRealtimeStatus("error");
            setRealtimeMessage("실시간 메시지를 해석하지 못했습니다.");
            return;
          }

          if (message.event === "status") {
            setRealtimeStatus(message.status || "connected");
            setRealtimeMessage(message.message || "키움 실시간 연결 상태가 갱신되었습니다.");
            return;
          }

          if (message.event === "error") {
            setRealtimeStatus("error");
            setRealtimeMessage(message.message || "키움 실시간 연결에 실패했습니다.");
            return;
          }

          if (message.event !== "realtime") return;
          const payloadCode = normalizeStockCode(message.payload?.code);
          if (payloadCode && payloadCode !== realtimeCode) return;
          const payload = {
            ...(message.payload || {}),
            code: payloadCode || realtimeCode
          };

          if (payload.kind === "trade") {
            applyRealtimeTrade(payload);
            setRealtimeStatus("live");
            setRealtimeMessage(payload.time ? `실시간 체결 수신 ${payload.time}` : "실시간 체결을 수신 중입니다.");
          }

          if (payload.kind === "orderbook") {
            hasRealtimeOrderBook = true;
            setRealtimeOrderBook({
              ...payload,
              source: payload.source || "kiwoom-websocket"
            });
            setRealtimeStatus("live");
            setRealtimeMessage(payload.time ? `실시간 호가 수신 ${payload.time}` : "실시간 호가를 수신 중입니다.");
          }
        };
        socket.onerror = () => {
          if (!cancelled) {
            setRealtimeStatus("error");
            setRealtimeMessage("키움 실시간 WebSocket 연결에 실패했습니다.");
          }
        };
        socket.onclose = () => {
          if (!cancelled) {
            setRealtimeStatus("closed");
            setRealtimeMessage("키움 실시간 연결이 종료되었습니다.");
          }
        };
      })
      .catch((error) => {
        if (!cancelled) {
          setRealtimeStatus("error");
          setRealtimeMessage(error.message || "키움 실시간 연결 URL을 만들지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close(1000, "selected stock changed");
      }
    };
  }, [executionMode, selectedCode]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setStockSearchStatus("loading");
      setStockSearchMessage("종목 마스터를 검색하는 중입니다.");

      searchMarketStocks({ query: query.trim(), limit: 50, mode: executionMode })
        .then((results) => {
          if (cancelled) return;
          const normalizedResults = mergeStockList(results);
          setMarketStocks(normalizedResults);
          setStockCache((current) => ({
            ...current,
            ...Object.fromEntries(normalizedResults.map((stock) => [stock.code, stock]))
          }));
          setStockSearchStatus("success");
          setStockSearchMessage(normalizedResults.length ? "키움 API 종목 마스터 기준으로 검색했습니다." : "키움 API 키를 연결하면 전종목 검색이 가능합니다.");
        })
        .catch((error) => {
          if (cancelled) return;
          setMarketStocks(localFilteredStocks);
          setStockSearchStatus("error");
          setStockSearchMessage(error.message || "키움 API 종목 검색에 실패했습니다.");
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [executionMode, query, stockSearchRefresh]);

  function selectStock(code) {
    setSelectedCode(code);
    setEditingOrderId(null);
  }

  function normalizeGroupName(value) {
    return value.trim().replace(/\s+/g, " ");
  }

  function findExistingGroupName(groupName) {
    return Object.keys(groups).find((name) => name.toLowerCase() === groupName.toLowerCase());
  }

  function createGroup(rawName, stockCode = "", setError = setGroupError) {
    const groupName = normalizeGroupName(rawName);
    if (!groupName) {
      setError(requiredInputMessage("그룹 이름"));
      return false;
    }

    if (findExistingGroupName(groupName)) {
      setError(invalidInputMessage("이미 존재하는 그룹입니다."));
      return false;
    }

    setFavoriteGroups((current) => ({
      ...current,
      [groupName]: stockCode ? [stockCode] : []
    }));
    setOpenGroups((current) => ({ ...current, [groupName]: true }));
    setError("");
    return true;
  }

  function submitGroupCreate(event) {
    event.preventDefault();
    if (createGroup(groupNameDraft)) {
      setGroupNameDraft("");
      setTab("favorites");
    }
  }

  function submitModalGroupCreate(event) {
    event.preventDefault();
    if (!pendingStock) return;
    if (createGroup(modalGroupNameDraft, pendingStock.code, setModalGroupError)) {
      setModalGroupNameDraft("");
      setPendingStock(null);
      setTab("favorites");
    }
  }

  function openGroupPicker(stock) {
    setPendingStock(stock);
    setModalGroupNameDraft("");
    setModalGroupError("");
  }

  function closeGroupPicker() {
    setPendingStock(null);
    setModalGroupNameDraft("");
    setModalGroupError("");
  }

  function addToGroup(groupName) {
    if (!pendingStock) return;
    setFavoriteGroups((current) => ({
      ...current,
      [groupName]: Array.from(new Set([...(current[groupName] || []), pendingStock.code]))
    }));
    setOpenGroups((current) => ({ ...current, [groupName]: true }));
    closeGroupPicker();
  }

  function removeFromGroup(groupName, code) {
    setFavoriteGroups((current) => ({
      ...current,
      [groupName]: (current[groupName] || []).filter((item) => item !== code)
    }));
  }

  function togglePendingStockInGroup(groupName) {
    if (!pendingStock) return;

    if ((groups[groupName] || []).includes(pendingStock.code)) {
      removeFromGroup(groupName, pendingStock.code);
    } else {
      addToGroup(groupName);
      return;
    }

    closeGroupPicker();
  }

  function deleteGroup(groupName) {
    const confirmed = window.confirm(`'${groupName}' 그룹을 삭제할까요? 포함된 종목도 관심 그룹에서 제외됩니다.`);
    if (!confirmed) return;

    setFavoriteGroups((current) => {
      const { [groupName]: removed, ...rest } = current;
      return rest;
    });
    setOpenGroups((current) => {
      const { [groupName]: removed, ...rest } = current;
      return rest;
    });
  }

  function getOrderTime() {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date());
  }

  async function submitOrder(order) {
    if (!requirePin()) return;
    const numericPrice = Number(String(order.price || "").replace(/,/g, ""));
    setOrderSubmitTone("neutral");
    setOrderSubmitMessage("키움 API로 주문을 요청하는 중입니다.");

    try {
      const response = await submitBackendOrder({
        mode: executionMode,
        side: order.side === "매수" ? "buy" : "sell",
        symbol: selected.code,
        quantity: order.quantity,
        orderType: order.orderType === "시장가" ? "market" : "limit",
        price: Number.isFinite(numericPrice) ? numericPrice : null
      });
      const nextOrder = {
        id: Date.now(),
        time: getOrderTime(),
        code: selected.code,
        name: selected.name,
        filledQuantity: 0,
        status: response.accepted ? "접수" : "거부",
        brokerOrderNo: response.order?.brokerOrderNo || "",
        ...order
      };
      setEditingOrderId(null);
      setOrders((current) => [nextOrder, ...current]);
      setOrderSubmitTone("success");
      setOrderSubmitMessage(response.message || "키움 API로 주문 요청을 접수했습니다.");
      onRecordActivity?.(
        {
          type: "주문",
          target: selected.name,
          body: `${selected.name} ${order.side} 주문 ${order.quantity}주를 키움 API로 요청했습니다.`,
          status: "접수"
        },
        {
          icon: "receipt_long",
          color: order.side === "매수" ? "text-secondary" : "text-tertiary",
          title: "주문 접수",
          body: `${selected.name} ${order.side} ${order.quantity}주 주문을 키움 API로 요청했습니다.`,
          preferenceKey: "orderFills"
        }
      );

      refreshAccountProfile({ silent: true });
    } catch (error) {
      const message = error.message || "키움 API 주문 요청에 실패했습니다.";
      setOrderSubmitTone("error");
      setOrderSubmitMessage(message);
      onRecordActivity?.(
        {
          type: "주문",
          target: selected.name,
          body: message,
          status: "실패"
        },
        {
          icon: "error",
          color: "text-error",
          title: "주문 실패",
          body: message,
          preferenceKey: "orderFills"
        }
      );
    }
  }

  async function amendOrder(orderId, nextValues) {
    if (!requirePin()) return;
    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder?.brokerOrderNo) {
      setOrderSubmitTone("error");
      setOrderSubmitMessage("주문번호가 없어 키움 API로 정정할 수 없습니다.");
      return;
    }
    const numericPrice = Number(String(nextValues.price || "").replace(/,/g, ""));
    setOrderSubmitTone("neutral");
    setOrderSubmitMessage("키움 API로 주문 정정을 요청하는 중입니다.");

    try {
      const response = await amendBackendOrder({
        mode: executionMode,
        symbol: targetOrder.code,
        orderNo: targetOrder.brokerOrderNo,
        quantity: nextValues.quantity,
        orderType: nextValues.orderType === "시장가" ? "market" : "limit",
        price: Number.isFinite(numericPrice) ? numericPrice : null
      });
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId && OPEN_ORDER_STATUSES.includes(order.status)
            ? {
              ...order,
              ...nextValues,
              time: getOrderTime(),
              brokerOrderNo: response.order?.brokerOrderNo || order.brokerOrderNo
            }
            : order
        )
      );
      setEditingOrderId(null);
      setOrderSubmitTone("success");
      setOrderSubmitMessage(response.message || "키움 API로 주문 정정 요청을 접수했습니다.");
      if (targetOrder) {
        onRecordActivity?.(
          {
            type: "주문",
            target: targetOrder.name,
            body: `${targetOrder.name} 주문을 ${nextValues.price}원, ${nextValues.quantity}주로 정정 요청했습니다.`,
            status: "완료"
          },
          {
            icon: "edit_note",
            color: "text-primary",
            title: "주문 정정",
            body: `${targetOrder.name} 주문 조건을 키움 API로 정정 요청했습니다.`,
            preferenceKey: "orderFills"
          }
        );
      }
    } catch (error) {
      const message = error.message || "키움 API 주문 정정 요청에 실패했습니다.";
      setOrderSubmitTone("error");
      setOrderSubmitMessage(message);
    }
  }

  async function cancelOrder(orderId) {
    if (!requirePin()) return;
    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder?.brokerOrderNo) {
      setOrderSubmitTone("error");
      setOrderSubmitMessage("주문번호가 없어 키움 API로 취소할 수 없습니다.");
      return;
    }
    const confirmed = window.confirm(`${targetOrder.name} 주문을 취소할까요?`);
    if (!confirmed) return;

    setOrderSubmitTone("neutral");
    setOrderSubmitMessage("키움 API로 주문 취소를 요청하는 중입니다.");

    try {
      const remainingQuantity = Math.max(0, Number(targetOrder.quantity || 0) - Number(targetOrder.filledQuantity || 0));
      const response = await cancelBackendOrder({
        mode: executionMode,
        symbol: targetOrder.code,
        orderNo: targetOrder.brokerOrderNo,
        quantity: remainingQuantity || undefined
      });
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId && OPEN_ORDER_STATUSES.includes(order.status)
            ? { ...order, status: "취소", time: getOrderTime(), brokerCancelOrder: response.order }
            : order
        )
      );
      setEditingOrderId(null);
      setOrderSubmitTone("success");
      setOrderSubmitMessage(response.message || "키움 API로 주문 취소 요청을 접수했습니다.");
      if (targetOrder) {
        onRecordActivity?.(
          {
            type: "주문",
            target: targetOrder.name,
            body: `${targetOrder.name} 주문을 취소 요청했습니다.`,
            status: "취소"
          },
          {
            icon: "cancel",
            color: "text-error",
            title: "주문 취소",
            body: `${targetOrder.name} 주문을 키움 API로 취소 요청했습니다.`,
            preferenceKey: "orderFills"
          }
        );
      }
    } catch (error) {
      const message = error.message || "키움 API 주문 취소 요청에 실패했습니다.";
      setOrderSubmitTone("error");
      setOrderSubmitMessage(message);
    }
  }

  function selectOrderForEdit(order) {
    if (!OPEN_ORDER_STATUSES.includes(order.status)) return;
    setSelectedCode(order.code);
    setEditingOrderId(order.id);
  }

  return (
    <>
      <PageHeader
        title="시장"
        description="종목 검색, 관심 그룹 관리, 호가와 주문 화면을 한 곳에서 확인합니다."
        action={
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-label-caps text-label-caps hover:brightness-110 flex items-center gap-2" type="button" onClick={() => setStockSearchRefresh((value) => value + 1)}>
              <Icon className="text-[16px]">refresh</Icon>
              새로고침
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
        <Section className="xl:col-span-4 flex flex-col min-h-[720px]">
          <div className="p-widget-padding border-b border-outline-variant">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-headline-lg text-headline-lg text-on-surface">국내 종목 검색</h2>
              <span className="font-label-mono text-label-mono text-secondary">{visibleStockCount}개</span>
            </div>
            <div className="relative">
              <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</Icon>
              <input
                className="w-full bg-surface-container-lowest border border-outline-variant rounded pl-10 pr-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-outline focus:ring-1 focus:ring-primary"
                placeholder="종목명 또는 코드 검색"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {stockSearchMessage ? (
              <p className={`mt-2 font-body-sm text-body-sm ${stockSearchStatus === "error" ? "text-tertiary" : stockSearchStatus === "loading" ? "text-primary" : "text-on-surface-variant"}`}>
                {stockSearchMessage}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-gutter mt-gutter">
              {[
                ["all", "전체 종목"],
                ["favorites", "관심 종목"]
              ].map(([key, label]) => (
                <button
                  className={`py-2 rounded border font-label-caps text-label-caps ${
                    tab === key ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"
                  }`}
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <form className="mt-gutter grid grid-cols-[1fr_auto] gap-gutter" onSubmit={submitGroupCreate}>
              <input
                className="min-w-0 bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:ring-1 focus:ring-primary"
                placeholder="새 관심 그룹"
                value={groupNameDraft}
                onChange={(event) => {
                  setGroupNameDraft(event.target.value);
                  setGroupError("");
                }}
              />
              <button className="px-3 py-2 rounded bg-primary-container text-on-primary-container hover:brightness-110 flex items-center justify-center" type="submit" aria-label="관심 그룹 추가">
                <Icon className="text-[18px]">add</Icon>
              </button>
            </form>
            {groupError ? <p className="mt-2 font-body-sm text-body-sm text-error">{groupError}</p> : null}
          </div>

          <div className="section-body-scroll custom-scrollbar flex-1">
            {tab === "all" ? (
              filteredStocks.length ? (
                filteredStocks.map((stock) => (
                  <StockRow
                    key={stock.code}
                    stock={stock}
                    selected={selectedCode === stock.code}
                    favorite={favoriteCodes.has(stock.code)}
                    onSelect={() => selectStock(stock.code)}
                    onFavorite={() => openGroupPicker(stock)}
                  />
                ))
              ) : (
                <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">검색 결과가 없습니다.</div>
              )
            ) : (
              <div className="divide-y divide-outline-variant/40">
                {filteredFavoriteGroups.map(([groupName, codes]) => (
                  <div key={groupName}>
                    <div className="p-widget-padding bg-surface-container-low flex items-center justify-between gap-2">
                      <button className="min-w-0 flex flex-1 items-center justify-between gap-3 text-left" type="button" onClick={() => setOpenGroups((current) => ({ ...current, [groupName]: !current[groupName] }))}>
                        <span className="min-w-0">
                          <span className="block font-title-sm text-title-sm text-on-surface truncate">{groupName}</span>
                          <span className="block font-body-sm text-body-sm text-on-surface-variant mt-0.5">{groups[groupName]?.length || 0}개 종목</span>
                        </span>
                        <Icon className="text-on-surface-variant">{openGroups[groupName] ? "expand_less" : "expand_more"}</Icon>
                      </button>
                      <button className="p-2 rounded text-on-surface-variant hover:text-error hover:bg-error/10" type="button" onClick={() => deleteGroup(groupName)} aria-label={`${groupName} 그룹 삭제`}>
                        <Icon className="text-[18px]">delete</Icon>
                      </button>
                    </div>
                    {openGroups[groupName] ? (
                      codes.length ? codes.map((code) => {
                        const stock = getCachedStock(code);
                        return stock ? (
                          <StockRow
                            key={`${groupName}-${code}`}
                            stock={stock}
                            selected={selectedCode === stock.code}
                            favorite
                            onSelect={() => selectStock(stock.code)}
                            onFavorite={() => removeFromGroup(groupName, stock.code)}
                          />
                        ) : null;
                      }) : (
                        <div className="p-widget-padding font-body-sm text-body-sm text-on-surface-variant">아직 담긴 종목이 없습니다.</div>
                      )
                    ) : null}
                  </div>
                ))}
                {!groupEntries.length ? (
                  <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">관심 그룹이 없습니다. 새 관심 그룹을 추가하세요.</div>
                ) : visibleStockCount === 0 ? (
                  <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">관심 종목 검색 결과가 없습니다.</div>
                ) : null}
              </div>
            )}
          </div>
        </Section>

        <div className="xl:col-span-8 space-y-gutter">
          <Section>
            <div className="p-widget-padding border-b border-outline-variant flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-lg text-headline-lg text-on-surface">{selected.name}</h2>
                  <span className="font-label-mono text-label-mono text-on-surface-variant">{selected.code}</span>
                  <Badge tone="primary">{selected.market}</Badge>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{selected.sector} · 현재가 {selected.current === "0" ? "--" : `${selected.current}원`}</p>
                <div className={`mt-2 inline-flex max-w-full items-center gap-2 rounded px-2 py-1 ${realtimeStatusClass}`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${realtimeDotClass}`} />
                  <span className="truncate font-label-caps text-label-caps">{realtimeMessage}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="font-display text-display text-on-surface">{selected.price}</p>
                <p className={`font-title-sm text-title-sm ${selected.change.startsWith("+") ? "text-secondary" : selected.change.startsWith("-") ? "text-tertiary" : "text-on-surface-variant"}`}>{selected.change}</p>
                {realtimeQuote?.strength ? <p className="mt-1 font-label-mono text-label-mono text-on-surface-variant">체결강도 {realtimeQuote.strength}</p> : null}
              </div>
            </div>
          </Section>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-start">
            <Section className="xl:col-span-8">
              <div className="h-full p-widget-padding">
                <IntradayChart
                  stock={selected}
                  realtimeQuote={realtimeQuote}
                  interval={chartInterval}
                  mode={executionMode}
                  onIntervalChange={setChartInterval}
                />
              </div>
            </Section>
            <Section className="xl:col-span-4">
              <div className="h-full p-widget-padding">
                <OrderBook current={selected.current} orderBook={realtimeOrderBook} selectedPrice={orderPrice} onSelectPrice={setOrderPrice} />
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
            <StockHoldingsPanel
              accountProfile={accountProfile}
              refreshStatus={accountRefreshStatus}
              refreshMessage={accountRefreshMessage}
              refreshedAt={accountRefreshedAt}
              onRefresh={() => refreshAccountProfile()}
              lockBusyCode={holdingLockBusyCode}
              onUpdateLock={updateHoldingLock}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter items-stretch xl:col-span-6">
              <OrderPanel
                selected={selected}
                accountProfile={accountProfile}
                orderPrice={orderPrice}
                setOrderPrice={setOrderPrice}
                editingOrder={editingOrder}
                submitMessage={orderSubmitMessage}
                submitMessageTone={orderSubmitTone}
                onSubmitOrder={submitOrder}
                onAmendOrder={amendOrder}
                onCancelOrder={cancelOrder}
                onClearEditing={() => setEditingOrderId(null)}
              />
              <OrderStatusPanel
                orders={orders}
                selectedOrderId={editingOrderId}
                onSelectOrder={selectOrderForEdit}
                syncStatus={orderSyncStatus}
                syncMessage={orderSyncMessage}
                syncedAt={orderSyncedAt}
                onSyncOrders={() => syncOpenOrders()}
              />
            </div>
          </div>

          <Section>
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-8 p-widget-padding">
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-3">종목 분석</h3>
                  <div className="grid grid-cols-3 gap-gutter">
                    {[
                      ["추세", "상승", "secondary"],
                      ["수급", "개선", "primary"],
                      ["위험", "보통", "tertiary"]
                    ].map(([label, value, tone]) => (
                      <div className="bg-surface-container-low rounded border border-outline-variant p-3" key={label}>
                        <p className="font-label-caps text-label-caps text-on-surface-variant">{label}</p>
                        <p className={`font-title-sm text-title-sm mt-1 ${tone === "secondary" ? "text-secondary" : tone === "primary" ? "text-primary" : "text-tertiary"}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-gutter bg-surface-container-low rounded border border-outline-variant p-4">
                    <h4 className="font-title-sm text-title-sm text-on-surface mb-2">분석 요약</h4>
                    <p className="font-body-md text-body-md text-on-surface-variant">{selected.summary}</p>
                  </div>
                  <div className="mt-gutter grid grid-cols-1 gap-gutter md:grid-cols-2">
                    {["거래대금이 최근 평균 대비 높습니다.", "전략 적용 전 손절 기준을 확인하세요.", "장중 변동성 확대 시 분할 주문이 적합합니다.", "관심 그룹에 포함하면 전략 범위에서 선택할 수 있습니다."].map((text) => (
                      <div className="flex items-start gap-2 bg-surface-container-low rounded border border-outline-variant p-3" key={text}>
                        <Icon className="text-secondary text-[18px] mt-0.5">check_circle</Icon>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{text}</p>
                      </div>
                    ))}
                  </div>
              </div>

              <div className="lg:col-span-4 border-t border-outline-variant lg:border-l lg:border-t-0">
                <StockInfo selected={selected} embedded />
              </div>
            </div>
          </Section>
        </div>
      </div>

      {pendingStock ? (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface-container rounded-lg border border-outline-variant overflow-hidden">
            <SectionTitle icon="star" title="관심 그룹 선택" meta={pendingStock.name} />
            <div className="p-widget-padding space-y-gutter">
              {groupEntries.length ? groupEntries.map(([groupName, codes]) => {
                const included = codes.includes(pendingStock.code);
                return (
                  <button
                    className={`w-full p-3 rounded border text-left flex items-center justify-between gap-3 hover:bg-surface-container-highest ${included ? "border-secondary/50 bg-secondary/10" : "border-outline-variant"}`}
                    key={groupName}
                    type="button"
                    onClick={() => togglePendingStockInGroup(groupName)}
                  >
                    <span>
                      <span className="block font-title-sm text-title-sm text-on-surface">{groupName}</span>
                      <span className="block font-body-sm text-body-sm text-on-surface-variant mt-1">
                        {included ? "포함됨 · 클릭하면 제외" : `현재 ${codes.length}개 종목`}
                      </span>
                    </span>
                    <Icon className={included ? "text-secondary" : "text-on-surface-variant"}>{included ? "check_circle" : "add_circle"}</Icon>
                  </button>
                );
              }) : (
                <div className="rounded border border-outline-variant bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface-variant">아직 관심 그룹이 없습니다.</div>
              )}
              <form className="grid grid-cols-1 gap-gutter border-t border-outline-variant pt-widget-padding" onSubmit={submitModalGroupCreate}>
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">새 그룹 만들기</span>
                  <input
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-outline focus:ring-1 focus:ring-primary"
                    placeholder="그룹 이름"
                    value={modalGroupNameDraft}
                    onChange={(event) => {
                      setModalGroupNameDraft(event.target.value);
                      setModalGroupError("");
                    }}
                  />
                </label>
                {modalGroupError ? <p className="font-body-sm text-body-sm text-error">{modalGroupError}</p> : null}
                <button className="w-full py-2 rounded bg-primary-container text-on-primary-container font-label-caps text-label-caps hover:brightness-110 flex items-center justify-center gap-2" type="submit">
                  <Icon className="text-[18px]">create_new_folder</Icon>
                  새 그룹에 추가
                </button>
              </form>
              <button className="w-full py-2 rounded bg-surface-container-high text-on-surface-variant font-label-caps text-label-caps" type="button" onClick={closeGroupPicker}>닫기</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function StockRow({ stock, selected, favorite, onSelect, onFavorite }) {
  return (
    <article className={`grid grid-cols-[1fr_auto] gap-3 p-widget-padding border-b border-outline-variant/40 hover:bg-surface-container-highest transition-colors ${selected ? "bg-primary/5" : ""}`}>
      <button className="text-left min-w-0" type="button" onClick={onSelect}>
        <div className="flex items-center gap-2">
          <strong className="font-title-sm text-title-sm text-on-surface truncate">{stock.name}</strong>
          <span className="font-label-mono text-label-mono text-on-surface-variant">{stock.code}</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{stock.market} · 거래대금 {stock.value}</p>
      </button>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="font-label-mono text-label-mono text-on-surface">{stock.price}</p>
          <p className={`font-label-mono text-label-mono ${stock.change.startsWith("+") ? "text-secondary" : stock.change.startsWith("-") ? "text-tertiary" : "text-on-surface-variant"}`}>{stock.change}</p>
        </div>
        <button className="p-1 text-on-surface-variant hover:text-tertiary" type="button" onClick={onFavorite} aria-label="관심 종목">
          <Icon className="favorite-icon" data-active={String(favorite)}>star</Icon>
        </button>
      </div>
    </article>
  );
}

function StockHoldingsPanel({ accountProfile, refreshStatus = "idle", refreshMessage = "", refreshedAt = "", onRefresh, lockBusyCode = "", onUpdateLock }) {
  const holdingItems = Array.isArray(accountProfile?.holdingItems) ? accountProfile.holdingItems : [];
  const lockSignature = holdingItems
    .map((item) => `${normalizeStockCode(item.code)}:${parseChartNumber(item.lockedQuantity)}`)
    .join("|");
  const [lockDrafts, setLockDrafts] = useState({});
  const isRefreshing = refreshStatus === "loading";
  const messageClass = refreshStatus === "error"
    ? "text-error"
    : refreshStatus === "success"
      ? "text-secondary"
      : "text-on-surface-variant";
  const sortedHoldings = holdingItems
    .map((item) => ({
      ...item,
      code: normalizeStockCode(item.code),
      quantityValue: parseChartNumber(item.quantity),
      lockedQuantityValue: parseChartNumber(item.lockedQuantity),
      strategyAvailableQuantityValue: parseChartNumber(item.strategyAvailableQuantity),
      currentPriceValue: parseChartNumber(item.currentPrice || item.currentPriceText),
      evaluationValue: getHoldingItemValue(item),
      profitRateValue: parsePercentValue(item.profitRate)
    }))
    .sort((first, second) => second.evaluationValue - first.evaluationValue);
  useEffect(() => {
    setLockDrafts((current) => {
      const next = {};
      holdingItems.forEach((item) => {
        const code = normalizeStockCode(item.code);
        if (!code) return;
        next[code] = Object.prototype.hasOwnProperty.call(current, code)
          ? current[code]
          : String(parseChartNumber(item.lockedQuantity) || "");
      });
      return next;
    });
  }, [lockSignature]);

  function updateLockDraft(code, value) {
    const normalizedCode = normalizeStockCode(code);
    setLockDrafts((current) => ({
      ...current,
      [normalizedCode]: value.replace(/[^\d]/g, "")
    }));
  }

  function submitLock(item, quantity = null) {
    const draftValue = quantity === null ? parseChartNumber(lockDrafts[item.code]) : quantity;
    const lockedQuantity = Math.min(item.quantityValue, Math.max(0, Math.floor(draftValue || 0)));
    setLockDrafts((current) => ({ ...current, [item.code]: lockedQuantity ? String(lockedQuantity) : "" }));
    onUpdateLock?.({ code: item.code, lockedQuantity });
  }

  return (
    <Section className="min-h-[430px] xl:col-span-6">
      <SectionTitle
        icon="account_balance_wallet"
        title="주식 잔고"
        meta={refreshedAt ? `업데이트 ${refreshedAt}` : accountProfile?.hasAccountData === false ? "계좌 대기" : `${holdingItems.length}종목`}
        action={
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={isRefreshing}
            onClick={onRefresh}
            aria-label="잔고 새로고침"
            title="잔고 새로고침"
          >
            <Icon className="text-[16px]">{isRefreshing ? "hourglass_top" : "refresh"}</Icon>
          </button>
        }
      />
      <div className="p-widget-padding">
        {refreshMessage ? (
          <p className={`mb-2 font-body-sm text-body-sm ${messageClass}`}>{refreshMessage}</p>
        ) : null}
        <div className="overflow-x-auto rounded border border-outline-variant bg-surface-container-low">
          <div className="grid min-w-[760px] grid-cols-[1.2fr_0.7fr_0.9fr_1fr_0.8fr_1.1fr] gap-2 border-b border-outline-variant px-3 py-2 font-label-caps text-label-caps text-on-surface-variant">
            <span>종목</span>
            <span className="text-right">수량</span>
            <span className="text-right">현재가</span>
            <span className="text-right">평가액</span>
            <span className="text-right">수익률</span>
            <span className="text-right">잠금</span>
          </div>
          <div className="custom-scrollbar divide-y divide-outline-variant/40">
            {sortedHoldings.length ? sortedHoldings.map((item) => (
              <div className="grid min-w-[760px] grid-cols-[1.2fr_0.7fr_0.9fr_1fr_0.8fr_1.1fr] items-center gap-2 px-3 py-2" key={item.code || item.name}>
                <div className="min-w-0">
                  <p className="truncate font-title-sm text-title-sm text-on-surface">{item.name || item.code}</p>
                  <p className="mt-0.5 font-label-mono text-label-mono text-on-surface-variant">{item.code || "--"}</p>
                </div>
                <span className="text-right font-label-mono text-label-mono text-on-surface">{item.quantityValue ? `${item.quantityValue.toLocaleString("ko-KR")}주` : "--"}</span>
                <span className="text-right font-label-mono text-label-mono text-on-surface">{item.currentPriceValue ? item.currentPriceValue.toLocaleString("ko-KR") : "--"}</span>
                <span className="text-right font-label-mono text-label-mono text-on-surface">{item.evaluationValue ? formatCompactChartValue(item.evaluationValue) : "--"}</span>
                <span className={`text-right font-label-mono text-label-mono ${item.profitRateValue < 0 ? "text-tertiary" : item.profitRateValue > 0 ? "text-secondary" : "text-on-surface-variant"}`}>
                  {item.profitRate || "--"}
                </span>
                <div className="min-w-0">
                  <p className="text-right font-label-mono text-label-mono text-secondary">
                    {item.strategyAvailableQuantityValue ? `${item.strategyAvailableQuantityValue.toLocaleString("ko-KR")}주 가능` : "0주 가능"}
                  </p>
                  <div className="mt-1 flex items-center justify-end gap-1">
                    <input
                      className="h-7 w-[66px] rounded border border-outline-variant bg-surface-container px-2 text-right font-label-mono text-label-mono text-on-surface outline-none focus:border-primary disabled:opacity-60"
                      inputMode="numeric"
                      value={lockDrafts[item.code] ?? ""}
                      disabled={lockBusyCode === item.code}
                      onChange={(event) => updateLockDraft(item.code, event.target.value)}
                      aria-label={`${item.name || item.code} 잠금 수량`}
                    />
                    <button
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      disabled={lockBusyCode === item.code}
                      onClick={() => submitLock(item)}
                      aria-label="잠금 저장"
                      title="잠금 저장"
                    >
                      <Icon className="text-[15px]">{lockBusyCode === item.code ? "hourglass_top" : "lock"}</Icon>
                    </button>
                    <button
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      disabled={lockBusyCode === item.code || item.lockedQuantityValue <= 0}
                      onClick={() => submitLock(item, 0)}
                      aria-label="잠금 해제"
                      title="잠금 해제"
                    >
                      <Icon className="text-[15px]">lock_open</Icon>
                    </button>
                  </div>
                </div>
              </div>
            )) : (
              <div className="px-3 py-8 text-center font-body-md text-body-md text-on-surface-variant">표시할 주식 잔고가 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function IntradayChart({ stock, realtimeQuote, interval = "10m", mode = "mock", onIntervalChange }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const themeObserverRef = useRef(null);
  const candleDataRef = useRef([]);
  const volumeDataRef = useRef([]);
  const activeCodeRef = useRef("");
  const [chartStatus, setChartStatus] = useState("idle");
  const [chartMessage, setChartMessage] = useState("");
  const stockCode = normalizeStockCode(stock?.code);
  const activeInterval = MARKET_CHART_INTERVAL_OPTIONS.some((option) => option.value === interval) ? interval : DEFAULT_MARKET_STATE.chartInterval;
  const activeIntervalLabel = MARKET_CHART_INTERVAL_OPTIONS.find((option) => option.value === activeInterval)?.label || "10분봉";
  const latestPrice = parseChartNumber(realtimeQuote?.current || realtimeQuote?.price || stock?.current || stock?.price);
  const latestVolume = parseChartNumber(realtimeQuote?.tradeVolume || realtimeQuote?.tradeVolumeText);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const makeOptions = () => ({
      layout: {
        background: { type: ColorType.Solid, color: getChartColor(container, "--surface-container-low", "#111318") },
        textColor: getChartColor(container, "--on-surface-variant", "#9aa0a6")
      },
      grid: {
        vertLines: { color: getChartColor(container, "--outline-variant", "#2d3138") },
        horzLines: { color: getChartColor(container, "--outline-variant", "#2d3138") }
      },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: getChartColor(container, "--outline-variant", "#2d3138"),
        scaleMargins: { top: 0.08, bottom: 0.24 }
      },
      timeScale: {
        borderColor: getChartColor(container, "--outline-variant", "#2d3138"),
        timeVisible: activeInterval !== "daily",
        secondsVisible: false
      }
    });

    const chart = createChart(container, {
      width: container.clientWidth || 640,
      height: container.clientHeight || 470,
      ...makeOptions()
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: getChartColor(container, "--secondary", "#2fbc8f"),
      downColor: getChartColor(container, "--tertiary", "#df7d64"),
      borderVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
      wickUpColor: getChartColor(container, "--secondary", "#2fbc8f"),
      wickDownColor: getChartColor(container, "--tertiary", "#df7d64")
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: getChartColor(container, "--outline", "#7b8089")
    });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resize = () => {
      chart.applyOptions({
        width: container.clientWidth || 640,
        height: container.clientHeight || 470
      });
    };
    const applyTheme = () => {
      chart.applyOptions(makeOptions());
      candleSeries.applyOptions({
        upColor: getChartColor(container, "--secondary", "#2fbc8f"),
        downColor: getChartColor(container, "--tertiary", "#df7d64"),
        wickUpColor: getChartColor(container, "--secondary", "#2fbc8f"),
        wickDownColor: getChartColor(container, "--tertiary", "#df7d64")
      });
    };

    resizeObserverRef.current = new ResizeObserver(resize);
    resizeObserverRef.current.observe(container);
    themeObserverRef.current = new MutationObserver(applyTheme);
    themeObserverRef.current.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      resizeObserverRef.current?.disconnect();
      themeObserverRef.current?.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      candleDataRef.current = [];
      volumeDataRef.current = [];
      activeCodeRef.current = "";
    };
  }, [activeInterval]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return undefined;

    const activeChartKey = `${stockCode}:${activeInterval}:${mode}`;
    activeCodeRef.current = activeChartKey;
    candleDataRef.current = [];
    volumeDataRef.current = [];
    candleSeries.setData([]);
    volumeSeries.setData([]);

    if (!stockCode) {
      setChartStatus("idle");
      setChartMessage("종목을 선택하세요.");
      return undefined;
    }

    let cancelled = false;
    setChartStatus("loading");
    setChartMessage("과거 차트 데이터를 불러오는 중입니다.");

    getMarketChartCandles(stockCode, {
      mode,
      interval: activeInterval,
      limit: activeInterval === "daily" ? 120 : 180
    })
      .then((chartPayload) => {
        if (cancelled || activeCodeRef.current !== activeChartKey) return;
        const candles = (chartPayload.candles || [])
          .map((candle) => ({
            time: Number(candle.time),
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close)
          }))
          .filter((candle) =>
            Number.isFinite(candle.time) &&
            candle.open > 0 &&
            candle.high > 0 &&
            candle.low > 0 &&
            candle.close > 0
          );
        const volumes = (chartPayload.candles || [])
          .map((candle) => ({
            time: Number(candle.time),
            value: Number(candle.volume) || 0,
            color: Number(candle.close) >= Number(candle.open) ? "var(--secondary)" : "var(--tertiary)"
          }))
          .filter((volume) => Number.isFinite(volume.time) && volume.value > 0);

        candleDataRef.current = candles;
        volumeDataRef.current = volumes;
        candleSeries.setData(candles);
        volumeSeries.setData(volumes);

        if (candles.length) {
          chart.timeScale().fitContent();
          setChartStatus("ready");
          setChartMessage(`키움 ${activeIntervalLabel} 과거 봉 ${candles.length}개를 불러왔습니다.`);
        } else {
          setChartStatus("empty");
          setChartMessage("키움 차트 응답에 표시할 봉 데이터가 없습니다.");
        }
      })
      .catch((error) => {
        if (cancelled || activeCodeRef.current !== activeChartKey) return;
        setChartStatus("error");
        setChartMessage(error.message || "과거 차트 데이터를 불러오지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, [stockCode, activeInterval, activeIntervalLabel, mode]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart || chartStatus !== "ready") return;
    if (!stockCode || latestPrice <= 0) return;

    const candles = candleDataRef.current;
    if (!candles.length) return;

    const time = getChartTimestamp(realtimeQuote?.time, activeInterval);
    const lastIndex = candles.length - 1;
    const previous = candles[lastIndex];
    if (!previous || time < previous.time) return;

    const next = time === previous.time
      ? {
          ...previous,
          high: Math.max(previous.high, latestPrice),
          low: Math.min(previous.low, latestPrice),
          close: latestPrice
        }
      : {
          time,
          open: previous.close,
          high: Math.max(previous.close, latestPrice),
          low: Math.min(previous.close, latestPrice),
          close: latestPrice
        };

    if (time === previous.time) {
      candles[lastIndex] = next;
      candleSeries.update(next);
    } else {
      candles.push(next);
      if (candles.length > (activeInterval === "daily" ? 180 : 240)) candles.shift();
      candleSeries.setData(candles);
      chart.timeScale().scrollToRealTime?.();
    }

    if (latestVolume > 0) {
      const volumes = volumeDataRef.current;
      const color = next.close >= next.open ? "var(--secondary)" : "var(--tertiary)";
      const lastVolume = volumes[volumes.length - 1];
      if (lastVolume?.time === time) {
        lastVolume.value = Math.max(lastVolume.value, latestVolume);
        lastVolume.color = color;
      } else if (time >= (lastVolume?.time || 0)) {
        volumes.push({ time, value: latestVolume, color });
        if (volumes.length > (activeInterval === "daily" ? 180 : 240)) volumes.shift();
      }
      volumeSeries.setData(volumes);
    }
  }, [stockCode, stock?.current, stock?.price, latestPrice, latestVolume, realtimeQuote?.time, activeInterval, chartStatus]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: {
        timeVisible: activeInterval !== "daily",
        secondsVisible: false
      }
    });
  }, [activeInterval]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex min-h-[48px] items-start justify-between gap-3">
        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface">주가 차트</h3>
          <span className="font-label-mono text-label-mono text-on-surface-variant">{stockCode || "대기"} · {activeIntervalLabel}</span>
        </div>
        <div className="grid grid-cols-2 gap-1 self-end rounded border border-outline-variant bg-surface-container-lowest p-1">
          {MARKET_CHART_INTERVAL_OPTIONS.map((option) => {
            const active = activeInterval === option.value;
            return (
              <button
                className={`h-8 rounded px-3 font-label-caps text-label-caps transition-colors ${active ? "bg-surface-container-highest text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                key={option.value}
                type="button"
                onClick={() => onIntervalChange?.(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="relative h-[470px] overflow-hidden rounded border border-outline-variant bg-surface-container-low">
        <div className="h-full w-full" ref={containerRef} />
        {chartStatus !== "ready" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-body-md text-body-md text-on-surface-variant">
            {chartMessage || "차트 데이터 대기 중"}
          </div>
        ) : null}
        {chartStatus === "ready" && chartMessage ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded border border-outline-variant bg-surface-container px-2 py-1 font-label-mono text-label-mono text-on-surface-variant">
            {chartMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OrderBook({ current, orderBook, selectedPrice, onSelectPrice }) {
  const currentNumber = Number(String(current).replace(/,/g, "")) || 0;
  const orderBookDepth = 5;
  const placeholderRows = Array.from({ length: orderBookDepth }, (_, index) => ({
    level: index + 1,
    priceText: "--",
    quantityText: "--",
    disabled: true
  }));
  const liveAsks = (orderBook?.asks || []).filter((level) => level.price > 0).slice(0, orderBookDepth).reverse();
  const liveBids = (orderBook?.bids || []).filter((level) => level.price > 0).slice(0, orderBookDepth);
  const hasLiveOrderBook = liveAsks.length > 0 || liveBids.length > 0;
  const asks = liveAsks.length ? liveAsks : placeholderRows;
  const bids = liveBids.length ? liveBids : placeholderRows;
  const sourceLabel = orderBook?.source === "kiwoom-websocket" ? "키움 실시간" : orderBook?.source === "kiwoom-rest" ? "키움 호가" : "실시간 호가 대기";
  const renderPriceRow = (side, level, index) => {
    const price = level.priceText || level.price;
    const volume = level.quantityText || Number(level.quantity || 0).toLocaleString();
    const selectable = !level.disabled && price !== "--";
    const active = selectable && selectedPrice === price;
    const sideClass = side === "ask" ? "orderbook-ask" : "orderbook-bid";
    return (
      <button
        className={`grid flex-1 grid-cols-2 items-center gap-2 px-2 py-1.5 text-left transition-colors ${selectable ? "hover:bg-surface-container-highest" : "cursor-default opacity-60"} ${sideClass} ${active ? "ring-1 ring-primary" : ""}`}
        disabled={!selectable}
        key={`${side}-${level.level || index}-${price}`}
        type="button"
        onClick={() => {
          if (selectable) onSelectPrice(price);
        }}
      >
        <strong className="font-label-mono text-label-mono">{price}</strong>
        <span className="text-right font-label-mono text-label-mono">{volume}</span>
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex min-h-[48px] items-start justify-between gap-3">
        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface">호가</h3>
          <span className="font-label-mono text-label-mono text-on-surface-variant">{hasLiveOrderBook ? `${sourceLabel} ${orderBook?.time || ""}` : sourceLabel}</span>
        </div>
      </div>
      <div className="h-[470px] rounded border border-outline-variant overflow-hidden flex flex-col">
        {asks.map((level, index) => renderPriceRow("ask", level, index))}
        <button
          className={`grid flex-1 grid-cols-2 items-center gap-2 px-2 py-1.5 bg-surface-container-high text-on-surface font-title-sm text-title-sm transition-colors ${currentNumber > 0 ? "hover:bg-surface-container-highest" : "cursor-default opacity-60"} ${currentNumber > 0 && selectedPrice === current ? "ring-1 ring-primary" : ""}`}
          disabled={currentNumber <= 0}
          type="button"
          onClick={() => {
            if (currentNumber > 0) onSelectPrice(current);
          }}
        >
          <strong>{currentNumber > 0 ? current : "--"}</strong>
          <span className="text-right font-label-mono text-label-mono">현재가</span>
        </button>
        {bids.map((level, index) => renderPriceRow("bid", level, index))}
      </div>
    </div>
  );
}

function OrderStatusPanel({ orders, selectedOrderId, onSelectOrder, syncStatus = "idle", syncMessage = "", syncedAt = "", onSyncOrders }) {
  const [filter, setFilter] = useState("open");
  const filteredOrders = orders.filter((order) => {
    if (filter === "open") return OPEN_ORDER_STATUSES.includes(order.status);
    return isFinishedOrderStatus(order.status);
  });
  const openCount = orders.filter((order) => OPEN_ORDER_STATUSES.includes(order.status)).length;
  const filledCount = orders.filter((order) => isFinishedOrderStatus(order.status)).length;
  const syncMessageClass = syncStatus === "error"
    ? "text-error"
    : syncStatus === "success"
      ? "text-secondary"
      : "text-on-surface-variant";

  function statusTone(status) {
    if (status === "체결") return "secondary";
    if (status === "부분 체결") return "tertiary";
    if (status === "취소") return "neutral";
    if (status === "거부") return "error";
    return "primary";
  }

  return (
    <Section className="min-h-[430px] flex h-full flex-col">
      <div className="p-widget-padding border-b border-outline-variant flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="text-primary">receipt_long</Icon>
            <h3 className="font-headline-md text-headline-md text-on-surface">주문 현황</h3>
          </div>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={syncStatus === "loading" || openCount === 0}
            onClick={onSyncOrders}
            aria-label="미체결 주문 동기화"
            title={syncedAt ? `최근 동기화 ${syncedAt}` : "미체결 주문 동기화"}
          >
            <Icon className="text-[16px]">{syncStatus === "loading" ? "hourglass_top" : "sync"}</Icon>
          </button>
        </div>
        {syncMessage ? (
          <p className={`font-body-sm text-body-sm ${syncMessageClass}`}>{syncMessage}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-gutter">
          {[
            ["open", `미체결 ${openCount}`],
            ["done", `체결 ${filledCount}`]
          ].map(([key, label]) => (
            <button
              className={`py-2 rounded border font-label-caps text-label-caps ${
                filter === key ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"
              }`}
              key={key}
              type="button"
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="section-body-scroll custom-scrollbar flex-1 min-h-0">
        <div className="divide-y divide-outline-variant/40">
          {filteredOrders.map((order) => {
            const editable = OPEN_ORDER_STATUSES.includes(order.status);
            const active = selectedOrderId === order.id;
            return (
              <button
                aria-disabled={!editable}
                className={`w-full px-widget-padding py-3 text-left transition-colors ${
                  editable ? "hover:bg-surface-container-highest" : "cursor-default"
                } ${active ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""}`}
                key={order.id}
                type="button"
                onClick={() => {
                  if (editable) onSelectOrder(order);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-title-sm text-title-sm text-on-surface truncate">{order.name}</p>
                      <span className="font-label-mono text-label-mono text-on-surface-variant">{order.code}</span>
                    </div>
                    <p className={`font-label-caps text-label-caps mt-1 ${order.side === "매수" ? "text-secondary" : "text-tertiary"}`}>
                      {order.side} · {order.orderType}
                    </p>
                  </div>
                  <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 xl:grid-cols-4">
                  <div className="bg-surface-container-low rounded border border-outline-variant p-2">
                    <span className="block font-label-caps text-label-caps text-on-surface-variant">가격</span>
                    <span className="block font-label-mono text-label-mono text-on-surface mt-1">{order.price}</span>
                  </div>
                  <div className="bg-surface-container-low rounded border border-outline-variant p-2">
                    <span className="block font-label-caps text-label-caps text-on-surface-variant">수량</span>
                    <span className="block font-label-mono text-label-mono text-on-surface mt-1">{order.quantity}</span>
                  </div>
                  <div className="bg-surface-container-low rounded border border-outline-variant p-2">
                    <span className="block font-label-caps text-label-caps text-on-surface-variant">체결</span>
                    <span className="block font-label-mono text-label-mono text-on-surface mt-1">{order.filledQuantity}</span>
                  </div>
                  <div className="bg-surface-container-low rounded border border-outline-variant p-2">
                    <span className="block font-label-caps text-label-caps text-on-surface-variant">수수료</span>
                    <span className="block font-label-mono text-label-mono text-on-surface mt-1">{order.estimatedFee ? `${Number(order.estimatedFee).toLocaleString("ko-KR")}원` : "--"}</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="font-label-mono text-label-mono text-on-surface-variant">{order.time}</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {order.orderSyncMessage || (editable ? (active ? "주문창에서 정정 중" : "클릭하면 주문창에서 정정/취소") : "처리 완료")}
                  </span>
                </div>
              </button>
            );
          })}
          {filteredOrders.length === 0 ? (
            <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">표시할 주문이 없습니다.</div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function OrderPanel({ selected, accountProfile, orderPrice, setOrderPrice, editingOrder, submitMessage, submitMessageTone, onSubmitOrder, onAmendOrder, onCancelOrder, onClearEditing }) {
  const [orderSide, setOrderSide] = useState("buy");
  const [orderType, setOrderType] = useState("지정가");
  const [quantity, setQuantity] = useState("10");
  const [orderMessage, setOrderMessage] = useState("");
  const isEditing = Boolean(editingOrder);
  const orderPriceText = String(orderPrice || "").trim();
  const currentPrice = Number(orderPriceText.replace(/,/g, "")) || 0;
  const orderableCash = accountProfile.orderableCash;
  const holdingQuantity = accountProfile.holdings[selected.code] || 0;
  const maxBuyQuantity = currentPrice ? Math.floor(orderableCash / (currentPrice * (1 + TRADING_FEE_RATE))) : 0;
  const holdingValue = holdingQuantity * currentPrice;
  const limitQuantity = orderSide === "buy" ? maxBuyQuantity : holdingQuantity;
  const isBuy = orderSide === "buy";
  const hasAccountData = accountProfile.hasAccountData !== false;
  const submitMessageClass = {
    neutral: "text-on-surface-variant",
    error: "text-error",
    success: "text-secondary"
  }[submitMessageTone] || "text-on-surface-variant";

  useEffect(() => {
    if (!editingOrder) {
      setQuantity(String(Math.min(10, Math.max(limitQuantity, 0))));
    }
  }, [selected.code, orderSide, limitQuantity, editingOrder]);

  useEffect(() => {
    if (!editingOrder) return;
    setOrderSide(editingOrder.side === "매수" ? "buy" : "sell");
    setOrderType(editingOrder.orderType);
    setOrderPrice(editingOrder.price);
    setQuantity(String(editingOrder.quantity));
  }, [editingOrder, setOrderPrice]);

  const numericQuantity = Number(quantity) || 0;
  const minimumQuantity = editingOrder?.filledQuantity || 0;
  const estimatedGrossAmount = currentPrice > 0 && numericQuantity > 0 ? currentPrice * numericQuantity : 0;
  const estimatedFee = estimateTradingFee(estimatedGrossAmount);
  const estimatedSettlement = isBuy ? estimatedGrossAmount + estimatedFee : Math.max(0, estimatedGrossAmount - estimatedFee);
  const canSubmit = numericQuantity > 0 && numericQuantity <= limitQuantity && numericQuantity >= minimumQuantity;

  function validateOrderFields() {
    if (!orderPriceText) {
      setOrderMessage(requiredInputMessage("주문 가격"));
      return false;
    }

    if (!quantity.trim()) {
      setOrderMessage(requiredInputMessage("주문 수량"));
      return false;
    }

    if (currentPrice <= 0) {
      setOrderMessage(invalidInputMessage("주문 가격은 0보다 커야 합니다."));
      return false;
    }

    if (numericQuantity <= 0) {
      setOrderMessage(invalidInputMessage("주문 수량은 1주 이상이어야 합니다."));
      return false;
    }

    if (numericQuantity > limitQuantity) {
      setOrderMessage(invalidInputMessage(`주문 수량은 최대 ${limitQuantity.toLocaleString()}주를 넘을 수 없습니다.`));
      return false;
    }

    if (numericQuantity < minimumQuantity) {
      setOrderMessage(invalidInputMessage("부분 체결된 수량보다 낮게 줄일 수 없습니다."));
      return false;
    }

    setOrderMessage("");
    return true;
  }

  function submitOrder() {
    if (!validateOrderFields()) return;
    const nextOrder = {
      orderType,
      price: orderPriceText,
      quantity: numericQuantity,
      grossAmount: estimatedGrossAmount,
      estimatedFee,
      estimatedSettlement,
      feeRate: TRADING_FEE_RATE
    };

    if (editingOrder) {
      onAmendOrder(editingOrder.id, nextOrder);
      return;
    }

    onSubmitOrder({
      side: isBuy ? "매수" : "매도",
      ...nextOrder
    });
  }

  return (
    <Section className="min-h-[430px] shrink-0">
      <div className="p-widget-padding">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-headline-md text-headline-md text-on-surface">{isEditing ? "주문 정정" : "주문"}</h3>
          {isEditing ? (
            <button className="rounded border border-outline-variant px-3 py-1.5 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-highest" type="button" onClick={onClearEditing}>
              새 주문
            </button>
          ) : null}
        </div>
        {isEditing ? (
          <div className="mb-gutter rounded-lg border border-primary/40 bg-primary/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-title-sm text-title-sm text-primary">{editingOrder.name} 정정 중</span>
              <span className="font-label-mono text-label-mono text-on-surface-variant">체결 {editingOrder.filledQuantity}/{editingOrder.quantity}</span>
            </div>
            <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">가격과 수량을 수정하거나 주문을 취소할 수 있습니다.</p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-gutter mb-gutter">
          {[
            ["buy", "매수", "add_shopping_cart", "최대 매수 가능", hasAccountData ? `${maxBuyQuantity.toLocaleString()}주` : "--"],
            ["sell", "매도", "sell", "보유 잔량", hasAccountData ? `${holdingQuantity.toLocaleString()}주` : "--"]
          ].map(([side, label, icon, metaLabel, metaValue]) => {
            const active = orderSide === side;
            const buySide = side === "buy";
            return (
              <button
                aria-disabled={isEditing}
                aria-pressed={active}
                className={`min-h-[82px] rounded-lg border p-3 text-left transition-all ${
                  active
                    ? buySide
                      ? "border-secondary bg-secondary/10 text-secondary shadow-[inset_0_0_0_1px_rgb(var(--secondary-rgb)/0.3)]"
                      : "border-tertiary bg-tertiary/10 text-tertiary shadow-[inset_0_0_0_1px_rgb(var(--tertiary-rgb)/0.3)]"
                    : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:bg-surface-container-highest"
                } ${isEditing && !active ? "opacity-50 hover:bg-surface-container-low" : ""}`}
                key={side}
                type="button"
                onClick={() => {
                  if (!isEditing) setOrderSide(side);
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-title-sm text-title-sm">
                    <Icon className="text-[20px]">{icon}</Icon>
                    {label}
                  </span>
                  {active ? <Icon className="text-[18px]">radio_button_checked</Icon> : null}
                </span>
                <span className="block font-label-caps text-label-caps mt-3 opacity-80">{metaLabel}</span>
                <span className="block font-label-mono text-label-mono mt-1">{metaValue}</span>
              </button>
            );
          })}
        </div>
        <div className={`rounded-lg border p-3 mb-gutter ${isBuy ? "border-secondary/50 bg-secondary/10" : "border-tertiary/50 bg-tertiary/10"}`}>
          <div className="flex items-center justify-between gap-3">
            <span className={`font-title-sm text-title-sm ${isBuy ? "text-secondary" : "text-tertiary"}`}>{isEditing ? "정정 대상" : "현재 선택"}: {isBuy ? "매수" : "매도"}</span>
            <span className="font-label-mono text-label-mono text-on-surface">{selected.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-gutter mt-3">
            <div className="bg-surface-container-low rounded border border-outline-variant p-2">
              <span className="block font-label-caps text-label-caps text-on-surface-variant">{isBuy ? "주문 가능 금액" : "보유 평가액"}</span>
              <span className="block font-label-mono text-label-mono text-on-surface mt-1">
                {hasAccountData ? `${(isBuy ? orderableCash : holdingValue).toLocaleString()}원` : "--"}
              </span>
            </div>
            <div className="bg-surface-container-low rounded border border-outline-variant p-2">
              <span className="block font-label-caps text-label-caps text-on-surface-variant">{isBuy ? "최대 매수 가능" : "보유 잔량"}</span>
              <span className={`block font-label-mono text-label-mono mt-1 ${isBuy ? "text-secondary" : holdingQuantity > 0 ? "text-tertiary" : "text-error"}`}>
                {hasAccountData ? `${limitQuantity.toLocaleString()}주` : "--"}
              </span>
            </div>
          </div>
          {!isBuy && hasAccountData && holdingQuantity === 0 ? (
            <p className="font-body-sm text-body-sm text-error mt-3">보유 수량이 없어 매도 주문을 진행할 수 없습니다.</p>
          ) : null}
          {isEditing && minimumQuantity > 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-3">부분 체결된 수량보다 낮게 줄일 수 없습니다.</p>
          ) : null}
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="font-label-caps text-label-caps text-on-surface-variant">주문 방식</span>
            <select
              className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
              value={orderType}
              onChange={(event) => setOrderType(event.target.value)}
            >
              <option>지정가</option>
              <option>시장가</option>
              <option>현재가</option>
            </select>
          </label>
          <label className="block">
            <span className="font-label-caps text-label-caps text-on-surface-variant">가격</span>
            <input
              className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-label-mono text-label-mono text-right text-on-surface"
              inputMode="numeric"
              type="text"
              value={orderPrice}
              onChange={(event) => {
                setOrderPrice(event.target.value.replace(/[^\d,]/g, ""));
                setOrderMessage("");
              }}
            />
          </label>
          <label className="block">
            <span className="font-label-caps text-label-caps text-on-surface-variant">수량</span>
            <input
              className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-label-mono text-label-mono text-right text-on-surface"
              inputMode="numeric"
              max={limitQuantity}
              placeholder={hasAccountData ? `최대 ${limitQuantity.toLocaleString()}주` : "계좌 연결 후 입력"}
              type="text"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value.replace(/[^\d]/g, ""));
                setOrderMessage("");
              }}
            />
          </label>
          <div className="rounded border border-outline-variant bg-surface-container-low p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-label-caps text-label-caps text-on-surface-variant">예상 비용</span>
              <span className="font-label-mono text-label-mono text-on-surface-variant">수수료 {formatFeeRate()}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["주문금액", estimatedGrossAmount ? `${Math.round(estimatedGrossAmount).toLocaleString("ko-KR")}원` : "--"],
                ["예상 수수료", estimatedFee ? `${estimatedFee.toLocaleString("ko-KR")}원` : "--"],
                [isBuy ? "예상 필요금액" : "예상 정산금액", estimatedSettlement ? `${Math.round(estimatedSettlement).toLocaleString("ko-KR")}원` : "--"]
              ].map(([label, value]) => (
                <div className="rounded border border-outline-variant bg-surface-container-lowest p-2" key={label}>
                  <span className="block font-label-caps text-label-caps text-on-surface-variant">{label}</span>
                  <span className="mt-1 block font-label-mono text-label-mono text-on-surface">{value}</span>
                </div>
              ))}
            </div>
          </div>
          {orderMessage ? (
            <p className="font-body-sm text-body-sm text-error">{orderMessage}</p>
          ) : submitMessage ? (
            <p className={`font-body-sm text-body-sm ${submitMessageClass}`}>{submitMessage}</p>
          ) : null}
          <button
            className={`w-full py-2 rounded font-label-caps text-label-caps hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100 ${
              isEditing ? "bg-primary-container text-on-primary-container" : isBuy ? "bg-secondary-container text-on-secondary-container" : "bg-tertiary-container text-on-tertiary-container"
            }`}
            aria-disabled={!canSubmit}
            type="button"
            onClick={submitOrder}
          >
            {isEditing ? "정정 적용" : isBuy ? "매수 주문 확인" : "매도 주문 확인"}
          </button>
          {isEditing ? (
            <button
              className="w-full rounded border border-error/40 py-2 font-label-caps text-label-caps text-error hover:bg-error/10"
              type="button"
              onClick={() => onCancelOrder(editingOrder.id)}
            >
              주문 취소
            </button>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function StockInfo({ selected, embedded = false }) {
  const content = (
    <>
      {embedded ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-headline-md text-headline-md text-on-surface">종목 정보</h3>
          <span className="font-label-caps text-label-caps text-primary">{selected.market}</span>
        </div>
      ) : (
        <SectionTitle icon="info" title="종목 정보" meta={selected.market} />
      )}
      <div className={`${embedded ? "space-y-2" : "p-widget-padding space-y-3"}`}>
        {[
          ["업종", selected.sector],
          ["시가총액", selected.marketCap],
          ["거래량", selected.volume],
          ["고가", selected.high],
          ["저가", selected.low],
          ["거래대금", selected.value]
        ].map(([label, value]) => (
          <div className="flex items-center justify-between bg-surface-container-low rounded border border-outline-variant p-3" key={label}>
            <span className="font-body-sm text-body-sm text-on-surface-variant">{label}</span>
            <span className="font-label-mono text-label-mono text-on-surface">{value}</span>
          </div>
        ))}
      </div>
    </>
  );

  if (embedded) {
    return <div className="p-widget-padding">{content}</div>;
  }

  return (
    <Section className="section-scroll-sm h-full w-full">
      {content}
    </Section>
  );
}

function StrategyPage({ navigate, favoriteGroups, executionMode, strategies, setStrategies, sourceStrategies, sourceMode, schedulerStatus, onSchedulerStatusChange, onRecordActivity }) {
  const { requirePin } = usePinAuth();
  const [selectedId, setSelectedId] = useState(strategies[0]?.id ?? null);
  const [conditionSide, setConditionSide] = useState("buy");
  const [importMessage, setImportMessage] = useState("");
  const [importMessageTone, setImportMessageTone] = useState("info");
  const [showImportPicker, setShowImportPicker] = useState(false);
  const [selectedImportId, setSelectedImportId] = useState("");
  const [strategyQuery, setStrategyQuery] = useState("");
  const [strategyStatusFilter, setStrategyStatusFilter] = useState("전체 상태");
  const [strategyDraft, setStrategyDraft] = useState(null);
  const [stockSearch, setStockSearch] = useState("");
  const [allocationNotice, setAllocationNotice] = useState("");
  const [schedulerActionBusyId, setSchedulerActionBusyId] = useState("");
  const [schedulerActionMessage, setSchedulerActionMessage] = useState("");
  const [selectedSchedulerAction, setSelectedSchedulerAction] = useState(null);
  const [autoOrderConsent, setAutoOrderConsent] = useState(false);
  const [runtimeHistory, setRuntimeHistory] = useState({ actions: [], fills: [], positions: [] });
  const [runtimeHistoryStatus, setRuntimeHistoryStatus] = useState("idle");
  const modeLabel = accountProfiles[executionMode].shortLabel;
  const sourceModeLabel = accountProfiles[sourceMode].shortLabel;
  const normalizedStrategyQuery = strategyQuery.trim().toLowerCase();
  const importableStrategies = useMemo(() => {
    const currentNames = new Set(strategies.map((strategy) => strategy.name));
    return sourceStrategies.filter((strategy) => !currentNames.has(strategy.name));
  }, [strategies, sourceStrategies]);
  const filteredStrategies = useMemo(() => strategies.filter((strategy) => {
    const matchesQuery = [
      strategy.name,
      strategy.description,
      strategy.scope,
      strategy.target,
      strategy.orderMode
    ].some((value) => String(value || "").toLowerCase().includes(normalizedStrategyQuery));
    const matchesStatus = strategyStatusFilter === "전체 상태" || strategy.status === strategyStatusFilter;
    return matchesQuery && matchesStatus;
  }), [normalizedStrategyQuery, strategies, strategyStatusFilter]);
  const selectedImportStrategy = importableStrategies.find((strategy) => String(strategy.id) === String(selectedImportId)) || importableStrategies[0];
  const selected = strategies.find((strategy) => String(strategy.id) === String(selectedId)) || strategies[0];
  const hasSelectedStrategy = selectedId !== null && selectedId !== undefined && Boolean(selected);
  const selectedDraft = strategyDraft && String(strategyDraft.id) === String(selectedId) ? strategyDraft : createStrategyDraft(selected);
  const canEditSelectedStrategy = Boolean(hasSelectedStrategy && selectedDraft);
  const activeStrategyCount = strategies.filter((strategy) => strategy.status === "활성").length;
  const selectedPositionModeLabel = STRATEGY_POSITION_MODES.find((mode) => mode.value === selected?.positionMode)?.label || "분산 투자";
  const selectedSignalConflictOption = SIGNAL_CONFLICT_PRIORITY_OPTIONS.find((option) => option.value === (selectedDraft?.signalConflictPriority || "sell")) || SIGNAL_CONFLICT_PRIORITY_OPTIONS[0];
  const selectedSignalConflictSummary = useMemo(() => getSignalConflictSummary(selectedDraft), [selectedDraft]);
  const signalConflictPanelClass = selectedSignalConflictSummary.tone === "error"
    ? "border-error/30 bg-error/10"
    : selectedSignalConflictSummary.tone === "watch"
      ? "border-tertiary/30 bg-tertiary/10"
      : "border-secondary/30 bg-secondary/10";
  const signalConflictIconClass = selectedSignalConflictSummary.tone === "error"
    ? "text-error"
    : selectedSignalConflictSummary.tone === "watch"
      ? "text-tertiary"
      : "text-secondary";
  const visibleSignalConflictItems = selectedSignalConflictSummary.conflicts.length
    ? selectedSignalConflictSummary.conflicts
    : selectedSignalConflictSummary.watchItems;
  const activeOverlapNotice = useMemo(() => {
    const activeStrategies = strategies.filter((strategy) => strategy.status === "활성");
    const wholeMarketStrategies = activeStrategies.filter((strategy) => strategy.scope === "전체 종목");
    if (wholeMarketStrategies.length > 1) {
      return invalidInputMessage(`전체 종목 전략은 하나만 활성화할 수 있습니다. '${wholeMarketStrategies[0].name}' 또는 '${wholeMarketStrategies[1].name}' 중 하나를 중지하세요.`);
    }

    if (stocks.length > 0 && wholeMarketStrategies.length === 1 && !getStrategySearchUniverseCodes(wholeMarketStrategies[0]).length) {
      return invalidInputMessage(`'${wholeMarketStrategies[0].name}' 전체 종목 전략이 검색할 남은 종목이 없습니다. 다른 활성 전략의 대상 종목을 줄이세요.`);
    }

    for (let firstIndex = 0; firstIndex < activeStrategies.length; firstIndex += 1) {
      const firstStrategy = activeStrategies[firstIndex];
      if (firstStrategy.scope === "전체 종목") continue;
      const firstCodes = new Set(getExplicitStrategyTargetCodes(firstStrategy));
      for (let secondIndex = firstIndex + 1; secondIndex < activeStrategies.length; secondIndex += 1) {
        const secondStrategy = activeStrategies[secondIndex];
        if (secondStrategy.scope === "전체 종목") continue;
        const overlappingCode = getExplicitStrategyTargetCodes(secondStrategy).find((code) => firstCodes.has(code));
        if (overlappingCode) {
          const stockName = getStockByCode(overlappingCode)?.name || overlappingCode;
          return invalidInputMessage(`${stockName} 대상이 '${firstStrategy.name}'와 '${secondStrategy.name}' 활성 전략에서 겹칩니다. 하나를 중지하세요.`);
        }
      }
    }
    return "";
  }, [strategies, favoriteGroups]);
  const strategyNoticeClass = importMessageTone === "error"
    ? "border-error/30 bg-error/10 text-error"
    : "border-primary/20 bg-primary/10 text-primary";
  const schedulerStatusTone = schedulerStatus?.status === "running"
    ? "secondary"
    : schedulerStatus?.status === "error"
      ? "error"
      : "neutral";
  const schedulerStatusText = schedulerStatus?.status === "running"
    ? "실행 중"
    : schedulerStatus?.status === "error"
      ? "오류"
      : "대기";
  const pendingSchedulerActions = Array.isArray(schedulerStatus?.pendingActions) ? schedulerStatus.pendingActions : [];
  const historyActions = Array.isArray(runtimeHistory.actions) && runtimeHistory.actions.length ? runtimeHistory.actions : [];
  const historyPositions = Array.isArray(runtimeHistory.positions) && runtimeHistory.positions.length ? runtimeHistory.positions : [];
  const latestSchedulerActions = historyActions.length ? historyActions : Array.isArray(schedulerStatus?.latestActions) ? schedulerStatus.latestActions : [];
  const schedulerPositions = historyPositions.length ? historyPositions : Array.isArray(schedulerStatus?.positions) ? schedulerStatus.positions : [];
  const selectedSchedulerActions = selected
    ? latestSchedulerActions.filter((action) => String(action.strategyId) === String(selected.id)).slice(0, 6)
    : latestSchedulerActions.slice(0, 6);
  const selectedSchedulerPositions = selected
    ? schedulerPositions.filter((position) => String(position.strategyId) === String(selected.id)).slice(0, 6)
    : schedulerPositions.slice(0, 6);

  function schedulerActionStatusLabel(status) {
    return {
      approval_pending: "승인 대기",
      order_requested: "주문 요청",
      order_submitted: "주문 제출",
      order_failed: "주문 실패",
      rejected: "거절",
      filled: "체결",
      cancelled: "취소",
      blocked: "차단"
    }[status] || status || "--";
  }

  function schedulerActionStatusTone(status) {
    if (status === "filled") return "secondary";
    if (status === "order_failed" || status === "cancelled" || status === "blocked") return "error";
    if (status === "order_submitted" || status === "order_requested") return "primary";
    if (status === "approval_pending") return "tertiary";
    return "neutral";
  }

  function schedulerActionTime(action) {
    const value = action.filledAt || action.submittedAt || action.approvedAt || action.createdAt || "";
    return value ? String(value).replace("T", " ").slice(0, 16) : "--";
  }

  async function refreshRuntimeHistory() {
    setRuntimeHistoryStatus("loading");
    try {
      const history = await getStrategyRuntimeHistory(executionMode, 100);
      setRuntimeHistory({
        actions: Array.isArray(history.actions) ? history.actions : [],
        fills: Array.isArray(history.fills) ? history.fills : [],
        positions: Array.isArray(history.positions) ? history.positions : []
      });
      setRuntimeHistoryStatus("success");
    } catch {
      setRuntimeHistoryStatus("error");
    }
  }

  function setStrategyNotice(message, tone = "info") {
    setImportMessage(message);
    setImportMessageTone(tone);
  }

  async function decideSchedulerAction(action, decision) {
    if (!action?.id) return;
    setSchedulerActionBusyId(`${decision}:${action.id}`);
    setSchedulerActionMessage("");
    try {
      const nextStatus = decision === "approve"
        ? await approveStrategyAction({ mode: executionMode, actionId: action.id })
        : await rejectStrategyAction({ mode: executionMode, actionId: action.id });
      onSchedulerStatusChange?.(nextStatus);
      setSchedulerActionMessage(`${action.name || action.code} ${decision === "approve" ? "주문을 승인했습니다." : "주문을 거절했습니다."}`);
    } catch (error) {
      setSchedulerActionMessage(error.message || "전략 주문 처리에 실패했습니다.");
    } finally {
      setSchedulerActionBusyId("");
    }
  }

  async function cancelSchedulerOrder(action) {
    if (!action?.id || !action.brokerOrderNo) return;
    if (!requirePin()) return;
    const confirmed = window.confirm(`${action.name || action.code} 전략 주문을 취소할까요?`);
    if (!confirmed) return;

    setSchedulerActionBusyId(`cancel:${action.id}`);
    setSchedulerActionMessage("");
    try {
      const nextStatus = await cancelStrategyActionOrder({ mode: executionMode, actionId: action.id });
      onSchedulerStatusChange?.(nextStatus);
      await refreshRuntimeHistory();
      setSchedulerActionMessage(`${action.name || action.code} 주문 취소를 요청했습니다.`);
    } catch (error) {
      setSchedulerActionMessage(error.message || "전략 주문 취소에 실패했습니다.");
    } finally {
      setSchedulerActionBusyId("");
    }
  }

  async function amendSchedulerOrder(action) {
    if (!action?.id || !action.brokerOrderNo) return;
    if (!requirePin()) return;

    const currentQuantity = Math.max(1, Number(action.quantity || 0) - Number(action.filledQuantity || 0));
    const quantityInput = window.prompt("정정 수량을 입력하세요.", String(currentQuantity));
    if (quantityInput === null) return;
    const quantity = Number(String(quantityInput).replace(/[^\d]/g, ""));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setSchedulerActionMessage("정정 수량을 1주 이상으로 입력하세요.");
      return;
    }

    const isMarketOrder = action.orderType === "market";
    let price = null;
    if (!isMarketOrder) {
      const currentPrice = Number(action.price || 0);
      const priceInput = window.prompt("정정 가격을 입력하세요.", currentPrice ? String(currentPrice) : "");
      if (priceInput === null) return;
      price = Number(String(priceInput).replace(/[^\d.]/g, ""));
      if (!Number.isFinite(price) || price <= 0) {
        setSchedulerActionMessage("정정 가격을 0보다 크게 입력하세요.");
        return;
      }
    }

    setSchedulerActionBusyId(`amend:${action.id}`);
    setSchedulerActionMessage("");
    try {
      const nextStatus = await amendStrategyActionOrder({
        mode: executionMode,
        actionId: action.id,
        quantity,
        orderType: isMarketOrder ? "market" : "limit",
        price
      });
      onSchedulerStatusChange?.(nextStatus);
      await refreshRuntimeHistory();
      setSchedulerActionMessage(`${action.name || action.code} 주문 정정을 요청했습니다.`);
    } catch (error) {
      setSchedulerActionMessage(error.message || "전략 주문 정정에 실패했습니다.");
    } finally {
      setSchedulerActionBusyId("");
    }
  }

  useEffect(() => {
    if (!strategies.length) {
      setSelectedId(null);
      return;
    }
    if (!strategies.some((strategy) => String(strategy.id) === String(selectedId))) {
      setSelectedId(strategies[0].id);
    }
  }, [strategies, selectedId]);

  useEffect(() => {
    refreshRuntimeHistory();
  }, [executionMode, schedulerStatus?.scanCount]);

  useEffect(() => {
    if (!filteredStrategies.length) return;
    if (!filteredStrategies.some((strategy) => String(strategy.id) === String(selectedId))) {
      setSelectedId(filteredStrategies[0].id);
    }
  }, [filteredStrategies, selectedId]);

  useEffect(() => {
    if (!importableStrategies.length) {
      setSelectedImportId("");
      return;
    }
    if (!importableStrategies.some((strategy) => String(strategy.id) === String(selectedImportId))) {
      setSelectedImportId(String(importableStrategies[0].id));
    }
  }, [importableStrategies, selectedImportId]);

  useEffect(() => {
    setStrategyDraft(createStrategyDraft(selected));
    setStockSearch("");
    setAllocationNotice("");
    setImportMessage("");
    setImportMessageTone("info");
    setAutoOrderConsent(false);
    setSelectedSchedulerAction(null);
  }, [selectedId]);

  useEffect(() => {
    setAllocationNotice("");
  }, [conditionSide]);

  const selectedScope = selectedDraft?.scope || "개별 종목";
  const stageKey = conditionSide === "buy" ? "buyStages" : "sellStages";
  const activeStages = canEditSelectedStrategy && Array.isArray(selectedDraft?.[stageKey]) ? selectedDraft[stageKey] : [];
  const selectedTargetCodes = Array.isArray(selectedDraft?.targetStocks) ? selectedDraft.targetStocks : [];
  const selectedTargetStocks = selectedTargetCodes.map((code) => getStockByCode(code)).filter(Boolean);
  const selectedSearchUniverseCodes = selectedDraft?.scope === "전체 종목"
    ? getStrategySearchUniverseCodes({ ...selected, ...selectedDraft })
    : [];
  const selectedReservedTargetCount = selectedDraft?.scope === "전체 종목"
    ? getReservedTargetCodes(selectedDraft.id).size
    : 0;

  function createStrategyDraft(strategy) {
    if (!strategy) return null;
    const buyStages = cloneStrategyStages(strategy, "buy");
    const sellStages = cloneStrategyStages(strategy, "sell");

    return {
      id: strategy.id,
      name: strategy.name || "",
      orderMode: strategy.orderMode || "승인 후 주문",
      signalConflictPriority: strategy.signalConflictPriority === "buy" ? "buy" : "sell",
      positionMode: strategy.positionMode === "single" ? "single" : "distributed",
      strategyLossLimit: strategy.strategyLossLimit || DEFAULT_STRATEGY_LOSS_LIMIT,
      strategyOrderLimit: strategy.strategyOrderLimit || strategy.stockOrderLimit || DEFAULT_STRATEGY_ORDER_LIMIT,
      scope: strategy.scope || "개별 종목",
      target: strategy.target || "대상 미지정",
      targetStocks: getTargetStockCodes(strategy),
      buyStages,
      sellStages,
      buyConditions: buyStages.length ? cloneStrategyConditions(buyStages[0]?.conditions, "buy") : [],
      sellConditions: sellStages.length ? cloneStrategyConditions(sellStages[0]?.conditions, "sell") : []
    };
  }

  function updateStrategyDraft(patch) {
    if (!ensureEditableStrategy()) return;
    setStrategyNotice("");
    setStrategyDraft((current) => {
      const baseDraft = getEditableDraftBase(current);
      return baseDraft ? { ...baseDraft, ...patch } : baseDraft;
    });
  }

  function ensureEditableStrategy() {
    if (canEditSelectedStrategy) return true;
    setStrategyNotice("먼저 새 전략을 추가하거나 전략 목록에서 편집할 전략을 선택하세요.", "error");
    return false;
  }

  function getEditableDraftBase(current) {
    if (!canEditSelectedStrategy) return null;
    if (current && String(current.id) === String(selectedId)) return current;
    if (selectedDraft && String(selectedDraft.id) === String(selectedId)) return selectedDraft;
    return createStrategyDraft(selected);
  }

  function updateTargetStocks(codes) {
    const uniqueCodes = [...new Set(codes.filter((code) => getStockByCode(code)))];
    updateStrategyDraft({
      targetStocks: uniqueCodes,
      target: summarizeTargetStocks(uniqueCodes)
    });
  }

  function addTargetStock(rawValue = stockSearch) {
    if (!String(rawValue || "").trim()) {
      setStrategyNotice(requiredInputMessage("종목명 또는 코드"), "error");
      return;
    }

    const stock = findStockBySearchValue(rawValue);
    if (!stock) {
      setStrategyNotice(invalidInputMessage("등록된 종목명 또는 코드를 선택해야 합니다."), "error");
      return;
    }

    updateTargetStocks([...selectedTargetCodes, stock.code]);
    setStockSearch("");
    setStrategyNotice(`${stock.name}을 전략 대상에 추가했습니다.`);
  }

  function removeTargetStock(code) {
    updateTargetStocks(selectedTargetCodes.filter((targetCode) => targetCode !== code));
  }

  function updateDraftStage(stageIndex, patch) {
    if (!ensureEditableStrategy()) return;
    setStrategyNotice("");
    setStrategyDraft((current) => {
      const baseDraft = getEditableDraftBase(current);
      if (!baseDraft) return baseDraft;
      const baseStages = cloneStrategyStages(baseDraft, conditionSide);
      const nextPatch = { ...patch };
      if (Object.prototype.hasOwnProperty.call(nextPatch, "allocation")) {
        const otherAllocation = baseStages.reduce((sum, stage, index) => index === stageIndex ? sum : sum + getAllocationAmount(stage.allocation), 0);
        const maxAllocation = Math.max(0, 100 - otherAllocation);
        const rawValue = String(nextPatch.allocation ?? "").replace(/[^\d.]/g, "");
        const nextAllocation = getAllocationAmount(rawValue);
        if (rawValue && nextAllocation > maxAllocation) {
          setAllocationNotice(`${conditionSide === "buy" ? "매수" : "매도"} 비중 합계는 100%를 넘을 수 없습니다. 이 단계에는 최대 ${formatAllocationAmount(maxAllocation)}%까지 입력할 수 있습니다.`);
          return baseDraft;
        }
        setAllocationNotice("");
        nextPatch.allocation = rawValue ? formatAllocationAmount(nextAllocation) : "";
      }
      return {
        ...baseDraft,
        [stageKey]: baseStages.map((stage, index) => index === stageIndex ? { ...stage, ...nextPatch } : stage)
      };
    });
  }

  function updateDraftStageCondition(stageIndex, conditionIndex, field, value) {
    if (!ensureEditableStrategy()) return;
    setStrategyNotice("");
    setStrategyDraft((current) => {
      const baseDraft = getEditableDraftBase(current);
      if (!baseDraft) return baseDraft;
      const baseStages = cloneStrategyStages(baseDraft, conditionSide);
      return {
        ...baseDraft,
        [stageKey]: baseStages.map((stage, index) => {
          if (index !== stageIndex) return stage;
          const conditions = cloneStrategyConditions(stage.conditions, conditionSide);
          return {
            ...stage,
            conditions: conditions.map((condition, currentConditionIndex) => {
              if (currentConditionIndex !== conditionIndex) return condition;
              const conditionLogic = normalizeConditionLogic(condition[3]);
              if (field === 3) {
                return [
                  condition[0],
                  condition[1],
                  condition[2],
                  normalizeConditionLogic(value)
                ];
              }
              if (field === 0) {
                const nextIndicator = normalizeIndicatorName(value);
                const nextOperator = normalizeConditionOperator(nextIndicator, condition[1], conditionSide);
                return [
                  nextIndicator,
                  nextOperator,
                  normalizeConditionValue(nextIndicator, nextOperator, condition[2], conditionSide),
                  conditionLogic
                ];
              }

              if (field === 1) {
                const nextOperator = normalizeConditionOperator(condition[0], value, conditionSide);
                return [
                  condition[0],
                  nextOperator,
                  normalizeConditionValue(condition[0], nextOperator, condition[2], conditionSide),
                  conditionLogic
                ];
              }

              return [
                condition[0],
                condition[1],
                value,
                conditionLogic
              ];
            })
          };
        })
      };
    });
  }

  function addDraftStageCondition(stageIndex) {
    if (!ensureEditableStrategy()) return;
    setStrategyNotice("");
    setStrategyDraft((current) => {
      const baseDraft = getEditableDraftBase(current);
      if (!baseDraft) return baseDraft;
      const baseStages = cloneStrategyStages(baseDraft, conditionSide);
      return {
        ...baseDraft,
        [stageKey]: baseStages.map((stage, index) => {
          if (index !== stageIndex) return stage;
          return {
            ...stage,
            conditions: [...cloneStrategyConditions(stage.conditions, conditionSide), normalizeStrategyCondition(createEmptyCondition(conditionSide), conditionSide, "and")]
          };
        })
      };
    });
  }

  function removeDraftStageCondition(stageIndex, conditionIndex) {
    if (!ensureEditableStrategy()) return;
    setStrategyDraft((current) => {
      const baseDraft = getEditableDraftBase(current);
      if (!baseDraft) return baseDraft;
      const baseStages = cloneStrategyStages(baseDraft, conditionSide);
      return {
        ...baseDraft,
        [stageKey]: baseStages.map((stage, index) => {
          if (index !== stageIndex) return stage;
          const nextConditions = cloneStrategyConditions(stage.conditions, conditionSide).filter((_, currentConditionIndex) => currentConditionIndex !== conditionIndex);
          return {
            ...stage,
            conditions: nextConditions.length ? nextConditions : [createEmptyCondition(conditionSide)]
          };
        })
      };
    });
  }

  function addDraftStage() {
    if (!ensureEditableStrategy()) return;
    setAllocationNotice("");
    setStrategyNotice("");
    setStrategyDraft((current) => {
      const baseDraft = getEditableDraftBase(current);
      if (!baseDraft) return baseDraft;
      const baseStages = cloneStrategyStages(baseDraft, conditionSide);
      const usedAllocation = baseStages.reduce((sum, stage) => sum + getAllocationAmount(stage.allocation), 0);
      const remainingAllocation = Math.max(0, 100 - usedAllocation);
      const nextAllocation = remainingAllocation > 0
        ? formatAllocationAmount(Math.min(25, remainingAllocation))
        : "0";
      return {
        ...baseDraft,
        [stageKey]: [...baseStages, createStrategyStage(conditionSide, baseStages.length + 1, null, nextAllocation)]
      };
    });
  }

  function removeDraftStage(stageIndex) {
    if (!ensureEditableStrategy()) return;
    setAllocationNotice("");
    setStrategyDraft((current) => {
      const baseDraft = getEditableDraftBase(current);
      if (!baseDraft) return baseDraft;
      const baseStages = cloneStrategyStages(baseDraft, conditionSide);
      return {
        ...baseDraft,
        [stageKey]: baseStages.filter((_, index) => index !== stageIndex)
      };
    });
  }

  function renderStageAllocationInput(stage, stageIndex, className = "") {
    return (
      <label className={`grid grid-cols-[auto_72px_auto] items-center ${className}`}>
        <span className="rounded-l border border-r-0 border-outline-variant bg-surface-container-highest px-2 py-1.5 font-label-caps text-label-caps text-on-surface-variant">비중</span>
        <input
          className="w-full border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-right font-label-mono text-label-mono text-on-surface"
          value={stage.allocation}
          onChange={(event) => updateDraftStage(stageIndex, { allocation: event.target.value })}
        />
        <span className="rounded-r border-y border-r border-outline-variant bg-surface-container-highest px-2 py-1.5 font-label-mono text-label-mono text-on-surface-variant">%</span>
      </label>
    );
  }

  function normalizeDraftStages(draft, side) {
    const stages = cloneStrategyStages(draft, side);
    let usedAllocation = 0;
    return stages.map((stage, index) => {
      const maxAllocation = Math.max(0, 100 - usedAllocation);
      const allocation = formatAllocationAmount(Math.min(getAllocationAmount(stage.allocation), maxAllocation));
      usedAllocation += getAllocationAmount(allocation);

      if (index === 0) {
        return {
          ...stage,
          allocation,
          triggerType: "conditions",
          triggerOperator: "충족",
          triggerValue: "",
          conditionLogic: normalizeConditionLogic(stage.conditionLogic),
          conditions: cloneStrategyConditions(stage.conditions, side)
        };
      }

      return {
        ...stage,
        allocation,
        triggerType: "percent",
        triggerOperator: stage.triggerOperator || (side === "buy" ? "하락" : "상승"),
        triggerValue: String(stage.triggerValue || (side === "buy" ? "3" : "5")),
        conditions: []
      };
    });
  }

  function getStrategyDraftError(draft) {
    if (!draft?.name?.trim()) return requiredInputMessage("전략 이름");

    if (draft.scope === "개별 종목" && !(draft.targetStocks || []).some((code) => getStockByCode(code))) {
      return requiredInputMessage("전략 대상 종목");
    }

    if (draft.scope === "종목 그룹" && (!draft.target || draft.target === "관심 그룹 없음" || !favoriteGroups[draft.target])) {
      return requiredInputMessage("전략 대상 그룹");
    }

    if (!String(draft.strategyLossLimit || "").trim()) {
      return requiredInputMessage("전략별 손실 한도");
    }

    if (parseCurrencyInput(draft.strategyLossLimit) <= 0) {
      return invalidInputMessage("전략별 손실 한도는 0보다 커야 합니다.");
    }

    if (!String(draft.strategyOrderLimit || "").trim()) {
      return requiredInputMessage("전략별 주문 한도");
    }

    if (parseCurrencyInput(draft.strategyOrderLimit) <= 0) {
      return invalidInputMessage("전략별 주문 한도는 0보다 커야 합니다.");
    }

    if (!STRATEGY_POSITION_MODES.some((mode) => mode.value === draft.positionMode)) {
      return requiredInputMessage("투자 방식");
    }

    if (!SIGNAL_CONFLICT_PRIORITY_OPTIONS.some((option) => option.value === draft.signalConflictPriority)) {
      return requiredInputMessage("동시 신호 우선순위");
    }

    const signalConflictError = getSignalConditionConflictError(draft);
    if (signalConflictError) return signalConflictError;

    for (const side of ["buy", "sell"]) {
      const sideLabel = side === "buy" ? "매수" : "매도";
      const stages = cloneStrategyStages(draft, side);
      for (const [stageIndex, stage] of stages.entries()) {
        const stageLabel = `${stageIndex + 1}차 ${sideLabel}`;

        if (!String(stage.allocation || "").trim()) {
          return requiredInputMessage(`${stageLabel} 비중`);
        }

        if (stageIndex === 0) {
          const conditions = cloneStrategyConditions(stage.conditions, side);
          for (const [conditionIndex, condition] of conditions.entries()) {
            const [indicator, operator, value] = condition;
            const operatorRule = getConditionOperatorRule(indicator, operator, side);
            if (operatorRule.valueType !== "none" && !String(value || "").trim()) {
              return requiredInputMessage(`${stageLabel} 조건 ${conditionIndex + 1} 값`);
            }
            if (operatorRule.valueType === "number" && parseConditionNumber(value) === null) {
              return invalidInputMessage(`${stageLabel} 조건 ${conditionIndex + 1} 값은 숫자로 입력해야 합니다.`);
            }
          }
          continue;
        }

        if (!String(stage.triggerValue || "").trim()) {
          return requiredInputMessage(`${stageLabel} 기준값`);
        }
      }
    }

    return "";
  }

  function getExplicitStrategyTargetCodes(strategyLike) {
    if (!strategyLike) return [];

    if (strategyLike.scope === "전체 종목") {
      return [];
    }

    if (strategyLike.scope === "종목 그룹") {
      return [...new Set((favoriteGroups[strategyLike.target] || []).filter((code) => getStockByCode(code)))];
    }

    return getTargetStockCodes(strategyLike);
  }

  function getReservedTargetCodes(excludingStrategyId = null) {
    return new Set(
      strategies
        .filter((strategy) => strategy.status === "활성")
        .filter((strategy) => excludingStrategyId === null || String(strategy.id) !== String(excludingStrategyId))
        .flatMap(getExplicitStrategyTargetCodes)
    );
  }

  function getStrategySearchUniverseCodes(strategyLike) {
    if (!strategyLike) return [];

    if (strategyLike.scope !== "전체 종목") {
      return getExplicitStrategyTargetCodes(strategyLike);
    }

    const reservedCodes = getReservedTargetCodes(strategyLike.id);
    return stocks
      .map((stock) => stock.code)
      .filter((code) => !reservedCodes.has(code));
  }

  function getStrategyConflictError(candidateStrategy, nextStatus = candidateStrategy?.status || "중지") {
    if (nextStatus !== "활성") return "";

    const activeStrategies = strategies.filter((strategy) => strategy.status === "활성" && String(strategy.id) !== String(candidateStrategy.id));
    if (activeStrategies.length >= MAX_ACTIVE_STRATEGIES_PER_MODE) {
      return invalidInputMessage(`활성 전략은 ${MAX_ACTIVE_STRATEGIES_PER_MODE}개까지만 실행할 수 있습니다.`);
    }

    if (candidateStrategy.scope === "전체 종목") {
      const activeWholeMarketStrategy = activeStrategies.find((strategy) => strategy.scope === "전체 종목");
      if (activeWholeMarketStrategy) {
        return invalidInputMessage(`전체 종목 전략은 하나만 활성화할 수 있습니다. '${activeWholeMarketStrategy.name}' 전략을 먼저 중지하세요.`);
      }

      const universeCodes = getStrategySearchUniverseCodes(candidateStrategy);
      if (stocks.length > 0 && !universeCodes.length) {
        return invalidInputMessage("전체 종목 전략이 검색할 남은 종목이 없습니다.");
      }

      return "";
    }

    const candidateCodes = new Set(getExplicitStrategyTargetCodes(candidateStrategy));
    if (!candidateCodes.size) {
      return requiredInputMessage("활성 전략 대상 종목");
    }

    const conflictingStrategy = activeStrategies.find((strategy) =>
      strategy.scope !== "전체 종목" &&
      getExplicitStrategyTargetCodes(strategy).some((code) => candidateCodes.has(code))
    );

    if (!conflictingStrategy) {
      const activeWholeMarketStrategy = activeStrategies.find((strategy) => strategy.scope === "전체 종목");
      if (activeWholeMarketStrategy) {
        const reservedCodes = getReservedTargetCodes(candidateStrategy.id);
        candidateCodes.forEach((code) => reservedCodes.add(code));
        const remainingCodes = stocks.map((stock) => stock.code).filter((code) => !reservedCodes.has(code));
        if (stocks.length > 0 && !remainingCodes.length) {
          return invalidInputMessage(`'${activeWholeMarketStrategy.name}' 전체 종목 전략이 검색할 남은 종목이 없습니다.`);
        }
      }

      return "";
    }

    const overlappingStock = getExplicitStrategyTargetCodes(conflictingStrategy).find((code) => candidateCodes.has(code));
    const stockName = getStockByCode(overlappingStock)?.name || overlappingStock;
    return invalidInputMessage(`${stockName}은 이미 '${conflictingStrategy.name}' 활성 전략에서 사용 중입니다.`);
  }

  function saveSelectedStrategySettings() {
    if (!hasSelectedStrategy || !selectedDraft) return;
    const draftError = getStrategyDraftError(selectedDraft);
    if (draftError) {
      setStrategyNotice(draftError, "error");
      return;
    }

    if (!requirePin()) return;
    const savedBuyStages = normalizeDraftStages(selectedDraft, "buy");
    const savedSellStages = normalizeDraftStages(selectedDraft, "sell");
    const savedTargetStocks = selectedDraft.scope === "개별 종목" ? [...new Set((selectedDraft.targetStocks || []).filter((code) => getStockByCode(code)))] : [];
    const savedTarget = selectedDraft.scope === "개별 종목" ? summarizeTargetStocks(savedTargetStocks) : selectedDraft.target;
    const savedDraft = {
      ...selectedDraft,
      name: selectedDraft.name.trim(),
      signalConflictPriority: selectedDraft.signalConflictPriority,
      positionMode: selectedDraft.positionMode,
      strategyLossLimit: selectedDraft.strategyLossLimit,
      strategyOrderLimit: selectedDraft.strategyOrderLimit,
      target: savedTarget,
      targetStocks: savedTargetStocks,
      buyStages: savedBuyStages,
      sellStages: savedSellStages,
      buyConditions: savedBuyStages.length ? cloneStrategyConditions(savedBuyStages[0]?.conditions, "buy") : [],
      sellConditions: savedSellStages.length ? cloneStrategyConditions(savedSellStages[0]?.conditions, "sell") : []
    };
    if (savedDraft.orderMode === "자동 주문" && !autoOrderConsent) {
      setStrategyNotice(invalidInputMessage("자동 주문 위험 확인을 체크해야 저장할 수 있습니다."), "error");
      return;
    }
    const nextStatus = selected?.status || "중지";
    const conflictError = getStrategyConflictError({ ...selected, ...savedDraft, status: nextStatus }, nextStatus);
    if (conflictError) {
      setStrategyNotice(conflictError, "error");
      return;
    }

    setStrategies((current) =>
      current.map((strategy) => {
        if (String(strategy.id) !== String(selectedId)) return strategy;
        return {
          ...strategy,
          name: savedDraft.name,
          orderMode: savedDraft.orderMode,
          signalConflictPriority: savedDraft.signalConflictPriority,
          positionMode: savedDraft.positionMode,
          strategyLossLimit: savedDraft.strategyLossLimit,
          strategyOrderLimit: savedDraft.strategyOrderLimit,
          scope: savedDraft.scope,
          target: savedDraft.target,
          targetStocks: savedDraft.targetStocks,
          buyStages: savedDraft.buyStages,
          sellStages: savedDraft.sellStages,
          buyConditions: savedDraft.buyConditions,
          sellConditions: savedDraft.sellConditions
        };
      })
    );
    setStrategyDraft(savedDraft);
    setStrategyNotice(`${savedDraft.name} 설정을 저장했습니다.`);
    onRecordActivity?.(
      {
        type: "전략",
        target: savedDraft.name,
        body: `${savedDraft.name} 전략 설정을 저장했습니다.`,
        status: "완료"
      },
      {
        icon: "psychology",
        color: "text-primary",
        title: "전략 저장",
        body: `${savedDraft.name} 전략 설정을 저장했습니다.`,
        preferenceKey: "strategyStatus"
      }
    );
  }

  function updateStatus(status) {
    if (!selected) return;
    if (status === "활성") {
      const draftError = getStrategyDraftError(createStrategyDraft(selected));
      if (draftError) {
        setStrategyNotice(draftError, "error");
        return;
      }

      const candidate = { ...selected, status };
      const conflictError = getStrategyConflictError(candidate, status);
      if (conflictError) {
        setStrategyNotice(conflictError, "error");
        return;
      }
    }

    if (!requirePin()) return;
    setStrategies((current) => current.map((strategy) => String(strategy.id) === String(selectedId) ? { ...strategy, status } : strategy));
    setStrategyNotice(status === "활성" ? `${selected.name} 전략을 활성화했습니다.` : `${selected.name} 전략을 중지했습니다.`);
    onRecordActivity?.(
      {
        type: "전략",
        target: selected.name,
        body: `${selected.name} 전략을 ${status === "활성" ? "활성화" : "중지"}했습니다.`,
        status
      },
      {
        icon: status === "활성" ? "play_circle" : "pause_circle",
        color: status === "활성" ? "text-secondary" : "text-tertiary",
        title: "전략 상태 변경",
        body: `${selected.name} 전략이 ${status === "활성" ? "활성화" : "중지"}되었습니다.`,
        preferenceKey: "strategyStatus"
      }
    );
  }

  function deleteStrategy() {
    if (!requirePin()) return;
    const deletedStrategy = selected;
    const nextStrategies = strategies.filter((strategy) => String(strategy.id) !== String(selectedId));
    setStrategies(nextStrategies);
    setSelectedId(nextStrategies[0]?.id ?? null);
    if (deletedStrategy) {
      onRecordActivity?.(
        {
          type: "전략",
          target: deletedStrategy.name,
          body: `${deletedStrategy.name} 전략을 삭제했습니다.`,
          status: "삭제"
        },
        {
          icon: "delete",
          color: "text-error",
          title: "전략 삭제",
          body: `${deletedStrategy.name} 전략을 삭제했습니다.`,
          preferenceKey: "strategyStatus"
        }
      );
    }
  }

  function addStrategy() {
    if (strategies.length >= MAX_STRATEGIES_PER_MODE) {
      setStrategyNotice(invalidInputMessage(`전략은 ${modeLabel} 모드에서 최대 ${MAX_STRATEGIES_PER_MODE}개까지 보관할 수 있습니다.`), "error");
      return;
    }

    const next = {
      ...strategiesSeed[0],
      id: Date.now(),
      name: "새 전략",
      status: "중지",
      orderMode: "승인 후 주문",
      signalConflictPriority: "sell",
      positionMode: "distributed",
      strategyLossLimit: DEFAULT_STRATEGY_LOSS_LIMIT,
      strategyOrderLimit: DEFAULT_STRATEGY_ORDER_LIMIT,
      scope: "개별 종목",
      target: "대상 미지정",
      targetStocks: [],
      returnRate: "0.0%",
      winRate: "0%",
      mode: executionMode,
      buyStages: [createStrategyStage("buy", 1, [createEmptyCondition("buy")], "50")],
      sellStages: [createStrategyStage("sell", 1, [createEmptyCondition("sell")], "50")],
      buyConditions: [createEmptyCondition("buy")],
      sellConditions: [createEmptyCondition("sell")]
    };
    setStrategies((current) => [next, ...current]);
    setSelectedId(next.id);
    setStrategyNotice(`새 전략을 추가했습니다. 활성 전략은 최대 ${MAX_ACTIVE_STRATEGIES_PER_MODE}개까지 실행할 수 있습니다.`);
    onRecordActivity?.(
      {
        type: "전략",
        target: next.name,
        body: `${next.name} 전략을 추가했습니다.`,
        status: "중지"
      },
      {
        icon: "add_circle",
        color: "text-primary",
        title: "전략 추가",
        body: `${next.name} 전략을 추가했습니다.`,
        preferenceKey: "strategyStatus"
      }
    );
  }

  function importSelectedStrategy() {
    if (strategies.length >= MAX_STRATEGIES_PER_MODE) {
      setStrategyNotice(invalidInputMessage(`전략은 ${modeLabel} 모드에서 최대 ${MAX_STRATEGIES_PER_MODE}개까지 보관할 수 있습니다.`), "error");
      setShowImportPicker(false);
      return;
    }

    if (!selectedImportStrategy) {
      setStrategyNotice(`${sourceModeLabel} 모드에서 가져올 새 전략이 없습니다.`, "error");
      setShowImportPicker(false);
      return;
    }
    const imported = {
      ...selectedImportStrategy,
      id: Date.now(),
      status: "중지",
      returnRate: "0.0%",
      winRate: "-",
      originMode: sourceMode,
      description: `${selectedImportStrategy.description} ${sourceModeLabel} 모드에서 가져온 뒤 비활성화했습니다.`
    };
    setStrategies((current) => [imported, ...current]);
    setSelectedId(imported.id);
    setStrategyNotice(`${sourceModeLabel} 모드의 ${imported.name} 전략을 중지 상태로 가져왔습니다.`);
    setShowImportPicker(false);
    onRecordActivity?.(
      {
        type: "전략",
        target: imported.name,
        body: `${sourceModeLabel} 모드의 ${imported.name} 전략을 가져왔습니다.`,
        status: "중지"
      },
      {
        icon: "move_to_inbox",
        color: "text-primary",
        title: "전략 가져오기",
        body: `${imported.name} 전략을 중지 상태로 가져왔습니다.`,
        preferenceKey: "strategyStatus"
      }
    );
  }

  return (
    <>
      <PageHeader
        title="전략 관리"
        description={`${modeLabel} 모드 전략을 관리합니다. 개별/그룹 활성 전략은 종목을 점유하고, 전체 종목 전략은 점유 종목을 제외한 나머지만 검색합니다.`}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-label-caps text-label-caps hover:bg-surface-container-highest transition-colors flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={strategies.length >= MAX_STRATEGIES_PER_MODE}
              onClick={() => {
                setStrategyNotice("");
                setShowImportPicker(true);
              }}
            >
              <Icon className="text-[16px]">download</Icon>
              {sourceModeLabel} 전략 가져오기
            </button>
            <button
              className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-label-caps text-label-caps hover:brightness-110 transition-all flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={strategies.length >= MAX_STRATEGIES_PER_MODE}
              onClick={addStrategy}
            >
              <Icon className="text-[16px]">add</Icon>
              새 전략
            </button>
          </div>
        }
      />

      {importMessage ? (
        <div className={`rounded-lg border p-widget-padding font-body-md text-body-md ${strategyNoticeClass}`}>
          {importMessage}
        </div>
      ) : null}
      {!importMessage && activeOverlapNotice ? (
        <div className="rounded-lg border border-error/30 bg-error/10 p-widget-padding font-body-md text-body-md text-error">
          {activeOverlapNotice}
        </div>
      ) : null}
      {schedulerStatus ? (
        <div className="rounded-lg border border-outline-variant bg-surface-container p-widget-padding">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 text-primary">sync</Icon>
              <div>
                <p className="font-title-sm text-title-sm text-on-surface">전략 실행 루프</p>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  활성 {schedulerStatus.activeStrategyCount || 0}개 · 스캔 {schedulerStatus.scanCount || 0}회 · 실시간 구독 {(schedulerStatus.watchSymbols || []).length}종목
                </p>
                {schedulerStatus.messages?.[0] ? (
                  <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{schedulerStatus.messages[0]}</p>
                ) : null}
              </div>
            </div>
            <Badge tone={schedulerStatusTone}>{schedulerStatusText}</Badge>
          </div>
          {schedulerActionMessage ? (
            <p className="mt-3 rounded border border-outline-variant bg-surface-container-low px-3 py-2 font-body-sm text-body-sm text-on-surface-variant">
              {schedulerActionMessage}
            </p>
          ) : null}
          {pendingSchedulerActions.length ? (
            <div className="mt-3 border-t border-outline-variant/50 pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-title-sm text-title-sm text-on-surface">승인 대기 전략 주문</p>
                <span className="font-label-mono text-label-mono text-primary">{pendingSchedulerActions.length}건</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {pendingSchedulerActions.slice(0, 5).map((action) => {
                  const sideLabel = action.action === "buy" ? "매수" : "매도";
                  const busyApprove = schedulerActionBusyId === `approve:${action.id}`;
                  const busyReject = schedulerActionBusyId === `reject:${action.id}`;
                  return (
                    <article className="grid grid-cols-1 gap-3 rounded border border-outline-variant bg-surface-container-low p-3 lg:grid-cols-[1fr_auto]" key={action.id || `${action.code}-${action.stageIndex}`}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={action.action === "buy" ? "secondary" : "tertiary"}>{sideLabel}</Badge>
                          <strong className="font-title-sm text-title-sm text-on-surface">{action.name || action.code}</strong>
                          <span className="font-label-mono text-label-mono text-on-surface-variant">{action.code}</span>
                          <span className="font-label-caps text-label-caps text-on-surface-variant">{action.stageLabel}</span>
                        </div>
                        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                          수량 {Number(action.quantity || 0).toLocaleString("ko-KR")}주 · 가격 {Number(action.price || 0).toLocaleString("ko-KR")} · 주문금액 {Number(action.orderAmount || 0).toLocaleString("ko-KR")}원
                        </p>
                        {action.detail ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{action.detail}</p> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="inline-flex items-center justify-center rounded bg-primary-container px-3 py-2 font-label-caps text-label-caps text-on-primary-container hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                          type="button"
                          disabled={Boolean(schedulerActionBusyId)}
                          onClick={() => decideSchedulerAction(action, "approve")}
                        >
                          {busyApprove ? "승인 중" : "승인"}
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded border border-outline-variant px-3 py-2 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
                          type="button"
                          disabled={Boolean(schedulerActionBusyId)}
                          onClick={() => decideSchedulerAction(action, "reject")}
                        >
                          {busyReject ? "거절 중" : "거절"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {schedulerStatus ? (
        <section className="grid grid-cols-1 gap-gutter xl:grid-cols-2">
          <div className="rounded-lg border border-outline-variant bg-surface-container">
            <div className="flex items-center justify-between border-b border-outline-variant p-widget-padding">
              <div>
                <p className="font-title-sm text-title-sm text-on-surface">전략 실행 기록</p>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  최근 주문 요청, 제출, 체결 흐름을 확인합니다.{runtimeHistoryStatus === "success" ? " Supabase 기록을 표시 중입니다." : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-label-mono text-label-mono text-primary">{selectedSchedulerActions.length}건</span>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"
                  type="button"
                  onClick={refreshRuntimeHistory}
                  aria-label="전략 실행 기록 새로고침"
                >
                  <Icon className="text-[16px]">{runtimeHistoryStatus === "loading" ? "hourglass_top" : "refresh"}</Icon>
                </button>
              </div>
            </div>
            <div className="divide-y divide-outline-variant/50">
              {selectedSchedulerActions.length ? selectedSchedulerActions.map((action) => {
                const sideLabel = action.action === "buy" ? "매수" : "매도";
                const filledQuantity = Number(action.filledQuantity || 0);
                const totalQuantity = Number(action.quantity || 0);
                const canManageBrokerOrder = action.status === "order_submitted" && Boolean(action.brokerOrderNo);
                const busyAmend = schedulerActionBusyId === `amend:${action.id}`;
                const busyCancel = schedulerActionBusyId === `cancel:${action.id}`;
                return (
                  <article className="p-widget-padding" key={action.id || `${action.code}-${action.stageIndex}-${action.status}`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={action.action === "buy" ? "secondary" : "tertiary"}>{sideLabel}</Badge>
                          <strong className="font-title-sm text-title-sm text-on-surface">{action.name || action.code}</strong>
                          <span className="font-label-mono text-label-mono text-on-surface-variant">{action.code}</span>
                        </div>
                        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                          {action.stageLabel || `${Number(action.stageIndex || 0) + 1}차`} · {filledQuantity.toLocaleString("ko-KR")}/{totalQuantity.toLocaleString("ko-KR")}주 · {Number(action.price || 0).toLocaleString("ko-KR")}원
                        </p>
                        {action.reconciliationMessage ? (
                          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{action.reconciliationMessage}</p>
                        ) : action.detail ? (
                          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{action.detail}</p>
                        ) : null}
                        {action.brokerOrderNo ? (
                          <p className="mt-1 font-label-mono text-label-mono text-on-surface-variant">주문번호 {action.brokerOrderNo}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                        <Badge tone={schedulerActionStatusTone(action.status)}>{schedulerActionStatusLabel(action.status)}</Badge>
                        <span className="font-label-mono text-label-mono text-on-surface-variant">{schedulerActionTime(action)}</span>
                        <button
                          className="rounded border border-outline-variant px-2 py-1 font-label-caps text-label-caps text-primary hover:bg-surface-container-highest"
                          type="button"
                          onClick={() => setSelectedSchedulerAction(action)}
                        >
                          상세
                        </button>
                        {canManageBrokerOrder ? (
                          <div className="flex items-center gap-2">
                            <button
                              className="rounded border border-outline-variant px-2 py-1 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
                              type="button"
                              disabled={Boolean(schedulerActionBusyId)}
                              onClick={() => amendSchedulerOrder(action)}
                            >
                              {busyAmend ? "정정 중" : "정정"}
                            </button>
                            <button
                              className="rounded border border-error/40 px-2 py-1 font-label-caps text-label-caps text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
                              type="button"
                              disabled={Boolean(schedulerActionBusyId)}
                              onClick={() => cancelSchedulerOrder(action)}
                            >
                              {busyCancel ? "취소 중" : "취소"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              }) : (
                <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">아직 실행 기록이 없습니다.</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-outline-variant bg-surface-container">
            <div className="flex items-center justify-between border-b border-outline-variant p-widget-padding">
              <div>
                <p className="font-title-sm text-title-sm text-on-surface">전략 포지션</p>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">체결 반영 후 전략별 보유 수량과 단계입니다.</p>
              </div>
              <span className="font-label-mono text-label-mono text-secondary">{selectedSchedulerPositions.length}종목</span>
            </div>
            <div className="divide-y divide-outline-variant/50">
              {selectedSchedulerPositions.length ? selectedSchedulerPositions.map((position) => (
                <article className="grid grid-cols-2 gap-3 p-widget-padding sm:grid-cols-[1fr_auto_auto]" key={`${position.strategyId}-${position.code}`}>
                  <div className="min-w-0">
                    <p className="font-title-sm text-title-sm text-on-surface">{position.code}</p>
                    <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">전략 {position.strategyId}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-label-caps text-label-caps text-on-surface-variant">수량</p>
                    <p className="font-label-mono text-label-mono text-on-surface">{Number(position.quantity || 0).toLocaleString("ko-KR")}주</p>
                  </div>
                  <div className="col-span-2 text-right sm:col-span-1">
                    <p className="font-label-caps text-label-caps text-on-surface-variant">평균가 / 단계</p>
                    <p className="font-label-mono text-label-mono text-on-surface">
                      {Number(position.averagePrice || 0).toLocaleString("ko-KR")} · 매수 {position.buyStageIndex || 0} / 매도 {position.sellStageIndex || 0}
                    </p>
                  </div>
                </article>
              )) : (
                <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">전략 포지션이 없습니다.</div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {selectedSchedulerAction ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-lg border border-outline-variant bg-surface-container shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-outline-variant p-widget-padding">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="text-primary">receipt_long</Icon>
                  <h3 className="font-headline-md text-headline-md text-on-surface">전략 실행 상세</h3>
                  <Badge tone={schedulerActionStatusTone(selectedSchedulerAction.status)}>{schedulerActionStatusLabel(selectedSchedulerAction.status)}</Badge>
                </div>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  {selectedSchedulerAction.strategyName || selected?.name || "전략"} · {selectedSchedulerAction.name || selectedSchedulerAction.code}
                </p>
              </div>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-highest"
                type="button"
                aria-label="전략 실행 상세 닫기"
                onClick={() => setSelectedSchedulerAction(null)}
              >
                <Icon className="text-[18px]">close</Icon>
              </button>
            </div>
            <div className="custom-scrollbar max-h-[calc(88vh-84px)] overflow-y-auto p-widget-padding space-y-gutter">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {[
                  ["종목", `${selectedSchedulerAction.name || selectedSchedulerAction.code} ${selectedSchedulerAction.code || ""}`.trim()],
                  ["방향 / 단계", `${selectedSchedulerAction.action === "buy" ? "매수" : "매도"} · ${selectedSchedulerAction.stageLabel || `${Number(selectedSchedulerAction.stageIndex || 0) + 1}차`}`],
                  ["시간", schedulerActionTime(selectedSchedulerAction)],
                  ["주문 수량", `${Number(selectedSchedulerAction.quantity || 0).toLocaleString("ko-KR")}주`],
                  ["체결 수량", `${Number(selectedSchedulerAction.filledQuantity || 0).toLocaleString("ko-KR")}주`],
                  ["주문 가격", `${Number(selectedSchedulerAction.price || 0).toLocaleString("ko-KR")}원`],
                  ["주문 금액", `${Number(selectedSchedulerAction.orderAmount || 0).toLocaleString("ko-KR")}원`],
                  ["예상 수수료", `${estimateTradingFee(Number(selectedSchedulerAction.orderAmount || 0)).toLocaleString("ko-KR")}원`],
                  ["배정 예산", `${Number(selectedSchedulerAction.symbolBudget || 0).toLocaleString("ko-KR")}원`],
                  ["주문번호", selectedSchedulerAction.brokerOrderNo || "--"]
                ].map(([label, value]) => (
                  <div className="rounded border border-outline-variant bg-surface-container-low p-3" key={label}>
                    <p className="font-label-caps text-label-caps text-on-surface-variant">{label}</p>
                    <p className="mt-1 break-words font-label-mono text-label-mono text-on-surface">{value || "--"}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
                <div className="rounded border border-outline-variant bg-surface-container-low p-3">
                  <p className="font-label-caps text-label-caps text-on-surface-variant">판단 / 차단 사유</p>
                  <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
                    {selectedSchedulerAction.detail || selectedSchedulerAction.error || "별도 사유가 없습니다."}
                  </p>
                </div>
                <div className="rounded border border-outline-variant bg-surface-container-low p-3">
                  <p className="font-label-caps text-label-caps text-on-surface-variant">주문 동기화</p>
                  <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
                    {selectedSchedulerAction.reconciliationMessage || selectedSchedulerAction.brokerMessage || "아직 주문 동기화 메시지가 없습니다."}
                  </p>
                  {selectedSchedulerAction.lastReconciledAt ? (
                    <p className="mt-2 font-label-mono text-label-mono text-on-surface-variant">
                      {formatBackendTimestamp(selectedSchedulerAction.lastReconciledAt)}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded border border-outline-variant bg-surface-container-low p-3">
                <p className="font-label-caps text-label-caps text-on-surface-variant">브로커 응답</p>
                <pre className="custom-scrollbar mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-surface-container-lowest p-3 font-label-mono text-label-mono text-on-surface-variant">
                  {safeJson(selectedSchedulerAction.brokerOrderStatus || selectedSchedulerAction.brokerOrder || {})}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
        <Section className="xl:col-span-5 flex flex-col h-full">
          <div className="p-widget-padding border-b border-outline-variant">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline-md text-headline-md text-on-surface">전략 목록</h3>
              <span className="font-label-mono text-label-mono text-secondary">
                활성 {activeStrategyCount}/{MAX_ACTIVE_STRATEGIES_PER_MODE} · 보관 {strategies.length}/{MAX_STRATEGIES_PER_MODE}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-gutter">
              <div className="relative">
                <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</Icon>
                <input
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded pl-10 pr-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-outline"
                  placeholder="전략 검색"
                  type="search"
                  value={strategyQuery}
                  onChange={(event) => setStrategyQuery(event.target.value)}
                />
              </div>
              <select
                className="bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
                value={strategyStatusFilter}
                onChange={(event) => setStrategyStatusFilter(event.target.value)}
              >
                <option>전체 상태</option>
                <option>활성</option>
                <option>중지</option>
              </select>
            </div>
          </div>
          <div className="section-body-scroll flex-1 min-h-0 custom-scrollbar">
            {filteredStrategies.map((strategy) => (
              <button
                className={`w-full p-widget-padding border-b border-outline-variant/40 text-left hover:bg-surface-container-highest ${String(selectedId) === String(strategy.id) ? "bg-primary/5" : ""}`}
                key={strategy.id}
                type="button"
                onClick={() => setSelectedId(strategy.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="font-title-sm text-title-sm text-on-surface">{strategy.name}</strong>
                  <Badge tone={strategy.status === "활성" ? "secondary" : "neutral"}>{strategy.status}</Badge>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {strategy.scope} · {strategy.target}{strategy.originMode ? ` · ${accountProfiles[strategy.originMode].shortLabel}에서 가져옴` : ""}
                </p>
              </button>
            ))}
            {!filteredStrategies.length ? (
              <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">
                {strategies.length ? "조건에 맞는 전략이 없습니다." : "등록된 전략이 없습니다."}
              </div>
            ) : null}
          </div>
        </Section>

        <div className="xl:col-span-7 space-y-gutter">
          <Section className="section-scroll-sm">
            <div className="p-widget-padding border-b border-outline-variant flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-headline-md text-headline-md text-on-surface">{selected?.name}</h3>
                  <Badge tone={selected?.status === "활성" ? "secondary" : "neutral"}>{selected?.status}</Badge>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{selected?.description}</p>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded bg-secondary-container text-on-secondary-container font-label-caps text-label-caps" type="button" onClick={() => updateStatus("활성")}>활성화</button>
                <button className="px-3 py-2 rounded bg-surface-container-high text-on-surface-variant font-label-caps text-label-caps" type="button" onClick={() => updateStatus("중지")}>중지</button>
                <button className="px-3 py-2 rounded bg-error-container text-on-error-container font-label-caps text-label-caps" type="button" onClick={deleteStrategy}>삭제</button>
              </div>
            </div>
            <div className="p-widget-padding grid grid-cols-1 gap-gutter md:grid-cols-2 2xl:grid-cols-3">
              {[
                ["적용 범위", selected?.scope],
                ["대상", selected?.target],
                ["주문 방식", selected?.orderMode],
                ["투자 방식", selectedPositionModeLabel],
                ["전략 주문 한도", selected?.strategyOrderLimit || DEFAULT_STRATEGY_ORDER_LIMIT],
                ["손실 한도", selected?.strategyLossLimit || DEFAULT_STRATEGY_LOSS_LIMIT]
              ].map(([label, value]) => (
                <div className="min-h-[84px] bg-surface-container-low rounded border border-outline-variant p-3" key={label}>
                  <p className="font-label-caps text-label-caps text-on-surface-variant mb-1">{label}</p>
                  <p className="font-title-sm text-title-sm text-on-surface">{value || "--"}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section>
            <SectionTitle icon="tune" title="전략 설정" />
            <div className="p-widget-padding space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">전략 이름</span>
                  <input
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
                    placeholder="닉네임 입력"
                    type="text"
                    value={selectedDraft?.name || ""}
                    onChange={(event) => updateStrategyDraft({ name: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">주문 실행 방식</span>
                  <select
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
                    value={selectedDraft?.orderMode || "승인 후 주문"}
                    onChange={(event) => {
                      const nextMode = event.target.value;
                      updateStrategyDraft({ orderMode: nextMode });
                      if (nextMode !== "자동 주문") setAutoOrderConsent(false);
                    }}
                  >
                    <option>승인 후 주문</option>
                    <option>자동 주문</option>
                  </select>
                  {selectedDraft?.orderMode === "자동 주문" ? (
                    <label className="mt-2 flex items-start gap-2 rounded border border-error/30 bg-error/10 p-2 text-error">
                      <input
                        className="mt-0.5 rounded border-error/40 bg-surface-container-lowest text-error focus:ring-error"
                        type="checkbox"
                        checked={autoOrderConsent}
                        onChange={(event) => setAutoOrderConsent(event.target.checked)}
                      />
                      <span className="font-body-sm text-body-sm">조건 충족 시 승인 없이 주문이 요청될 수 있음을 확인합니다.</span>
                    </label>
                  ) : null}
                </label>
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">동시 신호 우선순위</span>
                  <select
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
                    value={selectedDraft?.signalConflictPriority || "sell"}
                    onChange={(event) => updateStrategyDraft({ signalConflictPriority: event.target.value })}
                  >
                    {SIGNAL_CONFLICT_PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <span className="mt-1 block font-body-sm text-body-sm text-on-surface-variant">{selectedSignalConflictOption.description}</span>
                </label>
              </div>

              {selectedDraft ? (
                <div className={`rounded border p-3 ${signalConflictPanelClass}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <Icon className={`mt-0.5 text-[22px] ${signalConflictIconClass}`}>rule</Icon>
                      <div>
                        <p className="font-title-sm text-title-sm text-on-surface">신호 충돌 관리</p>
                        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{selectedSignalConflictSummary.message}</p>
                        <p className="mt-1 font-label-mono text-label-mono text-on-surface">
                          동시 신호 처리: {selectedSignalConflictSummary.priorityLabel} · {selectedSignalConflictSummary.priorityOutcome}
                        </p>
                      </div>
                    </div>
                    <Badge tone={selectedSignalConflictSummary.badgeTone}>{selectedSignalConflictSummary.label}</Badge>
                  </div>
                  {visibleSignalConflictItems.length ? (
                    <div className="mt-3 space-y-2 border-t border-outline-variant/50 pt-3">
                      {visibleSignalConflictItems.slice(0, 3).map((item, index) => (
                        <div className="grid grid-cols-1 gap-2 font-body-sm text-body-sm md:grid-cols-[1fr_1fr]" key={`${item.indicator}-${index}`}>
                          <span className="rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-secondary">매수 {item.buyText}</span>
                          <span className="rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-tertiary">매도 {item.sellText}</span>
                        </div>
                      ))}
                      {visibleSignalConflictItems.length > 3 ? (
                        <p className="font-body-sm text-body-sm text-on-surface-variant">그 외 {visibleSignalConflictItems.length - 3}건이 더 있습니다.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant mb-2">적용 범위</p>
                <div className="grid grid-cols-3 gap-gutter">
                  {["개별 종목", "종목 그룹", "전체 종목"].map((item) => (
                    <button
                      className={`py-2 rounded border font-label-caps text-label-caps ${selectedScope === item ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"}`}
                      key={item}
                      type="button"
                      onClick={() => {
                        const nextTargetStocks = item === "개별 종목" ? selectedTargetCodes : [];
                        updateStrategyDraft({
                          scope: item,
                          targetStocks: nextTargetStocks,
                          target: item === "전체 종목" ? "전체 종목" : item === "종목 그룹" ? Object.keys(favoriteGroups)[0] || "관심 그룹 없음" : summarizeTargetStocks(nextTargetStocks)
                        });
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="mt-gutter">
                  {selectedScope === "개별 종목" ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_auto] gap-gutter">
                        <div className="relative">
                          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</Icon>
                          <input
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded pl-10 pr-3 py-2 font-body-md text-body-md text-on-surface"
                            list="strategy-stock-options"
                            placeholder="종목명 또는 코드 검색"
                            value={stockSearch}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              const pickedStock = stocks.find((stock) => formatStockOptionValue(stock) === nextValue);
                              if (pickedStock) {
                                updateTargetStocks([...selectedTargetCodes, pickedStock.code]);
                                setStockSearch("");
                                return;
                              }
                              setStockSearch(nextValue);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addTargetStock();
                              }
                            }}
                          />
                        </div>
                        <button
                          className="inline-flex items-center justify-center gap-1 rounded border border-outline-variant bg-surface-container-high px-3 py-2 font-label-caps text-label-caps text-primary hover:bg-surface-container-highest"
                          type="button"
                          onClick={() => addTargetStock()}
                        >
                          <Icon className="text-[16px]">add</Icon>
                          추가
                        </button>
                      </div>
                      <datalist id="strategy-stock-options">
                        {stocks.map((stock) => <option key={stock.code} value={formatStockOptionValue(stock)}>{stock.market}</option>)}
                      </datalist>
                      <div className="flex min-h-8 flex-wrap gap-2">
                        {selectedTargetStocks.length ? (
                          selectedTargetStocks.map((stock) => (
                            <span
                              className="inline-flex items-center gap-1 rounded border border-outline-variant bg-surface-container-high py-1 pl-2 pr-1 font-body-sm text-body-sm text-on-surface"
                              key={stock.code}
                            >
                              <span>{stock.name}</span>
                              <button
                                className="inline-flex h-5 w-5 items-center justify-center rounded text-on-surface-variant hover:bg-error/10 hover:text-error"
                                type="button"
                                onClick={() => removeTargetStock(stock.code)}
                                aria-label={`${stock.name} 삭제`}
                              >
                                <Icon className="text-[15px]">close</Icon>
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="font-body-sm text-body-sm text-on-surface-variant">선택된 종목이 없습니다.</span>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {selectedScope === "종목 그룹" ? (
                    Object.keys(favoriteGroups).length ? (
                      <select
                        className="w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
                        value={selectedDraft?.target || Object.keys(favoriteGroups)[0]}
                        onChange={(event) => updateStrategyDraft({ target: event.target.value })}
                      >
                        {Object.keys(favoriteGroups).map((group) => <option key={group}>{group}</option>)}
                      </select>
                    ) : (
                      <div className="rounded border border-outline-variant bg-surface-container-low p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <Icon className="mt-0.5 text-primary">folder_open</Icon>
                            <div>
                              <p className="font-title-sm text-title-sm text-on-surface">등록된 종목 그룹이 없습니다.</p>
                              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">시장 화면에서 관심 종목을 그룹으로 묶으면 이 전략의 대상으로 선택할 수 있습니다.</p>
                            </div>
                          </div>
                          <button
                            className="inline-flex items-center justify-center gap-1 rounded border border-outline-variant bg-surface-container-high px-3 py-2 font-label-caps text-label-caps text-primary hover:bg-surface-container-highest"
                            type="button"
                            onClick={() => navigate("market")}
                          >
                            시장에서 설정
                            <Icon className="text-[16px]">arrow_forward</Icon>
                          </button>
                        </div>
                      </div>
                    )
                  ) : null}
                  {selectedScope === "전체 종목" ? (
                    <p className="bg-surface-container-low rounded border border-outline-variant p-3 font-body-sm text-body-sm text-on-surface-variant">
                      {stocks.length > 0
                        ? `다른 활성 전략이 점유한 종목을 제외하고 ${selectedSearchUniverseCodes.length}개 종목을 검색합니다.`
                        : `키움 종목 마스터에서 검색하며 다른 활성 전략이 명시적으로 점유한 ${selectedReservedTargetCount}개 종목은 제외합니다.`}
                      {" "}전체 종목 전략은 하나만 활성화할 수 있습니다.
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
                  <p className="font-label-caps text-label-caps text-on-surface-variant">지표 조건</p>
                  <div className="flex flex-col gap-gutter sm:flex-row sm:items-center">
                    <div className="grid grid-cols-2 gap-gutter sm:w-[260px]">
                      {[
                        ["buy", "매수 단계"],
                        ["sell", "매도 단계"]
                      ].map(([side, label]) => (
                        <button className={`py-2 rounded border font-label-caps text-label-caps ${conditionSide === side ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"}`} key={side} type="button" onClick={() => setConditionSide(side)}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      className="inline-flex items-center justify-center gap-1 rounded border border-outline-variant px-3 py-2 font-label-caps text-label-caps text-primary hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                      type="button"
                      disabled={!canEditSelectedStrategy}
                      onClick={addDraftStage}
                    >
                      <Icon className="text-[16px]">add</Icon>
                      {activeStages.length + 1}차 {conditionSide === "buy" ? "매수" : "매도"} 추가
                    </button>
                  </div>
                </div>
                {!canEditSelectedStrategy ? (
                  <div className="mb-2 rounded border border-outline-variant bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface-variant">
                    편집할 전략이 없습니다. 먼저 새 전략을 추가하거나 전략 목록에서 항목을 선택하세요.
                  </div>
                ) : null}
                {allocationNotice ? (
                  <div className="mb-2 rounded border border-error/30 bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">
                    {allocationNotice}
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-gutter">
                  {canEditSelectedStrategy && !activeStages.length ? (
                    <div className="rounded border border-outline-variant bg-surface-container-low p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Icon className="text-on-surface-variant">block</Icon>
                          <span className="font-title-sm text-title-sm text-on-surface">{conditionSide === "buy" ? "매수 단계 없음" : "매도 단계 없음"}</span>
                        </div>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          {conditionSide === "buy" ? "조건에 따라 매도만 실행합니다." : "조건에 따라 매수만 실행합니다."}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {activeStages.map((stage, stageIndex) => {
                    const stageLabel = `${stageIndex + 1}차 ${conditionSide === "buy" ? "매수" : "매도"}`;
                    const previousStageLabel = `${stageIndex}차 ${conditionSide === "buy" ? "매수" : "매도"} 대비`;
                    const tone = conditionSide === "buy" ? "secondary" : "tertiary";
                    const stageConditions = stageIndex === 0 ? cloneStrategyConditions(stage.conditions, conditionSide) : [];
                    const triggerOperatorOptions = ["하락", "상승"];

                    return (
                      <div className="group relative rounded border border-outline-variant bg-surface-container-low p-2 space-y-2" key={stage.id || `${conditionSide}-${stageIndex}`}>
                        <button
                          className="absolute -right-1 -top-1 inline-flex h-6 w-6 items-center justify-center rounded border border-outline-variant bg-surface-container-low text-on-surface-variant/70 shadow-sm transition-colors hover:bg-surface-container-highest hover:text-error sm:opacity-0 sm:group-hover:opacity-100"
                          type="button"
                          aria-label={`${stageLabel} 삭제`}
                          onClick={() => removeDraftStage(stageIndex)}
                        >
                          <Icon className="text-[16px]">delete</Icon>
                        </button>
                        <div className="flex items-start justify-between gap-gutter">
                          <div className="flex items-center gap-2">
                            <Badge tone={tone}>{stageLabel}</Badge>
                          </div>
                          {renderStageAllocationInput(stage, stageIndex, "shrink-0")}
                        </div>

                        {stageIndex === 0 ? (
                          <div className="space-y-2">
                            {stageConditions.map((condition, conditionIndex) => {
                              const [indicator, operator, value] = normalizeStrategyCondition(condition, conditionSide);
                              const operatorOptions = getConditionOperatorOptions(indicator);
                              const operatorRule = getConditionOperatorRule(indicator, operator, conditionSide);
                              const valueType = operatorRule.valueType || "text";
                              const valueInputPadding = [
                                operatorRule.prefix ? "pl-20" : "pl-2",
                                operatorRule.unit ? "pr-20" : "pr-2"
                              ].join(" ");
                              const conditionLogic = normalizeConditionLogic(condition[3]);

                              return (
                                <div className="space-y-1" key={`${stage.id}-${conditionIndex}`}>
                                  {conditionIndex > 0 ? (
                                    <div className="flex justify-center">
                                      <div className="grid w-[132px] grid-cols-2 gap-1">
                                        {CONDITION_LOGIC_OPTIONS.map((option) => (
                                          <button
                                            className={`h-8 rounded border font-label-caps text-label-caps ${conditionLogic === option.value ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"}`}
                                            key={option.value}
                                            type="button"
                                            onClick={() => updateDraftStageCondition(stageIndex, conditionIndex, 3, option.value)}
                                          >
                                            {option.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                  <div className="grid grid-cols-1 gap-gutter md:grid-cols-[1.1fr_0.9fr_minmax(11rem,1fr)_auto]">
                                  <label className="block">
                                    <span className="font-label-caps text-label-caps text-on-surface-variant md:hidden">지표</span>
                                    <select
                                      className="mt-1 h-9 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 font-body-sm text-body-sm text-on-surface md:mt-0"
                                      value={indicator}
                                      onChange={(event) => updateDraftStageCondition(stageIndex, conditionIndex, 0, event.target.value)}
                                    >
                                      {conditionIndicatorOptions.map((option) => (
                                        <option key={option}>{option}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block">
                                    <span className="font-label-caps text-label-caps text-on-surface-variant md:hidden">조건</span>
                                    <select
                                      className="mt-1 h-9 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 font-body-sm text-body-sm text-on-surface md:mt-0"
                                      value={operator}
                                      onChange={(event) => updateDraftStageCondition(stageIndex, conditionIndex, 1, event.target.value)}
                                    >
                                      {operatorOptions.map((option) => (
                                        <option key={option}>{option}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block">
                                    <span className="font-label-caps text-label-caps text-on-surface-variant md:hidden">값</span>
                                    {valueType === "select" ? (
                                      <select
                                        className="mt-1 h-9 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 font-label-mono text-label-mono text-on-surface md:mt-0"
                                        value={value}
                                        onChange={(event) => updateDraftStageCondition(stageIndex, conditionIndex, 2, event.target.value)}
                                      >
                                        {(operatorRule.valueOptions || []).map((option) => (
                                          <option key={option}>{option}</option>
                                        ))}
                                      </select>
                                    ) : valueType === "none" ? (
                                      <div className="mt-1 flex h-9 items-center rounded border border-outline-variant bg-surface-container-low px-2 font-body-sm text-body-sm text-on-surface-variant md:mt-0">
                                        {operatorRule.displayValue || "자동 판단"}
                                      </div>
                                    ) : (
                                      <div className="relative mt-1 md:mt-0">
                                        {operatorRule.prefix ? (
                                          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center font-body-sm text-body-sm text-on-surface-variant">
                                            {operatorRule.prefix}
                                          </span>
                                        ) : null}
                                        <input
                                          className={`h-9 w-full rounded border border-outline-variant bg-surface-container-lowest py-1.5 text-right font-label-mono text-label-mono text-on-surface ${valueInputPadding}`}
                                          inputMode="decimal"
                                          placeholder={operatorRule.placeholder || ""}
                                          value={value}
                                          onChange={(event) => updateDraftStageCondition(stageIndex, conditionIndex, 2, event.target.value)}
                                        />
                                        {operatorRule.unit ? (
                                          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center font-body-sm text-body-sm text-on-surface-variant">
                                            {operatorRule.unit}
                                          </span>
                                        ) : null}
                                      </div>
                                    )}
                                  </label>
                                  <button
                                    className="inline-flex h-9 w-full items-center justify-center rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest hover:text-error md:w-9"
                                    type="button"
                                    aria-label={`${stageLabel} 조건 삭제`}
                                    onClick={() => removeDraftStageCondition(stageIndex, conditionIndex)}
                                  >
                                    <Icon className="text-[18px]">close</Icon>
                                  </button>
                                  </div>
                                </div>
                              );
                            })}
                            <button
                              className="inline-flex items-center justify-center gap-1 rounded border border-outline-variant px-3 py-1.5 font-label-caps text-label-caps text-primary hover:bg-surface-container-highest"
                              type="button"
                              onClick={() => addDraftStageCondition(stageIndex)}
                            >
                              <Icon className="text-[16px]">add</Icon>
                              1차 조건 추가
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
                            <label className="block">
                              <span className="font-label-caps text-label-caps text-on-surface-variant">{previousStageLabel}</span>
                              <select
                                className="mt-1 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-body-sm text-body-sm text-on-surface"
                                value={stage.triggerOperator}
                                onChange={(event) => updateDraftStage(stageIndex, { triggerOperator: event.target.value })}
                              >
                                {[stage.triggerOperator, ...triggerOperatorOptions.filter((option) => option !== stage.triggerOperator)].map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <span className="font-label-caps text-label-caps text-on-surface-variant">값</span>
                              <div className="mt-1 flex">
                                <input
                                  className="w-full rounded-l border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-right font-label-mono text-label-mono text-on-surface"
                                  value={stage.triggerValue}
                                  onChange={(event) => updateDraftStage(stageIndex, { triggerType: "percent", triggerValue: event.target.value })}
                                />
                                <span className="rounded-r border-y border-r border-outline-variant bg-surface-container-highest px-2 py-1.5 font-label-mono text-label-mono text-on-surface-variant">%</span>
                              </div>
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-gutter md:grid-cols-[1fr_1fr_1.35fr_auto]">
                <NumberInput
                  label="전략별 손실 한도"
                  value={selectedDraft?.strategyLossLimit || ""}
                  onChange={(value) => {
                    updateStrategyDraft({ strategyLossLimit: value });
                    setStrategyNotice("");
                  }}
                  suffix="원"
                />
                <NumberInput
                  label="전략별 주문 한도"
                  value={selectedDraft?.strategyOrderLimit || ""}
                  onChange={(value) => {
                    updateStrategyDraft({ strategyOrderLimit: value });
                    setStrategyNotice("");
                  }}
                  suffix="원"
                />
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">투자 방식</span>
                  <div className="mt-[5px] grid h-10 grid-cols-2 gap-1 rounded border border-outline-variant bg-surface-container-lowest p-1">
                    {STRATEGY_POSITION_MODES.map((mode) => {
                      const active = selectedDraft?.positionMode === mode.value;
                      return (
                        <button
                          className={`rounded px-2 font-label-caps text-label-caps transition-colors ${active ? "bg-surface-container-highest text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                          key={mode.value}
                          type="button"
                          title={mode.description}
                          onClick={() => updateStrategyDraft({ positionMode: mode.value })}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </label>
                <button className="self-end h-10 min-w-[108px] rounded bg-primary-container px-4 py-2 text-on-primary-container font-label-caps text-label-caps hover:brightness-110" type="button" onClick={saveSelectedStrategySettings}>설정 저장</button>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                전략별 주문 한도는 이 전략이 한 번에 사용할 수 있는 총 주문 한도입니다. 분산 투자는 여러 종목에 나누고, 단일 투자는 가장 강한 신호 한 종목에만 적용합니다.
              </p>
            </div>
          </Section>

        </div>
      </section>

      {showImportPicker ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[560px] overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
            <div className="p-widget-padding border-b border-outline-variant flex items-center gap-2">
              <Icon className="text-primary">download</Icon>
              <h3 className="font-headline-md text-headline-md text-on-surface">전략 가져오기</h3>
            </div>
            <div className="p-widget-padding space-y-4">
              <p className="font-body-md text-body-md text-on-surface-variant">
                {sourceModeLabel} 모드에서 가져올 전략을 이름으로 선택합니다. 가져온 전략은 {modeLabel} 모드에 중지 상태로 추가됩니다.
              </p>
              {importableStrategies.length ? (
                <>
                  <label className="block">
                    <span className="font-label-caps text-label-caps text-on-surface-variant">전략 이름</span>
                    <select
                      className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
                      value={selectedImportId}
                      onChange={(event) => setSelectedImportId(event.target.value)}
                    >
                      {importableStrategies.map((strategy) => (
                        <option key={strategy.id} value={strategy.id}>{strategy.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
                    {[
                      ["적용 범위", selectedImportStrategy?.scope],
                      ["대상", selectedImportStrategy?.target],
                      ["현재 상태", selectedImportStrategy?.status]
                    ].map(([label, value]) => (
                      <div className="rounded border border-outline-variant bg-surface-container-low p-3" key={label}>
                        <span className="block font-label-caps text-label-caps text-on-surface-variant">{label}</span>
                        <span className="mt-1 block font-title-sm text-title-sm text-on-surface">{value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded border border-outline-variant bg-surface-container-low p-4 font-body-md text-body-md text-on-surface-variant">
                  {sourceModeLabel} 모드에서 가져올 새 전략이 없습니다.
                </div>
              )}
              <div className="flex flex-col-reverse gap-gutter sm:flex-row sm:justify-end">
                <button
                  className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-label-caps text-label-caps hover:bg-surface-container-highest"
                  type="button"
                  onClick={() => setShowImportPicker(false)}
                >
                  취소
                </button>
                <button
                  className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-label-caps text-label-caps hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
                  disabled={!importableStrategies.length}
                  type="button"
                  onClick={importSelectedStrategy}
                >
                  선택한 전략 가져오기
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function parsePercentValue(value) {
  const match = String(value ?? "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseCurrencyInput(value) {
  const amount = Number(String(value ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : 10000000;
}

function formatSignedPercent(value) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatCurrencyShort(value) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억 원`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString("ko-KR")}만 원`;
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function getDateRangeDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return Number.isFinite(diff) ? Math.max(1, diff) : 1;
}

function buildBacktestResult(strategy, dates, initialCashText) {
  if (!strategy) {
    return {
      periodLabel: `${dates.startDate} ~ ${dates.endDate}`,
      metrics: [
        ["누적 수익률", "대기 중", "neutral"],
        ["승률", "대기 중", "neutral"],
        ["최대 낙폭", "대기 중", "neutral"],
        ["거래 횟수", "대기 중", "neutral"]
      ],
      equityCurve: Array.from({ length: 12 }, (_, index) => ({ label: index + 1, value: 100 })),
      signals: [],
      score: 0,
      evaluationRows: [["전략 평가", "전략을 먼저 선택하세요."], ["리스크", "평가 대기"], ["예상 손익", "평가 대기"]],
      opinion: "등록된 전략이 있으면 기간과 초기 자금을 기준으로 모의 성과를 계산합니다."
    };
  }

  const initialCash = parseCurrencyInput(initialCashText);
  const baseReturn = parsePercentValue(strategy.returnRate);
  const baseWinRate = parsePercentValue(strategy.winRate);
  const buyStages = cloneStrategyStages(strategy, "buy");
  const sellStages = cloneStrategyStages(strategy, "sell");
  const buyConditionCount = buyStages.length ? cloneStrategyConditions(buyStages[0]?.conditions, "buy").length : 0;
  const sellConditionCount = sellStages.length ? cloneStrategyConditions(sellStages[0]?.conditions, "sell").length : 0;
  const followUpStageCount = Math.max(0, buyStages.length + sellStages.length - 2);
  const periodDays = getDateRangeDays(dates.startDate, dates.endDate);
  const periodFactor = Math.max(0.65, Math.min(1.25, periodDays / 90));
  const conditionBalance = buyConditionCount * 0.42 + sellConditionCount * 0.28 + followUpStageCount * 0.35;
  const statusBoost = strategy.status === "활성" ? 1.1 : 0.35;
  const returnRate = Number(((baseReturn * 0.74 + conditionBalance + statusBoost) * periodFactor).toFixed(1));
  const winRate = Math.round(Math.min(82, Math.max(42, baseWinRate + buyConditionCount * 1.4 - sellConditionCount * 0.45 + followUpStageCount * 0.35 + statusBoost)));
  const drawdown = Number(Math.max(2.8, 11.5 - returnRate * 0.34 + sellConditionCount * 0.22 + followUpStageCount * 0.18).toFixed(1));
  const tradeCount = Math.max(12, Math.round(periodDays * Math.max(1, buyConditionCount + sellConditionCount + followUpStageCount) / 5.2));
  const expectedProfit = initialCash * (returnRate / 100);
  const score = Math.round(Math.min(94, Math.max(35, winRate + returnRate - drawdown * 1.2)));
  const riskLevel = drawdown <= 4.5 ? "낮음" : drawdown <= 7 ? "보통" : "높음";
  const scoreLabel = score >= 75 ? "양호" : score >= 60 ? "관찰 필요" : "보수 운용";
  const buyAllocation = buyStages.map((stage, index) => `${index + 1}차 ${stage.allocation}%`).join(" · ");
  const sellAllocation = sellStages.map((stage, index) => `${index + 1}차 ${stage.allocation}%`).join(" · ");
  const signalConflictSummary = getSignalConflictSummary(strategy);
  const seed = Number(strategy.id) || strategy.name.length;
  const rawSignalMap = new Map([
    [2, { buy: true }],
    [4, { buy: true, sell: true }],
    [7, { buy: true }],
    [9, { sell: true }]
  ]);
  const equityCurve = Array.from({ length: 12 }, (_, index) => {
    const progress = index / 11;
    const wave = Math.sin((index + seed) * 1.08) * 1.25;
    const pullback = index === 6 ? -drawdown * 0.42 : index === 8 ? -drawdown * 0.18 : 0;
    const signalResolution = resolveStrategySignals(strategy, rawSignalMap.get(index));
    return {
      label: index + 1,
      value: Number((100 + returnRate * progress + wave + pullback).toFixed(2)),
      signal: signalResolution.signal,
      signalLabel: signalResolution.label,
      signalConflict: signalResolution.conflict,
      suppressedSignal: signalResolution.suppressedSignal,
      suppressedLabel: signalResolution.suppressedLabel,
      priorityLabel: signalResolution.priorityLabel
    };
  });
  const signals = equityCurve
    .filter((point) => point.signal)
    .map((point) => ({
      time: `${point.label}차 신호`,
      type: point.signal,
      label: point.signalConflict ? `동시 → ${point.signalLabel}` : point.signalLabel,
      value: formatSignedPercent(point.value - 100),
      conflict: point.signalConflict,
      detail: point.signalConflict ? `${point.priorityLabel} 적용, ${point.suppressedLabel} 보류` : ""
    }));

  return {
    periodLabel: `${dates.startDate} ~ ${dates.endDate}`,
    metrics: [
      ["누적 수익률", formatSignedPercent(returnRate), "secondary"],
      ["승률", `${winRate}%`, "primary"],
      ["최대 낙폭", `-${drawdown.toFixed(1)}%`, "tertiary"],
      ["거래 횟수", `${tradeCount}회`, "neutral"]
    ],
    equityCurve,
    signals,
    score,
    evaluationRows: [
      ["전략 평가", `${scoreLabel} · ${score}점`],
      ["리스크", `${riskLevel} · 최대 낙폭 ${drawdown.toFixed(1)}%`],
      ["예상 손익", `${expectedProfit >= 0 ? "+" : ""}${formatCurrencyShort(expectedProfit)}`],
      ["조건 구성", `1차 매수 ${buyConditionCount}개 · 1차 매도 ${sellConditionCount}개`],
      ["충돌 정책", `${signalConflictSummary.priorityLabel} · ${signalConflictSummary.priorityOutcome}`],
      ["충돌 검사", signalConflictSummary.conflicts.length ? `${signalConflictSummary.conflicts.length}건 우선순위 적용` : signalConflictSummary.watchItems.length ? `${signalConflictSummary.watchItems.length}건 점검` : "직접 충돌 없음"],
      ["단계 구성", `매수 ${buyStages.length}단계 · 매도 ${sellStages.length}단계`],
      ["매수 비중", buyAllocation],
      ["매도 비중", sellAllocation]
    ],
    opinion: score >= 75
      ? "수익 곡선이 우상향이고 낙폭이 제한적입니다. 자동 주문 전환 전에는 최근 신호 2~3회만 추가 확인하면 충분합니다."
      : score >= 60
        ? "성과는 양호하지만 낙폭 관리가 핵심입니다. 손절 조건을 한 단계 촘촘히 두고 주문 한도를 낮춰 검증하는 편이 좋습니다."
        : "조건 수 대비 신호 품질이 약합니다. 매수 조건을 줄이거나 거래량/수급 조건을 더 명확히 한 뒤 다시 테스트하는 흐름이 적합합니다."
  };
}

function parseStrictCurrencyInput(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function normalizeBacktestSymbol(value) {
  const match = String(value || "").trim().match(/\d{6}/);
  return match ? match[0] : "";
}

function extractBacktestSymbolFromStrategy(strategy) {
  if (!strategy) return "";
  if (Array.isArray(strategy.targetStocks) && strategy.targetStocks.length) {
    return normalizeBacktestSymbol(strategy.targetStocks[0]);
  }
  return normalizeBacktestSymbol(strategy.target);
}

function createEmptyBacktestResult(startDate, tradingDays) {
  return {
    periodLabel: startDate ? `${startDate}부터 ${tradingDays || DEFAULT_BACKTEST_INPUT.tradingDays}거래일` : `최근 ${MAX_BACKTEST_TRADING_DAYS}거래일`,
    metrics: [
      { label: "누적 수익률", value: "대기 중", tone: "neutral" },
      { label: "최종 평가금", value: "대기 중", tone: "neutral" },
      { label: "최대 낙폭", value: "대기 중", tone: "neutral" },
      { label: "거래 횟수", value: "대기 중", tone: "neutral" }
    ],
    candles: [],
    trades: [],
    signals: [],
    evaluationRows: [["전략 평가", "백테스트를 실행하세요."], ["체결 규칙", "일봉 종가 신호 · 다음 거래일 시가 체결"]],
    score: 0,
    opinion: "종목과 초기 자금을 입력하면 Kiwoom 일봉 최근 240거래일로 지표 조건을 계산합니다.",
    assumptions: []
  };
}

function createBacktestHistoryItem(result, runAt) {
  const metricMap = Object.fromEntries((result.metrics || []).map((metric) => [metric.label, metric.value]));
  return {
    id: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    runAt,
    strategyName: result.strategyName || "전략 없음",
    symbol: result.symbol || "",
    periodLabel: `${result.startDate} ~ ${result.endDate}`,
    tradingDays: result.actualTradingDays || result.requestedTradingDays || 0,
    score: result.score || 0,
    returnRate: metricMap["누적 수익률"] || "--",
    maxDrawdown: metricMap["최대 낙폭"] || "--",
    tradeCount: metricMap["거래 횟수"] || "--",
    opinion: result.opinion || "",
    evaluationRows: result.evaluationRows || [],
    result
  };
}

function createBacktestHistoryItemFromServer(item) {
  const createdAt = item.createdAt ? String(item.createdAt).replace("T", " ").slice(0, 16) : "";
  const returnRate = Number(item.returnRate || 0);
  const maxDrawdown = Number(item.maxDrawdown || 0);
  const resultPayload = item.result && typeof item.result === "object" ? item.result : {};
  const chartPayload = item.chart && typeof item.chart === "object" ? item.chart : {};
  const mergedResult = {
    ...resultPayload,
    ...chartPayload,
    mode: item.mode || resultPayload.mode,
    strategyId: item.strategyId || resultPayload.strategyId,
    strategyName: item.strategyName || resultPayload.strategyName || "전략 없음",
    symbol: item.symbol || resultPayload.symbol || "",
    startDate: item.startDate || resultPayload.startDate,
    endDate: item.endDate || resultPayload.endDate,
    actualTradingDays: item.tradingDays || resultPayload.actualTradingDays || resultPayload.requestedTradingDays || 0,
    initialCash: item.initialCash || resultPayload.initialCash || 0,
    score: item.score || resultPayload.score || 0,
    opinion: item.opinion || resultPayload.opinion || "",
    candles: Array.isArray(resultPayload.candles) ? resultPayload.candles : Array.isArray(chartPayload.candles) ? chartPayload.candles : [],
    equityCurve: Array.isArray(resultPayload.equityCurve) ? resultPayload.equityCurve : Array.isArray(chartPayload.equityCurve) ? chartPayload.equityCurve : [],
    trades: Array.isArray(resultPayload.trades) ? resultPayload.trades : Array.isArray(chartPayload.trades) ? chartPayload.trades : [],
    signals: Array.isArray(resultPayload.signals) ? resultPayload.signals : Array.isArray(chartPayload.signals) ? chartPayload.signals : []
  };
  return {
    id: item.id || `bt-server-${item.symbol}-${item.createdAt}`,
    runAt: createdAt,
    strategyName: item.strategyName || "전략 없음",
    symbol: item.symbol || "",
    periodLabel: `${item.startDate || "--"} ~ ${item.endDate || "--"}`,
    tradingDays: item.tradingDays || 0,
    score: item.score || 0,
    returnRate: `${returnRate > 0 ? "+" : ""}${returnRate.toFixed(2)}%`,
    maxDrawdown: `${maxDrawdown.toFixed(2)}%`,
    tradeCount: `${item.tradeCount || 0}회`,
    opinion: item.opinion || "",
    evaluationRows: item.result?.evaluationRows || [],
    startDate: item.startDate || "",
    endDate: item.endDate || "",
    initialCash: item.initialCash || "",
    result: mergedResult
  };
}

function BacktestChart({ result }) {
  const containerRef = useRef(null);
  const hasCandles = Boolean(result?.candles?.length);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasCandles) return undefined;

    const chart = createChart(container, {
      width: container.clientWidth || 720,
      height: container.clientHeight || 420,
      layout: {
        background: { type: ColorType.Solid, color: getChartColor(container, "--surface-container-low", "#111318") },
        textColor: getChartColor(container, "--on-surface-variant", "#9aa0a6")
      },
      grid: {
        vertLines: { color: getChartColor(container, "--outline-variant", "#2d3138") },
        horzLines: { color: getChartColor(container, "--outline-variant", "#2d3138") }
      },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: getChartColor(container, "--outline-variant", "#2d3138"),
        scaleMargins: { top: 0.08, bottom: 0.2 }
      },
      timeScale: {
        borderColor: getChartColor(container, "--outline-variant", "#2d3138"),
        timeVisible: false,
        secondsVisible: false
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: getChartColor(container, "--secondary", "#2fbc8f"),
      downColor: getChartColor(container, "--tertiary", "#df7d64"),
      borderVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
      wickUpColor: getChartColor(container, "--secondary", "#2fbc8f"),
      wickDownColor: getChartColor(container, "--tertiary", "#df7d64")
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: getChartColor(container, "--outline", "#7b8089")
    });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    const candles = result.candles
      .map((candle) => ({
        time: Number(candle.time),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
      }))
      .filter((candle) => Number.isFinite(candle.time) && candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0);
    const volumes = result.candles
      .map((candle) => ({
        time: Number(candle.time),
        value: Number(candle.volume) || 0,
        color: Number(candle.close) >= Number(candle.open)
          ? getChartColor(container, "--secondary", "#2fbc8f")
          : getChartColor(container, "--tertiary", "#df7d64")
      }))
      .filter((volume) => Number.isFinite(volume.time) && volume.value > 0);
    const markers = (result.trades || [])
      .map((trade) => ({
        time: Number(trade.time),
        position: trade.type === "buy" ? "belowBar" : "aboveBar",
        color: trade.type === "buy"
          ? getChartColor(container, "--secondary", "#2fbc8f")
          : getChartColor(container, "--tertiary", "#df7d64"),
        shape: trade.type === "buy" ? "arrowUp" : "arrowDown",
        text: `${trade.label} ${trade.priceText || ""}`.trim(),
        size: trade.conflict ? 1.25 : 1
      }))
      .filter((marker) => Number.isFinite(marker.time))
      .sort((first, second) => first.time - second.time);

    candleSeries.setData(candles);
    volumeSeries.setData(volumes);
    const markerApi = createSeriesMarkers(candleSeries, markers);
    chart.timeScale().fitContent();

    const resize = () => {
      chart.applyOptions({
        width: container.clientWidth || 720,
        height: container.clientHeight || 420
      });
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      markerApi?.detach?.();
      chart.remove();
    };
  }, [result, hasCandles]);

  return (
    <div className="rounded border border-outline-variant bg-surface-container-low p-3">
      <div className="relative h-[420px] w-full">
        {hasCandles ? (
          <div className="h-full w-full" ref={containerRef} />
        ) : (
          <div className="flex h-full items-center justify-center rounded border border-dashed border-outline-variant bg-surface-container-lowest p-6 text-center font-body-md text-body-md text-on-surface-variant">
            백테스트를 실행하면 일봉 차트 위에 매수·매도 화살표가 표시됩니다.
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 font-label-mono text-label-mono text-on-surface-variant">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-secondary" />매수 화살표</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-tertiary" />매도 화살표</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-outline" />거래량</span>
      </div>
    </div>
  );
}

function BacktestHistorySection({ history, status = "idle", onRefresh, onOpenResult }) {
  return (
    <Section>
      <SectionTitle
        icon="history"
        title="백테스트 기록"
        meta={`${history.length}건${status === "success" ? " · Supabase" : ""}`}
        action={
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"
            type="button"
            onClick={onRefresh}
            aria-label="백테스트 기록 새로고침"
          >
            <Icon className="text-[16px]">{status === "loading" ? "hourglass_top" : "refresh"}</Icon>
          </button>
        }
      />
      <div className="p-widget-padding">
        {history.length ? (
          <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
            {history.map((item) => (
              <article className="rounded border border-outline-variant bg-surface-container-low p-3" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-title-sm text-title-sm text-on-surface">{item.strategyName}</p>
                    <p className="mt-1 font-label-mono text-label-mono text-on-surface-variant">{item.symbol} · {item.periodLabel} · {item.tradingDays}거래일</p>
                  </div>
                  <Badge tone={item.score >= 75 ? "secondary" : item.score >= 60 ? "primary" : "tertiary"}>{item.score}점</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ["수익률", item.returnRate],
                    ["낙폭", item.maxDrawdown],
                    ["거래", item.tradeCount]
                  ].map(([label, value]) => (
                    <div className="rounded border border-outline-variant bg-surface-container px-2 py-2" key={label}>
                      <p className="font-label-caps text-label-caps text-on-surface-variant">{label}</p>
                      <p className="mt-1 font-label-mono text-label-mono text-on-surface">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 line-clamp-2 font-body-sm text-body-sm text-on-surface-variant">{item.opinion}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="font-label-mono text-label-mono text-on-surface-variant">{item.runAt}</p>
                  <button
                    className="inline-flex items-center gap-1 rounded border border-outline-variant px-3 py-1.5 font-label-caps text-label-caps text-primary hover:bg-surface-container-highest"
                    type="button"
                    onClick={() => onOpenResult?.(item)}
                  >
                    <Icon className="text-[16px]">open_in_new</Icon>
                    열기
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded border border-dashed border-outline-variant bg-surface-container-low p-6 text-center font-body-md text-body-md text-on-surface-variant">
            아직 저장된 백테스트 평가 기록이 없습니다.
          </div>
        )}
      </div>
    </Section>
  );
}

function BacktestPage({ strategies, executionMode, backtestState, setBacktestState, onRecordActivity }) {
  const [backtestStrategy, setBacktestStrategy] = useState(() => String(backtestState?.strategyId || strategies[0]?.id || ""));
  const [backtestSymbol, setBacktestSymbol] = useState(() => backtestState?.symbol || extractBacktestSymbolFromStrategy(strategies[0]));
  const [initialCash, setInitialCash] = useState(() => backtestState?.initialCash || DEFAULT_BACKTEST_INPUT.initialCash);
  const [backtestMessage, setBacktestMessage] = useState("");
  const [backtestMessageTone, setBacktestMessageTone] = useState("neutral");
  const [lastRunAt, setLastRunAt] = useState(() => backtestState?.lastRunAt || "");
  const [latestResult, setLatestResult] = useState(null);
  const [backtestHistory, setBacktestHistory] = useState(() => Array.isArray(backtestState?.history) ? backtestState.history : []);
  const [serverBacktestHistory, setServerBacktestHistory] = useState([]);
  const [serverBacktestHistoryStatus, setServerBacktestHistoryStatus] = useState("idle");
  const [isBacktestRunning, setIsBacktestRunning] = useState(false);
  const modeLabel = accountProfiles[executionMode].shortLabel;
  const selectedStrategy = strategies.find((strategy) => String(strategy.id) === String(backtestStrategy)) || strategies[0];
  const displayResult = latestResult || createEmptyBacktestResult("", MAX_BACKTEST_TRADING_DAYS);
  const displayBacktestHistory = serverBacktestHistory.length ? serverBacktestHistory : backtestHistory;
  const backtestMessageClass = backtestMessageTone === "error"
    ? "border-error/30 bg-error/10 text-error"
    : backtestMessageTone === "success"
      ? "border-secondary/30 bg-secondary/10 text-secondary"
      : "border-outline-variant bg-surface-container-low text-on-surface-variant";

  useEffect(() => {
    const nextStrategyId = String(backtestState?.strategyId || strategies[0]?.id || "");
    const nextStrategy = strategies.find((strategy) => String(strategy.id) === nextStrategyId) || strategies[0];
    setBacktestStrategy(nextStrategyId);
    setBacktestSymbol(backtestState?.symbol || extractBacktestSymbolFromStrategy(nextStrategy));
    setInitialCash(backtestState?.initialCash || DEFAULT_BACKTEST_INPUT.initialCash);
    setLastRunAt(backtestState?.lastRunAt || "");
    setBacktestHistory(Array.isArray(backtestState?.history) ? backtestState.history : []);
    setLatestResult(null);
    setBacktestMessage("");
    setBacktestMessageTone("neutral");
  }, [executionMode]);

  useEffect(() => {
    if (!strategies.length) {
      setBacktestStrategy("");
      return;
    }
    if (!strategies.some((strategy) => String(strategy.id) === String(backtestStrategy))) {
      const nextStrategy = strategies[0];
      setBacktestStrategy(String(nextStrategy.id));
      setBacktestSymbol((current) => current || extractBacktestSymbolFromStrategy(nextStrategy));
    }
  }, [strategies, backtestStrategy]);

  useEffect(() => {
    setBacktestState?.((current) => ({
      ...createDefaultBacktestInput(),
      ...current,
      strategyId: backtestStrategy,
      symbol: backtestSymbol,
      startDate: "",
      tradingDays: DEFAULT_BACKTEST_INPUT.tradingDays,
      initialCash,
      lastRunAt,
      history: backtestHistory.map(({ result, ...item }) => item)
    }));
  }, [backtestStrategy, backtestSymbol, initialCash, lastRunAt, backtestHistory]);

  function setMessage(message, tone = "neutral") {
    setBacktestMessage(message);
    setBacktestMessageTone(tone);
  }

  async function refreshBacktestHistory() {
    setServerBacktestHistoryStatus("loading");
    try {
      const history = await getBacktestHistory(executionMode, MAX_BACKTEST_HISTORY_ITEMS);
      const items = Array.isArray(history.items) ? history.items.map(createBacktestHistoryItemFromServer) : [];
      setServerBacktestHistory(items);
      setServerBacktestHistoryStatus("success");
    } catch {
      setServerBacktestHistoryStatus("error");
    }
  }

  function openBacktestHistoryItem(item) {
    const resultPayload = item?.result && typeof item.result === "object" ? item.result : {};
    const startDate = resultPayload.startDate || item.startDate || "";
    const endDate = resultPayload.endDate || item.endDate || "";
    const dayCount = Number(resultPayload.actualTradingDays || resultPayload.requestedTradingDays || item.tradingDays || DEFAULT_BACKTEST_INPUT.tradingDays);
    const fallbackResult = createEmptyBacktestResult("", dayCount);
    const metrics = Array.isArray(resultPayload.metrics) && resultPayload.metrics.length
      ? resultPayload.metrics
      : [
        { label: "누적 수익률", value: item.returnRate || "--", tone: String(item.returnRate || "").startsWith("-") ? "tertiary" : "secondary" },
        { label: "최종 평가금", value: resultPayload.finalEquity ? `${Number(resultPayload.finalEquity).toLocaleString("ko-KR")}원` : "--", tone: "primary" },
        { label: "최대 낙폭", value: item.maxDrawdown || "--", tone: "tertiary" },
        { label: "거래 횟수", value: item.tradeCount || "--", tone: "neutral" }
      ];
    const restoredResult = {
      ...fallbackResult,
      ...resultPayload,
      periodLabel: startDate && endDate ? `${startDate} ~ ${endDate}` : item.periodLabel || fallbackResult.periodLabel,
      strategyName: item.strategyName || resultPayload.strategyName || fallbackResult.strategyName,
      symbol: item.symbol || resultPayload.symbol || "",
      startDate,
      endDate,
      actualTradingDays: dayCount,
      metrics,
      evaluationRows: Array.isArray(resultPayload.evaluationRows) && resultPayload.evaluationRows.length ? resultPayload.evaluationRows : item.evaluationRows || fallbackResult.evaluationRows,
      score: item.score || resultPayload.score || 0,
      opinion: item.opinion || resultPayload.opinion || fallbackResult.opinion,
      candles: Array.isArray(resultPayload.candles) ? resultPayload.candles : [],
      trades: Array.isArray(resultPayload.trades) ? resultPayload.trades : [],
      signals: Array.isArray(resultPayload.signals) ? resultPayload.signals : [],
      assumptions: Array.isArray(resultPayload.assumptions) ? resultPayload.assumptions : fallbackResult.assumptions
    };

    const matchingStrategy = strategies.find((strategy) => String(strategy.id) === String(resultPayload.strategyId || item.strategyId));
    if (matchingStrategy) setBacktestStrategy(String(matchingStrategy.id));
    if (restoredResult.symbol) setBacktestSymbol(restoredResult.symbol);
    if (Number(resultPayload.initialCash || item.initialCash || 0) > 0) {
      setInitialCash(Number(resultPayload.initialCash || item.initialCash || 0).toLocaleString("ko-KR"));
    }
    setLatestResult(restoredResult);
    setLastRunAt(item.runAt || lastRunAt);
    setMessage("저장된 백테스트 기록을 불러왔습니다.", "success");
  }

  useEffect(() => {
    refreshBacktestHistory();
  }, [executionMode]);

  function updateSelectedStrategy(value) {
    const nextStrategy = strategies.find((strategy) => String(strategy.id) === String(value));
    setBacktestStrategy(String(value));
    setLatestResult(null);
    setMessage("");
    const nextSymbol = extractBacktestSymbolFromStrategy(nextStrategy);
    if (nextSymbol) setBacktestSymbol(nextSymbol);
  }

  async function runBacktest() {
    if (!selectedStrategy) {
      setMessage(requiredInputMessage("전략"), "error");
      return;
    }

    const symbol = normalizeBacktestSymbol(backtestSymbol);
    if (!symbol) {
      setMessage(requiredInputMessage("종목 코드 6자리"), "error");
      return;
    }

    const initialCashAmount = parseStrictCurrencyInput(initialCash);
    if (!String(initialCash || "").trim()) {
      setMessage(requiredInputMessage("초기 자금"), "error");
      return;
    }
    if (initialCashAmount <= 0) {
      setMessage(invalidInputMessage("초기 자금은 0보다 커야 합니다."), "error");
      return;
    }

    const conflictError = getSignalConditionConflictError(selectedStrategy);
    if (conflictError) {
      setMessage(conflictError, "error");
      return;
    }

    setIsBacktestRunning(true);
    setMessage("Kiwoom 일봉 데이터를 받아와 지표 조건을 계산하는 중입니다.");
    try {
      const result = await runStrategyBacktest({
        mode: executionMode,
        symbol,
        tradingDays: MAX_BACKTEST_TRADING_DAYS,
        initialCash: initialCashAmount,
        strategy: selectedStrategy
      });
      const runAt = `${formatKoreanDate()} ${getKoreanOrderTime()}`;
      const historyItem = createBacktestHistoryItem(result, runAt);
      setLatestResult(result);
      setLastRunAt(runAt);
      setBacktestSymbol(symbol);
      setBacktestHistory((current) => [historyItem, ...current].slice(0, MAX_BACKTEST_HISTORY_ITEMS));
      await refreshBacktestHistory();
      setMessage(`${result.actualTradingDays}거래일 백테스트를 완료했습니다. 결과 요약과 매매 포인트를 저장했습니다.`, "success");
      onRecordActivity?.({
        type: "전략",
        target: selectedStrategy.name,
        body: `${symbol} 일봉 ${result.actualTradingDays}거래일 백테스트 완료 · ${historyItem.returnRate}`,
        status: "완료"
      });
    } catch (error) {
      setMessage(error.message || "백테스트 실행에 실패했습니다.", "error");
    } finally {
      setIsBacktestRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="백테스트"
        description={`${modeLabel} 모드 전략을 일봉 기준으로 검증하고 차트 위에 매수·매도 포인트를 표시합니다.`}
        action={
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <button
              className="inline-flex items-center gap-2 rounded bg-secondary-container px-4 py-2 font-label-caps text-label-caps text-on-secondary-container hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
              type="button"
              disabled={!strategies.length || isBacktestRunning}
              onClick={runBacktest}
            >
              <Icon className="text-[16px]">{isBacktestRunning ? "hourglass_top" : "play_arrow"}</Icon>
              {isBacktestRunning ? "계산 중" : "백테스트 실행"}
            </button>
            {lastRunAt ? <span className="font-label-mono text-label-mono text-on-surface-variant">최근 실행 {lastRunAt}</span> : null}
          </div>
        }
      />

      <Section>
        <SectionTitle icon="tune" title="테스트 조건" meta={displayResult.periodLabel} />
        <div className="p-widget-padding space-y-gutter">
          <div className="grid grid-cols-1 gap-gutter md:grid-cols-4">
            <label className="block">
              <span className="font-label-caps text-label-caps text-on-surface-variant">전략 선택</span>
              <select
                className="mt-1 w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface"
                value={backtestStrategy}
                disabled={!strategies.length || isBacktestRunning}
                onChange={(event) => updateSelectedStrategy(event.target.value)}
              >
                {strategies.map((strategy) => <option key={strategy.id} value={String(strategy.id)}>{strategy.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="font-label-caps text-label-caps text-on-surface-variant">종목 코드</span>
              <input
                className="mt-1 w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-label-mono text-label-mono text-on-surface"
                value={backtestSymbol}
                maxLength={20}
                placeholder="005930"
                disabled={isBacktestRunning}
                onChange={(event) => {
                  setBacktestSymbol(event.target.value);
                  setLatestResult(null);
                  setMessage("");
                }}
              />
            </label>
            <div className="block">
              <span className="font-label-caps text-label-caps text-on-surface-variant">평가 기간</span>
              <div className="mt-1 rounded border border-outline-variant bg-surface-container-low px-3 py-2">
                <span className="font-label-mono text-label-mono text-on-surface">최근 {MAX_BACKTEST_TRADING_DAYS}거래일</span>
              </div>
            </div>
            <label className="block">
              <span className="font-label-caps text-label-caps text-on-surface-variant">초기 자금</span>
              <div className="mt-1 flex">
                <input
                  className="w-full rounded-l border border-outline-variant bg-surface-container-lowest px-3 py-2 text-right font-label-mono text-label-mono text-on-surface"
                  value={initialCash}
                  disabled={isBacktestRunning}
                  onChange={(event) => {
                    setInitialCash(event.target.value);
                    setLatestResult(null);
                    setMessage("");
                  }}
                />
                <span className="rounded-r border-y border-r border-outline-variant bg-surface-container-highest px-3 py-2 font-label-mono text-label-mono text-on-surface-variant">원</span>
              </div>
            </label>
          </div>
          <div className={`rounded border p-3 font-body-sm text-body-sm ${backtestMessage ? backtestMessageClass : "border-outline-variant bg-surface-container-low text-on-surface-variant"}`}>
            {backtestMessage || `일봉 백테스트는 최근 ${MAX_BACKTEST_TRADING_DAYS}거래일을 고정 평가합니다. 신호는 종가 기준, 체결은 다음 거래일 시가 기준입니다.`}
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-gutter md:grid-cols-4">
        {displayResult.metrics.map(({ label, value, tone }) => (
          <div className="rounded-lg border border-outline-variant bg-surface-container p-widget-padding" key={label}>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{label}</p>
            <p className={`mt-1 font-headline-md text-headline-md ${tone === "secondary" ? "text-secondary" : tone === "primary" ? "text-primary" : tone === "tertiary" ? "text-tertiary" : "text-on-surface"}`}>{value}</p>
          </div>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-gutter xl:grid-cols-12">
        <Section className="xl:col-span-8">
          <SectionTitle icon="candlestick_chart" title="매매 포인트 차트" meta={latestResult ? `${latestResult.symbol} · ${latestResult.actualTradingDays}거래일` : selectedStrategy?.name || "전략 없음"} />
          <div className="p-widget-padding">
            <BacktestChart result={displayResult} />
          </div>
        </Section>

        <Section className="xl:col-span-4">
          <SectionTitle icon="fact_check" title="전략 평가" meta={displayResult.score ? `${displayResult.score}점` : "대기"} tone="text-secondary" />
          <div className="p-widget-padding space-y-gutter">
            <div className="divide-y divide-outline-variant/40 rounded border border-outline-variant bg-surface-container-low">
              {displayResult.evaluationRows.map(([label, value]) => (
                <div className="flex items-center justify-between gap-3 p-3" key={label}>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">{label}</span>
                  <strong className="text-right font-title-sm text-title-sm text-on-surface">{value}</strong>
                </div>
              ))}
            </div>
            <div className="rounded border border-outline-variant bg-surface-container-low p-3">
              <p className="font-label-caps text-label-caps text-secondary">운용 의견</p>
              <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{displayResult.opinion}</p>
            </div>
            <div className="rounded border border-outline-variant bg-surface-container-low p-3">
              <p className="font-label-caps text-label-caps text-on-surface-variant">매매 신호</p>
              <div className="mt-2 space-y-2">
                {displayResult.signals.length ? displayResult.signals.map((signal) => (
                  <div className="flex items-center justify-between gap-3" key={`${signal.time}-${signal.type}-${signal.price}`}>
                    <span className="inline-flex items-center gap-2">
                      <Badge tone={signal.type === "buy" ? "secondary" : "tertiary"}>{signal.label}</Badge>
                        <span className="flex flex-col">
                          <span className="font-body-sm text-body-sm text-on-surface-variant">{signal.timeText}</span>
                          {signal.detail ? <span className="font-label-mono text-label-mono text-error">{signal.detail}</span> : null}
                          {signal.feeText ? <span className="font-label-mono text-label-mono text-on-surface-variant">수수료 {signal.feeText}</span> : null}
                        </span>
                      </span>
                    <span className="font-label-mono text-label-mono text-on-surface">{signal.priceText}</span>
                  </div>
                )) : (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">표시할 신호가 없습니다.</p>
                )}
              </div>
            </div>
            {displayResult.assumptions.length ? (
              <div className="rounded border border-outline-variant bg-surface-container-low p-3">
                <p className="font-label-caps text-label-caps text-on-surface-variant">계산 기준</p>
                <div className="mt-2 space-y-1">
                  {displayResult.assumptions.map((item) => (
                    <p className="font-body-sm text-body-sm text-on-surface-variant" key={item}>{item}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Section>
      </section>

      <BacktestHistorySection history={displayBacktestHistory} status={serverBacktestHistoryStatus} onRefresh={refreshBacktestHistory} onOpenResult={openBacktestHistoryItem} />
    </>
  );
}

function NumberInput({ label, value, onChange, suffix }) {
  return (
    <label className="block">
      <span className="font-label-caps text-label-caps text-on-surface-variant">{label}</span>
      <div className="mt-1 flex">
        <input
          className="w-full bg-surface-container-lowest border border-outline-variant rounded-l px-3 py-2 font-label-mono text-label-mono text-right text-on-surface"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
        <span className="px-3 py-2 bg-surface-container-highest border-y border-r border-outline-variant rounded-r font-label-mono text-label-mono text-on-surface-variant">{suffix}</span>
      </div>
    </label>
  );
}

function RecordPage({ records = recordRows, alerts: pageAlerts = alerts }) {
  const [recordFilters, setRecordFilters] = useState(() => {
    const today = formatKoreanDate();
    return {
      startDate: today,
      endDate: today,
      strategy: "모든 전략",
      type: "전체 기록",
      status: "전체 상태"
    };
  });
  const filteredRecordRows = records.filter(([time, type, target, body, status]) => {
    const date = time.slice(0, 10);
    const matchesStart = !recordFilters.startDate || date >= recordFilters.startDate;
    const matchesEnd = !recordFilters.endDate || date <= recordFilters.endDate;
    const matchesStrategy = recordFilters.strategy === "모든 전략" || target === recordFilters.strategy;
    const matchesType = recordFilters.type === "전체 기록" || type === recordFilters.type;
    const matchesStatus = recordFilters.status === "전체 상태" || status === recordFilters.status;
    return matchesStart && matchesEnd && matchesStrategy && matchesType && matchesStatus;
  });
  const completedRecordCount = filteredRecordRows.filter(([, , , , status]) => status === "완료").length;
  const reviewRecordCount = filteredRecordRows.filter(([, , , , status]) => status !== "완료").length;
  const updateRecordFilter = (key, value) => {
    setRecordFilters((current) => ({ ...current, [key]: value }));
  };
  const escapeCsvValue = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  function exportRecordsCsv() {
    const headers = ["시간", "구분", "대상", "내용", "상태"];
    const rows = filteredRecordRows.map((row) => row.map(escapeCsvValue).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trading-records-${recordFilters.startDate || "start"}-${recordFilters.endDate || "end"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="기록 및 알림"
        description="거래 기록과 시스템 알림을 한 곳에서 확인합니다."
        action={
          <button
            className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-label-caps text-label-caps hover:bg-surface-container-highest transition-colors flex items-center gap-2 disabled:opacity-50 disabled:hover:bg-transparent"
            disabled={!filteredRecordRows.length}
            type="button"
            onClick={exportRecordsCsv}
          >
            <Icon className="text-[18px]">download</Icon>
            CSV 내보내기
          </button>
        }
      />

      <section className="grid grid-cols-1 md:grid-cols-5 gap-3 p-widget-padding bg-surface-container rounded-lg border border-outline-variant">
        <FilterControl label="시작일" type="date" value={recordFilters.startDate} onChange={(value) => updateRecordFilter("startDate", value)} />
        <FilterControl label="종료일" type="date" value={recordFilters.endDate} onChange={(value) => updateRecordFilter("endDate", value)} />
        <FilterControl label="전략" value={recordFilters.strategy} onChange={(value) => updateRecordFilter("strategy", value)} options={["모든 전략", ...[...new Set(records.map(([, , target]) => target).filter(Boolean))]]} />
        <FilterControl label="구분" value={recordFilters.type} onChange={(value) => updateRecordFilter("type", value)} options={["전체 기록", "주문", "전략", "리스크", "시스템"]} />
        <FilterControl label="상태" value={recordFilters.status} onChange={(value) => updateRecordFilter("status", value)} options={["전체 상태", "완료", "대기", "중지", "확인 필요"]} />
      </section>

      <div className="grid grid-cols-12 gap-gutter items-stretch">
        <Section className="col-span-12 lg:col-span-9 flex flex-col section-bound-tall h-full" id="records">
          <SectionTitle icon="history" title="거래 기록" meta={`${filteredRecordRows.length}건`} />
          <div className="divide-y divide-outline-variant/40 section-body-scroll flex-1 min-h-0 custom-scrollbar">
            <div className="hidden md:grid md:grid-cols-12 gap-3 px-widget-padding py-2 bg-surface-container-low font-label-caps text-label-caps text-outline uppercase">
              <span className="md:col-span-2">시간</span>
              <span className="md:col-span-1">구분</span>
              <span className="md:col-span-2">대상</span>
              <span className="md:col-span-5">내용</span>
              <span className="md:col-span-2 text-right">상태</span>
            </div>
            {filteredRecordRows.map(([time, type, target, body, status]) => (
              <article className={`grid grid-cols-1 md:grid-cols-12 items-center gap-1 md:gap-3 px-widget-padding py-3 hover:bg-surface-container-highest transition-colors min-w-0 overflow-hidden ${status === "중지" ? "bg-error-container/5" : ""}`} key={time}>
                <span className="md:col-span-2 min-w-0 truncate font-label-mono text-label-mono text-on-surface-variant" title={time}>{time}</span>
                <span className="md:col-span-1 w-fit">
                  <Badge tone={type === "리스크" ? "error" : type === "주문" ? "secondary" : type === "시스템" ? "neutral" : "primary"}>{type}</Badge>
                </span>
                <span className="md:col-span-2 min-w-0 truncate font-title-sm text-title-sm text-on-surface" title={target}>{target}</span>
                <span className={`md:col-span-5 min-w-0 truncate font-body-md text-body-md ${status === "중지" ? "text-error" : "text-on-surface-variant"}`} title={body}>{body}</span>
                <span className={`md:col-span-2 min-w-0 truncate font-label-mono text-label-mono md:text-right ${status === "완료" ? "text-secondary" : status === "대기" ? "text-primary" : status === "중지" ? "text-error" : "text-tertiary"}`} title={status}>{status}</span>
              </article>
            ))}
            {!filteredRecordRows.length ? (
              <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">조건에 맞는 기록이 없습니다.</div>
            ) : null}
          </div>
          <div className="mt-auto p-4 border-t border-outline-variant bg-surface-container-low flex justify-between items-center">
            <span className="font-label-mono text-label-mono text-on-surface-variant">{filteredRecordRows.length}건 표시 중</span>
            <span className="font-label-mono text-label-mono text-on-surface-variant">필수 기록만 표시</span>
          </div>
        </Section>

        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-gutter h-full">
          <div className="bg-surface-container border border-outline-variant rounded-lg p-widget-padding section-body-scroll flex-1 h-full custom-scrollbar">
            <h3 className="font-label-caps text-label-caps text-outline uppercase mb-4 flex items-center justify-between">
              기간 요약
              <span className="font-label-mono text-label-mono text-secondary-container">{recordFilters.startDate} ~ {recordFilters.endDate}</span>
            </h3>
            <div className="space-y-4">
              {[
                ["총 기록 건수", String(filteredRecordRows.length), "필수 기록"],
                ["완료된 기록", String(completedRecordCount), filteredRecordRows.length ? `${Math.round((completedRecordCount / filteredRecordRows.length) * 100)}%` : "0%"],
                ["확인 필요", String(reviewRecordCount), "검토"]
              ].map(([label, value, meta]) => (
                <div key={label}>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mb-1">{label}</p>
                  <div className="flex items-end justify-between">
                    <span className="font-headline-lg text-headline-lg text-on-surface">{value}</span>
                    <span className="text-on-surface-variant font-label-mono text-label-mono">{meta}</span>
                  </div>
                  <div className="h-px bg-outline-variant/30 mt-4" />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <Section className="section-scroll-tall scroll-mt-16" id="alerts">
        <SectionTitle icon="notifications" title="알림" meta={`${pageAlerts.length}건`} />
        <div className="divide-y divide-outline-variant/40">
          {pageAlerts.map(([icon, color, title, body, time], index) => (
            <article className={`p-widget-padding flex items-start gap-3 ${index === 0 ? "bg-error-container/5" : ""}`} key={title}>
              <Icon className={`${color} mt-0.5`}>{icon}</Icon>
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-title-sm text-title-sm text-on-surface">{title}</h4>
                  <span className="font-label-mono text-label-mono text-on-surface-variant">{time}</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">{body}</p>
              </div>
            </article>
          ))}
          {!pageAlerts.length ? (
            <div className="p-widget-padding text-center font-body-md text-body-md text-on-surface-variant">표시할 알림이 없습니다.</div>
          ) : null}
        </div>
      </Section>
    </>
  );
}

function FilterControl({ label, type = "select", value, onChange, options = [] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-label-caps text-label-caps text-outline uppercase">{label}</label>
      {type === "date" ? (
        <input
          className="bg-surface-container-lowest border border-outline-variant text-on-surface font-body-md text-body-md p-2 focus:ring-1 focus:ring-primary outline-none"
          type="date"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : (
        <select
          className="bg-surface-container-lowest border border-outline-variant text-on-surface font-body-md text-body-md p-2 focus:ring-1 focus:ring-primary outline-none"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        >
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
      )}
    </div>
  );
}

function SettingsPage({ theme, setTheme, nickname, updateNickname, executionMode, setExecutionMode, emergencyEnabled, setEmergencyEnabled, orderMode, setOrderMode, notificationPreferences, setNotificationPreferences, onAccountProfileLoaded, onPasswordChange, onVerifyCurrentPassword }) {
  const { requirePin } = usePinAuth();
  const [nicknameDraft, setNicknameDraft] = useState(nickname || "");
  const [profileMessage, setProfileMessage] = useState("닉네임을 입력한 뒤 프로필 저장을 누르세요.");
  const [profileMessageTone, setProfileMessageTone] = useState("neutral");
  const [passwordMessage, setPasswordMessage] = useState("현재 비밀번호와 새 비밀번호를 입력하면 Supabase Auth에서 비밀번호를 변경합니다.");
  const [passwordMessageTone, setPasswordMessageTone] = useState("neutral");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordChangeBusy, setPasswordChangeBusy] = useState(false);
  const [pendingExecutionMode, setPendingExecutionMode] = useState(null);
  const [kiwoomCredentials, setKiwoomCredentials] = useState({
    real: { appKey: "", appSecret: "", accountNo: "" },
    mock: { appKey: "", appSecret: "", accountNo: "" }
  });
  const [kiwoomStatus, setKiwoomStatus] = useState({ real: "미연결", mock: "미연결" });
  const [kiwoomMessage, setKiwoomMessage] = useState("실전과 모의 환경의 API 키를 각각 입력할 수 있습니다.");
  const [kiwoomMessageTone, setKiwoomMessageTone] = useState("neutral");
  const [kiwoomConnectionBusy, setKiwoomConnectionBusy] = useState(false);
  const [kiwoomBackendStatusByMode, setKiwoomBackendStatusByMode] = useState({ real: null, mock: null });
  const [showRealConnectWarning, setShowRealConnectWarning] = useState(false);
  const [orderModeMessage, setOrderModeMessage] = useState("자동 주문 전환 전 체크리스트를 확인하세요.");
  const [orderModeMessageTone, setOrderModeMessageTone] = useState("neutral");
  const [autoOrderChecks, setAutoOrderChecks] = useState({
    environment: false,
    lossLimit: false,
    cancellation: false
  });

  const activeKiwoomCredentials = kiwoomCredentials[executionMode];
  const activeKiwoomLabel = accountProfiles[executionMode].shortLabel;
  const activeKiwoomBackendStatus = kiwoomBackendStatusByMode[executionMode];
  const activeKiwoomStatus = activeKiwoomBackendStatus?.configured
    ? activeKiwoomBackendStatus.accountConfigured
      ? activeKiwoomBackendStatus.credentialSource === "browser" ? "브라우저 연결됨" : "백엔드 설정됨"
      : "토큰 확인됨"
    : kiwoomStatus[executionMode];
  const autoOrderChecklistItems = [
    ["environment", `${activeKiwoomLabel} 계좌와 주문 환경을 확인했습니다.`],
    ["lossLimit", "전략별 손실 한도와 주문 한도를 확인했습니다."],
    ["cancellation", "미체결 주문 취소/정정 경로를 확인했습니다."]
  ];
  const autoOrderChecklistComplete = autoOrderChecklistItems.every(([key]) => autoOrderChecks[key]);

  function changeDefaultOrderMode(mode) {
    if (mode === "자동 주문") {
      if (!autoOrderChecklistComplete) {
        setOrderModeMessage("자동 주문 체크리스트를 모두 확인해야 전환할 수 있습니다.");
        setOrderModeMessageTone("error");
        return;
      }
      if (!requirePin()) return;
      const confirmed = window.confirm(
        executionMode === "real"
          ? "실전 자동 주문은 조건 충족 시 실제 계좌로 주문을 요청합니다. 기본 주문 방식을 자동 주문으로 바꿀까요?"
          : "자동 주문은 조건 충족 시 승인 없이 주문을 요청할 수 있습니다. 기본 주문 방식을 자동 주문으로 바꿀까요?"
      );
      if (!confirmed) return;
    }
    setOrderMode(mode);
    setOrderModeMessage(mode === "자동 주문" ? "기본 주문 방식이 자동 주문으로 변경되었습니다." : "기본 주문 방식이 승인 후 주문으로 변경되었습니다.");
    setOrderModeMessageTone(mode === "자동 주문" ? "warning" : "success");
  }
  const isKiwoomReady = activeKiwoomStatus !== "미연결";
  const pendingExecutionLabel = pendingExecutionMode ? accountProfiles[pendingExecutionMode].shortLabel : "";
  const passwordMessageClass = {
    neutral: "text-on-surface-variant",
    error: "text-error",
    success: "text-secondary"
  }[passwordMessageTone] || "text-on-surface-variant";
  const profileMessageClass = {
    neutral: "text-on-surface-variant",
    error: "text-error",
    success: "text-secondary"
  }[profileMessageTone] || "text-on-surface-variant";
  const kiwoomMessageClass = {
    neutral: "text-on-surface-variant",
    error: "text-error",
    success: "text-secondary",
    warning: "text-tertiary"
  }[kiwoomMessageTone] || "text-on-surface-variant";
  const orderModeMessageClass = {
    neutral: "text-on-surface-variant",
    error: "text-error",
    success: "text-secondary",
    warning: "text-tertiary"
  }[orderModeMessageTone] || "text-on-surface-variant";

  function setProfileNotice(message, tone = "neutral") {
    setProfileMessage(message);
    setProfileMessageTone(tone);
  }

  function setPasswordNotice(message, tone = "neutral") {
    setPasswordMessage(message);
    setPasswordMessageTone(tone);
  }

  function setKiwoomNotice(message, tone = "neutral") {
    setKiwoomMessage(message);
    setKiwoomMessageTone(tone);
  }

  function getKiwoomBackendMessage(status) {
    if (!status) {
      return "키움 API 연결 상태를 아직 확인하지 못했습니다.";
    }

    if (status.configured) {
      if (!status.accountConfigured) {
        return "키움 API 토큰 발급은 확인했습니다. 계좌번호를 입력하면 잔고 조회와 주문 요청까지 사용할 수 있습니다.";
      }

      if (status.credentialSource === "browser") {
        return "브라우저 입력값으로 키움 API 토큰 발급을 확인했습니다. 종목 검색과 계좌 조회가 키움 API 기준으로 표시됩니다.";
      }

      return "백엔드 .env의 키움 설정으로 연결되었습니다. 종목 검색과 계좌 조회가 키움 API 기준으로 표시됩니다.";
    }

    const missing = [
      ["앱 키", status.credentialConfigured],
      ["앱 시크릿", status.credentialConfigured],
      ["KIWOOM_ACCOUNT_NO", status.accountConfigured]
    ]
      .filter(([, ready]) => !ready)
      .map(([name]) => name)
      .join(", ");

    return `브라우저 입력값을 백엔드에 전달했지만 ${missing || "필수 정보"}이 부족합니다. 계좌번호까지 입력하면 연결 준비 상태가 됩니다.`;
  }

  async function refreshKiwoomAccountProfile(mode, status) {
    if (!status?.configured || !status.accountConfigured) return false;
    const profile = await getBrokerageAccount(mode);
    onAccountProfileLoaded?.(mode, profile);
    return true;
  }

  function saveNicknameDraft() {
    const cleanNickname = nicknameDraft.trim();
    if (!cleanNickname) {
      setNicknameDraft(nickname || "");
      setProfileNotice(requiredInputMessage("닉네임"), "error");
      return;
    }

    updateNickname(cleanNickname);
    setNicknameDraft(cleanNickname);
    setProfileNotice("닉네임을 저장했습니다.", "success");
  }

  function validatePasswordChangeFields() {
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      setPasswordNotice(requiredInputMessage("현재 비밀번호, 새 비밀번호, 비밀번호 확인"), "error");
      return false;
    }

    if (newPassword.length < 8) {
      setPasswordNotice(invalidInputMessage("새 비밀번호는 8자 이상이어야 합니다."), "error");
      return false;
    }

    if (newPassword !== newPasswordConfirm) {
      setPasswordNotice(invalidInputMessage("새 비밀번호와 확인 값이 일치하지 않습니다."), "error");
      return false;
    }

    if (currentPassword === newPassword) {
      setPasswordNotice(invalidInputMessage("새 비밀번호는 현재 비밀번호와 달라야 합니다."), "error");
      return false;
    }

    return true;
  }

  async function requestPasswordChange() {
    if (!validatePasswordChangeFields()) return;

    try {
      setPasswordChangeBusy(true);
      setPasswordNotice("현재 비밀번호를 확인하고 있습니다. 잠시만 기다려 주세요.");
      await onVerifyCurrentPassword(currentPassword);
      setPasswordNotice("현재 비밀번호가 확인되었습니다. 변경 확인 창에서 최종 확정하세요.");
      setPasswordDialogOpen(true);
    } catch (error) {
      setPasswordDialogOpen(false);
      setPasswordNotice(getFriendlyAuthMessage(error), "error");
    } finally {
      setPasswordChangeBusy(false);
    }
  }

  function closePasswordDialog() {
    if (passwordChangeBusy) return;
    setPasswordDialogOpen(false);
  }

  async function confirmPasswordChange() {
    if (!validatePasswordChangeFields()) {
      setPasswordDialogOpen(false);
      return;
    }

    try {
      setPasswordChangeBusy(true);
      setPasswordNotice("비밀번호를 변경하고 있습니다. 잠시만 기다려 주세요.");
      await onPasswordChange({
        currentPassword,
        newPassword
      });

      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordDialogOpen(false);
      setPasswordNotice("비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.", "success");
    } catch (error) {
      setPasswordNotice(getFriendlyAuthMessage(error), "error");
    } finally {
      setPasswordChangeBusy(false);
    }
  }

  function updateKiwoomCredential(field, value) {
    setKiwoomCredentials((current) => ({
      ...current,
      [executionMode]: {
        ...current[executionMode],
        [field]: value
      }
    }));
    setKiwoomNotice("실전과 모의 환경의 API 키를 각각 입력할 수 있습니다.");
  }

  async function connectKiwoom() {
    if (!activeKiwoomCredentials.appKey.trim() || !activeKiwoomCredentials.appSecret.trim()) {
      setKiwoomNotice(requiredInputMessage(`${activeKiwoomLabel} 앱 키와 앱 시크릿`), "error");
      return;
    }

    if (executionMode === "real") {
      setShowRealConnectWarning(true);
      return;
    }

    try {
      setKiwoomConnectionBusy(true);
      setKiwoomStatus((current) => ({ ...current, mock: "입력 확인됨" }));
      setKiwoomNotice("입력값을 백엔드로 전달하고 있습니다.");
      const status = await connectKiwoomCredentials({
        mode: "mock",
        appKey: activeKiwoomCredentials.appKey,
        appSecret: activeKiwoomCredentials.appSecret,
        accountNo: activeKiwoomCredentials.accountNo
      });
      setKiwoomBackendStatusByMode((current) => ({ ...current, mock: status }));
      setKiwoomStatus((current) => ({ ...current, mock: status.configured ? "브라우저 연결됨" : "입력 확인됨" }));
      const profileLoaded = await refreshKiwoomAccountProfile("mock", status).catch(() => false);
      setKiwoomNotice(profileLoaded ? "키움 모의 API 연결과 계좌 조회가 완료되었습니다." : getKiwoomBackendMessage(status), status.configured ? "success" : "warning");
    } catch (error) {
      setKiwoomStatus((current) => ({ ...current, mock: "미연결" }));
      setKiwoomBackendStatusByMode((current) => ({ ...current, mock: null }));
      setKiwoomNotice(error.message || "키움 모의 API 연결에 실패했습니다.", "error");
    } finally {
      setKiwoomConnectionBusy(false);
    }
  }

  async function confirmRealConnection() {
    setShowRealConnectWarning(false);

    try {
      setKiwoomConnectionBusy(true);
      setKiwoomStatus((current) => ({ ...current, real: "입력 확인됨" }));
      setKiwoomNotice("실전 입력값을 백엔드로 전달하고 있습니다.");
      const status = await connectKiwoomCredentials({
        mode: "real",
        appKey: activeKiwoomCredentials.appKey,
        appSecret: activeKiwoomCredentials.appSecret,
        accountNo: activeKiwoomCredentials.accountNo
      });
      setKiwoomBackendStatusByMode((current) => ({ ...current, real: status }));
      setKiwoomStatus((current) => ({ ...current, real: status.configured ? "브라우저 연결됨" : "입력 확인됨" }));
      const profileLoaded = await refreshKiwoomAccountProfile("real", status).catch(() => false);
      setKiwoomNotice(profileLoaded ? "키움 실전 API 연결과 계좌 조회가 완료되었습니다." : getKiwoomBackendMessage(status), status.configured ? "success" : "warning");
    } catch (error) {
      setKiwoomStatus((current) => ({ ...current, real: "미연결" }));
      setKiwoomBackendStatusByMode((current) => ({ ...current, real: null }));
      setKiwoomNotice(error.message || "키움 실전 API 연결에 실패했습니다.", "error");
    } finally {
      setKiwoomConnectionBusy(false);
    }
  }

  async function resetKiwoomConnection() {
    const mode = executionMode;
    const label = accountProfiles[mode].shortLabel;

    try {
      setKiwoomConnectionBusy(true);
      const status = await disconnectKiwoomCredentials(mode);
      setKiwoomCredentials((current) => ({ ...current, [mode]: { appKey: "", appSecret: "", accountNo: "" } }));
      setKiwoomBackendStatusByMode((current) => ({ ...current, [mode]: status }));
      setKiwoomStatus((current) => ({
        ...current,
        [mode]: status.configured
          ? status.credentialSource === "env" ? "백엔드 설정됨" : "연결됨"
          : "미연결"
      }));
      onAccountProfileLoaded?.(mode, null);
      setKiwoomNotice(
        status.configured
          ? `${label} 브라우저 입력 키를 해제했습니다. 백엔드 .env 설정이 남아 있어 연결 상태는 유지됩니다.`
          : `${label} API 연결을 해제했습니다. 키를 다시 입력해 주세요.`,
        status.configured ? "warning" : "success"
      );
    } catch (error) {
      setKiwoomNotice(error.message || `${label} API 연결 해제에 실패했습니다.`, "error");
    } finally {
      setKiwoomConnectionBusy(false);
    }
  }

  function requestExecutionMode(nextMode) {
    if (nextMode === executionMode) return;
    setPendingExecutionMode(nextMode);
  }

  function confirmExecutionModeChange() {
    if (!pendingExecutionMode) return;
    setExecutionMode(pendingExecutionMode);
    setKiwoomNotice(`${accountProfiles[pendingExecutionMode].shortLabel} 환경으로 전환했습니다. 해당 환경의 잔고, 보유 종목, 전략 목록이 적용됩니다.`);
    setPendingExecutionMode(null);
  }

  useEffect(() => {
    setNicknameDraft(nickname || "");
  }, [nickname]);

  useEffect(() => {
    let cancelled = false;

    getKiwoomStatus(executionMode)
      .then((status) => {
        if (cancelled) return;
        setKiwoomBackendStatusByMode((current) => ({ ...current, [executionMode]: status }));
        if (status.configured) {
          setKiwoomStatus((current) => ({
            ...current,
            [executionMode]: current[executionMode] === "미연결"
              ? status.credentialSource === "browser" ? "브라우저 연결됨" : "백엔드 설정됨"
              : current[executionMode]
          }));
          refreshKiwoomAccountProfile(executionMode, status).catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setKiwoomBackendStatusByMode((current) => ({ ...current, [executionMode]: null }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [executionMode]);

  return (
    <>
      <PageHeader
        title="설정"
        description="프로필, 화면 모드, 비밀번호, 키움증권 연결, 주문 실행 방식을 관리합니다."
        action={
          <button
            className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-label-caps text-label-caps hover:bg-surface-container-highest transition-colors"
            type="button"
            onClick={() => {
              setTheme("dark");
              setEmergencyEnabled(true);
              setOrderMode(DEFAULT_ORDER_MODE);
              setNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES });
              setProfileNotice("설정을 기본값으로 되돌렸습니다.", "success");
            }}
          >
            초기화
          </button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
        <Section className="xl:col-span-12 scroll-mt-16 section-scroll h-full" id="profile-security">
          <div className="p-widget-padding border-b border-outline-variant flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="text-primary">account_circle</Icon>
              <h3 className="font-headline-md text-headline-md text-on-surface">프로필 및 보안</h3>
            </div>
            <span className="font-label-mono text-label-mono text-secondary">활성</span>
          </div>
          <div className="p-widget-padding space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="text-primary">badge</Icon>
                <h4 className="font-title-sm text-title-sm text-on-surface">프로필 정보</h4>
              </div>
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="w-20 h-20 rounded-lg bg-primary-container flex items-center justify-center shrink-0">
                <Icon className="text-[36px] text-on-primary-container">person</Icon>
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-gutter">
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">닉네임</span>
                  <input
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
                    type="text"
                    value={nicknameDraft}
                    onChange={(event) => {
                      setNicknameDraft(event.target.value);
                      setProfileNotice("닉네임을 입력한 뒤 프로필 저장을 누르세요.");
                    }}
                  />
                </label>
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">프로필 사진</span>
                  <input className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-sm text-body-sm text-on-surface file:mr-3 file:border-0 file:bg-surface-container-high file:text-primary file:font-label-caps" type="file" accept="image/*" />
                </label>
                <button
                  className="self-end h-10 w-full rounded bg-primary-container px-4 py-2 font-title-sm text-title-sm text-on-primary-container hover:brightness-110 transition-all disabled:cursor-not-allowed disabled:opacity-50 md:w-[136px]"
                  type="button"
                  onClick={saveNicknameDraft}
                >
                  프로필 저장
                </button>
              </div>
              </div>
              <p className={`font-body-sm text-body-sm ${profileMessageClass}`}>{profileMessage}</p>
            </div>
            <div className="space-y-3 border-t border-outline-variant pt-5">
              <div className="flex items-center gap-2">
                <Icon className="text-primary">lock</Icon>
                <h4 className="font-title-sm text-title-sm text-on-surface">비밀번호</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-gutter">
                <PasswordField
                  label="현재 비밀번호"
                  placeholder="현재 비밀번호"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={passwordChangeBusy}
                />
                <PasswordField
                  label="새 비밀번호"
                  placeholder="8자 이상"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={passwordChangeBusy}
                />
                <PasswordField
                  label="새 비밀번호 확인"
                  placeholder="다시 입력"
                  value={newPasswordConfirm}
                  onChange={(event) => setNewPasswordConfirm(event.target.value)}
                  autoComplete="new-password"
                  disabled={passwordChangeBusy}
                />
                <button
                  className="self-end h-10 w-full rounded bg-primary-container px-4 py-2 font-title-sm text-title-sm text-on-primary-container hover:brightness-110 transition-all disabled:cursor-not-allowed disabled:opacity-50 md:w-[136px]"
                  type="button"
                  disabled={passwordChangeBusy}
                  onClick={requestPasswordChange}
                >
                  비밀번호 변경
                </button>
              </div>
              <p className={`font-body-sm text-body-sm ${passwordMessageClass}`}>{passwordMessage}</p>
            </div>
          </div>
        </Section>

        <div className="xl:col-span-5 flex flex-col gap-gutter">
          <Section>
            <SectionTitle icon="contrast" title="화면 모드" />
            <div className="p-widget-padding grid grid-cols-1 sm:grid-cols-2 gap-gutter">
              {[
                ["dark", "dark_mode", "블랙 모드", "저조도 화면"],
                ["light", "light_mode", "화이트 모드", "밝은 화면"]
              ].map(([value, icon, title, meta]) => (
                <button
                  className="theme-choice rounded-lg border border-outline-variant bg-surface-container-low p-4 text-left hover:bg-surface-container-highest transition-colors"
                  data-active={String(theme === value)}
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                >
                  <Icon className="text-primary text-[24px]">{icon}</Icon>
                  <span className="theme-choice-title block font-title-sm text-title-sm text-on-surface mt-2">{title}</span>
                  <span className="theme-choice-meta block font-body-sm text-body-sm text-on-surface-variant mt-1">{meta}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section className="section-scroll-sm">
            <SectionTitle icon="bolt" title="기본 주문 실행 방식" />
            <div className="p-widget-padding space-y-3">
              {[
                ["승인 후 주문", "fact_check", "신호 확인 후 사용자가 승인하면 주문을 실행합니다."],
                ["자동 주문", "rocket_launch", "조건이 충족되면 시스템이 즉시 주문을 실행합니다."]
              ].map(([mode, icon, desc]) => {
                const active = orderMode === mode;
                return (
                  <button className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${active ? "border-primary/50 bg-primary/5" : "border-outline-variant hover:bg-surface-container-highest"}`} key={mode} type="button" onClick={() => changeDefaultOrderMode(mode)}>
                    <span className="flex items-start gap-3 text-left">
                      <Icon className={active ? "text-primary" : "text-on-surface-variant"}>{icon}</Icon>
                      <span>
                        <span className={`block font-title-sm text-title-sm ${active ? "text-primary" : "text-on-surface"}`}>{mode}</span>
                        <span className={`block font-body-sm text-body-sm mt-1 ${active ? "text-primary/80" : "text-on-surface-variant"}`}>{desc}</span>
                      </span>
                    </span>
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? "border-primary" : "border-outline"}`}>
                      {active ? <span className="w-2.5 h-2.5 rounded-full bg-primary" /> : null}
                    </span>
                  </button>
                );
              })}
              <div className="rounded border border-outline-variant bg-surface-container-low p-3">
                <span className="block font-label-caps text-label-caps text-on-surface-variant">자동 주문 전환 체크리스트</span>
                <div className="mt-2 space-y-2">
                  {autoOrderChecklistItems.map(([key, label]) => (
                    <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant" key={key}>
                      <input
                        className="rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary"
                        type="checkbox"
                        checked={autoOrderChecks[key]}
                        onChange={(event) => {
                          setAutoOrderChecks((current) => ({ ...current, [key]: event.target.checked }));
                          setOrderModeMessage("자동 주문 전환 전 체크리스트를 확인하세요.");
                          setOrderModeMessageTone("neutral");
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className={`font-body-sm text-body-sm ${orderModeMessageClass}`}>{orderModeMessage}</p>
            </div>
          </Section>

          <Section className="section-scroll-sm border-error/30">
            <div className="p-widget-padding border-b border-error/20 flex items-center gap-2">
              <Icon className="text-error">warning</Icon>
              <h3 className="font-headline-md text-headline-md text-error">긴급 중지 설정</h3>
            </div>
            <div className="p-widget-padding space-y-4">
              <p className="font-body-sm text-body-sm text-on-surface-variant">이 옵션이 켜져 있을 때만 사이드바의 긴급 중지 버튼을 사용할 수 있습니다.</p>
              <label className="flex items-center justify-between gap-4 p-3 rounded bg-error/10 border border-error/20">
                <span>
                  <span className="block font-title-sm text-title-sm text-on-error-container">긴급 중지 버튼 활성화</span>
                  <span className="block font-body-sm text-body-sm text-on-error-container/80 mt-1">미체결 주문 취소와 자동 주문 중단 기능을 사용할 수 있게 합니다.</span>
                </span>
                <input className="rounded bg-surface-container-lowest border-error/40 text-error focus:ring-error" type="checkbox" checked={emergencyEnabled} onChange={(event) => setEmergencyEnabled(event.target.checked)} />
              </label>
              <div className="flex items-center justify-between bg-surface-container-low rounded border border-outline-variant p-3">
                <span className="font-body-sm text-body-sm text-on-surface-variant">현재 상태</span>
                <span className="font-label-mono text-label-mono text-error">{emergencyEnabled ? "활성화됨" : "비활성화됨"}</span>
              </div>
            </div>
          </Section>
        </div>

        <div className="xl:col-span-7 flex flex-col gap-gutter">
          <Section>
            <div className="p-widget-padding border-b border-outline-variant flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="text-primary">api</Icon>
                <h3 className="font-headline-md text-headline-md text-on-surface">키움증권 API 연결</h3>
              </div>
              <div className={`flex items-center gap-2 px-2 py-1 rounded ${isKiwoomReady ? "bg-secondary/10 text-secondary" : "bg-surface-container-high text-on-surface-variant"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isKiwoomReady ? "bg-secondary" : "bg-outline"}`} />
                <span className="font-label-caps text-label-caps">{activeKiwoomLabel} {activeKiwoomStatus}</span>
              </div>
            </div>
            <div className="p-widget-padding space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
                <div>
                  <span className="font-label-caps text-label-caps text-on-surface-variant">증권사</span>
                  <div className="mt-1 flex items-center justify-between bg-surface-container-lowest border border-outline-variant rounded px-3 py-2">
                    <span className="font-body-md text-body-md text-on-surface">키움증권</span>
                    <span className="font-label-mono text-label-mono text-secondary">고정</span>
                  </div>
                </div>
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">실행 환경</span>
                  <div className="mt-1 flex bg-surface-container-lowest border border-outline-variant rounded p-1">
                    {[
                      ["real", "실전"],
                      ["mock", "모의"]
                    ].map(([env, label]) => {
                      const active = executionMode === env;
                      return (
                        <button
                          className={`flex-1 py-1.5 rounded font-label-mono text-label-mono transition-colors ${active ? "bg-surface-container-highest text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                          key={env}
                          type="button"
                          onClick={() => requestExecutionMode(env)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">{activeKiwoomLabel} 앱 키</span>
                  <input
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-label-mono text-label-mono text-on-surface"
                    placeholder={`${activeKiwoomLabel} 앱 키 입력`}
                    type="password"
                    value={activeKiwoomCredentials.appKey}
                    onChange={(event) => updateKiwoomCredential("appKey", event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">{activeKiwoomLabel} 앱 시크릿</span>
                  <input
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-label-mono text-label-mono text-on-surface"
                    placeholder={`${activeKiwoomLabel} 앱 시크릿 입력`}
                    type="password"
                    value={activeKiwoomCredentials.appSecret}
                    onChange={(event) => updateKiwoomCredential("appSecret", event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">{activeKiwoomLabel} 계좌번호</span>
                  <input
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-label-mono text-label-mono text-on-surface"
                    placeholder={`${activeKiwoomLabel} 계좌번호 입력`}
                    type="text"
                    value={activeKiwoomCredentials.accountNo}
                    onChange={(event) => updateKiwoomCredential("accountNo", event.target.value)}
                  />
                </label>
              </div>
              <p className={`font-body-sm text-body-sm ${kiwoomMessageClass}`}>
                {kiwoomMessage}
              </p>
              <div className="flex flex-col sm:flex-row gap-gutter">
                <button
                  className="flex-1 py-2 rounded bg-primary-container text-on-primary-container font-title-sm text-title-sm hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  disabled={kiwoomConnectionBusy}
                  onClick={connectKiwoom}
                >
                  <Icon className="text-[16px]">link</Icon>
                  {kiwoomConnectionBusy ? "확인 중" : "연결"}
                </button>
                <button
                  className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-title-sm text-title-sm hover:bg-surface-container-highest"
                  type="button"
                  disabled={kiwoomConnectionBusy}
                  onClickCapture={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    resetKiwoomConnection();
                  }}
                  onClick={(event) => {
                    if (event.defaultPrevented) return;
                    setKiwoomCredentials((current) => ({ ...current, [executionMode]: { appKey: "", appSecret: "", accountNo: "" } }));
                    setKiwoomStatus((current) => ({ ...current, [executionMode]: "미연결" }));
                    setKiwoomBackendStatusByMode((current) => ({ ...current, [executionMode]: null }));
                    onAccountProfileLoaded?.(executionMode, null);
                    setKiwoomNotice(`${activeKiwoomLabel} API 키를 다시 입력합니다.`);
                  }}
                >
                  키 다시 입력
                </button>
              </div>
            </div>
          </Section>

          <Section className="section-scroll flex flex-1 flex-col">
            <SectionTitle icon="notifications" title="알림" meta="설정" tone="text-secondary" />
            <div className="flex-1 divide-y divide-outline-variant flex flex-col">
              {[
                ["orderFills", "주문 체결 알림", "매수와 매도 체결 결과를 알려줍니다."],
                ["strategyStatus", "전략 상태 알림", "전략이 시작되거나 중지될 때 알려줍니다."],
                ["systemHealth", "시스템 점검 알림", "API 연결, 데이터 수신 상태 변화를 알려줍니다."]
              ].map(([key, title, desc]) => (
                <label className="flex flex-1 items-center justify-between gap-3 p-widget-padding" key={title}>
                  <span>
                    <span className="block font-title-sm text-title-sm text-on-surface">{title}</span>
                    <span className="block font-body-sm text-body-sm text-on-surface-variant mt-1">{desc}</span>
                  </span>
                  <input
                    className="rounded bg-surface-container-lowest border-outline-variant text-primary focus:ring-primary"
                    type="checkbox"
                    checked={notificationPreferences[key] !== false}
                    onChange={(event) =>
                      setNotificationPreferences((current) => ({
                        ...current,
                        [key]: event.target.checked
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </Section>
        </div>
      </div>
      {passwordDialogOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[520px] overflow-hidden rounded-lg border border-primary/30 bg-surface-container">
            <div className="p-widget-padding border-b border-outline-variant flex items-center gap-2">
              <Icon className="text-primary">lock_reset</Icon>
              <h3 className="font-headline-md text-headline-md text-on-surface">비밀번호 변경 확인</h3>
            </div>
            <div className="p-widget-padding space-y-4">
              <p className="font-body-md text-body-md text-on-surface-variant">
                Supabase Auth 계정의 비밀번호를 새 비밀번호로 변경합니다. 변경 후 다음 로그인부터 새 비밀번호를 사용해야 합니다.
              </p>
              <div className="rounded border border-primary/20 bg-primary/10 p-3">
                <span className="block font-label-caps text-label-caps text-primary">보안 확인</span>
                <span className="mt-1 block font-body-sm text-body-sm text-on-surface-variant">
                  현재 비밀번호가 맞는지 확인한 뒤 비밀번호 변경을 적용합니다.
                </span>
              </div>
              <div className="flex flex-col-reverse gap-gutter sm:flex-row sm:justify-end">
                <button
                  className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-label-caps text-label-caps hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  disabled={passwordChangeBusy}
                  onClick={closePasswordDialog}
                >
                  취소
                </button>
                <button
                  className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-label-caps text-label-caps hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  disabled={passwordChangeBusy}
                  onClick={confirmPasswordChange}
                >
                  {passwordChangeBusy ? "변경 중..." : "비밀번호 변경"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {pendingExecutionMode ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[560px] overflow-hidden rounded-lg border border-primary/30 bg-surface-container">
            <div className="p-widget-padding border-b border-outline-variant flex items-center gap-2">
              <Icon className="text-primary">sync_alt</Icon>
              <h3 className="font-headline-md text-headline-md text-on-surface">실행 환경 전환 확인</h3>
            </div>
            <div className="p-widget-padding space-y-4">
              <p className="font-body-md text-body-md text-on-surface-variant">
                {pendingExecutionLabel} 투자 모드로 전환하면 계좌 잔고, 주문 가능 금액, 보유 종목, 전략 목록이 해당 모드 기준으로 바뀝니다.
              </p>
              <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2">
                <div className="rounded border border-outline-variant bg-surface-container-low p-3">
                  <span className="block font-label-caps text-label-caps text-on-surface-variant">유지됨</span>
                  <span className="mt-1 block font-title-sm text-title-sm text-on-surface">관심 종목과 관심 그룹</span>
                </div>
                <div className="rounded border border-outline-variant bg-surface-container-low p-3">
                  <span className="block font-label-caps text-label-caps text-on-surface-variant">모드별 분리</span>
                  <span className="mt-1 block font-title-sm text-title-sm text-on-surface">잔고, 보유 종목, 전략</span>
                </div>
              </div>
              <div className="rounded border border-primary/20 bg-primary/10 p-3">
                <span className="block font-label-caps text-label-caps text-primary">전략 가져오기</span>
                <span className="mt-1 block font-body-sm text-body-sm text-on-surface-variant">
                  다른 모드의 전략은 전략 관리 화면의 가져오기 버튼으로 불러올 수 있으며, 가져온 전략은 중지 상태로 추가됩니다.
                </span>
              </div>
              <div className="flex flex-col-reverse gap-gutter sm:flex-row sm:justify-end">
                <button
                  className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-label-caps text-label-caps hover:bg-surface-container-highest"
                  type="button"
                  onClick={() => setPendingExecutionMode(null)}
                >
                  취소
                </button>
                <button
                  className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-label-caps text-label-caps hover:brightness-110"
                  type="button"
                  onClick={confirmExecutionModeChange}
                >
                  {pendingExecutionLabel} 모드로 전환
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showRealConnectWarning ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[520px] overflow-hidden rounded-lg border border-error/30 bg-surface-container">
            <div className="p-widget-padding border-b border-error/20 flex items-center gap-2">
              <Icon className="text-error">warning</Icon>
              <h3 className="font-headline-md text-headline-md text-error">실전 환경 연결 확인</h3>
            </div>
            <div className="p-widget-padding space-y-4">
              <p className="font-body-md text-body-md text-on-surface-variant">
                실전 환경으로 연결하면 실제 계좌와 주문 가능 환경에 접근할 수 있습니다. 자동 주문 또는 주문 승인 설정을 다시 확인한 뒤 연결하세요.
              </p>
              <div className="rounded border border-error/20 bg-error/10 p-3">
                <span className="block font-label-caps text-label-caps text-error">현재 선택</span>
                <span className="block font-title-sm text-title-sm text-on-error-container mt-1">키움증권 실전 API</span>
              </div>
              <div className="flex flex-col-reverse gap-gutter sm:flex-row sm:justify-end">
                <button
                  className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-label-caps text-label-caps hover:bg-surface-container-highest"
                  type="button"
                  onClick={() => setShowRealConnectWarning(false)}
                >
                  취소
                </button>
                <button
                  className="px-4 py-2 rounded bg-error-container text-on-error-container font-label-caps text-label-caps hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  disabled={kiwoomConnectionBusy}
                  onClick={confirmRealConnection}
                >
                  {kiwoomConnectionBusy ? "확인 중" : "실전으로 연결"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PasswordField({ label, placeholder, value, onChange, autoComplete, disabled = false }) {
  return (
    <label className="block">
      <span className="font-label-caps text-label-caps text-on-surface-variant">{label}</span>
      <input
        className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-label-mono text-label-mono text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
        type="password"
        placeholder={placeholder}
        value={value || ""}
        onChange={onChange}
        autoComplete={autoComplete}
        disabled={disabled}
      />
    </label>
  );
}

function formatPinRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getFriendlyAuthMessage(error) {
  const message = error?.message || String(error || "");

  if (message.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (message.includes("Email not confirmed")) return "이메일 인증을 먼저 완료하세요.";
  if (message.includes("User already registered")) return "이미 가입된 이메일입니다.";
  if (message.includes("Password should be at least")) return "비밀번호는 최소 6자 이상이어야 합니다.";
  if (message.includes("Supabase 환경변수")) return message;

  return message || "인증 요청을 처리하지 못했습니다.";
}

function LoginPage({ isSupabaseReady, onPasswordReset, onSignIn, onSignUp }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function selectMode(nextMode) {
    setMode(nextMode);
    setFormMessage("");
  }

  function updatePinInput(nextPin) {
    setPin(nextPin.replace(/\D/g, "").slice(0, 4));
  }

  async function submitAuth() {
    setFormMessage("");

    if (!isSupabaseReady) {
      setFormMessage("frontend/.env.local에 Supabase Project URL과 Publishable key를 먼저 입력하세요.");
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setFormMessage(requiredInputMessage("이메일"));
      return;
    }

    if (mode === "reset") {
      try {
        setIsSubmitting(true);
        await onPasswordReset(cleanEmail);
        setFormMessage("비밀번호 재설정 메일을 보냈습니다.");
      } catch (error) {
        setFormMessage(getFriendlyAuthMessage(error));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!password) {
      setFormMessage(requiredInputMessage("비밀번호"));
      return;
    }

    if (mode === "signup" && !nickname.trim()) {
      setFormMessage(requiredInputMessage("닉네임"));
      return;
    }

    if (mode === "signup" && !passwordConfirm) {
      setFormMessage(requiredInputMessage("비밀번호 확인"));
      return;
    }

    if (mode === "signup" && password !== passwordConfirm) {
      setFormMessage(invalidInputMessage("비밀번호와 비밀번호 확인 값이 일치하지 않습니다."));
      return;
    }

    if (mode === "signup" && pin.length !== 4) {
      setFormMessage(invalidInputMessage("핀번호는 숫자 4자리로 입력해야 합니다."));
      return;
    }

    try {
      setIsSubmitting(true);

      if (mode === "signup") {
        const result = await onSignUp({
          email: cleanEmail,
          password,
          nickname,
          pin
        });

        if (result?.needsEmailConfirmation) {
          setFormMessage("가입 확인 메일을 보냈습니다. 이메일 인증 후 로그인하세요.");
        }
        return;
      }

      await onSignIn(cleanEmail, password);
    } catch (error) {
      setFormMessage(getFriendlyAuthMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-6 font-body-md text-body-md">
      <section className="w-full max-w-[500px] bg-surface-container border border-outline-variant rounded-lg overflow-hidden">
        <div className="p-7 border-b border-outline-variant">
          <h1 className="font-display text-display text-primary uppercase">AeroTrade</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">Supabase 인증 연결을 고려한 로그인 화면입니다.</p>
        </div>
        <div className="p-7 space-y-5">
          <div className="grid grid-cols-2 gap-gutter">
            <button className={`py-3 rounded border font-label-caps text-label-caps ${mode === "login" ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant"}`} type="button" onClick={() => selectMode("login")}>로그인</button>
            <button className={`py-3 rounded border font-label-caps text-label-caps ${mode === "signup" ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant"}`} type="button" onClick={() => selectMode("signup")}>회원가입</button>
          </div>

          {!isSupabaseReady ? (
            <p className="rounded border border-tertiary/30 bg-tertiary/10 p-3 font-body-sm text-body-sm text-tertiary">
              Supabase 환경변수를 설정하면 로그인과 회원가입을 사용할 수 있습니다.
            </p>
          ) : null}

          <label className="block">
            <span className="font-label-caps text-label-caps text-on-surface-variant">이메일</span>
            <input
              className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          {mode !== "reset" ? (
            <PasswordField label="비밀번호" placeholder="비밀번호" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          ) : null}

          {mode === "signup" ? (
            <>
              <PasswordField label="비밀번호 확인" placeholder="다시 입력" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" />
              <label className="block">
                <span className="font-label-caps text-label-caps text-on-surface-variant">닉네임</span>
                <input
                  className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
                  placeholder="상단바에 표시할 이름"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={20}
                  autoComplete="nickname"
                />
              </label>
              <label className="block">
                <span className="font-label-caps text-label-caps text-on-surface-variant">핀번호</span>
                <input
                  className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-label-mono text-label-mono text-on-surface"
                  placeholder="숫자 4자리"
                  value={pin}
                  onChange={(event) => updatePinInput(event.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  autoComplete="off"
                />
              </label>
            </>
          ) : null}

          {formMessage ? <p className="font-body-sm text-body-sm text-error">{formMessage}</p> : null}

          <button
            className="w-full py-4 rounded bg-primary-container text-on-primary-container font-title-sm text-title-sm font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={isSubmitting || !isSupabaseReady}
            onClick={submitAuth}
          >
            {isSubmitting ? "처리 중..." : mode === "reset" ? "재설정 메일 보내기" : mode === "signup" ? "회원가입" : "로그인"}
          </button>

          {mode === "login" ? (
            <button className="w-full text-center font-body-sm text-body-sm text-on-surface-variant hover:text-primary" type="button" onClick={() => selectMode("reset")}>
              비밀번호를 잊으셨나요?
            </button>
          ) : null}

          {mode === "reset" ? (
            <div className="bg-surface-container-low rounded border border-outline-variant p-4">
              <h2 className="font-headline-md text-headline-md text-on-surface">비밀번호 재설정</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">입력한 이메일로 Supabase Auth 재설정 링크를 발송합니다.</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default App;
