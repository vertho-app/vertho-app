/**
 * R-67 (04/10/2026), item 2: as telas do gestor (home, Evolução da equipe e Engajamento do time) só
 * falavam português. Aqui as três são MONTADAS já carregadas, nos 4 idiomas, e o teste prova duas
 * coisas: o texto de cada idioma chega à tela, e em en-US e es-ES não sobra português.
 *
 * As telas são componentes de cliente e o `useEffect` que busca os dados não roda em
 * `renderToStaticMarkup`; por isso elas aceitam uma semente (`dadosIniciais`), que ninguém passa em
 * produção. Nome de pessoa, cargo, competência e função são DADO do banco: os fixtures os escrevem
 * em inglês neutro para o detector de português só achar texto fixo da tela.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => '/dashboard/gestor',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase-browser', () => ({ getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }));
vi.mock('@/app/dashboard/gestor/actions', () => ({ getGestorHomeData: vi.fn(), getEngajamentoDoTime: vi.fn(), getPerfilExternoPdfUrl: vi.fn() }));
vi.mock('@/app/dashboard/gestor/equipe-evolucao/actions', () => ({ listarEquipeEvolucao: vi.fn(), loadLideradoConcluida: vi.fn(), salvarCheckpointGestor: vi.fn() }));

import GestorHomePage from '@/app/dashboard/gestor/page';
import EquipeEvolucaoPage from '@/app/dashboard/gestor/equipe-evolucao/page';
import EngajamentoDoTimePage, { PessoaRow } from '@/app/dashboard/gestor/engajamento/team-engagement';
import { SignalJourney } from '@/components/engajamento/signal-journey';
import { EntregaDaEtapa, QualidadeEvidenciaResumo } from '@/components/engajamento/qualidade-evidencia';
import { Users } from 'lucide-react';

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
const MENSAGENS: Record<string, any> = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf8'))]),
);

const montar = (locale: string, filho: any): string =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale, messages: MENSAGENS[locale], timeZone: 'America/Sao_Paulo', children: filho,
  }));

/** Só o texto visível: sem tags nem atributos (as classes do Tailwind têm acento? não, mas têm números). */
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

/** Nome de produto: "Tira-Dúvidas" é igual em todos os idiomas (vocabulário canônico). */
const semNomeDeProduto = (s: string) => s.replace(/Tira-Dúvidas/g, '');

const LETRAS_DO_PORTUGUES = /[ãõç]/i;
const PALAVRAS_DO_PORTUGUES = /\b(não|nao|você|jornada|equipe|liderados?|colaboradores?|semana|semanas|pessoas?|entreg\w+|evidência|sinais?|etapa|jornada|sem|com|para|uma|dos|das|pelo|nenhum\w*|ainda|hoje|todos|todas|em andamento|concluíd\w+)\b/i;
const PALAVRAS_DO_PORTUGUES_NO_ESPANHOL = /\b(não|você|jornada|equipe|entregaram|evidência|nenhum\w*|ainda|em andamento|concluíd\w+|liderança)\b/i;

function achaPortuguesEmIngles(html: string): string[] {
  const t = semNomeDeProduto(texto(html));
  return [...(t.match(new RegExp(LETRAS_DO_PORTUGUES.source, 'gi')) || []), ...(t.match(new RegExp(PALAVRAS_DO_PORTUGUES.source, 'gi')) || []), ...(t.match(/[áàâéêíóôú]/gi) || [])];
}
function achaPortuguesEmEspanhol(html: string): string[] {
  const t = semNomeDeProduto(texto(html));
  return [...(t.match(new RegExp(LETRAS_DO_PORTUGUES.source, 'gi')) || []), ...(t.match(new RegExp(PALAVRAS_DO_PORTUGUES_NO_ESPANHOL.source, 'gi')) || [])];
}

