import { env } from '../../config/env.js';
import { logger } from '../../shared/utils/logger.js';
import { Asset, type AssetDoc } from './asset.model.js';
import { Candle } from './candle.model.js';
import { SocketEvents } from '../../constants/index.js';
import { getIO } from '../../sockets/io.js';
import { raiseAlert } from '../admin/systemAlert.model.js';
import { logAudit } from '../audit/audit.model.js';

interface SymbolState {
  symbol: string;
  price: number;
  basePrice: number;
  volatility: number;
  driftReversion: number;
}

const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
};

const states = new Map<string, SymbolState>();
const liveCandles = new Map<string, { open: number; high: number; low: number; close: number; ticks: number }>();

let tickTimer: NodeJS.Timeout | null = null;
let watchdogTimer: NodeJS.Timeout | null = null;
let lastTickAt = 0;
let stale = false;
let paused = false; // devtools demo trigger
let staleSince: number | null = null;
let startedAt = 0;

function floorToInterval(ts: number, interval: string): number {
  return Math.floor(ts / INTERVAL_MS[interval]!) * INTERVAL_MS[interval];
}

function candleKey(symbol: string, interval: string, openTime: number) {
  return `${symbol}|${interval}|${openTime}`;
}

function updateCandles(symbol: string, price: number) {
  const now = Date.now();
  for (const interval of Object.keys(INTERVAL_MS)) {
    const openTime = floorToInterval(now, interval);
    const prefix = `${symbol}|${interval}|`;

    // Flush candles whose window has rolled over (persist + evict)
    for (const [key, c] of liveCandles) {
      if (!key.startsWith(prefix)) continue;
      const t = Number(key.split('|')[2]);
      if (t !== openTime && c.ticks > 0) {
        void persistCandle(symbol, interval, t, c);
        liveCandles.delete(key);
      }
    }

    const key = candleKey(symbol, interval, openTime);
    let c = liveCandles.get(key);
    if (!c) {
      c = { open: price, high: price, low: price, close: price, ticks: 0 };
      liveCandles.set(key, c);
    }
    c.high = Math.max(c.high, price);
    c.low = Math.min(c.low, price);
    c.close = price;
    c.ticks += 1;
  }
}

async function persistCandle(
  symbol: string,
  interval: string,
  openTime: number,
  c: { open: number; high: number; low: number; close: number; ticks: number },
) {
  try {
    await Candle.updateOne(
      { symbol, interval, openTime: new Date(openTime) },
      { $set: { open: c.open, high: c.high, low: c.low, close: c.close, ticks: c.ticks } },
      { upsert: true },
    );
  } catch {
    // candle persistence must never break the feed
  }
}

/** Persist closed 5m/15m aggregates built from persisted 1m candles. */
async function persistAggregates(symbol: string, interval: string) {
  const now = Date.now();
  const boundary = floorToInterval(now, interval);
  if (now - boundary > 5000 && now - boundary < INTERVAL_MS[interval]!) {
    // just rolled over within the last few seconds
    const from = new Date(boundary - INTERVAL_MS[interval]!);
    const to = new Date(boundary - 1);
    const minutes = await Candle.find({
      symbol,
      interval: '1m',
      openTime: { $gte: from, $lte: to },
    })
      .sort({ openTime: 1 })
      .lean();
    if (minutes.length > 0) {
      const open = minutes[0]!.open;
      const close = minutes[minutes.length - 1]!.close;
      const high = Math.max(...minutes.map((m) => m.high));
      const low = Math.min(...minutes.map((m) => m.low));
      try {
        await Candle.updateOne(
          { symbol, interval, openTime: from },
          { $set: { open, high, low, close, ticks: minutes.length } },
          { upsert: true },
        );
      } catch {
        /* noop */
      }
    }
  }
}

function randomWalk(state: SymbolState): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
  const shock = z * state.volatility;
  const reversion = (state.basePrice - state.price) / state.basePrice * state.driftReversion;
  const next = state.price * (1 + shock + reversion);
  return Math.max(next, state.basePrice * 0.2);
}

function tick() {
  if (paused) return;
  const io = getIO();
  const now = Date.now();

  for (const state of states.values()) {
    state.price = randomWalk(state);
    updateCandles(state.symbol, state.price);
  }
  lastTickAt = now;

  if (io) {
    const payload = [...states.values()].map((s) => ({
      symbol: s.symbol,
      price: Number(s.price.toFixed(s.price > 1000 ? 2 : 5)),
      ts: now,
    }));
    io.to('market').emit(SocketEvents.TICK, payload);
  }
}

/** Generate `days` of 1m history and aggregates for all assets (first boot only). */
export async function backfillHistory(days = 7) {
  for (const asset of await Asset.find({ isActive: true })) {
    const existing = await Candle.countDocuments({ symbol: asset.symbol, interval: '1m' });
    if (existing > 100) continue;

    logger.info({ symbol: asset.symbol }, 'backfilling market history');
    let price = asset.basePrice * (1 - asset.volatility * 50);
    const stepMs = INTERVAL_MS['1m']!;
    const total = (days * 24 * 60) / 4; // 4 hours of dense history is plenty for a demo
    const docs: {
      symbol: string;
      interval: string;
      openTime: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      ticks: number;
    }[] = [];
    const start = floorToInterval(Date.now() - total * stepMs, '1m');
    for (let i = 0; i < total; i++) {
      const state: SymbolState = {
        symbol: asset.symbol,
        price,
        basePrice: asset.basePrice,
        volatility: asset.volatility * 3,
        driftReversion: asset.driftReversion,
      };
      const open = price;
      let high = open;
      let low = open;
      for (let j = 0; j < 6; j++) {
        price = randomWalk(state);
        state.price = price;
        high = Math.max(high, price);
        low = Math.min(low, price);
      }
      const openTime = new Date(start + i * stepMs);
      docs.push({
        symbol: asset.symbol,
        interval: '1m',
        openTime,
        open,
        high,
        low,
        close: price,
        ticks: 6,
      });
    }
    // bulk insert in chunks
    for (let i = 0; i < docs.length; i += 500) {
      await Candle.insertMany(docs.slice(i, i + 500), { ordered: false }).catch(() => undefined);
    }
    await buildAggregatesFromMinutes(asset.symbol, '5m');
    await buildAggregatesFromMinutes(asset.symbol, '15m');
  }
}

