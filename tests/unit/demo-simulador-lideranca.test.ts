import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cenariosLiderancaParaReinserir,
  congelarCenariosLideranca,
  linhasDosCenariosLideranca,
  simuladorLiderancaLigado,
  sysConfigComSimuladorLideranca,
  type CenarioLiderancaCongelado,
} from '@/lib/demo/simulador-lideranca-demo';
import { COMPETENCIAS_LIDERANCA, VARIANTES } from '@/lib/simuladores/lideranca/matriz-global';
import { lerConfigProntidao } from '@/lib/prontidao-lideranca/config';
import { CENARIOS_LIDERANCA_CONGELADOS, DEMO_TENANT_PROFILES } from '@/lib/demo/reset-acme-demo';
import extraArtifacts from '@/lib/demo/acme-demo-extra-artifacts.json';

/**
 * Simulador de liderança nos ambientes de demonstração (17/09/2026).
 *
 * 🔴 O RISCO: o dono ligou o módulo no ACME demo pelo painel e curou os dez
 * cenários ali. O reset noturno reconstrói `sys_config` do fixture e apaga
 * cargos, competências e cenários; sem a preservação, o módulo desligava e a
 * curadoria sumia às 04:00.
 */
const PADRAO = { cargo_alvo: 'Gerente Comercial', escopo: { tipo: 'empresa_inteira' as const }, um_por_dia: true, corte_nota: 3 };

describe('configuração do módulo atravessa o reset', () => {
  it('sem nada no banco, o padrão do perfil liga o módulo', () => {
    const novo = sysConfigComSimuladorLideranca({ modulos: { pulso: true }, programa_modo: 'jornada' }, {}, PADRAO);
    expect(novo.modulos).toEqual({ pulso: true, prontidao_lideranca: true });
    expect(novo.prontidao_lideranca).toEqual(PADRAO);
    expect(novo.programa_modo).toBe('jornada');
    expect(simuladorLiderancaLigado(novo)).toBe(true);
  });

  it('🔴 o que o painel gravou vence o padrão', () => {
    const doPainel = { cargo_alvo: 'Gerente Comercial', escopo: { tipo: 'empresa_inteira' }, um_por_dia: false, corte_nota: 3.5 };
    const novo = sysConfigComSimuladorLideranca({}, { modulos: { prontidao_lideranca: true }, prontidao_lideranca: doPainel }, PADRAO);
    expect(novo.prontidao_lideranca).toEqual(doPainel);
    expect(novo.modulos.prontidao_lideranca).toBe(true);
  });

  it('🔴 módulo desligado pelo painel continua desligado', () => {
    const novo = sysConfigComSimuladorLideranca({}, { modulos: { prontidao_lideranca: false }, prontidao_lideranca: PADRAO }, PADRAO);
    expect(simuladorLiderancaLigado(novo)).toBe(false);
  });

  it('ambiente sem padrão e sem nada no banco fica como estava', () => {
    const base = { modulos: { pulso: true } };
    expect(sysConfigComSimuladorLideranca(base, null, null)).toEqual(base);
  });
});

describe('cenários curados atravessam o reset', () => {
  // A linha-cabeçalho vem DEPOIS de propósito: "pegar a primeira" não pode passar por "preferir o cabeçalho".
  const competencias = [
    { id: 'c-lider-d1', nome: 'Desenvolvimento de Pessoas', cargo: 'Líder', cod_comp: 'LD02', cod_desc: 'LD02-D1' },
    { id: 'c-lider-cab', nome: 'Desenvolvimento de Pessoas', cargo: 'Líder', cod_comp: 'LD02', cod_desc: null },
    { id: 'c-futuro-d1', nome: 'Desenvolvimento de Pessoas', cargo: 'Futuro Líder', cod_comp: 'FL02', cod_desc: 'FL02-D1' },
  ];

  it('o retrato tira as colunas de identidade e fica com o nome da competência', () => {
    const [congelado] = congelarCenariosLideranca(
      [{ id: 'x', empresa_id: 'e', competencia_id: 'c-lider-d1', cargo: 'Líder', created_at: 't', updated_at: 't', titulo: 'Caso', nota_check: 84 }],
      competencias,
    );
    expect(congelado).toEqual({ cargo: 'Líder', competencia: 'Desenvolvimento de Pessoas', cod_comp: 'LD02', conteudo: { titulo: 'Caso', nota_check: 84 } });
  });

  it('cenário apontando para competência de OUTRO cargo ou fora da matriz fica de fora', () => {
    const congelados = congelarCenariosLideranca([
      { id: 'a', competencia_id: 'c-futuro-d1', cargo: 'Líder', titulo: 'cruzado' },
      { id: 'b', competencia_id: 'nao-existe', cargo: 'Líder', titulo: 'órfão' },
    ], competencias);
    expect(congelados).toEqual([]);
  });

  it('a curadoria do banco vence; o fixture só entra com o banco vazio', () => {
    const doBanco = [{ cargo: 'Líder', competencia: 'X', conteudo: { titulo: 'banco' } }];
    const doFixture = [{ cargo: 'Líder', competencia: 'X', conteudo: { titulo: 'fixture' } }];
    expect(cenariosLiderancaParaReinserir(doBanco, doFixture)).toBe(doBanco);
    expect(cenariosLiderancaParaReinserir([], doFixture)).toBe(doFixture);
  });

  it('a linha nova aponta para a linha-cabeçalho da competência, com o tenant e o cargo certos', () => {
    const cenarios: CenarioLiderancaCongelado[] = [
      { cargo: 'Líder', competencia: 'Desenvolvimento de Pessoas', conteudo: { titulo: 'Caso', id: 'velho', empresa_id: 'outro' } },
      { cargo: 'Futuro Líder', competencia: 'Desenvolvimento de Pessoas', conteudo: { titulo: 'Sem cabeçalho' } },
      { cargo: 'Líder', competencia: 'Competência de outra versão', conteudo: { titulo: 'Sumiu' } },
    ];
    const { linhas, semCompetencia } = linhasDosCenariosLideranca(cenarios, competencias, 'empresa-nova');
    const vazios = { ppp_escola_id: null, colaborador_id: null };
    expect(linhas).toEqual([
      { titulo: 'Caso', ...vazios, empresa_id: 'empresa-nova', cargo: 'Líder', competencia_id: 'c-lider-cab' },
      { titulo: 'Sem cabeçalho', ...vazios, empresa_id: 'empresa-nova', cargo: 'Futuro Líder', competencia_id: 'c-futuro-d1' },
    ]);
    expect(semCompetencia).toEqual(['Líder / Competência de outra versão']);
  });

  it('🔴 ids de PPP e de pessoa não atravessam: o reset recria as duas tabelas com ids novos', () => {
    const { linhas } = linhasDosCenariosLideranca(
      [{ cargo: 'Líder', competencia: 'Desenvolvimento de Pessoas', conteudo: { titulo: 'Caso', ppp_escola_id: 'ppp-velho', colaborador_id: 'pessoa-velha' } }],
      competencias,
      'empresa-nova',
    );
    expect(linhas[0]).toMatchObject({ ppp_escola_id: null, colaborador_id: null });
  });
});