function semPortugues(locale: string, html: string): void {
  if (locale === 'en-US') expect(achaPortuguesEmIngles(html), `en-US: português sobrando`).toEqual([]);
  if (locale === 'es-ES') expect(achaPortuguesEmEspanhol(html), `es-ES: português sobrando`).toEqual([]);
}

// ─── Home do gestor ──────────────────────────────────────────────────────────

const HOME = (scope: 'gestor' | 'rh') => ({
  ok: true,
  scope,
  kpis: {
    liderados: { total: 8, em_trilha: 6, sem_trilha: 2 },
    em_andamento: { count: 4, distribuicao_semanas: [{ semana: 2, pessoas: 3 }, { semana: 5, pessoas: 1 }] },
    checkpoints: { pendentes: 2, respondidos: 0 },
    atividade_semana: { ativos: 5, total: 8 },
  },
  alertas: [
    { tipo: 'checkpoint_atrasado', count: 1 },
    { tipo: 'sem_perfil', count: 2, fonte: null },
    { tipo: 'sem_mapeamento', count: 3 },
    { tipo: 'estagnado', count: 1 },
  ],
  checkpointsPendentes: [
    { trilhaId: 't1', colabId: 'c1', colab: 'Ana Souza', cargo: 'Teacher', competenciaFoco: 'Communication', semana: 3, diasPendente: 14, semanasAtraso: 2 },
  ],
  equipe: [
    { colabId: 'c1', colab: 'Ana Souza', cargo: 'Teacher', status: 'em_andamento', competenciaFoco: 'Communication', semana: 3, totalSemanas: 7, avanco: null, niveis: [], perfilDominante: 'D', fontePerfilExterno: null, turma: 'Class A', motivoSemTrilha: null, atrasada: true },
    { colabId: 'c2', colab: 'Bruno Lima', cargo: 'Teacher', status: 'concluida', competenciaFoco: 'Communication', semana: null, totalSemanas: null, avanco: 0.8, niveis: [{ competencia: 'Communication', nivelInicial: 2, nivelFinal: 3 }], perfilDominante: 'I', fontePerfilExterno: null, turma: null, motivoSemTrilha: null, atrasada: null },
    { colabId: 'c3', colab: 'Carla Dias', cargo: 'Teacher', status: 'sem_trilha', competenciaFoco: null, semana: null, totalSemanas: null, avanco: null, niveis: [], perfilDominante: null, fontePerfilExterno: null, turma: null, motivoSemTrilha: 'sem_mapeamento', atrasada: null },
  ],
  perfis: [{ colabId: 'c1', colab: 'Ana Souza', cargo: 'Teacher', fonte: 'disc', letraDom: 'D', d: 60, i: 40, s: 50, c: 50 }],
  empresaPerfilExternoFonte: null,
  reportDashboard: null,
});

