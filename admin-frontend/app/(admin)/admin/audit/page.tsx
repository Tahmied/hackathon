'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/types';
import type { AuditLogView } from '@/lib/admin-types';

const ACTIONS = ['all', 'deposit.approved', 'deposit.rejected', 'withdrawal.approved', 'kyc.approved', 'kyc.rejected', 'conflict.resolved', 'role.permissions_replaced', 'system.market_stale', 'user.blocked'];

export default function AuditPage() {
  const [action, setAction] = useState('all');

  const logs = useQuery({
    queryKey: ['admin', 'audit', action],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (action !== 'all') params.set('action', action);
      return (await api.get(`/audit?${params.toString()}`)).data.data as {
        logs: AuditLogView[];
        total: number;
      };
    },
    refetchInterval: 12000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit logs</h1>
        <p className="text-sm text-muted-foreground">
          Immutable record of every admin action and system event — append-only, never editable.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={action === a ? 'default' : 'outline'}
            onClick={() => setAction(a)}
          >
            {a === 'all' ? 'All events' : a}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Metadata</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs.data?.logs ?? []).map((log) => (
                <TableRow key={log._id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {log.actorId ? (
                      <>
                        <p className="font-medium">{log.actorId.name}</p>
                        <p className="text-muted-foreground">{log.actorRole ?? log.actorId.role}</p>
                      </>
                    ) : (
                      <Badge variant="secondary" className="text-[9px]">system</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">{log.action}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {log.targetType}
                    {log.targetId ? ` · …${log.targetId.slice(-6)}` : ''}
                  </TableCell>
                  <TableCell className="max-w-64 truncate font-mono text-[11px] text-muted-foreground">
                    {log.metadata ? JSON.stringify(log.metadata) : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{log.ip ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
