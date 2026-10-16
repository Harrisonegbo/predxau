import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPrice, sma } from "@/lib/xau/engine";
import type { Bar as Ohlc, Structure } from "@/lib/xau/types";

function axisTime(iso: string, hourly: boolean) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return hourly
    ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type CandleRow = {
  label: string;
  wick: [number, number];
  up: boolean;
  o: number;
  h: number;
  l: number;
  c: number;
};

function CandleShape(raw: unknown) {
  const props = raw as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    payload?: CandleRow;
  };
  const { x, y, width, height, payload } = props;
  if (x == null || y == null || width == null || height == null || !payload) return <g />;
  const color = payload.up ? "var(--bull)" : "var(--bear)";
  const range = payload.h - payload.l || 1;
  const bodyTop = (payload.h - Math.max(payload.o, payload.c)) / range;
  const bodyH = Math.max(1.5, (Math.abs(payload.c - payload.o) / range) * height);
  const cx = x + width / 2;
  const bw = Math.max(4, Math.min(9, width * 0.62));
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1.25} />
      <rect x={cx - bw / 2} y={y + bodyTop * height} width={bw} height={bodyH} fill={color} rx={1} />
    </g>
  );
}

export function StructureChart({
  bars,
  hourly,
  structure,
}: {
  bars: Ohlc[];
  hourly: boolean;
  structure: Structure | null;
}) {
  const slice = bars.slice(hourly ? -36 : -30);
  const rows: CandleRow[] = slice.map((b) => ({
    label: axisTime(b.openTime, hourly),
    wick: [b.low, b.high],
    up: b.close >= b.open,
    o: b.open,
    h: b.high,
    l: b.low,
    c: b.close,
  }));
  if (!rows.length) {
    return <p className="py-16 text-center text-sm text-mute">Waiting for candles.</p>;
  }
  const min = Math.min(...rows.map((r) => r.l));
  const max = Math.max(...rows.map((r) => r.h));
  const pad = (max - min) * 0.08 || 2;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--mute)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            orientation="right"
            tick={{ fill: "var(--mute)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={58}
            tickFormatter={(v: number) => `$${Math.round(v)}`}
          />
          <Tooltip
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as CandleRow | undefined;
              if (!active || !row) return null;
              return (
                <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-cream shadow-lg">
                  <div className="mb-1 text-mute">{row.label}</div>
                  <div className="tabular-nums">
                    O {formatPrice(row.o)} · H {formatPrice(row.h)}
                    <br />
                    L {formatPrice(row.l)} · C {formatPrice(row.c)}
                  </div>
                </div>
              );
            }}
          />
          {structure && (
            <>
              <ReferenceLine y={structure.keyHigh} stroke="var(--bear)" strokeDasharray="4 4" strokeOpacity={0.85} />
              <ReferenceLine y={structure.keyLow} stroke="var(--bull)" strokeDasharray="4 4" strokeOpacity={0.85} />
              <ReferenceLine y={structure.eq} stroke="var(--gold)" strokeDasharray="2 3" />
            </>
          )}
          <Bar dataKey="wick" shape={CandleShape} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyChart({ bars }: { bars: Ohlc[] }) {
  const closes = bars.map((b) => b.close);
  const avg = sma(closes, 8);
  const rows = bars.map((b, i) => ({
    label: axisTime(b.openTime, false),
    close: b.close,
    sma: avg[i],
  }));
  if (!rows.length) {
    return <p className="py-16 text-center text-sm text-mute">No daily history yet.</p>;
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--mute)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            orientation="right"
            domain={["auto", "auto"]}
            tick={{ fill: "var(--mute)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={58}
            tickFormatter={(v: number) => `$${Math.round(v)}`}
          />
          <Tooltip
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as { label: string; close: number; sma: number | null } | undefined;
              if (!active || !row) return null;
              return (
                <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-cream shadow-lg">
                  <div className="mb-1 text-mute">{row.label}</div>
                  <div className="tabular-nums">Close ${formatPrice(row.close)}</div>
                  {row.sma != null && <div className="tabular-nums text-mute">SMA 8 ${formatPrice(row.sma)}</div>}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke="var(--gold)"
            strokeWidth={2}
            fill="var(--gold-wash)"
            isAnimationActive={false}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="sma"
            stroke="var(--mute)"
            strokeWidth={1.4}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
