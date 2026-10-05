'use client';

/**
 * Formulários da DRE. Cada um é um modal; todos chamam as actions de
 * `actions/dre/*`, que validam de novo no servidor (a validação daqui só poupa
 * uma ida e volta: quem decide é o servidor).
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { atualizarContrato, criarContrato, listarOrcamentosParaContrato, regerarParcelas } from '@/actions/dre/contratos';
import { adicionarParcela, atualizarParcela, registrarRecebimento } from '@/actions/dre/parcelas';
import { salvarLancamento } from '@/actions/dre/lancamentos';
import { definirCambio } from '@/actions/dre/cambio';
import type { DadosDRE } from '@/lib/dre/carregar';
import type { ResumoContrato } from '@/lib/dre/consolidar';
import { valorDasHoras } from '@/lib/dre/dinheiro';
import { lerNumeroBR, paraCampoBR } from '@/lib/dre/entrada';
import { primeiroDiaDoMes, ratearMes, rotuloMesLongo, somarMesesAoMes } from '@/lib/dre/rateio';
import { rotuloSemana, ultimasSemanas } from '@/lib/dre/semana';
import {
  CATEGORIAS,
  ROTULO_CATEGORIA,
  STATUS_CONTRATO,
  type CategoriaLancamento,
  type LancamentoDRE,
  type ParcelaDRE,
  type PeriodicidadeLancamento,
  type StatusContrato,
} from '@/lib/dre/tipos';
import { brl, Campo, inputCls, Modal, rodar, Rodape } from './ui';

const ROTULO_STATUS: Record<StatusContrato, string> = {
  em_vigor: 'Em vigor',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

interface Base {
  dados: DadosDRE;
  onFechar: () => void;
  /** Chamado depois de uma escrita que deu certo (recarrega a tela). */
  onSalvo: () => void;
}

