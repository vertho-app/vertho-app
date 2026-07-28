import { describe, it, expect } from 'vitest';
import { repararCoreOrfaoDaSemana, selecionarConteudoDaSemana } from '@/lib/season-engine/build-season';

/**
 * F-I2 do docs/FMEA-PIPELINE.md: regerar uma semana reescrevia desafio/missão por
 * IA mas mantinha o `core_id` do slot antigo — PERPETUANDO core órfão (dedup/
 * delete de micro_conteudos) e "título ≠ blocos". O reparo tem 2 regras:
 *
 *   1. Re-seleciona SÓ quando o core está órfão/stale — core válido NUNCA é
 *      trocado (a pessoa já viu aquele conteúdo);
 *   2. A re-seleção passa por `selecionarConteudoDaSemana`, a MESMA função do
 *      motor — reimplementar o scoring recria a classe de bug original.
 *
 * Os testes calculam o esperado CHAMANDO a função do motor: se o helper deixar
 * de rotear por ela (mutação), a escolha diverge e o teste cai.
 */

/** Mock chainable do sb: devolve `pool` em micro_conteudos, filtrando por competencia. */
function sbComPool(pool: any[]) {
  const mk = () => {
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => { if (c === 'competencia') q._comp = v; return q; },
      is: () => q,
      or: () => q,
      then: (resolve: any) => {
        const list = q._comp ? pool.filter((x) => x.competencia === q._comp) : pool;
        resolve({ data: list, error: null });
      },
    };
    return q;
  };
  return { from: mk };
}

const OPTS = { cargo: 'Professor', prioridadeFormatos: ['video', 'texto', 'audio', 'case'], empresaId: 'e1' };

const pool = [
  // Armadilhas que SÓ a função do motor filtra: cargo alheio com score altíssimo
  // e conteúdo de kit (escrito pra UM DISC) — uma reimplementação ingênua escolheria.
  { id: 'c-cargo-alheio', titulo: 'Alheio', formato: 'video', competencia: 'Autocuidado', descritor: 'D1', cargo: 'Gerente', ativo: true, versao: 9, taxa_conclusao: 0.99 },
  { id: 'c-kit', titulo: 'Kit', formato: 'video', competencia: 'Autocuidado', descritor: 'D1', cargo: 'Professor', kit_id: 'k1', ativo: true, versao: 9, taxa_conclusao: 0.99 },
  // Vencedor legítimo: match do descritor + mesmo cargo.
  { id: 'cA', titulo: 'Conteúdo A', formato: 'texto', competencia: 'Autocuidado', descritor: 'D1', cargo: 'Professor', ativo: true, versao: 1, taxa_conclusao: 0.5 },
  { id: 'cB', titulo: 'Conteúdo B', formato: 'texto', competencia: 'Autocuidado', descritor: 'D2', cargo: 'Professor', ativo: true, versao: 1, taxa_conclusao: 0.9 },
];

