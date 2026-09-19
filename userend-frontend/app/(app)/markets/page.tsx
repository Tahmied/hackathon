'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useMarket } from '@/components/market-provider';
import { formatPrice, type AssetView } from '@/lib/types';

const CATEGORY_LABEL: Record<string, string> = {
  CRYPTO: 'Crypto',
  FOREX: 'Forex',
  COMMODITY: 'Commodity',
};

export default function MarketsPage() {
  const [q, setQ] = useState('');
  const { prices } = useMarket();

  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get('/market/assets')).data.data.assets as AssetView[],
  });

  const filtered = useMemo(() => {
    const list = assets.data ?? [];
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter(
      (a) => a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle),
    );
  }, [assets.data, q]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Markets</h1>
          <p className="text-sm text-muted-foreground">Live prices · streaming market data</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search BTC, Gold, EUR…"
            className="pl-9"
          />
        </div>
      </div>

      {assets.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((asset) => {
            const price = prices[asset.symbol] ?? asset.lastPrice;
            const change = asset.lastPrice ? ((price - asset.lastPrice) / asset.lastPrice) * 100 : 0;
            return (
              <Link key={asset._id} href={`/markets/${encodeURIComponent(asset.symbol)}`}>
                <Card className="transition hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold">{asset.symbol}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {CATEGORY_LABEL[asset.category] ?? asset.category}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{asset.name}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        up to {Math.max(...asset.leverageOptions)}x leverage
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-lg font-semibold tabular-nums">{formatPrice(price)}</p>
                      <p className={`text-xs font-medium ${change >= 0 ? 'text-profit' : 'text-loss'}`}>
                        {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}% session
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
