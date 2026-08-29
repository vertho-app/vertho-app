import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const OUT = (process.env.PDF_OUT || path.join(os.homedir(), 'Downloads', 'vertho-pdf-samples')); fs.mkdirSync(OUT, { recursive: true });
async function save(nome: string, bytes: Uint8Array | Buffer) { const p = path.join(OUT, nome + '.pdf'); fs.writeFileSync(p, Buffer.from(bytes)); console.log('OK', nome, (Buffer.from(bytes).length / 1024 | 0) + 'KB'); }
import { renderToBuffer } from '@react-pdf/renderer'; import React from 'react'; import { getLogoCoverBase64 } from '@/lib/pdf-assets';

import PropostaComercialPDF from '@/components/pdf/PropostaComercialPDF';
import type { ProposalDocumentVM } from '@/lib/sales/proposal-document';
import RadarPropostaPDF from '@/components/pdf/RadarPropostaPDF';
import type { PropostaPayload } from '@/lib/radar/proposta-pdf-data';

const logo = getLogoCoverBase64() || undefined;

// ─────────────────────────────────────────────────────────────────────────────
// 1) PROPOSTA COMERCIAL (portal do representante)
// ─────────────────────────────────────────────────────────────────────────────
const emitida = '2026-06-18T00:00:00.000Z';
const valida = new Date(emitida); valida.setDate(valida.getDate() + 30);

const propostaComercial: ProposalDocumentVM = {
  numero: 'PC-2026-0417',
  emitidaEm: emitida,
  validaAte: valida.toISOString(),
  expirada: false,
  cliente: { nome: 'Colégio Horizonte Azul', tipo: 'Escola Privada' },
  contexto:
    'O Colégio Horizonte Azul busca estruturar o desenvolvimento pedagógico de seus 84 professores com uma jornada individualizada, ' +
    'medindo evolução real de competências docentes ao longo do semestre e reduzindo a rotatividade da equipe.',
  produto: 'Vertho Mentor IA — Plano Institucional',
  escopoItens: [
    'Diagnóstico comportamental (DISC) de todos os 84 colaboradores',
    'Mapeamento de competências por cargo (docente, coordenação, gestão)',
    'Trilha de desenvolvimento personalizada por perfil e cargo',
    'Mentor IA disponível 24/7 via WhatsApp e web',
    'Conteúdo semanal com missões práticas aplicadas em sala',
    'Cenários situacionais por competência com avaliação por IA',
    'Evolution Report com delta de competências por participante',
    'Painel de acompanhamento para a coordenação pedagógica',
    'Plenária institucional de fechamento de temporada',
    'Suporte dedicado e onboarding assistido da equipe',
  ],
  investimento: {
    mensal: 6800,
    meses: 12,
    total: 81600,
    condicoesPagamento: 'Faturamento mensal via boleto, com vencimento no dia 10. Primeira parcela após o setup.',
    descontoPercent: 15,
  },
  naoIncluso: [
    'Customizações técnicas ou integrações não previstas neste escopo.',
    'Diagnóstico clínico, psicológico ou avaliação de saúde mental.',
    'Pesquisa de clima organizacional (o Pulso é leitura do ambiente de desenvolvimento, não eNPS).',
    'Avaliação de desempenho formal (nine-box, nota de avaliador, OKRs).',
    'Garantia de ROI financeiro específico (a Vertho mede evolução de competências).',
    'Consultoria presencial, salvo se contratada à parte.',
    'Recrutamento e seleção (ATS).',
  ],
  premissas: [
    'O cliente enviará a planilha de setup (cargos + colaboradores) e documentos institucionais até a data combinada.',
    'O ponto focal do cliente estará disponível para validações durante o setup.',
    'Os participantes terão acesso a smartphone ou computador com internet.',
    'O envio de links de acesso será por WhatsApp e/ou e-mail, conforme preferência do cliente.',
  ],
  cronograma: [
    { fase: 'Setup', descricao: 'Configuração do ambiente dedicado: cargos, colaboradores e identidade visual da instituição.' },
    { fase: 'Diagnóstico', descricao: 'Mapeamento comportamental (DISC) + mapeamento de competências por participante.' },
    { fase: 'Trilha', descricao: 'Desenvolvimento personalizado por cargo e perfil, com conteúdo semanal e missões práticas.' },
    { fase: 'Fechamento', descricao: 'Cenário situacional + Evolution Report com delta por competência + plenária institucional.' },
  ],
  proximosPassos: [
    'Aprovação desta proposta.',
    'Envio da planilha de setup preenchida + logo + documentos institucionais.',
    'A Vertho configura o ambiente em até 2 dias úteis após o recebimento completo.',
    'Disparo do diagnóstico na data combinada.',
  ],
  notasComerciais:
    'Desconto institucional de 15% aplicado por adesão de turma completa no primeiro semestre. ' +
    'Valores válidos para contratação até o vencimento desta proposta. Reajuste anual pelo IPCA.',
  representante: { nome: 'Mariana Costa Ribeiro', email: 'mariana.ribeiro@vertho.ai', telefone: '+55 11 98765-4321' },
  status: 'sent',
};