describe('repararCoreOrfaoDaSemana · re-seleção roteada pelo motor (F-I2)', () => {
  it('core órfão é re-selecionado por selecionarConteudoDaSemana (não por reimplementação)', async () => {
    const slot = {
      semana: 1, tipo: 'conteudo', competencia: 'Autocuidado', descritor: 'D1', nivel_atual: 2,
      conteudo: { core_id: 'morto', core_titulo: 'Morto', core_url: null, formato_core: 'texto', core_reuso: false, formatos_disponiveis: {}, fallback_gerado: false, desafio_texto: 'DESAFIO DA IA' },
    };
    const esperado = selecionarConteudoDaSemana(pool as any, { cargo: OPTS.cargo, descritor: 'D1', prioridadeFormatos: OPTS.prioridadeFormatos });

    const r = await repararCoreOrfaoDaSemana(sbComPool(pool), slot, OPTS);

    expect(r.reparados).toBe(1);
    expect(slot.conteudo.core_id).toBe(esperado.coreContent?.id);
    expect(slot.conteudo.core_id).toBe('cA'); // nem cargo alheio, nem kit
    expect(slot.conteudo.core_titulo).toBe('Conteúdo A');
    expect(slot.conteudo.fallback_gerado).toBe(false);
    expect((slot.conteudo.formatos_disponiveis as any).texto?.id).toBe('cA');
    // Desafio da etapa de IA NÃO é tocado pelo reparo de conteúdo.
    expect(slot.conteudo.desafio_texto).toBe('DESAFIO DA IA');
  });

  it('core VÁLIDO não é trocado — a pessoa já viu aquele conteúdo', async () => {
    const conteudo = { core_id: 'cA', core_titulo: 'Conteúdo A', core_url: null, formato_core: 'texto', core_reuso: false, formatos_disponiveis: { texto: { id: 'cA' } }, fallback_gerado: false, desafio_texto: 'X' };
    const slot = { semana: 1, tipo: 'conteudo', competencia: 'Autocuidado', descritor: 'D1', nivel_atual: 2, conteudo };
    const antes = JSON.parse(JSON.stringify(slot));

    const r = await repararCoreOrfaoDaSemana(sbComPool(pool), slot, OPTS);

    expect(r.reparados).toBe(0);
    expect(slot).toEqual(antes);
  });

  it('fallback_gerado (core_id null) ganha conteúdo real quando ele existe hoje', async () => {
    const slot = {
      semana: 1, tipo: 'conteudo', competencia: 'Autocuidado', descritor: 'D1', nivel_atual: 2,
      conteudo: { core_id: null, core_titulo: 'Episódio 1: D1', core_url: null, formato_core: 'texto', core_reuso: false, formatos_disponiveis: {}, fallback_gerado: true, desafio_texto: 'X' },
    };
    const r = await repararCoreOrfaoDaSemana(sbComPool(pool), slot, OPTS);
    expect(r.reparados).toBe(1);
    expect(slot.conteudo.core_id).toBe('cA');
    expect(slot.conteudo.fallback_gerado).toBe(false);
  });

  it('shape DUO: repara só a entrega órfã, não repete conteúdo nas 2 pílulas e espelha o topo', async () => {
    const slot = {
      semana: 1, tipo: 'conteudo', competencia: 'Autocuidado', descritor: 'D1', nivel_atual: 2,
      conteudo: { core_id: 'morto', core_titulo: 'Morto', core_url: null, formato_core: 'texto', formatos_disponiveis: {}, fallback_gerado: false, desafio_texto: 'DESAFIO NOVO DA IA' },
      conteudos_dia: [
        { dia: 'segunda', label: 'Pílula 1', competencia: 'Autocuidado', descritor: 'D1', nivel_atual: 2, conteudo: { core_id: 'morto', core_titulo: 'Morto', core_url: null, formato_core: 'texto', formatos_disponiveis: {}, fallback_gerado: false, desafio_texto: 'VELHO' } },
        { dia: 'terca', label: 'Pílula 2', competencia: 'Autocuidado', descritor: 'D2', nivel_atual: 2, conteudo: { core_id: 'cB', core_titulo: 'Conteúdo B', core_url: null, formato_core: 'texto', formatos_disponiveis: { texto: { id: 'cB' } }, fallback_gerado: false, desafio_texto: 'VELHO B' } },
      ],
    };
    const esperado = selecionarConteudoDaSemana(pool as any, {
      cargo: OPTS.cargo, descritor: 'D1', prioridadeFormatos: OPTS.prioridadeFormatos,
      idsJaUsados: new Set(['cB']), // cB já serve a pílula 2
    });

    const r = await repararCoreOrfaoDaSemana(sbComPool(pool), slot, OPTS);

    expect(r.reparados).toBe(1);
    const [e1, e2] = slot.conteudos_dia;
    expect(e1.conteudo.core_id).toBe(esperado.coreContent?.id);
    expect(e1.conteudo.core_id).not.toBe('cB'); // não repete a outra pílula
    // Entrega válida intocada.
    expect(e2.conteudo.core_id).toBe('cB');
    // Topo espelha a SELEÇÃO da 1ª entrega, mas o desafio regerado por IA (topo) sobrevive.
    expect(slot.conteudo.core_id).toBe(e1.conteudo.core_id);
    expect(slot.conteudo.desafio_texto).toBe('DESAFIO NOVO DA IA');
  });

  it('semana de aplicação/avaliação não é tocada', async () => {
    const slot = { semana: 4, tipo: 'aplicacao', missao: { texto: 'm' } };
    const r = await repararCoreOrfaoDaSemana(sbComPool(pool), slot, OPTS);
    expect(r.reparados).toBe(0);
  });
});
