import { describe, expect, it } from 'vitest';
import {
  lerConfigProntidao, validarConfigProntidao, competenciasDoPrograma, ocupaCargoAlvo,
  DEFAULTS_PRONTIDAO, type CargoParaValidacao,
} from '@/lib/prontidao-lideranca/config';

const LID5 = ['Priorização e uso do tempo', 'Gestão por dados', 'Desenvolvimento de pessoas', 'Conversa difícil', 'Delegação e span'];
const cargos: CargoParaValidacao[] = [
  { nome: 'Gerente Comercial', temGabarito: true, top5: LID5 },
  { nome: 'Vendedor', temGabarito: true, top5: ['Prospecção', 'Negociação'] },
  { nome: 'SDR', temGabarito: false, top5: ['Cadência'] },
];

describe('lerConfigProntidao', () => {
  it('devolve null quando a chave não existe ou não tem cargo-alvo', () => {
    expect(lerConfigProntidao(null)).toBeNull();
    expect(lerConfigProntidao({})).toBeNull();
    expect(lerConfigProntidao({ prontidao_lideranca: { exemplares: ['x'] } })).toBeNull();
    expect(lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: '   ' } })).toBeNull();
  });

  it('aplica defaults e normaliza tipos', () => {
    const cfg = lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: ' Gerente Comercial ', exemplares: ['a', 'a', ' b ', 3, null] } })!;
    expect(cfg.cargo_alvo).toBe('Gerente Comercial');
    expect(cfg.exemplares).toEqual(['a', 'b', '3']);
    expect(cfg.escopo).toEqual({ tipo: 'empresa_inteira' });
    expect(cfg.um_por_dia).toBe(DEFAULTS_PRONTIDAO.um_por_dia);
    expect(cfg.corte_nota).toBe(DEFAULTS_PRONTIDAO.corte_nota);
    expect(cfg.banda).toBe(DEFAULTS_PRONTIDAO.banda);
  });

  it('só aceita um_por_dia === true como ligado e lê escopo por turma', () => {
    const cfg = lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: 'X', um_por_dia: 'sim', escopo: { tipo: 'turma', turmaId: 't1' }, corte_nota: '2.5', banda: 'abc' } })!;
    expect(cfg.um_por_dia).toBe(false);
    expect(cfg.escopo).toEqual({ tipo: 'turma', turmaId: 't1' });
    expect(cfg.corte_nota).toBe(2.5);
    expect(cfg.banda).toBe(DEFAULTS_PRONTIDAO.banda);
  });

  it('corte e banda gravados à mão fora da escala são GRAMPEADOS na leitura', () => {
    const cfg = lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: 'X', corte_nota: 7, banda: -0.5 } })!;
    expect(cfg.corte_nota).toBe(4);
    expect(cfg.banda).toBe(0);
    expect(lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: 'X', corte_nota: 0.2, banda: 3 } })).toMatchObject({ corte_nota: 1, banda: 1 });
  });
});

