'use client';

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  Check, LockKeyhole, Search, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Trash2, UserRound, X,
} from 'lucide-react';
import BackButton from '@/components/back-button';
import {
  diagnoseUserPermissions,
  loadPermissionsConsole,
  removePermissionOverride,
  savePermissionOverride,
} from './actions';
import type { PermissionKey, PermissionOverride, PermissionRisk, SystemRole } from '@/lib/permissions';

const riskClass: Record<PermissionRisk, string> = {
  low: 'border-emerald-400/20 text-emerald-300 bg-emerald-400/10',
  medium: 'border-cyan-400/20 text-cyan-300 bg-cyan-400/10',
  high: 'border-amber-400/20 text-amber-300 bg-amber-400/10',
  critical: 'border-red-400/25 text-red-300 bg-red-400/10',
};

type ConsoleData = Awaited<ReturnType<typeof loadPermissionsConsole>>;

export default function PermissionsPage() {
  const t = useTranslations('AdminPermissions');
  const [data, setData] = useState<ConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [diagnosticEmail, setDiagnosticEmail] = useState('');
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<{
    scopeType: 'role' | 'user';
    scopeValue: string;
    permissionKey: PermissionKey;
    effect: 'allow' | 'deny';
  } | null>(null);
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const next = await loadPermissionsConsole();
    setData(next);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const roleOverrides = useMemo(() => {
    const map = new Map<string, PermissionOverride>();
    for (const override of data?.roleOverrides || []) {
      map.set(`${override.scope_key}:${override.permission_key}`, override);
    }
    return map;
  }, [data]);

  const filteredPermissions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data.permissions;
    return data.permissions.filter((permission) =>
      `${permission.key} ${permission.domain} ${permission.label} ${permission.description}`.toLowerCase().includes(q),
    );
  }, [data, query]);

  const domains = useMemo(() => {
    const grouped = new Map<string, typeof filteredPermissions>();
    for (const permission of filteredPermissions) {
      grouped.set(permission.domain, [...(grouped.get(permission.domain) || []), permission]);
    }
    return Array.from(grouped.entries());
  }, [filteredPermissions]);

  function baseAllowed(role: SystemRole, permission: PermissionKey) {
    return data?.base?.[role]?.includes(permission) ?? false;
  }

  function overrideFor(role: SystemRole, permission: PermissionKey) {
    return roleOverrides.get(`role:${role}:${permission}`);
  }

  async function runDiagnostic() {
    setMessage('');
    const result = await diagnoseUserPermissions(diagnosticEmail);
    setDiagnostic(result);
  }

  async function submitOverride() {
    if (!editing) return;
    const result = await savePermissionOverride({ ...editing, reason });
    if (!result.success) {
      setMessage(result.error || t('messages.saveFailed'));
      return;
    }
    setMessage(t('messages.overrideSaved'));
    setEditing(null);
    setReason('');
    await refresh();
  }

  async function removeOverride(id: string) {
    if (!confirm(t('confirm.removeOverride'))) return;
    const result = await removePermissionOverride(id);
    if (!result.success) {
      setMessage(result.error || t('messages.removeFailed'));
      return;
    }
    setMessage(t('messages.overrideRemoved'));
    await refresh();
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#06172c] text-cyan-300">
        <SlidersHorizontal className="animate-pulse" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#06172c] px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[1500px]">
        <BackButton />
        <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
              <LockKeyhole size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/70">{t('eyebrow')}</p>
              <h1 className="text-xl font-bold text-white">{t('title')}</h1>
              <p className="text-xs text-slate-400">{t('subtitle')}</p>
            </div>
          </div>
        </header>

        {message && (
          <div className="mb-4 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200">
            {message}
          </div>
        )}

        <section className="mb-5 grid gap-3 lg:grid-cols-[1fr_420px]">
          <div className="rounded-lg border border-white/10 bg-[#0b1d36] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Search size={15} className="text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
              />
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="rounded border border-white/10 px-2 py-1">{t('counts.permissions', { count: data.permissions.length })}</span>
              <span className="rounded border border-white/10 px-2 py-1">{t('counts.roles', { count: data.roles.length })}</span>
              <span className="rounded border border-white/10 px-2 py-1">{t('counts.roleOverrides', { count: data.roleOverrides.length })}</span>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0b1d36] p-4">
            <div className="mb-3 flex items-center gap-2">
              <UserRound size={15} className="text-cyan-300" />
              <p className="text-sm font-semibold text-white">{t('diagnostic.title')}</p>
            </div>
            <div className="flex gap-2">
              <input
                value={diagnosticEmail}
                onChange={(event) => setDiagnosticEmail(event.target.value)}
                placeholder={t('diagnostic.emailPlaceholder')}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#091d35] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
              />
              <button
                onClick={() => startTransition(runDiagnostic)}
                disabled={isPending}
                className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-[#06172c] disabled:opacity-50"
              >
                {t('actions.view')}
              </button>
            </div>
            {diagnostic && (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/10 p-3 text-xs">
                {!diagnostic.success ? (
                  <p className="text-red-300">{diagnostic.error}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="font-semibold text-white">{diagnostic.user.nome || diagnostic.user.email}</p>
                    <p className="text-slate-400">{t('diagnostic.effectiveRole')}: <span className="text-cyan-300">{diagnostic.user.role}</span></p>
                    <p className="text-slate-400">{t('diagnostic.allowed')}: <span className="text-emerald-300">{diagnostic.allowed.length}</span> · {t('diagnostic.denied')}: <span className="text-red-300">{diagnostic.denied.length}</span></p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0b1d36]">
          <table className="w-full min-w-[1050px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-widest text-slate-500">
                <th className="sticky left-0 z-10 bg-[#0b1d36] px-4 py-3">{t('table.permission')}</th>
                {data.roles.map((role) => (
                  <th key={role.key} className="px-3 py-3 text-center">{role.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {domains.map(([domain, permissions]) => (
                <Fragment key={domain}>
                  <tr key={domain} className="border-y border-white/10 bg-white/[0.03]">
                    <td colSpan={data.roles.length + 1} className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                      {domain}
                    </td>
                  </tr>
                  {permissions.map((permission) => (
                    <tr key={permission.key} className="border-b border-white/[0.05] hover:bg-white/[0.025]">
                      <td className="sticky left-0 z-10 max-w-[380px] bg-[#0b1d36] px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${riskClass[permission.risk]}`}>
                            {t(`risk.${permission.risk}`)}
                          </span>
                          <div>
                            <p className="font-semibold text-white">{permission.label}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-cyan-300/70">{permission.key}</p>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{permission.description}</p>
                          </div>
                        </div>
                      </td>
                      {data.roles.map((role) => {
                        const override = overrideFor(role.key as SystemRole, permission.key as PermissionKey);
                        const allowed = override ? override.effect === 'allow' : baseAllowed(role.key as SystemRole, permission.key as PermissionKey);
                        return (
                          <td key={role.key} className="px-3 py-3 text-center align-middle">
                            <div className="flex flex-col items-center gap-1">
                              <button
                                disabled={!data.currentUser.canManage}
                                onClick={() => {
                                  setEditing({
                                    scopeType: 'role',
                                    scopeValue: role.key,
                                    permissionKey: permission.key as PermissionKey,
                                    effect: allowed ? 'deny' : 'allow',
                                  });
                                  setReason('');
                                }}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                                  allowed
                                    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                                    : 'border-red-400/20 bg-red-400/10 text-red-300'
                                } disabled:cursor-default disabled:opacity-80`}
                                title={override ? t('tooltips.override', { effect: override.effect }) : t('tooltips.basePermission')}
                              >
                                {allowed ? <Check size={15} /> : <X size={15} />}
                              </button>
                              {override && (
                                <button
                                  onClick={() => removeOverride(override.id!)}
                                  disabled={!data.currentUser.canManage}
                                  className="inline-flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-100 disabled:opacity-50"
                                  title={override.reason || undefined}
                                >
                                  {t('labels.override')} <Trash2 size={10} />
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-5 rounded-lg border border-white/10 bg-[#0b1d36] p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck size={16} className="text-cyan-300" />
            <p className="text-sm font-semibold text-white">{t('activeOverrides.title')}</p>
          </div>
          {data.roleOverrides.length === 0 ? (
            <p className="text-xs text-slate-500">{t('activeOverrides.empty')}</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {data.roleOverrides.map((override) => (
                <div key={override.id} className="rounded-lg border border-white/10 bg-black/10 p-3 text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={override.effect === 'allow' ? 'text-emerald-300' : 'text-red-300'}>{override.effect}</span>
                    <button onClick={() => removeOverride(override.id!)} className="text-slate-500 hover:text-red-300">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="font-mono text-cyan-300/80">{override.scope_key}</p>
                  <p className="font-mono text-slate-300">{override.permission_key}</p>
                  <p className="mt-2 text-slate-500">{override.reason}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0b1d36] p-5 shadow-2xl">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert size={18} className={editing.effect === 'allow' ? 'text-emerald-300' : 'text-red-300'} />
              <div>
                <h2 className="text-base font-bold text-white">{t('modal.title')}</h2>
                <p className="text-xs text-slate-500">{editing.scopeValue} · {editing.permissionKey} · {editing.effect}</p>
              </div>
            </div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('modal.reasonLabel')}</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-[#091d35] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
              placeholder={t('modal.reasonPlaceholder')}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white">
                {t('actions.cancel')}
              </button>
              <button onClick={() => startTransition(submitOverride)} disabled={isPending} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-[#06172c] disabled:opacity-50">
                {t('actions.saveOverride')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