/** Empresas reais primeiro; demo no fim, marcada. */
function opcoesEmpresa(dados: DadosDRE) {
  return [...dados.empresas].sort((a, b) => Number(a.isDemo) - Number(b.isDemo) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ── Contrato novo ───────────────────────────────────────────────────────────

type OrcamentoOpcao = {
  id: string;
  nome: string;
  cliente: string | null;
  valorFinal: number;
  parcelas: number;
  parcela: number;
  jaVinculado: boolean;
};

export function DialogoContrato({ dados, empresaInicial, onFechar, onSalvo }: Base & { empresaInicial?: string | null }) {
  const [empresaId, setEmpresaId] = useState(empresaInicial && dados.empresas.some((e) => e.id === empresaInicial) ? empresaInicial : '');
  const [nome, setNome] = useState('');
  const [orcamentoId, setOrcamentoId] = useState('');
  const [valor, setValor] = useState('');
  const [inicio, setInicio] = useState(dados.hoje);
  const [gerar, setGerar] = useState(true);
  const [nParcelas, setNParcelas] = useState('12');
  const [primeiro, setPrimeiro] = useState(dados.hoje);
  const [orcamentos, setOrcamentos] = useState<OrcamentoOpcao[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    listarOrcamentosParaContrato({}).then((r) => {
      if (!vivo) return;
      if (r.success && r.data) setOrcamentos(r.data);
      else setErroLista(r.error || 'Não consegui listar os orçamentos.');
    });
    return () => {
      vivo = false;
    };
  }, []);

  const escolherOrcamento = (id: string) => {
    setOrcamentoId(id);
    const o = orcamentos?.find((x) => x.id === id);
    if (!o) return;
    setValor(paraCampoBR(o.valorFinal));
    setNParcelas(String(o.parcelas));
    if (!nome.trim()) setNome(o.nome);
  };

  const valorNum = lerNumeroBR(valor);
  const nNum = lerNumeroBR(nParcelas);
  const podeSalvar = !!empresaId && nome.trim().length > 0 && valorNum !== null && valorNum >= 0 && (!gerar || (nNum !== null && Number.isInteger(nNum) && nNum >= 1));

  const salvar = async () => {
    if (!podeSalvar || valorNum === null) return;
    setSalvando(true);
    const ok = await rodar(
      criarContrato({
        empresaId,
        nome: nome.trim(),
        valorTotalBrl: valorNum,
        inicio,
        orcamentoId: orcamentoId || null,
        parcelas: gerar && nNum !== null ? { n: nNum, primeiroVencimento: primeiro } : null,
      }),
      'Contrato criado.',
    );
    setSalvando(false);
    if (ok) {
      onSalvo();
      onFechar();
    }
  };

  return (
    <Modal
      titulo="Novo contrato"
      descricao="O contrato é o projeto vendido. A receita da DRE só aparece quando você registrar que cada parcela entrou."
      onFechar={onFechar}
    >
      <div className="space-y-3">
        <Campo rotulo="Empresa">
          <select className={inputCls} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Escolha a empresa</option>
            {opcoesEmpresa(dados).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
                {e.isDemo ? ' (demo)' : ''}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          rotulo="Orçamento aprovado (opcional)"
          dica="Liga o contrato ao orçamento e congela o que ele previa (preço, parcelas, custo de IA e pior saldo de caixa), para comparar com o realizado."
          erro={erroLista}
        >
          <select className={inputCls} value={orcamentoId} onChange={(e) => escolherOrcamento(e.target.value)} disabled={orcamentos === null && !erroLista}>
            <option value="">{orcamentos === null && !erroLista ? 'Carregando…' : 'Sem orçamento'}</option>
            {(orcamentos ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
                {o.cliente ? ` · ${o.cliente}` : ''} · {brl(o.valorFinal)}
                {o.jaVinculado ? ' (já ligado a um contrato)' : ''}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Nome do contrato">
          <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Projeto 2026" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor total (R$)" erro={valor && valorNum === null ? 'Digite um número, como 12.000,00.' : null}>
            <input className={inputCls} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo rotulo="Início do projeto">
            <input className={inputCls} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input type="checkbox" checked={gerar} onChange={(e) => setGerar(e.target.checked)} className="accent-[var(--brand-400,#34c5cc)]" />
          Já gerar o calendário de parcelas (você edita uma a uma depois)
        </label>
        {gerar && (
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Número de parcelas" erro={nParcelas && (nNum === null || !Number.isInteger(nNum) || nNum < 1) ? 'Use um número inteiro de 1 a 120.' : null}>
              <input className={inputCls} inputMode="numeric" value={nParcelas} onChange={(e) => setNParcelas(e.target.value)} />
            </Campo>
            <Campo rotulo="1º vencimento" dica="As demais vencem no mesmo dia dos meses seguintes.">
              <input className={inputCls} type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} />
            </Campo>
          </div>
        )}
      </div>
      <Rodape>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} loading={salvando} disabled={!podeSalvar}>Criar contrato</Button>
      </Rodape>
    </Modal>
  );
}

// ── Contrato: editar ────────────────────────────────────────────────────────

export function DialogoContratoEditar({ contrato, onFechar, onSalvo }: Pick<Base, 'onFechar' | 'onSalvo'> & { contrato: ResumoContrato }) {
  const [nome, setNome] = useState(contrato.nome);
  const [valor, setValor] = useState(paraCampoBR(contrato.valorTotalBrl));
  const [inicio, setInicio] = useState(contrato.inicio);
  const [status, setStatus] = useState<StatusContrato>(contrato.status);
  const [salvando, setSalvando] = useState(false);
  const valorNum = lerNumeroBR(valor);

  const salvar = async () => {
    if (valorNum === null) return;
    setSalvando(true);
    const ok = await rodar(atualizarContrato({ id: contrato.id, nome: nome.trim(), valorTotalBrl: valorNum, inicio, status }), 'Contrato atualizado.');
    setSalvando(false);
    if (ok) {
      onSalvo();
      onFechar();
    }
  };

  return (
    <Modal
      titulo="Editar contrato"
      descricao="Mudar o valor não refaz as parcelas: use 'Refazer calendário' ou edite uma a uma. Cancelar um contrato mantém o que já entrou na DRE."
      onFechar={onFechar}
    >
      <div className="space-y-3">
        <Campo rotulo="Nome">
          <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor total (R$)" erro={valor && valorNum === null ? 'Digite um número, como 12.000,00.' : null}>
            <input className={inputCls} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
          <Campo rotulo="Início">
            <input className={inputCls} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
        </div>
        <Campo rotulo="Situação">
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as StatusContrato)}>
            {STATUS_CONTRATO.map((s) => (
              <option key={s} value={s}>{ROTULO_STATUS[s]}</option>
            ))}
          </select>
        </Campo>
      </div>
      <Rodape>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} loading={salvando} disabled={!nome.trim() || valorNum === null}>Salvar</Button>
      </Rodape>
    </Modal>
  );
}