describe('home do gestor, nos 4 idiomas', () => {
  const FRASES: Record<string, { titulo: string; alerta: string; acao: string }> = {
    'pt-BR': { titulo: 'Minha equipe', alerta: '1 checkpoint pendente há mais de 7 dias', acao: 'Ação esta semana' },
    'pt-PT': { titulo: 'A minha equipa', alerta: '1 checkpoint pendente há mais de 7 dias', acao: 'Ação desta semana' },
    'es-ES': { titulo: 'Mi equipo', alerta: '1 checkpoint pendiente desde hace más de 7 días', acao: 'Acción de esta semana' },
    'en-US': { titulo: 'My team', alerta: '1 checkpoint pending for more than 7 days', acao: 'Action this week' },
  };

  it.each(LOCALES)('%s: título, sinais de atenção com o plural do idioma e a ação da semana', (locale) => {
    const html = montar(locale, createElement(GestorHomePage, { dadosIniciais: HOME('gestor') as any }));
    const t = texto(html);
    expect(t).toContain(FRASES[locale].titulo);
    expect(t).toContain(FRASES[locale].alerta);
    expect(t).toContain(FRASES[locale].acao);
    semPortugues(locale, html);
  });

  it('o gestor lê "liderados" e o RH lê "colaboradores" nos sinais de atenção, em cada idioma', () => {
    const palavra: Record<string, [RegExp, RegExp]> = {
      'pt-BR': [/3 liderados sem mapeamento de competências/, /3 colaboradores sem mapeamento de competências/],
      'pt-PT': [/3 liderados sem mapeamento de competências/, /3 colaboradores sem mapeamento de competências/],
      'es-ES': [/3 liderados sin mapeo de competencias/, /3 colaboradores sin mapeo de competencias/],
      'en-US': [/3 direct reports without competency mapping/, /3 employees without competency mapping/],
    };
    for (const locale of LOCALES) {
      expect(texto(montar(locale, createElement(GestorHomePage, { dadosIniciais: HOME('gestor') as any }))), `${locale} gestor`).toMatch(palavra[locale][0]);
      expect(texto(montar(locale, createElement(GestorHomePage, { dadosIniciais: HOME('rh') as any }))), `${locale} rh`).toMatch(palavra[locale][1]);
    }
  });

  it('o alerta de fonte externa nomeia a fonte (OPQ32) no idioma da tela, com o verbo no plural certo', () => {
    const dados: any = HOME('gestor');
    dados.alertas = [{ tipo: 'sem_perfil', count: 2, fonte: 'OPQ32' }];
    expect(texto(montar('pt-BR', createElement(GestorHomePage, { dadosIniciais: dados })))).toContain('2 liderados ainda não têm OPQ32 carregado');
    expect(texto(montar('es-ES', createElement(GestorHomePage, { dadosIniciais: dados })))).toContain('2 liderados aún no tienen OPQ32 cargado');
    expect(texto(montar('en-US', createElement(GestorHomePage, { dadosIniciais: dados })))).toContain('2 direct reports do not have OPQ32 loaded yet');
    dados.alertas = [{ tipo: 'sem_perfil', count: 1, fonte: 'OPQ32' }];
    expect(texto(montar('pt-BR', createElement(GestorHomePage, { dadosIniciais: dados })))).toContain('1 liderado ainda não tem OPQ32 carregado');
  });

  it('o contador de "parados" tem o plural do idioma (e não "pendente" + "s" montado no código)', () => {
    const dados: any = HOME('gestor');
    expect(texto(montar('pt-BR', createElement(GestorHomePage, { dadosIniciais: dados })))).toContain('1 pendente');
    dados.checkpointsPendentes = [dados.checkpointsPendentes[0], { ...dados.checkpointsPendentes[0], trilhaId: 't2', colabId: 'c9' }];
    expect(texto(montar('pt-BR', createElement(GestorHomePage, { dadosIniciais: dados })))).toContain('2 pendentes');
    expect(texto(montar('es-ES', createElement(GestorHomePage, { dadosIniciais: dados })))).toContain('2 pendientes');
  });

  it('o avanço sai com o separador do idioma: vírgula em pt e es, ponto em en', () => {
    for (const [locale, esperado] of [['pt-BR', '+0,8'], ['pt-PT', '+0,8'], ['es-ES', '+0,8'], ['en-US', '+0.8']] as const) {
      expect(texto(montar(locale, createElement(GestorHomePage, { dadosIniciais: HOME('gestor') as any }))), locale).toContain(esperado);
    }
  });

  it('erro da action vira frase no idioma da tela, pelo código', () => {
    const erro: any = { ok: false, codigo: 'sem-permissao' };
    expect(texto(montar('pt-BR', createElement(GestorHomePage, { dadosIniciais: erro })))).toContain('Você não tem acesso a esta informação.');
    expect(texto(montar('es-ES', createElement(GestorHomePage, { dadosIniciais: erro })))).toContain('No tienes acceso a esta información.');
    expect(texto(montar('en-US', createElement(GestorHomePage, { dadosIniciais: erro })))).toContain('You do not have access to this information.');
  });
});

// ─── Evolução da equipe ──────────────────────────────────────────────────────

