import React, { useEffect, useMemo, useState } from "react";

const THEME_KEY = "aerotrade.theme";
const NICKNAME_KEY = "aerotrade.nickname";
const EXECUTION_MODE_KEY = "aerotrade.executionMode";
const AUTH_SESSION_KEY = "aerotrade.authSession";
const FAVORITE_GROUPS_KEY = "aerotrade.favoriteGroups";

const validPages = ["dashboard", "market", "strategy", "backtest", "record", "setting", "login"];

const navItems = [
  { page: "dashboard", label: "대시보드", icon: "dashboard" },
  { page: "market", label: "시장", icon: "monitoring" },
  { page: "strategy", label: "전략 관리", icon: "psychology" },
  { page: "backtest", label: "백테스트", icon: "science" },
  { page: "record", label: "기록 및 알림", icon: "history" },
  { page: "setting", label: "설정", icon: "settings" }
];

const stocks = [
  {
    code: "005930",
    name: "삼성전자",
    market: "KOSPI",
    price: "84,200",
    change: "+1.08%",
    value: "12,480억",
    volume: "18,421,903",
    sector: "반도체",
    high: "85,100",
    low: "83,300",
    current: "84,200",
    marketCap: "502.6조",
    per: "17.8",
    pbr: "1.42",
    roe: "8.4%",
    rsi: "58.6",
    macd: "상승 전환",
    ma20: "82,900",
    foreign: "+1,248억",
    institution: "+642억",
    summary: "외국인과 기관 수급이 동시에 개선되며 20일 이동평균 위에서 거래되고 있습니다. 단기 과열은 제한적이지만, 85,000원 부근 저항 돌파 여부가 중요합니다."
  },
  {
    code: "000660",
    name: "SK하이닉스",
    market: "KOSPI",
    price: "216,500",
    change: "+2.12%",
    value: "9,730억",
    volume: "5,284,112",
    sector: "반도체",
    high: "219,000",
    low: "211,000",
    current: "216,500",
    marketCap: "157.6조",
    per: "22.1",
    pbr: "1.88",
    roe: "9.7%",
    rsi: "62.1",
    macd: "매수 우위",
    ma20: "208,400",
    foreign: "+982억",
    institution: "+516억",
    summary: "HBM 기대감과 거래대금 증가가 함께 나타나고 있습니다. 상승 탄력은 좋지만 직전 고점 부근 분할 진입이 안정적입니다."
  },
  {
    code: "035420",
    name: "NAVER",
    market: "KOSPI",
    price: "188,700",
    change: "-0.47%",
    value: "1,240억",
    volume: "921,430",
    sector: "인터넷",
    high: "191,800",
    low: "186,900",
    current: "188,700",
    marketCap: "30.1조",
    per: "19.4",
    pbr: "1.10",
    roe: "6.2%",
    rsi: "44.3",
    macd: "중립",
    ma20: "190,200",
    foreign: "-72억",
    institution: "+41억",
    summary: "거래량이 줄어든 박스권 흐름입니다. 190,000원 회복 전까지는 관망 또는 짧은 손절 기준이 필요합니다."
  },
  {
    code: "035720",
    name: "카카오",
    market: "KOSPI",
    price: "45,850",
    change: "-1.18%",
    value: "864억",
    volume: "2,514,309",
    sector: "플랫폼",
    high: "46,700",
    low: "45,350",
    current: "45,850",
    marketCap: "20.4조",
    per: "31.2",
    pbr: "1.54",
    roe: "4.5%",
    rsi: "39.8",
    macd: "매도 우위",
    ma20: "47,100",
    foreign: "-118억",
    institution: "-24억",
    summary: "단기 추세는 약하지만 낙폭 과대 구간에 가까워지고 있습니다. 추세 전환 확인 전에는 비중 확대를 서두르기 어렵습니다."
  },
  {
    code: "373220",
    name: "LG에너지솔루션",
    market: "KOSPI",
    price: "356,000",
    change: "+0.71%",
    value: "2,044억",
    volume: "612,818",
    sector: "2차전지",
    high: "361,000",
    low: "351,500",
    current: "356,000",
    marketCap: "83.3조",
    per: "64.8",
    pbr: "4.32",
    roe: "5.8%",
    rsi: "51.9",
    macd: "중립",
    ma20: "352,700",
    foreign: "+83억",
    institution: "-39억",
    summary: "20일선 위에서 반등을 시도하고 있습니다. 업종 수급이 약한 편이라 거래대금 동반 여부를 확인하는 편이 좋습니다."
  }
];

const initialGroups = {
  "핵심 관심": ["005930", "000660"],
  "단기 관찰": ["035420", "373220"]
};

const ORDERABLE_CASH = 5000000;
const OPEN_ORDER_STATUSES = ["접수", "부분 체결"];

const holdingQuantities = {
  "005930": 42,
  "000660": 12,
  "035420": 8,
  "035720": 0,
  "373220": 5
};

const accountProfiles = {
  real: {
    label: "실전 투자 모드",
    shortLabel: "실전",
    orderableCash: 5000000,
    holdings: holdingQuantities,
    dashboardCards: [
      ["총 자산", "124,820,000원", "+1.82%", "secondary"],
      ["오늘 실현손익", "+842,000원", "체결 반영", "secondary"],
      ["주문 가능 현금", "5,000,000원", "즉시 주문", "primary"],
      ["주식 평가액", "119,820,000원", "8개 종목", "secondary"]
    ],
    riskBars: [
      ["일중 손실 한도", "38%", "bg-secondary"],
      ["주문 대기 금액", "24%", "bg-primary"],
      ["전략 집중도", "51%", "bg-tertiary"]
    ]
  },
  mock: {
    label: "모의 투자 모드",
    shortLabel: "모의",
    orderableCash: 20000000,
    holdings: {
      "005930": 120,
      "000660": 30,
      "035420": 14,
      "035720": 80,
      "373220": 10
    },
    dashboardCards: [
      ["총 자산", "52,430,000원", "+4.36%", "secondary"],
      ["오늘 실현손익", "+214,000원", "모의 체결", "secondary"],
      ["주문 가능 현금", "20,000,000원", "즉시 주문", "primary"],
      ["주식 평가액", "32,430,000원", "12개 종목", "secondary"]
    ],
    riskBars: [
      ["일중 손실 한도", "57%", "bg-tertiary"],
      ["주문 대기 금액", "31%", "bg-primary"],
      ["전략 집중도", "44%", "bg-secondary"]
    ]
  }
};

const initialMarketOrders = [
  {
    id: 1004,
    time: "14:58:12",
    code: "005930",
    name: "삼성전자",
    side: "매수",
    orderType: "지정가",
    price: "84,100",
    quantity: 20,
    filledQuantity: 0,
    status: "접수"
  },
  {
    id: 1003,
    time: "14:44:30",
    code: "000660",
    name: "SK하이닉스",
    side: "매도",
    orderType: "지정가",
    price: "216,500",
    quantity: 6,
    filledQuantity: 2,
    status: "부분 체결"
  },
  {
    id: 1002,
    time: "13:12:09",
    code: "005930",
    name: "삼성전자",
    side: "매수",
    orderType: "현재가",
    price: "84,200",
    quantity: 10,
    filledQuantity: 10,
    status: "체결"
  },
  {
    id: 1001,
    time: "10:22:41",
    code: "035420",
    name: "NAVER",
    side: "매수",
    orderType: "지정가",
    price: "187,500",
    quantity: 4,
    filledQuantity: 0,
    status: "취소"
  }
];

const marketOrdersByModeSeed = {
  real: initialMarketOrders,
  mock: initialMarketOrders.map((order) => ({
    ...order,
    id: order.id + 2000,
    status: order.status === "체결" ? "체결" : order.status === "취소" ? "취소" : "접수"
  }))
};

const conditionIndicatorOptions = [
  "이동평균선",
  "MACD",
  "체결강도",
  "거래량 증가율",
  "RSI",
  "현재가",
  "외국인 순매수",
  "기관 순매수",
  "거래대금",
  "손절률",
  "수익률",
  "거래량 감소율"
];

const conditionOperatorOptions = ["이상", "이하", "상향 돌파", "하향 이탈"];

function createEmptyCondition(side = "buy") {
  return side === "sell" ? ["손절률", "이하", "-3"] : ["이동평균선", "상향 돌파", "20일선"];
}

function cloneStrategyConditions(conditions, side = "buy") {
  const source = Array.isArray(conditions) && conditions.length ? conditions : [createEmptyCondition(side)];
  return source.map(([indicator, operator, value]) => [
    indicator || createEmptyCondition(side)[0],
    operator || createEmptyCondition(side)[1],
    value || createEmptyCondition(side)[2]
  ]);
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
    return {
      ...fallback,
      ...stage,
      id: stage.id || fallback.id,
      allocation: String(stage.allocation ?? fallback.allocation),
      triggerType: isPrimary ? "conditions" : "percent",
      triggerOperator: isPrimary ? "충족" : stage.triggerOperator || fallback.triggerOperator,
      triggerValue: isPrimary ? "" : String(stage.triggerValue ?? fallback.triggerValue),
      conditions: isPrimary ? cloneStrategyConditions(stage.conditions || strategy?.[conditionKey], side) : []
    };
  });
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