// ── Parcelas ────────────────────────────────────────────────────────────────

export function DialogoRecebimento({ dados, parcela, contratoNome, onFechar, onSalvo }: Base & { parcela: ParcelaDRE; contratoNome: string }) {
  const [recebidoEm, setRecebidoEm] = useState(parcela.recebidoEm ?? dados.hoje);
  const [valor, setValor] = useState(paraCampoBR(parcela.valorRecebidoBrl ?? parcela.valorPrevistoBrl));
  const [nf, setNf] = useState(parcela.notaFiscal ?? '');
  const [salvando, setSalvando] = useState(false);
  const valorNum = lerNumeroBR(valor);

  const salvar = async () => {
    if (valorNum === null) return;
    setSalvando(true);
    const ok = await rodar(
      registrarRecebimento({ parcelaId: parcela.id, recebidoEm, valorRecebidoBrl: valorNum, notaFiscal: nf.trim() || null }),
      'Recebimento registrado.',
    );
    setSalvando(false);
    if (ok) {
      onSalvo();
      onFechar();
    }
  };

  return (
    <Modal
      titulo={`Registrar recebimento · parcela ${parcela.numero}`}
      descricao={`${contratoNome}. A receita entra na DRE na semana desta data. Registre só o que já caiu na conta.`}
      onFechar={onFechar}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data em que entrou" dica="Não pode ser uma data futura.">
            <input className={inputCls} type="date" value={recebidoEm} max={dados.hoje} onChange={(e) => setRecebidoEm(e.target.value)} />
          </Campo>
          <Campo rotulo="Valor recebido (R$)" dica={`Previsto: ${brl(parcela.valorPrevistoBrl)}`} erro={valor && valorNum === null ? 'Digite um número.' : valorNum !== null && valorNum <= 0 ? 'Informe um valor maior que zero.' : null}>
            <input className={inputCls} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
        </div>
        <Campo rotulo="Nota fiscal (opcional)">
          <input className={inputCls} value={nf} onChange={(e) => setNf(e.target.value)} maxLength={60} />
        </Campo>
      </div>
      <Rodape>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} loading={salvando} disabled={valorNum === null || valorNum <= 0 || !recebidoEm}>Registrar</Button>
      </Rodape>
    </Modal>
  );
}

export function DialogoParcela({ parcela, onFechar, onSalvo }: Pick<Base, 'onFechar' | 'onSalvo'> & { parcela: ParcelaDRE }) {
  const [vencimento, setVencimento] = useState(parcela.vencimento);
  const [valor, setValor] = useState(paraCampoBR(parcela.valorPrevistoBrl));
  const [obs, setObs] = useState(parcela.observacao ?? '');
  const [salvando, setSalvando] = useState(false);
  const valorNum = lerNumeroBR(valor);

  const salvar = async () => {
    if (valorNum === null) return;
    setSalvando(true);
    const ok = await rodar(
      atualizarParcela({ id: parcela.id, vencimento, valorPrevistoBrl: valorNum, observacao: obs.trim() || null }),
      'Parcela atualizada.',
    );
    setSalvando(false);
    if (ok) {
      onSalvo();
      onFechar();
    }
  };

  return (
    <Modal titulo={`Editar parcela ${parcela.numero}`} descricao="Muda a previsão. O que já entrou se corrige em 'Registrar recebimento'." onFechar={onFechar}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Vencimento">
            <input className={inputCls} type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </Campo>
          <Campo rotulo="Valor previsto (R$)" erro={valor && valorNum === null ? 'Digite um número.' : null}>
            <input className={inputCls} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
        </div>
        <Campo rotulo="Observação (opcional)">
          <input className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} />
        </Campo>
      </div>
      <Rodape>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} loading={salvando} disabled={valorNum === null || !vencimento}>Salvar</Button>
      </Rodape>
    </Modal>
  );
}

