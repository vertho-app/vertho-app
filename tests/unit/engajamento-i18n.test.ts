/**
 * R-67 (04/10/2026), lote d-rh: as telas do RH nos quatro idiomas.
 *
 * O "workspace" do R-67 é o Engajamento (visão atual, evolução semanal e relatório
 * semanal), que o RH lê em `/dashboard/gestor/engajamento` e a Vertho em
 * `/admin/engajamento`. Os ~270 textos fixos estavam em português no código. Agora
 * moram em `EngagementWorkspace` e o que o servidor devolve chega como CÓDIGO
 * (`motivoCodigo`, `codigo` da falha) ou como dado cru (área e cargo de reserva).
 *
 * Aqui: (1) o catálogo (mesmos argumentos nos 4 idiomas, pt-BR igual às constantes
 * que o PDF ainda lê), (2) a fonte (nenhum texto em português visível nos arquivos
 * migrados), (3) cada bloco da tela RENDERIZADO nos 4 idiomas, com en-US sem
 * português, (4) os códigos e os rótulos de reserva. A home do RH, a central de
 * relatórios e o cabeçalho de página estão em `relatorios-rh-i18n.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import ptBR from '@/messages/pt-BR.json';
import esES from '@/messages/es-ES.json';
import enUS from '@/messages/en-US.json';
import {
  CATALOGOS, IDIOMAS, conferir, folhas, portuguesEmIngles, textosEmPortugues, valoresTexto, type Idioma,
} from '../helpers/i18n-render';

const h = vi.hoisted(() => ({ sb: null as any }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ from: (t: string) => h.sb.client.from(t), raw: h.sb.client }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => '/dashboard/relatorios',
}));
vi.mock('@/actions/engajamento', () => ({ getEvolucaoEngajamentoEmpresa: async () => ({ ok: false, error: 'x' }) }));

import { buildEngagementEvolutionDashboard } from '@/lib/engagement-evolution';
import { buildViews } from '@/lib/engajamento/relatorio-model';
import { BLOCKER_META, blockerMeta } from '@/lib/engajamento/prioridades';
import { dataDoMarcoDeAbertura, motivoDeRisco, rotuloArea, rotuloCargo } from '@/lib/engajamento/rotulos';
import { traduzirEngajamento } from '@/lib/engajamento/relatorio-traducao';
import { tEngajamento } from '../helpers/traducao-engajamento';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { carregarEvolucaoEngajamento } from '@/lib/engajamento/evolucao';
import EngagementPanel, {
  Coordenacoes, DistribuicaoJornada, FormatosResumo, PessoaCard, PilulasResumo,
} from '@/components/engajamento/engagement-panel';
import EngagementEvolutionPanel, { AreaHeatmap, RiskTable, TrajectoriesCard } from '@/components/engajamento/evolution-panel';
import EngagementReport, { CargoBreakdown, EngagementThread, FocusList, TrendChart } from '@/components/engajamento/engagement-report';
import ReportPriorities from '@/components/engajamento/report-priorities';
import WeeklyTrendChart from '@/components/engajamento/weekly-trend-chart';
import { EntregaDaEtapa, QualidadeEvidenciaResumo } from '@/components/engajamento/qualidade-evidencia';
import { SignalJourney } from '@/components/engajamento/signal-journey';


// ─── 1. O catálogo ────────────────────────────────────────────────────────────

describe('catálogo EngagementWorkspace nos 4 idiomas', () => {
  const base = folhas(ptBR.EngagementWorkspace);

  it('o mesmo conjunto de chaves e os mesmos argumentos ({week}, {count}, ...) em todos os idiomas', () => {
    // Tira o corpo dos ramos do plural ({pessoa}, {persona}...) antes de ler os argumentos.
    const argumentos = (texto: string) => [...new Set([...texto.replace(/(=0|one|other)\s*\{[^{}]*\}/g, '').matchAll(/\{(\w+)/g)].map((m) => m[1]))]
      .filter((a) => !['plural', 'number', 'percent'].includes(a)).sort();
    for (const idioma of IDIOMAS.filter((i) => i !== 'pt-BR')) {
      const outro = Object.fromEntries(folhas(CATALOGOS[idioma].EngagementWorkspace));
      expect(Object.keys(outro).sort(), idioma).toEqual(base.map(([c]) => c).sort());
      for (const [chave, texto] of base) {
        expect(argumentos(outro[chave]), `${idioma}: ${chave}`).toEqual(argumentos(texto));
      }
    }
  });

  it('en-US e es-ES não repetem o texto em português (fora números e siglas)', () => {
    for (const idioma of ['en-US', 'es-ES'] as const) {
      const outro = Object.fromEntries(folhas(CATALOGOS[idioma].EngagementWorkspace));
      // es-ES tem cognatos de uma ou duas palavras ("Consumo", "Semana {week}"); frase de 3 palavras ou mais igual ao pt-BR é texto não traduzido.
      const minimoDePalavras = idioma === 'en-US' ? 1 : 3;
      const iguais = base.filter(([c, t]) => outro[c] === t
        && t.replace(/\{[^}]*\}/g, ' ').trim().split(/\s+/).filter((p) => /[A-Za-zÀ-ÿ]{3,}/.test(p)).length >= minimoDePalavras)
        .map(([c]) => c);
      // "Audio", "Participante" e afins podem coincidir; a lista é curta e conferida.
      // Frases que são a mesma nos dois idiomas (conferidas uma a uma).
      const permitidos = new Set([
        'fallbacks.person', 'tutor.badge', 'trend.series.activation', 'evolution.metrics.activation',
        'filters.weekAria', 'evolution.heatmap.title', 'trend.viewValues',
      ]);
      expect(iguais.filter((c) => !permitidos.has(c)), `${idioma} igual ao pt-BR`).toEqual([]);
    }
    expect(enUS.EngagementWorkspace.badge.journeyDone).toBe('Journey completed');
    expect(esES.EngagementWorkspace.badge.journeyDone).toBe('Recorrido completado');
  });

  it('en-US não tem letra acentuada (só o nome Tira-Dúvidas) e es-ES abre a exclamação e a interrogação', () => {
    const textoEn = folhas(enUS.EngagementWorkspace).map(([, v]) => v).join(' ').replace(/Tira-Dúvidas/g, '');
    expect(textoEn).not.toMatch(/[áàâãéêíóôõúç]/i);
    for (const [chave, v] of folhas(esES.EngagementWorkspace)) {
      if (/!/.test(v)) expect(v, chave).toMatch(/¡/);
      if (/\?/.test(v)) expect(v, chave).toMatch(/¿/);
    }
  });

  it('vocabulário canônico: conteúdo e jornada, não "pílula" nem "trilha" nem "temporada"', () => {
    const proibidos: Record<Idioma, RegExp> = {
      'pt-BR': /pílula|trilha|temporada|tutor\b/i,
      'pt-PT': /pílula|trilha|temporada|tutor\b/i,
      'es-ES': /píldora|temporada|ruta\b/i,
      'en-US': /\bpills?\b|\bseasons?\b/i,
    };
    for (const idioma of IDIOMAS) {
      const achados = folhas(CATALOGOS[idioma].EngagementWorkspace).filter(([, v]) => proibidos[idioma].test(v)).map(([c]) => c);
      expect(achados, idioma).toEqual([]);
    }
  });

  it('pt-BR diz o mesmo que BLOCKER_META (a constante que o PDF e o gestor ainda leem) e blockerMeta traduz', () => {
    const t = tEngajamento('pt-BR');
    for (const key of ['ativacao', 'consumo', 'evidencia'] as const) {
      expect(blockerMeta(t, key), key).toEqual(BLOCKER_META[key]);
    }
    expect(blockerMeta(tEngajamento('en-US'), 'ativacao').action).toBe('Check delivery and access');
    expect(blockerMeta(tEngajamento('es-ES'), 'consumo').deadline).toBe('Próximo día hábil');
  });
});

// ─── 2. A fonte ───────────────────────────────────────────────────────────────


describe('a fonte das telas do RH não tem texto fixo em português', () => {
  const ARQUIVOS = [
    'components/engajamento/engagement-panel.tsx', 'components/engajamento/evolution-panel.tsx',
    'components/engajamento/engagement-report.tsx', 'components/engajamento/report-priorities.tsx',
    'components/engajamento/weekly-trend-chart.tsx', 'components/engajamento/qualidade-evidencia.tsx',
    'components/engajamento/signal-journey.tsx', 'lib/engajamento/relatorio-model.ts', 'lib/engajamento/rotulos.ts',
  ];
  it.each(ARQUIVOS)('%s', (arquivo) => {
    expect(textosEmPortugues(arquivo)).toEqual([]);
  });

  it('o detector enxerga o defeito (sanidade do guard)', () => {
    // O arquivo de prioridades guarda de propósito as constantes pt-BR do PDF: o detector TEM que achá-las.
    expect(textosEmPortugues('lib/engajamento/prioridades.ts').length).toBeGreaterThan(5);
  });

  it('a data não é mais "pt-BR" escrito no código das telas', () => {
    for (const arquivo of ['components/engajamento/engagement-report.tsx', 'components/engajamento/engagement-panel.tsx']) {
      const codigo = readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/\s.*$/gm, '');
      expect(codigo, arquivo).not.toMatch(/toLocale\w*String\('pt-BR'|DateTimeFormat\('pt-BR'/);
    }
  });
});

// ─── 3. Cada bloco renderizado nos 4 idiomas ──────────────────────────────────

const pessoa = (extra: Record<string, any> = {}) => ({
  colaboradorId: 'p1', nome: 'Ana Souza', cargo: null, semanaAcessivel: 3, semanaAberta: 3, semanaCalendario: 3,
  jornadaAtrasada: true, jornadaConcluida: false, semanaAcessivelConcluida: false,
  recebeuP1: true, abriuP1: false, formatosP1: ['video', 'texto'], recebeuP2: null, abriuP2: true, formatosP2: [],
  origemConsumo: 'video_iniciado', conversouTutor: true, enviouEvidencia: false, semanaDoSinal: 3, ...extra,
});


conferir('cartão da pessoa (PessoaCard)', () => createElement(PessoaCard, { pessoa: pessoa() }), {
  'pt-BR': ['Cargo não informado', 'Semana 3 · etapa pendente', 'Vídeo iniciado, não concluído', 'Apoiar a retomada do conteúdo', 'Acompanhar', 'C1', 'Tira-Dúvidas'],
  'pt-PT': ['Função não indicada', 'Semana 3 · etapa pendente', 'Apoiar a retoma do conteúdo'],
  'es-ES': ['Puesto no indicado', 'Semana 3 · etapa pendiente', 'Vídeo iniciado, no completado', 'Apoyar la reanudación del contenido', 'Seguimiento'],
  'en-US': ['Role not provided', 'Week 3 · stage pending', 'Video started, not completed', 'Support resuming the content', 'Follow up'],
});

conferir('cartão de quem concluiu a jornada', () => createElement(PessoaCard, {
  pessoa: pessoa({ jornadaConcluida: true, jornadaAtrasada: false, totalSemanasJornada: 7, enviouEvidencia: true, qualidadeUltimaReflexao: 'alta' }),
}), {
  'pt-BR': ['Jornada concluída · 7 de 7 semanas', 'última reflexão Alta'],
  'pt-PT': ['Jornada concluída · 7 de 7 semanas', 'última reflexão Alta'],
  'es-ES': ['Recorrido completado · 7 de 7 semanas', 'última reflexión Alta'],
  'en-US': ['Journey completed · 7 of 7 weeks', 'last reflection High'],
});

const COLABS = [
  pessoa({ colaboradorId: 'a', semanaAcessivel: 2, semanaAberta: 2 }),
  pessoa({ colaboradorId: 'b', semanaAcessivel: 3, semanaAberta: 3, jornadaAtrasada: false }),
  pessoa({ colaboradorId: 'c', semanaAcessivel: 3, semanaAberta: 3, jornadaAtrasada: false, jornadaConcluida: true }),
  pessoa({ colaboradorId: 'd', semanaAcessivel: null }),
];
conferir('mapa de posição na jornada (DistribuicaoJornada)', () => createElement(DistribuicaoJornada, {
  colaboradores: COLABS, semanas: [1, 2, 3], posicaoSelecionada: 3, onSelecionar: () => {},
}), {
  'pt-BR': ['Posição na jornada', 'Onde as pessoas estão agora', 'Turmas entre as semanas 2 e 3', '1 pessoa concluiu a jornada', 'Limpar semana', '1 sem posição disponível'],
  'pt-PT': ['Posição na jornada', 'Turmas entre as semanas 2 e 3', '1 pessoa concluiu a jornada'],
  'es-ES': ['Posición en el recorrido', 'Cohortes entre las semanas 2 y 3', '1 persona completó el recorrido', 'Quitar semana', '1 sin posición disponible'],
  'en-US': ['Position in the journey', 'Where people are now', 'Cohorts between weeks 2 and 3', '1 person completed the journey', 'Clear week', '1 with no position available'],
});

conferir('entrega dos conteúdos e preferência de formato', () => createElement('div', null,
  createElement(PilulasResumo, { itens: [{ pilula: 1, recebeu: 10, abriu: 7, abriuFormato: 5 }] }),
  createElement(FormatosResumo, { itens: [{ formato: 'video', principal: 10, engajou: 5, pctMedio: 40 }, { formato: 'case', principal: 0, engajou: 0, pctMedio: null }] }),
), {
  'pt-BR': ['Entrega dos conteúdos', 'Conteúdo 1', 'Recebeu', 'Engajamento no formato principal', 'Vídeo', 'Caso', 'Média assistida: 40%'],
  'pt-PT': ['Entrega dos conteúdos', 'Conteúdo 1', 'Envolvimento no formato principal', 'Média visualizada: 40%'],
  'es-ES': ['Entrega de los contenidos', 'Contenido 1', 'Recibió', 'Compromiso en el formato principal', 'Caso', 'Media visualizada: 40'],
  'en-US': ['Content delivery', 'Content 1', 'Received', 'Engagement in the main format', 'Video', 'Case', 'Average watched: 40%'],
});

conferir('lista por coordenação', () => createElement(Coordenacoes, { pessoas: [pessoa()], abrir: false }), {
  'pt-BR': ['Sem coordenação definida', '1 pessoa neste recorte', '1 para acompanhar', 'Etapa individual', 'Conteúdo 2'],
  'pt-PT': ['Sem coordenação definida', '1 pessoa neste recorte'],
  'es-ES': ['Sin coordinación definida', '1 persona en esta selección', '1 para seguimiento', 'Etapa individual', 'Contenido 2'],
  'en-US': ['No coordination defined', '1 person in this selection', '1 to follow up', 'Individual stage', 'Content 2'],
});

conferir('entrega da etapa e qualidade das reflexões (compartilhados com o gestor)', () => createElement('div', null,
  createElement(EntregaDaEtapa, { pessoa: { enviouEvidencia: true, semanaDoSinal: 4, qualidadeEvidencia: 'media' } }),
  createElement(EntregaDaEtapa, { pessoa: { enviouEvidencia: false, semanaDoSinal: 4 } }),
  createElement(EntregaDaEtapa, { pessoa: { enviouEvidencia: true, qualidadeEvidencia: null } }),
  createElement(QualidadeEvidenciaResumo, { contagem: { alta: 2, media: 1, baixa: 0, semClassificacao: 1 } }),
), {
  'pt-BR': ['Evidência da semana 4 entregue · Média', 'Evidência da semana 4 pendente', 'semana de aplicação, sem nível', 'Qualidade das reflexões', '4 pessoas entregaram', 'Sem classificação'],
  'pt-PT': ['Evidência da semana 4 entregue · Média', 'Qualidade das reflexões'],
  'es-ES': ['Evidencia de la semana 4 entregada · Media', 'Evidencia de la semana 4 pendiente', 'semana de aplicación, sin nivel', 'Calidad de las reflexiones', '4 personas entregaron', 'Sin clasificar'],
  'en-US': ['Week 4 evidence delivered · Medium', 'Week 4 evidence pending', 'application week, no level', 'Reflection quality', '4 people delivered', 'Not classified'],
});

conferir('fluxo de sinais (compartilhado com o gestor)', () => createElement(SignalJourney, {
  title: 'T', description: 'D', total: 10,
  steps: [{ label: 'A', value: 4, detail: 'x', icon: (() => null) as any, tone: 'cyan' }],
}), {
  'pt-BR': ['Fluxo de sinais', '4 de 10'],
  'pt-PT': ['Fluxo de sinais', '4 de 10'],
  'es-ES': ['Flujo de señales', '4 de 10'],
  'en-US': ['Signal flow', '4 of 10'],
});

const SEMANAS = [
  { semana: 1, ativacaoPct: 20, consumoPct: 10, evidenciaPct: 5 },
  { semana: 2, ativacaoPct: 50, consumoPct: 30, evidenciaPct: 12 },
] as any[];
conferir('gráfico semana a semana', () => createElement(WeeklyTrendChart, { weeks: SEMANAS, illustrative: false }), {
  'pt-BR': ['Movimento semana a semana', 'Semana 2 · selecione uma semana para comparar', 'S2', 'Ver valores por semana', '50%'],
  'pt-PT': ['Movimento semana a semana', 'Percentagens medidas por semana'],
  'es-ES': ['Movimiento semana a semana', 'Semana 2 · seleccione una semana para comparar', 'S2', 'Ver valores por semana'],
  'en-US': ['Week-by-week movement', 'Week 2 · select a week to compare', 'W2', 'View values by week', 'Percentages measured by week'],
});

const EVOLUCAO_RISCO = {
  pessoasEmRisco: [
    { colaboradorId: 'r1', nome: 'Rita', cargo: '', area: 'Sem área', semanaAtual: 3, indiceAtual: 20, delta: -30, trajetoria: 'attention', motivo: 'Queda de 30 pontos', motivoCodigo: 'queda_de_pontos', motivoPontos: 30 },
    { colaboradorId: 'r2', nome: 'Caio', cargo: 'Analyst', area: 'Operations', semanaAtual: 3, indiceAtual: 0, delta: 0, trajetoria: 'critical', motivo: 'Sem atividade há duas semanas', motivoCodigo: 'sem_atividade_duas_semanas' },
  ],
} as any;
conferir('evolução: ritmo recente, mapa por área e pessoas para acompanhar', () => createElement('div', null,
  createElement(TrajectoriesCard, { trajectories: { accelerating: 1, on_track: 2, attention: 1, critical: 1 }, recovered: 1 }),
  createElement(AreaHeatmap, { areas: [{ area: 'Sem área', participantes: 1, emRisco: 1, tendencia: -10, semanas: [{ semana: 1, indice: 40, elegiveis: 1 }, { semana: 2, indice: null, elegiveis: 0 }] }] as any, weeks: [1, 2] }),
  createElement(RiskTable, { data: EVOLUCAO_RISCO, empresaId: 'e1', surface: 'rh' }),
), {
  'pt-BR': ['Trajetórias atuais', '1 recuperado', 'Ritmo por área', 'Sem área', 'Cargo não informado', 'Queda de 30 pontos', 'Sem atividade há duas semanas', 'Pessoas para acompanhar'],
  'pt-PT': ['Trajetórias atuais', 'Função não indicada', 'Queda de 30 pontos'],
  'es-ES': ['Trayectorias actuales', '1 recuperado', 'Ritmo por área', 'Sin área', 'Puesto no indicado', 'Caída de 30 puntos', 'Sin actividad desde hace dos semanas', 'Personas con seguimiento'],
  'en-US': ['Current trajectories', '1 recovered', 'Pace by area', 'No area', 'Role not provided', 'Dropped 30 points', 'No activity for two weeks', 'People to follow up'],
});

// ─── O relatório semanal: o modelo traduzido e cada bloco que o desenha ───────

const base = { events: [], videos: [], progress: [], tutorUses: [], completedStatus: 'completed' };
const matricula = (id: string, week = 2, area = 'Operations') => ({ colaboradorId: id, nome: `Person ${id}`, cargo: 'Analyst', area, semanaAtual: week });
function relatorioEm(idioma: Idioma) {
  const evolucao = buildEngagementEvolutionDashboard({
    ...base,
    enrollments: [matricula('a'), matricula('b'), matricula('c', 2, ''), matricula('d', 1)],
    events: [{ colaboradorId: 'b', semana: 2, tipo: 'formato' }],
  } as any);
  return buildViews({
    t: tEngajamento(idioma), locale: idioma, empresaNome: 'Acme',
    rollup: { resumo: { inscritos: 4, porFormato: [{ formato: 'video', principal: 10, engajou: 6 }] }, colaboradores: [] }, evolucao,
  })!;
}

describe('o relatório semanal no idioma de quem lê', () => {
  it.each(IDIOMAS)('%s: o modelo fala o idioma do tradutor, para o gestor e para o RH', (idioma) => {
    const v = relatorioEm(idioma);
    const esperado: Record<Idioma, { rh: string; plano: string }> = {
      'pt-BR': { rh: 'Leitura de RH / Diretoria', plano: 'Alinhar o plano com os gestores das áreas' },
      'pt-PT': { rh: 'Leitura de RH / Direção', plano: 'Alinhar o plano com os gestores das áreas' },
      'es-ES': { rh: 'Lectura de RR. HH. / Dirección', plano: 'Alinear el plan con los gestores de las áreas' },
      'en-US': { rh: 'HR / Executive reading', plano: 'Align the plan with the area managers' },
    };
    expect(v.rh.eyebrow).toBe(esperado[idioma].rh);
    expect(v.rh.actionPlan[1].title).toBe(esperado[idioma].plano);
    expect(v.gestor.actionPlan[1].title).not.toBe(v.rh.actionPlan[1].title);
    expect(v.rh.trend.at(-1)!.label).toBe(idioma === 'en-US' ? 'W2' : 'S2');
  });

  it('en-US: nada do que o modelo devolve (tela e PDF) está em português', () => {
    const v = relatorioEm('en-US');
    expect(portuguesEmIngles(valoresTexto([v.gestor, v.rh]).join(' | '))).toEqual([]);
    // o rótulo de reserva da área sem nome sai traduzido, não "Sem área"
    expect(JSON.stringify(v.rh)).not.toContain('Sem área');
  });

  it('o motivo da pessoa vem do código, não do texto em português que o servidor ainda manda', () => {
    const v = relatorioEm('en-US');
    const nova = v.gestor.focusItems.find((item) => item.name === 'Person d');
    expect(nova?.reason).toBe('No activity in the first week');
  });

  conferir('blocos do relatório (decisão, etapas, trajetória, cargo, prioridades)', (idioma) => {
    const v = relatorioEm(idioma);
    return createElement('div', null,
      createElement(EngagementThread, { data: v.rh }),
      createElement(TrendChart, { points: v.rh.trend }),
      createElement(FocusList, { data: v.gestor, empresaId: 'e1', surface: 'rh' }),
      createElement(CargoBreakdown, { data: v.rh, semana: 2 }),
      createElement(ReportPriorities, { data: v.gestor, empresaId: 'e1', surface: 'rh' }),
    );
  }, {
    'pt-BR': ['Etapas da jornada', 'Onde o movimento perde força', 'Maior perda', 'Decisão por cargo', 'Ação sugerida:', 'Prioridades e próximas ações', 'Copiar plano sugerido', 'Responsável sugerido'],
    'pt-PT': ['Etapas da jornada', 'Decisão por função', 'Prioridades e próximas ações'],
    'es-ES': ['Etapas del recorrido', 'Dónde el movimiento pierde fuerza', 'Mayor pérdida', 'Decisión por puesto', 'Acción sugerida:', 'Prioridades y próximas acciones', 'Copiar plan sugerido', 'Responsable sugerido'],
    'en-US': ['Journey stages', 'Where momentum fades', 'Biggest loss', 'Decision by role', 'Suggested action:', 'Priorities and next actions', 'Copy suggested plan', 'Suggested owner'],
  });
});

describe('as telas inteiras (cabeçalho, abas e filtros) nos 4 idiomas', () => {
  const noop = async () => ({} as any);
  const painel = () => createElement(EngagementPanel, { empresaId: null, empresaNome: '', surface: 'rh', loadRollup: noop, loadEvolution: noop as any });
  conferir('visão atual', painel, {
    'pt-BR': ['Engajamento da jornada', 'Selecione uma empresa no filtro do topo', 'Visão atual', 'Evolução semanal', 'Escolha uma empresa para começar'],
    'pt-PT': ['Envolvimento da jornada', 'Visão atual', 'Evolução semanal'],
    'es-ES': ['Compromiso del recorrido', 'Seleccione una empresa en el filtro superior', 'Vista actual', 'Evolución semanal'],
    'en-US': ['Journey engagement', 'Select a company in the filter at the top', 'Current view', 'Weekly evolution', 'Choose a company to start'],
  });
  conferir('aba de evolução', () => createElement(EngagementEvolutionPanel, { empresaId: 'e1', active: false, loadEvolution: noop as any, surface: 'rh' }), {
    'pt-BR': ['Compare o ritmo ao longo das semanas', 'Todas as áreas', 'Atualizar'],
    'pt-PT': ['Compare o ritmo ao longo das semanas', 'Todas as áreas'],
    'es-ES': ['Compare el ritmo a lo largo de las semanas', 'Todas las áreas', 'Actualizar'],
    'en-US': ['Compare the pace across the weeks', 'All areas', 'Refresh'],
  });
  conferir('relatório semanal (sem empresa)', () => createElement(EngagementReport, { empresaId: null, empresaNome: '', surface: 'admin', loadRollup: noop, loadEvolution: noop as any }), {
    'pt-BR': ['Voltar ao engajamento', 'Relatório semanal', 'RH / Diretoria', 'Abrir PDF para impressão'],
    'pt-PT': ['Voltar ao envolvimento', 'RH / Direção'],
    'es-ES': ['Volver al compromiso', 'Informe semanal', 'RR. HH. / Dirección', 'Abrir PDF para imprimir'],
    'en-US': ['Back to engagement', 'Weekly report', 'HR / Executive', 'Open PDF to print'],
  });
});

// ─── 4. Códigos e rótulos de reserva ──────────────────────────────────────────

describe('o que o servidor devolve chega como código e vira rótulo na ponta', () => {
  it('cada motivo de risco tem código e a tela o traduz; sem código cai no texto que veio', () => {
    const dashboard = buildEngagementEvolutionDashboard({
      ...base,
      enrollments: [matricula('queda', 3), matricula('nova', 1), matricula('parado', 3)],
      events: [{ colaboradorId: 'queda', semana: 1, tipo: 'abertura' }],
      progress: [
        { colaboradorId: 'queda', semana: 1, tipo: 'conteudo', status: 'completed', conteudoConsumido: true },
        { colaboradorId: 'queda', semana: 3, tipo: 'conteudo', status: 'pending', conteudoConsumido: false },
      ],
    } as any);
    const porId = Object.fromEntries(dashboard.pessoasEmRisco.map((p) => [p.colaboradorId, p]));
    expect(porId.nova.motivoCodigo).toBe('sem_atividade_primeira_semana');
    expect(porId.nova.motivo).toBe('Sem atividade na primeira semana');
    expect(porId.parado.motivoCodigo).toBe('sem_atividade_duas_semanas');
    expect(motivoDeRisco(tEngajamento('en-US'), porId.nova)).toBe('No activity in the first week');
    expect(motivoDeRisco(tEngajamento('es-ES'), porId.parado)).toBe('Sin actividad desde hace dos semanas');
    expect(motivoDeRisco(tEngajamento('pt-BR'), { motivo: 'texto antigo' })).toBe('texto antigo');
  });

  it('queda de pontos leva o número', () => {
    const t = tEngajamento('en-US');
    expect(motivoDeRisco(t, { motivoCodigo: 'queda_de_pontos', motivoPontos: 70 })).toBe('Dropped 70 points');
    expect(motivoDeRisco(tEngajamento('pt-BR'), { motivoCodigo: 'queda_de_pontos', motivoPontos: 70 })).toBe('Queda de 70 pontos');
  });

  it('cargo e área de reserva viram o rótulo do idioma; o valor real passa direto', () => {
    for (const [idioma, cargo, area] of [['pt-BR', 'Cargo não informado', 'Sem área'], ['pt-PT', 'Função não indicada', 'Sem área'], ['es-ES', 'Puesto no indicado', 'Sin área'], ['en-US', 'Role not provided', 'No area']] as const) {
      const t = tEngajamento(idioma);
      expect(rotuloCargo(t, null), idioma).toBe(cargo);
      expect(rotuloCargo(t, 'Cargo não informado'), idioma).toBe(cargo);
      expect(rotuloArea(t, 'Sem área'), idioma).toBe(area);
      expect(rotuloArea(t, ''), idioma).toBe(area);
    }
    expect(rotuloCargo(tEngajamento('en-US'), 'Analyst')).toBe('Analyst');
    expect(rotuloArea(tEngajamento('en-US'), 'Operations')).toBe('Operations');
  });

  it('a falha da leitura de evolução tem código estável, e o texto em português saiu do retorno', async () => {
    h.sb = criarSupabaseMock({ resolver: () => ({ slug: 'acme', is_demo: false }) });
    const semEmpresa = await carregarEvolucaoEngajamento('');
    expect(semEmpresa).toMatchObject({ ok: false, codigo: 'empresa_ausente' });
    expect((semEmpresa as any).error).not.toMatch(/ /);
    h.sb.falharEm({ tabela: 'fase4_envios', op: 'select', mensagem: 'timeout no pool' });
    const falhou = await carregarEvolucaoEngajamento('e1');
    expect(falhou).toMatchObject({ ok: false, codigo: 'leitura_falhou' });
    // a causa técnica segue disponível para o log e para o PDF, mas a tela só lê o código
    expect((falhou as any).error).toBe('timeout no pool');
    h.sb = criarSupabaseMock({ resolver: () => ({ slug: 'acme', is_demo: false }) });
    const ok = await carregarEvolucaoEngajamento('e1');
    expect(ok.ok).toBe(true);
  });

  it('a data do marco de abertura sai no formato do idioma', () => {
    expect(dataDoMarcoDeAbertura('pt-BR')).toBe('15 de julho');
    expect(dataDoMarcoDeAbertura('pt-PT')).toBe('15 de julho');
    expect(dataDoMarcoDeAbertura('es-ES')).toBe('15 de julio');
    expect(dataDoMarcoDeAbertura('en-US')).toBe('July 15');
  });

  it('o tradutor do PDF carrega o catálogo do idioma pedido (e cai em pt-BR no idioma desconhecido)', async () => {
    const { t, locale } = await traduzirEngajamento('en-US');
    expect(locale).toBe('en-US');
    expect(t('model.eyebrow.gestor')).toBe('Manager reading');
    expect((await traduzirEngajamento('xx')).locale).toBe('pt-BR');
    expect((await traduzirEngajamento('es-ES')).t('model.eyebrow.gestor')).toBe('Lectura del gestor');
  });
});
