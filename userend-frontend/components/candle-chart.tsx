'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Minus, Plus, RotateCcw } from 'lucide-react';

export interface ChartCandle {
  openTime: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

const DEFAULT_BAR_SPACING = 8;
const MIN_BAR_SPACING = 0.8;
const MAX_BAR_SPACING = 220;

/**
 * Candlestick + volume chart.
 * - Trackpad pinch (ctrl+wheel) and two-finger scroll zoom with a natural,
 *   responsive exponential curve (default LWC wheel zoom feels sluggish).
 * - Drag to pan, buttons for quick zoom/reset, touch gestures untouched
 *   (native pinch works well on mobile).
 */
export function CandleChart({
  candles,
  livePrice,
  height = 420,
}: {
  candles: ChartCandle[];
  livePrice?: number | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const barSpacingRef = useRef(DEFAULT_BAR_SPACING);
  const candlesRef = useRef<ChartCandle[]>(candles);
  candlesRef.current = candles;

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const chart = createChart(container, {
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
      timeScale: { timeVisible: true, secondsVisible: false, barSpacing: DEFAULT_BAR_SPACING, rightOffset: 6 },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      crosshair: { mode: 0 },
      handleScale: { mouseWheel: false, pinch: true }, // wheel handled manually below
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    chartRef.current = chart;
    candleSeriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;

    // Custom wheel zoom — smooth exponential response for trackpads & mice.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const speed = e.ctrlKey ? 0.02 : 0.011; // pinch zooms faster than scroll
      const factor = Math.exp(-e.deltaY * speed);
      const next = Math.min(
        MAX_BAR_SPACING,
        Math.max(MIN_BAR_SPACING, barSpacingRef.current * factor),
      );
      if (next !== barSpacingRef.current) {
        barSpacingRef.current = next;
        chart.timeScale().applyOptions({ barSpacing: next });
      }
    };
    container.addEventListener('wheel', onWheel, { passive: false });

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      container.removeEventListener('wheel', onWheel);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;
    const data: CandlestickData[] = [];
    const volumes: { time: UTCTimestamp; value: number; color: string }[] = [];
    for (const c of candles) {
      const time = Math.floor(new Date(c.openTime).getTime() / 1000) as UTCTimestamp;
      data.push({ time, open: c.open, high: c.high, low: c.low, close: c.close });
      volumes.push({
        time,
        value: c.volume ?? 0,
        color: c.close >= c.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
      });
    }
    data.sort((a, b) => Number(a.time) - Number(b.time));
    volumes.sort((a, b) => Number(a.time) - Number(b.time));
    candleSeriesRef.current.setData(data);
    volumeSeriesRef.current.setData(volumes);
  }, [candles]);

  // live last-candle update from the tick stream
  useEffect(() => {
    if (!candleSeriesRef.current || !livePrice || candles.length === 0) return;
    const last = candles[candles.length - 1]!;
    const nowBucket = Math.floor(Date.now() / 60000) * 60000;
    const lastOpenMs = new Date(last.openTime).getTime();
    const time = Math.floor(nowBucket / 1000) as UTCTimestamp;
    const isCurrent = nowBucket === lastOpenMs;
    candleSeriesRef.current.update({
      time,
      open: isCurrent ? last.open : livePrice,
      high: Math.max(isCurrent ? last.high : livePrice, livePrice),
      low: Math.min(isCurrent ? last.low : livePrice, livePrice),
      close: livePrice,
    });
    if (volumeSeriesRef.current && isCurrent) {
      volumeSeriesRef.current.update({
        time,
        value: (last.volume ?? 0) + 1,
        color: livePrice >= last.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
      });
    }
  }, [livePrice, candles]);

  function zoom(factor: number) {
    const chart = chartRef.current;
    if (!chart) return;
    barSpacingRef.current = Math.min(
      MAX_BAR_SPACING,
      Math.max(MIN_BAR_SPACING, barSpacingRef.current * factor),
    );
    chart.timeScale().applyOptions({ barSpacing: barSpacingRef.current });
  }

  function resetZoom() {
    const chart = chartRef.current;
    if (!chart) return;
    barSpacingRef.current = DEFAULT_BAR_SPACING;
    chart.timeScale().applyOptions({ barSpacing: DEFAULT_BAR_SPACING });
    chart.timeScale().fitContent();
  }

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1 rounded-lg border border-border bg-background/85 p-1 backdrop-blur">
        <button
          onClick={() => zoom(1.45)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => zoom(1 / 1.45)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={resetZoom}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="Reset zoom"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
