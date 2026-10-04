/**
 * Os cinco PDFs (PDI, Relatório do Gestor, Relatório RH, engajamento semanal e evolução)
 * renderizam nos QUATRO idiomas, e nenhum texto em português sobra no en-US (onda D, R-67 item 2).
 *
 * Dois níveis de prova, porque cada um pega o que o outro não pega:
 *  - ÁRVORE (rápida, sem rede): percorre os elementos React invocando os componentes-função
 *    (puros), junta todo texto e confere o idioma. É a prova de que o texto fixo saiu do código
 *    e do catálogo certo, e de que número, percentual e data usam o `Intl` do idioma;
 *  - RENDER DE VERDADE (`renderToBuffer`, baixa as fontes da CDN como `demo-rh-report-pdf.test.ts`
 *    já faz): o papel sai, o texto extraído do PDF traz os acentos de es-ES e pt-PT, e todo
 *    caractere do papel existe na fonte que o PDF embute (medido com `fontkit` no TTF da CDN, não
 *    suposto). Um glifo fora do subset sai em BRANCO sem erro: é o buraco que só o olho acha.
 *
 * O fixture é todo em inglês de propósito: o que a IA escreve não se traduz, então qualquer palavra
 * em português que apareça no en-US é texto FIXO que sobrou no código.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import RelatorioGestorPDF from '@/components/pdf/RelatorioGestor';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';
import RelatorioEngajamentoPDF from '@/components/pdf/RelatorioEngajamento';
import RelatorioEvolucaoPDF from '@/components/pdf/RelatorioEvolucao';
import { buildViews } from '@/lib/engajamento/relatorio-model';

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
type Loc = (typeof LOCALES)[number];

// ───────────── o que o papel imprime, lido da árvore ─────────────
function textoDaArvore(node: any, profundidade = 0): string[] {
  if (node == null || node === false || node === true) return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap((n) => textoDaArvore(n, profundidade));
  if (profundidade > 80) return [];
  const saida: string[] = [];
  if (typeof node.type === 'function') {
    saida.push(...textoDaArvore(node.type(node.props), profundidade + 1));
    return saida;
  }
  saida.push(...textoDaArvore(node.props?.children, profundidade + 1));
  return saida;
}
const imprime = (el: any): string => textoDaArvore(el).join('\n');

// ───────────── fixtures (todo o texto "de IA" e de dado em inglês) ─────────────
const competencias = [
  {
    nome: 'Communication', nivel_atual: 2, flag: false,
    descritores_desenvolvimento: ['Explains the decision and the next step'],
    fez_bem: ['Listens before answering'], melhorar: ['Share risks earlier'],
    feedback: 'Solid base, needs consistency.',
    sprint: {
      foco_30_dias: 'Make communication a visible habit.', acao_principal: 'Apply it once a week.',
      acao_apoio: 'Ask for short feedback.', evidencia_esperada: 'Four records.', ritual: 'Weekly review.',
      checklist: ['Pick a situation', 'Record the result'],
    },
    dicas_desenvolvimento: ['Start small.'], estudo_recomendado: ['Active listening'],
    checklist_tatico: ['Prepare', 'Act'],
  },
  { nome: 'Negotiation', nivel_atual: 1, flag: true, fez_bem: [], melhorar: [], sprint: { foco_30_dias: 'Prepare concessions.', acao_principal: 'Map the value.' } },
];
const conteudoPdi = {
  acolhimento: 'Welcome to your plan.',
  perfil_comportamental: { descricao: 'Detail oriented.', pontos_forca: ['Careful reading'], pontos_atencao: ['Slow to escalate'] },
  resumo_desempenho: competencias.map((c) => ({ competencia: c.nome, nivel: c.nivel_atual })),
  competencias,
  trilha_cursos: [{ nome: 'Applied listening', competencia: 'Communication' }],
  total_semanas: 7,
  mensagem_final: 'Practice, record, adjust.',
};
// Com o mapa do blueprint: exercita a linha do tempo "passo a passo" (semanas, foco agora, aprende, avalia).
const conteudoPdiComMapa = {
  ...conteudoPdi,
  trilha_mapa: {
    semanas: [
      { semana: 1, competencia_foco: ['Communication'], tipo: 'conteudo', conexao_com_pdi: ['o1'] },
      { semana: 2, competencia_foco: ['Communication'], tipo: 'missao', conexao_com_pdi: ['o1'] },
      { semana: 3, competencia_foco: ['Negotiation'], tipo: 'conteudo', conexao_com_pdi: ['o2'] },
      { semana: 4, competencia_foco: ['Communication', 'Negotiation'], tipo: 'avaliacao', conexao_com_pdi: [] },
    ],
  },
  blueprint_objetivos: { o1: { competencia: 'Communication', objetivo: 'Goal', acao_principal: 'Run one weekly check-in' }, o2: { competencia: 'Negotiation', objetivo: 'Goal', acao_principal: 'Map value first' } },
  blueprint_conteudos: { Communication: [{ tema: 'Active listening' }], Negotiation: [{ tema: 'Value mapping' }] },
};
const conteudoGestor = {
  resumo_executivo: { leitura_geral: 'The team executes well.', principal_avanco: 'Alice turns feedback into action.', principal_ponto_de_atencao: 'Decision records vary.' },
  destaques_evolucao: [{ nome: 'Zoe', competencia: 'Listening', nivel: 4, motivo_destaque: 'Strong example.' }, { nome: 'Alice', competencia: 'Listening', nivel: 3, motivo_destaque: 'Good.' }],
  ranking_atencao: [
    { nome: 'Carl', competencia: 'Listening', nivel: 1, urgencia: 'alta', motivo: 'Needs practice.', risco_se_nao_agir: 'Repeated gaps.' },
    { nome: 'Bob', competencia: 'Listening', nivel: 2, urgencia: 'media', motivo: 'Inconsistent.' },
    { nome: 'Abe', competencia: 'Listening', nivel: 2, urgencia: 'baixa', motivo: 'Fine.' },
  ],
  analise_por_competencia: [{ competencia: 'Listening', distribuicao: { n1: 1, n2: 3, n3: 2, n4: 0 }, padrao_observado: 'Oscillates under pressure.', acao_gestor: 'Practice weekly.', impacto_se_nao_agir: 'Learning stays conceptual.' }],
  perfil_disc_equipe: { descricao: 'Fast and structured.', forca_coletiva: 'Mobilizes quickly.', risco_coletivo: 'Acts before aligning.' },
  acoes: { acao_principal: 'Pick one behavior.', esta_semana: ['Share the focus.'], proximas_semanas: ['Review records.'], medio_prazo: ['Consolidate.'] },
  papel_do_gestor: { semanal: 'Ask one evidence question.', quinzenal: 'Calibrate progress.', proximo_ciclo: 'Choose the next focus.' },
  mensagem_final: 'The report organizes the conversation.',
};
const conteudoRh = {
  resumo_executivo: { leitura_geral: 'Good adoption.', principal_forca_organizacional: 'Leaders respond to goals.', principal_risco_organizacional: 'Depends on each manager.' },
  indicadores: { total_avaliados: 30, total_avaliacoes: 150, pct_nivel_1: 12.5, pct_nivel_2: 31, pct_nivel_3: 39, pct_nivel_4: 18 },
  comparativo_f1_f3: { analise: 'Structured weekly talks advanced faster.', destaque_positivo: 'Sales gained clarity.', destaque_atencao: 'Finance needs practice.' },
  visao_por_cargo: [{ cargo: 'Sales Rep', nivel_mais_frequente: 3, distribuicao: { n1: 7, n2: 17, n3: 19, n4: 7 }, leitura: 'Result oriented.', principais_forcas: ['Client relations'], principais_riscos: ['Early concessions'] }],
  competencia_foco_por_cargo: [{ cargo: 'Sales Rep', competencia_recomendada: 'Negotiation', horizonte_sugerido: '60 days', justificativa: 'Biggest lever.', expectativa_impacto: 'Better conversion.' }],
  competencias_criticas: [{ competencia: 'Negotiation', criticidade: 'ATENCAO', justificativa: 'Concessions come early.', impacto_organizacional: 'Margin pressure.' }],
  treinamentos_sugeridos: [
    { competencia: 'Negotiation', titulo: 'Value negotiation', prioridade: 'IMPORTANTE', publico: 'Sales', formato: 'Workshop', custo: 'Included', justificativa: 'Practice with feedback.' },
    { competencia: 'Planning', titulo: 'Visible priority', prioridade: 'URGENTE', publico: 'Operations', formato: 'Lab', custo: 'Included', justificativa: 'Shared criteria.' },
  ],
  perfil_disc_organizacional: { descricao: 'Results and process.', forca_coletiva: 'Mobilization.', risco_coletivo: 'Urgency without learning.' },
  decisoes_chave: [{ colaborador: 'Bruna', situacao: 'Reference, mentor to peers.', acao: 'Invite to share the method.', criterio_reavaliacao: 'Three peers apply it.', consequencia: 'Method stays tacit.' }],
  plano_acao: { curto_prazo: ['Align one focus per area.'], medio_prazo: ['Calibrate criteria.'], longo_prazo: ['Compare progress.'] },
  mensagem_final: 'Cadence over volume.',
};
const evolucaoEngajamento: any = {
  semanaAtual: 5, inscritos: 50, emRisco: 3, recuperados: 1,
  trajetorias: { critical: 1, attention: 2 },
  semanas: [
    { semana: 4, elegiveis: 40, ativados: 20, ativacaoPct: 50, consumiram: 10, consumoPct: 25, evidencias: 4, evidenciaPct: 10, usaramTutor: 2 },
    { semana: 5, elegiveis: 20, ativados: 5, ativacaoPct: 25, consumiram: 3, consumoPct: 15, evidencias: 1, evidenciaPct: 5, usaramTutor: 1 },
  ],
  pessoasEmRisco: [
    { colaboradorId: 'c1', nome: 'Dana', cargo: 'Analyst', area: 'Operations', semanaAtual: 5, indiceAtual: 0, delta: 0, trajetoria: 'critical', motivo: 'Sem atividade há duas semanas', motivoChave: 'sem_atividade_duas_semanas' },
    { colaboradorId: 'c2', nome: 'Eli', cargo: 'Cargo não informado', area: 'Sem área', semanaAtual: 5, indiceAtual: 30, delta: -10, trajetoria: 'attention', motivo: 'Queda de 10 pontos', motivoChave: 'queda', motivoValor: 10 },
  ],
  areas: [{ area: 'Operations', participantes: 30, emRisco: 2, tendencia: -10 }, { area: 'Sem área', participantes: 20, emRisco: 1, tendencia: null }],
  cargos: [
    { cargo: 'Analyst', participantes: 30, elegiveis: 20, ativados: 5, consumiram: 3, evidencias: 1, ativacaoPct: 25, consumoPct: 15, evidenciaPct: 5, emRisco: 2, criticos: 1, atencao: 1, riscoPct: 7 },
    { cargo: 'Cargo não informado', participantes: 20, elegiveis: 0, ativados: 0, consumiram: 0, evidencias: 0, ativacaoPct: 0, consumoPct: 0, evidenciaPct: 0, emRisco: 1, criticos: 0, atencao: 1, riscoPct: 5 },
  ],
  pendenciasSemana: [{ colaboradorId: 'c1', nome: 'Dana', cargo: 'Analyst', area: 'Operations', semanaAtual: 5, pendencia: 'ativacao' }],
};
const rollup: any = { resumo: { inscritos: 50, porFormato: [{ formato: 'video', principal: 10, engajou: 6 }] }, colaboradores: [] };

const agregado = (chave: string, competencia: string | null, pre: number, pos: number, n = 3) => ({
  chave, competencia, n, mediaPre: pre, mediaPos: pos, delta: pos - pre,
  nivelPre: Math.floor(pre), nivelPos: Math.min(4, Math.floor(pos)), confirmadas: 0, parciais: 0, estaveis: 0, semVeredito: 0,
});
const pessoa = (nome: string, competencia: string, pre: number, pos: number, cargo: string | null) => ({
  colaboradorId: nome, nome, cargo, area: null, competencia, n: 3, mediaPre: pre, mediaPos: pos,
  nivelPre: Math.floor(pre), nivelPos: Math.min(4, Math.floor(pos)), delta: pos - pre, veredito: null, vereditoRotulo: '',
  sustentacao: 'alta', insight: 'Great practice.', proximoPasso: 'Keep the weekly rhythm.', concluidoEm: '2026-09-30T12:00:00Z', descritores: [],
});
const pessoasEv = [pessoa('Ana', 'Communication', 2.1, 2.9, 'Sales Rep'), pessoa('Ben', 'Communication', 2.2, 3.7, 'Sales Rep'), pessoa('Cy', 'Communication', 2.0, 2.0, 'Cargo não informado')];
const evolucao: any = {
  cobertura: { participantes: 12, emJornada: 4, medidos: 8, percentual: 67 },
  resumo: { confirmadas: 0, parciais: 0, estaveis: 0, semVeredito: 0, deltaMedio: 0.85, descritoresMedidos: 24 },
  porCompetencia: [agregado('Communication', null, 2.1, 2.9)],
  porDescritor: ['A', 'B', 'C'].map((d) => agregado(d, 'Communication', 2.1, 2.9)),
  porCargo: [
    { cargo: 'Sales Rep', pessoasMedidas: 2, porCompetencia: [agregado('Communication', null, 2.1, 3.3, 2)], porDescritor: ['A', 'B', 'C'].map((d) => agregado(d, 'Communication', 2.1, 3.3, 2)), pessoas: pessoasEv.slice(0, 2), proximasAcoes: { precisamApoio: [], proximoCiclo: [agregado('Communication', null, 2.1, 3.3, 2)] } },
    { cargo: 'Cargo não informado', pessoasMedidas: 1, porCompetencia: [agregado('Communication', null, 2.0, 2.0, 1)], porDescritor: [agregado('A', 'Communication', 2, 2, 1)], pessoas: [pessoasEv[2]], proximasAcoes: { precisamApoio: [pessoasEv[2]], proximoCiclo: [] } },
  ],
  pessoas: pessoasEv,
  proximasAcoes: { precisamApoio: [pessoasEv[2]], proximoCiclo: [] },
  indisponivel: false,
};
const evolucaoVazia: any = { ...evolucao, pessoas: [], porCargo: [], cobertura: { participantes: 5, emJornada: 5, medidos: 0, percentual: 0 } };

// ───────────── os cinco documentos num idioma ─────────────
function documentos(locale: Loc) {
  const views = buildViews({ empresaNome: 'Acme', rollup, evolucao: evolucaoEngajamento, locale })!;
  return {
    individual: React.createElement(RelatorioIndividualPDF, { data: { conteudo: conteudoPdi, colaborador_nome: 'Alice Smith', colaborador_cargo: 'Analyst' }, empresaNome: 'Acme', locale }),
    individualComMapa: React.createElement(RelatorioIndividualPDF, { data: { conteudo: conteudoPdiComMapa, colaborador_nome: 'Alice Smith', colaborador_cargo: 'Analyst' }, empresaNome: 'Acme', locale }),
    gestor: React.createElement(RelatorioGestorPDF, { data: { conteudo: conteudoGestor, gestor_nome: 'Gina' }, empresaNome: 'Acme', locale }),
    rh: React.createElement(RelatorioRHPDF, { data: { conteudo: conteudoRh }, empresaNome: 'Acme', locale }),
    engajamentoRh: React.createElement(RelatorioEngajamentoPDF, { data: views.rh, empresaNome: 'Acme', semana: 5, inscritos: 50, geradoEm: '04/10/2026', detailUrl: 'https://app.vertho.ai/x?view=evolucao', locale }),
    engajamentoGestor: React.createElement(RelatorioEngajamentoPDF, { data: views.gestor, empresaNome: 'Acme', semana: 5, inscritos: 50, geradoEm: '04/10/2026', detailUrl: 'https://app.vertho.ai/x?view=evolucao', locale }),
    evolucao: React.createElement(RelatorioEvolucaoPDF, { data: evolucao, empresaNome: 'Acme', recorte: 'Class A', locale }),
    evolucaoVazia: React.createElement(RelatorioEvolucaoPDF, { data: evolucaoVazia, empresaNome: 'Acme', locale }),
  };
}
type Doc = keyof ReturnType<typeof documentos>;
const DOCS: Doc[] = ['individual', 'individualComMapa', 'gestor', 'rh', 'engajamentoRh', 'engajamentoGestor', 'evolucao', 'evolucaoVazia'];

// ───────────── detector de português no en-US ─────────────
const PERMITIDO_EM_INGLES = /Tira-D\u00favidas|Mentor IA|vertho\.ai|\bIA\b/g;
const ACENTO = /[\u00e3\u00f5\u00e7\u00e1\u00e9\u00ed\u00f3\u00fa\u00e2\u00ea\u00f4\u00e0\u00f1\u00bf\u00a1]/i;
const PALAVRA_PT = /\b(de|da|dos|das|para|com|sem|uma|pessoas?|semanas?|jornada|compet\u00eancia|n\u00edvel|equipe|relat\u00f3rio|plano|a\u00e7\u00e3o|evid\u00eancia|desafio|conte\u00fado|confidencial|cargo|avan\u00e7o|gestor|inscritos|elegiveis|eleg\u00edveis|ativaram|consumiram|semana)\b/i;
const LIXO = /undefined|NaN|\[object|\{[a-z]+\}/;

describe('árvore: os cinco PDFs renderizam nos quatro idiomas', () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      const textos = Object.fromEntries(DOCS.map((d) => [d, imprime(documentos(locale)[d])])) as Record<Doc, string>;

      it.each(DOCS)('%s: tem texto e nenhum "undefined", "NaN", "[object" nem argumento ICU solto', (doc) => {
        expect(textos[doc].length, doc).toBeGreaterThan(200);
        expect(textos[doc], doc).not.toMatch(LIXO);
      });

      it('sem travessão no texto FIXO do papel (o glifo de célula vazia é a única exceção)', () => {
        for (const doc of DOCS) {
          const linhas = textos[doc].split('\n').filter((l) => l.trim() !== '\u2014' && /[\u2013\u2014]/.test(l));
          expect(linhas, `${locale}:${doc}`).toEqual([]);
        }
      });
    });
  }

  it('cada idioma usa o vocabulário do produto (Jornada, Recorrido, Journey; Nível, Nivel, Level; Informe, Report)', () => {
    const t = (l: Loc, d: Doc) => imprime(documentos(l)[d]);
    expect(t('pt-BR', 'individualComMapa')).toMatch(/Jornada 1|Semanas 1 a 2|Nível 2/);
    expect(t('pt-PT', 'individualComMapa')).toMatch(/A sua jornada|Nível 2/);
    expect(t('es-ES', 'individualComMapa')).toMatch(/Recorrido/);
    expect(t('es-ES', 'individualComMapa')).toContain('Nivel 2');
    expect(t('en-US', 'individualComMapa')).toContain('Journey');
    expect(t('en-US', 'individualComMapa')).toContain('Level 2');
    expect(t('es-ES', 'rh')).toContain('Informe');
    expect(t('es-ES', 'rh')).toMatch(/Nivel 3 y Nivel 4: 57\s?%/);
    expect(t('en-US', 'rh')).toContain('Level 3 and Level 4: 57%');
    expect(t('pt-BR', 'rh')).toContain('Nível 3 e Nível 4: 57%');
    expect(t('pt-BR', 'rh')).toContain('Nível 1: 12,5%');
    expect(t('en-US', 'rh')).toContain('Level 1: 12.5%');
    expect(t('es-ES', 'rh')).toContain('Nivel 1: 12,5');
    expect(t('en-US', 'gestor')).toContain('HIGH PRIORITY');
    expect(t('es-ES', 'gestor')).toContain('PRIORIDAD ALTA');
    expect(t('pt-BR', 'gestor')).toContain('PRIORIDADE ALTA');
  });

  it('pt-BR continua escrevendo o que sempre escreveu (nenhuma troca de texto no idioma original)', () => {
    const gestor = imprime(documentos('pt-BR').gestor);
    expect(gestor).toContain('Pontos de Atenção');
    expect(gestor).toContain('Listening: nível mais frequente N2');
    expect(gestor).toContain('N1: 1 | N2: 3 | N3: 2 | N4: 0');
    expect(gestor).toContain('Ponto forte: Alice turns feedback into action.');
    expect(gestor).toContain('COMECE POR AQUI: Pick one behavior.');
    const evo = imprime(documentos('pt-BR').evolucao);
    expect(evo).toContain('N2 para N3');
    expect(evo).toContain('+0,8');
    expect(evo).toContain('Cargo não informado');
    const eng = imprime(documentos('pt-BR').engajamentoRh);
    expect(eng).toContain('Engajamento semanal · RH / Diretoria');
    expect(eng).toContain('Ativaram');
    expect(eng).toContain('Sem área');
  });

  it('en-US: NENHUM texto em português sobra, em nenhum dos cinco documentos', () => {
    const sobras: string[] = [];
    for (const doc of DOCS) {
      for (const linha of imprime(documentos('en-US')[doc]).split('\n')) {
        const limpa = linha.replace(PERMITIDO_EM_INGLES, '');
        if (ACENTO.test(limpa) || PALAVRA_PT.test(limpa)) sobras.push(`${doc}: ${linha.trim()}`);
      }
    }
    expect(sobras).toEqual([]);
  });

  it('es-ES e pt-PT: o texto fixo é do idioma (nada de português do Brasil no es-ES; "equipa" no pt-PT)', () => {
    const es = DOCS.map((d) => imprime(documentos('es-ES')[d])).join('\n').replace(PERMITIDO_EM_INGLES, '');
    // "semana" é igual nos dois idiomas, então fica fora da lista: só palavras que o espanhol não tem
    expect(es).not.toMatch(/\b(pessoas|equipe|relat\u00f3rio|jornada|compet\u00eancia|n\u00edvel|avan\u00e7o)\b/i);
    const ptPT = imprime(documentos('pt-PT').gestor);
    expect(ptPT).toContain('Equipa');
    expect(ptPT).toContain('Não precisa de fazer tudo à segunda-feira');
    expect(imprime(documentos('pt-PT').engajamentoRh)).toContain('Envolvimento semanal');
  });

  it('rótulos de "sem dado" (cargo e área vazios) saem no idioma de quem lê', () => {
    expect(imprime(documentos('en-US').evolucao)).toContain('Role not provided');
    expect(imprime(documentos('es-ES').evolucao)).toContain('Cargo no informado');
    expect(imprime(documentos('en-US').engajamentoRh)).toContain('No department');
    expect(imprime(documentos('es-ES').engajamentoRh)).toContain('Sin área');
  });

  it('o motivo do risco vem do código estável, no idioma de quem lê; sem código (dado antigo), o texto que veio', () => {
    const gest = (l: Loc) => imprime(documentos(l).engajamentoGestor);
    expect(gest('en-US')).toContain('No activity for two weeks');
    expect(gest('en-US')).toContain('Drop of 10 points');
    expect(gest('es-ES')).toContain('Sin actividad desde hace dos semanas');
    expect(gest('pt-BR')).toContain('Sem atividade há duas semanas');
    const semCodigo = JSON.parse(JSON.stringify(evolucaoEngajamento));
    semCodigo.pessoasEmRisco[0] = { ...semCodigo.pessoasEmRisco[0], motivoChave: undefined, motivo: 'Motivo gravado como texto' };
    const views = buildViews({ empresaNome: 'Acme', rollup, evolucao: semCodigo, locale: 'en-US' })!;
    expect(views.gestor.focusItems[0].reason).toBe('Motivo gravado como texto');
  });

  it('o número do avanço usa o separador do idioma: +1,2 em pt e es, +1.2 em en', () => {
    expect(imprime(documentos('pt-BR').evolucao)).toContain('avanço +1,2');
    expect(imprime(documentos('es-ES').evolucao)).toContain('avance +1,2');
    expect(imprime(documentos('en-US').evolucao)).toContain('progress +1.2');
  });
});

// ───────────── render de verdade + fonte de verdade ─────────────
const TTFS = [
  'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf',
  'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf',
  'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf',
];

describe('render de verdade: o papel sai, o texto extraído traz os acentos e a fonte tem todo glifo', () => {
  it('os URLs de fonte do teste são os que o PDF registra (o teste mede a fonte REAL, não uma cópia)', () => {
    const styles = readFileSync('components/pdf/styles.ts', 'utf8');
    for (const url of TTFS) expect(styles).toContain(url);
  });

  it('🔴 controle: a Inter latin NÃO tem a seta (U+2192), mas tem ¿ ¡ ñ ã ç (o teste sabe falhar)', async () => {
    const fontkit = await import('fontkit');
    const buf = Buffer.from(await (await fetch(TTFS[0])).arrayBuffer());
    const fonte: any = (fontkit as any).create(buf);
    expect(fonte.hasGlyphForCodePoint(0x2192)).toBe(false);
    for (const ch of ['\u00bf', '\u00a1', '\u00f1', '\u00e3', '\u00e7', '\u00e1', '\u00f5', '\u00b7']) {
      expect(fonte.hasGlyphForCodePoint(ch.codePointAt(0)!), ch).toBe(true);
    }
  }, 60_000);

  it('todo caractere que o papel imprime, nos quatro idiomas e nos oito documentos, existe nas fontes embutidas', async () => {
    const fontkit = await import('fontkit');
    const fontes: any[] = [];
    for (const url of TTFS) fontes.push((fontkit as any).create(Buffer.from(await (await fetch(url)).arrayBuffer())));
    const usados = new Map<string, string>();
    for (const l of LOCALES) {
      for (const d of DOCS) for (const ch of imprime(documentos(l)[d])) usados.set(ch, `${l}:${d}`);
      // o catálogo inteiro, também o texto que o fixture não exercita
      const cat = JSON.parse(readFileSync(`messages/${l}.json`, 'utf8')).Pdf;
      for (const ch of JSON.stringify(cat)) usados.set(ch, `${l}:catalogo`);
    }
    const faltando: string[] = [];
    for (const [ch, onde] of usados) {
      if (/[\s\u0000-\u001f"\\]/.test(ch)) continue;
      const cp = ch.codePointAt(0)!;
      fontes.forEach((f, i) => { if (!f.hasGlyphForCodePoint(cp)) faltando.push(`U+${cp.toString(16)} (${ch}) fora da fonte ${i} em ${onde}`); });
    }
    expect(faltando).toEqual([]);
  }, 120_000);

  const renderizar = async (locale: Loc, doc: Doc) => {
    const buffer = await renderToBuffer(documentos(locale)[doc] as any);
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return { buffer, text: Array.isArray(text) ? text.join('\n') : text };
  };

  it.each(['gestor', 'rh', 'individualComMapa', 'engajamentoRh', 'evolucao'] as Doc[])('es-ES: %s vira PDF válido, com os acentos do espanhol no texto extraído', async (doc) => {
    const { buffer, text } = await renderizar('es-ES', doc);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.byteLength).toBeGreaterThan(8_000);
    expect(text).toMatch(/[\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]/);
    expect(text).not.toMatch(/\bsemana\b.*\bpessoas\b/i);
  }, 180_000);

  it.each(['gestor', 'individualComMapa', 'evolucao'] as Doc[])('pt-PT e en-US: %s renderiza e o texto extraído é do idioma', async (doc) => {
    const pt = await renderizar('pt-PT', doc);
    expect(pt.text).toMatch(/[\u00e3\u00e7\u00e1\u00e9\u00f5]/);
    const en = await renderizar('en-US', doc);
    expect(en.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(en.text).not.toMatch(/[\u00e3\u00f5\u00e7]/);
  }, 180_000);
});
