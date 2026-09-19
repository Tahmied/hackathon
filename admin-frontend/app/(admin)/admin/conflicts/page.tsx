'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertOctagon, Gavel } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api, apiErrorMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from 'next-auth/react';
import { formatBdt, formatDateTime, type TransactionView } from '@/lib/types';
import type { ConflictGroupView } from '@/lib/admin-types';
import { cn } from '@/lib/utils';

export default function ConflictsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [group, setGroup] = useState<ConflictGroupView | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [resolving, setResolving] = useState(false);

  const groups = useQuery({
    queryKey: ['admin', 'conflicts'],
    queryFn: async () => (await api.get('/transactions/conflicts')).data.data.groups as ConflictGroupView[],
    refetchInterval: 10000,
  });

  async function resolve() {
    if (!group || !approveId) return;
    if (justification.trim().length < 10) {
      toast.error('A justification note (min 10 chars) is mandatory before resolving');
      return;
    }
    setResolving(true);
    try {
      await api.post(`/transactions/conflicts/${group.conflictGroupId}/resolve`, {
        approveTransactionId: approveId,
        note: justification,
      });
      toast.success('Conflict resolved — users notified, actions audit-logged');
      setGroup(null);
      setApproveId(null);
      setJustification('');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setResolving(false);
    }
  }

  const canResolve = can(session?.user, 'conflicts:resolve');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <AlertOctagon className="h-6 w-6 text-loss" /> Conflict resolution
        </h1>
        <p className="text-sm text-muted-foreground">
          Duplicate payment references detected. Resolution requires an explicit decision + justification.
        </p>
      </div>

      {!group && (
        <div className="grid gap-3 md:grid-cols-2">
          {(groups.data ?? []).map((g) => (
            <Card key={g.conflictGroupId} className="border-loss/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {g.conflictGroupId.slice(0, 18)}…
                  </span>
                  <Badge className="bg-loss text-white">{g.deposits.length} claims</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {g.deposits.map((d) => (
                  <div key={d._id} className="flex items-center justify-between">
                    <span>
                      <b>{d.userId?.name}</b>{' '}
                      <span className="text-xs text-muted-foreground">{d.userId?.email}</span>
                    </span>
                    <span className="font-mono">{formatBdt(d.amountBdt)}</span>
                  </div>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">
                  Shared reference:{' '}
                  <span className="font-mono">{g.deposits[0]?.reference}</span>
                </p>
                <Button size="sm" className="mt-2 w-full" onClick={() => { setGroup(g); setApproveId(null); setJustification(''); }}>
                  Resolve conflict
                </Button>
              </CardContent>
            </Card>
          ))}
          {(groups.data ?? []).length === 0 && (
            <Card className="md:col-span-2">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                ✅ No conflicts right now. Trigger one from Demo triggers → “Seed duplicate reference”.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Resolution screen: both users / receipts / claims side-by-side */}
      {group && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setGroup(null)}>
              ← Back to conflicts
            </Button>
            <span className="font-mono text-xs text-muted-foreground">
              Group {group.conflictGroupId}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {group.deposits.map((d, idx) => {
              const selected = approveId === d._id;
              const extracted = d.extractedData;
              const amountMismatch = extracted?.amount != null && extracted.amount !== d.amountBdt * 100;
              return (
                <Card
                  key={d._id}
                  className={cn(
                    'transition',
                    selected ? 'border-profit ring-2 ring-profit/40' : 'border-border',
                  )}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span>User {idx === 0 ? 'A' : 'B'}: {d.userId?.name}</span>
                      {selected && <Badge className="bg-profit text-white">WILL APPROVE</Badge>}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{d.userId?.email}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded bg-background/50 p-2">
                        <p className="text-[11px] text-muted-foreground">Claimed amount</p>
                        <p className="font-mono">{formatBdt(d.amountBdt)}</p>
                      </div>
                      <div className="rounded bg-background/50 p-2">
                        <p className="text-[11px] text-muted-foreground">Claimed reference</p>
                        <p className="truncate font-mono text-xs">{d.reference}</p>
                      </div>
                      {extracted?.amount != null && (
                        <div className={cn('rounded p-2', amountMismatch && 'border border-loss bg-loss/10')}>
                          <p className="text-[11px] text-muted-foreground">OCR amount</p>
                          <p className={cn('font-mono', amountMismatch && 'font-bold text-loss')}>
                            {formatBdt(extracted.amount / 100)}
                            {amountMismatch && ' ← MISMATCH'}
                          </p>
                        </div>
                      )}
                      {extracted?.reference && (
                        <div className="rounded bg-background/50 p-2">
                          <p className="text-[11px] text-muted-foreground">OCR reference</p>
                          <p className="truncate font-mono text-xs">{extracted.reference}</p>
                        </div>
                      )}
                    </div>

                    {d.receiptUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}${d.receiptUrl}`}
                        alt={`Receipt from ${d.userId?.name}`}
                        className="max-h-40 w-full rounded border border-border object-contain"
                      />
                    ) : (
                      <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        No receipt uploaded
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Submitted {formatDateTime(d.createdAt)}
                    </p>

                    {canResolve && (
                      <Button
                        size="sm"
                        variant={selected ? 'default' : 'outline'}
                        className="w-full"
                        onClick={() => setApproveId(selected ? null : d._id)}
                      >
                        {selected ? '✓ Selected for approval' : 'Approve this claim'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {canResolve && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Gavel className="h-4 w-4 text-warning" />
                  Final decision — pick one claim to approve; all others in the group will be rejected.
                </p>
                <Textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Mandatory justification — why this claim wins (min 10 characters). Recorded in the audit log and sent to both users…"
                  rows={3}
                />
                <Button
                  className="w-full"
                  disabled={!approveId || justification.trim().length < 10 || resolving}
                  onClick={() => void resolve()}
                >
                  {resolving ? 'Resolving…' : 'Submit resolution'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
