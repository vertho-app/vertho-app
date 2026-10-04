import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { textoDosNiveis } from '@/lib/gestor/niveis-da-equipe';
import { ordenarPorNome } from '@/lib/gestor/ordenar-por-nome';
import { nivelMaisFrequente } from '@/lib/nivel-frequente';
import { formatarValorAvanco } from '@/lib/season-engine/convergencia';
import { semComentarios } from '../helpers/fonte';

/**
 * O gestor vê NÍVEL e AVANÇO, nunca a diferença crua entre médias (R-18, R-111,
 * decisão 1 da revisão de 02/10/2026).
 *
 * R-18: a lista "Equipe em trilha" da home mostrava `delta`, a diferença entre a
 * `nota_media_pos` e a média das `nota_pre`. Ela saía negativa e em vermelho, em
 * todo formato, e no Piloto e no Personalizado o relatório não tem `nota_pre`:
 * a média inicial virava 0 e o gestor lia um avanço inventado ("+2,6").
 *
 * R-111: a "Evolução da equipe" abria em "Maior delta", na prática um ranking de
 * pessoas nomeadas, e a linha levava `mediaPre`, `mediaPos` e `delta` ao navegador.
 */

const COLABS = [
  { id: 'p1', nome_completo: 'Regular Avançou', cargo: 'Professor(a)', email: 'p1@x.com', perfil_dominante: 'D', perfil_externo_dados: null, gestor_email: null },
  { id: 'p2', nome_completo: 'Regular Oscilou', cargo: 'Professor(a)', email: 'p2@x.com', perfil_dominante: 'I', perfil_externo_dados: null, gestor_email: null },
  { id: 'p3', nome_completo: 'Piloto Baseline', cargo: 'Professor(a)', email: 'p3@x.com', perfil_dominante: 'S', perfil_externo_dados: null, gestor_email: null },
  { id: 'p4', nome_completo: 'Sem Fechamento', cargo: 'Professor(a)', email: 'p4@x.com', perfil_dominante: 'C', perfil_externo_dados: null, gestor_email: null },
  { id: 'p5', nome_completo: 'Em Andamento', cargo: 'Professor(a)', email: 'p5@x.com', perfil_dominante: 'D', perfil_externo_dados: null, gestor_email: null },
];

const concluida = (colaborador_id: string, evolution_report: any) => ({
  id: `t-${colaborador_id}`, colaborador_id, status: 'concluida', criado_em: '2026-09-01', numero_temporada: 1,
  competencia_foco: 'Comunicação', evolution_report, data_inicio: '2026-08-01',
});

const TRILHAS = [
  // Regular: dois comportamentos avançam (+1,1 e +0,4).
  concluida('p1', { descritores: [
    { competencia: 'Comunicação', descritor: 'Escuta', nota_pre: 1.5, nota_pos: 2.6 },
    { competencia: 'Comunicação', descritor: 'Clareza', nota_pre: 1.8, nota_pos: 2.2 },
  ] }),
  // Regular com queda: a tela não pode afirmar piora (avanço 0,0, nível não cai).
  concluida('p2', { descritores: [
    { competencia: 'Comunicação', descritor: 'Escuta', nota_pre: 2.9, nota_pos: 2.2 },
  ] }),
  // Piloto: só ponto de partida. `nota_media_pos` existe e `nota_pre` não: era o "+2,6".
  concluida('p3', { modo: 'piloto', nota_media_pos: 2.6, descritores: [
    { competencia: 'Comunicação', descritor: 'Escuta', baseline: 2.0 },
  ] }),
  // Personalizado sem fechamento: também só o ponto de partida.
  concluida('p4', { sem_fechamento: true, descritores: [
    { competencia: 'Comunicação', descritor: 'Escuta', baseline: 2.0 },
  ] }),
  // Em andamento: sem relatório.
  { id: 't-p5', colaborador_id: 'p5', status: 'ativa', criado_em: '2026-09-10', numero_temporada: 1, competencia_foco: 'Comunicação', data_inicio: '2026-09-10', evolution_report: null },
];

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { sys_config: {} } : null),
  lista: (tabela) => {
    if (tabela === 'colaboradores') return COLABS;
    if (tabela === 'trilhas') return TRILHAS;
    return [];
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => ({
    colaborador: { id: 'rh1', email: 'rh@x.com', empresa_id: 'emp-1' },
    role: 'rh',
    empresaId: 'emp-1',
    isPlatformAdmin: false,
  }),
  mesmoEmail: (a: unknown, b: unknown) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(),
  canViewColabJourney: vi.fn(),
  findColabByEmail: vi.fn(),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: async () => 'rh@x.com',
}));
vi.mock('@/actions/temporada-concluida', () => ({ loadTemporadaConcluida: vi.fn() }));

import { getGestorHomeData } from '@/app/dashboard/gestor/actions';
import { listarEquipeEvolucao } from '@/app/dashboard/gestor/equipe-evolucao/actions';

const porId = (equipe: any[]) => Object.fromEntries(equipe.map((e) => [e.colabId, e]));

