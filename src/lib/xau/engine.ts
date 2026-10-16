import type {
  Bar,
  CalendarEvent,
  Factors,
  Impact,
  Prediction,
  ScoredNews,
  Structure,
} from "./types";

const BULLISH_KW = [
  "war",
  "conflict",
  "geopolitical",
  "tension",
  "safe haven",
  "dovish",
  "rate cut",
  "pivot",
  "recession",
  "crisis",
  "inflation hedge",
  "central bank buy",
  "weak dollar",
  "falling yields",
  "risk off",
];

const BEARISH_KW = [
  "rate hike",
  "hawkish",
  "strong dollar",
  "rising yields",
  "fed hike",
  "tightening",
  "strong usd",
  "higher rates",
  "risk on",
  "strong data",
  "hot inflation",
];

export function formatPrice(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return "—";
  return Number(p).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function impactOf(score: number): Impact {
  if (score >= 3) return { text: "Bullish", tone: "bull" };
  if (score <= -3) return { text: "Bearish", tone: "bear" };
  return { text: "Neutral", tone: "flat" };
}

export function suggestScore(title = "", desc = ""): number {
  const text = `${title} ${desc}`.toLowerCase();
  let score = 0;
  for (const k of BULLISH_KW) if (text.includes(k)) score += 2;
  for (const k of BEARISH_KW) if (text.includes(k)) score -= 2;
  return Math.max(-8, Math.min(8, score));
}

export function weightedAverage(scored: ScoredNews[]): number {
  if (!scored.length) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  scored.forEach((s, i) => {
    const recency = Math.max(0.25, 1 - i * 0.045);
    const magnitude = 1 + Math.abs(s.score) * 0.06;
    const w = recency * magnitude;
    weightedSum += s.score * w;
    weightTotal += w;
  });
  return weightTotal ? weightedSum / weightTotal : 0;
}

function findSwings(bars: Bar[], left = 2, right = 2) {
  const swings: { i: number; type: "H" | "L"; price: number }[] = [];
  for (let i = left; i < bars.length - right; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= left; j++) {
      if (bars[i].high <= bars[i - j].high) isHigh = false;
      if (bars[i].low >= bars[i - j].low) isLow = false;
    }
    for (let j = 1; j <= right; j++) {
      if (bars[i].high <= bars[i + j].high) isHigh = false;
      if (bars[i].low >= bars[i + j].low) isLow = false;
    }
    if (isHigh) swings.push({ i, type: "H", price: bars[i].high });
    if (isLow) swings.push({ i, type: "L", price: bars[i].low });
  }
  return swings;
}

function openFvgs(bars: Bar[], lookback = 28) {
  const fvgs: { type: "bull" | "bear"; top: number; bottom: number; i: number; filled: boolean }[] =
    [];
  const start = Math.max(2, bars.length - lookback);
  for (let i = start; i < bars.length; i++) {
    const c0 = bars[i - 2];
    const c2 = bars[i];
    if (c2.low > c0.high) fvgs.push({ type: "bull", top: c2.low, bottom: c0.high, i, filled: false });
    if (c2.high < c0.low) fvgs.push({ type: "bear", top: c0.low, bottom: c2.high, i, filled: false });
  }
  for (const f of fvgs) {
    for (let k = f.i + 1; k < bars.length; k++) {
      if (f.type === "bull" && bars[k].low <= f.bottom) {
        f.filled = true;
        break;
      }
      if (f.type === "bear" && bars[k].high >= f.top) {
        f.filled = true;
        break;
      }
    }
  }
  return fvgs.filter((f) => !f.filled).slice(-4);
}

