/**
 * Relatório por clínica do pacote de clínicas (onlabel, decisões de 22 e 23/10/2026): toda segunda às
 * 07h (BRT) o RH da empresa recebe, por e-mail, a situação de cada secretária, clínica por clínica.
 *
 * Primeira versão: a ENTRADA. Quem cobra o perfil e o diagnóstico é a onlabel (no papel de RH), e a
 * regra é "quem não fizer o diagnóstico em 1 semana não começa". Por isso cada pessoa sai com o que
 * falta, pelo NOME da competência, e com o prazo (a véspera do início da turma dela). Quem já está na
 * trilha sai com a temporada e a semana. O engajamento da semana (ativação, consumo, evidência) e o
 * simulador entram na versão seguinte, depois que a primeira turma começar.
 *
 * Módulo PURO: recebe as linhas já lidas e devolve o relatório e o HTML. A coleta mora em
 * `coletar.ts`; o envio, em `enviar.ts`.
 */

import { progressoDoMapeamento, type CompetenciaContada } from '@/lib/assessment/competencias-do-mapeamento';
import type { AssessmentAnswerRef } from '@/lib/assessment/completion';

export interface PessoaDaClinica {
  id: string;
  nome: string | null;
  cargo: string | null;
  escolaId: string | null;
  temPerfil: boolean;
}

export interface TrilhaDaPessoa {
  numeroTemporada: number;
  /** Semana em que a cadência está (fase4_envios.semana_atual), quando a pessoa já está na trilha. */
  semanaAtual: number | null;
  ativa: boolean;
}

export interface DadosRelatorioClinicas {
  clinicas: Array<{ id: string; nome: string }>;
  pessoas: PessoaDaClinica[];
  /** Top 5 do cargo com as ids de cada competência (a régua do cabeçalho do diagnóstico). */
  competenciasPorCargo: Map<string, CompetenciaContada[]>;
  respostasPorPessoa: Map<string, AssessmentAnswerRef[]>;
  /** Início da turma ATIVA da pessoa (AAAA-MM-DD), quando ela está numa turma. */
  inicioDaTurmaPorPessoa: Map<string, string>;
  trilhaPorPessoa: Map<string, TrilhaDaPessoa>;
}

export type Etapa = 'sem_turma' | 'entrada' | 'trilha';

export interface LinhaDaPessoa {
  nome: string;
  etapa: Etapa;
  temPerfil: boolean;
  respondidas: number;
  total: number;
  /** Nomes das competências do diagnóstico que ainda faltam. */
  faltam: string[];
  /** Início da turma (AAAA-MM-DD) e o prazo do diagnóstico (a véspera). */
  inicio: string | null;
  prazo: string | null;
  /** Prazo vencido sem perfil ou diagnóstico completo: pela regra, não começa com a turma. */
  naoComeca: boolean;
  temporada: number | null;
  semana: number | null;
}

export interface ClinicaNoRelatorio {
  nome: string;
  pessoas: LinhaDaPessoa[];
  totais: { pessoas: number; comPerfil: number; diagnosticoCompleto: number; naTrilha: number; pendentes: number };
}

/** Rótulo do bloco das secretárias ainda sem clínica: ninguém some do relatório em silêncio. */
export const SEM_CLINICA = 'Sem clínica';

const diaAnterior = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Monta o relatório. `hoje` é a data de Brasília (AAAA-MM-DD) do envio: decide se o prazo venceu.
 * As clínicas saem em ordem de pendências (mais primeiro) e depois pelo nome; "Sem clínica" sai por último.
 */
export function montarRelatorioClinicas(dados: DadosRelatorioClinicas, hoje: string): ClinicaNoRelatorio[] {
  const linhas = new Map<string, LinhaDaPessoa[]>();
  for (const p of dados.pessoas) {
    const competencias = dados.competenciasPorCargo.get(String(p.cargo || '')) || [];
    const respostas = dados.respostasPorPessoa.get(p.id) || [];
    const { respondidas, total } = progressoDoMapeamento(competencias, respostas);
    const faltam = competencias
      .filter((c) => progressoDoMapeamento([c], respostas).respondidas === 0)
      .map((c) => c.nome);
    const trilha = dados.trilhaPorPessoa.get(p.id);
    const inicio = dados.inicioDaTurmaPorPessoa.get(p.id) || null;
    const etapa: Etapa = trilha?.ativa ? 'trilha' : inicio ? 'entrada' : 'sem_turma';
    const prazo = inicio ? diaAnterior(inicio) : null;
    const completo = p.temPerfil && total > 0 && respondidas >= total;
    linhas.set(p.escolaId || '', [...(linhas.get(p.escolaId || '') || []), {
      nome: (p.nome || '').trim() || '(sem nome)',
      etapa,
      temPerfil: p.temPerfil,
      respondidas,
      total,
      faltam,
      inicio,
      prazo,
      naoComeca: etapa === 'entrada' && !completo && !!prazo && hoje > prazo,
      temporada: trilha?.ativa ? trilha.numeroTemporada : null,
      semana: trilha?.ativa ? trilha.semanaAtual : null,
    }]);
  }

  const pendente = (l: LinhaDaPessoa) => l.etapa !== 'trilha' && !(l.temPerfil && l.total > 0 && l.respondidas >= l.total);
  const bloco = (nome: string, pessoas: LinhaDaPessoa[]): ClinicaNoRelatorio => {
    const ordenadas = [...pessoas].sort((a, b) => Number(pendente(b)) - Number(pendente(a)) || a.nome.localeCompare(b.nome, 'pt-BR'));
    return {
      nome,
      pessoas: ordenadas,
      totais: {
        pessoas: pessoas.length,
        comPerfil: pessoas.filter((l) => l.temPerfil).length,
        diagnosticoCompleto: pessoas.filter((l) => l.total > 0 && l.respondidas >= l.total).length,
        naTrilha: pessoas.filter((l) => l.etapa === 'trilha').length,
        pendentes: pessoas.filter(pendente).length,
      },
    };
  };

  const blocos = dados.clinicas
    .filter((c) => linhas.has(c.id))
    .map((c) => bloco(c.nome, linhas.get(c.id)!))
    .sort((a, b) => b.totais.pendentes - a.totais.pendentes || a.nome.localeCompare(b.nome, 'pt-BR'));
  // Pessoa ligada a uma clínica que não está na lista (ou a nenhuma) vai para "Sem clínica".
  const conhecidas = new Set(dados.clinicas.map((c) => c.id));
  const orfas = [...linhas.entries()].filter(([id]) => !conhecidas.has(id)).flatMap(([, l]) => l);
  if (orfas.length) blocos.push(bloco(SEM_CLINICA, orfas));
  return blocos;
}

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

