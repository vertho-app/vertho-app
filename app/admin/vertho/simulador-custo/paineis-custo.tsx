'use client';

/**
 * Painéis de custo que NÃO dependem do ledger: custo por jornada e infra fixa.
 *
 * Vivem fora de page.tsx porque são o que sobrou da tela estática
 * /admin/vertho/custo-ia, aposentada em 01/09/2026 — e porque, sem depender de
 * action nem de tradução, podem ser renderizados isolados para conferir a
 * composição visual (guard prova que o código chama; só a imagem prova a tela).
 */
import { useMemo } from 'react';
import { Route, Server } from 'lucide-react';
import { PRESETS, INFRA_FIXA, infraFixaTotal, custoColabNaJornada } from '@/lib/ia-cost-catalog';
import {
  PROGRAMA_JORNADA, PROGRAMA_REGULAR_DUO, PROGRAMA_REGULAR,
  PROGRAMA_ONBOARDING, PROGRAMA_PILOTO,
} from '@/lib/season-engine/programa-config';
import type { AppLocale } from '@/i18n/routing';

/**
 * As jornadas que a engine sabe montar hoje, na ordem em que se usam. A config
 * é a MESMA que `getProgramaConfigByModo` serve à geração de trilha — a tela lê
 * dela, não de uma tabela paralela, para não voltar a divergir do produto.
 */
export const JORNADAS = [
  { rotulo: 'Jornada', detalhe: 'formato atual · 6 sem. de conteúdo + fechamento', cfg: PROGRAMA_JORNADA },
  { rotulo: 'Regular DUO', detalhe: 'default global · 2 competências em paralelo', cfg: PROGRAMA_REGULAR_DUO },
  { rotulo: 'Regular single', detalhe: '1 competência aprofundada', cfg: PROGRAMA_REGULAR },
  { rotulo: 'Onboarding', detalhe: 'espiral · 5 competências', cfg: PROGRAMA_ONBOARDING },
  { rotulo: 'Piloto', detalhe: 'degustação', cfg: PROGRAMA_PILOTO },
];
/**
 * Custo de IA por JORNADA — o mesmo catálogo lido pelas dimensões de cada modo
 * do programa (semanas de conteúdo, missões, competências), em vez do `exec`
 * fixo, que descreve só o Regular DUO.
 *
 * É o bloco que veio da tela estática `/admin/vertho/custo-ia` (aposentada em
 * 01/09/2026). Lá os números eram digitados a cada revisão e o formato `jornada`,
 * criado em 05/08, nunca chegou a aparecer: a tabela tinha três linhas e o
 * produto já tinha cinco modos.
 */
