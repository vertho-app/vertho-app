import { describe, expect, it } from 'vitest';
import {
  lerConfigProntidao, validarConfigProntidao, competenciasDoPrograma, ocupaCargoAlvo,
  DEFAULTS_PRONTIDAO, type CargoParaValidacao,
} from '@/lib/prontidao-lideranca/config';
import { COMPETENCIAS_LIDERANCA } from '@/lib/simuladores/lideranca/matriz-global';

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
    expect(lerConfigProntidao({ prontidao_lideranca: { corte_nota: 3 } })).toBeNull();
    expect(lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: '   ' } })).toBeNull();
  });

  it('aplica defaults e normaliza tipos', () => {
    const cfg = lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: ' Gerente Comercial ' } })!;
    expect(cfg.cargo_alvo).toBe('Gerente Comercial');
    expect(cfg.escopo).toEqual({ tipo: 'empresa_inteira' });
    expect(cfg.um_por_dia).toBe(DEFAULTS_PRONTIDAO.um_por_dia);
    expect(cfg.corte_nota).toBe(DEFAULTS_PRONTIDAO.corte_nota);
  });

  it('só aceita um_por_dia === true como ligado e lê escopo por turma', () => {
    const cfg = lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: 'X', um_por_dia: 'sim', escopo: { tipo: 'turma', turmaId: 't1' }, corte_nota: '2.5' } })!;
    expect(cfg.um_por_dia).toBe(false);
    expect(cfg.escopo).toEqual({ tipo: 'turma', turmaId: 't1' });
    expect(cfg.corte_nota).toBe(2.5);
  });

  it('corte gravado à mão fora da escala é GRAMPEADO na leitura', () => {
    expect(lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: 'X', corte_nota: 7 } })!.corte_nota).toBe(4);
    expect(lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: 'X', corte_nota: 0.2 } })!.corte_nota).toBe(1);
  });

  /**
   * `exemplares` e `banda` foram removidos em 14/09/2026, mas o JSONB gravado
   * ainda os tem no tenant que já estava configurado. Ler tem que IGNORAR, não
   * quebrar: a chave é dado no banco e ninguém a migrou.
   */
  it('chaves de versões anteriores no JSONB são ignoradas sem quebrar a leitura', () => {
    const cfg = lerConfigProntidao({
      prontidao_lideranca: { cargo_alvo: 'X', exemplares: ['a', 'b'], banda: 0.33, corte_nota: 3 },
    })!;
    expect(cfg).toEqual({ cargo_alvo: 'X', escopo: { tipo: 'empresa_inteira' }, um_por_dia: true, corte_nota: 3 });
    expect('exemplares' in cfg).toBe(false);
    expect('banda' in cfg).toBe(false);
  });
});

describe('validarConfigProntidao', () => {
  const base = lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: 'Gerente Comercial' } })!;

  it('aprova a configuração canônica (cargo-alvo com gabarito e 5 competências)', () => {
    const v = validarConfigProntidao(base, { cargos, cargosDaPopulacao: ['Vendedor', 'SDR', 'Gerente Comercial'] });
    expect(v).toEqual({ ok: true, erros: [], avisos: [] });
  });

  it('recusa cargo-alvo inexistente ou sem gabarito; Top 5 vazio já NÃO é erro', () => {
    expect(validarConfigProntidao({ ...base, cargo_alvo: 'Diretor' }, { cargos, cargosDaPopulacao: [] }).erros[0]).toMatch(/não existe/);
    expect(validarConfigProntidao({ ...base, cargo_alvo: 'SDR' }, { cargos, cargosDaPopulacao: [] }).erros.join(' ')).toMatch(/gabarito/);
    // O gabarito continua obrigatório (é o eixo de estilo); o Top 5 do cargo-alvo
    // não, porque o que se mede é a matriz global.
    const semTop5 = [{ nome: 'Chefe', temGabarito: true, top5: [] }];
    expect(validarConfigProntidao({ ...base, cargo_alvo: 'Chefe' }, { cargos: semTop5, cargosDaPopulacao: [] }).ok).toBe(true);
  });

  /**
   * `descriptor_assessments` é UNIQUE por NOME de competência. Se um cargo da
   * população tiver no Top 5 uma competência com o mesmo nome de uma da matriz,
   * as duas avaliações se sobrescrevem em silêncio.
   */
  it('recusa colisão de NOME entre a MATRIZ e o Top 5 de um cargo da população', () => {
    const daMatriz = COMPETENCIAS_LIDERANCA[0];
    const comColisao: CargoParaValidacao[] = [
      cargos[0],
      { nome: 'Vendedor', temGabarito: true, top5: ['Prospecção', daMatriz.toUpperCase()] }, // grafia diferente, mesma competência
    ];
    const v = validarConfigProntidao(base, { cargos: comColisao, cargosDaPopulacao: ['Vendedor'] });
    expect(v.ok).toBe(false);
    expect(v.erros[0]).toMatch(/NOME/);
    expect(v.erros[0]).toMatch(/matriz de liderança/);
  });

  it('ignora a colisão quando o cargo não está na população', () => {
    const comColisao: CargoParaValidacao[] = [cargos[0], { nome: 'Analista', temGabarito: true, top5: [COMPETENCIAS_LIDERANCA[0]] }];
    expect(validarConfigProntidao(base, { cargos: comColisao, cargosDaPopulacao: ['Vendedor'] }).ok).toBe(true);
  });

  it('recusa corte fora da escala e turma sem id', () => {
    expect(validarConfigProntidao({ ...base, corte_nota: 4.5 }, { cargos, cargosDaPopulacao: [] }).erros.join(' ')).toMatch(/corte_nota/);
    expect(validarConfigProntidao({ ...base, escopo: { tipo: 'turma', turmaId: '' } }, { cargos, cargosDaPopulacao: [] }).erros.join(' ')).toMatch(/turmaId/);
  });

  it('o tamanho do Top 5 do cargo-alvo deixou de gerar aviso', () => {
    const v = validarConfigProntidao({ ...base, cargo_alvo: 'Vendedor' }, { cargos, cargosDaPopulacao: [] });
    expect(v).toEqual({ ok: true, erros: [], avisos: [] });
  });
});

describe('competenciasDoPrograma / ocupaCargoAlvo', () => {
  const cfg = lerConfigProntidao({ prontidao_lideranca: { cargo_alvo: 'gerente comercial' } })!;
  /** O instrumento é o mesmo em todo tenant: não depende do cargo nem da empresa. */
  it('devolve a matriz global, seja qual for o cargo-alvo', () => {
    expect(competenciasDoPrograma(cfg, cargos)).toEqual([...COMPETENCIAS_LIDERANCA]);
    expect(competenciasDoPrograma({ ...cfg, cargo_alvo: 'Ninguem' }, cargos)).toEqual([...COMPETENCIAS_LIDERANCA]);
    expect(competenciasDoPrograma()).toEqual([...COMPETENCIAS_LIDERANCA]);
  });
  it('quem ocupa o cargo-alvo responde pelo trilho do cargo', () => {
    expect(ocupaCargoAlvo('Gerente Comercial', cfg)).toBe(true);
    expect(ocupaCargoAlvo('Vendedor', cfg)).toBe(false);
    expect(ocupaCargoAlvo(null, cfg)).toBe(false);
  });
});
