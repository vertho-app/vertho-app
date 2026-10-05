'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, Plus, Receipt, TrendingUp, Wallet } from 'lucide-react';
import AdminPageHeader from '@/components/admin/page-header';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { Button, MetricCard } from '@/components/ui';
import { excluirContrato } from '@/actions/dre/contratos';
import { desfazerRecebimento, excluirParcela } from '@/actions/dre/parcelas';
import { excluirLancamento } from '@/actions/dre/lancamentos';
import { recalcularSemana } from '@/actions/dre/cambio';
import type { DadosDRE } from '@/lib/dre/carregar';
import type { ResumoContrato } from '@/lib/dre/consolidar';
import { rotuloPeriodoDoLancamento } from '@/lib/dre/rateio';
import { rotuloSemana } from '@/lib/dre/semana';
import { ROTULO_CATEGORIA, type LancamentoDRE, type ParcelaDRE } from '@/lib/dre/tipos';
import CambioPainel from './CambioPainel';
import {
  DialogoCambio,
  DialogoContrato,
  DialogoContratoEditar,
  DialogoLancamento,
  DialogoNovaParcela,
  DialogoParcela,
  DialogoRecebimento,
  DialogoRegerar,
} from './Dialogos';
import DetalheCliente, { TabelaLancamentos, type AcoesDetalhe } from './DetalheCliente';
import TabelaClientes from './TabelaClientes';
import { brl, brlCurto, data, pct, rodar } from './ui';

type Dialogo =
  | { tipo: 'contrato' }
  | { tipo: 'contratoEditar'; c: ResumoContrato }
  | { tipo: 'recebimento'; p: ParcelaDRE; c: ResumoContrato }
  | { tipo: 'parcela'; p: ParcelaDRE }
  | { tipo: 'novaParcela'; c: ResumoContrato }
  | { tipo: 'regerar'; c: ResumoContrato }
  | { tipo: 'lancamento'; l?: LancamentoDRE }
  | { tipo: 'cambio'; semana: string; atual: number | null };

