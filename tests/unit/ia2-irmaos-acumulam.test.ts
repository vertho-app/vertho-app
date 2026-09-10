/**
 * Gerar a empresa INTEIRA de uma vez não pode produzir N perfis mutuamente cegos.
 *
 * O prompt recebe os cargos irmãos para se diferenciar deles — mas numa rodada
 * de lote os cargos seguintes só enxergam os anteriores se cada gabarito recém
 * gerado entrar no conjunto. É uma linha só no laço, ela não aparece no prompt
 * puro, e sem ela a correção vale apenas para quem regera um cargo isolado com
 * os outros já no banco.
 *
 * `Medido: 10/09/2026` — foi assim que Ibipeba acabou com três cargos de gestão
 * indistinguíveis entre si (índice de separação 0,47, abaixo do acaso): os três
 * foram gerados na mesma rodada, cada um sem ver os outros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chamadas: { system: string; user: string }[] = [];

vi.mock('@/actions/ai-client', () => ({
  callAI: async (system: string, user: string) => {
    chamadas.push({ system, user });
    // Resposta mínima que passa pela validação e pela persistência.
    const nomeDoCargo = (user.match(/Cargo: (.+)/) || [])[1] || 'X';
    return JSON.stringify({
      gabarito: {
        tela1: { caracteristicas: [], confianca: 0.8 },
        tela2: { subcompetencias: [{ nome: `Traço de ${nomeDoCargo}`, dimensao: 'D', prioridade: 'alta', direcao: 'floor', faixa_min: 'Muito alto (61-80)', faixa_max: 'Extremamente alto (81-100)', justificativa: 'x' }], confianca: 0.8 },
        tela3: { executor: 25, motivador: 25, metodico: 25, sistematico: 25, confianca: 0.8 },
        tela4: { D: { min: 'Alto (41-60)', max: 'Muito alto (61-80)', direcao: 'floor' }, I: { min: 'Alto (41-60)', max: 'Muito alto (61-80)', direcao: 'floor' }, S: { min: 'Alto (41-60)', max: 'Muito alto (61-80)', direcao: 'floor' }, C: { min: 'Alto (41-60)', max: 'Muito alto (61-80)', direcao: 'floor' }, confianca: 0.8 },
      },
      raciocinio_estruturado: {},
    });
  },
}));

const { gerarGabaritosIA2Core } = await import('@/lib/ia2-gabarito');

/** tdb/sbRaw mínimos: só o que `carregarContextoIA2` e a persistência tocam. */
function ambiente(cargos: string[], jaComGabarito: Record<string, any> = {}) {
  const cadeia = (linhas: any[]) => {
    const obj: any = {
      select: () => obj,
      eq: () => obj,
      not: () => obj,
      single: async () => ({ data: linhas[0] || null }),
      maybeSingle: async () => ({ data: linhas[0] || null }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
      then: (r: any) => Promise.resolve({ data: linhas, error: null }).then(r),
    };
    return obj;
  };
  const tabela = (nome: string) => {
    if (nome === 'top10_cargos') return cadeia(cargos.map((c) => ({ cargo: c, competencia: { nome: 'Comp' } })));
    if (nome === 'cargos_empresa') {
      return cadeia(cargos.map((c, i) => ({ id: `id-${i}`, nome: c, descricao: `desc ${c}`, gabarito: jaComGabarito[c] || null })));
    }
    return cadeia([]);
  };
  const tdb: any = { from: tabela, raw: { from: tabela } };
  const sbRaw: any = { from: () => cadeia([{ nome: 'ACME', segmento: 'Serviços' }]) };
  return { tdb, sbRaw };
}

beforeEach(() => { chamadas.length = 0; });

describe('lote: cada cargo gerado entra no contraste do seguinte', () => {
  it('o 2º cargo recebe o 1º como irmão, mesmo sem nenhum gabarito no banco', async () => {
    const { tdb, sbRaw } = ambiente(['Cargo A', 'Cargo B', 'Cargo C']);
    const r = await gerarGabaritosIA2Core({ empresaId: 'e1', tdb, sbRaw });
    expect(r.success).toBe(true);
    expect(chamadas).toHaveLength(3);

    // O primeiro não tem de quem se diferenciar.
    expect(chamadas[0].user).not.toContain('OS OUTROS CARGOS DESTA EMPRESA');

    // O segundo vê o primeiro; o terceiro vê os dois. Sem o acúmulo no laço,
    // os três sairiam mutuamente cegos — o caso Ibipeba.
    expect(chamadas[1].user).toContain('OS OUTROS CARGOS DESTA EMPRESA');
    expect(chamadas[1].user).toContain('• Cargo A: Traço de Cargo A');
    expect(chamadas[2].user).toContain('• Cargo A:');
    expect(chamadas[2].user).toContain('• Cargo B:');
  });

  it('nenhum cargo recebe a si mesmo como irmão', async () => {
    const { tdb, sbRaw } = ambiente(['Cargo A', 'Cargo B']);
    await gerarGabaritosIA2Core({ empresaId: 'e1', tdb, sbRaw });
    expect(chamadas[1].user).not.toContain('• Cargo B:');
  });

  it('REGERAÇÃO: o cargo que já tem gabarito não se recebe como irmão', async () => {
    // Este é o caso que o filtro existe para cobrir — e o único em que ele
    // importa: quando o cargo já está em `cargos_empresa` COM gabarito e está
    // sendo regerado, ele entra no conjunto antes do laço começar. Sem o
    // filtro, o prompt manda o modelo se diferenciar de si mesmo.
    const { tdb, sbRaw } = ambiente(['Cargo A'], {});
    const comGabarito = [{
      id: 'i1', nome: 'Cargo A', descricao: 'd',
      gabarito: { tela2: { subcompetencias: [{ nome: 'MarcaDoProprio', faixa_min: 'Alto (41-60)', faixa_max: 'Muito alto (61-80)', direcao: 'floor', prioridade: 'alta' }] }, tela3: {} },
    }];
    const original = tdb.from;
    tdb.from = (n: string) => {
      if (n !== 'cargos_empresa') return original(n);
      const obj: any = {
        select: () => obj, eq: () => obj, not: () => obj,
        single: async () => ({ data: comGabarito[0] }), maybeSingle: async () => ({ data: comGabarito[0] }),
        update: () => ({ eq: async () => ({ error: null }) }), upsert: async () => ({ error: null }),
        then: (r: any) => Promise.resolve({ data: comGabarito, error: null }).then(r),
      };
      return obj;
    };
    await gerarGabaritosIA2Core({ empresaId: 'e1', tdb, sbRaw });
    expect(chamadas[0].user).not.toContain('MarcaDoProprio');
    expect(chamadas[0].user).not.toContain('• Cargo A:');
  });

  it('gabarito que JÁ estava no banco também entra no contraste', async () => {
    const { tdb, sbRaw } = ambiente(['Cargo A'], {
      'Cargo A': null,
      'Cargo Velho': { tela2: { subcompetencias: [{ nome: 'Prudência', faixa_min: 'Alto (41-60)', faixa_max: 'Muito alto (61-80)', direcao: 'floor', prioridade: 'alta' }] }, tela3: {} },
    });
    // 'Cargo Velho' não está no top10, então não é gerado — mas está em
    // cargos_empresa e deve servir de contraste.
    const amb = ambiente(['Cargo A']);
    amb.tdb.from = (n: string) => {
      if (n === 'cargos_empresa') {
        const linhas = [
          { id: 'i1', nome: 'Cargo A', descricao: 'd', gabarito: null },
          { id: 'i2', nome: 'Cargo Velho', descricao: 'd', gabarito: { tela2: { subcompetencias: [{ nome: 'Prudência', faixa_min: 'Alto (41-60)', faixa_max: 'Muito alto (61-80)', direcao: 'floor', prioridade: 'alta' }] }, tela3: {} } },
        ];
        const obj: any = {
          select: () => obj, eq: () => obj, not: () => obj,
          single: async () => ({ data: linhas[0] }), maybeSingle: async () => ({ data: linhas[0] }),
          update: () => ({ eq: async () => ({ error: null }) }), upsert: async () => ({ error: null }),
          then: (r: any) => Promise.resolve({ data: linhas, error: null }).then(r),
        };
        return obj;
      }
      return tdb.from(n);
    };
    await gerarGabaritosIA2Core({ empresaId: 'e1', tdb: amb.tdb, sbRaw: amb.sbRaw });
    expect(chamadas[0].user).toContain('• Cargo Velho: Prudência');
  });
});
