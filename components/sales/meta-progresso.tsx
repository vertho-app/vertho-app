'use client';

// Progresso da meta do RC (contrato v6, Anexo IV): marcos trimestrais
// ACUMULADOS sobre o Valor Total do Contrato das propostas aceitas no período
// anual, e os marcos de ativação. Usado no portal do RC e no admin.
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';
import type { ProgressoDaMeta } from '@/lib/sales/metas';

export default function MetaProgresso({ progresso, pipelineAtual }: { progresso: ProgressoDaMeta; pipelineAtual: number }) {
  const anual = progresso.trimestres[3];
  const pct = anual.marco ? Math.min(100, Math.round((progresso.realizadoNoAno / anual.marco) * 100)) : 0;
  const { pipeline, primeiroContrato } = progresso.ativacao;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-gray-400">Período {fmtDate(progresso.inicio)} a {fmtDate(progresso.fim)}</span>
          <span className="text-white font-bold">{fmtBRL(progresso.realizadoNoAno)} de {fmtBRL(anual.marco)}</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-cyan-400" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {progresso.trimestres.map((t) => (
          <div key={t.numero} className="rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
            <p className="text-[10px] uppercase text-gray-500">{t.numero}º trimestre · até {fmtDate(t.ate)}</p>
            <p className="text-xs text-white mt-0.5">{fmtBRL(t.realizado)}{t.marco != null ? <span className="text-gray-500"> / {fmtBRL(t.marco)}</span> : null}</p>
            <p className={`text-[10px] mt-0.5 ${t.atingido === true ? 'text-emerald-400' : t.atingido === false ? 'text-amber-300' : 'text-gray-500'}`}>
              {t.marco == null ? 'sem marco' : t.atingido === true ? 'marco atingido' : t.atingido === false ? 'abaixo do marco' : 'em andamento'}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
        <div className="rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
          <p className="text-gray-500">Pipeline qualificado até o 90º dia ({fmtDate(pipeline.ate)})</p>
          <p className="text-white mt-0.5">
            {pipeline.meta == null ? 'Sem marco' : pipeline.aberto ? `${fmtBRL(pipelineAtual)} de ${fmtBRL(pipeline.meta)} hoje` : `Marco de ${fmtBRL(pipeline.meta)}, período encerrado`}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
          <p className="text-gray-500">1º contrato{primeiroContrato.ate ? ` até ${fmtDate(primeiroContrato.ate)}` : ''}</p>
          <p className={`mt-0.5 ${primeiroContrato.atingido === true ? 'text-emerald-400' : primeiroContrato.atingido === false ? 'text-amber-300' : 'text-white'}`}>
            {primeiroContrato.fechadoEm ? `Fechado em ${fmtDate(primeiroContrato.fechadoEm)}` : primeiroContrato.prazoMeses == null ? 'Sem marco' : 'Ainda não fechado'}
          </p>
        </div>
      </div>

      <p className="text-[10px] text-gray-500">
        {progresso.contratos} contrato{progresso.contratos === 1 ? '' : 's'} no período ({progresso.contratosDaCarteira} da carteira). Conta o valor contratado, não o recebido. As metas não mudam a proteção, as comissões nem a ajuda de custo (cláusula 9.11).
      </p>
    </div>
  );
}
