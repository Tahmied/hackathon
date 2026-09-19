'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  Activity,
  UsersRound,
  Ticket,
  AlertOctagon,
  MessagesSquare,
  CheckCheck,
  Cpu,
  Wifi,
  Database,
  LineChart,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { AdminDashboard as DashboardData } from '@/lib/admin-types';

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const dashboard = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => (await api.get('/admin/dashboard')).data.data as DashboardData,
    refetchInterval: 8000,
  });

  async function resolveAlert(alertId: string) {
    await api.post(`/admin/alerts/${alertId}/resolve`);
    toast.success('Alert resolved');
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  }

  const d = dashboard.data;
  const cards = d
    ? [
        { label: 'Pending deposits', value: d.actionCenter.pendingDeposits, href: '/admin/deposits', icon: ArrowDownToLine, color: 'text-profit' },
        { label: 'Pending withdrawals', value: d.actionCenter.pendingWithdrawals, href: '/admin/withdrawals', icon: ArrowUpFromLine, color: 'text-warning' },
        { label: 'Pending KYC', value: d.actionCenter.pendingKyc, href: '/admin/kyc', icon: BadgeCheck, color: 'text-primary' },
        { label: 'Open tickets', value: d.actionCenter.openTickets, href: '/admin/tickets', icon: Ticket, color: 'text-foreground' },
        { label: 'Conflicts', value: d.actionCenter.conflictDeposits, href: '/admin/conflicts', icon: AlertOctagon, color: 'text-loss' },
        { label: 'Active chats', value: d.actionCenter.activeChats, href: '/admin/dashboard', icon: MessagesSquare, color: 'text-foreground' },
        { label: 'Open trades', value: d.actionCenter.openTrades, href: '/admin/dashboard', icon: LineChart, color: 'text-foreground' },
        { label: 'Total users', value: d.actionCenter.totalUsers, href: '/admin/users', icon: UsersRound, color: 'text-foreground' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">System health and the action center</p>
      </div>

      {/* Red-flag alerts */}
      {d && d.alerts.length > 0 && (
        <div className="space-y-2">
          {d.alerts.map((alert) => (
            <div
              key={alert._id}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                alert.severity === 'CRITICAL'
                  ? 'border-loss/50 bg-loss/10 text-loss'
                  : 'border-warning/50 bg-warning/10 text-warning'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertOctagon className="h-4 w-4 shrink-0" />
                <span className="font-medium">[{alert.type}]</span>
                <span>{alert.message}</span>
                <span className="text-xs opacity-70">
                  {new Date(alert.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => void resolveAlert(alert._id)}>
                <CheckCheck className="mr-1 h-3.5 w-3.5" /> Resolve
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Action center */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href}>
              <Card className="transition hover:border-primary/40">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className={`mt-1 text-2xl font-bold ${c.color}`}>{d ? c.value : '—'}</p>
                  </div>
                  <Icon className="h-8 w-8 text-muted-foreground/40" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* System health */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-primary" /> Market feed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {d.systemHealth.market.stale || d.systemHealth.market.paused ? (
                    <Badge variant="outline" className="animate-pulse-warning border-warning/50 text-warning">
                      {d.systemHealth.market.paused ? 'PAUSED' : 'STALE'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-profit/50 text-profit">LIVE</Badge>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tick latency</span>
                  <span className="font-mono">{d.systemHealth.market.latencyMs}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last tick</span>
                  <span className="font-mono text-xs">
                    {new Date(d.systemHealth.market.lastTickAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {d.systemHealth.market.assets.map((a) => (
                    <Badge key={a.symbol} variant="secondary" className="font-mono text-[10px]">
                      {a.symbol} {a.price.toLocaleString()}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              'Loading…'
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-primary" /> AI service
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Provider</span>
                  {d.systemHealth.ai.configured && !d.systemHealth.ai.simulatedOutage ? (
                    <Badge variant="outline" className="border-profit/50 text-profit">ONLINE</Badge>
                  ) : d.systemHealth.ai.simulatedOutage ? (
                    <Badge variant="outline" className="border-warning/50 text-warning">SIMULATED OUTAGE</Badge>
                  ) : (
                    <Badge variant="outline" className="border-loss/50 text-loss">NOT CONFIGURED</Badge>
                  )}
                </div>
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">Model</span>
                  <span className="truncate font-mono text-xs">{d.systemHealth.ai.model}</span>
                </div>
                {d.systemHealth.ai.lastErrorAt && (
                  <div className="rounded bg-loss/10 p-2 text-xs text-loss">
                    Last error {new Date(d.systemHealth.ai.lastErrorAt).toLocaleTimeString()}:
                    <br />
                    {d.systemHealth.ai.lastErrorMessage}
                  </div>
                )}
              </>
            ) : (
              'Loading…'
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wifi className="h-4 w-4 text-primary" /> Infrastructure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Wifi className="h-3.5 w-3.5" /> WebSocket clients
                  </span>
                  <span className="font-mono">{d.systemHealth.websocket.onlineSockets}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Database className="h-3.5 w-3.5" /> Redis cache
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      d.systemHealth.redis.includes('connected')
                        ? 'border-profit/50 text-profit'
                        : 'border-warning/50 text-warning'
                    }
                  >
                    {d.systemHealth.redis}
                  </Badge>
                </div>
              </>
            ) : (
              'Loading…'
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
