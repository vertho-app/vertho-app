import { describe, it, expect } from 'vitest';
import {
  checarFormatoPrometido, checarCoberturaKit, checarDesafioPlaceholder,
  checarContatos, checarCoreAusente, checarCanalZerado, checarEntregaIncompleta,
  regrasPreflight, type EntregaPrevista, type EnvioObservado,
} from '@/lib/pipeline-health/regras';
import { severidadeGlobal, achado } from '@/lib/pipeline-health/types';

/**
 * Cada regra aqui nasceu de uma falha REAL de produção. O teste guarda a invariante
 * nos DOIS sentidos: dispara quando o problema existe E fica calado quando não existe
 * — um check que sempre acusa vira ruído e é desligado; um que nunca acusa é enfeite.
 */

const base: EntregaPrevista = {
  colaboradorId: 'c1', nome: 'Fulana', cargo: 'Gestão Escolar', disc: 'S',
  semana: 3, pilula: 1, descritor: 'Gestão de riscos',
  temKit: true, formatoAnunciado: 'texto', formatosDisponiveis: ['texto', 'audio', 'case'],
  coreId: 'mc1', desafioPlaceholder: false, telefoneValido: true, temEmail: true,
};
const com = (over: Partial<EntregaPrevista>): EntregaPrevista => ({ ...base, ...over });

describe('R1 · pílula promete formato que não existe', () => {
  it('acusa quando o formato anunciado não está entre os disponíveis', () => {
    // Caso real 27/07: 17 entregas anunciavam vídeo numa semana sem vídeo.
    const a = checarFormatoPrometido([com({ formatoAnunciado: 'video', formatosDisponiveis: ['texto', 'audio'] })]);
    expect(a?.id).toBe('formato-prometido-ausente');
    expect(a?.severidade).toBe('critico');
    expect(a?.contagem).toBe(1);
  });

  it('fica calado quando o formato prometido existe', () => {
    expect(checarFormatoPrometido([com({ formatoAnunciado: 'video', formatosDisponiveis: ['texto', 'video'] })])).toBeNull();
  });

  it('conta só as entregas quebradas, não a coorte inteira', () => {
    const a = checarFormatoPrometido([
      com({ formatoAnunciado: 'video', formatosDisponiveis: ['texto'] }),
      com({ nome: 'Beltrana', formatoAnunciado: 'texto', formatosDisponiveis: ['texto'] }),
    ]);
    expect(a?.contagem).toBe(1);
    expect(a?.amostra?.[0]).toContain('Fulana');
  });

  it('semana sem formato NENHUM também é promessa quebrada', () => {
    expect(checarFormatoPrometido([com({ formatosDisponiveis: [] })])?.contagem).toBe(1);
  });
});

describe('R2/R3 · kit ausente vs kit presente com desafio placeholder', () => {
  it('sem kit → cobertura acusa, placeholder NÃO (a causa é outra)', () => {
    const e = [com({ temKit: false, desafioPlaceholder: true })];
    expect(checarCoberturaKit(e)?.contagem).toBe(1);
    expect(checarDesafioPlaceholder(e)).toBeNull();
  });

  it('com kit e placeholder → é overlay não aplicado (F-C4), severidade crítica', () => {
    const e = [com({ temKit: true, desafioPlaceholder: true })];
    expect(checarCoberturaKit(e)).toBeNull();
    const a = checarDesafioPlaceholder(e);
    expect(a?.severidade).toBe('critico');
    expect(a?.id).toBe('desafio-placeholder-com-kit');
  });

  it('tudo certo → os dois calados', () => {
    expect(checarCoberturaKit([base])).toBeNull();
    expect(checarDesafioPlaceholder([base])).toBeNull();
  });
});

describe('R4 · contatos', () => {
  it('sem telefone válido e sem e-mail → crítico', () => {
    const as = checarContatos([com({ telefoneValido: false, temEmail: false })]);
    const critico = as.find((a) => a.id === 'sem-canal-nenhum');
    expect(critico?.severidade).toBe('critico');
  });

  it('telefone inválido mas com e-mail → aviso (recebe, mas só por um canal)', () => {
    // Caso real: DDI 597 (Suriname) em vez de 55 — 3 falhas no provedor e carimbo gravado.
    const as = checarContatos([com({ telefoneValido: false, temEmail: true })]);
    expect(as.find((a) => a.id === 'telefone-invalido')?.severidade).toBe('aviso');
    expect(as.find((a) => a.id === 'sem-canal-nenhum')).toBeUndefined();
  });

  it('conta PESSOAS, não entregas — quem tem 2 pílulas não conta em dobro', () => {
    const as = checarContatos([
      com({ pilula: 1, telefoneValido: false, temEmail: true }),
      com({ pilula: 2, telefoneValido: false, temEmail: true }),
    ]);
    expect(as.find((a) => a.id === 'telefone-invalido')?.contagem).toBe(1);
  });

  it('contatos ok → nenhum achado', () => {
    expect(checarContatos([base])).toHaveLength(0);
  });
});

