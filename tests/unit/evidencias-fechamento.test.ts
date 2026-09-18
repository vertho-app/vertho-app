/**
 * A TERCEIRA PERNA DA TRIANGULAÇÃO DO FECHAMENTO.
 *
 * 🔴 POR QUE (17/09/2026). `agregarEvidenciasAteAcumulada` selecionava
 * `'semana, tipo, descritor, reflexao, feedback, tira_duvidas'`, e
 * `temporada_semana_progresso` NÃO TEM a coluna `descritor` — o descritor da
 * semana vem do `temporada_plano`. Coluna inexistente derruba a query inteira
 * (400 / `42703`), `data` volta `null`, e o guard seguinte (`!progressos?.length`)
 * lia isso como "trilha sem progresso": string vazia, sem erro em lugar nenhum.
 *
 * O prompt do scorer recebia "(sem evidência registrada nas N semanas)" em todos
 * os descritores, e a nota_pos — que existe justamente para não sair de uma
 * conversa só — triangulava com duas pernas. `Medido:` o select entrou em
 * `f42fb93d` (03/07/2026) e desde então rodaram 48 fechamentos, 100% dos que
 * existem na base.
 *
 * Os dois testes abaixo cobrem as duas metades: a query volta a trazer as
 * semanas, e uma falha de leitura deixa de ser silenciosa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const degradacoes: any[] = [];
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const real = await importOriginal<any>();
  return { ...real, registrarDegradacao: vi.fn(async (input: any) => { degradacoes.push(input); }) };
});

const { agregarEvidenciasAteAcumulada } = await import('@/lib/season-engine/evidencias-fechamento');
const { DEGRADACAO } = await import('@/lib/degradacao');

const PLANO = [
  { semana: 1, descritor: 'Rituais formativos', descritores_cobertos: ['Rituais formativos'] },
  { semana: 2, descritor: 'Troca de práticas', descritores_cobertos: ['Troca de práticas'] },
];
const SEMANAS = [
  { semana: 1, tipo: 'conteudo', reflexao: { insight_principal: 'Passei a registrar a pauta antes do encontro.', qualidade_reflexao: 'alta' } },
  { semana: 2, tipo: 'conteudo', reflexao: { insight_principal: 'Chamei duas professoras para conduzir comigo.', qualidade_reflexao: 'media' } },
];
const DESCRITORES = [{ descritor: 'Rituais formativos' }, { descritor: 'Troca de práticas' }];

function mock(falha?: { mensagem: string; code?: string }) {
  return criarSupabaseMock({
    resolver: (tabela) => (tabela === 'trilhas' ? { temporada_plano: PLANO } : null),
    lista: (tabela) => (tabela === 'temporada_semana_progresso' ? SEMANAS : []),
    falhas: falha ? [{ tabela: 'temporada_semana_progresso', op: 'select', ...falha }] : [],
  });
}

beforeEach(() => { degradacoes.length = 0; });

describe('evidências das semanas chegam ao scorer', () => {
  it('agrega as reflexões por descritor, em vez de devolver vazio', async () => {
    const texto = await agregarEvidenciasAteAcumulada(mock().client, 'tr-1', DESCRITORES, 8);
    expect(texto).toContain('### Rituais formativos');
    expect(texto).toContain('Passei a registrar a pauta antes do encontro.');
    expect(texto).toContain('### Troca de práticas');
    expect(texto).toContain('Chamei duas professoras para conduzir comigo.');
    expect(texto).not.toContain('sem evidência registrada');
  });

  /**
   * 🔴 A âncora que pega a regressão real: qualquer coluna a mais no select
   * volta a derrubar a query em produção. O teste não consegue conhecer o schema,
   * então trava o select EXATO — mudar as colunas aqui obriga a conferir a
   * tabela, que é o passo que faltou em 03/07.
   */
  it('o select pede só as quatro colunas que a função usa', async () => {
    const sb = mock();
    await agregarEvidenciasAteAcumulada(sb.client, 'tr-1', DESCRITORES, 8);
    expect(sb.usou('temporada_semana_progresso', 'select', 'semana, tipo, reflexao, feedback')).toBe(true);
  });
});

describe('falha de leitura não sai calada', () => {
  it('registra degradação crítica quando a query erra, e não finge ausência de dado', async () => {
    const texto = await agregarEvidenciasAteAcumulada(
      mock({ mensagem: 'column temporada_semana_progresso.descritor does not exist', code: '42703' }).client,
      'tr-1', DESCRITORES, 8, { empresaId: 'emp-1', colaboradorId: 'col-1' },
    );
    // Degrada (a pessoa acabou de responder o cenário e não pode ficar sem nota)…
    expect(texto).toBe('');
    // …mas com rastro: é o que faltou por dois meses e meio.
    expect(degradacoes).toHaveLength(1);
    expect(degradacoes[0]).toMatchObject({
      fluxo: 'trilha',
      tipo: DEGRADACAO.EVIDENCIAS_FECHAMENTO_NAO_LIDAS,
      chave: 'tr-1',
      empresaId: 'emp-1',
      colaboradorId: 'col-1',
      severidade: 'critico',
    });
    // o código da classe fica registrado: é ele que distingue schema errado
    // de queda de rede quando alguém for ler o log meses depois.
    expect(degradacoes[0].detalhe.codigo).toBe('42703');
    expect(degradacoes[0].detalhe.erro).toContain('does not exist');
  });

  it('a leitura do PLANO também não sai calada: o sintoma é o mesmo', async () => {
    const sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'trilhas' ? { temporada_plano: PLANO } : null),
      lista: (tabela) => (tabela === 'temporada_semana_progresso' ? SEMANAS : []),
      falhas: [{ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' }],
    });
    expect(await agregarEvidenciasAteAcumulada(sb.client, 'tr-1', DESCRITORES, 8, { empresaId: 'emp-1' })).toBe('');
    expect(degradacoes).toHaveLength(1);
    expect(degradacoes[0].detalhe.origem).toBe('temporada_plano');
  });

  it('trilha sem nenhuma semana continua sendo vazio SEM degradação: ausência não é falha', async () => {
    const sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'trilhas' ? { temporada_plano: PLANO } : null),
      lista: () => [],
    });
    expect(await agregarEvidenciasAteAcumulada(sb.client, 'tr-1', DESCRITORES, 8)).toBe('');
    expect(degradacoes).toHaveLength(0);
  });
});
