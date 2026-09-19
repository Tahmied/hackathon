'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { LayoutDashboard, LineChart, Wallet, User, LifeBuoy } from 'lucide-react';
import { MarketProvider, useMarket } from '@/components/market-provider';
import { cn } from '@/lib/utils';
import { ChatWidget } from '@/components/chat/chat-widget';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/markets', label: 'Markets', icon: LineChart },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/support', label: 'Support', icon: LifeBuoy },
  { href: '/profile', label: 'Profile', icon: User },
];

function StaleBanner() {
  const { stale, paused } = useMarket();
  if (!stale && !paused) return null;
  return (
    <div className="animate-pulse-warning border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-sm font-medium text-warning">
      ⚠ {paused ? 'Market feed paused by administrators.' : 'Market data is delayed.'} Trading is
      temporarily paused.
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading' || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <MarketProvider>
      <div className="flex min-h-screen flex-col">
        <StaleBanner />
        {/* Desktop top bar */}
        <header className="sticky top-0 z-40 hidden border-b border-border/60 bg-background/80 backdrop-blur md:block">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
                  N
                </div>
                <span className="font-semibold">
                  Nova<span className="text-primary">Trade</span>
                </span>
              </Link>
              <nav className="flex items-center gap-1">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'rounded-md px-3 py-2 text-sm font-medium transition',
                      pathname.startsWith(item.href)
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{session.user.email}</span>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur md:hidden">
          <div className="grid grid-cols-5">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <ChatWidget />
      </div>
    </MarketProvider>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
