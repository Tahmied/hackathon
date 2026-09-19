'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, apiErrorMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from 'next-auth/react';
import { formatBdt, formatDateTime, type TransactionView } from '@/lib/types';

export default function WithdrawalsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<TransactionView | null>(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const withdrawals = useQuery({
    queryKey: ['admin', 'withdrawals'],
    queryFn: async () =>
      (await api.get('/transactions?type=WITHDRAWAL&limit=50')).data.data.transactions as TransactionView[],
    refetchInterval: 10000,
  });

  const wallets = useQuery({
    queryKey: ['admin', 'wallets', selected?.userId?._id, selected?.walletType],
    queryFn: async () =>
      (await api.get(`/users/${selected!.userId!._id}`)).data.data as {
        wallets: { type: string; available: number; reserved: number }[];
      },
    enabled: !!selected,
  });

  async function act(action: 'approve' | 'reject') {
    if (!selected) return;
    if (action === 'reject' && note.trim().length < 3) {
      toast.error('A rejection note is mandatory');
      return;
    }
    setActing(true);
    try {
      const res = await api.post(`/transactions/${selected._id}/${action}`, { note });
      toast.success(res.data.message ?? 'Done');
      setSelected(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  const canApprove = can(session?.user, 'withdrawals:approve');
  const canReject = can(session?.user, 'withdrawals:reject');
  const wallet = wallets.data?.wallets.find((w) => w.type === selected?.walletType);
  const availableBdt = (wallet?.available ?? 0) / 100;
  const blockApproval = (selected?.amountBdt ?? 0) > availableBdt;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Withdrawal review</h1>
        <p className="text-sm text-muted-foreground">
          Approvals release the reserved funds as a payout to the user&apos;s mobile wallet.
          Rejections refund the reservation to the user&apos;s available balance.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(withdrawals.data ?? []).map((tx) => (
                <TableRow key={tx._id}>
                  <TableCell>
                    <p className="font-medium">{tx.userId?.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{tx.userId?.email}</p>
                  </TableCell>
                  <TableCell className="font-mono">{formatBdt(tx.amountBdt)}</TableCell>
                  <TableCell className="text-xs">
                    {tx.method} · {tx.accountNumber}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        tx.status === 'APPROVED'
                          ? 'border-profit/40 text-profit'
                          : tx.status === 'REJECTED'
                            ? 'border-loss/40 text-loss'
                            : 'border-warning/40 text-warning'
                      }
                    >
                      {tx.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(tx.createdAt)}</TableCell>
                  <TableCell>
                    {tx.status === 'PENDING' && (
                      <Button size="sm" variant="secondary" onClick={() => { setSelected(tx); setNote(''); }}>
                        Review
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(withdrawals.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No withdrawals yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Withdrawal review</DialogTitle>
            <DialogDescription>
              {selected?.userId?.name} requests {formatBdt(selected?.amountBdt ?? 0)} via{' '}
              {selected?.method}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Requested</span>
              <span className="font-mono">{formatBdt(selected?.amountBdt ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current available ({selected?.walletType})</span>
              <span className="font-mono text-profit">{formatBdt(availableBdt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reserved (incl. this request)</span>
              <span className="font-mono text-warning">{formatBdt((wallet?.reserved ?? 0) / 100)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payout account</span>
              <span className="font-mono text-xs">{selected?.accountNumber}</span>
            </div>
          </div>

          {blockApproval && (
            <p className="rounded border border-loss/50 bg-loss/10 p-3 text-sm text-loss">
              ⛔ System check: approval is blocked — wallet available balance is inconsistent with the
              request.
            </p>
          )}

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Review note (mandatory for rejection)…"
            rows={2}
          />

          <DialogFooter className="gap-2">
            {canReject && (
              <Button variant="destructive" onClick={() => void act('reject')} disabled={acting}>
                <X className="mr-1 h-4 w-4" /> Reject & refund
              </Button>
            )}
            {canApprove && (
              <Button
                className="bg-profit hover:bg-profit/90"
                onClick={() => void act('approve')}
                disabled={acting || blockApproval}
              >
                <Check className="mr-1 h-4 w-4" /> Approve payout
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
