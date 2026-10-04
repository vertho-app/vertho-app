import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * A linha de progresso da semana 1 do Onboarding grava `tipo = 'mapeamento'`
 * (mig 275, 04/10/2026).
 *
 * Até ali a CHECK `temporada_semana_progresso_tipo_check` só aceitava
 * `conteudo`, `aplicacao` e `avaliacao`, e a linha do mapeamento gravava
 * `avaliacao`, que também é o tipo da avaliação FINAL. Este arquivo trava as três
 * pontas do contrato:
 *
 *   1. o BANCO: todo tipo que o plano pode ter cabe na CHECK vigente, lida das
 *      migrations (não copiada: copiar a faria envelhecer calada, como em
 *      `relatorio-agregado-atomico.test.ts`, que achou 4 tipos fora da CHECK);
 *   2. o ESCRITOR: `geracao-onboarding.test.ts` prova que a linha espelha o tipo
 *      do plano;
 *   3. os LEITORES: a linha `mapeamento` conta como semana concluída no "x de N"
 *      (que olha o `status`), e NÃO é conteúdo consumido, evidência nem avaliação
 *      final. As linhas gravadas antes da 275 (`avaliacao`) têm de ler igual: o
 *      código novo e as linhas velhas convivem.
 *
 * A prova da migration no Postgres de verdade (tabela temporária com a mesma CHECK)
 * é um ensaio manual, relatado no commit: a CI não tem Postgres.
 */

const CONSTRAINT = 'temporada_semana_progresso_tipo_check';

// `\r?\n`: no Windows o checkout vem com CRLF, e o `.` da regex não engole o `\r`.
const semComentarios = (sql: string) => sql.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');

/** Os tipos que a CHECK aceita: os literais `'x'::text` entre o ADD e o `;`. */
function tiposDaCheck(sql: string): string[] | null {
  const limpo = semComentarios(sql);
  const m = new RegExp(`ADD\\s+CONSTRAINT\\s+"?${CONSTRAINT}"?\\s+CHECK`, 'i').exec(limpo);
  if (!m) return null;
  const trecho = limpo.slice(m.index, limpo.indexOf(';', m.index));
  return [...trecho.matchAll(/'([a-z_]+)'::text/g)].map((x) => x[1]);
}

/** A migration de MAIOR número que (re)define a CHECK é a que vale no banco. */
function checkVigente(): { arquivo: string; tipos: string[] } {
  const arquivos = readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort();
  let vigente: { arquivo: string; tipos: string[] } | null = null;
  for (const arquivo of arquivos) {
    const tipos = tiposDaCheck(readFileSync(`migrations/${arquivo}`, 'utf-8'));
    if (tipos) vigente = { arquivo, tipos };
  }
  if (!vigente) throw new Error(`nenhuma migration define ${CONSTRAINT}`);
  return vigente;
}

/** Os tipos de slot que o plano da trilha pode ter: `tipo: 'x';` nas interfaces de build-season. */
function tiposDoPlano(): string[] {
  const src = readFileSync('lib/season-engine/build-season.ts', 'utf-8');
  return [...src.matchAll(/^\s*tipo:\s*'([a-z_]+)';/gm)].map((m) => m[1]);
}

describe('a CHECK da linha de progresso aceita todo tipo que o plano pode ter', () => {
  it('os tipos do plano são os quatro conhecidos (a leitura do código não está vazia)', () => {
    expect([...tiposDoPlano()].sort()).toEqual(['aplicacao', 'avaliacao', 'conteudo', 'mapeamento']);
  });

  it('🔴 a CHECK vigente (migration de maior número) cobre cada um deles', () => {
    const { arquivo, tipos } = checkVigente();
    for (const tipo of tiposDoPlano()) {
      expect(
        tipos,
        `o plano pode ter slot "${tipo}" e a CHECK de ${arquivo} não o aceita: `
        + 'a escrita da linha de progresso falharia com 23514. Amplie a CHECK numa migration nova.',
      ).toContain(tipo);
    }
  });

  it('a vigente é a 275 ou posterior, e nenhuma versão dela perdeu os quatro tipos', () => {
    const { arquivo, tipos } = checkVigente();
    expect(arquivo >= '275-').toBe(true);
    expect(tipos).toEqual(expect.arrayContaining(['aplicacao', 'avaliacao', 'conteudo', 'mapeamento']));
  });

  it('o leitor sabe falhar: a CHECK do baseline (3 tipos) não aceita `mapeamento`', () => {
    const baseline = tiposDaCheck(readFileSync('migrations/000-baseline.sql', 'utf-8'));
    expect(baseline).toEqual(['conteudo', 'aplicacao', 'avaliacao']);
    expect(baseline).not.toContain('mapeamento');
  });
});