describe('validarConfigProntidao', () => {
  const base = lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: 'Gerente Comercial', exemplares: ['e1', 'e2', 'e3'] } })!;

  it('aprova a configuração canônica (5 competências, 3 exemplares)', () => {
    const v = validarConfigProntidao(base, { cargos, cargosDaPopulacao: ['Vendedor', 'SDR', 'Gerente Comercial'] });
    expect(v).toEqual({ ok: true, erros: [], avisos: [] });
  });

  it('recusa cargo-alvo inexistente, sem gabarito ou sem Top 5', () => {
    expect(validarConfigProntidao({ ...base, cargo_alvo: 'Diretor' }, { cargos, cargosDaPopulacao: [] }).erros[0]).toMatch(/não existe/);
    expect(validarConfigProntidao({ ...base, cargo_alvo: 'SDR' }, { cargos, cargosDaPopulacao: [] }).erros.join(' ')).toMatch(/gabarito/);
    const semTop5 = [{ nome: 'Chefe', temGabarito: true, top5: [] }];
    expect(validarConfigProntidao({ ...base, cargo_alvo: 'Chefe' }, { cargos: semTop5, cargosDaPopulacao: [] }).erros.join(' ')).toMatch(/Top 5/);
  });

  it('recusa colisão de NOME entre o Top 5 do cargo-alvo e o de um cargo da população', () => {
    const comColisao: CargoParaValidacao[] = [
      cargos[0],
      { nome: 'Vendedor', temGabarito: true, top5: ['Prospecção', 'gestão por DADOS'] }, // mesma competência, grafia diferente
    ];
    const v = validarConfigProntidao(base, { cargos: comColisao, cargosDaPopulacao: ['Vendedor'] });
    expect(v.ok).toBe(false);
    expect(v.erros[0]).toMatch(/gestão por DADOS/);
    expect(v.erros[0]).toMatch(/NOME/);
  });

  it('ignora a colisão quando o cargo não está na população', () => {
    const comColisao: CargoParaValidacao[] = [cargos[0], { nome: 'Analista', temGabarito: true, top5: ['Gestão por dados'] }];
    expect(validarConfigProntidao(base, { cargos: comColisao, cargosDaPopulacao: ['Vendedor'] }).ok).toBe(true);
  });

  it('exemplares fora da faixa 3–5 é aviso; exemplar de outro tenant é erro', () => {
    const v1 = validarConfigProntidao({ ...base, exemplares: ['e1'] }, { cargos, cargosDaPopulacao: [] });
    expect(v1.ok).toBe(true);
    expect(v1.avisos[0]).toMatch(/3 a 5/);
    const v2 = validarConfigProntidao(base, { cargos, cargosDaPopulacao: [], colaboradorIdsDoTenant: new Set(['e1', 'e2']) });
    expect(v2.ok).toBe(false);
    expect(v2.erros[0]).toMatch(/1 exemplar/);
  });

  /**
   * A régua que fecha o círculo: quem NÃO ocupa o cargo-alvo é candidato — ele
   * responde o trilho de liderança e é medido pela mesma rubrica que estaria
   * calibrando. A calibragem não tem como acusar isso sozinha (sai coerente por
   * construção), então a recusa é aqui.
   */
  it('exemplar que não ocupa o cargo-alvo é ERRO, com nome e cargo na mensagem', () => {
    const pessoas = [
      { id: 'e1', nome: 'Gil', cargo: 'Gerente Comercial' },
      { id: 'e2', nome: 'Ana', cargo: 'Vendedor' },
      { id: 'e3', nome: 'Rui', cargo: '  gerente COMERCIAL ' },
    ];
    const v = validarConfigProntidao(base, { cargos, cargosDaPopulacao: ['Vendedor'], pessoasDoTenant: pessoas });
    expect(v.ok).toBe(false);
    // Rui passa: a comparação é normalizada (caixa/acento), como no resto do módulo.
    expect(v.erros.join(' ')).toMatch(/Ana — Vendedor/);
    expect(v.erros.join(' ')).not.toMatch(/Gil|Rui/);

    const soOcupantes = pessoas.map((p) => ({ ...p, cargo: 'Gerente Comercial' }));
    expect(validarConfigProntidao(base, { cargos, cargosDaPopulacao: ['Vendedor'], pessoasDoTenant: soOcupantes }).ok).toBe(true);
  });

  it('pessoasDoTenant também responde pelo pertencimento (substitui colaboradorIdsDoTenant)', () => {
    const v = validarConfigProntidao(base, {
      cargos, cargosDaPopulacao: [],
      pessoasDoTenant: [{ id: 'e1', nome: 'Gil', cargo: 'Gerente Comercial' }],
    });
    expect(v.ok).toBe(false);
    expect(v.erros.join(' ')).toMatch(/2 exemplar\(es\) não pertence/);
  });

  it('recusa corte/banda fora da escala e turma sem id', () => {
    expect(validarConfigProntidao({ ...base, corte_nota: 4.5 }, { cargos, cargosDaPopulacao: [] }).erros.join(' ')).toMatch(/corte_nota/);
    expect(validarConfigProntidao({ ...base, banda: -0.1 }, { cargos, cargosDaPopulacao: [] }).erros.join(' ')).toMatch(/banda/);
    expect(validarConfigProntidao({ ...base, escopo: { tipo: 'turma', turmaId: '' } }, { cargos, cargosDaPopulacao: [] }).erros.join(' ')).toMatch(/turmaId/);
  });

  it('Top 5 com número diferente de 5 é aviso, não erro', () => {
    const v = validarConfigProntidao({ ...base, cargo_alvo: 'Vendedor' }, { cargos, cargosDaPopulacao: [] });
    expect(v.ok).toBe(true);
    expect(v.avisos.join(' ')).toMatch(/prevê 5/);
  });
});

describe('competenciasDoPrograma / ocupaCargoAlvo', () => {
  const cfg = lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: 'gerente comercial' } })!;
  it('resolve o Top 5 do cargo-alvo por nome normalizado', () => {
    expect(competenciasDoPrograma(cfg, cargos)).toEqual(LID5);
    expect(competenciasDoPrograma({ ...cfg, cargo_alvo: 'Ninguém' }, cargos)).toEqual([]);
  });
  it('quem ocupa o cargo-alvo responde pelo trilho do cargo', () => {
    expect(ocupaCargoAlvo('Gerente Comercial', cfg)).toBe(true);
    expect(ocupaCargoAlvo('Vendedor', cfg)).toBe(false);
    expect(ocupaCargoAlvo(null, cfg)).toBe(false);
  });
});