export function DialogoNovaParcela({ dados, contrato, onFechar, onSalvo }: Base & { contrato: ResumoContrato }) {
  const [vencimento, setVencimento] = useState(dados.hoje);
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const valorNum = lerNumeroBR(valor);

  const salvar = async () => {
    if (valorNum === null) return;
    setSalvando(true);
    const ok = await rodar(adicionarParcela({ contratoId: contrato.id, vencimento, valorPrevistoBrl: valorNum }), 'Parcela adicionada.');
    setSalvando(false);
    if (ok) {
      onSalvo();
      onFechar();
    }
  };

  return (
    <Modal titulo="Adicionar parcela" descricao={contrato.nome} onFechar={onFechar}>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Vencimento">
          <input className={inputCls} type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </Campo>
        <Campo rotulo="Valor previsto (R$)" erro={valor && valorNum === null ? 'Digite um número.' : null}>
          <input className={inputCls} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </Campo>
      </div>
      <Rodape>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} loading={salvando} disabled={valorNum === null || !vencimento}>Adicionar</Button>
      </Rodape>
    </Modal>
  );
}

export function DialogoRegerar({ dados, contrato, onFechar, onSalvo }: Base & { contrato: ResumoContrato }) {
  const [n, setN] = useState(String(contrato.previsto?.parcelas ?? Math.max(1, contrato.parcelas.length)));
  const [primeiro, setPrimeiro] = useState(dados.hoje);
  const [salvando, setSalvando] = useState(false);
  const nNum = lerNumeroBR(n);
  const valido = nNum !== null && Number.isInteger(nNum) && nNum >= 1 && nNum <= 120;

  const salvar = async () => {
    if (!valido || nNum === null) return;
    setSalvando(true);
    const ok = await rodar(regerarParcelas({ contratoId: contrato.id, n: nNum, primeiroVencimento: primeiro }), 'Calendário refeito.');
    setSalvando(false);
    if (ok) {
      onSalvo();
      onFechar();
    }
  };

  return (
    <Modal
      titulo="Refazer o calendário de parcelas"
      descricao={`Divide ${brl(contrato.valorTotalBrl)} em parcelas mensais iguais e substitui as atuais. Só funciona se nenhuma parcela deste contrato tiver sido recebida.`}
      onFechar={onFechar}
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Número de parcelas" erro={n && !valido ? 'Use um número inteiro de 1 a 120.' : null}>
          <input className={inputCls} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} />
        </Campo>
        <Campo rotulo="1º vencimento">
          <input className={inputCls} type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} />
        </Campo>
      </div>
      <Rodape>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} loading={salvando} disabled={!valido}>Refazer calendário</Button>
      </Rodape>
    </Modal>
  );
}

// ── Lançamento manual ───────────────────────────────────────────────────────