const EVOLUCAO = {
  escopo: 'gestor',
  resumo: { total: 6, encerradas: 3, emAndamento: 1, evolucaoConfirmada: 1, evolucaoParcial: 1, estagnacao: 1, semTrilha: 2 },
  rows: [
    { colaboradorId: 'c1', colabEmail: 'ana@x.test', colab: 'Ana Souza', cargo: 'Teacher', competencia: 'Communication', temporada: 1, statusTrilha: 'concluida', status: 'evolucao_confirmada', avancoMedio: 0.8, competencias: [{ competencia: 'Communication', nivelInicial: 2, nivelFinal: 3, subiuDeNivel: true }] },
    { colaboradorId: 'c2', colabEmail: 'bia@x.test', colab: 'Bia Lima', cargo: 'Teacher', competencia: 'Planning', temporada: 1, statusTrilha: 'concluida', status: 'evolucao_parcial', avancoMedio: 0.3, competencias: [] },
    { colaboradorId: 'c3', colabEmail: 'caio@x.test', colab: 'Caio Dias', cargo: 'Teacher', competencia: 'Planning', temporada: 1, statusTrilha: 'concluida', status: 'estagnacao', avancoMedio: 0, competencias: [] },
    { colaboradorId: 'c4', colabEmail: 'duda@x.test', colab: 'Duda Reis', cargo: 'Teacher', competencia: 'Planning', temporada: 2, statusTrilha: 'ativa', status: 'em_andamento', avancoMedio: null, competencias: [] },
    { colaboradorId: 'c5', colabEmail: 'edu@x.test', colab: 'Edu Cruz', cargo: 'Teacher', competencia: null, temporada: null, statusTrilha: null, status: 'sem_trilha', avancoMedio: null, competencias: [] },
  ],
};

const DETALHE = {
  colabEmail: 'ana@x.test',
  colab: { nome: 'Ana Souza', cargo: 'Teacher' },
  trilha: { competencia: 'Communication', numeroTemporada: 1 },
  evolutionReport: {
    insight_geral: 'General reading written by the AI.',
    proximo_passo: 'Next step written by the AI.',
    descritores: [
      { competencia: 'Communication', descritor: 'Active listening', nota_pre: 2.0, nota_pos: 2.8, convergencia: 'evolucao_confirmada', depois: 'After text.' },
    ],
  },
};

