'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatBdt, formatDateTime } from '@/lib/types';
import type { AdminUserView } from '@/lib/admin-types';

export default function UsersPage() {
  const [q, setQ] = useState('');

  const users = useQuery({
    queryKey: ['admin', 'users', q],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (q.trim()) params.set('q', q.trim());
      return (await api.get(`/users?${params.toString()}`)).data.data as {
        users: AdminUserView[];
        total: number;
      };
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">User directory</h1>
          <p className="text-sm text-muted-foreground">{users.data?.total ?? '…'} registered traders</p>
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / email / phone…"
          className="w-full sm:w-72"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead>Main balance</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users.data?.users ?? []).map((u) => {
                const mainWallet = u.wallets?.find((w) => w.type === 'MAIN');
                return (
                  <TableRow key={u._id}>
                    <TableCell>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          u.kycStatus === 'VERIFIED'
                            ? 'border-profit/40 text-profit'
                            : u.kycStatus === 'REJECTED'
                              ? 'border-loss/40 text-loss'
                              : u.kycStatus === 'PENDING'
                                ? 'border-warning/40 text-warning'
                                : ''
                        }
                      >
                        {u.kycStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatBdt(mainWallet ? mainWallet.available / 100 : 0)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      {!u.isActive && <Badge variant="destructive">BLOCKED</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="secondary" onClick={() => (window.location.href = `/admin/users/${u._id}`)}>
                        Timeline
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
