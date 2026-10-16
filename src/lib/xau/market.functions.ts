import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Bar, CalendarEvent, NewsItem, Quote } from "./types";

async function getJson(url: string, ms = 7000): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return res.json();
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asBars(raw: unknown): Bar[] {
  const bars = (raw as { bars?: unknown })?.bars;
  if (!Array.isArray(bars)) return [];
  const out: Bar[] = [];
  for (const b of bars) {
    if (!b || typeof b !== "object") continue;
    const row = b as Record<string, unknown>;
    const open = num(row.open);
    const high = num(row.high);
    const low = num(row.low);
    const close = num(row.close);
    if (open == null || high == null || low == null || close == null) continue;
    out.push({
      openTime: String(row.openTime ?? ""),
      open,
      high,
      low,
      close,
    });
  }
  return out.reverse();
}

export const fetchQuote = createServerFn({ method: "GET" }).handler(async (): Promise<Quote> => {
  try {
    const d = (await getJson("https://biquote.io/api/XAUUSD", 4000)) as Record<string, unknown>;
    const mid = num(d.mid);
    const bid = num(d.bid);
    const ask = num(d.ask);
    const price = mid ?? (bid != null && ask != null ? (bid + ask) / 2 : null);
    if (price == null || price < 500) throw new Error("bad quote");
    return {
      price,
      bid: bid ?? undefined,
      ask: ask ?? undefined,
      high: num(d.high) ?? undefined,
      low: num(d.low) ?? undefined,
      dayDiffPercent: num(d.dayDiffPercent) ?? undefined,
      source: "biquote.io",
      time: String(d.timestamp ?? new Date().toISOString()),
      marketState: typeof d.marketState === "string" ? d.marketState : undefined,
    };
  } catch {
    const d = (await getJson(
      "https://api.goldprice.dev/v1/prices?symbol=XAU-USD-SPOT",
      5000,
    )) as { symbols?: { price?: string }[] };
    const price = num(d.symbols?.[0]?.price);
    if (price == null) throw new Error("Gold quote unavailable");
    return { price, source: "goldprice.dev", time: new Date().toISOString() };
  }
});

export const fetchBars = createServerFn({ method: "GET" }).handler(async () => {
  const [dailyRaw, hourlyRaw] = await Promise.all([
    getJson("https://biquote.io/api/XAUUSD/ohlc?interval=1d&limit=40"),
    getJson("https://biquote.io/api/XAUUSD/ohlc?interval=1h&limit=48"),
  ]);
  return { daily: asBars(dailyRaw), hourly: asBars(hourlyRaw) };
});

export const fetchNews = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().trim().min(2).max(240),
      size: z.number().int().min(5).max(30),
    }),
  )
  .handler(async ({ data }): Promise<NewsItem[]> => {
    const url = `https://freenewsapi.ai/v1/search?q=${encodeURIComponent(data.q)}&lang=en&size=${data.size}&sort=date`;
    const json = (await getJson(url, 9000)) as { results?: unknown[] };
    const results = Array.isArray(json.results) ? json.results : [];
    return results.map((item, idx) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id ?? idx),
        url: typeof row.url === "string" ? row.url : "",
        title: typeof row.title === "string" && row.title ? row.title : "Untitled",
        description: typeof row.description === "string" ? row.description : "",
        published_at: typeof row.published_at === "string" ? row.published_at : undefined,
        host: typeof row.host === "string" ? row.host : undefined,
        country: typeof row.country === "string" ? row.country : undefined,
      };
    });
  });

export const fetchCalendar = createServerFn({ method: "GET" }).handler(
  async (): Promise<CalendarEvent[]> => {
    const json = await getJson("https://biquote.io/api/calendar?importance=high&countries=US");
    const rows = Array.isArray(json) ? json : [];
    return rows.slice(0, 25).map((item, idx) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const value = (v: unknown) =>
        typeof v === "number" || typeof v === "string" ? v : v == null ? null : String(v);
      return {
        id: String(row.id ?? idx),
        time: String(row.time ?? ""),
        name: String(row.name ?? "Release"),
        actual: value(row.actual),
        forecast: value(row.forecast),
        previous: value(row.previous),
        countryCode: typeof row.countryCode === "string" ? row.countryCode : undefined,
        importance: typeof row.importance === "string" ? row.importance : undefined,
      };
    });
  },
);