describe('R-18: "Equipe em trilha" da home do gestor mostra nível e avanço com piso zero', () => {
  beforeEach(() => { sb.reset(); });

  it('regular: avanço médio dos comportamentos e nível de partida e de chegada', async () => {
    const r: any = await getGestorHomeData();
    const p1 = porId(r.equipe).p1;

    expect(p1.avanco).toBe(0.8); // média de +1,1 e +0,4, com uma casa
    expect(p1.niveis).toEqual([{ competencia: 'Comunicação', nivelInicial: 1, nivelFinal: 2 }]);
    expect(textoDosNiveis(p1.niveis)).toBe('N1 → N2');
    expect(formatarValorAvanco(p1.avanco)).toBe('+0.8');
  });

  it('🔴 queda não aparece: avanço 0,0 e o nível não cai', async () => {
    const r: any = await getGestorHomeData();
    const p2 = porId(r.equipe).p2;

    expect(p2.avanco).toBe(0);
    expect(p2.niveis).toEqual([{ competencia: 'Comunicação', nivelInicial: 2, nivelFinal: 2 }]);
    expect(formatarValorAvanco(p2.avanco)).toBe('0.0');
    expect(textoDosNiveis(p2.niveis)).toBe('N2');
  });

  it('🔴 piloto e Personalizado sem fechamento não têm avanço (não inventa sobre média inicial 0)', async () => {
    const r: any = await getGestorHomeData();
    const equipe = porId(r.equipe);

    for (const id of ['p3', 'p4']) {
      expect(equipe[id].avanco, id).toBeNull();
      expect(equipe[id].niveis, id).toEqual([]);
    }
  });

  it('quem não concluiu não tem avanço nem nível', async () => {
    const r: any = await getGestorHomeData();
    const p5 = porId(r.equipe).p5;

    expect(p5.avanco).toBeNull();
    expect(p5.niveis).toEqual([]);
  });

  it('a linha não carrega mais a diferença crua', async () => {
    const r: any = await getGestorHomeData();

    for (const e of r.equipe) expect(e).not.toHaveProperty('delta');
  });
});

describe('R-111: Evolução da equipe em ordem alfabética, sem nota no payload', () => {
  beforeEach(() => { sb.reset(); });

  it('as linhas saem em ordem alfabética, não pelo avanço', async () => {
    const r: any = await listarEquipeEvolucao();

    expect(r.ok).toBe(true);
    expect(r.rows.map((x: any) => x.colab)).toEqual([
      'Em Andamento', 'Piloto Baseline', 'Regular Avançou', 'Regular Oscilou', 'Sem Fechamento',
    ]);
  });

  it('a linha não leva mediaPre, mediaPos nem delta (nota decimal não vai ao navegador)', async () => {
    const r: any = await listarEquipeEvolucao();

    for (const linha of r.rows) {
      for (const proibido of ['mediaPre', 'mediaPos', 'delta']) expect(linha, proibido).not.toHaveProperty(proibido);
    }
  });

  it('o avanço que a linha leva tem piso zero', async () => {
    const r: any = await listarEquipeEvolucao();
    const por = Object.fromEntries(r.rows.map((x: any) => [x.colab, x]));

    expect(por['Regular Oscilou'].avancoMedio).toBe(0);
    expect(por['Regular Avançou'].avancoMedio).toBe(0.8);
  });
});

describe('a tela não oferece ordem por resultado (R-111)', () => {
  const TELA = semComentarios(readFileSync('app/dashboard/gestor/equipe-evolucao/page.tsx', 'utf8'));

  it('sem "Maior delta", "Menor delta" nem seletor de ordem', () => {
    expect(TELA).not.toMatch(/Maior delta|Menor delta|delta_desc|delta_asc|setOrdem/);
    expect(TELA).toContain('ordenarPorNome(list)');
  });
});

describe('ordenarPorNome', () => {
  it('ignora acento e caixa, mantém a ordem de quem empata e não muta a lista', () => {
    const lista = [
      { colab: 'bruno', k: 1 }, { colab: 'Ágata', k: 2 }, { colab: 'ANA', k: 3 }, { colab: 'Ana', k: 4 }, { colab: null, k: 5 },
    ];
    const copia = JSON.parse(JSON.stringify(lista));
    // "Ágata" vem antes de "Ana" (g antes de n, sem olhar o acento); ANA e Ana empatam.
    expect(ordenarPorNome(lista).map((x) => x.k)).toEqual([5, 2, 3, 4, 1]);
    expect(lista).toEqual(copia);
  });
});

describe('textoDosNiveis', () => {
  it('subiu mostra de e para; manteve mostra só o nível; DUO sai uma competência por vez', () => {
    expect(textoDosNiveis([
      { nivelInicial: 2, nivelFinal: 3 },
      { nivelInicial: 3, nivelFinal: 3 },
    ])).toBe('N2 → N3 · N3');
  });

  it('sem nível não escreve N1 por dado faltando', () => {
    expect(textoDosNiveis([{ nivelInicial: null, nivelFinal: null }])).toBe('');
    expect(textoDosNiveis(null)).toBe('');
    expect(textoDosNiveis([])).toBe('');
  });
});

describe('nivelMaisFrequente', () => {
  it('é o nível com mais gente, e o empate vai para o menor', () => {
    expect(nivelMaisFrequente([{ level: 1, peso: 1 }, { level: 2, peso: 5 }, { level: 3, peso: 2 }, { level: 4, peso: 0 }])).toBe(2);
    expect(nivelMaisFrequente([{ level: 4, peso: 3 }, { level: 3, peso: 3 }, { level: 2, peso: 1 }])).toBe(3);
    expect(nivelMaisFrequente([{ level: 3, peso: 3 }, { level: 2, peso: 3 }])).toBe(2);
  });

  it('ninguém em nível nenhum é null, e entrada inválida não vira N1', () => {
    expect(nivelMaisFrequente([{ level: 1, peso: 0 }, { level: 2, peso: 0 }])).toBeNull();
    expect(nivelMaisFrequente([])).toBeNull();
    expect(nivelMaisFrequente(null)).toBeNull();
    expect(nivelMaisFrequente([{ level: 7, peso: 9 }, { level: 2.5, peso: 9 }] as any)).toBeNull();
  });
});
