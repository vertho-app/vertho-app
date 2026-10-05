/**
 * Exemplo de cenário POR PROPOSTA: formato gravado, validação e rótulos
 * (`lib/sales/cenario-exemplo.ts`, mig 277).
 *
 * O que justifica estes testes:
 *
 *  1. 🔴 É TEXTO QUE O CLIENTE LÊ, vindo de um jsonb que a tela edita. A validação é
 *     allowlist com limite de tamanho: nada que não esteja na lista passa, e `origem`
 *     (nota e modelos, internos) NUNCA chega ao documento.
 *  2. Um exemplo pela metade não vira texto de cliente: cai no padrão do segmento.
 *  3. A lista de competências da tela é CÓPIA da matriz global (a tela é 'use client' e
 *     não importa o JSON da matriz): o teste de paridade impede a deriva.
 */
import { describe, expect, it } from 'vitest';
import {
  COMPETENCIAS_DO_EXEMPLO,
  COMPETENCIA_PADRAO_DO_EXEMPLO,
  LIMITES_EXEMPLO,
  ROTULO_MAX_NO_PDF,
  cenarioDoExemplo,
  fechamentoDoExemplo,
  normalizarExemploGravado,
  rotuloCurtoValido,
  rotuloDoBloco,
  rotuloPeloDescritor,
  validarEntradaGeracao,
} from '@/lib/sales/cenario-exemplo';
import { COMPETENCIAS_LIDERANCA } from '@/lib/simuladores/lideranca/matriz-global';

const EXEMPLO = {
  rotulo: 'Cenário · Gerente de loja',
  situacao: 'Sexta, 18h30, horário de pico. Rafael cobriu o turno e deixou a sala sem instrutor por 15 minutos.',
  perguntas: [
    { nome: 'Abertura', pergunta: 'Como você abre a conversa com Rafael?' },
    { nome: 'Divergência', pergunta: 'Rafael responde que perdia matrícula. O que você diz?' },
    { nome: 'Acordo', pergunta: 'O que você combina com ele para manter a sala coberta?' },
    { nome: 'Continuidade', pergunta: 'Como você acompanha o combinado nas próximas duas semanas?' },
  ],
  origem: {
    cargo: 'Gerente de loja', segmento: 'rede de academias', competencia: 'Comunicação e Conversas de Liderança',
    nota: 93, status: 'aprovado', gerador: 'claude-sonnet-5-5', auditor: 'gpt-5.6-terra',
    geradoEm: '2026-10-05T14:00:00.000Z', comFicha: false, editado: false,
  },
};
const clone = () => JSON.parse(JSON.stringify(EXEMPLO));