export function DialogoLancamento({
  dados,
  lancamento,
  empresaInicial,
  onFechar,
  onSalvo,
}: Base & { lancamento?: LancamentoDRE | null; empresaInicial?: string | null }) {
  const editando = !!lancamento;
  const [escopo, setEscopo] = useState<'empresa' | 'plataforma'>(lancamento?.escopo ?? 'empresa');
  const [empresaId, setEmpresaId] = useState(lancamento?.empresaId ?? (empresaInicial && dados.empresas.some((e) => e.id === empresaInicial) ? empresaInicial : ''));
  const semanas = useMemo(() => [...ultimasSemanas(dados.semanaAtual, 26)].reverse(), [dados.semanaAtual]);
  // Os 24 últimos meses, do atual para trás (custo de mês que ainda não começou é recusado).
  const meses = useMemo(() => {
    const atual = primeiroDiaDoMes(dados.hoje);
    return Array.from({ length: 24 }, (_, i) => somarMesesAoMes(atual, -i));
  }, [dados.hoje]);
  const [periodicidade, setPeriodicidade] = useState<PeriodicidadeLancamento>(lancamento?.periodicidade ?? 'semanal');
  const [semana, setSemana] = useState(lancamento?.semanaInicio ?? dados.semanaAtual);
  const [mes, setMes] = useState(lancamento?.mesCompetencia ?? primeiroDiaDoMes(dados.hoje));
  const [categoria, setCategoria] = useState<CategoriaLancamento>(lancamento?.categoria ?? 'horas');
  const [horas, setHoras] = useState(paraCampoBR(lancamento?.horas ?? null));
  const [custoHora, setCustoHora] = useState(paraCampoBR(lancamento?.custoHoraBrl ?? dados.custoHoraPadraoBrl));
  const [responsavel, setResponsavel] = useState(lancamento?.responsavel ?? '');
  const [valor, setValor] = useState(lancamento && lancamento.categoria !== 'horas' ? paraCampoBR(lancamento.valorBrl) : '');
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? '');
  const [salvando, setSalvando] = useState(false);

  const ehHoras = categoria === 'horas';
  const horasNum = lerNumeroBR(horas);
  const custoNum = lerNumeroBR(custoHora);
  const valorNum = lerNumeroBR(valor);
  const valorDasHorasBrl = ehHoras && horasNum !== null && horasNum > 0 && custoNum !== null && custoNum >= 0 ? valorDasHoras(horasNum, custoNum) : null;

  const mensal = periodicidade === 'mensal';
  const valorDoPeriodo = ehHoras ? valorDasHorasBrl : valorNum;
  // A prévia do rateio: as semanas que o mês toca, com os dias e (se já há valor) a fatia de cada uma.
  const rateio = useMemo(
    () => (mensal ? ratearMes(valorDoPeriodo !== null && valorDoPeriodo > 0 ? valorDoPeriodo : 0, mes) : []),
    [mensal, valorDoPeriodo, mes],
  );

  const podeSalvar =
    (escopo === 'plataforma' || !!empresaId) &&
    (ehHoras ? valorDasHorasBrl !== null && valorDasHorasBrl > 0 : valorNum !== null && valorNum > 0);

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    const ok = await rodar(
      salvarLancamento({
        id: lancamento?.id ?? null,
        escopo,
        empresaId: escopo === 'empresa' ? empresaId : null,
        periodicidade,
        semanaInicio: mensal ? null : semana,
        mesCompetencia: mensal ? mes : null,
        categoria,
        descricao: descricao.trim() || null,
        horas: ehHoras ? horasNum : null,
        custoHoraBrl: ehHoras ? custoNum : null,
        responsavel: ehHoras ? responsavel.trim() || null : null,
        valorBrl: ehHoras ? null : valorNum,
      }),
      editando ? 'Lançamento atualizado.' : 'Lançamento registrado.',
    );
    setSalvando(false);
    if (ok) {
      onSalvo();
      onFechar();
    }
  };

  return (
    <Modal
      titulo={editando ? 'Editar lançamento' : 'Novo lançamento de custo'}
      descricao={
        mensal
          ? 'Custo que chega fechado por mês. Você lança o valor do mês e a DRE reparte pelas semanas, proporcional aos dias de cada uma.'
          : 'Custo que o sistema não mede sozinho. Entra na semana escolhida, na linha da categoria.'
      }
      onFechar={onFechar}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="De quem é o custo">
            <select className={inputCls} value={escopo} onChange={(e) => setEscopo(e.target.value as 'empresa' | 'plataforma')}>
              <option value="empresa">De um cliente</option>
              <option value="plataforma">Da plataforma (geral)</option>
            </select>
          </Campo>
          {escopo === 'empresa' ? (
            <Campo rotulo="Empresa">
              <select className={inputCls} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
                <option value="">Escolha a empresa</option>
                {opcoesEmpresa(dados).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                    {e.isDemo ? ' (demo)' : ''}
                  </option>
                ))}
              </select>
            </Campo>
          ) : (
            <div className="self-end pb-2 text-[11px] leading-snug text-white/45">Entra no total geral, sem afetar a margem de nenhuma empresa.</div>
          )}
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold text-white/70">Como o custo chega</span>
          <div role="group" aria-label="Período do custo" className="inline-flex rounded-md border border-white/10 bg-white/[0.03] p-0.5">
            {(['semanal', 'mensal'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={periodicidade === p}
                onClick={() => setPeriodicidade(p)}
                className={`rounded px-3 py-1.5 text-xs font-bold transition-colors ${
                  periodicidade === p ? 'bg-brand-400/20 text-brand-300' : 'text-white/60 hover:text-white'
                }`}
              >
                {p === 'semanal' ? 'Por semana' : 'Por mês'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {mensal ? (
            <Campo rotulo="Mês">
              <select className={inputCls} value={mes} onChange={(e) => setMes(e.target.value)}>
                {!meses.includes(mes) && <option value={mes}>{rotuloMesLongo(mes)}</option>}
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {rotuloMesLongo(m)}
                    {m === primeiroDiaDoMes(dados.hoje) ? ' (em curso)' : ''}
                  </option>
                ))}
              </select>
            </Campo>
          ) : (
            <Campo rotulo="Semana">
              <select className={inputCls} value={semana} onChange={(e) => setSemana(e.target.value)}>
                {!semanas.includes(semana) && <option value={semana}>{rotuloSemana(semana)}</option>}
                {semanas.map((s) => (
                  <option key={s} value={s}>
                    {rotuloSemana(s)}
                    {s === dados.semanaAtual ? ' (em curso)' : ''}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo rotulo="Categoria">
            <select className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaLancamento)}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>
              ))}
            </select>
          </Campo>
        </div>

        {ehHoras ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={mensal ? 'Horas no mês' : 'Horas trabalhadas'} erro={horas && (horasNum === null || horasNum <= 0) ? 'Informe horas maiores que zero.' : null}>
                <input className={inputCls} inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="0,00" />
              </Campo>
              <Campo rotulo="Custo por hora (R$)" dica="O padrão é o do orçamento. Fica gravado nesta linha.">
                <input className={inputCls} inputMode="decimal" value={custoHora} onChange={(e) => setCustoHora(e.target.value)} />
              </Campo>
            </div>
            <Campo rotulo="Quem trabalhou (opcional)">
              <input className={inputCls} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} maxLength={80} />
            </Campo>
            <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70">
              {mensal ? 'Valor do mês' : 'Valor do lançamento'}: <strong className="text-white">{valorDasHorasBrl !== null ? brl(valorDasHorasBrl) : '—'}</strong>
              <span className="text-white/45"> (horas × custo por hora, calculado ao salvar)</span>
            </div>
          </>
        ) : (
          <Campo rotulo={mensal ? 'Valor do mês (R$)' : 'Valor (R$)'} erro={valor && (valorNum === null || valorNum <= 0) ? 'Digite um valor maior que zero.' : null}>
            <input className={inputCls} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          </Campo>
        )}
        {mensal && (
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-3" aria-label="Como o mês é repartido">
            <p className="mb-2 text-[11px] leading-relaxed text-white/55">
              Rateio por dia: cada semana recebe a parte dos dias dela que caem em {rotuloMesLongo(mes)}. A soma das semanas é sempre o valor do mês.
            </p>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-white/5">
                {rateio.map((p) => (
                  <tr key={p.semana}>
                    <td className="py-1 text-white/70">{rotuloSemana(p.semana)}</td>
                    <td className="py-1 text-white/50">{p.dias} {p.dias === 1 ? 'dia' : 'dias'}</td>
                    <td className="py-1 text-right tabular-nums text-white">
                      {valorDoPeriodo !== null && valorDoPeriodo > 0 ? brl(p.valorBrl) : <span className="text-white/30">—</span>}
                      {p.semana > dados.semanaAtual && <span className="ml-2 text-[10px] text-white/40">aparece quando a semana chegar</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Campo rotulo="Descrição (opcional)">
          <input className={inputCls} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} />
        </Campo>
      </div>
      <Rodape>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} loading={salvando} disabled={!podeSalvar}>{editando ? 'Salvar' : 'Lançar'}</Button>
      </Rodape>
    </Modal>
  );
}

// ── Câmbio ──────────────────────────────────────────────────────────────────

export function DialogoCambio({ semana, atual, onFechar, onSalvo }: Pick<Base, 'onFechar' | 'onSalvo'> & { semana: string; atual: number | null }) {
  const [cotacao, setCotacao] = useState(paraCampoBR(atual, 4));
  const [salvando, setSalvando] = useState(false);
  const num = lerNumeroBR(cotacao);
  const valido = num !== null && num > 1 && num < 20;

  const salvar = async () => {
    if (!valido || num === null) return;
    setSalvando(true);
    const ok = await rodar(definirCambio({ semanaInicio: semana, usdBrl: num }), 'Câmbio definido. O custo de IA já fechado da semana foi reconvertido.');
    setSalvando(false);
    if (ok) {
      onSalvo();
      onFechar();
    }
  };

  return (
    <Modal
      titulo={`Câmbio da semana de ${rotuloSemana(semana)}`}
      descricao="Reais por dólar. Uma cotação definida aqui nunca é trocada pela automática, e reconverte o custo de IA que já estava fechado nesta semana."
      onFechar={onFechar}
      largura="max-w-md"
    >
      <Campo rotulo="R$ por US$" erro={cotacao && !valido ? 'Cotação implausível: use um valor entre 1 e 20, como 5,2090.' : null}>
        <input className={inputCls} inputMode="decimal" value={cotacao} onChange={(e) => setCotacao(e.target.value)} placeholder="5,2000" />
      </Campo>
      <Rodape>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} loading={salvando} disabled={!valido}>Definir câmbio</Button>
      </Rodape>
    </Modal>
  );
}
