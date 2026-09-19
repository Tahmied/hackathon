'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, apiErrorMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useMarket } from '@/components/market-provider';
import { CandleChart } from '@/components/candle-chart';
import { formatBdt, formatPrice, type AssetView, type CandleView, type TradeView, type WalletsOverview } from '@/lib/types';
import { cn } from '@/lib/utils';

type Interval = '1m' | '5m' | '15m';

export default function AssetDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = use(params);
  const symbol = decodeURIComponent(rawSymbol);
  const queryClient = useQueryClient();
  const { prices, stale } = useMarket();

  const [interval, setInterval] = useState<Interval>('1m');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [walletType, setWalletType] = useState<'MAIN' | 'DEMO'>('MAIN');
  const [marginBdt, setMarginBdt] = useState('500');
  const [leverage, setLeverage] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [placing, setPlacing] = useState(false);

  const asset = useQuery({
    queryKey: ['asset', symbol],
    queryFn: async () => (await api.get(`/market/assets/${encodeURIComponent(symbol)}`)).data.data.asset as AssetView,
  });

  const candles = useQuery({
    queryKey: ['candles', symbol, interval],
    queryFn: async () =>
      (
        await api.get('/market/candles', {
          params: { symbol, interval, limit: 300 },
        })
      ).data.data.candles as CandleView[],
    refetchInterval: 20000,
  });

  const wallet = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => (await api.get('/wallets')).data.data as WalletsOverview,
    refetchInterval: 10000,
  });

  const positions = useQuery({
    queryKey: ['trades', 'open'],
    queryFn: async () => (await api.get('/trades/open')).data.data.trades as TradeView[],
    refetchInterval: 5000,
  });

  const livePrice = prices[symbol] ?? asset.data?.lastPrice ?? null;
  const marginValue = Number(marginBdt) || 0;
  const currentWallet = wallet.data?.wallets.find((w) => w.type === walletType);
  const availableBdt = currentWallet?.availableBdt ?? 0;
  const symbolPositions = (positions.data ?? []).filter((t) => t.symbol === symbol);

  const closeTrade = useCallback(
    async (tradeId: string) => {
      try {
        const res = await api.post(`/trades/${tradeId}/close`);
        const pnl = res.data.data.pnl / 100;
        toast.success(`Trade closed · PnL ${pnl >= 0 ? '+' : ''}৳${pnl.toFixed(2)}`);
        void queryClient.invalidateQueries({ queryKey: ['trades'] });
        void queryClient.invalidateQueries({ queryKey: ['wallets'] });
      } catch (err) {
        toast.error(apiErrorMessage(err));
      }
    },
    [queryClient],
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    getSocket()
      .then((socket) => {
        const onClosed = (payload: { tradeId: string }) => {
          void queryClient.invalidateQueries({ queryKey: ['trades'] });
          void queryClient.invalidateQueries({ queryKey: ['wallets'] });
          toast.info(`A position on ${symbol} was closed (stop-out or admin)`);
          void payload;
        };
        socket.on('trade:closed', onClosed);
        cleanup = () => socket.off('trade:closed', onClosed);
      })
      .catch(() => undefined);
    return () => cleanup?.();
  }, [queryClient, symbol]);

  async function placeTrade() {
    setPlacing(true);
    try {
      await api.post('/trades', {
        walletType,
        symbol,
        side,
        marginBdt: marginValue,
        leverage,
      });
      toast.success(`${side === 'BUY' ? 'Long' : 'Short'} position opened on ${symbol}`);
      setConfirming(false);
    } catch (err) {
      const isNetworkError = !(
        err as { response?: unknown }
      ).response;
      if (isNetworkError) {
        // The server may have processed the trade before the connection dropped
        toast.error(
          'Lost connection to the trading server. The trade may still have been placed — check your positions below before retrying.',
        );
      } else {
        toast.error(apiErrorMessage(err));
      }
    } finally {
      setPlacing(false);
      // Always refresh — protects against trades that succeeded despite a dropped response
      void queryClient.invalidateQueries({ queryKey: ['trades'] });
      void queryClient.invalidateQueries({ queryKey: ['wallets'] });
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <Link href="/markets" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All markets
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Chart column */}
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{symbol}</h1>
                {asset.data && (
                  <Badge variant="outline">{asset.data.name}</Badge>
                )}
              </div>
              <p className="font-mono text-3xl font-bold tabular-nums">{formatPrice(livePrice)}</p>
            </div>
            <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
              {(['1m', '5m', '15m'] as Interval[]).map((i) => (
                <button
                  key={i}
                  onClick={() => setInterval(i)}
                  className={cn(
                    'rounded px-3 py-1.5 text-xs font-medium',
                    interval === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <Card>
            <CardContent className="p-2">
              {candles.isLoading ? (
                <Skeleton className="h-[420px] w-full" />
              ) : (
                <CandleChart candles={candles.data ?? []} livePrice={livePrice} />
              )}
            </CardContent>
          </Card>

          {/* Positions on this symbol */}
          {symbolPositions.length > 0 && (
            <div className="mt-4 space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Your positions on {symbol}
              </h2>
              {symbolPositions.map((t) => (
                <Card key={t._id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={t.side === 'BUY' ? 'default' : 'destructive'}>{t.side}</Badge>
                      <span className="text-sm">
                        {formatBdt(t.margin / 100)} · {t.leverage}x · entry {formatPrice(t.entryPrice)}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {t.walletType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn('font-bold', (t.floatingPnlBdt ?? 0) >= 0 ? 'text-profit' : 'text-loss')}>
                        {t.floatingPnlBdt == null
                          ? '—'
                          : `${t.floatingPnlBdt >= 0 ? '+' : ''}${formatBdt(t.floatingPnlBdt)}`}
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => closeTrade(t._id)}>
                        Close
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Trade panel */}
        <div className="space-y-4">
          {stale && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning">
              ⚠ Market data delayed — trading paused.
            </div>
          )}
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSide('BUY')}
                  className={cn(
                    'rounded-lg py-3 text-sm font-bold transition',
                    side === 'BUY' ? 'bg-profit text-white' : 'bg-accent text-muted-foreground',
                  )}
                >
                  BUY / Long
                </button>
                <button
                  onClick={() => setSide('SELL')}
                  className={cn(
                    'rounded-lg py-3 text-sm font-bold transition',
                    side === 'SELL' ? 'bg-loss text-white' : 'bg-accent text-muted-foreground',
                  )}
                >
                  SELL / Short
                </button>
              </div>

              <div className="space-y-1.5 text-xs">
                {(['MAIN', 'DEMO'] as const).map((t) => {
                  const w = wallet.data?.wallets.find((x) => x.type === t);
                  const active = walletType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setWalletType(t)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border px-3 py-2 font-medium transition',
                        active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
                      )}
                    >
                      <span>{t === 'MAIN' ? 'Main account' : 'Demo account'}</span>
                      <span className="font-mono">{formatBdt(w?.availableBdt ?? 0)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label htmlFor="margin">Margin (BDT)</Label>
                <Input
                  id="margin"
                  type="number"
                  min={asset.data ? asset.data.minMarginPaisa / 100 : 100}
                  value={marginBdt}
                  onChange={(e) => setMarginBdt(e.target.value)}
                />
                <div className="flex gap-1.5">
                  {[500, 1000, 5000].map((v) => (
                    <button
                      key={v}
                      onClick={() => setMarginBdt(String(v))}
                      className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      ৳{v.toLocaleString()}
                    </button>
                  ))}
                  <button
                    onClick={() => setMarginBdt(String(Math.floor(availableBdt)))}
                    className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Max
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Leverage</Label>
                <div className="flex gap-1.5">
                  {(asset.data?.leverageOptions ?? [1, 5, 10, 20]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLeverage(l)}
                      className={cn(
                        'flex-1 rounded-md border py-2 text-xs font-semibold',
                        leverage === l ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
                      )}
                    >
                      {l}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-background/50 p-3 text-sm">
                <div className="flex justify-between py-0.5 text-muted-foreground">
                  <span>Position size</span>
                  <span className="font-mono text-foreground">{formatBdt(marginValue * leverage)}</span>
                </div>
                <div className="flex justify-between py-0.5 text-muted-foreground">
                  <span>≈ quantity at current price</span>
                  <span className="font-mono text-foreground">
                    {livePrice ? `${(marginValue * leverage / livePrice).toFixed(livePrice > 1000 ? 6 : 4)} ${symbol.split('/')[0]}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 text-muted-foreground">
                  <span>Available in {walletType === 'MAIN' ? 'Main' : 'Demo'}</span>
                  <span className={cn('font-mono', marginValue > availableBdt ? 'text-loss' : 'text-profit')}>
                    {formatBdt(availableBdt)}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 text-muted-foreground">
                  <span>Max loss (margin at risk)</span>
                  <span className="font-mono text-loss">{formatBdt(marginValue)}</span>
                </div>
              </div>

              {marginValue > availableBdt && (
                <p className="rounded border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
                  Insufficient {walletType === 'MAIN' ? 'Main' : 'Demo'} balance. Switch account, lower
                  the margin, or deposit funds.
                </p>
              )}

              {side === 'SELL' && symbolPositions.length === 0 && (
                <p className="rounded border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                  You don&apos;t hold any long positions on {symbol} — SELL opens a new{' '}
                  <b>short position</b> (profits if the price falls), using margin.
                </p>
              )}

              {/* Your current exposure on this asset */}
              {symbolPositions.length > 0 && (
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    You hold {symbolPositions.length} open position{symbolPositions.length > 1 ? 's' : ''} on {symbol}
                  </p>
                  {symbolPositions.map((t) => (
                    <div key={t._id} className="flex items-center justify-between py-1 text-xs">
                      <span>
                        <Badge variant={t.side === 'BUY' ? 'default' : 'destructive'} className="mr-1.5 px-1 py-0 text-[9px]">
                          {t.side}
                        </Badge>
                        {formatBdt(t.margin / 100)} · {t.leverage}x · {t.walletType}
                      </span>
                      <span className={cn('font-mono', (t.floatingPnlBdt ?? 0) >= 0 ? 'text-profit' : 'text-loss')}>
                        {t.floatingPnlBdt == null ? '—' : `${t.floatingPnlBdt >= 0 ? '+' : ''}${formatBdt(t.floatingPnlBdt)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Button
                className={cn('w-full font-bold', side === 'BUY' ? 'bg-profit hover:bg-profit/90' : 'bg-loss hover:bg-loss/90')}
                disabled={!marginValue || stale || marginValue > availableBdt || (!!asset.data && marginValue * 100 < asset.data.minMarginPaisa)}
                onClick={() => setConfirming(true)}
              >
                {side === 'BUY' ? 'Buy' : 'Sell'} {symbol} · {leverage}x
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Confirm {side === 'BUY' ? 'long' : 'short'} on {symbol}
            </DialogTitle>
            <DialogDescription>Review the estimated margin before confirming.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg bg-background/50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Margin (reserved)</span>
              <span className="font-mono">{formatBdt(marginValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Leverage</span>
              <span className="font-mono">{leverage}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Position size</span>
              <span className="font-mono">{formatBdt(marginValue * leverage)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entry price</span>
              <span className="font-mono">{formatPrice(livePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account</span>
              <span>{walletType === 'MAIN' ? 'Main' : 'Demo'}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={placeTrade} disabled={placing}>
              {placing ? 'Placing…' : 'Confirm trade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
