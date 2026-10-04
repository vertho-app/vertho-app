'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, Hourglass, Loader2, RefreshCw } from 'lucide-react';
import AdminPageHeader from '@/components/admin/page-header';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { useAdminShell } from '@/app/admin/_shell/AdminShellContext';
import {
  HORAS_SEM_ATIVIDADE,
  LIMITE_LISTA,
  MOTIVO_MAXIMO,
  MOTIVO_MINIMO,
  type TreinoParado,
} from '@/lib/simuladores/treinos-parados-regras';
import { carregarTreinosParados, encerrarTreinoSemDevolutiva } from './actions';

/**
 * Treinos parados (R-96, 04/10/2026): vendas e atendimento em andamento sem
 * atividade há mais de 48 horas, e o "Encerrar sem devolutiva" da equipe da
 * Vertho. Só campos não sensíveis: nem a conversa nem o briefing aparecem aqui.
 *
 * A lista é de leitura para qualquer admin; o botão só aparece para quem tem
 * `simulador.sessoes.manage` (o servidor decide de novo, a tela só não oferece o
 * que ele recusaria).
 */

const CODIGOS_CONHECIDOS = [
  'motivo_obrigatorio',
  'entrada_invalida',
  'nao_encontrada',
  'nao_elegivel',
  'recente',
  'em_processamento',
  'mudou',
  'falha',
  'erro',
] as const;

const chaveDe = (i: TreinoParado) => `${i.simulador}:${i.sessaoId}`;