describe('normalizarExemploGravado', () => {
  it('aceita o formato completo e devolve o que entrou', () => {
    expect(normalizarExemploGravado(EXEMPLO)).toEqual(EXEMPLO);
  });

  it('aparam espaços e descarta caractere de controle (o texto vai para PDF e HTML)', () => {
    const e = clone();
    e.situacao = '  Texto\u0000 com\u0007 controle  ';
    e.perguntas[0].nome = '  Abertura ';
    const r = normalizarExemploGravado(e)!;
    expect(r.situacao).toBe('Texto com controle');
    expect(r.perguntas[0].nome).toBe('Abertura');
  });

  it('é ALLOWLIST: campo desconhecido não passa, em nenhum nível', () => {
    const e: any = clone();
    e.campoExtra = 'x';
    e.perguntas[1].html = '<script>alert(1)</script>';
    e.origem.segredo = 'margem 58%';
    const r: any = normalizarExemploGravado(e)!;
    expect(r).not.toHaveProperty('campoExtra');
    expect(r.perguntas[1]).toEqual({ nome: 'Divergência', pergunta: 'Rafael responde que perdia matrícula. O que você diz?' });
    expect(r.origem).not.toHaveProperty('segredo');
    expect(JSON.stringify(r)).not.toMatch(/script|margem 58/);
  });

  it('só aceita OBJETO: nulo, texto, lista e número voltam null', () => {
    for (const lixo of [null, undefined, 'texto', 42, [], [EXEMPLO], true]) {
      expect(normalizarExemploGravado(lixo), String(lixo)).toBeNull();
    }
  });

  it('exige exatamente 4 perguntas', () => {
    for (const n of [0, 1, 3, 5]) {
      const e = clone();
      e.perguntas = Array.from({ length: n }, (_, i) => ({ nome: `P${i}`, pergunta: 'Texto?' }));
      expect(normalizarExemploGravado(e), `${n} perguntas`).toBeNull();
    }
  });

  it('um campo obrigatório vazio, ausente ou fora do tipo derruba o exemplo inteiro', () => {
    const quebras: Array<(e: any) => void> = [
      (e) => { e.rotulo = ''; },
      (e) => { e.rotulo = '   '; },
      (e) => { delete e.situacao; },
      (e) => { e.situacao = 123; },
      (e) => { e.perguntas[2].pergunta = ''; },
      (e) => { e.perguntas[3].nome = null; },
      (e) => { e.perguntas[0] = 'texto'; },
      (e) => { e.perguntas = 'quatro'; },
    ];
    for (const quebra of quebras) {
      const e = clone();
      quebra(e);
      expect(normalizarExemploGravado(e), quebra.toString()).toBeNull();
    }
  });

  it('respeita os limites de tamanho de cada campo (um a mais derruba)', () => {
    const casos: Array<[string, (e: any, n: number) => void, number]> = [
      ['rotulo', (e, n) => { e.rotulo = 'x'.repeat(n); }, LIMITES_EXEMPLO.rotulo],
      ['situacao', (e, n) => { e.situacao = 'x'.repeat(n); }, LIMITES_EXEMPLO.situacao],
      ['nome da pergunta', (e, n) => { e.perguntas[0].nome = 'x'.repeat(n); }, LIMITES_EXEMPLO.nomePergunta],
      ['pergunta', (e, n) => { e.perguntas[0].pergunta = 'x'.repeat(n); }, LIMITES_EXEMPLO.pergunta],
    ];
    for (const [campo, aplicar, limite] of casos) {
      const noLimite = clone(); aplicar(noLimite, limite);
      expect(normalizarExemploGravado(noLimite), `${campo} no limite`).not.toBeNull();
      const acima = clone(); aplicar(acima, limite + 1);
      expect(normalizarExemploGravado(acima), `${campo} acima do limite`).toBeNull();
    }
  });

  it('origem é opcional e inválida vira null sem derrubar o exemplo', () => {
    for (const origem of [undefined, null, 'x', [], { nota: 90 }, { cargo: '' }]) {
      const e: any = clone();
      e.origem = origem;
      const r = normalizarExemploGravado(e);
      expect(r, String(JSON.stringify(origem))).not.toBeNull();
      expect(r!.origem).toBeNull();
    }
  });

  it('a nota é limitada a 0..100 e arredondada; lixo vira null', () => {
    const com = (nota: unknown) => normalizarExemploGravado({ ...clone(), origem: { ...EXEMPLO.origem, nota } })!.origem!.nota;
    expect(com(93.6)).toBe(94);
    expect(com(250)).toBe(100);
    expect(com(-4)).toBe(0);
    expect(com('93')).toBeNull();
    expect(com(NaN)).toBeNull();
  });

  it('"editado" e "comFicha" só valem com true literal (texto "true" não conta)', () => {
    const r = normalizarExemploGravado({ ...clone(), origem: { ...EXEMPLO.origem, editado: 'true', comFicha: 1 } })!.origem!;
    expect(r.editado).toBe(false);
    expect(r.comFicha).toBe(false);
  });
});

describe('cenarioDoExemplo (o que o DOCUMENTO usa)', () => {
  it('vira um ProposalCenario sem NENHUM metadado de origem', () => {
    const c: any = cenarioDoExemplo(EXEMPLO, 'corporativo')!;
    expect(Object.keys(c).sort()).toEqual(['fechamento', 'perguntas', 'rotulo', 'situacao']);
    const serializado = JSON.stringify(c);
    for (const interno of ['93', 'gpt-5.6-terra', 'claude-sonnet', 'origem', 'nota', 'auditor', 'gerador']) {
      expect(serializado, interno).not.toContain(interno);
    }
  });

  it('o fecho é da casa e segue o segmento: "empresa" não serve a uma escola', () => {
    expect(cenarioDoExemplo(EXEMPLO, 'corporativo')!.fechamento).toContain('do contexto da empresa');
    expect(cenarioDoExemplo(EXEMPLO, 'educacao')!.fechamento).toContain('do contexto da instituição');
    for (const seg of ['corporativo', 'educacao'] as const) {
      expect(fechamentoDoExemplo(seg)).toMatch(/este caso é só um exemplo/);
      expect(fechamentoDoExemplo(seg)).not.toMatch(/[–—]/);
    }
  });

  it('exemplo inválido ou ausente devolve null: o chamador cai no padrão', () => {
    expect(cenarioDoExemplo(null, 'corporativo')).toBeNull();
    expect(cenarioDoExemplo({ ...clone(), perguntas: [] }, 'corporativo')).toBeNull();
  });
});