describe('R5 · semana sem conteúdo resolvível', () => {
  it('sem core e sem formatos → crítico', () => {
    expect(checarCoreAusente([com({ coreId: null, formatosDisponiveis: [] })])?.severidade).toBe('critico');
  });
  it('sem core mas COM formatos → não é ausência (o overlay resolveu)', () => {
    expect(checarCoreAusente([com({ coreId: null, formatosDisponiveis: ['texto'] })])).toBeNull();
  });
});

describe('R6/R7 · pós-voo', () => {
  const envio = (over: Partial<EnvioObservado>): EnvioObservado => ({
    colaboradorId: 'c1', nome: 'Fulana', temTelefone: true, temEmail: true,
    carimboWhatsapp: '2026-07-27T11:00:00Z', carimboEmail: '2026-07-27T11:00:00Z', ...over,
  });

  it('canal inteiro zerado → crítico (caso real 20/07: 36 carimbos, 0 WhatsApp)', () => {
    const envios = [1, 2, 3, 4].map((i) => envio({ colaboradorId: `c${i}`, carimboWhatsapp: null }));
    expect(checarCanalZerado(envios).find((a) => a.id === 'canal-whatsapp-zerado')?.severidade).toBe('critico');
  });

  it('não acusa canal zerado com amostra pequena (1-2 pessoas não provam provedor fora)', () => {
    expect(checarCanalZerado([envio({ carimboWhatsapp: null })])).toHaveLength(0);
  });

  it('canal parcialmente entregue não é "zerado" — é falha individual', () => {
    const envios = [envio({ colaboradorId: 'a' }), envio({ colaboradorId: 'b', carimboWhatsapp: null }), envio({ colaboradorId: 'c' })];
    expect(checarCanalZerado(envios).find((a) => a.id === 'canal-whatsapp-zerado')).toBeUndefined();
  });

  it('pessoa sem carimbo em canal nenhum → crítico', () => {
    const a = checarEntregaIncompleta([envio({ carimboWhatsapp: null, carimboEmail: null })]);
    expect(a?.severidade).toBe('critico');
    expect(a?.amostra).toContain('Fulana');
  });

  it('quem não tem contato nenhum não conta como entrega falha', () => {
    expect(checarEntregaIncompleta([envio({ temTelefone: false, temEmail: false, carimboWhatsapp: null, carimboEmail: null })])).toBeNull();
  });
});

describe('agregação', () => {
  it('severidade global = pior achado', () => {
    expect(severidadeGlobal([])).toBe('ok');
    expect(severidadeGlobal([achado('x', 'aviso', 't', 1, 'd')!])).toBe('aviso');
    expect(severidadeGlobal([achado('x', 'aviso', 't', 1, 'd')!, achado('y', 'critico', 't', 1, 'd')!])).toBe('critico');
  });

  it('contagem 0 nunca vira achado (não gerar ruído)', () => {
    expect(achado('x', 'critico', 't', 0, 'd')).toBeNull();
  });

  it('coorte saudável não gera achado nenhum no pré-voo', () => {
    expect(regrasPreflight([base, com({ colaboradorId: 'c2', nome: 'Beltrana' })])).toEqual([]);
  });

  it('coorte com os 3 problemas de 27/07 gera os 3 achados', () => {
    const achados = regrasPreflight([
      com({ formatoAnunciado: 'video', formatosDisponiveis: ['texto'] }),
      com({ colaboradorId: 'c2', nome: 'B', temKit: false }),
      com({ colaboradorId: 'c3', nome: 'C', telefoneValido: false, temEmail: true }),
    ]);
    const ids = achados.map((a) => a.id).sort();
    expect(ids).toContain('formato-prometido-ausente');
    expect(ids).toContain('entrega-sem-kit');
    expect(ids).toContain('telefone-invalido');
  });
});
