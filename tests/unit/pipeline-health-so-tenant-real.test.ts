import { describe, it, expect } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { coletarCelulasVideoSemDeck } from '@/lib/pipeline-health/coleta';

/**
 * O HEALTH-CHECK CONTA SÓ TENANT REAL — demo não vira alarme.
 *
 * 🔴 O QUE ISTO IMPEDE (medido 06/09/2026). O pré-voo e o pós-voo sempre
 * excluíram demonstração, porque iteram `empresasAtivas`. O bloco ESTRUTURAL
 * não: ele varre as tabelas inteiras. Naquele dia, três achados "críticos"
 * dissolveram na conferência —
 *
 *   · "6 pessoas sem vídeo nominal" → as 6 eram personas `.demo@vertho.ai` de
 *     `escolas-acme`, tenant `is_demo` com 0 envios ativos. **Zero pessoas
 *     reais** vendo vídeo genérico;
 *   · "8 briefs sem módulo-base" → 5 do `gruposinal` (demo). Sobram 3, e o único
 *     de tenant com programa vivo é de uma competência que nenhuma trilha tem
 *     como foco — inalcançável;
 *   · "célula em módulo sem consumidor" → erros de 41 a 73 dias, a maioria num
 *     tenant de projeto parado.
 *
 * Números que assustam e, medidos, viram zero dano. É a mesma classe do contador
 * sem janela de 28/07: **alarme que não corresponde a dano treina a ignorar o
 * alarme** — e aí ele deixa de servir no dia em que houver dano de verdade.
 *
 * ⚠️ Isto NÃO desliga a demo do produto. `reconciliarPersonalizados` segue
 * varrendo tudo, porque a demo precisa do vídeo nominal — é ele que ela
 * demonstra. Quem não pode contar demo é o ALARME.
 */

const REAL = 'emp-real';
const DEMO = 'emp-demo';

function celula(empresa_id: string, over: any = {}) {
  return {
    modulo_base_id: over.modulo_base_id ?? 'mb-1',
    empresa_id,
    cargo: over.cargo ?? 'Gestão Escolar',
    disc_dominante: over.disc ?? 'D',
    status: 'error',
    bunny_video_id: null,
    error: 'render falhou',
    updated_at: '2026-09-01T12:00:00Z',
    ...over,
  };
}

function mock(celulas: any[]) {
  return criarSupabaseMock({
    lista: (tabela) => {
      if (tabela === 'videos_gerados') return celulas;
      if (tabela === 'empresas') return [{ id: REAL, slug: 'cliente' }, { id: DEMO, slug: 'demo' }];
      if (tabela === 'micro_conteudos') return [];
      return [];
    },
  });
}

describe('coletarCelulasVideoSemDeck respeita o recorte de tenant', () => {
  /**
   * ⚠️ O QUE ESTE TESTE PODE E NÃO PODE PROVAR.
   *
   * O mock REGISTRA os filtros e não os APLICA — de propósito: ele testa o nosso
   * código, nunca o PostgREST (CLAUDE.md §Testes). Então a asserção certa é que
   * a cadeia recebeu `.in('empresa_id', <ids reais>)`, não que a lista voltou
   * menor. A primeira versão deste arquivo afirmava o segundo e passou a mentir
   * na hora: veio `[demo]` onde eu esperava `[]`.
   *
   * A prova de que o filtro REALMENTE recorta é a execução contra o banco:
   * 06/09/2026, "Brief sem módulo-base" caiu de **8 para 3** e o achado das
   * 6 pessoas sem vídeo nominal desapareceu, porque as 6 eram personas de demo.
   */
  it('🔴 com o Set, a query pede só os tenants reais', async () => {
    const sb = mock([celula(REAL), celula(DEMO)]);
    await coletarCelulasVideoSemDeck(sb.client, new Set([REAL]));
    const chamada = sb.chamadas.find((c) => c.tabela === 'videos_gerados' && c.metodo === 'in');
    expect(chamada, 'a coleta não restringiu por empresa_id').toBeTruthy();
    expect(chamada!.args[0]).toBe('empresa_id');
    expect(chamada!.args[1]).toEqual([REAL]);
  });

  it('sem o Set, o contrato antigo é preservado — nenhum recorte', async () => {
    // Script de investigação chama sem o Set e continua varrendo a base inteira.
    const sb = mock([celula(REAL), celula(DEMO)]);
    await coletarCelulasVideoSemDeck(sb.client);
    expect(sb.chamadas.some((c) => c.tabela === 'videos_gerados' && c.metodo === 'in')).toBe(false);
  });

  it('o Set vazio ainda recorta — não vira "varre tudo" por acidente', async () => {
    // `new Set()` é falsy? Não em JS — mas um `if (tenantsReais?.size)` faria
    // dele um "sem filtro", e aí um ambiente sem tenant real varreria a demo.
    const sb = mock([celula(DEMO)]);
    await coletarCelulasVideoSemDeck(sb.client, new Set());
    const chamada = sb.chamadas.find((c) => c.tabela === 'videos_gerados' && c.metodo === 'in');
    expect(chamada!.args[1]).toEqual([]);
  });

  it('falha de leitura PROPAGA — não vira "nenhum problema"', async () => {
    // A classe do F17: não conseguir olhar tem que ser diferente de olhar e
    // estar tudo bem. Sem isto, uma query quebrada zeraria o achado em silêncio.
    const sb = mock([celula(REAL)]);
    sb.falharEm({ tabela: 'videos_gerados', op: 'select', mensagem: 'timeout' });
    await expect(coletarCelulasVideoSemDeck(sb.client, new Set([REAL]))).rejects.toThrow(/videos_gerados/);
  });
});