describe('rótulos', () => {
  it('o rótulo do bloco cabe na coluna do PDF (33) ou cai em "Cenário de exemplo"', () => {
    expect(rotuloDoBloco('Gerente de loja')).toBe('Cenário · Gerente de loja');
    expect(rotuloDoBloco('  Gerente   de  loja ')).toBe('Cenário · Gerente de loja');
    for (const cargo of ['Gerente de operações regionais', 'Coordenador de relacionamento com o cliente', 'x'.repeat(60)]) {
      const r = rotuloDoBloco(cargo);
      expect(r.length, cargo).toBeLessThanOrEqual(ROTULO_MAX_NO_PDF);
      expect(r).toBe('Cenário de exemplo');
    }
    expect(rotuloDoBloco('')).toBe('Cenário de exemplo');
  });

  it('rótulo curto do modelo: 1 a 3 palavras, até 16 caracteres, sem pontuação de frase', () => {
    expect(rotuloCurtoValido('abertura')).toBe('Abertura');
    expect(rotuloCurtoValido('  Divergência. ')).toBe('Divergência');
    expect(rotuloCurtoValido('Tensão humana')).toBe('Tensão humana');
    expect(rotuloCurtoValido('"Acordo"')).toBe('Acordo');
    // 16 caracteres passam; 17 não. "Gestão de divergência" (21) é frase, não rótulo.
    expect(rotuloCurtoValido('abcdefghijklmnop')).toBe('Abcdefghijklmnop');
    for (const ruim of ['', '   ', 'Uma frase longa demais para ser rótulo', 'Gestão de divergência', 'abcdefghijklmnopq', 'a b c d', 42, null, undefined]) {
      expect(rotuloCurtoValido(ruim), String(ruim)).toBeNull();
    }
  });

  it('sem rótulo do modelo, usa o descritor que a pergunta cobre: o último ainda livre', () => {
    const nomes = ['Preparação e propósito', 'Clareza e foco', 'Escuta e entendimento', 'Acordos verificáveis', 'Gestão de divergências', 'Continuidade dos acordos'];
    const usados = new Set<string>();
    const dos = [[1, 2], [2, 3, 5], [3, 4, 5], [4, 6]];
    expect(dos.map((d, i) => rotuloPeloDescritor(i, d, nomes, usados))).toEqual([
      'Clareza e foco', 'Gestão de divergências', 'Acordos verificáveis', 'Continuidade dos acordos',
    ]);
    expect(usados.size).toBe(4);
  });

  it('sem descritor livre ou sem lista, "Pergunta N"; nome comprido é cortado no limite', () => {
    const usados = new Set<string>();
    expect(rotuloPeloDescritor(0, undefined, ['A'], usados)).toBe('Pergunta 1');
    expect(rotuloPeloDescritor(1, [], ['A'], usados)).toBe('Pergunta 2');
    expect(rotuloPeloDescritor(2, [9], ['A'], usados)).toBe('Pergunta 3');
    const longo = rotuloPeloDescritor(0, [1], ['x'.repeat(80)], new Set());
    expect(longo.length).toBeLessThanOrEqual(LIMITES_EXEMPLO.nomePergunta);
  });
});

describe('validarEntradaGeracao', () => {
  it('o mínimo é o cargo; os demais têm padrão', () => {
    const r = validarEntradaGeracao({ cargo: ' Gerente de loja ' });
    expect(r.ok).toBe(true);
    expect(r.valor).toEqual({
      cargo: 'Gerente de loja', segmento: null, ficha: null,
      competencia: COMPETENCIA_PADRAO_DO_EXEMPLO, feedback: null,
    });
  });

  it('recusa cargo ausente, curto demais ou longo demais', () => {
    for (const cargo of [undefined, '', ' ', 'a', 'x'.repeat(LIMITES_EXEMPLO.cargo + 1), 42]) {
      expect(validarEntradaGeracao({ cargo }).ok, String(cargo)).toBe(false);
    }
    expect(validarEntradaGeracao(null).ok).toBe(false);
  });

  it('recusa segmento e ficha acima do limite, e competência fora da matriz', () => {
    expect(validarEntradaGeracao({ cargo: 'Gerente', segmento: 'x'.repeat(LIMITES_EXEMPLO.segmento + 1) }).ok).toBe(false);
    expect(validarEntradaGeracao({ cargo: 'Gerente', ficha: 'x'.repeat(LIMITES_EXEMPLO.ficha + 1) }).ok).toBe(false);
    expect(validarEntradaGeracao({ cargo: 'Gerente', competencia: 'Competência inventada' }).ok).toBe(false);
  });

  it('o feedback é cortado em vez de recusado, e sem caractere de controle', () => {
    const r = validarEntradaGeracao({ cargo: 'Gerente', feedback: `ajuste\u0000 isto ${'x'.repeat(5000)}` });
    expect(r.ok).toBe(true);
    expect(r.valor!.feedback!.length).toBe(2500);
    expect(r.valor!.feedback).not.toContain('\u0000');
  });

  it('aceita as cinco competências da matriz', () => {
    for (const competencia of COMPETENCIAS_DO_EXEMPLO) {
      expect(validarEntradaGeracao({ cargo: 'Gerente', competencia }).ok, competencia).toBe(true);
    }
  });
});

describe('paridade com a matriz global de liderança', () => {
  it('a lista da tela é a da matriz, na mesma ordem (a tela não importa o JSON)', () => {
    expect([...COMPETENCIAS_DO_EXEMPLO]).toEqual([...COMPETENCIAS_LIDERANCA]);
  });

  it('a competência padrão existe na matriz', () => {
    expect([...COMPETENCIAS_LIDERANCA]).toContain(COMPETENCIA_PADRAO_DO_EXEMPLO);
  });
});