// ─────────────────────────────────────────────────────────────────────────────
// 2) RADAR PROPOSTA (diagnóstico educacional — escopo ESCOLA)
// ─────────────────────────────────────────────────────────────────────────────
const radarPayload: PropostaPayload = {
  scopeType: 'escola',
  scopeId: '31099999',
  scopeLabel: 'EM Professora Alzira Nunes',
  municipio: 'Serra do Cedro',
  uf: 'MG',
  geradoEm: '2026-07-01T00:00:00.000Z',
  conteudo: {
    resumo_executivo:
      'A EM Professora Alzira Nunes atende cerca de 620 estudantes na rede municipal de Serra do Cedro/MG. Os dados do Saeb 2023 (INEP) mostram ' +
      'concentração elevada de estudantes nos níveis 0–1 de Matemática no 9º ano (58,4%), acima da mediana das escolas similares (49,1%). ' +
      'O Ideb 2023 dos anos finais (4,1) ficou abaixo da meta oficial (4,6).\n\n' +
      'A infraestrutura é sólida na dimensão básica (score 82/100, Censo/INEP 2023), mas frágil em conectividade (41/100), o que limita o uso ' +
      'pedagógico de tecnologia. O cruzamento Infra×Saeb posiciona a escola como "faz mais com menos". A prioridade dos próximos 90 dias é ' +
      'recuperação de aprendizagem em Matemática e fortalecimento da avaliação formativa.',
    leitura_saeb:
      'No Saeb 2023 (INEP), Língua Portuguesa do 5º ano apresenta 34,2% dos estudantes nos níveis 0–1, próximo das escolas similares (32,8%). ' +
      'Em Matemática do 9º ano, porém, 58,4% estão nos níveis 0–1 — 9,3 pontos percentuais acima das similares. O contraste entre etapas sugere ' +
      'perda de aprendizagem ao longo do fundamental, concentrada no componente de Matemática dos anos finais.',
    contexto_municipal:
      'Serra do Cedro possui 14 escolas na rede municipal (Censo/INEP 2023). O ICA municipal de alfabetização (INEP 2023) atingiu 71,3% na rede ' +
      'municipal, abaixo da média estadual de MG (78,9%). A variabilidade entre escolas da rede é alta, o que indica desigualdade de resultados ' +
      'a ser endereçada por formação docente coordenada.',
    leitura_infra:
      'O Censo Escolar 2023 (INEP) aponta infraestrutura básica robusta (82/100) e dimensão pedagógica adequada (68/100), mas conectividade ' +
      'frágil (41/100): a internet existe, porém sem banda larga com uso pedagógico consolidado. No cruzamento Infra×Saeb, a escola aparece no ' +
      'quadrante "faz mais com menos".',
    leitura_recursos:
      'A escola recebeu R$ 38.400 em repasses PDDE (FNDE) em 2023, com saldo de R$ 6.200 em conta. Os recursos diretos, ainda que modestos, ' +
      'podem custear material estruturado de recomposição de aprendizagem em Matemática, alinhado ao diagnóstico Saeb.',
    pontos_criticos: [
      {
        gravidade: 'critico',
        titulo: 'Matemática 9º ano: 58,4% nos níveis 0–1',
        dado: '58,4% dos estudantes do 9º ano nos níveis 0–1 de Matemática (Saeb 2023/INEP), contra 49,1% das escolas similares.',
        impacto:
          'Mais da metade dos concluintes do fundamental deixa a etapa sem consolidar operações e resolução de problemas, comprometendo o ingresso no ensino médio.',
        fonte: 'INEP',
        competencia_vertho: 'Avaliação Formativa',
        como_resolve:
          'A trilha Vertho desenvolve avaliação formativa: o Mentor IA orienta o professor a mapear lacunas por descritor e a replanejar aulas com evidências, semana a semana.',
      },
      {
        gravidade: 'alto',
        titulo: 'Ideb dos anos finais abaixo da meta',
        dado: 'Ideb 2023 dos anos finais: 4,1 realizado vs 4,6 de meta oficial (Ideb/INEP) — abaixo da meta.',
        impacto:
          'A escola não atingiu a meta pactuada, sinalizando descompasso entre fluxo e aprendizagem que tende a se acumular nos próximos ciclos.',
        fonte: 'INEP',
        competencia_vertho: 'Planejamento Didático',
        como_resolve:
          'O Mentor IA apoia o planejamento didático por competência, conectando meta institucional a metas de sala e rotinas de acompanhamento por bimestre.',
      },
      {
        gravidade: 'moderado',
        titulo: 'Conectividade pedagógica frágil (41/100)',
        dado: 'Score de conectividade 41/100 no Censo Escolar 2023 (INEP), a dimensão mais baixa da escola.',
        impacto:
          'A baixa conectividade limita o uso de recursos digitais de recomposição e de formação continuada dos professores no ambiente escolar.',
        fonte: 'INEP',
        competencia_vertho: 'Uso de Tecnologia',
        como_resolve:
          'A Vertho funciona por WhatsApp e celular, exigindo pouca banda: viabiliza formação docente e trilhas mesmo com conectividade limitada na escola.',
      },
    ],
    pontos_atencao: [
      'Taxa de participação no Saeb 2023 de 84% — abaixo do ideal de 90% para leitura estável.',
      'Ausência de laboratório de ciências registrado no Censo 2023.',
      'Saldo PDDE de R$ 6.200 sem plano de aplicação declarado.',
      'Formação continuada docente sem trilha estruturada por competência.',
    ],
    perguntas_pedagogicas: [
      'Quais descritores de Matemática do 9º ano concentram os maiores erros nas avaliações internas?',
      'A coordenação tem rotina semanal de análise de evidências de aprendizagem por turma?',
      'Como a escola pode usar o saldo PDDE para material de recomposição em Matemática?',
    ],
    como_vertho_ajuda: [
      'Mapeamento de competências docentes com IA contextualizada por cargo.',
      'Trilhas individuais de desenvolvimento pedagógico, com missões práticas em sala.',
      'Relatórios de evolução para a coordenação e a secretaria acompanharem o progresso real.',
    ],
    proximos_passos: [
      'Esta semana: reunião de 30 min com a coordenação para validar o diagnóstico.',
      'Em 30 dias: piloto com o grupo de professores de Matemática dos anos finais.',
      'Em 90 dias: trilha completa da escola + primeiro Evolution Report por professor.',
    ],
  },
  escola: {
    codigo_inep: '31099999',
    nome: 'EM Professora Alzira Nunes',
    rede: 'Municipal',
    municipio: 'Serra do Cedro',
    municipio_ibge: '3100000',
    uf: 'MG',
    microrregiao: 'Vale do Cedro',
    zona: 'Urbana',
    inse_grupo: 3,
    etapas: ['5_EF', '9_EF'],
    ano_referencia: 2023,
  },
  saeb: [
    { ano: 2023, etapa: '5_EF', disciplina: 'LP', distribuicao: { '0': 12.4, '1': 21.8, '2': 33.1, '3': 20.2, '4': 9.1, '5': 3.4 }, similares: { '0': 11.2, '1': 21.6, '2': 34.0, '3': 21.0, '4': 8.7, '5': 3.5 }, presentes: 96, matriculados: 108, taxa_participacao: 88.9, media_proficiencia: 214.3, media_similares: 219.5 },
    { ano: 2023, etapa: '5_EF', disciplina: 'MAT', distribuicao: { '0': 15.1, '1': 24.9, '2': 30.2, '3': 18.4, '4': 8.0, '5': 3.4 }, similares: { '0': 13.4, '1': 23.1, '2': 31.8, '3': 19.2, '4': 8.9, '5': 3.6 }, presentes: 95, matriculados: 108, taxa_participacao: 88.0, media_proficiencia: 209.8, media_similares: 216.1 },
    { ano: 2023, etapa: '9_EF', disciplina: 'LP', distribuicao: { '0': 18.9, '1': 27.4, '2': 29.1, '3': 15.2, '4': 6.8, '5': 2.6 }, similares: { '0': 16.5, '1': 25.9, '2': 30.4, '3': 16.7, '4': 7.4, '5': 3.1 }, presentes: 84, matriculados: 100, taxa_participacao: 84.0, media_proficiencia: 241.6, media_similares: 249.0 },
    { ano: 2023, etapa: '9_EF', disciplina: 'MAT', distribuicao: { '0': 27.6, '1': 30.8, '2': 24.3, '3': 11.1, '4': 4.5, '5': 1.7 }, similares: { '0': 22.4, '1': 26.7, '2': 27.9, '3': 14.0, '4': 6.2, '5': 2.8 }, presentes: 84, matriculados: 100, taxa_participacao: 84.0, media_proficiencia: 246.2, media_similares: 258.9 },
    { ano: 2021, etapa: '9_EF', disciplina: 'MAT', distribuicao: { '0': 29.9, '1': 31.2, '2': 22.8, '3': 10.4, '4': 4.0, '5': 1.7 }, similares: { '0': 24.0, '1': 27.5, '2': 27.0, '3': 13.3, '4': 5.7, '5': 2.5 }, presentes: 80, matriculados: 98, taxa_participacao: 81.6, media_proficiencia: 242.1, media_similares: 255.4 },
  ],
  enemEscola: [],
  ideb: [
    { codigo_inep: '31099999', municipio_ibge: '3100000', uf: 'MG', rede: 'Municipal', ano: 2023, etapa: '5_EF', ideb: 5.4, meta: 5.2, indicador_rendimento: 0.96, nota_saeb: 5.1 },
    { codigo_inep: '31099999', municipio_ibge: '3100000', uf: 'MG', rede: 'Municipal', ano: 2023, etapa: '9_EF', ideb: 4.1, meta: 4.6, indicador_rendimento: 0.91, nota_saeb: 4.2 },
    { codigo_inep: '31099999', municipio_ibge: '3100000', uf: 'MG', rede: 'Municipal', ano: 2021, etapa: '5_EF', ideb: 5.1, meta: 4.9, indicador_rendimento: 0.95, nota_saeb: 4.8 },
    { codigo_inep: '31099999', municipio_ibge: '3100000', uf: 'MG', rede: 'Municipal', ano: 2021, etapa: '9_EF', ideb: 3.9, meta: 4.3, indicador_rendimento: 0.90, nota_saeb: 4.0 },
  ],
  censo: {
    codigo_inep: '31099999',
    ano: 2023,
    matriculas: 620,
    zona_localizacao: 'Urbana',
    latitude: -19.91,
    longitude: -43.94,
    endereco: 'Rua das Acácias, 320',
    bairro: 'Centro',
    indicadores: {},
    quantidades: {},
    score_basica: 82,
    score_pedagogica: 68,
    score_acessibilidade: 55,
    score_conectividade: 41,
  },
  saresp: [],
  pdde: [
    { codigo_inep: '31099999', ano: 2023, valor_recebido: 38400, saldo_atual: 6200, prestacao_contas_status: 'Aprovada' },
    { codigo_inep: '31099999', ano: 2022, valor_recebido: 35100, saldo_atual: 2800, prestacao_contas_status: 'Aprovada' },
    { codigo_inep: '31099999', ano: 2021, valor_recebido: 31900, saldo_atual: 1500, prestacao_contas_status: 'Aprovada' },
  ],
  infraSaeb: {
    codigo_inep: '31099999',
    score_basica: 82,
    score_pedagogica: 68,
    score_acessibilidade: 55,
    score_conectividade: 41,
    score_geral: 61.5,
    pct_n0_avg_simples: 45.8,
    n0_diff_mediana: 4.7,
    n0_ratio_mediana: 1.11,
    saeb_ano: 2023,
    quadrante: 'q3_faz_mais_com_menos',
  },
  paresInse: [
    { codigo_inep: '31088801', nome: 'EM Dom Bosco', rede: 'Municipal', is_target: false, saeb_lp: 258, saeb_mat: 262, saeb_geral: 260, ideb_principal: 4.7, rank_geral: 1, total_pares: 6 },
    { codigo_inep: '31088802', nome: 'EM Santa Terezinha', rede: 'Municipal', is_target: false, saeb_lp: 251, saeb_mat: 255, saeb_geral: 253, ideb_principal: 4.5, rank_geral: 2, total_pares: 6 },
    { codigo_inep: '31099999', nome: 'EM Professora Alzira Nunes', rede: 'Municipal', is_target: true, saeb_lp: 242, saeb_mat: 246, saeb_geral: 244, ideb_principal: 4.1, rank_geral: 3, total_pares: 6 },
    { codigo_inep: '31088803', nome: 'EM Vale Verde', rede: 'Municipal', is_target: false, saeb_lp: 239, saeb_mat: 241, saeb_geral: 240, ideb_principal: 4.0, rank_geral: 4, total_pares: 6 },
    { codigo_inep: '31088804', nome: 'EM Monteiro Lobato', rede: 'Municipal', is_target: false, saeb_lp: 234, saeb_mat: 236, saeb_geral: 235, ideb_principal: 3.8, rank_geral: 5, total_pares: 6 },
    { codigo_inep: '31088805', nome: 'EM Cecília Meireles', rede: 'Municipal', is_target: false, saeb_lp: 228, saeb_mat: 230, saeb_geral: 229, ideb_principal: 3.6, rank_geral: 6, total_pares: 6 },
  ],
  totalEscolas: 14,
};

async function main() {
  // @ts-ignore - JSX com renderToBuffer (mesmo padrão de app/api/radar/lead-pdf/route.ts)
  const buf1 = await renderToBuffer(React.createElement(PropostaComercialPDF, { doc: propostaComercial, logoBase64: logo }));
  await save('01-proposta-comercial', buf1);
  // @ts-ignore - JSX com renderToBuffer (mesmo padrão de app/api/radar/lead-pdf/route.ts)
  const buf2 = await renderToBuffer(React.createElement(RadarPropostaPDF, {
    payload: radarPayload,
    logoBase64: logo,
    destinatario: { nome: 'Fulano de Tal', organizacao: 'Prefeitura de Serra do Cedro', cargo: 'Secretário de Educação' },
  }));
  await save('02-radar-proposta', buf2);
}

main().catch((e) => { console.error(e); process.exit(1); });