/** O que a pessoa precisa fazer, em uma frase, para o RH cobrar. */
export function situacaoDaPessoa(l: LinhaDaPessoa): string {
  if (l.etapa === 'trilha') return `Na trilha: temporada ${l.temporada ?? 1}${l.semana ? `, semana ${l.semana}` : ''}`;
  const falta: string[] = [];
  if (!l.temPerfil) falta.push('perfil comportamental');
  if (l.total === 0) falta.push('diagnóstico (o cargo ainda não tem as competências cadastradas)');
  else if (l.faltam.length) falta.push(`diagnóstico de ${l.faltam.join(', ')}`);
  if (!falta.length) return l.inicio ? `Tudo feito; começa em ${dataBR(l.inicio)}` : 'Tudo feito; aguardando turma';
  const base = `Falta: ${falta.join(' e ')}`;
  if (l.etapa === 'sem_turma') return `${base} (ainda sem turma)`;
  if (l.naoComeca) return `${base}. O prazo venceu em ${dataBR(l.prazo)}: não começa com a turma de ${dataBR(l.inicio)}`;
  return `${base}. Prazo: ${dataBR(l.prazo)} (a turma começa em ${dataBR(l.inicio)})`;
}

export function assuntoRelatorioClinicas(empresaNome: string, hoje: string): string {
  return `Relatório das clínicas · ${empresaNome} · ${dataBR(hoje)}`;
}

/**
 * HTML do e-mail. Só nome, situação e prazo de cada secretária: nada de telefone ou e-mail. Todo texto
 * vindo do banco passa por `esc` (nome de pessoa e de clínica são digitados por quem cadastra).
 */
export function htmlRelatorioClinicas(blocos: ClinicaNoRelatorio[], empresaNome: string, hoje: string): string {
  const total = blocos.reduce((s, b) => s + b.totais.pessoas, 0);
  const pendentes = blocos.reduce((s, b) => s + b.totais.pendentes, 0);
  const cabecalho = `<h2 style="margin:0 0 4px;font-family:Arial,sans-serif;color:#0F2B54">Relatório das clínicas</h2>
<p style="margin:0 0 16px;font-family:Arial,sans-serif;color:#555;font-size:13px">${esc(empresaNome)} · ${dataBR(hoje)} · ${total} secretária${total === 1 ? '' : 's'} em ${blocos.length} clínica${blocos.length === 1 ? '' : 's'} · ${pendentes} com pendência na entrada</p>`;
  const corpo = blocos.map((b) => {
    const linhas = b.pessoas.map((l) => `<tr>
<td style="padding:6px 8px;border-top:1px solid #eee;font-family:Arial,sans-serif;font-size:13px">${esc(l.nome)}</td>
<td style="padding:6px 8px;border-top:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;color:${l.naoComeca ? '#B42318' : '#333'}">${esc(situacaoDaPessoa(l))}</td>
</tr>`).join('');
    const t = b.totais;
    return `<h3 style="margin:20px 0 4px;font-family:Arial,sans-serif;color:#0F2B54;font-size:15px">${esc(b.nome)}</h3>
<p style="margin:0 0 6px;font-family:Arial,sans-serif;color:#555;font-size:12px">${t.pessoas} secretária${t.pessoas === 1 ? '' : 's'} · perfil ${t.comPerfil}/${t.pessoas} · diagnóstico completo ${t.diagnosticoCompleto}/${t.pessoas} · na trilha ${t.naTrilha}</p>
<table style="border-collapse:collapse;width:100%">${linhas}</table>`;
  }).join('');
  const rodape = `<p style="margin:24px 0 0;font-family:Arial,sans-serif;color:#888;font-size:11px">Enviado pela vertho.ai toda segunda-feira. Quem não concluir o perfil e o diagnóstico até a véspera do início não começa com a turma.</p>`;
  return `<div>${cabecalho}${corpo || '<p style="font-family:Arial,sans-serif">Nenhuma secretária cadastrada.</p>'}${rodape}</div>`;
}
