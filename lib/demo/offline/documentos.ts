/**
 * Os 18 PDFs de demonstração do pacote offline, gerados pelos RENDERIZADORES ATUAIS do app.
 *
 * Por que este arquivo existe (R-136, 05/10/2026): os PDFs versionados em `documents/` eram de
 * antes das correções de 02 a 05/10 e contradiziam o produto ("Uma jornada de 14 semanas",
 * "Resumo de Desempenho", "candidatos elegíveis", nota decimal). Só 6 dos 18 tinham script; os
 * outros 12 foram feitos à mão e ninguém sabia regerar. Agora é um comando só:
 * `node scripts/gerar-pdfs-demo-offline.mts`.
 *
 * Cada documento sai do mesmo componente que o produto usa, com os dados do pacote:
 *  - PDI, Relatório do Gestor e do RH: `RelatorioIndividual`, `RelatorioGestor`, `RelatorioRH`;
 *  - engajamento: `buildViews` + `RelatorioEngajamento`, sobre o retrato salvo do painel;
 *  - evolução de cada pessoa que concluiu a jornada: `renderTemporadaConcluidaPDF`;
 *  - Ranking de Adequação, um por cargo: `renderRankingAdequacaoPDF`.
 *
 * Sem banco, sem IA, sem credencial. Só as fontes públicas que os componentes registram.
 */
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import RelatorioGestorPDF from '@/components/pdf/RelatorioGestor';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';
import RelatorioEngajamentoPDF from '@/components/pdf/RelatorioEngajamento';
import { renderRankingAdequacaoPDF } from '@/lib/adequacao-cargo/ranking-pdf';
import { buildViews } from '@/lib/engajamento/relatorio-model';
import { traduzirEngajamento } from '@/lib/engajamento/relatorio-traducao';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import { dataNoPdf } from '@/lib/pdf-i18n';
import type { MarcaPdf } from '@/lib/pdf-marca';
import { renderTemporadaConcluidaPDF } from '@/lib/temporada-concluida-pdf';
import { acmeOfflineData } from './acme-data';
import { schoolOfflineData } from './data';
import { offlineEnvironment, type OfflineTenant } from './environment';
import { rankingsDoPacote } from './ranking-snapshots';
import type { OfflineData } from './types';

export type DocumentoOffline = { tenant: OfflineTenant; arquivo: string; bytes: Buffer };

export const AMBIENTES_OFFLINE: OfflineTenant[] = ['acme-demo', 'escolas-acme'];

/** As duas demos são em português do Brasil: o papel sai nesse idioma, e o texto do elenco já é dele. */
const IDIOMA = 'pt-BR';

/**
 * O endereço publicado de cada pacote. O link do relatório de engajamento volta para a tela
 * do próprio pacote, que abre pelo mesmo endereço (`docs/AMBIENTE-DEMO.md`, "Apresentações sem internet").
 */
const ORIGEM_DO_PACOTE: Record<OfflineTenant, string> = {
  'acme-demo': 'https://usuario-demo.vertho.ai',
  'escolas-acme': 'https://professor-escolas.vertho.ai',
};

export function dadosDoAmbiente(tenant: OfflineTenant): OfflineData {
  return tenant === 'acme-demo' ? acmeOfflineData() : schoolOfflineData();
}

/** `documents/ranking-2.pdf` → `ranking-2.pdf`: o nome que a tela do pacote procura. */
const nomeDoArquivo = (caminho: string) => caminho.split('/').pop()!;

/**
 * Os arquivos que o pacote de um ambiente espera em `documents/<ambiente>/`: os três relatórios
 * fixos e os que a tela do pacote aponta no retrato salvo (`engagementPdfPath`, `details[].pdfPath`
 * e `rankings[].pdfPath`). Um PDF fora desta lista é PDF que ninguém gera; um da lista que falta é
 * botão que abre o vazio. `tests/unit/demo-offline-pdfs-guard.test.ts` confere a lista com o disco.
 */
export function nomesDosDocumentos(tenant: OfflineTenant): string[] {
  const painel = dadosDoAmbiente(tenant).panels;
  return [
    'pdi.pdf', 'gestor.pdf', 'rh.pdf',
    nomeDoArquivo(painel.engagementPdfPath || 'engajamento.pdf'),
    ...Object.values<any>(painel.details).filter((d) => d?.pdfPath).map((d) => nomeDoArquivo(d.pdfPath)),
    ...Object.values<any>(painel.rankings).map((r) => nomeDoArquivo(r.pdfPath)),
  ].sort();
}

async function renderizar(Componente: React.ComponentType<any>, props: Record<string, unknown>): Promise<Buffer> {
  return renderToBuffer(React.createElement(Componente, props) as any);
}

