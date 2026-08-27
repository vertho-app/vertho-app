/**
 * A home sabe em que semana a pessoa está?
 *
 * POR QUE ESTE ARQUIVO EXISTE (medido 27/08/2026)
 * ──────────────────────────────────────────────
 * `carregarHomeKpis` montava os três cards da home (pílula, evidência, próximo
 * marco) a partir de uma query que pedia `temporada_semana_progresso.created_at`
 * — coluna que NUNCA existiu nessa tabela (ela tem `iniciado_em`/`concluido_em`).
 *
 * O PostgREST devolvia `42703`, e o supabase-js **retorna** `{ error }` em vez de
 * lançar: o `const { data: progresso } = await …` descartava o erro, `progresso`
 * vinha `undefined`, `semanaAtual` caía para 0 e os três blocos ficavam `null`.
 * Os cards sumiam da home com 941 linhas de progresso reais no banco, e nada
 * ficava vermelho — nem o tsc, nem os 2.928 testes, nem os 25 guards, nem o smoke.
 *
 * Escondido debaixo disso havia um segundo defeito, que só apareceria DEPOIS de
 * consertar o primeiro: a semana vinha de
 * `.order('semana', {ascending:false}).limit(1)`, que é a MAIOR semana existente
 * na tabela. As trilhas nascem com as 14 linhas de uma vez, então aquilo
 * responderia **14 para todo mundo**. Consertar só a coluna teria trocado
 * "card ausente" por "card mentindo" — pior.
 *
 * Cada `it` aqui foi validado por MUTAÇÃO: revertido o trecho correspondente em
 * `lib/home/loaders.ts`, o teste correspondente falha.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

let sb: ReturnType<typeof criarSupabaseMock>;

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => sb.client,
}));

import { carregarHomeKpis } from '@/lib/home/loaders';

const COLAB = { id: 'colab-1', empresa_id: 'emp-1' };

/** 'YYYY-MM-DD' de N dias atrás — a base do gating é a data de início da trilha. */
function diasAtras(n: number): string {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Trilha com plano de 14 semanas começando há `dias` dias.
 * Passada via `shared` para que o teste exercite o cálculo, não o select.
 */
function trilhaComInicio(dias: number, extra: Record<string, unknown> = {}) {
  return {
    trilha: {
      id: 'tr-1',
      cursos: [],
      competencia_foco: 'C1',
      temporada_plano: null, // cai no fallback de 14 semanas
      data_inicio: diasAtras(dias),
      ...extra,
    },
  };
}

/** Linhas de progresso como o banco realmente as tem: as 14 semanas de uma vez. */
function progressoDeTodasAsSemanas(semanaConsumida?: number) {
  return (tabela: string, _cols: string) => {
    if (tabela !== 'temporada_semana_progresso') return null;
    // o mock resolve a linha única já filtrada por `.eq('semana', N)`;
    // devolvemos a que o código pediu através da chamada registrada
    const eqSemana = sb.chamadas
      .filter((c) => c.tabela === 'temporada_semana_progresso' && c.metodo === 'eq')
      .map((c) => c.args)
      .find((a: any[]) => a[0] === 'semana');
    const semana = eqSemana ? Number(eqSemana[1]) : null;
    if (semana === null || semana < 1 || semana > 14) return null;
    return {
      semana,
      conteudo_consumido: semanaConsumida === semana,
      iniciado_em: null,
      concluido_em: null,
    };
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('carregarHomeKpis — a semana da pessoa', () => {
  it('deriva a semana do gating por DATA, não da maior linha da tabela', async () => {
    // 16 dias => semanas 1, 2 e 3 já liberaram (N libera em inicio + (N-1)*7d).
    sb = criarSupabaseMock({ resolver: progressoDeTodasAsSemanas() });

    const kpis = await carregarHomeKpis(COLAB, Promise.resolve(null), trilhaComInicio(16));

    // Se voltar 14, o código está lendo a última linha da tabela em vez da
    // semana corrente — que é o defeito que este teste tranca.
    expect(kpis.pilula?.semana).toBe(3);
    expect(kpis.pilula?.totalSemanas).toBe(14);
  });

  it('NUNCA pede uma coluna que a tabela não tem (era `created_at`)', async () => {
    sb = criarSupabaseMock({ resolver: progressoDeTodasAsSemanas() });

    await carregarHomeKpis(COLAB, Promise.resolve(null), trilhaComInicio(16));

    const selects = sb.chamadas
      .filter((c) => c.tabela === 'temporada_semana_progresso' && c.metodo === 'select')
      .map((c) => String(c.args[0]));

    expect(selects.length).toBeGreaterThan(0);
    for (const cols of selects) {
      // `created_at` não existe em temporada_semana_progresso: pedir isso faz o
      // PostgREST recusar a query INTEIRA com 42703.
      expect(cols).not.toContain('created_at');
    }
  });

  it('falha de leitura vira ERRO VISÍVEL, não semana 0 calada', async () => {
    sb = criarSupabaseMock({ resolver: progressoDeTodasAsSemanas() });
    sb.falharEm({
      tabela: 'temporada_semana_progresso',
      op: 'select',
      mensagem: 'column "created_at" does not exist',
      code: '42703',
    });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});

    const kpis = await carregarHomeKpis(COLAB, Promise.resolve(null), trilhaComInicio(16));

    // O ponto do teste: o erro APARECE. Antes ele era descartado no destructuring.
    expect(erro).toHaveBeenCalled();
    const mensagens = erro.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(mensagens).toContain('42703');

    // E a semana continua vindo da data, não some porque a leitura falhou.
    expect(kpis.pilula?.semana).toBe(3);
  });

  it('usa a régua única de consumo — booleano `true` conta como concluída', async () => {
    // 941 linhas em produção, ZERO em formato array: a régua antiga
    // (`cursosProg.some(...)`) só enxergava array e respondia sempre "em-curso".
    sb = criarSupabaseMock({ resolver: progressoDeTodasAsSemanas(3) });

    const kpis = await carregarHomeKpis(COLAB, Promise.resolve(null), trilhaComInicio(16));

    expect(kpis.pilula?.semana).toBe(3);
    expect(kpis.pilula?.status).toBe('concluida');
  });

  it('sem `data_inicio` não inventa janela: nenhum card em vez de card chutado', async () => {
    sb = criarSupabaseMock({ resolver: progressoDeTodasAsSemanas() });

    const kpis = await carregarHomeKpis(
      COLAB,
      Promise.resolve(null),
      trilhaComInicio(16, { data_inicio: null }),
    );

    expect(kpis.pilula).toBeNull();
    expect(kpis.evidencia).toBeNull();
    expect(kpis.proximoMarco).toBeNull();
  });

  it('o próximo marco é a semana seguinte pela mesma régua', async () => {
    sb = criarSupabaseMock({ resolver: progressoDeTodasAsSemanas() });

    const kpis = await carregarHomeKpis(COLAB, Promise.resolve(null), trilhaComInicio(16));

    // Semana atual = 3, então o próximo evento é a semana 4.
    expect(kpis.proximoMarco?.semana).toBe(4);
    expect(kpis.proximoMarco?.diasAte).toBeGreaterThan(0);
    expect(kpis.proximoMarco?.diasAte).toBeLessThanOrEqual(7);
  });
});