const strategiesSeed = [
  {
    id: 1,
    name: "시가 돌파 전략",
    status: "활성",
    orderMode: "승인 후 주문",
    scope: "개별 종목",
    target: "삼성전자 외 2개",
    targetStocks: ["005930", "000660", "035420"],
    returnRate: "+8.7%",
    winRate: "62%",
    description: "장 초반 거래량과 돌파 조건을 함께 확인합니다.",
    buyConditions: defaultBuyConditions,
    sellConditions: defaultSellConditions
  },
  {
    id: 2,
    name: "종가 회귀 전략",
    status: "중지",
    orderMode: "자동 주문",
    scope: "종목 그룹",
    target: "단기 관찰",
    returnRate: "+3.1%",
    winRate: "55%",
    description: "과매도 후 종가 회복 패턴을 기준으로 진입합니다.",
    buyConditions: [
      ["RSI", "이하", "35"],
      ["현재가", "상향 돌파", "5일선"],
      ["거래량 증가율", "이상", "90"],
      ["체결강도", "이상", "105"]
    ],
    sellConditions: [
      ["수익률", "이상", "4"],
      ["손절률", "이하", "-2"],
      ["현재가", "하향 이탈", "5일선"],
      ["RSI", "이상", "62"]
    ]
  },
  {
    id: 3,
    name: "수급 추적 전략",
    status: "활성",
    orderMode: "승인 후 주문",
    scope: "전체 종목",
    target: "전체 종목",
    returnRate: "+5.4%",
    winRate: "59%",
    description: "기관과 외국인 순매수 흐름을 추적합니다.",
    buyConditions: [
      ["외국인 순매수", "이상", "80억"],
      ["기관 순매수", "이상", "40억"],
      ["거래대금", "이상", "500억"],
      ["MACD", "상향 돌파", "시그널"]
    ],
    sellConditions: [
      ["외국인 순매수", "이하", "-30억"],
      ["기관 순매수", "이하", "-20억"],
      ["수익률", "이상", "7"],
      ["손절률", "이하", "-3.5"]
    ]
  }
];

const strategiesByModeSeed = {
  real: strategiesSeed,
  mock: [
    {
      ...strategiesSeed[0],
      id: 101,
      status: "중지",
      returnRate: "+4.2%",
      winRate: "58%",
      description: "모의 계좌에서 장 초반 돌파 조건을 낮은 주문 한도로 검증합니다."
    },
    {
      ...strategiesSeed[2],
      id: 102,
      status: "활성",
      returnRate: "+9.8%",
      winRate: "66%",
      description: "모의 계좌 기준으로 수급 조건과 분할 진입 규칙을 테스트합니다."
    }
  ]
};

const recordRows = [
  ["2026-06-21 14:58:12", "주문", "시가 돌파 전략", "매수 주문 3건 체결, 평균 체결가 반영 완료", "완료"],
  ["2026-06-21 13:42:07", "전략", "수급 추적 전략", "기관 순매수 조건 충족, 다음 체결 신호 대기", "대기"],
  ["2026-06-20 15:21:44", "리스크", "종가 회귀 전략", "일중 손실 한도 도달, 신규 주문 차단", "중지"],
  ["2026-06-20 08:50:00", "시스템", "시스템", "한국거래소 장 시작 전 계좌 및 주문 권한 확인 완료", "완료"],
  ["2026-06-19 15:05:36", "주문", "시가 돌파 전략", "장 마감 전 보유 수량 일부 청산 완료", "완료"],
  ["2026-06-18 10:12:18", "시스템", "수급 추적 전략", "데이터 수신 지연 2회 감지, 자동 재연결 완료", "확인 필요"],
  ["2026-06-17 09:03:25", "전략", "종가 회귀 전략", "장 시작 후 변동성 조건 확인, 전략 활성화", "완료"]
];

const alerts = [
  ["warning", "text-error", "종가 회귀 전략 주문 차단", "일중 손실 한도에 도달해 신규 주문이 중지되었습니다.", "2026-06-20 15:21"],
  ["sync_problem", "text-tertiary", "데이터 수신 지연 감지", "시세 데이터 지연이 감지되었고 자동 재연결을 완료했습니다.", "2026-06-18 10:12"],
  ["check_circle", "text-secondary", "장 시작 전 점검 완료", "계좌 권한, 주문 권한, 키움증권 연결 상태를 확인했습니다.", "2026-06-20 08:50"],
  ["campaign", "text-primary", "신규 매수 신호", "삼성전자와 SK하이닉스에서 매수 후보 신호가 발생했습니다.", "2026-06-21 09:12"]
];

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

