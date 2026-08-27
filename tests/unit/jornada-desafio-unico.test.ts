import { describe, it, expect } from 'vitest';
import { manterUmDesafio, resolverDesafiosDaSemana } from '@/lib/season-engine/kit/entrega-semana';
import {
  PROGRAMA_REGULAR, PROGRAMA_ONBOARDING, PROGRAMA_REGULAR_DUO, PROGRAMA_PILOTO, PROGRAMA_JORNADA,
} from '@/lib/season-engine/programa-config';
import { derivarConfigCustom } from '@/lib/season-engine/programa-custom';
import type { ProgramaConfig } from '@/lib/season-engine/programa-config';

/**
 * Jornada (05/08/2026): a semana entrega DUAS pílulas e UMA tarefa.
 *
 * O que se protege aqui é o que some sem avisar: o desafio da segunda entrega
 * é apagado do objeto que a tela lê. Se a escolha da entrega "principal" for
 * ingênua (sempre a primeira), uma semana em que só a segunda pílula tem kit
 * publicado fica SEM tarefa nenhuma — e ninguém percebe, porque a tela
 * simplesmente não mostra o bloco.
 *
 * 27/08/2026 — a régua passou a ser UMA TAREFA POR COMPETÊNCIA. O flag foi
 * ligado no `regular_duo`, onde 92 das 324 semanas de conteúdo de ibipeba
 * trazem competências DISTINTAS: unificar por semana apagaria a tarefa de uma
 * competência inteira, e ela continua contando na régua de nível. Os casos de
 * competência abaixo falham se alguém voltar a unificar por semana.
 */

const comDesafio = (texto: string, competencia?: string): { competencia?: string; conteudo: Record<string, unknown> } => ({
  ...(competencia ? { competencia } : {}),
  conteudo: {
    desafio_texto: texto,
    acao_observavel: `observar: ${texto}`,
    criterio_de_execucao: `critério: ${texto}`,
    core_id: 'core-x',
    formatos_disponiveis: { texto: { id: 't1' } },
  },
});
const semDesafio = (competencia?: string): { competencia?: string; conteudo: Record<string, unknown> } => ({
  ...(competencia ? { competencia } : {}),
  conteudo: { core_id: 'core-y', formatos_disponiveis: { audio: { id: 'a1' } } },
});

describe('desafio único por semana', () => {
  it('mantém o da primeira entrega e limpa o da segunda', () => {
    const entregas = [comDesafio('fechar o combinado'), comDesafio('registrar por escrito')];
    manterUmDesafio(entregas);
    expect(entregas[0].conteudo.desafio_texto).toBe('fechar o combinado');
    expect(entregas[1].conteudo).not.toHaveProperty('desafio_texto');
    expect(entregas[1].conteudo).not.toHaveProperty('acao_observavel');
    expect(entregas[1].conteudo).not.toHaveProperty('criterio_de_execucao');
  });

  it('o CONTEÚDO da segunda pílula fica intacto — some a tarefa, não a pílula', () => {
    const entregas = [comDesafio('a'), comDesafio('b')];
    manterUmDesafio(entregas);
    expect(entregas[1].conteudo.core_id).toBe('core-x');
    expect(entregas[1].conteudo.formatos_disponiveis).toEqual({ texto: { id: 't1' } });
  });

  it('sem kit na primeira, a tarefa da semana vem da segunda (não fica vazia)', () => {
    const entregas = [semDesafio(), comDesafio('escalar quando faltar conferente')];
    manterUmDesafio(entregas);
    expect(entregas[1].conteudo.desafio_texto).toBe('escalar quando faltar conferente');
    expect(entregas[0].conteudo).not.toHaveProperty('desafio_texto');
  });

  it('nenhuma entrega com kit: não inventa nem quebra', () => {
    const entregas = [semDesafio(), semDesafio()];
    expect(() => manterUmDesafio(entregas)).not.toThrow();
    expect(entregas.every((e) => !e.conteudo.desafio_texto)).toBe(true);
  });

  it('semana de uma pílula só continua com a tarefa dela', () => {
    const entregas = [comDesafio('única')];
    manterUmDesafio(entregas);
    expect(entregas[0].conteudo.desafio_texto).toBe('única');
  });
});

