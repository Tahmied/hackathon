'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Gauge,
  UsersRound,
  ShieldCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertOctagon,
  BadgeCheck,
  LifeBuoy,
  ScrollText,
} from 'lucide-react';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { AdminChatWidget } from '@/components/chat/admin-chat-widget';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: Gauge, permission: 'dashboard:read' },
  { href: '/admin/deposits', label: 'Deposits', icon: ArrowDownToLine, permission: 'deposits:read' },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine, permission: 'withdrawals:read' },
  { href: '/admin/conflicts', label: 'Conflicts', icon: AlertOctagon, permission: 'conflicts:read' },
  { href: '/admin/kyc', label: 'KYC review', icon: BadgeCheck, permission: 'kyc:read' },
  { href: '/admin/users', label: 'Users', icon: UsersRound, permission: 'users:read' },
  { href: '/admin/tickets', label: 'Tickets', icon: LifeBuoy, permission: 'tickets:read' },
  { href: '/admin/audit', label: 'Audit logs', icon: ScrollText, permission: 'audit:read' },
  { href: '/admin/roles', label: 'Roles & access', icon: ShieldCheck, permission: 'users:manage_roles' },
  // Demo triggers (/admin/devtools) intentionally hidden from the sidebar —
  // the page stays reachable by URL for firing challenge scenarios.
];

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

  // Staff gate: users with zero admin permissions get bounced
  const visibleNav = NAV.filter((item) => can(session.user, item.permission));
  if (visibleNav.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-semibold">No admin access</p>
        <p className="text-sm text-muted-foreground">
          This account doesn&apos;t have any admin permissions.
        </p>
        <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-sm text-primary hover:underline">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/60 bg-card/40 lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border/60 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            N
          </div>
          <div>
            <span className="font-semibold leading-none">
              Nova<span className="text-primary">Trade</span>
            </span>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin panel</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition',
                  active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/60 p-4">
          <p className="truncate text-sm font-medium">{session.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{session.user.role}</p>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="mt-3 w-full rounded-md border border-border py-1.5 text-xs font-medium hover:bg-accent"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 overflow-x-auto border-b border-border/60 bg-background/80 px-4 backdrop-blur lg:hidden">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium',
                pathname.startsWith(item.href) ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>

      <AdminChatWidget />
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
