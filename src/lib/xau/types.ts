export type Bar = {
  openTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Quote = {
  price: number;
  bid?: number;
  ask?: number;
  high?: number;
  low?: number;
  dayDiffPercent?: number;
  source: string;
  time: string;
  marketState?: string;
};

export type NewsItem = {
  id: string;
  url: string;
  title: string;
  description: string;
  published_at?: string;
  host?: string;
  country?: string;
};

export type ScoredNews = {
  id: string;
  url?: string;
  title: string;
  host?: string;
  published_at?: string;
  score: number;
  scored_at: string;
};

export type CalendarEvent = {
  id: string;
  time: string;
  name: string;
  actual: number | string | null;
  forecast: number | string | null;
  previous: number | string | null;
  countryCode?: string;
  importance?: string;
};

export type Fvg = { type: "bull" | "bear"; top: number; bottom: number };

export type Structure = {
  bias: "Bullish" | "Bearish" | "Ranging";
  event: string;
  eventDetail: string;
  zone: "Premium" | "Discount" | "Equilibrium";
  score: number;
  keyHigh: number;
  keyLow: number;
  eq: number;
  rangeHigh: number;
  rangeLow: number;
  nearestFvg: Fvg | null;
  pos: string;
};

export type Factors = {
  newsForce: string;
  newsScore: string;
  techScore: string;
  macroScore: string;
  structScore: string;
  structBias: string;
  structEvent: string;
  structZone: string;
  momentum: string;
  atrPct: string;
  volRegime: string;
  aligned: boolean;
  strongAligned: boolean;
  nearEvents: number;
  recentHighImpact: number;
  wNews: string;
  wTech: string;
  wMacro: string;
  wStruct: string;
};

export type Driver = { title: string; score: number; weight: number };

export type Prediction = {
  dir: string;
  cls: "up" | "down" | "side";
  low: number | null;
  high: number | null;
  expectedPct: string;
  conf: string;
  signal: string;
  probUp: number;
  drivers: Driver[];
  reasoning: string;
  factors: Factors;
};

export type Impact = { text: "Bullish" | "Bearish" | "Neutral"; tone: "bull" | "bear" | "flat" };