describe('a unificação é por COMPETÊNCIA, não por semana', () => {
  it('🔴 duas competências distintas mantêm UMA tarefa CADA', () => {
    // O caso do `regular_duo`: apagar a segunda deixaria uma competência inteira
    // sem tarefa na semana — e ela conta na régua de nível igual à primeira.
    const entregas = [
      comDesafio('fechar o combinado', 'Gestão de Pessoas'),
      comDesafio('cruzar matrícula e frequência', 'Avaliação e monitoramento'),
    ];
    manterUmDesafio(entregas);
    expect(entregas[0].conteudo.desafio_texto).toBe('fechar o combinado');
    expect(entregas[1].conteudo.desafio_texto).toBe('cruzar matrícula e frequência');
  });

  it('mesma competência (grafia diferente) continua com UMA tarefa', () => {
    // `normalizarComp` é a régua de igualdade — sem ela, " gestão " e "Gestão"
    // virariam duas competências e a unificação não aconteceria.
    const entregas = [
      comDesafio('primeira', 'Planejamento e Organização'),
      comDesafio('segunda', '  planejamento e organização '),
    ];
    manterUmDesafio(entregas);
    expect(entregas[0].conteudo.desafio_texto).toBe('primeira');
    expect(entregas[1].conteudo).not.toHaveProperty('desafio_texto');
  });

  it('sem kit na primeira entrega da competência, a tarefa vem da segunda', () => {
    const entregas = [
      semDesafio('Planejamento e Organização'),
      comDesafio('escalar quando faltar conferente', 'Planejamento e Organização'),
      comDesafio('revisar o indicador', 'Avaliação e monitoramento'),
    ];
    manterUmDesafio(entregas);
    expect(entregas[1].conteudo.desafio_texto).toBe('escalar quando faltar conferente');
    expect(entregas[2].conteudo.desafio_texto).toBe('revisar o indicador');
  });
});

describe('resolverDesafiosDaSemana — a fonte única das três portas', () => {
  // `disc: null` faz a resolução do kit ser pulada por construção (o kit é
  // por DISC), então estes casos exercitam o fallback ao plano e a unificação
  // sem tocar no Supabase.
  const semanaPlan = (entregas: any[]) => ({ tipo: 'conteudo', conteudos_dia: entregas });

  it('com o flag LIGADO, duas pílulas da mesma competência devolvem UMA tarefa', async () => {
    const out = await resolverDesafiosDaSemana(null, semanaPlan([
      { competencia: 'Planejamento', descritor: 'd1', conteudo: { desafio_texto: 'tarefa 1' } },
      { competencia: 'Planejamento', descritor: 'd2', conteudo: { desafio_texto: 'tarefa 2' } },
    ]), { empresaId: 'e1', disc: null, desafioUnicoPorCompetencia: true });
    expect(out.map((d) => d.desafio_texto)).toEqual(['tarefa 1']);
  });

  it('com o flag DESLIGADO, devolve as duas — o comportamento dos modos antigos', async () => {
    const out = await resolverDesafiosDaSemana(null, semanaPlan([
      { competencia: 'Planejamento', descritor: 'd1', conteudo: { desafio_texto: 'tarefa 1' } },
      { competencia: 'Planejamento', descritor: 'd2', conteudo: { desafio_texto: 'tarefa 2' } },
    ]), { empresaId: 'e1', disc: null, desafioUnicoPorCompetencia: false });
    expect(out.map((d) => d.desafio_texto)).toEqual(['tarefa 1', 'tarefa 2']);
  });

  it('competências distintas devolvem uma tarefa cada mesmo com o flag ligado', async () => {
    const out = await resolverDesafiosDaSemana(null, semanaPlan([
      { competencia: 'Gestão', descritor: 'd1', conteudo: { desafio_texto: 'tarefa A' } },
      { competencia: 'Avaliação', descritor: 'd2', conteudo: { desafio_texto: 'tarefa B' } },
    ]), { empresaId: 'e1', disc: null, desafioUnicoPorCompetencia: true });
    expect(out.map((d) => d.competencia)).toEqual(['Gestão', 'Avaliação']);
  });

  it('semana no shape single (sem conteudos_dia) devolve a tarefa do plano', async () => {
    const out = await resolverDesafiosDaSemana(null, { tipo: 'conteudo', descritor: 'd1', conteudo: { desafio_texto: 'única' } }, {
      empresaId: 'e1', disc: null, competenciaFallback: 'Gestão', desafioUnicoPorCompetencia: true,
    });
    expect(out).toEqual([{ competencia: 'Gestão', descritor: 'd1', desafio_texto: 'única', acao_observavel: undefined, criterio_de_execucao: undefined }]);
  });

  it('entrega sem tarefa nenhuma some da lista (não vira string vazia)', async () => {
    const out = await resolverDesafiosDaSemana(null, semanaPlan([
      { competencia: 'Gestão', descritor: 'd1', conteudo: {} },
      { competencia: 'Avaliação', descritor: 'd2', conteudo: { desafio_texto: 'tarefa B' } },
    ]), { empresaId: 'e1', disc: null, desafioUnicoPorCompetencia: true });
    expect(out).toHaveLength(1);
    expect(out[0].desafio_texto).toBe('tarefa B');
  });
});

