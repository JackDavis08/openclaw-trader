"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EquityPoint } from "@shared/web/api-types";

interface EquityChartProps {
  data: EquityPoint[];
}

export function EquityChart({ data }: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    let disposed = false;

    void (async () => {
      // Dynamic import — lightweight-charts is client-only
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lc = (await import("lightweight-charts")) as any;
      if (disposed || !containerRef.current) return;

      // Clean up previous chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      const chart = lc.createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 280,
        layout: {
          background: { type: lc.ColorType.Solid, color: "transparent" },
          textColor: "rgba(255,255,255,0.5)",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.04)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.1)",
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.1)",
          timeVisible: true,
        },
        crosshair: {
          horzLine: { style: lc.LineStyle.Dashed },
          vertLine: { style: lc.LineStyle.Dashed },
        },
      });

      const initial = data[0]?.equity ?? 0;
      const last = data[data.length - 1]?.equity ?? 0;
      const lineColor = last >= initial ? "#34d399" : "#f87171";

      const series = chart.addSeries(lc.LineSeries, {
        color: lineColor,
        lineWidth: 2,
        priceFormat: { type: "price", precision: 2 },
      });

      const chartData = data.map((p) => ({
        time: Math.floor(p.timestamp / 1000),
        value: p.equity,
      }));

      series.setData(chartData);
      chart.timeScale().fitContent();
      chartRef.current = chart;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      resizeObserver.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Equity Curve
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        {data.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
            No equity data yet
          </div>
        ) : (
          <div ref={containerRef} className="w-full" />
        )}
      </CardContent>
    </Card>
  );
}
