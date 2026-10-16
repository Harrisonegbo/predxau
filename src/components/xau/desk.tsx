import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Bell,
  CalendarDays,
  CandlestickChart,
  Cpu,
  Download,
  Gauge,
  Moon,
  Newspaper,
  RefreshCw,
  Settings,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { DailyChart, StructureChart } from "@/components/xau/charts";
import {
  analyzeStructure,
  computePrediction,
  formatPrice,
  impactOf,
  suggestScore,
  weightedAverage,
} from "@/lib/xau/engine";
import { fetchBars, fetchCalendar, fetchNews, fetchQuote } from "@/lib/xau/market.functions";
import {
  cacheKeys,
  clearMarketCache,
  getScores,
  readCache,
  readJson,
  setScores,
  subscribeScores,
  writeJson,
} from "@/lib/xau/storage";
import type { Bar, CalendarEvent, NewsItem, Quote, ScoredNews } from "@/lib/xau/types";

const EMPTY_SCORES: ScoredNews[] = [];

const TABS: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: "desk", label: "Desk", icon: Gauge },
  { id: "news", label: "News", icon: Newspaper },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "scores", label: "Scores", icon: CandlestickChart },
  { id: "engine", label: "Engine", icon: Cpu },
  { id: "settings", label: "Settings", icon: Settings },
];

const DEFAULT_QUERY = "gold Fed";