export function analyzeStructure(hourly: Bar[], daily: Bar[], price: number | null): Structure | null {
  const bars = hourly.length >= 20 ? hourly : daily;
  if (bars.length < 15 || price == null) return null;

  const swings = findSwings(bars);
  const highs = swings.filter((s) => s.type === "H");
  const lows = swings.filter((s) => s.type === "L");

  let bias: Structure["bias"] = "Ranging";
  let event = "None";
  let eventDetail = "";

  if (highs.length >= 2 && lows.length >= 2) {
    const lastH = highs[highs.length - 1];
    const prevH = highs[highs.length - 2];
    const lastL = lows[lows.length - 1];
    const prevL = lows[lows.length - 2];
    const hh = lastH.price > prevH.price;
    const hl = lastL.price > prevL.price;
    const lh = lastH.price < prevH.price;
    const ll = lastL.price < prevL.price;

    if (hh && hl) {
      bias = "Bullish";
      event = "HH + HL";
    } else if (lh && ll) {
      bias = "Bearish";
      event = "LH + LL";
    } else if (hh && ll) {
      event = "HH + LL";
    } else if (lh && hl) {
      event = "LH + HL";
    }

    if (bias === "Bullish" && price > lastH.price) {
      event = "BOS ↑";
      eventDetail = `Break of structure above ${lastH.price.toFixed(2)}`;
    } else if (bias === "Bearish" && price < lastL.price) {
      event = "BOS ↓";
      eventDetail = `Break of structure below ${lastL.price.toFixed(2)}`;
    } else if (bias === "Bullish" && price < lastL.price) {
      event = "CHoCH ↓";
      eventDetail = `Change of character below ${lastL.price.toFixed(2)}`;
      bias = "Bearish";
    } else if (bias === "Bearish" && price > lastH.price) {
      event = "CHoCH ↑";
      eventDetail = `Change of character above ${lastH.price.toFixed(2)}`;
      bias = "Bullish";
    }
  }

  const look = bars.slice(-24);
  const rangeHigh = Math.max(...look.map((b) => b.high));
  const rangeLow = Math.min(...look.map((b) => b.low));
  const eq = (rangeHigh + rangeLow) / 2;
  const pos = (price - rangeLow) / (rangeHigh - rangeLow + 1e-9);
  let zone: Structure["zone"] = "Equilibrium";
  if (pos > 0.62) zone = "Premium";
  else if (pos < 0.38) zone = "Discount";

  const fvgs = openFvgs(bars);
  const nearestFvg = fvgs.length ? fvgs[fvgs.length - 1] : null;
  const keyHigh = highs.length ? highs[highs.length - 1].price : rangeHigh;
  const keyLow = lows.length ? lows[lows.length - 1].price : rangeLow;

  let score = 0;
  if (bias === "Bullish") score += 3.5;
  if (bias === "Bearish") score -= 3.5;
  if (event.startsWith("BOS ↑") || event.startsWith("CHoCH ↑")) score += 2.8;
  if (event.startsWith("BOS ↓") || event.startsWith("CHoCH ↓")) score -= 2.8;
  if (zone === "Discount" && bias === "Bullish") score += 1.5;
  if (zone === "Premium" && bias === "Bearish") score -= 1.5;
  if (zone === "Premium" && bias === "Bullish") score -= 0.8;
  if (zone === "Discount" && bias === "Bearish") score += 0.8;
  if (nearestFvg) {
    if (nearestFvg.type === "bull" && price > nearestFvg.bottom) score += 1.2;
    if (nearestFvg.type === "bear" && price < nearestFvg.top) score -= 1.2;
  }
  score = Math.max(-8, Math.min(8, score));

  return {
    bias,
    event,
    eventDetail,
    zone,
    score,
    keyHigh,
    keyLow,
    eq,
    rangeHigh,
    rangeLow,
    nearestFvg: nearestFvg
      ? { type: nearestFvg.type, top: nearestFvg.top, bottom: nearestFvg.bottom }
      : null,
    pos: (pos * 100).toFixed(0),
  };
}

const EMPTY_FACTORS: Factors = {
  newsForce: "0.00",
  newsScore: "0.00",
  techScore: "0.00",
  macroScore: "0.00",
  structScore: "0.00",
  structBias: "—",
  structEvent: "—",
  structZone: "—",
  momentum: "0.00",
  atrPct: "0.00",
  volRegime: "—",
  aligned: false,
  strongAligned: false,
  nearEvents: 0,
  recentHighImpact: 0,
  wNews: "0%",
  wTech: "0%",
  wMacro: "0%",
  wStruct: "0%",
};