async function documentosDoAmbiente(tenant: OfflineTenant): Promise<DocumentoOffline[]> {
  const ambiente = offlineEnvironment(tenant);
  const dados = dadosDoAmbiente(tenant);
  const logoBase64 = getLogoCoverBase64();
  const marca: MarcaPdf = { logoBase64, mostrarVertho: true };
  const saida: DocumentoOffline[] = [];
  const adicionar = (arquivo: string, bytes: Buffer) => saida.push({ tenant, arquivo, bytes });

  // PDI, Gestor e RH: as mesmas props que `gerarPDFBuffer` (lib/relatorios/individual-core.ts) passa.
  const participante = dados.people.find((p) => p.key === ambiente.participantKey)!;
  adicionar('pdi.pdf', await renderizar(RelatorioIndividualPDF, {
    data: { conteudo: dados.pdi, colaborador_nome: ambiente.names.participant, colaborador_cargo: participante.role, gerado_em: dados.capturedAt },
    empresaNome: ambiente.name, logoBase64, locale: IDIOMA,
  }));
  adicionar('gestor.pdf', await renderizar(RelatorioGestorPDF, {
    data: { conteudo: dados.coordination, gestor_nome: ambiente.names.manager, gerado_em: dados.capturedAt },
    empresaNome: ambiente.name, logoBase64, locale: IDIOMA,
  }));
  adicionar('rh.pdf', await renderizar(RelatorioRHPDF, {
    data: { conteudo: dados.direction, gerado_em: dados.capturedAt },
    empresaNome: ambiente.name, logoBase64, locale: IDIOMA,
  }));

  // Engajamento: a visão do RH sobre o retrato salvo do painel (a rota online monta o mesmo `buildViews`).
  const painel = dados.panels;
  const evolucao = painel.evolution[''];
  if (!evolucao?.ok) throw new Error(`${tenant}: o retrato salvo não traz a evolução do engajamento`);
  const { t, locale } = await traduzirEngajamento(IDIOMA);
  const visoes = buildViews({ empresaNome: ambiente.name, rollup: painel.engagement.organization['[null,null]'], evolucao: evolucao.data, t, locale });
  if (!visoes) throw new Error(`${tenant}: sem dados para o relatório de engajamento`);
  const semana = evolucao.data.semanas.at(-1)?.semana || evolucao.data.semanaAtual || 0;
  adicionar(nomeDoArquivo(painel.engagementPdfPath || 'engajamento.pdf'), await renderizar(RelatorioEngajamentoPDF, {
    data: visoes.rh, empresaNome: ambiente.name, semana, inscritos: evolucao.data.inscritos,
    geradoEm: dataNoPdf(new Date(painel.capturedAt), locale),
    logoBase64, mostrarVertho: true, locale,
    detailUrl: `${ORIGEM_DO_PACOTE[tenant]}${ambiente.base}index.html#/organization/dashboard/gestor/engajamento`,
  }));

  // Evolução de cada pessoa cuja jornada concluída tem PDF no pacote (a rota `/api/temporada/concluida/pdf`).
  for (const detalhe of Object.values<any>(painel.details)) {
    if (!detalhe?.pdfPath) continue;
    adicionar(nomeDoArquivo(detalhe.pdfPath), await renderTemporadaConcluidaPDF(detalhe, marca));
  }

  // Ranking de Adequação: um por cargo, no nome que a tela do pacote guardou em `pdfPath`.
  const rankings = Object.values<any>(painel.rankings);
  const montados = await rankingsDoPacote(tenant, ambiente.name, rankings.map((r) => ({ cargo: r.cargo, dataISO: r.dataISO })));
  for (const ranking of rankings) {
    const montado = montados.find((m) => m.cargo === ranking.cargo);
    if (!montado) throw new Error(`${tenant}: sem ranking montado para ${ranking.cargo}`);
    adicionar(nomeDoArquivo(ranking.pdfPath), await renderRankingAdequacaoPDF(montado.input));
  }

  // O que sai tem de ser exatamente o que o pacote espera: gerar a mais ou a menos é defeito de gerador.
  const gerados = saida.map((d) => d.arquivo).sort();
  const esperados = nomesDosDocumentos(tenant);
  if (JSON.stringify(gerados) !== JSON.stringify(esperados)) {
    throw new Error(`${tenant}: gerou [${gerados.join(', ')}] e o pacote espera [${esperados.join(', ')}]`);
  }
  return saida;
}

/** Os 18 documentos, ambiente por ambiente. Quem grava em disco é o script. */
export async function gerarDocumentosOffline(ambientes: OfflineTenant[] = AMBIENTES_OFFLINE): Promise<DocumentoOffline[]> {
  const todos: DocumentoOffline[] = [];
  for (const tenant of ambientes) todos.push(...await documentosDoAmbiente(tenant));
  return todos;
}
