'use client';

/**
 * Auditoria dos PDIs: o veredito que ninguém lia (25/09/2026).
 *
 * Duas regras: número sempre com denominador ("56 de 91"), e ação que custa IA
 * só depois de confirmar, dizendo o que acontece. Regerar troca o texto e o PDF
 * que a pessoa vê; o aviso de plano NÃO sai de novo.
 */

import { useState } from 'react';
import { Loader2, RefreshCw, ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import { regerarPdi } from './auditoria-actions';
import { resumirAuditoriaPlanos, type ItemAuditoriaPlano } from '@/lib/relatorios/pdi-audit-resumo';

type Filtro = 'fail' | 'warn' | 'nulo' | 'todos';

export const CHIP_AUDITORIA: Record<string, { rotulo: string; classe: string }> = {
  pass: { rotulo: 'aprovado', classe: 'text-emerald-400 border-emerald-400/30' },
  warn: { rotulo: 'com alerta', classe: 'text-amber-400 border-amber-400/30' },
  fail: { rotulo: 'reprovado', classe: 'text-red-400 border-red-400/30' },
  nulo: { rotulo: 'sem auditoria', classe: 'text-gray-500 border-white/10' },
};

export default function AuditoriaPlanos({ empresaId, individuais, onRegerado }: {
  empresaId: string;
  individuais: Array<{ colaborador_id: string; gerado_em?: string | null; conteudo?: any; colaborador_nome?: string }>;
  onRegerado: () => Promise<void> | void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('fail');
  const [aberto, setAberto] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [regerando, setRegerando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; texto: string; erro?: boolean } | null>(null);

  const r = resumirAuditoriaPlanos(
    individuais.map((i) => ({ colaborador_id: i.colaborador_id, gerado_em: i.gerado_em, auditoria: i.conteudo?.auditoria })),
    new Map(individuais.map((i) => [i.colaborador_id, i.colaborador_nome || '(sem nome)'])),
  );
  const visiveis = r.itens.filter((i) => filtro === 'todos' || (i.status ?? 'nulo') === filtro);

  async function regerar(item: ItemAuditoriaPlano) {
    setConfirmar(null); setRegerando(item.colaboradorId); setMsg(null);
    try {
      const res = await regerarPdi(empresaId, item.colaboradorId);
      if (!res.success) { setMsg({ id: item.colaboradorId, texto: res.error, erro: true }); return; }
      setMsg({ id: item.colaboradorId, texto: `PDI regerado · auditoria: ${CHIP_AUDITORIA[res.status ?? 'nulo'].rotulo}` });
      await onRegerado();
    } catch (e: any) {
      setMsg({ id: item.colaboradorId, texto: e?.message || 'falha ao regerar', erro: true });
    } finally { setRegerando(null); }
  }

  if (r.total === 0) return null;

  return (
    <div className="mb-5 p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <ShieldCheck size={15} className="text-cyan-400" />
        <span className="text-sm font-bold text-white">Auditoria dos PDIs</span>
      </div>
      <p className="text-[11px] leading-relaxed text-gray-400 mb-3">
        Uma segunda IA confere se cada PDI se sustenta no que a pessoa respondeu. <b className="text-gray-300">Reprovado</b> quer
        dizer que o texto afirma algo sobre a pessoa que as respostas não mostram, ou que o sprint não é o da trilha. Vale ler
        antes de mandar o plano adiante.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Num rotulo="reprovados" valor={r.fail} total={r.total} cor="text-red-400" />
        <Num rotulo="com alerta" valor={r.warn} total={r.total} cor="text-amber-400" />
        <Num rotulo="aprovados" valor={r.pass} total={r.total} cor="text-emerald-400" />
        <Num rotulo="sem auditoria" valor={r.semAuditoria} total={r.total} cor="text-gray-400" />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {([['fail', `reprovados (${r.fail})`], ['warn', `com alerta (${r.warn})`], ['nulo', `sem auditoria (${r.semAuditoria})`], ['todos', `todos (${r.total})`]] as [Filtro, string][]).map(([f, rotulo]) => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${filtro === f ? 'border-cyan-400/40 text-cyan-400 bg-cyan-400/10' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}>
            {rotulo}
          </button>
        ))}
      </div>

      {filtro === 'nulo' && r.semAuditoria > 0 && (
        <p className="text-[10px] text-gray-500 mb-2">
          PDIs gerados antes de 27/08/2026, quando a auditoria ainda não existia, ou escritos pelo reset de uma demo.
        </p>
      )}

      {visiveis.length === 0 ? (
        <p className="text-[11px] text-gray-500">Nenhum PDI neste filtro.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] max-h-[420px] overflow-y-auto">
          {visiveis.map((i) => {
            const chip = CHIP_AUDITORIA[i.status ?? 'nulo'];
            const expandido = aberto === i.colaboradorId;
            const temDetalhe = i.pendencias.length > 0 || (!!i.resumo && i.status !== 'pass');
            return (
              <li key={i.colaboradorId} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setAberto(expandido ? null : i.colaboradorId)} disabled={!temDetalhe}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-white disabled:cursor-default">
                    {temDetalhe ? (expandido ? <ChevronDown size={12} className="shrink-0 text-gray-500" /> : <ChevronRight size={12} className="shrink-0 text-gray-500" />) : <span className="w-3 shrink-0" />}
                    <span className="truncate">{i.nome}</span>
                  </button>
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${chip.classe}`}>{chip.rotulo}</span>
                  {confirmar !== i.colaboradorId && (
                    <button onClick={() => setConfirmar(i.colaboradorId)} disabled={!!regerando}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-40 transition-all">
                      {regerando === i.colaboradorId ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                      {regerando === i.colaboradorId ? 'regerando…' : 'regerar PDI'}
                    </button>
                  )}
                </div>

                {confirmar === i.colaboradorId && (
                  <div className="mt-2 ml-[18px] p-2.5 rounded-lg border border-amber-400/30 bg-amber-400/[0.06]">
                    <p className="text-[11px] text-amber-300 mb-2">
                      Gera o PDI de {i.nome.split(' ')[0]} de novo com a IA (cerca de 2 min e US$ 0,10): texto, auditoria e PDF.
                      A pessoa passa a ver a versão nova quando abrir o plano. O aviso de WhatsApp não é reenviado.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => regerar(i)}
                        className="px-3 py-1 rounded-lg text-[11px] font-semibold text-black bg-amber-400 hover:bg-amber-300 transition-all">
                        confirmar
                      </button>
                      <button onClick={() => setConfirmar(null)}
                        className="px-3 py-1 rounded-lg text-[11px] text-gray-300 border border-white/10 hover:border-white/20 transition-all">
                        cancelar
                      </button>
                    </div>
                  </div>
                )}

                {msg?.id === i.colaboradorId && (
                  <p className={`mt-1 ml-[18px] text-[10px] ${msg.erro ? 'text-red-400' : 'text-emerald-400'}`}>{msg.texto}</p>
                )}

                {expandido && (
                  <div className="mt-2 ml-[18px] space-y-2">
                    {i.resumo && i.status !== 'pass' && <p className="text-[11px] text-gray-400">{i.resumo}</p>}
                    {i.pendencias.map((p, j) => (
                      <div key={j}>
                        <p className={`text-[10px] font-bold ${p.status === 'fail' ? 'text-red-400' : 'text-amber-400'}`}>
                          {p.status === 'fail' ? 'reprova' : 'alerta'} · {p.titulo}
                        </p>
                        {p.ocorrencias.map((o, n) => (
                          <p key={n} className="mt-0.5 text-[11px] leading-relaxed text-gray-300">{o}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Num({ rotulo, valor, total, cor }: { rotulo: string; valor: number; total: number; cor: string }) {
  return (
    <div className="px-3 py-2 rounded-lg border border-white/[0.06]" style={{ background: '#091D35' }}>
      <div className={cor}>
        <span className="text-base font-bold">{valor}</span>
        <span className="text-[11px] text-gray-500"> de {total}</span>
      </div>
      <div className="text-[10px] text-gray-500">{rotulo}</div>
    </div>
  );
}