export default function TreinosParadosPage() {
  const t = useTranslations('AdminStalledTrainings');
  const locale = useLocale();
  const confirmDialog = useConfirm();
  const { empresaId } = useEmpresaContexto();
  const { podeVer } = useAdminShell();
  const podeEncerrar = podeVer('simulador.sessoes.manage');

  const [itens, setItens] = useState<TreinoParado[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await carregarTreinosParados(empresaId);
      // Falha de leitura não pode aparecer como "nenhum treino parado".
      setErroCarga(!r.success);
      setItens(r.success ? r.itens : []);
      setTruncado(r.success ? r.truncado : false);
    } catch {
      setErroCarga(true);
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const porEmpresa = useMemo(() => {
    const grupos = new Map<string, { nome: string; itens: TreinoParado[] }>();
    for (const i of itens) {
      const g = grupos.get(i.empresaId) ?? { nome: i.empresa, itens: [] };
      g.itens.push(i);
      grupos.set(i.empresaId, g);
    }
    return [...grupos.entries()];
  }, [itens]);

  const relativo = (iso: string) => {
    const horas = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3_600_000));
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
    return horas >= 48 ? rtf.format(-Math.floor(horas / 24), 'day') : rtf.format(-horas, 'hour');
  };

  const motivoValido = motivo.trim().length >= MOTIVO_MINIMO && motivo.trim().length <= MOTIVO_MAXIMO;

  async function encerrar(item: TreinoParado) {
    if (!motivoValido || ocupado) return;
    const pessoa = item.pessoa || t('personRemoved');
    const ok = await confirmDialog({
      title: t('close.confirmTitle'),
      message: t(item.temConversa ? 'close.confirmWithConversation' : 'close.confirmWithoutConversation', { person: pessoa }),
      severity: 'danger',
      confirmLabel: t('close.submit'),
    });
    if (!ok) return;
    setOcupado(true);
    try {
      const r = await encerrarTreinoSemDevolutiva({
        simulador: item.simulador,
        empresaId: item.empresaId,
        sessaoId: item.sessaoId,
        motivo,
      });
      // `in` estreita a união mesmo com `strict: false` (o discriminante booleano não estreita).
      if ('codigo' in r) {
        if ((CODIGOS_CONHECIDOS as readonly string[]).includes(r.codigo))
          toast.error(t(`errors.${r.codigo}`, { min: MOTIVO_MINIMO, max: MOTIVO_MAXIMO, hours: HORAS_SEM_ATIVIDADE }));
        else toast.error(t('errors.generic'));
      } else {
        toast.success(t('result.done'));
        if (!r.auditoria) toast.warning(t('result.auditFailed'));
        setAberto(null);
        setMotivo('');
      }
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setOcupado(false);
    }
    await carregar();
  }

  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">
        <AdminPageHeader
          icon={Hourglass}
          iconClassName="text-amber-400"
          title={t('title')}
          subtitle={`${empresaId ? t('scope.company') : t('scope.all')} · ${t('count', { count: itens.length })}`}
          backHref="/admin/dashboard"
          actions={
            <button
              onClick={() => void carregar()}
              disabled={carregando || ocupado}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
            >
              {carregando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {t('refresh')}
            </button>
          }
        />

        <p className="mb-4 text-xs text-gray-400">{t('intro', { hours: HORAS_SEM_ATIVIDADE })}</p>
        {!podeEncerrar && <p className="mb-4 text-xs text-amber-200">{t('readOnly')}</p>}

        {carregando && itens.length === 0 ? (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" />
          </div>
        ) : erroCarga ? (
          <div className="text-center py-12 text-red-300 text-sm">{t('loadError')}</div>
        ) : itens.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">{t('empty', { hours: HORAS_SEM_ATIVIDADE })}</div>
        ) : (
          <div className="space-y-6">
            {porEmpresa.map(([id, grupo]) => (
              <section key={id} aria-label={grupo.nome}>
                <h2 className="mb-2 text-sm font-bold text-white">
                  {grupo.nome}
                  <span className="ml-2 text-xs font-normal text-gray-500">{t('count', { count: grupo.itens.length })}</span>
                </h2>
                <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/[0.04]">
                      <tr className="text-left text-[10px] uppercase text-gray-500">
                        <th className="px-3 py-2">{t('table.simulator')}</th>
                        <th className="px-3 py-2">{t('table.person')}</th>
                        <th className="px-3 py-2">{t('table.lastActivity')}</th>
                        <th className="px-3 py-2">{t('table.status')}</th>
                        <th className="px-3 py-2">{t('table.conversation')}</th>
                        {podeEncerrar && <th className="px-3 py-2">{t('table.action')}</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {grupo.itens.map((item) => {
                        const chave = chaveDe(item);
                        const aberta = aberto === chave;
                        return (
                          <Fragment key={chave}>
                            <tr className="hover:bg-white/[0.02] align-top">
                              <td className="px-3 py-2 font-bold text-cyan-400">{t(`simulators.${item.simulador}`)}</td>
                              <td className="px-3 py-2 text-gray-200">{item.pessoa || <span className="text-gray-500">{t('personRemoved')}</span>}</td>
                              <td className="px-3 py-2 text-gray-300" title={new Date(item.ultimaAtividade).toLocaleString(locale)}>
                                {relativo(item.ultimaAtividade)}
                              </td>
                              <td className="px-3 py-2 text-gray-300">{t(`status.${item.status}`)}</td>
                              <td className="px-3 py-2 text-gray-300">{item.temConversa ? t('conversation.yes') : t('conversation.no')}</td>
                              {podeEncerrar && (
                                <td className="px-3 py-2">
                                  <button
                                    onClick={() => {
                                      setAberto(aberta ? null : chave);
                                      setMotivo('');
                                    }}
                                    disabled={ocupado}
                                    aria-expanded={aberta}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-amber-300 border border-amber-400/30 hover:bg-amber-400/10 disabled:opacity-50"
                                  >
                                    {t('close.open')}
                                  </button>
                                </td>
                              )}
                            </tr>
                            {podeEncerrar && aberta && (
                              <tr className="bg-amber-500/[0.04]">
                                <td colSpan={6} className="px-3 py-3">
                                  <p className="mb-2 text-[11px] leading-relaxed text-amber-100">
                                    {t(item.temConversa ? 'close.effectWithConversation' : 'close.effectWithoutConversation')}
                                  </p>
                                  <label className="block text-[11px] font-bold text-gray-300 mb-1" htmlFor={`motivo-${chave}`}>
                                    {t('close.reasonLabel')}
                                  </label>
                                  <textarea
                                    id={`motivo-${chave}`}
                                    value={motivo}
                                    onChange={(e) => setMotivo(e.target.value)}
                                    maxLength={MOTIVO_MAXIMO}
                                    rows={2}
                                    disabled={ocupado}
                                    placeholder={t('close.reasonPlaceholder')}
                                    className="w-full rounded-lg border border-white/10 bg-[#091D35] px-3 py-2 text-xs text-white placeholder:text-gray-500"
                                  />
                                  <div className="mt-1 flex items-center justify-between gap-3 flex-wrap">
                                    <span className="text-[10px] text-gray-500">
                                      {t('close.reasonHelp', { min: MOTIVO_MINIMO, count: motivo.trim().length, max: MOTIVO_MAXIMO })}
                                    </span>
                                    <span className="flex items-center gap-2">
                                      <button
                                        onClick={() => {
                                          setAberto(null);
                                          setMotivo('');
                                        }}
                                        disabled={ocupado}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-300 border border-white/10 hover:bg-white/5 disabled:opacity-50"
                                      >
                                        {t('close.cancel')}
                                      </button>
                                      <button
                                        onClick={() => void encerrar(item)}
                                        disabled={!motivoValido || ocupado}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold text-red-300 border border-red-400/30 hover:bg-red-400/10 disabled:opacity-50"
                                      >
                                        {ocupado && <Loader2 size={12} className="animate-spin" />}
                                        {t('close.submit')}
                                      </button>
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}

        {truncado && !erroCarga && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <span>{t('truncated', { limit: LIMITE_LISTA })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