describe('Evolução da equipe, nos 4 idiomas', () => {
  const FRASES: Record<string, { titulo: string; vazio: string; confirmada: string; dica: string; subiu: string }> = {
    'pt-BR': { titulo: 'Evolução da equipe', vazio: 'Nenhuma jornada encerrada ainda', confirmada: 'Evolução confirmada', dica: 'Avanço de 0,5 ou mais entre o início e o fechamento.', subiu: 'Communication: Nível 2 → Nível 3' },
    'pt-PT': { titulo: 'Evolução da equipa', vazio: 'Nenhuma jornada terminou ainda', confirmada: 'Evolução confirmada', dica: 'Avanço de 0,5 ou mais entre o início e o fecho.', subiu: 'Communication: Nível 2 → Nível 3' },
    'es-ES': { titulo: 'Evolución del equipo', vazio: 'Aún no ha terminado ningún recorrido', confirmada: 'Evolución confirmada', dica: 'Avance de 0,5 o más entre el inicio y el cierre.', subiu: 'Communication: Nivel 2 → Nivel 3' },
    'en-US': { titulo: 'Team evolution', vazio: 'No journey has ended yet', confirmada: 'Growth confirmed', dica: 'Progress of 0.5 or more between the start and the close.', subiu: 'Communication: Level 2 → Level 3' },
  };

  it.each(LOCALES)('%s: título, cartões com a dica da régua, veredito e subida de nível', (locale) => {
    const html = montar(locale, createElement(EquipeEvolucaoPage, { dadosIniciais: EVOLUCAO }));
    const t = texto(html);
    expect(t).toContain(FRASES[locale].titulo);
    expect(t).toContain(FRASES[locale].confirmada);
    expect(t).toContain(FRASES[locale].dica);
    expect(t).toContain(FRASES[locale].subiu);
    semPortugues(locale, html);
  });

  it.each(LOCALES)('%s: sem jornada encerrada, a tela diz que a comparação ainda não existe', (locale) => {
    const dados = { escopo: 'gestor', rows: [], resumo: { total: 3, encerradas: 0, emAndamento: 2, evolucaoConfirmada: 0, evolucaoParcial: 0, estagnacao: 0, semTrilha: 1 } };
    const html = montar(locale, createElement(EquipeEvolucaoPage, { dadosIniciais: dados }));
    expect(texto(html)).toContain(FRASES[locale].vazio);
    semPortugues(locale, html);
  });

  it.each(LOCALES)('%s: o detalhe da pessoa (nível, avanço e veredito) fala o idioma da tela', (locale) => {
    const html = montar(locale, createElement(EquipeEvolucaoPage, { dadosIniciais: { ...EVOLUCAO, detalhe: DETALHE } }));
    const t = texto(html);
    const esperado: Record<string, string> = { 'pt-BR': 'Descritor a descritor', 'pt-PT': 'Descritor a descritor', 'es-ES': 'Descriptor a descriptor', 'en-US': 'Descriptor by descriptor' };
    expect(t).toContain(esperado[locale]);
    // o avanço do descritor (2,0 para 2,8) com o separador do idioma, e o veredito no idioma
    expect(t).toContain(locale === 'en-US' ? '+0.8' : '+0,8');
    expect(t).toContain(FRASES[locale].confirmada);
    // texto da IA e nome da competência passam como vieram (não se traduzem)
    expect(t).toContain('General reading written by the AI.');
    expect(t).toContain('Communication');
    // o detalhe do RH diz "colaborador", o do gestor diz "liderado"
    semPortugues(locale, html.replace('General reading written by the AI.', '').replace('Next step written by the AI.', ''));
  });

  it('o RH lê "colaboradores" no subtítulo e o gestor lê "liderados"', () => {
    expect(texto(montar('pt-BR', createElement(EquipeEvolucaoPage, { dadosIniciais: EVOLUCAO })))).toContain('dos liderados');
    expect(texto(montar('pt-BR', createElement(EquipeEvolucaoPage, { dadosIniciais: { ...EVOLUCAO, escopo: 'rh' } })))).toContain('dos colaboradores');
    expect(texto(montar('en-US', createElement(EquipeEvolucaoPage, { dadosIniciais: { ...EVOLUCAO, escopo: 'rh' } })))).toContain('of employees');
    expect(texto(montar('en-US', createElement(EquipeEvolucaoPage, { dadosIniciais: EVOLUCAO })))).toContain('of direct reports');
  });
});

// ─── Engajamento do time ─────────────────────────────────────────────────────

const PESSOA = (extra: any = {}) => ({
  colaboradorId: 'p1', nome: 'Ana Souza', cargo: 'Teacher', abriuLink: true, formatosAbertos: ['video', 'texto'], consumiu: false,
  enviouEvidencia: false, conversouTutor: false, jornadaAtrasada: false, jornadaConcluida: false,
  semanaAcessivel: 3, semanaAcessivelConcluida: false, semanaAberta: 3, semanaCalendario: 3, semanaDoSinal: 3,
  ...extra,
});