export default function DreView({ dados, empresaInicial }: { dados: DadosDRE; empresaInicial: string | null }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [selecionada, setSelecionada] = useState<string | null>(empresaInicial);
  const [dlg, setDlg] = useState<Dialogo | null>(null);
  const [recalculando, setRecalculando] = useState<string | null>(null);

  // O parâmetro da URL manda quando MUDA (o menu leva a `?empresa=<id>`); a escolha
  // feita na própria tela não mexe na URL e, por isso, não é desfeita por ele.
  useEffect(() => {
    setSelecionada(empresaInicial);
  }, [empresaInicial]);

  const atualizar = useCallback(() => router.refresh(), [router]);
  const fechar = useCallback(() => setDlg(null), []);

  const { resultado } = dados;
  const geral = resultado.totais.geral;
  const tenant = selecionada ? resultado.tenants.find((t) => t.chave === selecionada) ?? null : null;
  const empresaSemRegistro = selecionada && !tenant ? dados.empresas.find((e) => e.id === selecionada) ?? null : null;

  const irParaPeriodo = (semanas: number) => {
    const q = new URLSearchParams({ semanas: String(semanas) });
    if (selecionada) q.set('empresa', selecionada);
    router.push(`/admin/vertho/dre?${q.toString()}`);
  };

  const acoes: AcoesDetalhe = {
    voltar: () => setSelecionada(null),
    novoContrato: () => setDlg({ tipo: 'contrato' }),
    editarContrato: (c) => setDlg({ tipo: 'contratoEditar', c }),
    refazerCalendario: (c) => setDlg({ tipo: 'regerar', c }),
    novaParcela: (c) => setDlg({ tipo: 'novaParcela', c }),
    receber: (p, c) => setDlg({ tipo: 'recebimento', p, c }),
    editarParcela: (p) => setDlg({ tipo: 'parcela', p }),
    novoLancamento: () => setDlg({ tipo: 'lancamento' }),
    editarLancamento: (l) => setDlg({ tipo: 'lancamento', l }),

    excluirContrato: async (c) => {
      const ok = await confirmar({
        title: `Excluir o contrato "${c.nome}"?`,
        message: 'Apaga o contrato e as parcelas ainda a receber. Se já entrou dinheiro neste contrato o sistema recusa: nesse caso cancele o contrato em vez de apagar, e o que entrou continua na DRE.',
        severity: 'danger',
        confirmLabel: 'Excluir contrato',
      });
      if (ok && (await rodar(excluirContrato({ id: c.id }), 'Contrato excluído.'))) atualizar();
    },
    desfazerRecebimento: async (p, c) => {
      const ok = await confirmar({
        title: `Desfazer o recebimento da parcela ${p.numero}?`,
        message: `A parcela volta a ficar "a receber" e ${brl(p.valorRecebidoBrl)} saem da receita de ${data(p.recebidoEm)}. Use quando o lançamento foi feito por engano.`,
        scopeNote: c.nome,
        severity: 'danger',
        confirmLabel: 'Desfazer recebimento',
      });
      if (ok && (await rodar(desfazerRecebimento({ parcelaId: p.id }), 'Recebimento desfeito.'))) atualizar();
    },
    excluirParcela: async (p, c) => {
      const ok = await confirmar({
        title: `Excluir a parcela ${p.numero}?`,
        message: `${brl(p.valorPrevistoBrl)} com vencimento em ${data(p.vencimento)}. A numeração das demais não muda.`,
        scopeNote: c.nome,
        severity: 'danger',
        confirmLabel: 'Excluir parcela',
      });
      if (ok && (await rodar(excluirParcela({ id: p.id }), 'Parcela excluída.'))) atualizar();
    },
    excluirLancamento: async (l) => {
      const ok = await confirmar({
        title: 'Excluir este lançamento?',
        message: `${ROTULO_CATEGORIA[l.categoria]} de ${brl(l.valorBrl)} (${rotuloPeriodoDoLancamento(l)}). O que foi apagado fica registrado na auditoria.`,
        severity: 'danger',
        confirmLabel: 'Excluir lançamento',
      });
      if (ok && (await rodar(excluirLancamento({ id: l.id }), 'Lançamento excluído.'))) atualizar();
    },
  };

  const recalcular = async (semana: string) => {
    setRecalculando(semana);
    const ok = await rodar(recalcularSemana({ semanaInicio: semana }), 'Semana recalculada.');
    setRecalculando(null);
    if (ok) atualizar();
  };

  const lancamentosPlataforma = dados.lancamentos.filter((l) => l.escopo === 'plataforma');
  const atrasadas = resultado.parcelas.atrasadas;
  const proximas = resultado.parcelas.proximas4Semanas;
  const geradoEm = new Date(dados.geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 md:p-6">
      <AdminPageHeader
        icon={Wallet}
        title="DRE por tenant"
        subtitle="Receita por caixa (conta quando o dinheiro entra) e custos por semana, de cada cliente."
        actions={
          dados.canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" leftIcon={<Plus size={14} />} onClick={() => setDlg({ tipo: 'lancamento' })}>Novo lançamento</Button>
              <Button variant="primary" leftIcon={<Plus size={14} />} onClick={() => setDlg({ tipo: 'contrato' })}>Novo contrato</Button>
            </div>
          ) : undefined
        }
      />

      {dados.avisos.map((a) => (
        <div key={a} role="alert" className="flex items-start gap-2 rounded-md border border-red-400/35 bg-red-400/[0.07] px-4 py-3 text-sm text-red-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{a}</span>
        </div>
      ))}

      <div className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-100/90">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
        <div>
          <strong className="text-amber-200">O custo de cada cliente é um piso, não o total.</strong> Ainda não medimos o WhatsApp (a Meta cobra por mensagem), não rateamos a infraestrutura e parte da IA de entrega está sem empresa atribuída. Margem alta aqui pode ser custo que ninguém lançou: confira o selo de cada cliente.
          <details className="mt-1.5">
            <summary className="cursor-pointer text-amber-200/90">Como ler esta tela</summary>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-amber-100/80">
              <li><strong>Receita:</strong> só parcela marcada como recebida, na semana da data em que entrou. Parcela a receber é previsão e não conta.</li>
              <li><strong>Custo de IA:</strong> vem do registro automático de chamadas, fechado toda segunda e convertido pelo câmbio da semana. A semana em curso é calculada agora e pode mudar.</li>
              <li><strong>Horas, impostos, comissão, WhatsApp, infraestrutura e terceiros:</strong> lançados à mão, por semana ou por mês. "Sem lançamento" quer dizer que ninguém lançou, não que custou zero.</li>
              <li><strong>Custo lançado por mês:</strong> o valor do mês é repartido pelas semanas, proporcional aos dias de cada semana que caem no mês (uma semana que cruza dois meses recebe uma fatia de cada). A soma das semanas é sempre o valor do mês, e a parte de uma semana que ainda não chegou aparece quando ela chegar.</li>
              <li><strong>Total geral:</strong> inclui os custos dos clientes, de pesquisa e desenvolvimento, dos ambientes de demonstração e da plataforma. Custos sem vínculo com uma empresa não entram na margem de nenhum cliente.</li>
              <li><strong>Margem:</strong> resultado ÷ receita. Sem receita na semana ela não existe (aparece como "—", não como 0%).</li>
            </ul>
          </details>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Receita recebida" value={brlCurto(geral.receita)} helper={`${resultado.janela.length} semanas, por caixa`} icon={<TrendingUp size={15} />} accent="#2ECC71" />
        <MetricCard label="Custo dos clientes" value={brlCurto(resultado.totais.operacao.custo)} helper="IA medida + custos lançados" icon={<Receipt size={15} />} />
        <MetricCard label="Resultado geral" value={<span className={geral.resultado < 0 ? 'text-red-300' : 'text-white'}>{brlCurto(geral.resultado)}</span>} helper={`margem ${pct(geral.margemPct)}`} accent={geral.resultado < 0 ? '#E74C3C' : '#2ECC71'} />
        <MetricCard label="Parcelas atrasadas" value={String(atrasadas.qtd)} helper={atrasadas.qtd ? brl(atrasadas.valorBrl) : 'nenhuma'} icon={<CalendarClock size={15} />} accent={atrasadas.qtd ? '#E74C3C' : '#2ECC71'} />
        <MetricCard label="A vencer em 28 dias" value={String(proximas.qtd)} helper={proximas.qtd ? brl(proximas.valorBrl) : 'nenhuma'} icon={<CalendarClock size={15} />} />
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        <span className="text-xs text-white/55">Período:</span>
        {dados.opcoesJanela.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => irParaPeriodo(n)}
            aria-pressed={n === dados.semanasNaJanela}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
              n === dados.semanasNaJanela ? 'border-brand-400/60 bg-brand-400/15 text-brand-300' : 'border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.07]'
            }`}
          >
            {n} semanas
          </button>
        ))}
        <span className="ml-1 text-[11px] text-white/40">até a semana de {rotuloSemana(dados.semanaAtual)}</span>
      </div>

      {tenant ? (
        <DetalheCliente dados={dados} tenant={tenant} acoes={acoes} />
      ) : empresaSemRegistro ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setSelecionada(null)} className="text-xs text-white/55 hover:text-white">← Todos os clientes</button>
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-6 text-center">
            <h2 className="text-base font-bold text-white">{empresaSemRegistro.nome}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-white/55">Esta empresa ainda não tem contrato, custo de IA nem lançamento neste período.</p>
            {dados.canManage && (
              <Button className="mt-4" variant="primary" leftIcon={<Plus size={14} />} onClick={() => setDlg({ tipo: 'contrato' })}>Cadastrar contrato</Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <section aria-label="Clientes">
            <h2 className="mb-2 text-sm font-bold text-white">Clientes</h2>
            <TabelaClientes resultado={resultado} onAbrir={setSelecionada} />
          </section>
          <section aria-label="Custos gerais da plataforma">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-white">Custos gerais da plataforma <span className="text-xs font-normal text-white/45">(lançados à mão, fora da margem dos clientes)</span></h2>
            </div>
            <TabelaLancamentos dados={dados} lancamentos={lancamentosPlataforma} acoes={acoes} />
          </section>
        </>
      )}

      <CambioPainel dados={dados} onDefinir={(semana, atual) => setDlg({ tipo: 'cambio', semana, atual })} onRecalcular={recalcular} recalculando={recalculando} />

      <p className="text-[11px] text-white/35">Atualizado em {geradoEm} (Brasília). Semanas de segunda a domingo. Valores em reais.</p>

      {dlg?.tipo === 'contrato' && <DialogoContrato dados={dados} empresaInicial={selecionada} onFechar={fechar} onSalvo={atualizar} />}
      {dlg?.tipo === 'contratoEditar' && <DialogoContratoEditar contrato={dlg.c} onFechar={fechar} onSalvo={atualizar} />}
      {dlg?.tipo === 'recebimento' && <DialogoRecebimento dados={dados} parcela={dlg.p} contratoNome={dlg.c.nome} onFechar={fechar} onSalvo={atualizar} />}
      {dlg?.tipo === 'parcela' && <DialogoParcela parcela={dlg.p} onFechar={fechar} onSalvo={atualizar} />}
      {dlg?.tipo === 'novaParcela' && <DialogoNovaParcela dados={dados} contrato={dlg.c} onFechar={fechar} onSalvo={atualizar} />}
      {dlg?.tipo === 'regerar' && <DialogoRegerar dados={dados} contrato={dlg.c} onFechar={fechar} onSalvo={atualizar} />}
      {dlg?.tipo === 'lancamento' && <DialogoLancamento dados={dados} lancamento={dlg.l} empresaInicial={selecionada} onFechar={fechar} onSalvo={atualizar} />}
      {dlg?.tipo === 'cambio' && <DialogoCambio semana={dlg.semana} atual={dlg.atual} onFechar={fechar} onSalvo={atualizar} />}
    </div>
  );
}
