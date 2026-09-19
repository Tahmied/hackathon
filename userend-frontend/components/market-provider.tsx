'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSocket } from '@/lib/socket';
import { api } from '@/lib/api';

export interface MarketState {
  prices: Record<string, number>;
  stale: boolean;
  paused: boolean;
  connected: boolean;
}

const MarketContext = createContext<MarketState>({
  prices: {},
  stale: false,
  paused: false,
  connected: false,
});

export function useMarket() {
  return useContext(MarketContext);
}

/** Socket-first market data with automatic polling fallback. */
export function MarketProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [stale, setStale] = useState(false);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);

  // Socket subscription
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    getSocket()
      .then((socket) => {
        if (disposed) return;
        setConnected(true);
        const onTick = (payload: { symbol: string; price: number }[]) => {
          const next: Record<string, number> = {};
          for (const t of payload) next[t.symbol] = t.price;
          setPrices((prev) => ({ ...prev, ...next }));
          setStale(false);
        };
        const onStale = () => setStale(true);
        const onRecovered = () => setStale(false);
        socket.on('market:tick', onTick);
        socket.on('market:stale', onStale);
        socket.on('market:recovered', onRecovered);
        socket.io.on('reconnect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));
        cleanup = () => {
          socket.off('market:tick', onTick);
          socket.off('market:stale', onStale);
          socket.off('market:recovered', onRecovered);
        };
      })
      .catch(() => setConnected(false));

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  // Polling fallback (also seeds initial prices)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const poll = async () => {
      try {
        const res = await api.get('/market/status');
        const status = res.data.data;
        setStale(status.stale);
        setPaused(status.paused);
        const next: Record<string, number> = {};
        for (const a of status.assets) next[a.symbol] = a.price;
        setPrices((prev) => ({ ...prev, ...next }));
      } catch {
        /* keep last known prices */
      }
    };
    poll();
    // fast poll when socket is down, slow when healthy
    interval = setInterval(poll, connected ? 15000 : 3000);
    return () => clearInterval(interval);
  }, [connected]);

  return (
    <MarketContext.Provider value={{ prices, stale: stale || paused, paused, connected }}>
      {children}
    </MarketContext.Provider>
  );
}