describe('fixtures dos ambientes (rede de segurança)', () => {
  it('os dois ambientes que ligaram o módulo pelo painel têm rede de segurança', () => {
    expect(Object.keys(CENARIOS_LIDERANCA_CONGELADOS).sort()).toEqual(['acme-demo', 'escolas-acme']);
  });

  it.each(Object.entries(CENARIOS_LIDERANCA_CONGELADOS))('%s: um cenário por variante e competência da matriz global, com texto', (_slug, cenarios) => {
    const esperado = (Object.values(VARIANTES) as string[]).flatMap((cargo) => COMPETENCIAS_LIDERANCA.map((nome) => `${cargo} / ${nome}`));
    expect(cenarios.map((c) => `${c.cargo} / ${c.competencia}`).sort()).toEqual([...esperado].sort());
    for (const c of cenarios) {
      expect(String(c.conteudo.titulo || '').length, `${c.cargo} / ${c.competencia} sem título`).toBeGreaterThan(5);
      expect(String(c.conteudo.descricao || '').length, `${c.cargo} / ${c.competencia} sem descrição`).toBeGreaterThan(50);
      for (const identidade of ['id', 'empresa_id', 'competencia_id', 'cargo', 'created_at', 'updated_at']) {
        expect(c.conteudo, `${c.cargo} / ${c.competencia} carrega ${identidade}`).not.toHaveProperty(identidade);
      }
    }
  });
});

describe('perfil dos ambientes', () => {
  it('só o ACME demo nasce com o simulador de liderança, e com configuração válida', () => {
    const comSimulador = Object.entries(DEMO_TENANT_PROFILES).filter(([, perfil]) => perfil.simuladorLideranca);
    expect(comSimulador.map(([slug]) => slug)).toEqual(['acme-demo']);
    const cfg = DEMO_TENANT_PROFILES['acme-demo'].simuladorLideranca!;
    expect(lerConfigProntidao({ prontidao_lideranca: cfg })).toEqual(cfg);
  });

  it('o cargo de referência existe no elenco com gabarito (é dele o eixo de estilo)', () => {
    const cfg = DEMO_TENANT_PROFILES['acme-demo'].simuladorLideranca!;
    expect((extraArtifacts.gabaritos as Record<string, unknown>)[cfg.cargo_alvo]).toBeTruthy();
  });
});

describe('ordem das chamadas no reset', () => {
  const fonte = readFileSync(path.resolve(__dirname, '../../lib/demo/reset-acme-demo.ts'), 'utf8');

  it('🔴 lê os cenários ANTES do wipe e recompõe DEPOIS dos cargos', () => {
    const leitura = fonte.indexOf('await lerCenariosLideranca(demo.id)');
    const wipe = fonte.indexOf('await resetTenant(demo.id)');
    const cargos = fonte.indexOf('await insertDemoExtraRoles(demo.id)');
    const recomposicao = fonte.indexOf('await recomporSimuladorLideranca(demo.id, demo.sys_config, cenariosLiderancaDoBanco)');
    expect(Math.min(leitura, wipe, cargos, recomposicao)).toBeGreaterThan(-1);
    expect(leitura).toBeLessThan(wipe);
    expect(cargos).toBeLessThan(recomposicao);
  });

  it('🔴 os retratos do ranking fora do ACME ignoram os cargos-âncora (sem perfil ideal, lançariam no meio do laço)', () => {
    const trecho = fonte.slice(fonte.indexOf("const { data: cargosDoTenant, error: cargosError } = await sb.from('cargos_empresa')"));
    const ateOSeed = trecho.slice(0, trecho.indexOf('seedAcmeFitRankingSnapshots('));
    expect(ateOSeed).toContain('.filter((cargo: any) => !ehCargoAncoraLideranca(cargo.nome))');
  });

  it('🔴 a configuração gravada no banco entra no sys_config da empresa, e o retorno a carrega', () => {
    expect(fonte).toContain("sb.from('empresas').select('id,sys_config').eq('slug', profile.slug)");
    expect(fonte).toContain('sysConfigComSimuladorLideranca(demoSysConfig(source.sys_config || {}), existing?.sys_config, profile.simuladorLideranca)');
    expect(fonte.match(/select\('id,nome,slug,sys_config'\)/g)?.length).toBe(2);
  });
});
