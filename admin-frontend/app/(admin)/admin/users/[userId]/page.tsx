'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Ban, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, apiErrorMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from 'next-auth/react';
import { formatBdt, formatDateTime } from '@/lib/types';
import type { TimelineEventView, AdminUserView } from '@/lib/admin-types';
import { cn } from '@/lib/utils';

interface UserDetail {
  user: AdminUserView & { permissionsGranted?: string[] };
  wallets: { type: string; available: number; reserved: number }[];
  stats: { openTrades: number; totalTrades: number; txCount: number; ticketsCount: number };
}

interface Conversation {
  _id: string;
  lastMessage?: string;
  channel: string;
  status: string;
  lastMessageAt: string;
}

export default function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [assistantMessage, setAssistantMessage] = useState('');
  const [assistantReply, setAssistantReply] = useState<{
    answer: string;
    trace?: { thought: string; tool?: string; resultSummary?: string }[];
    available: boolean;
    reason?: string;
  } | null>(null);
  const [thinking, setThinking] = useState(false);

  const detail = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: async () => (await api.get(`/users/${userId}`)).data.data as UserDetail,
  });

  const timeline = useQuery({
    queryKey: ['admin', 'user', userId, 'timeline'],
    queryFn: async () => (await api.get(`/users/${userId}/timeline`)).data.data as TimelineEventView[],
    refetchInterval: 10000,
  });

  const chats = useQuery({
    queryKey: ['admin', 'user', userId, 'chats'],
    queryFn: async () => {
      const inbox = (await api.get('/chat/inbox')).data.data.conversations as (Conversation & {
        userId?: { _id?: string };
      })[];
      return inbox.filter((c) => c.userId?._id === userId);
    },
    enabled: can(session?.user, 'chat:read'),
  });

  async function askAssistant() {
    if (!assistantMessage.trim()) return;
    setThinking(true);
    setAssistantReply(null);
    try {
      const res = await api.post('/ai/staff-chat', { message: assistantMessage, userId });
      setAssistantReply(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setThinking(false);
    }
  }

  async function toggleBlock() {
    const user = detail.data?.user;
    if (!user) return;
    try {
      await api.put(`/users/${userId}/active`, { isActive: !user.isActive });
      toast.success(user.isActive ? 'User blocked' : 'User unblocked');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const kindColor: Record<string, string> = {
    audit: 'border-primary/40 text-primary',
    trade: 'border-profit/40 text-profit',
    transaction: 'border-warning/40 text-warning',
  };

  return (
    <div className="space-y-5">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All users
      </Link>

      {/* Profile header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{detail.data?.user.name ?? '…'}</h1>
          <p className="text-sm text-muted-foreground">
            {detail.data?.user.email} · role <b>{detail.data?.user.role}</b> · KYC{' '}
            <b>{detail.data?.user.kycStatus}</b>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can(session?.user, 'users:block') && detail.data?.user.role !== 'super_admin' && (
            <Button size="sm" variant={detail.data?.user.isActive ? 'destructive' : 'secondary'} onClick={() => void toggleBlock()}>
              {detail.data?.user.isActive ? <><Ban className="mr-1 h-4 w-4" /> Block</> : <><ShieldCheck className="mr-1 h-4 w-4" /> Unblock</>}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(detail.data?.wallets ?? []).map((w) => (
          <Card key={w.type}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{w.type} available</p>
              <p className="mt-1 text-xl font-bold text-profit">{formatBdt(w.available / 100)}</p>
              <p className="text-xs text-warning">reserved {formatBdt(w.reserved / 100)}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Trades / Tickets</p>
            <p className="mt-1 text-xl font-bold">
              {detail.data?.stats.totalTrades ?? '—'} / {detail.data?.stats.ticketsCount ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {detail.data?.stats.openTrades ?? 0} open · {detail.data?.stats.txCount ?? 0} transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Staff AI assistant */}
      {can(session?.user, 'ai:use') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" /> Ask AI about this user
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={assistantMessage}
                onChange={(e) => setAssistantMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && askAssistant()}
                placeholder='e.g. "find this user and summarize their financial activity" or "any anomalies?"'
              />
              <Button onClick={() => void askAssistant()} disabled={thinking}>
                {thinking ? 'Thinking…' : 'Ask'}
              </Button>
            </div>
            {thinking && <p className="text-sm text-muted-foreground">AI is running tools against the database…</p>}
            {assistantReply && !assistantReply.available && (
              <div className="rounded border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                ⚙️ AI Service Unavailable. Manual review required. {assistantReply.reason}
              </div>
            )}
            {assistantReply?.available && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-sm">{assistantReply.answer}</p>
                {assistantReply.trace && assistantReply.trace.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-[11px] text-muted-foreground">
                      AI reasoning ({assistantReply.trace.length} steps)
                    </summary>
                    <div className="mt-1 space-y-1">
                      {assistantReply.trace.map((t, i) => (
                        <p key={i} className="text-[11px] text-muted-foreground">
                          {t.thought && <em>&ldquo;{t.thought}&rdquo; </em>}
                          {t.tool && <span className="font-mono text-primary">{t.tool}() {t.resultSummary}</span>}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chats with this user */}
      {can(session?.user, 'chat:read') && (chats.data ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent support chats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {chats.data!.slice(0, 3).map((c) => (
              <p key={c._id} className="text-muted-foreground">
                <Badge variant="outline" className="mr-2 text-[10px]">{c.channel}</Badge>
                {c.lastMessage ?? '—'}{' '}
                <span className="text-xs">· {formatDateTime(c.lastMessageAt)}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Activity timeline (Challenge Case 3: reconstruction) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Activity timeline (chronological reconstruction)</CardTitle>
        </CardHeader>
        <CardContent>
          {(timeline.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <div className="relative space-y-3 pl-6">
              <div className="absolute bottom-2 left-2 top-2 w-px bg-border" />
              {(timeline.data ?? []).map((event, i) => (
                <div key={i} className="relative">
                  <div className={cn('absolute -left-[1.72rem] top-1.5 h-2.5 w-2.5 rounded-full border', kindColor[event.kind] ?? 'border-border')} />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{event.label}</span>
                    <Badge variant="outline" className="text-[10px]">{event.kind}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(event.at)}</span>
                  </div>
                  {event.detail && Object.keys(event.detail).length > 0 && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {JSON.stringify(event.detail).slice(0, 160)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
