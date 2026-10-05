'use client';

import { Button } from '@/components/ui';
import type { DadosDRE } from '@/lib/dre/carregar';
import { rotuloSemana } from '@/lib/dre/semana';
import type { FonteCambio } from '@/lib/dre/tipos';
import { Selo } from './ui';

const FONTE: Record<FonteCambio, { rotulo: string; tom: 'ok' | 'info' | 'aviso'; dica: string }> = {
  ptax_bcb: { rotulo: 'PTAX do BCB', tom: 'ok', dica: 'Média da PTAX de venda dos dias úteis da semana.' },
  manual: { rotulo: 'Definido por sócio', tom: 'info', dica: 'Definido à mão. A busca automática nunca troca esta cotação.' },
  herdado: { rotulo: 'Herdado', tom: 'aviso', dica: 'O BCB não respondeu: repete a semana anterior. É trocado pela PTAX na próxima rodada que a achar.' },
  orcamento: { rotulo: 'Cotação do orçamento', tom: 'aviso', dica: 'O BCB não respondeu e não havia semana anterior: usa a cotação do orçamento.' },
};

/**
 * Câmbio de cada semana exibida. Fica recolhido: é auditoria do número em reais
 * do custo de IA (que o sistema mede em dólar), não o assunto principal.
 */
export default function CambioPainel({
  dados,
  onDefinir,
  onRecalcular,
  recalculando,
}: {
  dados: DadosDRE;
  onDefinir: (semana: string, atual: number | null) => void;
  onRecalcular: (semana: string) => void;
  recalculando: string | null;
}) {
  const semanas = [...dados.resultado.janela].reverse();
  const fechada = (s: string) => s < dados.semanaAtual;

  return (
    <details className="rounded-md border border-white/10 bg-white/[0.03]">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-white">
        Câmbio e fechamento por semana
        <span className="ml-2 text-xs font-normal text-white/50">o custo de IA é medido em dólar e convertido pela cotação da semana</span>
      </summary>
      <div className="overflow-x-auto border-t border-white/10">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-white/45">
            <tr className="text-left">
              <th className="px-3 py-1.5">Semana</th>
              <th className="px-3 py-1.5 text-right">R$ por US$</th>
              <th className="px-3 py-1.5">Origem</th>
              {dados.canManage && <th className="px-3 py-1.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {semanas.map((s) => {
              const c = dados.resultado.cambios[s];
              const f = c?.fonte ? FONTE[c.fonte] : null;
              return (
                <tr key={s}>
                  <td className="px-3 py-1.5 text-white/80 whitespace-nowrap">
                    {rotuloSemana(s)}
                    {s === dados.semanaAtual && <span className="ml-1.5 text-[10px] text-amber-300/80">em curso</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white">{c?.usdBrl !== null && c?.usdBrl !== undefined ? c.usdBrl.toLocaleString('pt-BR', { minimumFractionDigits: 4 }) : '—'}</td>
                  <td className="px-3 py-1.5">
                    {f ? <Selo tom={f.tom} title={f.dica}>{f.rotulo}</Selo> : <Selo title="Ainda não há cotação gravada para esta semana. Enquanto isso, o custo de IA dela usa a cotação mais recente conhecida.">sem câmbio da semana</Selo>}
                  </td>
                  {dados.canManage && (
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onDefinir(s, c?.usdBrl ?? null)}>Definir câmbio</Button>
                        {fechada(s) && (
                          <Button size="sm" variant="ghost" loading={recalculando === s} loadingLabel="Recalculando" onClick={() => onRecalcular(s)} title="Refaz o fechamento do custo de IA desta semana (use se chegou chamada tardia)">
                            Recalcular
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
