'use client';

import { ArrowLeft, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import type { DadosDRE } from '@/lib/dre/carregar';
import type { LinhaDRE, ResumoContrato, TenantDRE } from '@/lib/dre/consolidar';
import { estaAtrasada } from '@/lib/dre/parcelas';
import { chaveDeOrdem, rotuloMes } from '@/lib/dre/rateio';
import { rotuloSemana } from '@/lib/dre/semana';
import { CATEGORIAS, ROTULO_CATEGORIA, type CategoriaLancamento, type LancamentoDRE, type ParcelaDRE } from '@/lib/dre/tipos';
import { Situacao } from './TabelaClientes';
import { brl, corDoValor, data, pct, Selo } from './ui';

export interface AcoesDetalhe {
  voltar: () => void;
  novoContrato: () => void;
  editarContrato: (c: ResumoContrato) => void;
  refazerCalendario: (c: ResumoContrato) => void;
  excluirContrato: (c: ResumoContrato) => void;
  novaParcela: (c: ResumoContrato) => void;
  receber: (p: ParcelaDRE, c: ResumoContrato) => void;
  desfazerRecebimento: (p: ParcelaDRE, c: ResumoContrato) => void;
  editarParcela: (p: ParcelaDRE) => void;
  excluirParcela: (p: ParcelaDRE, c: ResumoContrato) => void;
  novoLancamento: () => void;
  editarLancamento: (l: LancamentoDRE) => void;
  excluirLancamento: (l: LancamentoDRE) => void;
}

const LINHAS_CUSTO: Array<{ chave: 'ia' | CategoriaLancamento; rotulo: string }> = [
  { chave: 'ia', rotulo: 'IA (medido)' },
  ...CATEGORIAS.map((c) => ({ chave: c, rotulo: ROTULO_CATEGORIA[c] })),
];

/** Tabela semanal: uma coluna por semana da janela, mais o total do período. */
function TabelaSemanal({ dados, t }: { dados: DadosDRE; t: TenantDRE }) {
  const semanas = dados.resultado.janela;
  const celula = 'px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap';
  const rotuloCls = 'sticky left-0 z-10 bg-[#0A1D38] px-3 py-1.5 text-left';

  const valor = (l: LinhaDRE, k: 'receita' | 'ia' | CategoriaLancamento) => l[k];

  return (
    <div className="overflow-x-auto rounded-md border border-white/10 bg-white/[0.03]">
      <table className="w-full text-xs">
        <thead className="bg-white/[0.04]">
          <tr>
            <th className={`${rotuloCls} text-[10px] font-semibold uppercase tracking-wide text-white/45`}>Semana</th>
            {semanas.map((s) => (
              <th key={s} className="px-2.5 py-2 text-right text-[10px] font-semibold text-white/55 whitespace-nowrap">
                {rotuloSemana(s)}
                {s === dados.semanaAtual && <span className="block text-[9px] font-normal text-amber-300/80">em curso</span>}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-white">Período</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          <tr>
            <td className={`${rotuloCls} font-semibold text-emerald-300`}>Receita recebida</td>
            {semanas.map((s) => (
              <td key={s} className={`${celula} text-emerald-300`}>{valor(t.porSemana[s], 'receita') ? brl(valor(t.porSemana[s], 'receita')) : <span className="text-white/25">—</span>}</td>
            ))}
            <td className={`${celula} font-bold text-emerald-300`}>{brl(t.total.receita)}</td>
          </tr>
          {LINHAS_CUSTO.map(({ chave, rotulo }) => {
            const naoLancado = chave !== 'ia' && t.cobertura[chave] === 'nao_lancado';
            return (
              <tr key={chave}>
                <td className={`${rotuloCls} text-white/75`}>
                  {rotulo}
                  {naoLancado && <span className="ml-1.5 text-[10px] text-amber-300/80" title="Nenhum lançamento no período: não significa custo zero.">não lançado</span>}
                </td>
                {semanas.map((s) => {
                  const v = valor(t.porSemana[s], chave);
                  return (
                    <td key={s} className={`${celula} text-white/80`}>{v ? brl(v) : <span className="text-white/25">—</span>}</td>
                  );
                })}
                <td className={`${celula} font-semibold text-white`}>{naoLancado ? <span className="text-white/25">—</span> : brl(valor(t.total, chave))}</td>
              </tr>
            );
          })}
          <tr className="bg-white/[0.03]">
            <td className={`${rotuloCls} bg-[#0D2342] font-semibold text-white`}>Custo total</td>
            {semanas.map((s) => (
              <td key={s} className={`${celula} font-semibold text-white`}>{brl(t.porSemana[s].custo)}</td>
            ))}
            <td className={`${celula} font-bold text-white`}>{brl(t.total.custo)}</td>
          </tr>
          <tr className="bg-white/[0.03]">
            <td className={`${rotuloCls} bg-[#0D2342] font-bold text-white`}>Resultado</td>
            {semanas.map((s) => (
              <td key={s} className={`${celula} font-bold ${corDoValor(t.porSemana[s].resultado)}`}>{brl(t.porSemana[s].resultado)}</td>
            ))}
            <td className={`${celula} font-bold ${corDoValor(t.total.resultado)}`}>{brl(t.total.resultado)}</td>
          </tr>
          <tr>
            <td className={`${rotuloCls} text-white/60`} title="Resultado ÷ receita. Sem receita na semana, a margem não existe (não é 0%).">Margem</td>
            {semanas.map((s) => (
              <td key={s} className={`${celula} text-white/70`}>{pct(t.porSemana[s].margemPct)}</td>
            ))}
            <td className={`${celula} font-semibold text-white`}>{pct(t.total.margemPct)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BarraRecebido({ valor }: { valor: number | null }) {
  const p = valor === null ? 0 : Math.max(0, Math.min(100, valor));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="img" aria-label={valor === null ? 'sem valor de contrato' : `${pct(valor)} recebido`}>
      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${p}%` }} />
    </div>
  );
}

function PrevistoRealizado({ t, c }: { t: TenantDRE; c: ResumoContrato }) {
  const p = c.previsto;
  if (!p) {
    return <p className="text-[11px] text-white/45">Contrato sem orçamento ligado: não há previsto para comparar. Ligue um orçamento ao criar o contrato.</p>;
  }
  const comp = t.comparacao;
  const pctIa = comp && comp.iaOrcadoBrl > 0 ? Math.round((comp.iaRealizadoBrl / comp.iaOrcadoBrl) * 1000) / 10 : null;
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-white">Previsto no orçamento × realizado</h4>
        <span className="text-[10px] text-white/45">
          {p.orcamentoNome ? `${p.orcamentoNome} · ` : ''}previsto congelado na criação do contrato
        </span>
      </div>
      {!comp ? (
        <p className="text-[11px] leading-relaxed text-amber-200/80">
          Este cliente tem mais de um contrato em vigor. O custo realizado é do cliente inteiro, e o previsto é de um contrato só: comparar os dois seria comparar coisas diferentes.
        </p>
      ) : (
        <dl className="grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-white/50">Custo de IA</dt>
            <dd className="mt-0.5 font-semibold text-white tabular-nums">
              {brl(comp.iaRealizadoBrl)} <span className="font-normal text-white/50">de {brl(comp.iaOrcadoBrl)} orçados{pctIa !== null ? ` (${pct(pctIa)})` : ''}</span>
            </dd>
          </div>
          <div>
            <dt className="text-white/50">Resultado de caixa acumulado</dt>
            <dd className={`mt-0.5 font-semibold tabular-nums ${corDoValor(comp.resultadoCaixaAcumuladoBrl)}`}>
              {brl(comp.resultadoCaixaAcumuladoBrl)} <span className="font-normal text-white/50">· pior saldo previsto {brl(comp.piorSaldoPrevistoBrl)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-white/50">Andamento do programa</dt>
            <dd className="mt-0.5 font-semibold text-white tabular-nums">
              mês {Math.min(comp.mesesDecorridos + 1, comp.mesesPrograma)} <span className="font-normal text-white/50">de {comp.mesesPrograma}</span>
            </dd>
          </div>
        </dl>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-white/40">
        O custo total orçado ({brl(p.custoTotalBrl)}) não é comparado: ele inclui itens que a DRE ainda não mede sozinha (WhatsApp e infraestrutura rateada).
      </p>
    </div>
  );
}

function CartaoContrato({
  dados,
  t,
  c,
  acoes,
}: {
  dados: DadosDRE;
  t: TenantDRE;
  c: ResumoContrato;
  acoes: AcoesDetalhe;
}) {
  const tomStatus = c.status === 'em_vigor' ? 'ok' : c.status === 'encerrado' ? 'neutro' : 'erro';
  const rotuloStatus = c.status === 'em_vigor' ? 'Em vigor' : c.status === 'encerrado' ? 'Encerrado' : 'Cancelado';
  const podeEditar = dados.canManage;

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-white">{c.nome}</h3>
            <Selo tom={tomStatus}>{rotuloStatus}</Selo>
          </div>
          <p className="mt-0.5 text-[11px] text-white/50">Início em {data(c.inicio)} · valor do contrato {brl(c.valorTotalBrl)}</p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" leftIcon={<Pencil size={12} />} onClick={() => acoes.editarContrato(c)}>Editar</Button>
            <Button size="sm" variant="ghost" leftIcon={<RotateCcw size={12} />} onClick={() => acoes.refazerCalendario(c)}>Refazer calendário</Button>
            <Button size="sm" variant="ghost" leftIcon={<Plus size={12} />} onClick={() => acoes.novaParcela(c)}>Parcela</Button>
            <Button size="sm" variant="danger" leftIcon={<Trash2 size={12} />} onClick={() => acoes.excluirContrato(c)}>Excluir</Button>
          </div>
        )}
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-white/60">
          <span>Recebido {brl(c.recebidoBrl)}{c.pctRecebido !== null ? ` · ${pct(c.pctRecebido)}` : ''}</span>
          <span>A receber {brl(c.aReceberBrl)}</span>
        </div>
        <BarraRecebido valor={c.pctRecebido} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.atrasadas.qtd > 0 && <Selo tom="erro">{c.atrasadas.qtd} atrasada{c.atrasadas.qtd > 1 ? 's' : ''} · {brl(c.atrasadas.valorBrl)}</Selo>}
          {c.proximas4Semanas.qtd > 0 && <Selo tom="info">{c.proximas4Semanas.qtd} a vencer em 28 dias · {brl(c.proximas4Semanas.valorBrl)}</Selo>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-white/10">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-white/45">
            <tr className="text-left">
              <th className="px-3 py-1.5">Parcela</th>
              <th className="px-3 py-1.5">Vencimento</th>
              <th className="px-3 py-1.5 text-right">Previsto</th>
              <th className="px-3 py-1.5">Entrou em</th>
              <th className="px-3 py-1.5 text-right">Recebido</th>
              <th className="px-3 py-1.5">Nota fiscal</th>
              {podeEditar && <th className="px-3 py-1.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {c.parcelas.length === 0 && (
              <tr><td colSpan={podeEditar ? 7 : 6} className="px-3 py-4 text-center text-white/45">Sem parcelas cadastradas. Gere o calendário ou adicione uma parcela.</td></tr>
            )}
            {c.parcelas.map((p) => {
              const recebida = p.recebidoEm !== null;
              const atrasada = estaAtrasada(p, dados.hoje) && c.status === 'em_vigor';
              return (
                <tr key={p.id}>
                  <td className="px-3 py-1.5 text-white/80">
                    {p.numero}{' '}
                    {recebida ? <Selo tom="ok">recebida</Selo> : atrasada ? <Selo tom="erro">atrasada</Selo> : <Selo>a receber</Selo>}
                  </td>
                  <td className="px-3 py-1.5 text-white/70">{data(p.vencimento)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white/80">{brl(p.valorPrevistoBrl)}</td>
                  <td className="px-3 py-1.5 text-white/70">{recebida ? data(p.recebidoEm) : '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-300">{recebida ? brl(p.valorRecebidoBrl) : '—'}</td>
                  <td className="px-3 py-1.5 text-white/60">{p.notaFiscal || '—'}</td>
                  {podeEditar && (
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        {recebida ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => acoes.receber(p, c)}>Corrigir</Button>
                            <Button size="sm" variant="ghost" onClick={() => acoes.desfazerRecebimento(p, c)}>Desfazer</Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => acoes.receber(p, c)}>Registrar recebimento</Button>
                            <Button size="sm" variant="ghost" onClick={() => acoes.editarParcela(p)} aria-label={`Editar parcela ${p.numero}`}><Pencil size={12} /></Button>
                            <Button size="sm" variant="ghost" onClick={() => acoes.excluirParcela(p, c)} aria-label={`Excluir parcela ${p.numero}`}><Trash2 size={12} /></Button>
                          </>
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

      <div className="mt-3">
        <PrevistoRealizado t={t} c={c} />
      </div>
    </div>
  );
}

export function TabelaLancamentos({
  dados,
  lancamentos,
  acoes,
}: {
  dados: DadosDRE;
  lancamentos: LancamentoDRE[];
  acoes: Pick<AcoesDetalhe, 'editarLancamento' | 'excluirLancamento'>;
}) {
  // Do mais novo ao mais antigo, pela semana ou pelo mês de cada um.
  const ordenados = [...lancamentos].sort((a, b) => (chaveDeOrdem(a) < chaveDeOrdem(b) ? 1 : chaveDeOrdem(a) > chaveDeOrdem(b) ? -1 : 0));
  return (
    <div className="overflow-x-auto rounded-md border border-white/10 bg-white/[0.03]">
      <table className="w-full min-w-[720px] text-xs">
        <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-white/45">
          <tr className="text-left">
            <th className="px-3 py-1.5">Semana</th>
            <th className="px-3 py-1.5">Categoria</th>
            <th className="px-3 py-1.5">Descrição</th>
            <th className="px-3 py-1.5 text-right">Horas</th>
            <th className="px-3 py-1.5">Quem</th>
            <th className="px-3 py-1.5 text-right">Valor</th>
            {dados.canManage && <th className="px-3 py-1.5 text-right">Ações</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {ordenados.length === 0 && (
            <tr><td colSpan={dados.canManage ? 7 : 6} className="px-3 py-5 text-center text-white/45">Nenhum lançamento manual neste período.</td></tr>
          )}
          {ordenados.map((l) => (
            <tr key={l.id}>
              <td className="px-3 py-1.5 text-white/70 whitespace-nowrap">
                {l.periodicidade === 'mensal' && l.mesCompetencia ? (
                  <span title="Lançado pelo mês: a DRE reparte o valor pelas semanas, proporcional aos dias de cada uma.">
                    {rotuloMes(l.mesCompetencia)} <Selo tom="info">mensal</Selo>
                  </span>
                ) : (
                  rotuloSemana(l.semanaInicio ?? '')
                )}
              </td>
              <td className="px-3 py-1.5 text-white/85">{ROTULO_CATEGORIA[l.categoria]}</td>
              <td className="px-3 py-1.5 text-white/60">{l.descricao || '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/70">{l.horas !== null ? `${l.horas.toLocaleString('pt-BR')}${l.periodicidade === 'mensal' ? ' h/mês' : ''}` : '—'}</td>
              <td className="px-3 py-1.5 text-white/60">{l.responsavel || '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white">{brl(l.valorBrl)}</td>
              {dados.canManage && (
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => acoes.editarLancamento(l)} aria-label="Editar lançamento"><Pencil size={12} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => acoes.excluirLancamento(l)} aria-label="Excluir lançamento"><Trash2 size={12} /></Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DetalheCliente({
  dados,
  tenant,
  acoes,
}: {
  dados: DadosDRE;
  tenant: TenantDRE;
  acoes: AcoesDetalhe;
}) {
  const lancamentos = dados.lancamentos.filter((l) => l.escopo === 'empresa' && l.chaveEmpresa === tenant.chave);
  const { canManage } = dados;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={acoes.voltar} className="mb-1 inline-flex items-center gap-1 text-xs text-white/55 hover:text-white">
            <ArrowLeft size={13} /> Todos os clientes
          </button>
          <h2 className="text-lg font-bold text-white">{tenant.nome}</h2>
          <div className="mt-1.5"><Situacao t={tenant} /></div>
        </div>
        <div className="text-right text-xs text-white/55">
          <div>Resultado de caixa acumulado desde a 1ª semana com dado</div>
          <div className={`text-lg font-bold tabular-nums ${corDoValor(tenant.caixaAcumuladoBrl)}`}>{brl(tenant.caixaAcumuladoBrl)}</div>
        </div>
      </div>

      <section aria-label="DRE semanal">
        <h3 className="mb-2 text-sm font-bold text-white">DRE por semana</h3>
        <TabelaSemanal dados={dados} t={tenant} />
      </section>

      <section aria-label="Contratos">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white">Contratos e parcelas</h3>
          {canManage && !tenant.empresaRemovida && (
            <Button size="sm" variant="secondary" leftIcon={<Plus size={12} />} onClick={acoes.novoContrato}>Novo contrato</Button>
          )}
        </div>
        {tenant.contratos.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/55">
            Nenhum contrato cadastrado para este cliente. Sem contrato não há receita na DRE: o custo aparece sozinho.
          </div>
        ) : (
          <div className="space-y-3">
            {tenant.contratos.map((c) => (
              <CartaoContrato key={c.id} dados={dados} t={tenant} c={c} acoes={acoes} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Lançamentos manuais">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white">Custos lançados à mão</h3>
          {canManage && (
            <Button size="sm" variant="secondary" leftIcon={<Plus size={12} />} onClick={acoes.novoLancamento}>Novo lançamento</Button>
          )}
        </div>
        <TabelaLancamentos dados={dados} lancamentos={lancamentos} acoes={acoes} />
      </section>
    </div>
  );
}
