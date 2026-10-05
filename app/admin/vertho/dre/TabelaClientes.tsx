'use client';

import type { ResultadoDRE, TenantDRE } from '@/lib/dre/consolidar';
import { CATEGORIAS, ROTULO_CATEGORIA } from '@/lib/dre/tipos';
import { brl, corDoValor, pct, Selo } from './ui';

/** Impostos, comissão, WhatsApp, infra, terceiros e outros numa coluna só. */
function outrosCustos(l: { impostos: number; comissao: number; whatsapp: number; infra: number; terceiros: number; outros: number }): number {
  return Math.round((l.impostos + l.comissao + l.whatsapp + l.infra + l.terceiros + l.outros) * 100) / 100;
}

/**
 * O que está medido e o que falta numa linha de cliente. É o selo que impede a
 * margem de parecer maior do que é: custo que ninguém lançou aparece como
 * "sem lançamento", não como zero.
 */
export function Situacao({ t }: { t: TenantDRE }) {
  const faltam = CATEGORIAS.filter((c) => t.cobertura[c] === 'nao_lancado');
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Selo tom="ok" title="O custo de IA vem do registro automático de chamadas, convertido pelo câmbio da semana.">IA medida</Selo>
      {t.iaProvisoria && <Selo tom="aviso" title="Há semana ainda aberta (ou sem câmbio definitivo) neste período: o custo de IA dela pode mudar.">IA provisória</Selo>}
      {t.iaLinhasSemCusto > 0 && (
        <Selo tom="aviso" title={`${t.iaLinhasSemCusto} chamadas de IA estão sem preço no catálogo de modelos: o custo de IA é um piso.`}>IA parcial</Selo>
      )}
      {faltam.length > 0 && (
        <Selo tom="aviso" title={`Sem nenhum lançamento no período: ${faltam.map((c) => ROTULO_CATEGORIA[c].toLowerCase()).join(', ')}. Isso não significa custo zero.`}>
          {faltam.length} custos sem lançamento
        </Selo>
      )}
      {t.semContrato && <Selo tom="erro" title="Nenhum contrato em vigor cadastrado: o custo aparece sem receita para compará-lo.">sem contrato</Selo>}
      {t.empresaRemovida && <Selo title="A empresa foi excluída. Os registros financeiros dela continuam aqui.">empresa excluída</Selo>}
    </div>
  );
}

export default function TabelaClientes({ resultado, onAbrir }: { resultado: ResultadoDRE; onAbrir: (chave: string) => void }) {
  const op = resultado.totais.operacao;
  const geral = resultado.totais.geral;

  const cab = 'px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-white/45';
  const num = 'px-3 py-2 text-right tabular-nums';

  return (
    <div className="overflow-x-auto rounded-md border border-white/10 bg-white/[0.03]">
      <table className="w-full min-w-[980px] text-xs">
        <thead className="bg-white/[0.04]">
          <tr className="text-left">
            <th className={cab}>Cliente</th>
            <th className={`${cab} text-right`}>Receita recebida</th>
            <th className={`${cab} text-right`}>IA</th>
            <th className={`${cab} text-right`}>Horas</th>
            <th className={`${cab} text-right`}>Outros custos</th>
            <th className={`${cab} text-right`}>Resultado</th>
            <th className={`${cab} text-right`}>Margem</th>
            <th className={cab}>O que está medido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {resultado.tenants.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-10 text-center text-sm text-white/50">
                Nenhum cliente com contrato, custo de IA ou lançamento neste período.
              </td>
            </tr>
          )}
          {resultado.tenants.map((t) => (
            <tr key={t.chave} className="hover:bg-white/[0.03]">
              <td className="px-3 py-2">
                <button type="button" onClick={() => onAbrir(t.chave)} className="text-left font-semibold text-white hover:text-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">
                  {t.nome}
                </button>
              </td>
              <td className={`${num} text-emerald-300`}>{brl(t.total.receita)}</td>
              <td className={`${num} text-white/80`}>{brl(t.total.ia)}</td>
              <td className={`${num} text-white/80`}>{t.cobertura.horas === 'nao_lancado' ? <span className="text-amber-300/80" title="Nenhuma hora lançada no período">não lançado</span> : brl(t.total.horas)}</td>
              <td className={`${num} text-white/80`}>{brl(outrosCustos(t.total))}</td>
              <td className={`${num} font-semibold ${corDoValor(t.total.resultado)}`}>{brl(t.total.resultado)}</td>
              <td className={`${num} text-white/80`} title={t.total.margemPct === null ? 'Sem receita no período: a margem não existe (não é 0%).' : undefined}>{pct(t.total.margemPct)}</td>
              <td className="px-3 py-2"><Situacao t={t} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-white/10 bg-white/[0.04] text-xs">
          <tr>
            <td className="px-3 py-2 font-bold text-white">Total dos clientes</td>
            <td className={`${num} font-bold text-emerald-300`}>{brl(op.receita)}</td>
            <td className={`${num} font-bold text-white`}>{brl(op.ia)}</td>
            <td className={`${num} font-bold text-white`}>{brl(op.horas)}</td>
            <td className={`${num} font-bold text-white`}>{brl(outrosCustos(op))}</td>
            <td className={`${num} font-bold ${corDoValor(op.resultado)}`}>{brl(op.resultado)}</td>
            <td className={`${num} font-bold text-white`}>{pct(op.margemPct)}</td>
            <td />
          </tr>
          <tr className="border-t border-white/10">
            <td className="px-3 py-2 font-bold text-white">Total geral</td>
            <td className={`${num} font-bold text-emerald-300`}>{brl(geral.receita)}</td>
            <td className={`${num} font-bold text-white`}>{brl(geral.ia)}</td>
            <td className={`${num} font-bold text-white`}>{brl(geral.horas)}</td>
            <td className={`${num} font-bold text-white`}>{brl(outrosCustos(geral))}</td>
            <td className={`${num} font-bold ${corDoValor(geral.resultado)}`}>{brl(geral.resultado)}</td>
            <td className={`${num} font-bold text-white`}>{pct(geral.margemPct)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