/**
 * 🔑 O flag existiu 22 dias LIGADO na jornada e obedecido por um consumidor só
 * (a tela). O que faltava não era a régua — era ela ser a mesma em todo lugar.
 * Este guard fecha a outra metade: modo que entrega mais de um conteúdo por
 * semana e NASCE sem o flag volta a cobrar duas tarefas numa conversa de 6
 * turnos, e o sintoma só aparece semanas depois, no transcript de alguém.
 *
 * O predicado espelha as duas portas de `build-season.ts` que produzem
 * `conteudos_dia`: `ehSemanaDeEntregaMultipla` (conteudosPorSemana > 1) e
 * `isRegularDuoContentWeek` (2 competências em paralelo).
 */
function entregaMaisDeUmConteudoPorSemana(c: ProgramaConfig): boolean {
  if ((c.conteudosPorSemana || 1) > 1) return true;
  return !c.semanaParaCompetenciaIdx && !!c.competenciasNaMissao && (c.numCompetencias || 1) >= 2;
}

describe('guard: quem entrega 2 conteúdos por semana declara 1 tarefa por competência', () => {
  const MODOS: [string, ProgramaConfig][] = [
    ['REGULAR', PROGRAMA_REGULAR],
    ['ONBOARDING', PROGRAMA_ONBOARDING],
    ['REGULAR_DUO', PROGRAMA_REGULAR_DUO],
    ['PILOTO', PROGRAMA_PILOTO],
    ['JORNADA', PROGRAMA_JORNADA],
  ];

  for (const [nome, cfg] of MODOS) {
    it(`${nome}: ${entregaMaisDeUmConteudoPorSemana(cfg) ? 'entrega 2 → exige o flag' : 'entrega 1 → o flag é indiferente'}`, () => {
      if (entregaMaisDeUmConteudoPorSemana(cfg)) {
        expect(cfg.desafioUnicoPorCompetencia).toBe(true);
      } else {
        // Sem entrega múltipla não há o que unificar — ligar ou não é inócuo.
        expect(['boolean', 'undefined']).toContain(typeof cfg.desafioUnicoPorCompetencia);
      }
    });
  }

  it('o modo Personalizado (derivado, não constante) também declara', () => {
    // `derivarConfigCustom` monta a config em runtime a partir de
    // `sys_config.programa_custom` — não é varrida pelo laço acima, e é onde
    // uma divergência passaria despercebida por mais tempo.
    for (const fechamento of [true, false]) {
      for (const numCompetencias of [1, 2]) {
        const cfg = derivarConfigCustom({ semanas: 2, numCompetencias, fechamento });
        expect(entregaMaisDeUmConteudoPorSemana(cfg)).toBe(true);
        expect(cfg.desafioUnicoPorCompetencia).toBe(true);
      }
    }
  });
});