function toneClass(tone: "up" | "down" | "side" | "bull" | "bear" | "flat") {
  if (tone === "up" || tone === "bull") return "text-bull";
  if (tone === "down" || tone === "bear") return "text-bear";
  return "text-mute";
}

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const saved = readJson<string>(cacheKeys.theme, "dark") === "light" ? "light" : "dark";
    setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeJson(cacheKeys.theme, theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

export function Desk() {
  const scores = useSyncExternalStore(subscribeScores, getScores, () => EMPTY_SCORES);
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState<Tab>("desk");
  const [online, setOnline] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [daily, setDaily] = useState<Bar[]>([]);
  const [hourly, setHourly] = useState<Bar[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [loadingBars, setLoadingBars] = useState(true);
  const [newsError, setNewsError] = useState("");
  const [loadingNews, setLoadingNews] = useState(true);
  const [loadingCal, setLoadingCal] = useState(false);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [size, setSize] = useState(20);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [auto, setAuto] = useState(true);
  const [notif, setNotif] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const cache = readCache();
    if (cache.quote) setQuote(cache.quote);
    if (cache.daily.length) setDaily(cache.daily);
    if (cache.hourly.length) setHourly(cache.hourly);
    if (cache.news.length) setNews(cache.news);
    if (cache.calendar.length) setCalendar(cache.calendar);
    setQuery(readJson(cacheKeys.query, DEFAULT_QUERY));
    setAuto(readJson(cacheKeys.auto, true));
    setNotif(readJson(cacheKeys.notif, false));
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const tick = () =>
      setClock(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let stop = false;
    async function loadQuote() {
      try {
        const q = await fetchQuote();
        if (stop) return;
        setQuote(q);
        writeJson(cacheKeys.quote, q);
      } catch {
        if (!stop) toast.error("Live quote missed. Showing the last saved price.");
      } finally {
        if (!stop) setLoadingQuote(false);
      }
    }
    async function loadBars() {
      try {
        const bars = await fetchBars();
        if (stop) return;
        setDaily(bars.daily);
        setHourly(bars.hourly);
        writeJson(cacheKeys.daily, bars.daily);
        writeJson(cacheKeys.hourly, bars.hourly);
      } catch {
        if (!stop) toast.error("Candle history did not load.");
      } finally {
        if (!stop) setLoadingBars(false);
      }
    }
    async function loadCal() {
      setLoadingCal(true);
      try {
        const events = await fetchCalendar();
        if (stop) return;
        setCalendar(events);
        writeJson(cacheKeys.cal, events);
      } catch {
        /* cached calendar remains */
      } finally {
        if (!stop) setLoadingCal(false);
      }
    }
    void loadQuote();
    void loadBars();
    void loadCal();
    void (async () => {
      setLoadingNews(true);
      try {
        const q = readJson(cacheKeys.query, DEFAULT_QUERY);
        const items = await fetchNews({ data: { q, size: 20 } });
        if (stop) return;
        setNews(items);
        writeJson(cacheKeys.news, items);
      } catch {
        /* cached headlines remain */
      } finally {
        if (!stop) setLoadingNews(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!auto || !online) return;
    const id = window.setInterval(() => {
      void fetchQuote()
        .then((q) => {
          setQuote(q);
          writeJson(cacheKeys.quote, q);
          if (notif && q.dayDiffPercent != null && Math.abs(q.dayDiffPercent) >= 0.8) {
            if (Notification.permission === "granted") {
              new Notification("PredXAU move", {
                body: `XAUUSD ${q.dayDiffPercent >= 0 ? "+" : ""}${q.dayDiffPercent.toFixed(2)}% on the day`,
              });
            }
          }
        })
        .catch(() => undefined);
    }, 25_000);
    return () => window.clearInterval(id);
  }, [auto, online, notif]);

  const structure = useMemo(
    () => analyzeStructure(hourly, daily, quote?.price ?? null),
    [hourly, daily, quote?.price],
  );

  const outlook = useMemo(() => {
    const base = {
      price: quote?.price ?? null,
      scored: scores,
      daily,
      hourly,
      calendar,
      structure,
    };
    return {
      d2: computePrediction({ ...base, horizonDays: 2 }),
      w1: computePrediction({ ...base, horizonDays: 7 }),
      m1: computePrediction({ ...base, horizonDays: 30 }),
    };
  }, [quote?.price, scores, daily, hourly, calendar, structure]);

  const aggregate = weightedAverage(scores);
  const dayPct = quote?.dayDiffPercent;
  const dayUsd = quote && dayPct != null ? (quote.price * dayPct) / 100 : null;

  async function scan() {
    setLoadingNews(true);
    setNewsError("");
    try {
      const items = await fetchNews({ data: { q: query.trim() || DEFAULT_QUERY, size } });
      setNews(items);
      writeJson(cacheKeys.news, items);
      writeJson(cacheKeys.query, query);
      const next: Record<string, number> = {};
      for (const item of items) {
        const saved = scores.find((s) => s.id === item.id);
        if (!saved) {
          const sug = suggestScore(item.title, item.description);
          if (sug) next[item.id] = sug;
        }
      }
      setDrafts((d) => ({ ...next, ...d }));
      toast.success(`${items.length} headlines in`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "News scan failed";
      setNewsError(message);
      toast.error("News scan failed. Cached headlines stay on screen.");
    } finally {
      setLoadingNews(false);
    }
  }

  function scoreFor(item: NewsItem) {
    const saved = scores.find((s) => s.id === item.id);
    if (drafts[item.id] != null) return drafts[item.id];
    if (saved) return saved.score;
    return 0;
  }

  function nudge(item: NewsItem, delta: number) {
    const current = scoreFor(item);
    const next = Math.max(-10, Math.min(10, current + delta));
    setDrafts((d) => ({ ...d, [item.id]: next }));
  }

  function save(item: NewsItem) {
    const score = drafts[item.id] ?? scores.find((s) => s.id === item.id)?.score ?? suggestScore(item.title, item.description);
    const entry: ScoredNews = {
      id: item.id,
      url: item.url,
      title: item.title,
      host: item.host,
      published_at: item.published_at,
      score,
      scored_at: new Date().toISOString(),
    };
    const rest = scores.filter((s) => s.id !== entry.id);
    setScores([entry, ...rest]);
    toast.success(`Saved ${score > 0 ? "+" : ""}${score}`);
    if (notif && Math.abs(score) >= 5 && Notification.permission === "granted") {
      new Notification("High-impact score", { body: `${score > 0 ? "+" : ""}${score}: ${item.title.slice(0, 80)}` });
    }
  }

  function exportScores() {
    const blob = new Blob([JSON.stringify(scores, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "predxau-scores.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importScores(file: File) {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error("not a list");
      const clean = data.filter(
        (s) => s && typeof s.id === "string" && typeof s.score === "number" && typeof s.title === "string",
      ) as ScoredNews[];
      setScores(clean);
      toast.success(`Imported ${clean.length} scores`);
    } catch {
      toast.error("That file is not a PredXAU score export.");
    }
  }

  const nextEvent = useMemo(() => {
    const now = Date.now();
    return [...calendar]
      .map((e) => ({ ...e, t: new Date(e.time).getTime() }))
      .filter((e) => Number.isFinite(e.t) && e.t > now - 30 * 60_000)
      .sort((a, b) => a.t - b.t)[0];
  }, [calendar]);

  const structBars = hourly.length >= 12 ? hourly : daily;
  const structHourly = hourly.length >= 12;

  return (
    <div className="min-h-screen bg-bg text-cream">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <a href="/" className="flex items-center gap-2.5">
            <Mark />
            <span className="leading-tight">
              <span className="block font-display text-xl tracking-tight text-gold">PredXAU</span>
              <span className="block text-[11px] uppercase tracking-[0.16em] text-mute">predxau.com</span>
            </span>
          </a>
          <div className="ml-auto flex items-center gap-2 text-xs text-mute">
            <span className={`inline-block size-2 rounded-full ${online ? "bg-bull" : "bg-bear"}`} />
            <span>{online ? "Live" : "Offline cache"}</span>
            {clock && <span className="hidden sm:inline tabular-nums">{clock}</span>}
          </div>
          <button
            type="button"
            onClick={toggle}
            className="inline-flex size-11 items-center justify-center rounded-full border border-line text-cream"
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3" aria-label="Sections">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm ${
                  active ? "bg-gold text-ink" : "text-cream hover:bg-panel"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {tab === "desk" && (
          <div className="space-y-4">
            <section className="grid gap-4 lg:grid-cols-12">
              <article className="rounded-2xl border border-line bg-panel p-5 lg:col-span-5">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-mute">
                  <span>XAUUSD spot</span>
                  <span>{quote?.marketState === "open" ? "Market open" : quote ? "Quote" : "Connecting"}</span>
                </div>
                <p className="mt-3 font-display text-5xl tabular-nums tracking-tight text-gold sm:text-6xl">
                  {loadingQuote && !quote ? "…" : `$${formatPrice(quote?.price)}`}
                </p>
                <p className={`mt-2 text-base tabular-nums ${dayUsd != null && dayUsd < 0 ? "text-bear" : "text-bull"}`}>
                  {dayUsd == null
                    ? quote?.bid
                      ? `Bid ${formatPrice(quote.bid)} · Ask ${formatPrice(quote.ask)}`
                      : "Day change pending"
                    : `${dayUsd >= 0 ? "+" : ""}${formatPrice(dayUsd)}  ${dayPct! >= 0 ? "+" : ""}${dayPct!.toFixed(2)}% today`}
                </p>
                <p className="mt-3 text-xs text-mute">
                  {quote
                    ? `${quote.source} · ${new Date(quote.time).toLocaleTimeString()} · H ${formatPrice(quote.high)} · L ${formatPrice(quote.low)}`
                    : "Pulling the live mid."}
                </p>
                <button
                  type="button"
                  className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-gold px-4 text-sm font-medium text-ink"
                  onClick={() => {
                    setLoadingQuote(true);
                    void fetchQuote()
                      .then((q) => {
                        setQuote(q);
                        writeJson(cacheKeys.quote, q);
                      })
                      .catch(() => toast.error("Refresh failed"))
                      .finally(() => setLoadingQuote(false));
                  }}
                >
                  <RefreshCw className={`size-4 ${loadingQuote ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </article>

              <article className="rounded-2xl border border-line bg-panel p-5 lg:col-span-3">
                <h2 className="text-xs uppercase tracking-[0.14em] text-mute">News pressure</h2>
                <p className={`mt-3 font-display text-5xl tabular-nums ${aggregate > 1 ? "text-bull" : aggregate < -1 ? "text-bear" : "text-cream"}`}>
                  {aggregate >= 0 ? "+" : ""}
                  {aggregate.toFixed(1)}
                </p>
                <p className="mt-2 text-sm text-mute">{scores.length} scored headline{scores.length === 1 ? "" : "s"}</p>
                <p className="mt-4 text-xs leading-relaxed text-mute">
                  Plus is safe-haven or dovish. Minus is a firm dollar or a hawkish print. Scale runs −10 to +10.
                </p>
              </article>

              <article className="rounded-2xl border border-gold/40 bg-panel p-5 lg:col-span-4">
                <h2 className="text-xs uppercase tracking-[0.14em] text-gold">Two-day pre-move</h2>
                <p className={`mt-3 font-display text-4xl ${toneClass(outlook.d2.cls)}`}>{outlook.d2.dir}</p>
                <p className="mt-1 text-sm text-cream">
                  {outlook.d2.signal} signal · {outlook.d2.conf} confidence · {outlook.d2.probUp}% chance up
                </p>
                <p className="mt-3 text-sm tabular-nums text-mute">
                  {outlook.d2.low != null
                    ? `$${formatPrice(outlook.d2.low)} – $${formatPrice(outlook.d2.high)} (${Number(outlook.d2.expectedPct) > 0 ? "+" : ""}${outlook.d2.expectedPct}%)`
                    : "Range appears once price is in."}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-mute">{outlook.d2.reasoning}</p>
              </article>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <Outlook label="2 days" pred={outlook.d2} />
              <Outlook label="1 week" pred={outlook.w1} />
              <Outlook label="1 month" pred={outlook.m1} />
            </section>

            {nextEvent && (
              <p className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-mute">
                Next US high-impact print:{" "}
                <span className="text-cream">{nextEvent.name}</span>
                {" · "}
                <span className="tabular-nums text-cream">
                  {new Date(nextEvent.time).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {nextEvent.forecast != null && <span> · forecast {String(nextEvent.forecast)}</span>}
              </p>
            )}

            <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl text-cream">Market structure</h2>
                  <p className="text-sm text-mute">Swings, breaks, fair-value gaps, premium and discount.</p>
                </div>
                <p className="text-xs text-mute">{structHourly ? "Hourly candles" : "Daily candles"}</p>
              </div>
              {structure ? (
                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                  <Stat label="Bias" value={structure.bias} tone={structure.bias === "Bullish" ? "up" : structure.bias === "Bearish" ? "down" : "side"} />
                  <Stat label="Last event" value={structure.event} tone={structure.event.includes("↑") ? "up" : structure.event.includes("↓") ? "down" : "side"} />
                  <Stat label="Zone" value={structure.zone} tone={structure.zone === "Discount" ? "up" : structure.zone === "Premium" ? "down" : "side"} />
                </div>
              ) : (
                <p className="mb-3 text-sm text-mute">{loadingBars ? "Reading structure…" : "Not enough bars yet."}</p>
              )}
              {structure && (
                <p className="mb-3 text-sm leading-relaxed text-mute">
                  Score {structure.score > 0 ? "+" : ""}
                  {structure.score.toFixed(1)} · price is {structure.pos}% up the recent range.
                  {structure.eventDetail ? ` ${structure.eventDetail}.` : ""}
                  {structure.nearestFvg
                    ? ` Open ${structure.nearestFvg.type} gap ${formatPrice(structure.nearestFvg.bottom)}–${formatPrice(structure.nearestFvg.top)}.`
                    : ""}
                </p>
              )}
              {structure && (
                <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-mute">
                  <span>Swing high <b className="text-bear">{formatPrice(structure.keyHigh)}</b></span>
                  <span>Equilibrium <b className="text-gold">{formatPrice(structure.eq)}</b></span>
                  <span>Swing low <b className="text-bull">{formatPrice(structure.keyLow)}</b></span>
                </p>
              )}
              <StructureChart bars={structBars} hourly={structHourly} structure={structure} />
            </section>

            <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-display text-2xl">Daily close</h2>
                <p className="text-xs text-mute">Gold line · dashed 8-day average</p>
              </div>
              <DailyChart bars={daily} />
            </section>

            <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <h2 className="mb-3 font-display text-2xl">Recent scores</h2>
              {scores.length === 0 ? (
                <p className="py-6 text-center text-sm text-mute">
                  Nothing scored yet. Open News and mark how each headline should lean gold.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {scores.slice(0, 5).map((s) => {
                    const impact = impactOf(s.score);
                    return (
                      <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                        <div>
                          <p className="text-sm text-cream">{s.title}</p>
                          <p className="text-xs text-mute">{new Date(s.scored_at).toLocaleString()}</p>
                        </div>
                        <span className={`shrink-0 text-sm font-medium tabular-nums ${toneClass(impact.tone)}`}>
                          {s.score > 0 ? "+" : ""}
                          {s.score} {impact.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "news" && (
          <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
            <h2 className="font-display text-2xl">Drivers of gold</h2>
            <p className="mt-1 max-w-2xl text-sm text-mute">
              Fed, inflation, yields, the dollar, and geopolitics. A suggested score is a keyword hint — you decide what sticks.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 flex-1 rounded-xl border border-line bg-bg px-3 text-sm text-cream outline-none focus:border-gold"
                aria-label="News query"
              />
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="h-11 rounded-xl border border-line bg-bg px-3 text-sm text-cream"
                aria-label="Article count"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
              <button
                type="button"
                onClick={() => void scan()}
                disabled={loadingNews}
                className="h-11 rounded-full bg-gold px-5 text-sm font-medium text-ink disabled:opacity-60"
              >
                {loadingNews ? "Scanning…" : news.length ? "Scan again" : "Scan news"}
              </button>
            </div>
            <div className="mt-4">
              {news.length === 0 ? (
                <p className="py-10 text-center text-sm text-mute">
                  {loadingNews
                    ? "Scanning wires…"
                    : newsError
                      ? newsError
                      : "Nothing matched. Try a shorter query such as gold Fed."}
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {news.map((item) => {
                    const score = scoreFor(item);
                    const impact = impactOf(score);
                    const sug = suggestScore(item.title, item.description);
                    const saved = scores.some((s) => s.id === item.id);
                    return (
                      <li key={item.id} className="py-4">
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer" className="text-base font-medium text-cream hover:text-gold">
                            {item.title}
                          </a>
                        ) : (
                          <p className="text-base font-medium">{item.title}</p>
                        )}
                        <p className="mt-1 text-xs text-mute">
                          {[item.host, item.published_at ? new Date(item.published_at).toLocaleString() : "", item.country]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {item.description && (
                          <p className="mt-2 text-sm leading-relaxed text-mute">
                            {item.description.slice(0, 180)}
                            {item.description.length > 180 ? "…" : ""}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button type="button" className="size-11 rounded-lg border border-line text-lg" onClick={() => nudge(item, -1)} aria-label="Lower score">
                            −
                          </button>
                          <span className={`min-w-10 text-center text-lg font-medium tabular-nums ${toneClass(impact.tone)}`}>
                            {score > 0 ? "+" : ""}
                            {score}
                          </span>
                          <button type="button" className="size-11 rounded-lg border border-line text-lg" onClick={() => nudge(item, 1)} aria-label="Raise score">
                            +
                          </button>
                          <span className={`rounded-full px-2 py-1 text-xs ${toneClass(impact.tone)}`}>{impact.text}</span>
                          {sug !== 0 && !saved && (
                            <button
                              type="button"
                              className="text-xs text-gold underline-offset-2 hover:underline"
                              onClick={() => setDrafts((d) => ({ ...d, [item.id]: sug }))}
                            >
                              Suggest {sug > 0 ? "+" : ""}
                              {sug}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => save(item)}
                            className="h-11 rounded-full border border-line px-4 text-sm hover:border-gold"
                          >
                            {saved ? "Update" : "Save"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {tab === "calendar" && (
          <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">US high-impact calendar</h2>
                <p className="mt-1 text-sm text-mute">CPI, payrolls, the Fed, and the other prints that usually shove gold.</p>
              </div>
              <button
                type="button"
                className="h-11 rounded-full bg-gold px-4 text-sm font-medium text-ink"
                onClick={() => {
                  setLoadingCal(true);
                  void fetchCalendar()
                    .then((events) => {
                      setCalendar(events);
                      writeJson(cacheKeys.cal, events);
                      toast.success(`${events.length} events`);
                    })
                    .catch(() => toast.error("Calendar did not load"))
                    .finally(() => setLoadingCal(false));
                }}
              >
                {loadingCal ? "Loading…" : "Refresh"}
              </button>
            </div>
            {calendar.length === 0 ? (
              <p className="py-10 text-center text-sm text-mute">
                {loadingCal ? "Loading the calendar…" : "No events cached yet."}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {calendar.map((ev) => (
                  <li key={ev.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-cream">{ev.name}</p>
                      <p className="text-xs tabular-nums text-mute">
                        Actual {ev.actual ?? "—"} · Forecast {ev.forecast ?? "—"} · Previous {ev.previous ?? "—"}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs tabular-nums text-mute">
                      {ev.time
                        ? new Date(ev.time).toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "scores" && (
          <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
            <h2 className="font-display text-2xl">Recorded impact</h2>
            <p className="mt-1 text-sm text-mute">Stored in this browser. Nothing is uploaded.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={exportScores} className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm">
                <Download className="size-4" /> Export
              </button>
              <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm">
                <Upload className="size-4" /> Import
                <input
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importScores(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {confirmClear ? (
                <button
                  type="button"
                  className="h-11 rounded-full bg-bear px-4 text-sm text-cream"
                  onClick={() => {
                    setScores([]);
                    setConfirmClear(false);
                    toast.success("Scores cleared");
                  }}
                >
                  Confirm clear
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-bear/50 px-4 text-sm text-bear"
                >
                  <Trash2 className="size-4" /> Clear all
                </button>
              )}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-mute">
                  <tr>
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Headline</th>
                    <th className="py-2 font-medium">Score</th>
                    <th className="py-2 font-medium">Impact</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {scores.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-mute">
                        No scores yet.
                      </td>
                    </tr>
                  ) : (
                    scores.map((s) => {
                      const impact = impactOf(s.score);
                      return (
                        <tr key={s.id} className="border-t border-line">
                          <td className="py-3 align-top text-xs tabular-nums text-mute">
                            {new Date(s.scored_at).toLocaleDateString()}
                          </td>
                          <td className="max-w-xs py-3 pr-3 align-top">{s.title}</td>
                          <td className={`py-3 align-top font-medium tabular-nums ${toneClass(impact.tone)}`}>
                            {s.score > 0 ? "+" : ""}
                            {s.score}
                          </td>
                          <td className={`py-3 align-top text-xs ${toneClass(impact.tone)}`}>{impact.text}</td>
                          <td className="py-3 text-right align-top">
                            <button
                              type="button"
                              className="size-11 rounded-lg text-mute hover:text-bear"
                              aria-label="Remove score"
                              onClick={() => setScores(scores.filter((x) => x.id !== s.id))}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "engine" && (
          <section className="space-y-4">
            <article className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <h2 className="font-display text-2xl">Ensemble pre-move</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mute">
                Four models vote before the move is obvious: news you scored, multi-timeframe momentum, the US calendar, and market structure. This is a desk tool, not a trade recommendation.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Outlook label="2-day outlook" pred={outlook.d2} detail />
                <Outlook label="1-week outlook" pred={outlook.w1} detail />
                <Outlook label="1-month outlook" pred={outlook.m1} detail />
              </div>
            </article>
            <article className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <h3 className="font-display text-xl">Why the two-day call</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{outlook.d2.reasoning}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {outlook.d2.drivers.length === 0 ? (
                  <li className="text-mute">No high-impact scores yet. The news vote stays quiet until you rate a few headlines.</li>
                ) : (
                  outlook.d2.drivers.map((d) => (
                    <li key={d.title} className="text-cream">
                      <span className={`tabular-nums ${d.score > 0 ? "text-bull" : "text-bear"}`}>
                        {d.score > 0 ? "+" : ""}
                        {d.score}
                      </span>{" "}
                      {d.title}
                    </li>
                  ))
                )}
              </ul>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Model name="News" value={outlook.d2.factors.newsScore} weight={outlook.d2.factors.wNews} />
                <Model name="Technical" value={outlook.d2.factors.techScore} weight={outlook.d2.factors.wTech} />
                <Model name="Macro" value={outlook.d2.factors.macroScore} weight={outlook.d2.factors.wMacro} />
                <Model name="Structure" value={outlook.d2.factors.structScore} weight={outlook.d2.factors.wStruct} />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-mute">
                Volatility {outlook.d2.factors.volRegime} · ATR {outlook.d2.factors.atrPct}% · momentum {outlook.d2.factors.momentum}% · alignment{" "}
                {outlook.d2.factors.strongAligned ? "strong" : outlook.d2.factors.aligned ? "yes" : "no"} · structure{" "}
                {outlook.d2.factors.structBias}, {outlook.d2.factors.structEvent}, {outlook.d2.factors.structZone}
              </p>
            </article>
          </section>
        )}

        {tab === "settings" && (
          <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
            <h2 className="font-display text-2xl">Settings</h2>
            <p className="mt-1 text-sm text-mute">
              Scores stay on this device. Price, candles, news, and the calendar fall back to the last save when the feed drops.
            </p>
            <label className="mt-5 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  setAuto(e.target.checked);
                  writeJson(cacheKeys.auto, e.target.checked);
                }}
                className="size-4 accent-[var(--gold)]"
              />
              Refresh the spot every 25 seconds while online
            </label>
            <label className="mt-3 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={notif}
                onChange={async (e) => {
                  const on = e.target.checked;
                  if (on && "Notification" in window && Notification.permission === "default") {
                    await Notification.requestPermission();
                  }
                  setNotif(on);
                  writeJson(cacheKeys.notif, on);
                }}
                className="size-4 accent-[var(--gold)]"
              />
              <Bell className="size-4 text-mute" />
              Notify on a large day move or a score of ±5
            </label>
            <button
              type="button"
              className="mt-5 h-11 rounded-full border border-line px-4 text-sm"
              onClick={() => {
                clearMarketCache();
                setNews([]);
                toast.success("Market cache cleared");
              }}
            >
              Clear market cache
            </button>
            <p className="mt-6 text-xs leading-relaxed text-mute">
              Live mid and OHLC from biquote.io, with goldprice.dev as a backup quote. Headlines from freenewsapi.ai. The ensemble runs in your browser.
            </p>
          </section>
        )}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-mute">
        PredXAU · predxau.com · Educational only · Not financial advice
      </footer>
    </div>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 36 36" className="size-9" aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="var(--gold)" />
      <path d="M10 23.5 18 11l8 12.5" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M13.2 19.2h9.6" stroke="var(--ink)" strokeWidth="2.2" />
    </svg>
  );
}

function Outlook({
  label,
  pred,
  detail,
}: {
  label: string;
  pred: ReturnType<typeof computePrediction>;
  detail?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-mute">{label}</p>
      <p className={`mt-1 font-display text-2xl ${toneClass(pred.cls)}`}>{pred.dir}</p>
      <p className="mt-1 text-sm tabular-nums text-cream">
        {pred.low != null ? `$${formatPrice(pred.low)} – $${formatPrice(pred.high)}` : "—"}
      </p>
      <p className="text-xs text-mute">
        {Number(pred.expectedPct) > 0 ? "+" : ""}
        {pred.expectedPct}% · {pred.probUp}% up
        {detail ? ` · ${pred.signal} · ${pred.conf}` : ""}
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "side" }) {
  return (
    <div className="rounded-xl bg-bg px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-mute">{label}</p>
      <p className={`font-display text-xl ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

function Model({ name, value, weight }: { name: string; value: string; weight: string }) {
  const n = Number(value);
  return (
    <div className="rounded-xl bg-bg px-3 py-3">
      <p className="text-xs uppercase tracking-[0.12em] text-mute">{name}</p>
      <p className={`mt-1 font-display text-2xl tabular-nums ${n > 0.4 ? "text-bull" : n < -0.4 ? "text-bear" : "text-cream"}`}>
        {n > 0 ? "+" : ""}
        {value}
      </p>
      <p className="text-xs text-mute">Weight {weight}</p>
    </div>
  );
}