export function JornadasPanel({ locale, preset, nColabs }: { locale: AppLocale; preset: string; nColabs: number }) {
  const modelFn = useMemo(() => {
    const p = PRESETS[preset as keyof typeof PRESETS];
    return p ? p.model : (c: any) => c.defaultModel;
  }, [preset]);

  const linhas = useMemo(() => JORNADAS.map((j) => {
    const total = custoColabNaJornada(j.cfg, modelFn);
    const semOpcionais = custoColabNaJornada(j.cfg, modelFn, { incluirOpcionais: false });
    return {
      ...j,
      semanas: j.cfg.semanas,
      conteudo: j.cfg.slotsConteudo.length,
      comps: j.cfg.numCompetencias,
      usd: total.usd,
      usdPiso: semOpcionais.usd,
    };
  }), [modelFn]);

  const nf = (n: number) => n.toLocaleString(locale);

  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5 mb-6">
      <p className="text-sm font-bold text-indigo-200 flex items-center gap-2">
        <Route size={16} /> Custo de IA por jornada
      </p>
      <p className="text-[11px] text-gray-400 mt-0.5 mb-3">
        Derivado das configs reais em <code className="text-gray-300">programa-config.ts</code> — mudar um modo lá move estes
        números. O preset escolhido acima vale para todas as linhas. &quot;Piso&quot; exclui o que só roda sob demanda (BETO, PDI).
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-500 text-left">
              {/* No telefone só cabem as três colunas que decidem: a jornada, o
                  custo por pessoa e o total. Sem isso a tabela sangra para fora
                  do container e o "1,34" chega cortado em "1" — número errado na
                  tela, sem erro nenhum no código. */}
              <th className="py-1.5 pr-3">Jornada</th>
              <th className="py-1.5 pr-3 text-right hidden sm:table-cell">Semanas</th>
              <th className="py-1.5 pr-3 text-right hidden sm:table-cell">Conteúdo</th>
              <th className="py-1.5 pr-3 text-right hidden sm:table-cell">Comp.</th>
              <th className="py-1.5 pr-3 text-right">USD/colab</th>
              <th className="py-1.5 pr-3 text-right hidden md:table-cell">Piso</th>
              <th className="py-1.5 text-right">× {nf(nColabs)}</th>
            </tr>
          </thead>
          <tbody className="text-gray-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {linhas.map((l) => (
              <tr key={l.rotulo} className="border-t border-white/[0.06]">
                <td className="py-1.5 pr-3">
                  <span className="font-medium text-white">{l.rotulo}</span>
                  <span className="block text-[10px] text-gray-500">{l.detalhe}</span>
                </td>
                <td className="py-1.5 pr-3 text-right hidden sm:table-cell">{l.semanas}</td>
                <td className="py-1.5 pr-3 text-right hidden sm:table-cell">{l.conteudo}</td>
                <td className="py-1.5 pr-3 text-right hidden sm:table-cell">{l.comps}</td>
                <td className="py-1.5 pr-3 text-right font-bold text-indigo-200">{l.usd.toFixed(2)}</td>
                <td className="py-1.5 pr-3 text-right text-gray-500 hidden md:table-cell">{l.usdPiso.toFixed(2)}</td>
                <td className="py-1.5 text-right font-bold text-white">{(l.usd * nColabs).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-gray-500 mt-3">
        Escala one-time (setup da empresa, biblioteca de conteúdo, vídeo) não entra aqui — ela não multiplica por pessoa.
        Use os campos de escala no topo para essas.
      </p>
    </div>
  );
}

/** Infra fixa da plataforma — custo de existir, rateado entre todos os tenants. */
export function InfraPanel({ locale }: { locale: AppLocale }) {
  const total = infraFixaTotal();
  const nf = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 0 });
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <p className="text-sm font-bold text-gray-200 flex items-center gap-2">
        <Server size={16} /> Infra fixa mensal — plataforma
      </p>
      <p className="text-[11px] text-gray-400 mt-0.5 mb-3">
        Custo de existir, não por empresa: rateado entre todos os tenants. Uma empresa nova de 100 pessoas quase não move
        estes números. Faixas declaradas (ordem de grandeza), conferidas em 01/09/2026 — não saem de fatura.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-500 text-left">
              <th className="py-1.5 pr-3">Serviço</th>
              <th className="py-1.5 pr-3">Papel</th>
              <th className="py-1.5 pr-3">Tipo</th>
              <th className="py-1.5 text-right">USD/mês</th>
            </tr>
          </thead>
          <tbody className="text-gray-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {INFRA_FIXA.map((s) => (
              <tr key={s.servico} className="border-t border-white/[0.06]">
                <td className="py-1.5 pr-3 font-medium text-white">{s.servico}</td>
                <td className="py-1.5 pr-3 text-gray-400">{s.papel}</td>
                <td className="py-1.5 pr-3 text-gray-500">{s.tipo}</td>
                <td className="py-1.5 text-right">
                  {s.usdMes[0] === s.usdMes[1] ? nf(s.usdMes[0]) : `${nf(s.usdMes[0])}–${nf(s.usdMes[1])}`}
                </td>
              </tr>
            ))}
            <tr className="border-t border-white/20">
              <td className="py-1.5 pr-3 font-bold text-white" colSpan={3}>Total da plataforma</td>
              <td className="py-1.5 text-right font-bold text-white">{nf(total.min)}–{nf(total.max)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

