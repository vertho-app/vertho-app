/**
 * O contexto da semana vem da TRILHA — e o BETO volta a ter contexto.
 *
 * POR QUE ESTE ARQUIVO EXISTE (medido 27/08/2026)
 * ──────────────────────────────────────────────
 * `app/actions/beto.ts` e `actions/tutor-evidencia.ts` liam
 * `fase4_envios.competencia_id`, coluna que NUNCA existiu (o baseline não a tem;
 * a migration 149 cria `competencia_id` em `modulos_base_conteudo`, outra
 * tabela). O PostgREST recusa a query INTEIRA com 400 quando uma coluna do
 * select não existe, então:
 *
 *   · no BETO, `envio` vinha null e a função caía no `if (!envio) return` três
 *     linhas depois — pílula, competência em foco, conhecimento do descritor e
 *     Módulo-Base nunca chegaram ao prompt, em 100% das chamadas;
 *   · no tutor, `envio?.competencia_id` engolia igual e `competenciaNome` ficava
 *     vazio em toda avaliação de evidência.
 *
 * 🔑 NÃO se criou a coluna. Dos 9 arquivos que escrevem em `fase4_envios`,
 * NENHUM grava `competencia_id` — criá-la daria uma coluna permanentemente
 * nula. A fonte real já existe (a trilha) e cobre 75 de 75 envios ativos.
 *
 * Medições que sustentam a régua, todas do banco de produção em 27/08:
 *   · 75 envios ativos; 75 com trilha, `competencia_foco` e `temporada_plano`;
 *   · `sequencia` preenchida em **0** dos 75 — o caminho antigo da pílula nunca
 *     teria dado nada, mesmo com a query funcionando;
 *   · casando o descritor CRU: 66/75. Com `descritorParaHumano`: **75/75, zero
 *     ambíguos** — os 9 que faltavam trazem o código da matriz colado
 *     (`COO03_D3 — Limites profissionais`);
 *   · o bloco `conteudo` do plano tem `core_titulo`/`core_url`/
 *     `por_que_cabe_na_semana` e **zero** `titulo`/`resumo`/`url`.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock } from '../helpers/supabase-mock';

let sb: ReturnType<typeof criarSupabaseMock>;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { resolverContextoSemanal } from '@/lib/fase4/contexto-semanal';

const PLANO = [
  { semana: 1, tipo: 'conteudo', competencia: 'GERENCIAMENTO DE CONFLITOS', descritor: 'Postura diante do conflito',
    conteudo: { core_titulo: 'Quando o conflito aparece', core_url: 'https://x/1', por_que_cabe_na_semana: 'abre a competência' } },
  { semana: 2, tipo: 'conteudo', competencia: 'GERENCIAMENTO DE CONFLITOS',
    // com o código da matriz colado — o formato que derrubava 9 dos 75
    descritor: 'COO03_D3 — Limites profissionais',
    conteudo: { core_titulo: 'Até onde vai o meu papel', core_url: null, por_que_cabe_na_semana: null } },
];

function mock(opts: { semanaAtual?: number; comEnvio?: boolean; comTrilha?: boolean; competenciaId?: string | null } = {}) {
  const { semanaAtual = 1, comEnvio = true, comTrilha = true, competenciaId = 'comp-1' } = opts;
  return criarSupabaseMock({
    resolver: (tabela: string) => {
      if (tabela === 'fase4_envios') return comEnvio ? { semana_atual: semanaAtual, status: 'ativo' } : null;
      if (tabela === 'trilhas') return comTrilha ? { temporada_plano: PLANO, competencia_foco: 'GERENCIAMENTO DE CONFLITOS' } : null;
      if (tabela === 'competencias') return competenciaId ? { id: competenciaId } : null;
      return null;
    },
  });
}

const ARGS = { colaboradorId: 'c1', empresaId: 'e1', cargo: 'Diretor(a) Escolar' };

describe('resolverContextoSemanal', () => {
  it('resolve competência e descritor pela trilha, não por fase4_envios', async () => {
    sb = mock({ semanaAtual: 1 });
    const r = await resolverContextoSemanal(sb.client as any, ARGS);
    expect(r?.competencia).toBe('GERENCIAMENTO DE CONFLITOS');
    expect(r?.descritor).toBe('Postura diante do conflito');
    expect(r?.semana).toBe(1);
  });

  it('🔑 limpa o código da matriz do descritor — é o que fecha os 9 de 75', async () => {
    sb = mock({ semanaAtual: 2 });
    const r = await resolverContextoSemanal(sb.client as any, ARGS);
    // Cru seria "COO03_D3 — Limites profissionais", que não casa `nome_curto`.
    expect(r?.descritor).toBe('Limites profissionais');
  });

  it('NUNCA consulta a coluna fantasma', async () => {
    sb = mock();
    await resolverContextoSemanal(sb.client as any, ARGS);
    const selects = sb.chamadas
      .filter((c) => c.tabela === 'fase4_envios' && c.metodo === 'select')
      .map((c) => String(c.args[0]));
    expect(selects.length).toBeGreaterThan(0);
    for (const cols of selects) expect(cols).not.toContain('competencia_id');
  });

  it('escopa a competência por empresa E cargo — a matriz é por cargo', async () => {
    sb = mock();
    await resolverContextoSemanal(sb.client as any, ARGS);
    const eqs = sb.chamadas
      .filter((c) => c.tabela === 'competencias' && c.metodo === 'eq')
      .map((c) => c.args[0]);
    expect(eqs).toContain('empresa_id');
    expect(eqs).toContain('cargo');
    expect(eqs).toContain('nome_curto');
  });

  it('a pílula sai no formato que os prompts leem, não no cru do plano', async () => {
    sb = mock({ semanaAtual: 1 });
    const r = await resolverContextoSemanal(sb.client as any, ARGS);
    // O bloco cru tem `core_titulo`; o prompt do BETO lê `titulo`. Sem o
    // mapeamento, o prompt renderiza "Título: undefined".
    expect(r?.pilula).toEqual({
      titulo: 'Quando o conflito aparece',
      resumo: 'abre a competência',
      url: 'https://x/1',
    });
  });

  it('sem envio ativo, devolve null — e não inventa contexto', async () => {
    sb = mock({ comEnvio: false });
    expect(await resolverContextoSemanal(sb.client as any, ARGS)).toBeNull();
  });

  it('🔴 erro de leitura LANÇA — foi o erro engolido que manteve isto invisível', async () => {
    sb = mock();
    sb.falharEm({ tabela: 'fase4_envios', op: 'select', mensagem: 'column ... does not exist', code: '42703' });
    await expect(resolverContextoSemanal(sb.client as any, ARGS)).rejects.toThrow(/fase4_envios/);
  });
});

describe('os dois consumidores usam o resolvedor', () => {
  const BETO = readFileSync(join(process.cwd(), 'app/actions/beto.ts'), 'utf-8');
  const TUTOR = readFileSync(join(process.cwd(), 'actions/tutor-evidencia.ts'), 'utf-8');

  it('nenhum dos dois seleciona a coluna fantasma', () => {
    for (const [nome, src] of [['beto', BETO], ['tutor', TUTOR]] as const) {
      const selects: string[] = src.match(/\.select\('[^']*'\)/g) ?? [];
      const comFantasma = selects.filter((s) => s.includes('competencia_id'));
      expect(comFantasma, `${nome} ainda seleciona competencia_id`).toEqual([]);
    }
  });

  it('os dois chamam `resolverContextoSemanal`', () => {
    expect(BETO).toContain('resolverContextoSemanal(sb, {');
    expect(TUTOR).toContain('resolverContextoSemanal(sb, {');
  });

  it('o tutor traz `empresa_id` do colaborador — sem ele a competência não escopa', () => {
    expect(TUTOR).toContain("'nome_completo, cargo, perfil_dominante, empresa_id'");
  });
});
