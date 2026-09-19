'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, Info, TrendingUp, TrendingDown, Wallet as WalletIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useMarket } from '@/components/market-provider';
import { formatBdt, formatPrice, type ReservedBreakdown, type TradeView, type WalletsOverview } from '@/lib/types';
import { cn } from '@/lib/utils';

type Mode = 'MAIN' | 'DEMO';

export default function DashboardPage() {
  const [mode, setMode] = useState<Mode>('MAIN');
  const [hideBalance, setHideBalance] = useState(false);
  const [reservedOpen, setReservedOpen] = useState(false);
  const { prices } = useMarket();

  const wallets = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => (await api.get('/wallets')).data.data as WalletsOverview,
    refetchInterval: 10000,
  });

  const reserved = useQuery({
    queryKey: ['wallets', 'reserved', mode],
    queryFn: async () =>
      (await api.get(`/wallets/reserved?walletType=${mode}`)).data.data as ReservedBreakdown,
    enabled: reservedOpen,
  });

  const stats = useQuery({
    queryKey: ['trades', 'stats'],
    queryFn: async () => (await api.get('/trades/stats')).data.data,
    refetchInterval: 15000,
  });

  const openTrades = useQuery({
    queryKey: ['trades', 'open'],
    queryFn: async () => (await api.get('/trades/open')).data.data.trades as TradeView[],
    refetchInterval: 5000,
  });

  const wallet = wallets.data?.wallets.find((w) => w.type === mode);
  const modeOpenTrades = (openTrades.data ?? []).filter((t) => t.walletType === mode);
  const reservedForMode = modeOpenTrades.reduce((s, t) => s + t.margin, 0) / 100;

  const mask = (v: number) => (hideBalance ? '••••••' : formatBdt(v));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      {/* Header with account toggle */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your trading overview</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-1">
          {(['MAIN', 'DEMO'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-semibold transition',
                mode === m
                  ? m === 'MAIN'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-amber-500/90 text-black'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'MAIN' ? 'Main Account' : 'Demo Account'}
            </button>
          ))}
        </div>
      </div>

      {wallets.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Total balance */}
          <Card className="md:col-span-2">
            <CardContent className="p-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <WalletIcon className="h-4 w-4" />
                  {mode === 'MAIN' ? 'Main' : 'Demo'} total balance
                </span>
                <button onClick={() => setHideBalance((h) => !h)} className="text-muted-foreground hover:text-foreground">
                  {hideBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-4xl font-bold tracking-tight">{mask(wallet?.totalBdt ?? 0)}</p>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <p className="text-xs text-muted-foreground">Available</p>
                  <p className="mt-1 text-xl font-semibold text-profit">{mask(wallet?.availableBdt ?? 0)}</p>
                </div>
                <button
                  className="rounded-xl border border-border bg-background/40 p-4 text-left transition hover:border-primary/50"
                  onClick={() => setReservedOpen(true)}
                  title="See which trades are holding these funds"
                >
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Reserved
                    <Info className="h-3 w-3 text-primary" />
                  </p>
                  <p className="mt-1 text-xl font-semibold text-warning">{mask(reservedForMode)}</p>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* PnL stats */}
          <Card>
            <CardContent className="p-6">
              <p className="mb-4 text-sm text-muted-foreground">Profit & loss</p>
              <div className="space-y-4">
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" /> Today&apos;s PnL
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-2xl font-bold',
                      (stats.data?.today.pnlBdt ?? 0) >= 0 ? 'text-profit' : 'text-loss',
                    )}
                  >
                    {mask(stats.data?.today.pnlBdt ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendingDown className="h-3.5 w-3.5" /> Total PnL (closed)
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-2xl font-bold',
                      (stats.data?.allTime.pnlBdt ?? 0) >= 0 ? 'text-profit' : 'text-loss',
                    )}
                  >
                    {mask(stats.data?.allTime.pnlBdt ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Open positions */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Open positions ({mode})</h2>
          <Link href="/markets" className="text-sm font-medium text-primary hover:underline">
            Trade now →
          </Link>
        </div>
        {modeOpenTrades.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No open {mode === 'DEMO' ? 'demo' : ''} positions. Head to{' '}
              <Link href="/markets" className="text-primary hover:underline">
                Markets
              </Link>{' '}
              to place your first trade.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modeOpenTrades.map((t) => {
              const pnl = t.floatingPnlBdt;
              return (
                <Card key={t._id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={t.side === 'BUY' ? 'default' : 'destructive'}>{t.side}</Badge>
                        <span className="font-semibold">{t.symbol}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{t.leverage}x</span>
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Margin {formatBdt(t.margin / 100)}</p>
                        <p className="text-xs text-muted-foreground">
                          Entry {formatPrice(t.entryPrice)} → {formatPrice(prices[t.symbol] ?? t.currentPrice)}
                        </p>
                      </div>
                      <p className={cn('text-lg font-bold', (pnl ?? 0) >= 0 ? 'text-profit' : 'text-loss')}>
                        {pnl == null ? '—' : `${pnl >= 0 ? '+' : ''}${formatBdt(pnl)}`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Challenge Case 1: reserved breakdown modal */}
      <Dialog open={reservedOpen} onOpenChange={setReservedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Where is my reserved balance?</DialogTitle>
            <DialogDescription>
              Reserved funds are margin locked in your open trades on the{' '}
              <b>{mode}</b> account. They are released when the trade closes.
            </DialogDescription>
          </DialogHeader>
          {reserved.isLoading ? (
            <Skeleton className="h-32" />
          ) : !reserved.data || reserved.data.wallets.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No reserved funds right now — all of your balance is available.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-3xl font-bold text-warning">
                {formatBdt(reserved.data.totalReservedBdt)}
              </p>
              {reserved.data.wallets.map((w) => (
                <div key={w.walletId} className="space-y-2">
                  {w.trades.map((t) => (
                    <div
                      key={t.tradeId}
                      className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          Trade #{t.tradeId.slice(-6)} · {t.side} {t.symbol}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Margin {formatBdt(t.marginBdt)} · {t.leverage}x leverage · entry{' '}
                          {formatPrice(t.entryPrice)}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-warning">
                        holds {formatBdt(t.marginBdt)}
                      </Badge>
                    </div>
                  ))}
                </div>
              ))}
              <Button variant="secondary" className="w-full" onClick={() => { setReservedOpen(false); window.location.href = '/markets'; }}>
                Manage trades
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
