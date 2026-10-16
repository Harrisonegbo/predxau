import type { Bar, CalendarEvent, NewsItem, Quote, ScoredNews } from "./types";

const KEY = "predxau_scored";

let scores: ScoredNews[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    scores = Array.isArray(raw) ? raw.filter((s) => s && typeof s.score === "number") : [];
  } catch {
    scores = [];
  }
}

export function getScores(): ScoredNews[] {
  hydrate();
  return scores;
}

export function setScores(next: ScoredNews[]) {
  scores = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function subscribeScores(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const cacheKeys = {
  quote: "predxau_quote",
  daily: "predxau_daily",
  hourly: "predxau_hourly",
  news: "predxau_news",
  cal: "predxau_cal",
  theme: "predxau_theme",
  auto: "predxau_auto",
  notif: "predxau_notif",
  query: "predxau_query",
} as const;

export type CacheBundle = {
  quote: Quote | null;
  daily: Bar[];
  hourly: Bar[];
  news: NewsItem[];
  calendar: CalendarEvent[];
};

export function readCache(): CacheBundle {
  return {
    quote: readJson<Quote | null>(cacheKeys.quote, null),
    daily: readJson<Bar[]>(cacheKeys.daily, []),
    hourly: readJson<Bar[]>(cacheKeys.hourly, []),
    news: readJson<NewsItem[]>(cacheKeys.news, []),
    calendar: readJson<CalendarEvent[]>(cacheKeys.cal, []),
  };
}

export function clearMarketCache() {
  for (const key of [cacheKeys.quote, cacheKeys.daily, cacheKeys.hourly, cacheKeys.news, cacheKeys.cal]) {
    localStorage.removeItem(key);
  }
}
