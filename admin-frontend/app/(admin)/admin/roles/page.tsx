'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { api, apiErrorMessage } from '@/lib/api';
import { useSession } from 'next-auth/react';
import type { RoleMatrixData } from '@/lib/admin-types';

export default function RolesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [dirtyRole, setDirtyRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const matrix = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: async () => (await api.get('/permissions')).data.data as RoleMatrixData,
  });

  // Seed local checkbox state from server data
  useEffect(() => {
    if (matrix.data && Object.keys(selected).length === 0) {
      const next: Record<string, Set<string>> = {};
      for (const [role, perms] of Object.entries(matrix.data.rolePermissions)) {
        next[role] = new Set(perms);
      }
      setSelected(next);
    }
  }, [matrix.data, selected]);

  const grouped = useMemo(() => {
    const byModule = new Map<string, RoleMatrixData['permissions']>();
    for (const p of matrix.data?.permissions ?? []) {
      const arr = byModule.get(p.module) ?? [];
      arr.push(p);
      byModule.set(p.module, arr);
    }
    return [...byModule.entries()];
  }, [matrix.data]);

  const isSuper = session?.user?.role === 'super_admin';
  const activeRole = dirtyRole;
  const activeSet = activeRole ? selected[activeRole] : null;

  async function save() {
    if (!activeRole || !activeSet) return;
    setSaving(true);
    try {
      await api.put(`/permissions/roles/${activeRole}`, { permissions: [...activeSet] });
      toast.success(`Permissions updated for ${activeRole} — live immediately (cache purged)`);
      setDirtyRole(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'permissions'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function toggle(role: string, perm: string) {
    if (role === 'super_admin') return;
    setSelected((prev) => {
      const set = new Set(prev[role] ?? []);
      if (set.has(perm)) set.delete(perm);
      else set.add(perm);
      return { ...prev, [role]: set };
    });
    setDirtyRole(role);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Roles & access
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose exactly what each role can access — the panel renders accordingly, instantly.
          </p>
        </div>
        {activeRole && isSuper && (
          <Button onClick={() => void save()} disabled={saving}>
            <Save className="mr-1 h-4 w-4" />
            {saving ? 'Saving…' : `Save changes for ${activeRole}`}
          </Button>
        )}
      </div>

      {!isSuper && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning">
          Only super admins can edit the permission matrix. You have read access.
        </p>
      )}

      <div className="space-y-4">
        {(matrix.data?.roles ?? []).map((role) => {
          const isWild = role.name === 'super_admin';
          const roleSet = selected[role.name] ?? new Set<string>();
          return (
            <Card key={role.name}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>
                    {role.label}{' '}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">({role.name})</span>
                    {dirtyRole === role.name && <Badge className="ml-2 bg-warning text-black">unsaved</Badge>}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {isWild ? 'wildcard (*)' : `${roleSet.size} permissions`}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isWild ? (
                  <p className="text-xs text-muted-foreground">
                    🔒 Super admin always bypasses permission checks (immutable).
                  </p>
                ) : (
                  <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                    {grouped.map(([module, perms]) => (
                      <div key={module}>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {module}
                        </p>
                        <div className="space-y-1.5">
                          {perms.map((p) => (
                            <label
                              key={p.name}
                              className="flex cursor-pointer items-center gap-2 text-sm"
                              title={p.description}
                            >
                              <Checkbox
                                checked={roleSet.has(p.name)}
                                onCheckedChange={() => toggle(role.name, p.name)}
                                disabled={!isSuper}
                              />
                              {p.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