const ENGAJAMENTO = {
  ok: true,
  scope: 'gestor',
  semanas: [1, 2, 3],
  cargos: ['Teacher', 'Coordinator'],
  resumo: { inscritos: 4, abriramAlgumFormato: 3, consumiram: 2, enviaramEvidencia: 1, conversaramTutor: 1, qualidadeEvidencias: { alta: 1, media: 0, baixa: 0, semClassificacao: 0 } },
  colaboradores: [
    PESSOA(),
    PESSOA({ colaboradorId: 'p2', nome: 'Bia Lima', jornadaAtrasada: true, semanaAcessivel: 2, semanaAberta: 3 }),
    PESSOA({ colaboradorId: 'p3', nome: 'Caio Dias', enviouEvidencia: true, consumiu: true, qualidadeEvidencia: 'alta' }),
    PESSOA({ colaboradorId: 'p4', nome: 'Duda Reis', jornadaConcluida: true, totalSemanasJornada: 7, qualidadeUltimaReflexao: 'media', enviouEvidencia: true }),
  ],
};

describe('Engajamento do time, nos 4 idiomas', () => {
  const FRASES: Record<string, { titulo: string; funil: string; acompanhar: string; concluida: string; qualidade: string; legenda: string }> = {
    'pt-BR': { titulo: 'Engajamento do time', funil: 'Do primeiro acesso à entrega', acompanhar: 'Acompanhamento sugerido', concluida: 'Jornada concluída · 7 de 7 semanas', qualidade: 'Qualidade das reflexões', legenda: 'Entenda o que cada sinal significa' },
    'pt-PT': { titulo: 'Envolvimento da equipa', funil: 'Do primeiro acesso à entrega', acompanhar: 'Acompanhamento sugerido', concluida: 'Jornada concluída · 7 de 7 semanas', qualidade: 'Qualidade das reflexões', legenda: 'Perceba o que significa cada sinal' },
    'es-ES': { titulo: 'Compromiso del equipo', funil: 'Del primer acceso a la entrega', acompanhar: 'Seguimiento sugerido', concluida: 'Recorrido completado · 7 de 7 semanas', qualidade: 'Calidad de las reflexiones', legenda: 'Entiende qué significa cada señal' },
    'en-US': { titulo: 'Team engagement', funil: 'From first access to delivery', acompanhar: 'Suggested follow-up', concluida: 'Journey completed · 7 of 7 weeks', qualidade: 'Reflection quality', legenda: 'What each signal means' },
  };

  it.each(LOCALES)('%s: título, funil, acompanhamento, pessoa concluída, qualidade e legenda', (locale) => {
    const html = montar(locale, createElement(EngajamentoDoTimePage, { dadosIniciais: ENGAJAMENTO }));
    const t = texto(html);
    for (const chave of ['titulo', 'funil', 'acompanhar', 'concluida', 'qualidade', 'legenda'] as const) {
      expect(t, `${locale}: ${chave}`).toContain(FRASES[locale][chave]);
    }
    semPortugues(locale, html);
  });

  it.each(LOCALES)('%s: a linha de cada pessoa diz o estado e a etapa no idioma, e o formato aberto também', (locale) => {
    const atrasada = montar(locale, createElement(PessoaRow, { pessoa: PESSOA({ jornadaAtrasada: true }) }));
    const esperado: Record<string, string[]> = {
      'pt-BR': ['Etapa pendente', 'Semana 3 · etapa pendente', 'Vídeo', 'Texto'],
      'pt-PT': ['Etapa pendente', 'Semana 3 · etapa pendente', 'Vídeo', 'Texto'],
      'es-ES': ['Etapa pendiente', 'Semana 3 · etapa pendiente', 'Vídeo', 'Texto'],
      'en-US': ['Step pending', 'Week 3 · step pending', 'Video', 'Text'],
    };
    for (const frase of esperado[locale]) expect(texto(atrasada), `${locale}: ${frase}`).toContain(frase);
    semPortugues(locale, atrasada);
  });

  it('o mesmo texto por pessoa vale para o RH, que lê por coordenação, e pt-BR continua igual ao que era', () => {
    const rh: any = { ...ENGAJAMENTO, scope: 'rh', colaboradores: ENGAJAMENTO.colaboradores.map((p, i) => ({ ...p, coordenadorEmail: i < 2 ? 'coord@x.test' : null, coordenadorNome: i < 2 ? 'Coordinator One' : null })) };
    const pt = texto(montar('pt-BR', createElement(EngajamentoDoTimePage, { dadosIniciais: rh })));
    expect(pt).toContain('Visão da empresa');
    expect(pt).toContain('Por coordenação');
    expect(pt).toContain('Sem coordenador definido');
    expect(pt).toContain('Mostrando 4 de 4 pessoas em 2 coordenações.');
    const en = texto(montar('en-US', createElement(EngajamentoDoTimePage, { dadosIniciais: rh })));
    expect(en).toContain('Showing 4 of 4 people in 2 coordinations.');
    expect(en).toContain('No coordinator set');
  });

  it('o filtro por função diz o recorte e o plural de "pessoas" é do idioma', () => {
    const t = (locale: string) => texto(montar(locale, createElement(EngajamentoDoTimePage, { dadosIniciais: { ...ENGAJAMENTO, colaboradores: [PESSOA()], resumo: { ...ENGAJAMENTO.resumo, inscritos: 1 } } })));
    expect(t('pt-BR')).toContain('Mostrando 1 de 1 pessoa.');
    expect(t('en-US')).toContain('Showing 1 of 1 person.');
    expect(t('es-ES')).toContain('Mostrando 1 de 1 persona.');
  });
});