async function buildAggregatesFromMinutes(symbol: string, interval: string) {
  const stepMs = INTERVAL_MS[interval]!;
  const minutes = await Candle.find({ symbol, interval: '1m' }).sort({ openTime: 1 }).lean();
  const buckets = new Map<number, typeof minutes>();
  for (const m of minutes) {
    const t = floorToInterval(m.openTime.getTime(), interval);
    const arr = buckets.get(t) ?? [];
    arr.push(m);
    buckets.set(t, arr);
  }
  const docs = [...buckets.entries()].map(([t, arr]) => ({
    symbol,
    interval,
    openTime: new Date(t),
    open: arr[0]!.open,
    close: arr[arr.length - 1]!.close,
    high: Math.max(...arr.map((a) => a.high)),
    low: Math.min(...arr.map((a) => a.low)),
    ticks: arr.length,
  }));
  for (let i = 0; i < docs.length; i += 500) {
    await Candle.insertMany(docs.slice(i, i + 500), { ordered: false }).catch(() => undefined);
  }
}

export async function startMarketEngine() {
  const assets: AssetDoc[] = await Asset.find({ isActive: true });
  for (const a of assets) {
    states.set(a.symbol, {
      symbol: a.symbol,
      price: a.lastPrice || a.basePrice,
      basePrice: a.basePrice,
      volatility: a.volatility,
      driftReversion: a.driftReversion,
    });
  }
  startedAt = Date.now();
  lastTickAt = Date.now();

  tickTimer = setInterval(tick, env.MARKET_TICK_MS);

  // persist 1m candles + aggregates + asset lastPrice periodically
  setInterval(
    () => {
      for (const state of states.values()) {
        persistAggregates(state.symbol, '5m').catch(() => undefined);
        persistAggregates(state.symbol, '15m').catch(() => undefined);
        Asset.updateOne({ symbol: state.symbol }, { $set: { lastPrice: state.price } })
          .catch(() => undefined);
      }
    },
    30_000,
  );

  // staleness watchdog
  watchdogTimer = setInterval(async () => {
    const now = Date.now();
    const gap = now - lastTickAt;
    const io = getIO();
    if (!stale && gap > env.MARKET_STALE_MS) {
      stale = true;
      staleSince = lastTickAt;
      logger.warn({ gapMs: gap }, 'MARKET STALE — feed lost');
      io?.to('market').emit(SocketEvents.MARKET_STALE, { since: new Date(lastTickAt).toISOString() });
      await raiseAlert('MARKET_STALE', 'CRITICAL', `Market feed lost for ${gap}ms`, {
        lastTickAt: new Date(lastTickAt).toISOString(),
      });
      await logAudit({
        action: 'system.market_stale',
        targetType: 'market',
        metadata: { gapMs: gap },
      });
    } else if (stale && gap <= env.MARKET_STALE_MS) {
      stale = false;
      staleSince = null;
      logger.info('market feed recovered');
      io?.to('market').emit(SocketEvents.MARKET_RECOVERED, { at: new Date().toISOString() });
      await logAudit({ action: 'system.market_recovered', targetType: 'market' });
    }
  }, 1000);

  logger.info({ assets: states.size }, 'market engine started');
}

export function stopMarketEngine() {
  if (tickTimer) clearInterval(tickTimer);
  if (watchdogTimer) clearInterval(watchdogTimer);
}

export function isMarketStale(): boolean {
  return stale;
}

export function setFeedPaused(value: boolean) {
  paused = value;
  lastTickAt = Date.now(); // grace window before staleness fires
}

export function isFeedPaused(): boolean {
  return paused;
}

export function getMarketStatus() {
  const now = Date.now();
  return {
    stale,
    paused,
    staleSince: staleSince ? new Date(staleSince).toISOString() : null,
    lastTickAt: new Date(lastTickAt).toISOString(),
    latencyMs: Math.max(0, now - lastTickAt),
    uptimeMs: now - startedAt,
    assets: [...states.values()].map((s) => ({
      symbol: s.symbol,
      price: Number(s.price.toFixed(s.price > 1000 ? 2 : 5)),
    })),
  };
}

export function getPrice(symbol: string): number | null {
  return states.get(symbol)?.price ?? null;
}

export function getAllPrices(): Record<string, number> {
  return Object.fromEntries([...states.values()].map((s) => [s.symbol, s.price]));
}

export async function getCandles(symbol: string, interval: string, limit = 200) {
  const candles = await Candle.find({ symbol, interval })
    .sort({ openTime: -1 })
    .limit(limit)
    .lean();
  return candles.reverse();
}