function SectionTitle({ icon, title, meta, tone = "text-primary" }) {
  return (
    <div className="p-widget-padding border-b border-outline-variant flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon ? <Icon className={tone}>{icon}</Icon> : null}
        <h3 className="font-headline-md text-headline-md text-on-surface">{title}</h3>
      </div>
      {meta ? <span className="font-label-mono text-label-mono text-secondary">{meta}</span> : null}
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

function getKoreanOrderTime() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
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

function shiftDateString(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getInitialBacktestDates() {
  const todayDate = formatKoreanDate();
  const minStartDate = shiftDateString(todayDate, -90);
  return {
    startDate: minStartDate,
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
  const [strategiesByMode, setStrategiesByMode] = useState(strategiesByModeSeed);
  const [ordersByMode, setOrdersByMode] = useState(marketOrdersByModeSeed);
  const [favoriteGroups, setFavoriteGroups] = useState(getInitialFavoriteGroups);
  const [emergencyEnabled, setEmergencyEnabled] = useState(true);
  const [emergencyNotice, setEmergencyNotice] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(getInitialAuthSession);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
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
    localStorage.setItem(FAVORITE_GROUPS_KEY, JSON.stringify(favoriteGroups));
  }, [favoriteGroups]);

  useEffect(() => {
    const updateClock = () => {
      const formatter = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      setClock(`${formatter.format(new Date())} KST`);
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

  function navigate(page, anchor = "") {
    const nextPage = validPages.includes(page) ? page : "dashboard";
    const nextAnchor = anchor || "";
    const nextHash = nextAnchor ? `/${nextPage}:${nextAnchor}` : `/${nextPage}`;
    if (window.location.hash !== `#${nextHash}`) {
      window.location.hash = nextHash;
    }
    setRoute({ page: nextPage, anchor: nextAnchor });
  }

  function signIn() {
    setIsAuthenticated(true);
    localStorage.setItem(AUTH_SESSION_KEY, "active");
    navigate("dashboard");
  }

  function signOut() {
    setIsAuthenticated(false);
    localStorage.removeItem(AUTH_SESSION_KEY);
    navigate("login");
  }

  function updateNickname(nextName) {
    const cleanName = nextName.trim();
    setNicknameState(cleanName);
    if (cleanName) localStorage.setItem(NICKNAME_KEY, cleanName);
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
  }

  const profileName = nickname || "프로필";
  const accountProfile = accountProfiles[executionMode];
  const currentStrategies = strategiesByMode[executionMode] || [];
  const currentOrders = ordersByMode[executionMode] || [];
  const otherMode = executionMode === "real" ? "mock" : "real";
  const appRoute = isAuthenticated && route.page === "login" ? { page: "dashboard", anchor: "" } : route;

  if (!isAuthenticated) {
    return <LoginPage onSignIn={signIn} updateNickname={updateNickname} />;
  }

  return (
    <Shell
      route={appRoute}
      navigate={navigate}
      profileName={profileName}
      clock={clock}
      executionMode={executionMode}
      emergencyEnabled={emergencyEnabled}
      emergencyNotice={emergencyNotice}
      onEmergencyStop={triggerEmergencyStop}
      onSignOut={signOut}
    >
      {appRoute.page === "dashboard" && <DashboardPage navigate={navigate} accountProfile={accountProfile} strategies={currentStrategies} />}
      {appRoute.page === "market" && (
        <MarketPage
          accountProfile={accountProfile}
          orders={currentOrders}
          setOrders={updateCurrentOrders}
          favoriteGroups={favoriteGroups}
          setFavoriteGroups={setFavoriteGroups}
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
        />
      )}
      {appRoute.page === "backtest" && <BacktestPage strategies={currentStrategies} executionMode={executionMode} />}
      {appRoute.page === "record" && <RecordPage />}
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
        />
      )}
    </Shell>
  );
}

function Shell({ children, route, navigate, profileName, clock, executionMode, emergencyEnabled, emergencyNotice, onEmergencyStop, onSignOut }) {
  const modeProfile = accountProfiles[executionMode];
  const modeTone = executionMode === "real" ? "text-tertiary" : "text-secondary";
  const modeDot = executionMode === "real" ? "bg-tertiary" : "bg-secondary";

  return (
    <div className="custom-scrollbar font-body-md text-body-md">
      <aside className="flex flex-col h-screen fixed left-0 top-0 py-container-margin border-r border-outline-variant bg-surface-container-low w-64 z-50">
        <div className="px-6 mb-8">
          <h1 className="font-display text-display text-primary uppercase">AeroTrade</h1>
          <p className="font-label-caps text-label-caps text-on-surface-variant opacity-70">Institutional Grade</p>
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
            onClick={onEmergencyStop}
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

      <header className="flex justify-between items-center h-12 px-container-margin ml-64 w-[calc(100%-16rem)] bg-surface-container border-b border-outline-variant fixed top-0 z-40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${modeDot} animate-pulse`} />
            <span className={`font-label-mono text-label-mono ${modeTone}`}>{modeProfile.label}</span>
          </div>
          <span className="font-label-mono text-label-mono text-on-surface-variant">한국장: 장중</span>
          <span className="font-label-mono text-label-mono text-on-surface-variant">{clock}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            className="inline-flex items-center justify-center p-1 text-on-surface-variant hover:text-primary transition-opacity"
            type="button"
            aria-label="알림 보기"
            onClick={() => navigate("record", "alerts")}
          >
            <Icon>notifications</Icon>
          </button>
          <button
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-container-highest cursor-pointer transition-colors"
            type="button"
            onClick={() => navigate("setting", "profile-security")}
          >
            <span className="font-label-mono text-label-mono text-on-surface-variant">{profileName}</span>
            <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center">
              <Icon className="text-[16px] text-on-primary-container">person</Icon>
            </div>
          </button>
          <button
            className="inline-flex items-center gap-1 rounded border border-outline-variant px-2 py-1 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-highest"
            type="button"
            onClick={onSignOut}
          >
            <Icon className="text-[16px]">logout</Icon>
            로그아웃
          </button>
        </div>
      </header>

      <main className="ml-64 mt-12 min-h-[calc(100vh-3rem)] p-container-margin bg-surface-container-lowest">
        <div className="max-w-[1600px] mx-auto space-y-gutter">{children}</div>
      </main>
    </div>
  );
}

function DashboardPage({ navigate, accountProfile, strategies }) {
  const activeStrategyCount = strategies.filter((strategy) => strategy.status === "활성").length;

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
        <Section className="xl:col-span-8 section-scroll-tall">
          <SectionTitle icon="show_chart" title="누적 손익 추이" meta="2026년" />
          <div className="p-widget-padding">
            <div className="h-[280px] flex items-end gap-2 border-b border-outline-variant px-2">
              {[42, 48, 46, 55, 61, 58, 68, 73, 80, 76, 88, 94].map((height, index) => (
                <div className="flex-1 flex flex-col items-center justify-end gap-2" key={height + index}>
                  <div className="w-full rounded-t bg-secondary/60" style={{ height: `${height}%` }} />
                  <span className="font-label-mono text-label-mono text-on-surface-variant">{index + 1}월</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-gutter mt-gutter">
              {[
                ["월간 수익률", "+6.4%"],
                ["최대 낙폭", "-2.1%"],
                ["평균 보유 시간", "3.8일"]
              ].map(([label, value]) => (
                <div className="bg-surface-container-low rounded border border-outline-variant p-3" key={label}>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{label}</p>
                  <p className="font-title-sm text-title-sm text-on-surface mt-1">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <div className="xl:col-span-4 flex flex-col gap-gutter">
          <Section className="flex-1">
            <SectionTitle icon="shield" title="리스크 지표" meta="정상" />
            <div className="p-widget-padding space-y-4">
              {[
                ...accountProfile.riskBars
              ].map(([label, value, color]) => (
                <div key={label}>
                  <div className="flex justify-between font-body-sm text-body-sm text-on-surface-variant mb-2">
                    <span>{label}</span>
                    <span>{value}</span>
                  </div>
                  <div className="h-2 rounded bg-surface-container-highest overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: value }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section className="flex-[1.35] min-h-[360px] flex flex-col">
            <SectionTitle icon="notifications" title="시스템 알림" meta="4건" />
            <div className="divide-y divide-outline-variant/40 section-body-scroll custom-scrollbar flex-1 min-h-0">
              {alerts.map(([icon, color, title, body, time]) => (
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
            </div>
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-gutter">
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
          </div>
        </Section>

        <Section className="section-scroll-sm">
          <SectionTitle icon="receipt_long" title="최근 주문 현황" meta="국내장" />
          <div className="divide-y divide-outline-variant/40">
            {recordRows.slice(0, 5).map(([time, type, target, body, status]) => (
              <article className="grid grid-cols-12 gap-3 p-widget-padding items-center" key={time}>
                <span className="col-span-3 font-label-mono text-label-mono text-on-surface-variant">{time.slice(5)}</span>
                <span className="col-span-2">
                  <Badge tone={type === "리스크" ? "error" : type === "주문" ? "secondary" : "primary"}>{type}</Badge>
                </span>
                <span className="col-span-3 font-title-sm text-title-sm text-on-surface truncate">{target}</span>
                <span className="col-span-4 font-body-sm text-body-sm text-on-surface-variant truncate">{body} · {status}</span>
              </article>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}

function MarketPage({ accountProfile, orders, setOrders, favoriteGroups, setFavoriteGroups }) {
  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState(stocks[0].code);
  const [tab, setTab] = useState("all");
  const [openGroups, setOpenGroups] = useState(() => Object.fromEntries(Object.keys(favoriteGroups).map((groupName) => [groupName, true])));
  const [pendingStock, setPendingStock] = useState(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupError, setGroupError] = useState("");
  const [modalGroupNameDraft, setModalGroupNameDraft] = useState("");
  const [modalGroupError, setModalGroupError] = useState("");
  const [editingOrderId, setEditingOrderId] = useState(null);

  const groups = favoriteGroups;
  const selected = stocks.find((stock) => stock.code === selectedCode) || stocks[0];
  const [orderPrice, setOrderPrice] = useState(selected.current);
  const editingOrder = orders.find((order) => order.id === editingOrderId && OPEN_ORDER_STATUSES.includes(order.status)) || null;
  const favoriteCodes = useMemo(() => new Set(Object.values(groups).flat()), [groups]);
  const normalizedQuery = query.trim().toLowerCase();
  const matchesStockQuery = (stock) => `${stock.name} ${stock.code} ${stock.sector}`.toLowerCase().includes(normalizedQuery);
  const filteredStocks = stocks.filter(matchesStockQuery);
  const groupEntries = Object.entries(groups);
  const filteredFavoriteGroups = groupEntries
    .map(([groupName, codes]) => [
      groupName,
      codes.filter((code) => {
        const stock = stocks.find((item) => item.code === code);
        return stock ? matchesStockQuery(stock) : false;
      })
    ])
    .filter(([, codes]) => codes.length > 0 || !normalizedQuery);
  const visibleStockCount = tab === "all"
    ? filteredStocks.length
    : filteredFavoriteGroups.reduce((count, [, codes]) => count + codes.length, 0);

  useEffect(() => {
    if (!editingOrderId) {
      setOrderPrice(selected.current);
    }
  }, [selected.code, selected.current, editingOrderId]);

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
      setError("그룹 이름을 입력하세요.");
      return false;
    }

    if (findExistingGroupName(groupName)) {
      setError("이미 존재하는 그룹입니다.");
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

  function submitOrder(order) {
    setEditingOrderId(null);
    setOrders((current) => [
      {
        id: Date.now(),
        time: getOrderTime(),
        code: selected.code,
        name: selected.name,
        filledQuantity: 0,
        status: "접수",
        ...order
      },
      ...current
    ]);
  }

  function amendOrder(orderId, nextValues) {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId && OPEN_ORDER_STATUSES.includes(order.status)
          ? { ...order, ...nextValues, time: getOrderTime() }
          : order
      )
    );
    setEditingOrderId(null);
  }

  function cancelOrder(orderId) {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId && OPEN_ORDER_STATUSES.includes(order.status)
          ? { ...order, status: "취소", time: getOrderTime() }
          : order
      )
    );
    setEditingOrderId(null);
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
            <button className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-label-caps text-label-caps hover:brightness-110 flex items-center gap-2" type="button">
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
                        const stock = stocks.find((item) => item.code === code);
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
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{selected.sector} · 현재가 {selected.current}원</p>
              </div>
              <div className="text-right">
                <p className="font-display text-display text-on-surface">{selected.price}</p>
                <p className={`font-title-sm text-title-sm ${selected.change.startsWith("+") ? "text-secondary" : "text-tertiary"}`}>{selected.change}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter p-widget-padding items-start">
              <div className="xl:col-span-6 h-full">
                <IntradayChart />
              </div>
              <div className="xl:col-span-6 flex flex-col gap-gutter">
                <OrderBook current={selected.current} selectedPrice={orderPrice} onSelectPrice={setOrderPrice} />
              </div>
            </div>
          </Section>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
            <Section className="section-scroll-tall min-h-[430px] flex flex-col xl:col-span-6">
              <SectionTitle icon="analytics" title="종목 분석" meta="자동 요약" />
              <div className="p-widget-padding flex flex-1 flex-col gap-gutter">
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
                <div className="bg-surface-container-low rounded border border-outline-variant p-4 flex min-h-[160px] flex-1 flex-col">
                  <h4 className="font-title-sm text-title-sm text-on-surface mb-2">분석 요약</h4>
                  <p className="font-body-md text-body-md text-on-surface-variant">{selected.summary}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
                  {["거래대금이 최근 평균 대비 높습니다.", "전략 적용 전 손절 기준을 확인하세요.", "장중 변동성 확대 시 분할 주문이 적합합니다.", "관심 그룹에 포함하면 전략 범위에서 선택할 수 있습니다."].map((text) => (
                    <div className="flex items-start gap-2 bg-surface-container-low rounded border border-outline-variant p-3" key={text}>
                      <Icon className="text-secondary text-[18px] mt-0.5">check_circle</Icon>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter items-stretch xl:col-span-6">
              <OrderPanel
                selected={selected}
                accountProfile={accountProfile}
                orderPrice={orderPrice}
                setOrderPrice={setOrderPrice}
                editingOrder={editingOrder}
                onSubmitOrder={submitOrder}
                onAmendOrder={amendOrder}
                onCancelOrder={cancelOrder}
                onClearEditing={() => setEditingOrderId(null)}
              />
              <OrderStatusPanel
                orders={orders}
                selectedOrderId={editingOrderId}
                onSelectOrder={selectOrderForEdit}
              />
            </div>
          </div>

          <Section>
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-8 p-widget-padding">
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-3">주요 지표</h3>
                  <div className="grid grid-cols-2 gap-gutter md:grid-cols-4">
                    {[
                      ["PER", selected.per],
                      ["PBR", selected.pbr],
                      ["ROE", selected.roe],
                      ["RSI", selected.rsi],
                      ["MACD", selected.macd],
                      ["20일선", selected.ma20],
                      ["외국인", selected.foreign],
                      ["기관", selected.institution]
                    ].map(([label, value]) => (
                      <div className="bg-surface-container-low rounded border border-outline-variant p-3" key={label}>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{label}</p>
                        <p className="font-title-sm text-title-sm text-on-surface mt-1">{value}</p>
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
          <p className={`font-label-mono text-label-mono ${stock.change.startsWith("+") ? "text-secondary" : "text-tertiary"}`}>{stock.change}</p>
        </div>
        <button className="p-1 text-on-surface-variant hover:text-tertiary" type="button" onClick={onFavorite} aria-label="관심 종목">
          <Icon className="favorite-icon" data-active={String(favorite)}>star</Icon>
        </button>
      </div>
    </article>
  );
}

function IntradayChart() {
  const bars = [34, 42, 38, 54, 49, 63, 58, 72, 69, 78, 74, 86, 80, 92, 88, 95, 89, 93, 91, 96, 94, 98, 92, 97];
  return (
    <div className="flex h-full flex-col">
      <h3 className="font-headline-md text-headline-md text-on-surface mb-3">일중 그래프</h3>
      <div className="h-[470px] bg-surface-container-low rounded border border-outline-variant p-3 flex items-end gap-1">
        {bars.map((bar, index) => (
          <div className={`flex-1 rounded-t ${index % 5 === 2 ? "chart-bar-down" : "chart-bar-up"}`} style={{ height: `${bar}%` }} key={bar + index} />
        ))}
      </div>
    </div>
  );
}

function OrderBook({ current, selectedPrice, onSelectPrice }) {
  const currentNumber = Number(String(current).replace(/,/g, "")) || 0;
  const formatPrice = (value) => value.toLocaleString("ko-KR");
  const orderBookDepth = 6;
  const depthSteps = Array.from({ length: orderBookDepth }, (_, index) => index + 1);
  const asks = [...depthSteps].reverse().map((step) => formatPrice(currentNumber + step * 100));
  const bids = depthSteps.map((step) => formatPrice(Math.max(currentNumber - step * 100, 0)));
  const renderPriceRow = (side, price, volume, index) => {
    const active = selectedPrice === price;
    const sideClass = side === "ask" ? "orderbook-ask" : "orderbook-bid";
    return (
      <button
        className={`grid flex-1 grid-cols-2 items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-surface-container-highest ${sideClass} ${active ? "ring-1 ring-primary" : ""}`}
        key={`${side}-${price}`}
        type="button"
        onClick={() => onSelectPrice(price)}
      >
        <strong className="font-label-mono text-label-mono">{price}</strong>
        <span className="text-right font-label-mono text-label-mono">{volume.toLocaleString()}</span>
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-headline-md text-headline-md text-on-surface">호가</h3>
        <span className="font-label-mono text-label-mono text-on-surface-variant">가격 클릭 시 주문가 반영</span>
      </div>
      <div className="h-[470px] rounded border border-outline-variant overflow-hidden flex flex-col">
        {asks.map((price, index) => renderPriceRow("ask", price, 4200 - index * 310, index))}
        <button
          className={`grid flex-1 grid-cols-2 items-center gap-2 px-2 py-1.5 bg-surface-container-high text-on-surface font-title-sm text-title-sm transition-colors hover:bg-surface-container-highest ${selectedPrice === current ? "ring-1 ring-primary" : ""}`}
          type="button"
          onClick={() => onSelectPrice(current)}
        >
          <strong>{current}</strong>
          <span className="text-right font-label-mono text-label-mono">현재가</span>
        </button>
        {bids.map((price, index) => renderPriceRow("bid", price, 3100 + index * 430, index))}
      </div>
    </div>
  );
}

function OrderStatusPanel({ orders, selectedOrderId, onSelectOrder }) {
  const [filter, setFilter] = useState("open");
  const filteredOrders = orders.filter((order) => {
    if (filter === "open") return OPEN_ORDER_STATUSES.includes(order.status);
    return ["체결", "취소"].includes(order.status);
  });
  const openCount = orders.filter((order) => OPEN_ORDER_STATUSES.includes(order.status)).length;
  const filledCount = orders.filter((order) => ["체결", "취소"].includes(order.status)).length;

  function statusTone(status) {
    if (status === "체결") return "secondary";
    if (status === "부분 체결") return "tertiary";
    if (status === "취소") return "neutral";
    return "primary";
  }

  return (
    <Section className="min-h-[430px] flex h-full flex-col">
      <div className="p-widget-padding border-b border-outline-variant flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon className="text-primary">receipt_long</Icon>
          <h3 className="font-headline-md text-headline-md text-on-surface">주문 현황</h3>
        </div>
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
                <div className="grid grid-cols-3 gap-2 mt-3">
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
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="font-label-mono text-label-mono text-on-surface-variant">{order.time}</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {editable ? (active ? "주문창에서 정정 중" : "클릭하면 주문창에서 정정/취소") : "처리 완료"}
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

function OrderPanel({ selected, accountProfile, orderPrice, setOrderPrice, editingOrder, onSubmitOrder, onAmendOrder, onCancelOrder, onClearEditing }) {
  const [orderSide, setOrderSide] = useState("buy");
  const [orderType, setOrderType] = useState("지정가");
  const [quantity, setQuantity] = useState("10");
  const isEditing = Boolean(editingOrder);
  const currentPrice = Number(String(orderPrice || selected.current).replace(/,/g, "")) || 0;
  const orderableCash = accountProfile.orderableCash;
  const holdingQuantity = accountProfile.holdings[selected.code] || 0;
  const maxBuyQuantity = currentPrice ? Math.floor(orderableCash / currentPrice) : 0;
  const holdingValue = holdingQuantity * currentPrice;
  const limitQuantity = orderSide === "buy" ? maxBuyQuantity : holdingQuantity;
  const isBuy = orderSide === "buy";

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
  const canSubmit = numericQuantity > 0 && numericQuantity <= limitQuantity && numericQuantity >= minimumQuantity;

  function submitOrder() {
    if (!canSubmit) return;
    const nextOrder = {
      orderType,
      price: orderPrice || selected.current,
      quantity: numericQuantity
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
            ["buy", "매수", "add_shopping_cart", "최대 매수 가능", `${maxBuyQuantity.toLocaleString()}주`],
            ["sell", "매도", "sell", "보유 잔량", `${holdingQuantity.toLocaleString()}주`]
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
                {(isBuy ? orderableCash : holdingValue).toLocaleString()}원
              </span>
            </div>
            <div className="bg-surface-container-low rounded border border-outline-variant p-2">
              <span className="block font-label-caps text-label-caps text-on-surface-variant">{isBuy ? "최대 매수 가능" : "보유 잔량"}</span>
              <span className={`block font-label-mono text-label-mono mt-1 ${isBuy ? "text-secondary" : holdingQuantity > 0 ? "text-tertiary" : "text-error"}`}>
                {limitQuantity.toLocaleString()}주
              </span>
            </div>
          </div>
          {!isBuy && holdingQuantity === 0 ? (
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
              onChange={(event) => setOrderPrice(event.target.value.replace(/[^\d,]/g, ""))}
            />
          </label>
          <label className="block">
            <span className="font-label-caps text-label-caps text-on-surface-variant">수량</span>
            <input
              className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-label-mono text-label-mono text-right text-on-surface"
              inputMode="numeric"
              max={limitQuantity}
              placeholder={`최대 ${limitQuantity.toLocaleString()}주`}
              type="text"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, ""))}
            />
          </label>
          <button
            className={`w-full py-2 rounded font-label-caps text-label-caps hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100 ${
              isEditing ? "bg-primary-container text-on-primary-container" : isBuy ? "bg-secondary-container text-on-secondary-container" : "bg-tertiary-container text-on-tertiary-container"
            }`}
            disabled={!canSubmit}
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

function StrategyPage({ navigate, favoriteGroups, executionMode, strategies, setStrategies, sourceStrategies, sourceMode }) {
  const [selectedId, setSelectedId] = useState(strategies[0]?.id || null);
  const [conditionSide, setConditionSide] = useState("buy");
  const [importMessage, setImportMessage] = useState("");
  const [showImportPicker, setShowImportPicker] = useState(false);
  const [selectedImportId, setSelectedImportId] = useState("");
  const [strategyQuery, setStrategyQuery] = useState("");
  const [strategyStatusFilter, setStrategyStatusFilter] = useState("전체 상태");
  const [strategyDraft, setStrategyDraft] = useState(null);
  const [stockSearch, setStockSearch] = useState("");
  const [allocationNotice, setAllocationNotice] = useState("");
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
  const selected = strategies.find((strategy) => strategy.id === selectedId) || strategies[0];
  const selectedDraft = strategyDraft?.id === selectedId ? strategyDraft : createStrategyDraft(selected);

  useEffect(() => {
    if (!strategies.length) {
      setSelectedId(null);
      return;
    }
    if (!strategies.some((strategy) => strategy.id === selectedId)) {
      setSelectedId(strategies[0].id);
    }
  }, [strategies, selectedId]);

  useEffect(() => {
    if (!filteredStrategies.length) return;
    if (!filteredStrategies.some((strategy) => strategy.id === selectedId)) {
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
  }, [selectedId]);

  useEffect(() => {
    setAllocationNotice("");
  }, [conditionSide]);

  const selectedScope = selectedDraft?.scope || "개별 종목";
  const stageKey = conditionSide === "buy" ? "buyStages" : "sellStages";
  const activeStages = Array.isArray(selectedDraft?.[stageKey]) ? selectedDraft[stageKey] : [createStrategyStage(conditionSide, 1)];
  const selectedTargetCodes = Array.isArray(selectedDraft?.targetStocks) ? selectedDraft.targetStocks : [];
  const selectedTargetStocks = selectedTargetCodes.map((code) => getStockByCode(code)).filter(Boolean);

  function createStrategyDraft(strategy) {
    if (!strategy) return null;
    const buyStages = cloneStrategyStages(strategy, "buy");
    const sellStages = cloneStrategyStages(strategy, "sell");

    return {
      id: strategy.id,
      name: strategy.name || "",
      orderMode: strategy.orderMode || "승인 후 주문",
      scope: strategy.scope || "개별 종목",
      target: strategy.target || "삼성전자",
      targetStocks: getTargetStockCodes(strategy),
      buyStages,
      sellStages,
      buyConditions: buyStages.length ? cloneStrategyConditions(buyStages[0]?.conditions, "buy") : [],
      sellConditions: sellStages.length ? cloneStrategyConditions(sellStages[0]?.conditions, "sell") : []
    };
  }

  function updateStrategyDraft(patch) {
    if (!selectedId) return;
    setStrategyDraft((current) => {
      const baseDraft = current?.id === selectedId ? current : createStrategyDraft(selected);
      return baseDraft ? { ...baseDraft, ...patch } : baseDraft;
    });
  }

  function updateTargetStocks(codes) {
    const uniqueCodes = [...new Set(codes.filter((code) => getStockByCode(code)))];
    updateStrategyDraft({
      targetStocks: uniqueCodes,
      target: summarizeTargetStocks(uniqueCodes)
    });
  }

  function addTargetStock(rawValue = stockSearch) {
    const stock = findStockBySearchValue(rawValue);
    if (!stock) return;
    updateTargetStocks([...selectedTargetCodes, stock.code]);
    setStockSearch("");
  }

  function removeTargetStock(code) {
    updateTargetStocks(selectedTargetCodes.filter((targetCode) => targetCode !== code));
  }

  function updateDraftStage(stageIndex, patch) {
    if (!selectedId) return;
    setStrategyDraft((current) => {
      const baseDraft = current?.id === selectedId ? current : createStrategyDraft(selected);
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
    if (!selectedId) return;
    setStrategyDraft((current) => {
      const baseDraft = current?.id === selectedId ? current : createStrategyDraft(selected);
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
              const nextCondition = [...condition];
              nextCondition[field] = value;
              return nextCondition;
            })
          };
        })
      };
    });
  }

  function addDraftStageCondition(stageIndex) {
    if (!selectedId) return;
    setStrategyDraft((current) => {
      const baseDraft = current?.id === selectedId ? current : createStrategyDraft(selected);
      if (!baseDraft) return baseDraft;
      const baseStages = cloneStrategyStages(baseDraft, conditionSide);
      return {
        ...baseDraft,
        [stageKey]: baseStages.map((stage, index) => {
          if (index !== stageIndex) return stage;
          return {
            ...stage,
            conditions: [...cloneStrategyConditions(stage.conditions, conditionSide), createEmptyCondition(conditionSide)]
          };
        })
      };
    });
  }

  function removeDraftStageCondition(stageIndex, conditionIndex) {
    if (!selectedId) return;
    setStrategyDraft((current) => {
      const baseDraft = current?.id === selectedId ? current : createStrategyDraft(selected);
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
    if (!selectedId) return;
    setAllocationNotice("");
    setStrategyDraft((current) => {
      const baseDraft = current?.id === selectedId ? current : createStrategyDraft(selected);
      if (!baseDraft) return baseDraft;
      const baseStages = cloneStrategyStages(baseDraft, conditionSide);
      return {
        ...baseDraft,
        [stageKey]: [...baseStages, createStrategyStage(conditionSide, baseStages.length + 1, null, "0")]
      };
    });
  }

  function removeDraftStage(stageIndex) {
    if (!selectedId) return;
    setAllocationNotice("");
    setStrategyDraft((current) => {
      const baseDraft = current?.id === selectedId ? current : createStrategyDraft(selected);
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

  function saveSelectedStrategySettings() {
    if (!selectedId || !selectedDraft) return;
    const savedBuyStages = normalizeDraftStages(selectedDraft, "buy");
    const savedSellStages = normalizeDraftStages(selectedDraft, "sell");
    const savedTargetStocks = selectedDraft.scope === "개별 종목" ? [...new Set((selectedDraft.targetStocks || []).filter((code) => getStockByCode(code)))] : [];
    const savedTarget = selectedDraft.scope === "개별 종목" ? summarizeTargetStocks(savedTargetStocks) : selectedDraft.target;
    const savedDraft = {
      ...selectedDraft,
      name: selectedDraft.name.trim() || "이름 없는 전략",
      target: savedTarget,
      targetStocks: savedTargetStocks,
      buyStages: savedBuyStages,
      sellStages: savedSellStages,
      buyConditions: savedBuyStages.length ? cloneStrategyConditions(savedBuyStages[0]?.conditions, "buy") : [],
      sellConditions: savedSellStages.length ? cloneStrategyConditions(savedSellStages[0]?.conditions, "sell") : []
    };

    setStrategies((current) =>
      current.map((strategy) => {
        if (strategy.id !== selectedId) return strategy;
        return {
          ...strategy,
          name: savedDraft.name,
          orderMode: savedDraft.orderMode,
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
    setImportMessage(`${savedDraft.name} 설정을 저장했습니다.`);
  }

  function updateStatus(status) {
    setStrategies((current) => current.map((strategy) => strategy.id === selectedId ? { ...strategy, status } : strategy));
  }

  function deleteStrategy() {
    const nextStrategies = strategies.filter((strategy) => strategy.id !== selectedId);
    setStrategies(nextStrategies);
    setSelectedId(nextStrategies[0]?.id || null);
  }

  function addStrategy() {
    const next = {
      ...strategiesSeed[0],
      id: Date.now(),
      name: "새 전략",
      status: "중지",
      orderMode: "승인 후 주문",
      scope: "개별 종목",
      target: "삼성전자",
      targetStocks: [stocks[0].code],
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
  }

  function importSelectedStrategy() {
    if (!selectedImportStrategy) {
      setImportMessage(`${sourceModeLabel} 모드에서 가져올 새 전략이 없습니다.`);
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
    setImportMessage(`${sourceModeLabel} 모드의 ${imported.name} 전략을 중지 상태로 가져왔습니다.`);
    setShowImportPicker(false);
  }

  return (
    <>
      <PageHeader
        title="전략 관리"
        description={`${modeLabel} 모드에 적용되는 전략을 관리하고, 필요하면 다른 모드의 전략을 중지 상태로 가져옵니다.`}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-label-caps text-label-caps hover:bg-surface-container-highest transition-colors flex items-center gap-2"
              type="button"
              onClick={() => {
                setImportMessage("");
                setShowImportPicker(true);
              }}
            >
              <Icon className="text-[16px]">download</Icon>
              {sourceModeLabel} 전략 가져오기
            </button>
            <button
              className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-label-caps text-label-caps hover:brightness-110 transition-all flex items-center gap-2"
              type="button"
              onClick={addStrategy}
            >
              <Icon className="text-[16px]">add</Icon>
              새 전략
            </button>
          </div>
        }
      />

      {importMessage ? (
        <div className="rounded-lg border border-primary/20 bg-primary/10 p-widget-padding font-body-md text-body-md text-primary">
          {importMessage}
        </div>
      ) : null}

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter items-stretch">
        <Section className="xl:col-span-5 flex flex-col h-full">
          <div className="p-widget-padding border-b border-outline-variant">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline-md text-headline-md text-on-surface">전략 목록</h3>
              <span className="font-label-mono text-label-mono text-secondary">{filteredStrategies.length}개</span>
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
                className={`w-full p-widget-padding border-b border-outline-variant/40 text-left hover:bg-surface-container-highest ${selectedId === strategy.id ? "bg-primary/5" : ""}`}
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
            <div className="p-widget-padding grid grid-cols-1 md:grid-cols-5 gap-gutter">
              {[
                ["적용 범위", selected?.scope],
                ["대상", selected?.target],
                ["주문 방식", selected?.orderMode],
                ["최근 수익률", selected?.returnRate],
                ["승률", selected?.winRate]
              ].map(([label, value]) => (
                <div className="bg-surface-container-low rounded border border-outline-variant p-3" key={label}>
                  <p className="font-label-caps text-label-caps text-on-surface-variant mb-1">{label}</p>
                  <p className="font-title-sm text-title-sm text-on-surface">{value}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section>
            <SectionTitle icon="tune" title="전략 설정" />
            <div className="p-widget-padding space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">전략 이름</span>
                  <input
                    className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface"
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
                    onChange={(event) => updateStrategyDraft({ orderMode: event.target.value })}
                  >
                    <option>승인 후 주문</option>
                    <option>자동 주문</option>
                  </select>
                </label>
              </div>

              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant mb-2">적용 범위</p>
                <div className="grid grid-cols-3 gap-gutter">
                  {["개별 종목", "종목 그룹", "전체 종목"].map((item) => (
                    <button
                      className={`py-2 rounded border font-label-caps text-label-caps ${selectedScope === item ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"}`}
                      key={item}
                      type="button"
                      onClick={() => {
                        const nextTargetStocks = item === "개별 종목" ? selectedTargetCodes.length ? selectedTargetCodes : [stocks[0].code] : [];
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
                    <p className="bg-surface-container-low rounded border border-outline-variant p-3 font-body-sm text-body-sm text-on-surface-variant">조건식을 통해 전체 종목을 대상으로 전략을 적용합니다.</p>
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
                      className="inline-flex items-center justify-center gap-1 rounded border border-outline-variant px-3 py-2 font-label-caps text-label-caps text-primary hover:bg-surface-container-highest"
                      type="button"
                      onClick={addDraftStage}
                    >
                      <Icon className="text-[16px]">add</Icon>
                      {activeStages.length + 1}차 {conditionSide === "buy" ? "매수" : "매도"} 추가
                    </button>
                  </div>
                </div>
                {allocationNotice ? (
                  <div className="mb-2 rounded border border-error/30 bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">
                    {allocationNotice}
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-gutter">
                  {!activeStages.length ? (
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
                            {stageConditions.map(([indicator, operator, value], conditionIndex) => (
                              <div className="grid grid-cols-1 gap-gutter md:grid-cols-[1.1fr_0.9fr_1fr_auto]" key={`${stage.id}-${conditionIndex}`}>
                                <label className="block">
                                  <span className="font-label-caps text-label-caps text-on-surface-variant md:hidden">지표</span>
                                  <select
                                    className="mt-1 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-body-sm text-body-sm text-on-surface md:mt-0"
                                    value={indicator}
                                    onChange={(event) => updateDraftStageCondition(stageIndex, conditionIndex, 0, event.target.value)}
                                  >
                                    {[indicator, ...conditionIndicatorOptions.filter((option) => option !== indicator)].map((option) => (
                                      <option key={option}>{option}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block">
                                  <span className="font-label-caps text-label-caps text-on-surface-variant md:hidden">조건</span>
                                  <select
                                    className="mt-1 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-body-sm text-body-sm text-on-surface md:mt-0"
                                    value={operator}
                                    onChange={(event) => updateDraftStageCondition(stageIndex, conditionIndex, 1, event.target.value)}
                                  >
                                    {[operator, ...conditionOperatorOptions.filter((option) => option !== operator)].map((option) => (
                                      <option key={option}>{option}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block">
                                  <span className="font-label-caps text-label-caps text-on-surface-variant md:hidden">값</span>
                                  <input
                                    className="mt-1 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-right font-label-mono text-label-mono text-on-surface md:mt-0"
                                    value={value}
                                    onChange={(event) => updateDraftStageCondition(stageIndex, conditionIndex, 2, event.target.value)}
                                  />
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
                            ))}
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
                <NumberInput label="전략별 손실 한도" value="500,000" suffix="원" />
                <NumberInput label="종목별 주문 한도" value="2,000,000" suffix="원" />
                <button className="self-end py-2 rounded bg-primary-container text-on-primary-container font-label-caps text-label-caps hover:brightness-110" type="button" onClick={saveSelectedStrategySettings}>설정 저장</button>
              </div>
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
  const seed = Number(strategy.id) || strategy.name.length;
  const signalMap = new Map([
    [2, "buy"],
    [4, "sell"],
    [7, "buy"],
    [9, "sell"]
  ]);
  const equityCurve = Array.from({ length: 12 }, (_, index) => {
    const progress = index / 11;
    const wave = Math.sin((index + seed) * 1.08) * 1.25;
    const pullback = index === 6 ? -drawdown * 0.42 : index === 8 ? -drawdown * 0.18 : 0;
    return {
      label: index + 1,
      value: Number((100 + returnRate * progress + wave + pullback).toFixed(2)),
      signal: signalMap.get(index) || ""
    };
  });
  const signals = equityCurve
    .filter((point) => point.signal)
    .map((point, index) => ({
      time: `${index + 1}차 신호`,
      type: point.signal,
      label: point.signal === "buy" ? "매수" : "매도",
      value: formatSignedPercent(point.value - 100)
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

function BacktestChart({ result }) {
  const values = result.equityCurve.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = Math.max(1, maxValue - minValue);
  const points = result.equityCurve.map((point, index) => {
    const x = 4 + (index / Math.max(1, result.equityCurve.length - 1)) * 92;
    const y = 35 - ((point.value - minValue) / spread) * 28;
    return { ...point, x, y };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="rounded border border-outline-variant bg-surface-container-low p-3">
      <svg className="h-[320px] w-full overflow-visible" viewBox="0 0 100 42" role="img" aria-label="백테스트 수익 곡선과 매수 매도 신호">
        {[8, 17, 26, 35].map((y) => (
          <line key={y} x1="4" x2="96" y1={y} y2={y} stroke="rgb(var(--outline-variant-rgb) / 0.55)" strokeDasharray="1.5 1.5" />
        ))}
        <polyline points={linePoints} fill="none" stroke="rgb(var(--primary-rgb) / 0.9)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => point.signal ? (
          <g key={`${point.label}-${point.signal}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="1.7"
              fill={point.signal === "buy" ? "rgb(var(--secondary-rgb))" : "rgb(var(--tertiary-rgb))"}
              stroke="var(--surface-container-low)"
              strokeWidth="0.7"
            />
            <text
              x={point.x}
              y={point.signal === "buy" ? Math.max(4, point.y - 2.8) : Math.min(40, point.y + 4.2)}
              textAnchor="middle"
              fontSize="2.6"
              fill={point.signal === "buy" ? "rgb(var(--secondary-rgb))" : "rgb(var(--tertiary-rgb))"}
            >
              {point.signal === "buy" ? "매수" : "매도"}
            </text>
          </g>
        ) : null)}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3 font-label-mono text-label-mono text-on-surface-variant">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />수익 곡선</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-secondary" />매수</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-tertiary" />매도</span>
      </div>
    </div>
  );
}

function BacktestPage({ strategies, executionMode }) {
  const [backtestStrategy, setBacktestStrategy] = useState(strategies[0]?.id || "");
  const [backtestDates, setBacktestDates] = useState(getInitialBacktestDates);
  const [initialCash, setInitialCash] = useState("10,000,000");
  const [lastRunAt, setLastRunAt] = useState("");
  const modeLabel = accountProfiles[executionMode].shortLabel;
  const selectedStrategy = strategies.find((strategy) => strategy.id === backtestStrategy) || strategies[0];
  const result = useMemo(() => buildBacktestResult(selectedStrategy, backtestDates, initialCash), [selectedStrategy, backtestDates, initialCash]);

  useEffect(() => {
    if (!strategies.length) {
      setBacktestStrategy("");
      return;
    }
    if (!strategies.some((strategy) => strategy.id === backtestStrategy)) {
      setBacktestStrategy(strategies[0].id);
    }
  }, [strategies, backtestStrategy]);

  function updateBacktestStartDate(value) {
    setBacktestDates((current) => {
      if (value < current.minStartDate) {
        return {
          ...current,
          startDate: current.minStartDate,
          warning: `시작일은 현재일 기준 90일 전인 ${current.minStartDate}보다 이전으로 설정할 수 없습니다.`
        };
      }
      if (value > current.endDate) {
        return {
          ...current,
          startDate: current.endDate,
          warning: "시작일은 종료일보다 늦을 수 없습니다."
        };
      }
      return { ...current, startDate: value, warning: "" };
    });
  }

  function updateBacktestEndDate(value) {
    setBacktestDates((current) => {
      if (value > current.maxEndDate) {
        return {
          ...current,
          endDate: current.maxEndDate,
          warning: `종료일은 현재일인 ${current.maxEndDate} 이후로 설정할 수 없습니다.`
        };
      }
      if (value < current.startDate) {
        return {
          ...current,
          endDate: current.startDate,
          warning: "종료일은 시작일보다 빠를 수 없습니다."
        };
      }
      return { ...current, endDate: value, warning: "" };
    });
  }

  return (
    <>
      <PageHeader
        title="백테스트"
        description={`${modeLabel} 모드 전략을 최근 90일 범위에서 검증하고 매수·매도 신호와 평가를 확인합니다.`}
        action={
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <button
              className="inline-flex items-center gap-2 rounded bg-secondary-container px-4 py-2 font-label-caps text-label-caps text-on-secondary-container hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
              type="button"
              disabled={!strategies.length}
              onClick={() => setLastRunAt(`${formatKoreanDate()} ${getKoreanOrderTime()}`)}
            >
              <Icon className="text-[16px]">play_arrow</Icon>
              백테스트 실행
            </button>
            {lastRunAt ? <span className="font-label-mono text-label-mono text-on-surface-variant">최근 실행 {lastRunAt}</span> : null}
          </div>
        }
      />

      <Section>
        <SectionTitle icon="tune" title="테스트 조건" meta={result.periodLabel} />
        <div className="p-widget-padding space-y-gutter">
          <div className="grid grid-cols-1 gap-gutter md:grid-cols-4">
            <label className="block">
              <span className="font-label-caps text-label-caps text-on-surface-variant">전략 선택</span>
              <select
                className="mt-1 w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface"
                value={backtestStrategy}
                disabled={!strategies.length}
                onChange={(event) => setBacktestStrategy(Number(event.target.value))}
              >
                {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="font-label-caps text-label-caps text-on-surface-variant">시작일</span>
              <input
                className={`mt-1 w-full rounded border bg-surface-container-lowest px-3 py-2 font-label-mono text-label-mono text-on-surface ${backtestDates.warning.startsWith("시작일") ? "border-error" : "border-outline-variant"}`}
                type="date"
                value={backtestDates.startDate}
                min={backtestDates.minStartDate}
                max={backtestDates.maxEndDate}
                onChange={(event) => updateBacktestStartDate(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="font-label-caps text-label-caps text-on-surface-variant">종료일</span>
              <input
                className={`mt-1 w-full rounded border bg-surface-container-lowest px-3 py-2 font-label-mono text-label-mono text-on-surface ${backtestDates.warning.startsWith("종료일") ? "border-error" : "border-outline-variant"}`}
                type="date"
                value={backtestDates.endDate}
                min={backtestDates.minStartDate}
                max={backtestDates.maxEndDate}
                onChange={(event) => updateBacktestEndDate(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="font-label-caps text-label-caps text-on-surface-variant">초기 자금</span>
              <div className="mt-1 flex">
                <input
                  className="w-full rounded-l border border-outline-variant bg-surface-container-lowest px-3 py-2 text-right font-label-mono text-label-mono text-on-surface"
                  value={initialCash}
                  onChange={(event) => setInitialCash(event.target.value)}
                />
                <span className="rounded-r border-y border-r border-outline-variant bg-surface-container-highest px-3 py-2 font-label-mono text-label-mono text-on-surface-variant">원</span>
              </div>
            </label>
          </div>
          <div className={`rounded border p-3 font-body-sm text-body-sm ${backtestDates.warning ? "border-error/30 bg-error/10 text-error" : "border-outline-variant bg-surface-container-low text-on-surface-variant"}`}>
            {backtestDates.warning || `백테스트 기간은 현재일 ${backtestDates.maxEndDate} 기준 최근 90일(${backtestDates.minStartDate} 이후)까지만 설정할 수 있습니다.`}
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-gutter md:grid-cols-4">
        {result.metrics.map(([label, value, tone]) => (
          <div className="rounded-lg border border-outline-variant bg-surface-container p-widget-padding" key={label}>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{label}</p>
            <p className={`mt-1 font-headline-md text-headline-md ${tone === "secondary" ? "text-secondary" : tone === "primary" ? "text-primary" : tone === "tertiary" ? "text-tertiary" : "text-on-surface"}`}>{value}</p>
          </div>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-gutter xl:grid-cols-12">
        <Section className="xl:col-span-8">
          <SectionTitle icon="show_chart" title="수익 곡선" meta={selectedStrategy?.name || "전략 없음"} />
          <div className="p-widget-padding">
            <BacktestChart result={result} />
          </div>
        </Section>

        <Section className="xl:col-span-4">
          <SectionTitle icon="fact_check" title="전략 평가" meta={result.score ? `${result.score}점` : "대기"} tone="text-secondary" />
          <div className="p-widget-padding space-y-gutter">
            <div className="divide-y divide-outline-variant/40 rounded border border-outline-variant bg-surface-container-low">
              {result.evaluationRows.map(([label, value]) => (
                <div className="flex items-center justify-between gap-3 p-3" key={label}>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">{label}</span>
                  <strong className="text-right font-title-sm text-title-sm text-on-surface">{value}</strong>
                </div>
              ))}
            </div>
            <div className="rounded border border-outline-variant bg-surface-container-low p-3">
              <p className="font-label-caps text-label-caps text-secondary">운용 의견</p>
              <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{result.opinion}</p>
            </div>
            <div className="rounded border border-outline-variant bg-surface-container-low p-3">
              <p className="font-label-caps text-label-caps text-on-surface-variant">최근 신호</p>
              <div className="mt-2 space-y-2">
                {result.signals.length ? result.signals.map((signal) => (
                  <div className="flex items-center justify-between gap-3" key={`${signal.time}-${signal.type}`}>
                    <span className="inline-flex items-center gap-2">
                      <Badge tone={signal.type === "buy" ? "secondary" : "tertiary"}>{signal.label}</Badge>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">{signal.time}</span>
                    </span>
                    <span className="font-label-mono text-label-mono text-on-surface">{signal.value}</span>
                  </div>
                )) : (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">표시할 신호가 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </Section>
      </section>
    </>
  );
}

function NumberInput({ label, value, suffix }) {
  return (
    <label className="block">
      <span className="font-label-caps text-label-caps text-on-surface-variant">{label}</span>
      <div className="mt-1 flex">
        <input className="w-full bg-surface-container-lowest border border-outline-variant rounded-l px-3 py-2 font-label-mono text-label-mono text-right text-on-surface" defaultValue={value} />
        <span className="px-3 py-2 bg-surface-container-highest border-y border-r border-outline-variant rounded-r font-label-mono text-label-mono text-on-surface-variant">{suffix}</span>
      </div>
    </label>
  );
}

function RecordPage() {
  const [recordFilters, setRecordFilters] = useState({
    startDate: "2026-06-17",
    endDate: "2026-06-21",
    strategy: "모든 전략",
    type: "전체 기록",
    status: "전체 상태"
  });
  const filteredRecordRows = recordRows.filter(([time, type, target, body, status]) => {
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
        <FilterControl label="전략" value={recordFilters.strategy} onChange={(value) => updateRecordFilter("strategy", value)} options={["모든 전략", "시가 돌파 전략", "종가 회귀 전략", "수급 추적 전략"]} />
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
              <article className={`grid grid-cols-1 md:grid-cols-12 items-center gap-1 md:gap-3 px-widget-padding py-3 hover:bg-surface-container-highest transition-colors min-w-0 ${status === "중지" ? "bg-error-container/5" : ""}`} key={time}>
                <span className="md:col-span-2 font-label-mono text-label-mono text-on-surface-variant whitespace-nowrap">{time}</span>
                <span className="md:col-span-1 w-fit">
                  <Badge tone={type === "리스크" ? "error" : type === "주문" ? "secondary" : type === "시스템" ? "neutral" : "primary"}>{type}</Badge>
                </span>
                <span className="md:col-span-2 font-title-sm text-title-sm text-on-surface truncate min-w-0">{target}</span>
                <span className={`md:col-span-5 font-body-md text-body-md truncate min-w-0 ${status === "중지" ? "text-error" : "text-on-surface-variant"}`}>{body}</span>
                <span className={`md:col-span-2 font-label-mono text-label-mono md:text-right ${status === "완료" ? "text-secondary" : status === "대기" ? "text-primary" : status === "중지" ? "text-error" : "text-tertiary"}`}>{status}</span>
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
        <SectionTitle icon="notifications" title="알림" meta={`${alerts.length}건`} />
        <div className="divide-y divide-outline-variant/40">
          {alerts.map(([icon, color, title, body, time], index) => (
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

function SettingsPage({ theme, setTheme, nickname, updateNickname, executionMode, setExecutionMode, emergencyEnabled, setEmergencyEnabled }) {
  const [nicknameDraft, setNicknameDraft] = useState(nickname || "AeroTrade 사용자");
  const [passwordMessage, setPasswordMessage] = useState("보안을 위해 현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.");
  const [orderMode, setOrderMode] = useState("승인 후 주문");
  const [pendingExecutionMode, setPendingExecutionMode] = useState(null);
  const [kiwoomCredentials, setKiwoomCredentials] = useState({
    real: { appKey: "", appSecret: "" },
    mock: { appKey: "", appSecret: "" }
  });
  const [kiwoomStatus, setKiwoomStatus] = useState({ real: "미연결", mock: "미연결" });
  const [kiwoomMessage, setKiwoomMessage] = useState("실전과 모의 환경의 API 키를 각각 입력할 수 있습니다.");
  const [showRealConnectWarning, setShowRealConnectWarning] = useState(false);

  const activeKiwoomCredentials = kiwoomCredentials[executionMode];
  const activeKiwoomLabel = accountProfiles[executionMode].shortLabel;
  const pendingExecutionLabel = pendingExecutionMode ? accountProfiles[pendingExecutionMode].shortLabel : "";

  function updateKiwoomCredential(field, value) {
    setKiwoomCredentials((current) => ({
      ...current,
      [executionMode]: {
        ...current[executionMode],
        [field]: value
      }
    }));
  }

  function connectKiwoom() {
    if (executionMode === "real") {
      setShowRealConnectWarning(true);
      return;
    }
    setKiwoomStatus((current) => ({ ...current, mock: "연결됨" }));
    setKiwoomMessage("모의 환경 연결이 준비되었습니다.");
  }

  function confirmRealConnection() {
    setShowRealConnectWarning(false);
    setKiwoomStatus((current) => ({ ...current, real: "연결됨" }));
    setKiwoomMessage("실전 환경 연결이 준비되었습니다. 실제 주문 가능 환경이므로 주문 실행 전 설정을 다시 확인하세요.");
  }

  function requestExecutionMode(nextMode) {
    if (nextMode === executionMode) return;
    setPendingExecutionMode(nextMode);
  }

  function confirmExecutionModeChange() {
    if (!pendingExecutionMode) return;
    setExecutionMode(pendingExecutionMode);
    setKiwoomMessage(`${accountProfiles[pendingExecutionMode].shortLabel} 환경으로 전환했습니다. 해당 환경의 잔고, 보유 종목, 전략 목록이 적용됩니다.`);
    setPendingExecutionMode(null);
  }

  useEffect(() => {
    setNicknameDraft(nickname || "AeroTrade 사용자");
  }, [nickname]);

  return (
    <>
      <PageHeader
        title="설정"
        description="프로필, 화면 모드, 비밀번호, 키움증권 연결, 주문 실행 방식을 관리합니다."
        action={
          <button className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-label-caps text-label-caps hover:bg-surface-container-highest transition-colors" type="button">초기화</button>
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
          <div className="p-widget-padding space-y-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="w-20 h-20 rounded-lg bg-primary-container flex items-center justify-center shrink-0">
                <Icon className="text-[36px] text-on-primary-container">person</Icon>
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-gutter">
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">닉네임</span>
                  <input className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface" type="text" value={nicknameDraft} onChange={(event) => setNicknameDraft(event.target.value)} onBlur={() => updateNickname(nicknameDraft)} />
                </label>
                <label className="block">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">프로필 사진</span>
                  <input className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-sm text-body-sm text-on-surface file:mr-3 file:border-0 file:bg-surface-container-high file:text-primary file:font-label-caps" type="file" accept="image/*" />
                </label>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter">
              <PasswordField label="현재 비밀번호" placeholder="현재 비밀번호" />
              <PasswordField label="새 비밀번호" placeholder="8자 이상" />
              <PasswordField label="새 비밀번호 확인" placeholder="다시 입력" />
              <button className="self-end py-2 rounded bg-primary-container text-on-primary-container font-title-sm text-title-sm hover:brightness-110 transition-all" type="button" onClick={() => setPasswordMessage("보안 변경사항 적용 요청이 준비되었습니다. Supabase Auth 연결 후 실제 변경이 실행됩니다.")}>변경사항 적용</button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{passwordMessage}</p>
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
                  <button className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${active ? "border-primary/50 bg-primary/5" : "border-outline-variant hover:bg-surface-container-highest"}`} key={mode} type="button" onClick={() => setOrderMode(mode)}>
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
              <div className={`flex items-center gap-2 px-2 py-1 rounded ${kiwoomStatus[executionMode] === "연결됨" ? "bg-secondary/10 text-secondary" : "bg-surface-container-high text-on-surface-variant"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${kiwoomStatus[executionMode] === "연결됨" ? "bg-secondary" : "bg-outline"}`} />
                <span className="font-label-caps text-label-caps">{activeKiwoomLabel} {kiwoomStatus[executionMode]}</span>
              </div>
            </div>
            <div className="p-widget-padding space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
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
              </div>
              <p className={`font-body-sm text-body-sm ${executionMode === "real" ? "text-tertiary" : "text-on-surface-variant"}`}>
                {kiwoomMessage}
              </p>
              <div className="flex flex-col sm:flex-row gap-gutter">
                <button className="flex-1 py-2 rounded bg-primary-container text-on-primary-container font-title-sm text-title-sm hover:brightness-110 transition-all flex items-center justify-center gap-2" type="button" onClick={connectKiwoom}>
                  <Icon className="text-[16px]">link</Icon>
                  연결
                </button>
                <button
                  className="px-4 py-2 rounded border border-outline-variant text-on-surface-variant font-title-sm text-title-sm hover:bg-surface-container-highest"
                  type="button"
                  onClick={() => {
                    setKiwoomCredentials((current) => ({ ...current, [executionMode]: { appKey: "", appSecret: "" } }));
                    setKiwoomStatus((current) => ({ ...current, [executionMode]: "미연결" }));
                    setKiwoomMessage(`${activeKiwoomLabel} API 키를 다시 입력합니다.`);
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
                ["주문 체결 알림", "매수와 매도 체결 결과를 알려줍니다.", true],
                ["전략 상태 알림", "전략이 시작되거나 중지될 때 알려줍니다.", true],
                ["시스템 점검 알림", "API 연결, 데이터 수신 상태 변화를 알려줍니다.", false]
              ].map(([title, desc, checked]) => (
                <label className="flex flex-1 items-center justify-between gap-3 p-widget-padding" key={title}>
                  <span>
                    <span className="block font-title-sm text-title-sm text-on-surface">{title}</span>
                    <span className="block font-body-sm text-body-sm text-on-surface-variant mt-1">{desc}</span>
                  </span>
                  <input className="rounded bg-surface-container-lowest border-outline-variant text-primary focus:ring-primary" type="checkbox" defaultChecked={checked} />
                </label>
              ))}
            </div>
          </Section>
        </div>
      </div>
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
                  className="px-4 py-2 rounded bg-error-container text-on-error-container font-label-caps text-label-caps hover:brightness-110"
                  type="button"
                  onClick={confirmRealConnection}
                >
                  실전으로 연결
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PasswordField({ label, placeholder }) {
  return (
    <label className="block">
      <span className="font-label-caps text-label-caps text-on-surface-variant">{label}</span>
      <input className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-label-mono text-label-mono text-on-surface" type="password" placeholder={placeholder} />
    </label>
  );
}

function LoginPage({ onSignIn, updateNickname }) {
  const [mode, setMode] = useState("login");
  const [nickname, setNickname] = useState("");

  return (
    <main className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-6 font-body-md text-body-md">
      <section className="w-full max-w-[460px] bg-surface-container border border-outline-variant rounded-lg overflow-hidden">
        <div className="p-6 border-b border-outline-variant">
          <h1 className="font-display text-display text-primary uppercase">AeroTrade</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">Supabase 인증 연결을 고려한 로그인 화면입니다.</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-gutter">
            <button className={`py-2 rounded border font-label-caps text-label-caps ${mode === "login" ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant"}`} type="button" onClick={() => setMode("login")}>로그인</button>
            <button className={`py-2 rounded border font-label-caps text-label-caps ${mode === "signup" ? "border-primary bg-primary/10 text-primary" : "border-outline-variant text-on-surface-variant"}`} type="button" onClick={() => setMode("signup")}>회원가입</button>
          </div>

          {mode === "signup" ? (
            <label className="block">
              <span className="font-label-caps text-label-caps text-on-surface-variant">닉네임</span>
              <input className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface" placeholder="상단바에 표시할 이름" value={nickname} onChange={(event) => setNickname(event.target.value)} />
            </label>
          ) : null}

          <label className="block">
            <span className="font-label-caps text-label-caps text-on-surface-variant">이메일</span>
            <input className="mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-body-md text-body-md text-on-surface" placeholder="you@example.com" type="email" />
          </label>
          <PasswordField label="비밀번호" placeholder="비밀번호" />

          <button
            className="w-full py-3 rounded bg-primary-container text-on-primary-container font-title-sm text-title-sm font-bold hover:brightness-110"
            type="button"
            onClick={() => {
              if (mode === "signup" && nickname.trim()) updateNickname(nickname);
              onSignIn();
            }}
          >
            {mode === "signup" ? "회원가입" : "로그인"}
          </button>

          <button className="w-full text-center font-body-sm text-body-sm text-on-surface-variant hover:text-primary" type="button" onClick={() => setMode("reset")}>
            비밀번호를 잊으셨나요?
          </button>

          {mode === "reset" ? (
            <div className="bg-surface-container-low rounded border border-outline-variant p-4">
              <h2 className="font-headline-md text-headline-md text-on-surface">비밀번호 재설정</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Supabase Auth 연결 후 이메일 재설정 링크를 발송할 수 있습니다.</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default App;
