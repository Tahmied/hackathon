'use client';

import { useEffect, useState } from 'react';

interface Tick {
  symbol: string;
  price: number;
}

function useLiveTicker() {
  const [ticks, setTicks] = useState<Tick[]>([]);
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/v1/market/status`,
        );
        const json = await res.json();
        if (!stop && json?.data?.assets) setTicks(json.data.assets);
      } catch {
        /* keep last */
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      stop = true;
      clearInterval(interval);
    };
  }, []);
  return ticks;
}

export default function LandingPage() {
  const ticks = useLiveTicker();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
              N
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Nova<span className="text-primary">Trade</span>
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="/login"
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Log in
            </a>
            <a
              href="/register"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Get started
            </a>
          </nav>
        </div>
      </header>

      {/* Live market ticker */}
      {ticks.length > 0 && (
        <div className="overflow-hidden border-b border-border/60 bg-card/40">
          <div className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 py-2 text-xs [scrollbar-width:none]">
            {ticks.map((t) => (
              <span key={t.symbol} className="flex shrink-0 items-center gap-1.5">
                <span className="font-medium">{t.symbol}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {t.price >= 1000
                    ? t.price.toLocaleString('en-US', { maximumFractionDigits: 2 })
                    : t.price.toFixed(4)}
                </span>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-profit" />
              </span>
            ))}
            <span className="shrink-0 text-muted-foreground">Live market feed</span>
          </div>
        </div>
      )}

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Instant bKash · Nagad & Rocket deposits
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Trade crypto, gold & forex —{' '}
            <span className="text-primary">in BDT</span>, with up to 20× leverage
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            NovaTrade gives Bangladeshi traders institutional-grade execution, real-time
            charts, and margin trading on BTC, ETH, Gold and FX pairs — with deposits and
            withdrawals in Taka.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/register"
              className="w-full rounded-lg bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 sm:w-auto"
            >
              Open a free account
            </a>
            <a
              href="/login"
              className="w-full rounded-lg border border-border px-8 py-3.5 text-base font-medium transition hover:bg-accent sm:w-auto"
            >
              Log in
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Every account includes a ৳100,000 demo balance to practise risk-free.
          </p>

          {/* Feature cards */}
          <div className="mt-24 grid gap-6 text-left sm:grid-cols-3">
            {[
              {
                title: 'Real-time market execution',
                desc: 'Streaming prices with candlestick charts, floating PnL and one-tap long/short execution across 6 instruments.',
                icon: '📈',
              },
              {
                title: 'Smart margin engine',
                desc: 'Up to 20× leverage with transparent reserved/available balances and automatic stop-out protection.',
                icon: '⚖️',
              },
              {
                title: 'AI-assisted operations',
                desc: 'AI reviews your deposits and documents in seconds — plus a 24/7 assistant that knows your account.',
                icon: '🤖',
              },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="mb-2 font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Trust strip */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { k: '৳0', v: 'account fee' },
              { k: '<5 min', v: 'deposit review' },
              { k: '20×', v: 'max leverage' },
              { k: '24/7', v: 'support & AI help' },
            ].map((s) => (
              <div key={s.v} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-2xl font-bold text-primary">{s.k}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.v}</p>
              </div>
            ))}
          </div>

          {/* Security note */}
          <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-border bg-card p-6 text-left">
            <h4 className="mb-2 font-semibold">🔒 Your security, first</h4>
            <p className="text-sm text-muted-foreground">
              Two-factor login options, OTP-verified withdrawals, AI-verified identity
              documents, and a complete immutable audit trail on every action. Your Main
              and Demo balances are always kept strictly separate.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        NovaTrade · © {new Date().getFullYear()} · support@novatrade.dev
      </footer>
    </div>
  );
}