describe('peças compartilhadas do engajamento (gestor e painel do RH)', () => {
  const total = 10;
  const passos = [
    { label: 'Step A', value: 4, detail: 'detail', icon: Users, tone: 'cyan' as const },
  ];

  it.each(LOCALES)('%s: "de N" e o percentual saem no idioma; o rótulo padrão não diz mais "trilha"', (locale) => {
    const html = montar(locale, createElement(SignalJourney, { title: 'Title', description: 'Description', total, steps: passos }));
    const t = texto(html);
    const de = { 'pt-BR': 'de 10', 'pt-PT': 'de 10', 'es-ES': 'de 10', 'en-US': 'of 10' }[locale];
    expect(t).toContain(de);
    expect(t).toContain(locale === 'es-ES' ? '40 %' : '40%');
    const eyebrow = { 'pt-BR': 'Sinais da jornada', 'pt-PT': 'Sinais da jornada', 'es-ES': 'Señales del recorrido', 'en-US': 'Journey signals' }[locale];
    expect(t).toContain(eyebrow);
    expect(t).not.toMatch(/trilha de sinais/i);
  });

  it.each(LOCALES)('%s: a entrega da etapa e a qualidade das reflexões falam o idioma', (locale) => {
    const entregue = texto(montar(locale, createElement(EntregaDaEtapa, { pessoa: { enviouEvidencia: true, qualidadeEvidencia: 'alta', semanaDoSinal: 3 } })));
    const pendente = texto(montar(locale, createElement(EntregaDaEtapa, { pessoa: { enviouEvidencia: false, semanaDoSinal: 3 } })));
    const esperado: Record<string, [string, string, string]> = {
      'pt-BR': ['Evidência da semana 3 entregue · Alta', 'Evidência da semana 3 pendente', 'Qualidade das reflexões'],
      'pt-PT': ['Evidência da semana 3 entregue · Alta', 'Evidência da semana 3 pendente', 'Qualidade das reflexões'],
      'es-ES': ['Evidencia de la semana 3 entregada · Alta', 'Evidencia de la semana 3 pendiente', 'Calidad de las reflexiones'],
      'en-US': ['Evidence for week 3 delivered · High', 'Evidence for week 3 pending', 'Reflection quality'],
    };
    expect(entregue.replace(/\s+/g, ' ').replace(' · ', ' · ')).toContain(esperado[locale][0]);
    expect(pendente).toContain(esperado[locale][1]);
    const faixa = montar(locale, createElement(QualidadeEvidenciaResumo, { contagem: { alta: 2, media: 1, baixa: 0, semClassificacao: 1 } }));
    expect(texto(faixa)).toContain(esperado[locale][2]);
    semPortugues(locale, faixa);
  });
});
