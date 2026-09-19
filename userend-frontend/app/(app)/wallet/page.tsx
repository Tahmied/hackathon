'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, ArrowDownToLine, ArrowUpFromLine, ReceiptText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, apiErrorMessage } from '@/lib/api';
import { formatBdt, formatDateTime, type TransactionView, type WalletsOverview } from '@/lib/types';
import { cn } from '@/lib/utils';

const METHODS = [
  { value: 'BKASH', label: 'bKash', number: '01712-345678 (Personal)' },
  { value: 'NAGAD', label: 'Nagad', number: '01712-345678 (Personal)' },
  { value: 'ROCKET', label: 'Rocket', number: '0171234567-8 (Personal)' },
  { value: 'BANK', label: 'Bank Transfer', number: 'City Bank · 1502-3344-5566-77' },
];

function StatusBadge({ status }: { status: TransactionView['status'] }) {
  const map: Record<TransactionView['status'], { label: string; className: string }> = {
    PENDING: { label: 'Pending', className: 'bg-warning/15 text-warning border-warning/40' },
    APPROVED: { label: 'Approved', className: 'bg-profit/15 text-profit border-profit/40' },
    REJECTED: { label: 'Rejected', className: 'bg-loss/15 text-loss border-loss/40' },
    CONFLICT: { label: 'Conflict review', className: 'bg-loss/20 text-loss border-loss/60' },
    INFO_REQUESTED: { label: 'Info requested', className: 'bg-primary/10 text-primary border-primary/40' },
  };
  const s = map[status];
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

export default function WalletPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // deposit form
  const [dWallet, setDWallet] = useState<'MAIN' | 'DEMO'>('MAIN');
  const [dAmount, setDAmount] = useState('');
  const [dMethod, setDMethod] = useState('BKASH');
  const [dReference, setDReference] = useState('');
  const [dReceiptUrl, setDReceiptUrl] = useState('');
  const [dUploading, setDUploading] = useState(false);

  // withdraw form
  const [wWallet, setWWallet] = useState<'MAIN' | 'DEMO'>('MAIN');
  const [wAmount, setWAmount] = useState('');
  const [wMethod, setWMethod] = useState('BKASH');
  const [wAccount, setWAccount] = useState('');

  const txs = useQuery({
    queryKey: ['transactions', 'mine'],
    queryFn: async () => (await api.get('/transactions/mine?limit=50')).data.data.transactions as TransactionView[],
    refetchInterval: 8000,
  });

  const wallets = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => (await api.get('/wallets')).data.data as WalletsOverview,
    refetchInterval: 10000,
  });

  async function uploadReceipt(file: File) {
    setDUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/uploads', form, {
        headers: { 'content-type': 'multipart/form-data' },
      });
      setDReceiptUrl(res.data.data.url);
      const ocr = res.data.data.ocr;
      if (ocr?.available) {
        toast.success(
          ocr.unclear
            ? `Uploaded — OCR confidence low (${Math.round(ocr.confidence)}%), image may be blurry`
            : `Uploaded — OCR extracted ${ocr.extracted?.amount ? `৳${(ocr.extracted.amount / 100).toFixed(2)}` : 'no amount'}`,
        );
        if (ocr.extracted?.amount && !dAmount) setDAmount(String(ocr.extracted.amount / 100));
      } else {
        toast.success('Screenshot uploaded');
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDUploading(false);
    }
  }

  async function submitDeposit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api.post('/transactions/deposits', {
        walletType: dWallet,
        amountBdt: Number(dAmount),
        method: dMethod,
        reference: dReference,
        receiptUrl: dReceiptUrl || undefined,
      });
      if (res.data.data.conflict) {
        toast.warning('Deposit submitted — flagged for conflict review (duplicate reference).');
      } else {
        toast.success('Deposit request submitted for review');
      }
      setDAmount('');
      setDReference('');
      setDReceiptUrl('');
      if (fileRef.current) fileRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function submitWithdraw(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/transactions/withdrawals', {
        walletType: wWallet,
        amountBdt: Number(wAmount),
        method: wMethod,
        accountNumber: wAccount,
      });
      toast.success('Withdrawal request submitted — funds reserved until review');
      setWAmount('');
      setWAccount('');
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['wallets'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const mainWallet = wallets.data?.wallets.find((w) => w.type === 'MAIN');
  const wAvailable = wallets.data?.wallets.find((w) => w.type === wWallet)?.availableBdt ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <h1 className="text-2xl font-bold">Wallet</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Main balance: <b className="text-profit">{formatBdt(mainWallet?.availableBdt ?? 0)}</b> available ·{' '}
        <b className="text-warning">{formatBdt(mainWallet?.reservedBdt ?? 0)}</b> reserved
        {' '}· Deposits reviewed within minutes
      </p>

      <Tabs defaultValue="deposit">
        <TabsList className="grid w-full grid-cols-3 sm:w-96">
          <TabsTrigger value="deposit">Deposit</TabsTrigger>
          <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* DEPOSIT */}
        <TabsContent value="deposit">
          <Card className="mx-auto mt-4 max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ArrowDownToLine className="h-5 w-5 text-profit" /> Deposit funds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="mb-5 space-y-1 rounded-lg bg-background/50 p-3 text-xs text-muted-foreground">
                <li>1. Send money from your {METHODS.find((m) => m.value === dMethod)?.label} account to <b className="text-foreground">{METHODS.find((m) => m.value === dMethod)?.number}</b></li>
                <li>2. Copy the Transaction ID (TrxID) from the confirmation SMS</li>
                <li>3. Fill the form below and upload the payment screenshot</li>
              </ol>
              <form onSubmit={submitDeposit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account</Label>
                    <Select value={dWallet} onValueChange={(v) => { if (v) setDWallet(v as 'MAIN' | 'DEMO'); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MAIN">Main</SelectItem>
                        <SelectItem value="DEMO">Demo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select value={dMethod} onValueChange={(v) => { if (v) setDMethod(v); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d-amount">Amount (BDT)</Label>
                  <Input id="d-amount" type="number" min={100} required value={dAmount} onChange={(e) => setDAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d-ref">Transaction reference / TrxID</Label>
                  <Input id="d-ref" required minLength={4} value={dReference} onChange={(e) => setDReference(e.target.value)} placeholder="e.g. 9F7HK2LM" />
                </div>
                <div className="space-y-2">
                  <Label>Payment screenshot</Label>
                  {dReceiptUrl ? (
                    <div className="flex items-center gap-3 rounded-lg border border-profit/40 bg-profit/10 p-3 text-sm text-profit">
                      <ReceiptText className="h-4 w-4" /> Screenshot uploaded — AI will extract amount & reference
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground hover:border-primary/50">
                      <Upload className="h-5 w-5" />
                      {dUploading ? 'Processing (OCR running)…' : 'Click to upload payment screenshot (PNG/JPG)'}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadReceipt(file);
                        }}
                      />
                    </label>
                  )}
                </div>
                <Button type="submit" className="w-full">Submit deposit request</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WITHDRAW */}
        <TabsContent value="withdraw">
          <Card className="mx-auto mt-4 max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ArrowUpFromLine className="h-5 w-5 text-loss" /> Withdraw funds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitWithdraw} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account</Label>
                    <Select value={wWallet} onValueChange={(v) => { if (v) setWWallet(v as 'MAIN' | 'DEMO'); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MAIN">Main</SelectItem>
                        <SelectItem value="DEMO">Demo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select value={wMethod} onValueChange={(v) => { if (v) setWMethod(v); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="w-amount">Amount (BDT)</Label>
                    <button
                      type="button"
                      onClick={() => setWAmount(String(Math.floor(wAvailable)))}
                      className="text-xs text-primary hover:underline"
                    >
                      Available: {formatBdt(wAvailable)} — use max
                    </button>
                  </div>
                  <Input id="w-amount" type="number" min={100} required value={wAmount} onChange={(e) => setWAmount(e.target.value)} />
                  {Number(wAmount) > wAvailable && (
                    <p className="text-xs text-loss">
                      Request exceeds available balance (reserved funds cannot be withdrawn).
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="w-account">Your {METHODS.find((m) => m.value === wMethod)?.label} account number</Label>
                  <Input id="w-account" required value={wAccount} onChange={(e) => setWAccount(e.target.value)} placeholder="01XXXXXXXXX" />
                </div>
                <Button type="submit" className="w-full" disabled={Number(wAmount) > wAvailable}>
                  Submit withdrawal request
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history">
          <Card className="mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Method</TableHead>
                    <TableHead className="hidden md:table-cell">Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(txs.data ?? []).map((tx) => (
                    <TableRow key={tx._id}>
                      <TableCell className={cn('font-medium', tx.type === 'DEPOSIT' ? 'text-profit' : 'text-loss')}>
                        {tx.type === 'DEPOSIT' ? '+' : '−'} {tx.type}
                      </TableCell>
                      <TableCell className="font-mono">{formatBdt(tx.amountBdt)}</TableCell>
                      <TableCell className="hidden sm:table-cell">{METHODS.find((m) => m.value === tx.method)?.label ?? tx.method}</TableCell>
                      <TableCell className="hidden max-w-32 truncate font-mono text-xs md:table-cell">{tx.reference}</TableCell>
                      <TableCell>
                        <StatusBadge status={tx.status} />
                        {tx.status === 'REJECTED' && tx.adminNote && (
                          <p className="mt-1 max-w-40 text-[11px] text-muted-foreground">{tx.adminNote}</p>
                        )}
                        {tx.status === 'INFO_REQUESTED' && tx.infoRequestNote && (
                          <p className="mt-1 max-w-40 text-[11px] text-muted-foreground">{tx.infoRequestNote}</p>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                        {formatDateTime(tx.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(txs.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No transactions yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