export function computePrediction(args: {
  horizonDays: number;
  price: number | null;
  scored: ScoredNews[];
  daily: Bar[];
  hourly: Bar[];
  calendar: CalendarEvent[];
  structure: Structure | null;
}): Prediction {
  const { horizonDays, price, scored, daily, hourly, calendar, structure } = args;
  if (price == null) {
    return {
      dir: "SIDEWAYS",
      cls: "side",
      low: null,
      high: null,
      expectedPct: "0.00",
      conf: "—",
      signal: "No data",
      probUp: 50,
      drivers: [],
      reasoning: "Waiting for a live gold price.",
      factors: EMPTY_FACTORS,
    };
  }

  const now = Date.now();
  const drivers: Prediction["drivers"] = [];
  let newsForce = 0;
  let newsWeightSum = 0;
  let recentHighImpact = 0;

  scored.slice(0, 30).forEach((s, i) => {
    const ageFactor = Math.exp(-i * 0.155);
    const magBoost = 1 + Math.pow(Math.abs(s.score) / 10, 1.6) * 2.25;
    const w = ageFactor * magBoost;
    newsForce += s.score * w;
    newsWeightSum += w;
    if (Math.abs(s.score) >= 4 && i < 8) recentHighImpact++;
    if (Math.abs(s.score) >= 3) drivers.push({ title: s.title, score: s.score, weight: w });
  });
  newsForce = newsWeightSum > 0 ? newsForce / newsWeightSum : 0;
  const velocityBoost = 1 + Math.min(0.38, recentHighImpact * 0.095);
  const newsScore = newsForce * velocityBoost;

  let momShort = 0;
  let momMed = 0;
  const useHourly = horizonDays <= 3 && hourly.length >= 12;
  const tfBars = useHourly ? hourly : daily;
  if (tfBars.length >= 6) {
    const closes = tfBars.map((b) => b.close);
    const last = closes[closes.length - 1];
    const lbS = useHourly ? Math.min(6, closes.length - 1) : Math.min(3, closes.length - 1);
    if (closes[closes.length - 1 - lbS] > 0) {
      momShort = ((last - closes[closes.length - 1 - lbS]) / closes[closes.length - 1 - lbS]) * 100;
    }
    const lbM = useHourly
      ? Math.min(18, closes.length - 1)
      : Math.min(horizonDays <= 5 ? 7 : 11, closes.length - 1);
    if (closes[closes.length - 1 - lbM] > 0) {
      momMed = ((last - closes[closes.length - 1 - lbM]) / closes[closes.length - 1 - lbM]) * 100;
    }
    if (Math.abs(momShort) > (useHourly ? 0.9 : 2.5)) momShort *= 0.68;
    if (Math.abs(momMed) > (useHourly ? 1.8 : 4.2)) momMed *= 0.74;
  }
  const momentum = momShort * 0.6 + momMed * 0.4;

  let atrPct = 1.1;
  if (tfBars.length >= 8) {
    let sum = 0;
    const n = Math.min(useHourly ? 12 : 14, tfBars.length);
    for (let i = tfBars.length - n; i < tfBars.length; i++) {
      const b = tfBars[i];
      sum += ((b.high - b.low) / b.close) * 100;
    }
    atrPct = sum / n;
    if (useHourly) atrPct *= 2.2;
  }
  const volRegime = atrPct > 1.7 ? "High" : atrPct > 1.05 ? "Normal" : "Low";
  const volMult = atrPct > 1.7 ? 1.3 : atrPct < 0.9 ? 0.8 : 1;
  const techScore = momentum * 1.75 * (volMult > 1 ? 1.09 : 1);

  let calendarBoost = 1;
  let nearEvents = 0;
  const horizonMs = horizonDays * 86_400_000;
  for (const ev of calendar) {
    const delta = new Date(ev.time).getTime() - now;
    if (delta > -8 * 3_600_000 && delta < horizonMs) {
      nearEvents++;
      calendarBoost += 0.145 * Math.max(0, 1 - delta / horizonMs);
    }
  }
  calendarBoost = Math.min(1.8, calendarBoost);
  const macroScore =
    (nearEvents > 0 ? (newsScore !== 0 ? Math.sign(newsScore) : Math.sign(techScore)) * 1.8 : 0) *
    (calendarBoost - 1);

  const structScore = structure ? structure.score : 0;

  let wNews = scored.length >= 3 ? 0.36 : 0.22;
  let wTech = daily.length >= 8 ? 0.28 : 0.18;
  let wMacro = nearEvents > 0 ? 0.14 : 0.06;
  let wStruct = structure ? 0.22 : 0.08;
  const wSum = wNews + wTech + wMacro + wStruct;
  wNews /= wSum;
  wTech /= wSum;
  wMacro /= wSum;
  wStruct /= wSum;

  let combinedForce = newsScore * wNews + techScore * wTech + macroScore * wMacro + structScore * wStruct;
  const newsSign = Math.sign(newsScore) || 0;
  const techSign = Math.sign(techScore) || 0;
  const structSign = Math.sign(structScore) || 0;
  const aligned =
    (newsSign !== 0 && newsSign === structSign) || (techSign !== 0 && techSign === structSign);
  const strongAligned =
    newsSign !== 0 && techSign !== 0 && newsSign === techSign && newsSign === structSign;
  const conflict =
    newsSign !== 0 &&
    structSign !== 0 &&
    newsSign !== structSign &&
    techSign !== 0 &&
    techSign !== structSign;
  const alignmentMult = strongAligned ? 1.55 : aligned ? 1.32 : conflict ? 0.65 : 1;
  combinedForce *= alignmentMult;

  const timeScale = Math.sqrt(horizonDays / 2.05);
  let expectedPct = combinedForce * 0.255 * timeScale * calendarBoost * volMult;
  if (Math.sign(expectedPct) === Math.sign(momMed) && Math.abs(momMed) > 3.3) expectedPct *= 0.8;
  expectedPct = Math.max(-7.5, Math.min(7.5, expectedPct));

  const baseVol = 0.76 + Math.abs(combinedForce) * 0.105 + nearEvents * 0.075 + atrPct * 0.17;
  const rangePct = baseVol * timeScale * (aligned ? 0.8 : 1.2);
  const mid = price * (1 + expectedPct / 100);
  const low = mid * (1 - rangePct / 100);
  const high = mid * (1 + rangePct / 100);

  let dir = "SIDEWAYS";
  let cls: Prediction["cls"] = "side";
  let probUp = 50;
  if (expectedPct > 0.22) {
    dir = "BULLISH";
    cls = "up";
    probUp = Math.min(94, 54 + Math.abs(expectedPct) * 8.8 + (aligned ? 10 : 0) + recentHighImpact * 1.6);
  } else if (expectedPct < -0.22) {
    dir = "BEARISH";
    cls = "down";
    probUp = Math.max(6, 46 - Math.abs(expectedPct) * 8.8 - (aligned ? 10 : 0) - recentHighImpact * 1.6);
  } else {
    probUp = 50 + expectedPct * 15;
  }

  const absForce = Math.abs(combinedForce);
  let signal = "Weak";
  if (absForce > 4.6 && aligned && recentHighImpact >= 2) signal = "Very strong";
  else if (absForce > 3.4 || (absForce > 2.5 && aligned)) signal = "Strong";
  else if (absForce > 1.55) signal = "Moderate";

  const confNum = Math.min(
    96,
    26 +
      Math.abs(newsForce) * 5.2 +
      (aligned ? 15 : 0) +
      Math.min(scored.length, 16) * 1.45 +
      (nearEvents > 0 ? 8 : 0) +
      (daily.length >= 8 ? 7 : 0) +
      recentHighImpact * 2.6,
  );

  const parts: string[] = [];
  if (Math.abs(newsForce) > 1.2) {
    parts.push(
      newsForce > 0
        ? `News sees bullish force (${newsForce.toFixed(1)}) across ${recentHighImpact} high-impact items`
        : `News sees bearish force (${newsForce.toFixed(1)}) across ${recentHighImpact} high-impact items`,
    );
  }
  if (Math.abs(momentum) > 0.6) {
    parts.push(
      momentum > 0
        ? `Price momentum is positive (+${momentum.toFixed(1)}%)`
        : `Price momentum is negative (${momentum.toFixed(1)}%)`,
    );
  }
  if (structure) {
    parts.push(
      `Structure is ${structure.bias.toLowerCase()}, ${structure.event}, sitting in ${structure.zone.toLowerCase()} (${structure.score > 0 ? "+" : ""}${structure.score.toFixed(1)})`,
    );
  }
  if (nearEvents > 0) {
    parts.push(`${nearEvents} high-impact US print${nearEvents === 1 ? "" : "s"} inside this window`);
  }
  if (strongAligned) parts.push("News, technicals, and structure agree");
  else if (aligned) parts.push("Structure confirms the other models");
  else if (conflict) parts.push("Structure disagrees, so the signal is damped");
  if (volRegime === "High") parts.push("Volatility is elevated, so the range is wider");
  if (!parts.length) {
    parts.push(scored.length === 0 ? "Score a few headlines to give the news model something to weigh" : "Inputs are mixed, so the desk stays neutral");
  }

  return {
    dir,
    cls,
    low: Math.round(low * 100) / 100,
    high: Math.round(high * 100) / 100,
    expectedPct: expectedPct.toFixed(2),
    conf: `${confNum.toFixed(0)}%`,
    signal,
    probUp: Math.round(probUp),
    drivers: drivers.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 6),
    reasoning: `${parts.join(". ")}.`,
    factors: {
      newsForce: newsForce.toFixed(2),
      newsScore: newsScore.toFixed(2),
      techScore: techScore.toFixed(2),
      macroScore: macroScore.toFixed(2),
      structScore: structScore.toFixed(2),
      structBias: structure?.bias ?? "—",
      structEvent: structure?.event ?? "—",
      structZone: structure?.zone ?? "—",
      momentum: momentum.toFixed(2),
      atrPct: atrPct.toFixed(2),
      volRegime,
      aligned,
      strongAligned,
      nearEvents,
      recentHighImpact,
      wNews: `${(wNews * 100).toFixed(0)}%`,
      wTech: `${(wTech * 100).toFixed(0)}%`,
      wMacro: `${(wMacro * 100).toFixed(0)}%`,
      wStruct: `${(wStruct * 100).toFixed(0)}%`,
    },
  };
}

export function sma(values: number[], period: number): (number | null)[] {
  return values.map((_, i, arr) => {
    if (i < period - 1) return null;
    const slice = arr.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}
