"use client";

import * as React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

type Series = {
  userId: string;
  displayName: string;
  data: { matchday: number; total: number }[];
};

// Distinct, lively palette tuned to read well on light + dark backgrounds.
const PALETTE = [
  "hsl(142.1 76.2% 36.3%)", // primary green
  "hsl(221 83% 53%)", // blue
  "hsl(25 95% 53%)", // orange
  "hsl(330 81% 60%)", // pink
  "hsl(262 83% 58%)", // violet
  "hsl(48 96% 53%)", // amber
  "hsl(173 80% 40%)", // teal
  "hsl(0 84% 60%)", // red
];

function buildData(series: Series[]) {
  const matchdays = new Set<number>();
  for (const s of series) for (const p of s.data) matchdays.add(p.matchday);
  const sorted = Array.from(matchdays).sort((a, b) => a - b);

  return sorted.map((md) => {
    const row: Record<string, number> = { matchday: md };
    for (const s of series) {
      const point = s.data.find((p) => p.matchday === md);
      if (point) row[s.userId] = point.total;
    }
    return row;
  });
}

export function PointsChart({
  series,
  className,
}: {
  series: Series[];
  className?: string;
}) {
  const data = React.useMemo(() => buildData(series), [series]);

  if (series.length === 0 || data.length === 0) {
    return (
      <div
        className={cn(
          "flex h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground",
          className
        )}
      >
        No points history yet.
      </div>
    );
  }

  return (
    <div className={cn("h-[320px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="matchday"
            tickLine={false}
            axisLine={false}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickFormatter={(v) => `MD ${v}`}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            width={36}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "0.5rem",
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              color: "hsl(var(--card-foreground))",
              fontSize: "0.8125rem",
            }}
            labelFormatter={(v) => `Matchday ${v}`}
            formatter={(value, _name, item) => [
              value as number,
              (item?.payload &&
                series.find((s) => s.userId === item.dataKey)?.displayName) ||
                (item?.dataKey as string),
            ]}
          />
          <Legend
            formatter={(value) =>
              series.find((s) => s.userId === value)?.displayName ?? value
            }
            wrapperStyle={{ fontSize: "0.8125rem", paddingTop: 8 }}
          />
          {series.map((s, i) => (
            <Line
              key={s.userId}
              type="monotone"
              dataKey={s.userId}
              name={s.userId}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
