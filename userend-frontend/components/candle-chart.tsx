'use client';

import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, type CandlestickData, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';

export function CandleChart({
  candles,
  livePrice,
  height = 420,
}: {
  candles: { openTime: string | number; open: number; high: number; low: number; close: number }[];
  livePrice?: number | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: 'rgba(255,255,255,0.6)',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.06)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      crosshair: { mode: 0 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    const data: CandlestickData[] = candles.map((c) => ({
      // Backend returns `openTime` (ISO string or ms) — lightweight-charts needs Unix seconds.
      time: Math.floor(new Date(c.openTime).getTime() / 1000) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    data.sort((a, b) => Number(a.time) - Number(b.time));
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // live last-candle update from tick stream
  useEffect(() => {
    if (!seriesRef.current || !livePrice || candles.length === 0) return;
    const last = candles[candles.length - 1]!;
    const nowBucket = Math.floor(Date.now() / 60000) * 60000;
    const lastOpenMs = new Date(last.openTime).getTime();
    const time = Math.floor(nowBucket / 1000) as UTCTimestamp;
    seriesRef.current.update({
      time,
      open: nowBucket === lastOpenMs ? last.open : livePrice,
      high: Math.max(nowBucket === lastOpenMs ? last.high : livePrice, livePrice),
      low: Math.min(nowBucket === lastOpenMs ? last.low : livePrice, livePrice),
      close: livePrice,
    });
  }, [livePrice, candles]);

  return <div ref={containerRef} className="w-full" />;
}