describe('a migration 275 troca a CHECK de forma atômica e idempotente', () => {
  const sql = semComentarios(readFileSync('migrations/275-progresso-tipo-mapeamento.sql', 'utf-8'));
  const pos = (re: RegExp) => sql.search(re);

  it('DROP IF EXISTS e ADD, nesta ordem, DENTRO de um BEGIN/COMMIT', () => {
    const begin = pos(/\bBEGIN\s*;/i);
    const drop = pos(new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${CONSTRAINT}`, 'i'));
    const add = pos(new RegExp(`ADD\\s+CONSTRAINT\\s+${CONSTRAINT}`, 'i'));
    const commit = pos(/\bCOMMIT\s*;/i);
    expect([begin, drop, add, commit].every((i) => i >= 0)).toBe(true);
    expect(begin).toBeLessThan(drop);
    expect(drop).toBeLessThan(add);
    expect(add).toBeLessThan(commit);
  });

  it('só AMPLIA: os três tipos antigos continuam na lista', () => {
    expect(tiposDaCheck(sql)).toEqual(expect.arrayContaining(['conteudo', 'aplicacao', 'avaliacao']));
  });

  it('não mexe em nenhuma outra CHECK nem usa CONCURRENTLY (o apply-migration manda o arquivo numa query só)', () => {
    expect(sql).not.toMatch(/CONCURRENTLY/i);
    expect(sql).not.toMatch(/temporada_semana_progresso_(semana|status)_check/);
    expect((sql.match(/ADD\s+CONSTRAINT/gi) || []).length).toBe(1);
    expect((sql.match(/DROP\s+CONSTRAINT/gi) || []).length).toBe(1);
  });
});

describe('o admin sabe nomear e tratar a semana de mapeamento', () => {
  it.each(['pt-BR', 'pt-PT', 'es-ES', 'en-US'])('AdminSeasons.types tem um rótulo para cada tipo do plano em %s', (loc) => {
    const msgs = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf-8'));
    for (const tipo of tiposDoPlano()) {
      expect(typeof msgs.AdminSeasons.types[tipo], `${loc}: AdminSeasons.types.${tipo}`).toBe('string');
      expect(msgs.AdminSeasons.types[tipo].length).toBeGreaterThan(0);
    }
  });

  it('o botão de regerar semana não aparece no slot de mapeamento (a regeração o recusa)', () => {
    const page = readFileSync('app/admin/temporadas/page.tsx', 'utf-8');
    expect(page).toContain("s.tipo !== 'avaliacao' && s.tipo !== 'mapeamento' && (");
  });
});

// ── Leitores ────────────────────────────────────────────────────────────────

const TIPOS_DA_LINHA = ['mapeamento', 'avaliacao'] as const; // a nova e a gravada antes da mig 275

const sb = criarSupabaseMock({
  lista: (tabela) => {
    if (tabela === 'fase4_envios') return [{
      colaborador_id: 'e1', semana_atual: 2, status: 'ativo',
      colaboradores: { nome_completo: 'Eva', cargo: 'Professor(a)' },
    }];
    if (tabela === 'trilhas') return [{
      id: 'tE', colaborador_id: 'e1', numero_temporada: 1, data_inicio: '2026-01-05',
      temporada_plano: [{ semana: 1, tipo: 'mapeamento' }, { semana: 2, tipo: 'conteudo' }, { semana: 3, tipo: 'avaliacao' }],
    }];
    if (tabela === 'temporada_semana_progresso') {
      return [{ trilha_id: 'tE', colaborador_id: 'e1', semana: 1, ...h.linhaDaSemana1 }];
    }
    return [];
  },
});
const h = vi.hoisted(() => ({ linhaDaSemana1: {} as Record<string, any> }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const real = await importOriginal<any>();
  return { ...real, registrarDegradacao: vi.fn(async () => {}) };
});

import { avaliarAcessoSemana, primeiraSemanaAcessivel } from '@/lib/season-engine/week-gating';
import { buildEngagementEvolutionDashboard } from '@/lib/engagement-evolution';
import { rollUpEngajamento } from '@/lib/engajamento/roll-up';
import { agregarEvidenciasAteAcumulada } from '@/lib/season-engine/evidencias-fechamento';

const PLANO_ONBOARDING: any[] = [
  { semana: 1, tipo: 'mapeamento', descritor: null, descritores_cobertos: [], status: 'disponivel' },
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((semana) => ({
    semana, tipo: 'conteudo', descritor: `D${semana}`, descritores_cobertos: [`D${semana}`], status: 'disponivel',
  })),
  { semana: 12, tipo: 'avaliacao', descritor: null, descritores_cobertos: [], status: 'bloqueada' },
];

describe.each(TIPOS_DA_LINHA)('leitores com a linha da semana 1 gravada como `%s`', (tipo) => {
  const linha = { semana: 1, tipo, status: 'concluido', concluido_em: '2026-11-04T18:00:00Z' };
  beforeEach(() => { sb.reset(); });

  it('"semana atual": a linha concluída libera a semana 2 (o gate olha o status, não o tipo)', () => {
    const base = { dataInicio: '2026-11-09', plano: PLANO_ONBOARDING, semana: 2, now: new Date('2026-11-17T12:00:00Z') };
    expect(avaliarAcessoSemana({ ...base, progresso: [linha] }).liberada).toBe(true);
    expect(avaliarAcessoSemana({ ...base, progresso: [{ ...linha, status: 'em_andamento' }] }).liberada).toBe(false);
    expect(primeiraSemanaAcessivel({ ...base, progresso: [linha] })).toBe(2);
  });

  it('engajamento (evolução): não é conteúdo consumido nem evidência, e não vira avaliação final', () => {
    const d = buildEngagementEvolutionDashboard({
      enrollments: [{ colaboradorId: 'e1', nome: 'Eva', cargo: 'Prof', area: 'A', semanaAtual: 2 }],
      events: [], videos: [], tutorUses: [], completedStatus: 'concluido',
      progress: [{ colaboradorId: 'e1', semana: 1, tipo, status: 'concluido', conteudoConsumido: false }],
    });
    expect(d.semanas[0]).toMatchObject({ semana: 1, elegiveis: 1, ativados: 0, consumiram: 0, evidencias: 0 });
  });

  it('engajamento (roll-up): a evidência da etapa não sai dessa linha, mesmo com nível de reflexão', async () => {
    h.linhaDaSemana1 = { tipo, status: 'concluido', qualidade: 'alta' };
    const r: any = await rollUpEngajamento('emp-1', 1);
    const eva = r.colaboradores.find((c: any) => c.nome === 'Eva');
    expect(eva.enviouEvidencia).toBe(false);
    expect(eva.qualidadeEvidencia).toBeNull();
  });

  it('fechamento: a linha não é lida como reflexão de conteúdo nem de missão', async () => {
    // O slot real do mapeamento não cobre descritor nenhum. Aqui ele cobre D2 e a
    // linha traz texto, de propósito: assim o que barra a linha é o TIPO, e não a
    // falta de descritor a creditar.
    const plano = [
      { semana: 1, tipo: 'mapeamento', descritor: 'D2', descritores_cobertos: ['D2'] },
      { semana: 2, tipo: 'conteudo', descritor: 'D2', descritores_cobertos: ['D2'] },
    ];
    const mock = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'trilhas' ? { temporada_plano: plano } : null),
      lista: (tabela) => (tabela === 'temporada_semana_progresso' ? [
        { semana: 1, tipo, reflexao: { insight_principal: 'texto que não pode entrar' }, feedback: { modo: 'pratica', compromisso: 'nem este', avaliacao_por_descritor: [] } },
        { semana: 2, tipo: 'conteudo', reflexao: { insight_principal: 'Passei a registrar a pauta.', qualidade_reflexao: 'alta' } },
      ] : []),
    });
    const texto = await agregarEvidenciasAteAcumulada(mock.client, 'tE', [{ descritor: 'D2' }], 11);
    expect(texto).toContain('Passei a registrar a pauta.');
    expect(texto).not.toContain('texto que não pode entrar');
    expect(texto).not.toContain('nem este');
  });
});

describe('os controles dos leitores discriminam (a mesma linha como `conteudo` CONTA)', () => {
  beforeEach(() => { sb.reset(); });

  it('evolução: a linha concluída de conteúdo é consumo e evidência', () => {
    const d = buildEngagementEvolutionDashboard({
      enrollments: [{ colaboradorId: 'e1', nome: 'Eva', cargo: 'Prof', area: 'A', semanaAtual: 2 }],
      events: [], videos: [], tutorUses: [], completedStatus: 'concluido',
      progress: [{ colaboradorId: 'e1', semana: 1, tipo: 'conteudo', status: 'concluido', conteudoConsumido: false }],
    });
    expect(d.semanas[0]).toMatchObject({ ativados: 1, consumiram: 1, evidencias: 1 });
  });

  it('roll-up: a linha concluída de conteúdo, com nível, é a evidência da etapa', async () => {
    h.linhaDaSemana1 = { tipo: 'conteudo', status: 'concluido', qualidade: 'alta' };
    const r: any = await rollUpEngajamento('emp-1', 1);
    const eva = r.colaboradores.find((c: any) => c.nome === 'Eva');
    expect(eva.enviouEvidencia).toBe(true);
    expect(eva.qualidadeEvidencia).toBe('alta');
  });

  it('fechamento: o mesmo texto, numa linha `conteudo`, entra no prompt do scorer', async () => {
    const mock = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'trilhas' ? { temporada_plano: [{ semana: 1, descritor: 'D1', descritores_cobertos: ['D1'] }] } : null),
      lista: (tabela) => (tabela === 'temporada_semana_progresso'
        ? [{ semana: 1, tipo: 'conteudo', reflexao: { insight_principal: 'texto que entra', qualidade_reflexao: 'alta' } }]
        : []),
    });
    expect(await agregarEvidenciasAteAcumulada(mock.client, 'tE', [{ descritor: 'D1' }], 11)).toContain('texto que entra');
  });
});
