import { describe, it, expect } from 'vitest';
import { mesclarSoTexto, adotarCorrecao } from '@/lib/ia4-correcao-texto';

/**
 * Correção de TEXTO da avaliação da IA4 (decisão do dono, 16/10/2026: "corrigir só o texto apontado"). A nota, o nível
 * e a consolidação NÃO podem mudar: mudariam a competência escolhida para a pessoa, que já decidiu blueprint, PDI e
 * trilha. Da correção só entra texto; e ela só é adotada se o check melhorar.
 */
const original = () => ({
  avaliacao_por_descritor: [
    { numero: 1, nome: 'Constância', nota_decimal: 1.5, nivel_sugerido: 1, confianca: 0.8, evidencias: ['R3: lubrificação semanal'], racional: 'texto antigo' },
    { numero: 2, nome: 'Cuidado', nota_decimal: 2.33, nivel_sugerido: 2, confianca: 0.7, evidencias: ['R1: trecho'], racional: 'ok' },
  ],
  consolidacao: { nivel_geral: 1, media_descritores: 1.92, travas_aplicadas: ['trava A'] },
  feedback: { resumo_geral: 'resumo antigo', mensagem_positiva: 'cita Diego', recomendacoes: ['ação 1', 'ação 2'] },
  recomendacoes_pdi: { barreiras_provaveis: ['tendência a X', 'falta de Y'], acoes: [{ descritor: 'Constância', acao: 'antiga', prazo_dias: 30 }] },
  nivel_texto: 'N1',
});

describe('mesclarSoTexto: números e estrutura da original, texto da correção', () => {
  it('a correção que tenta mudar nota, nível, confiança e consolidação não muda nada disso', () => {
    const c = original();
    c.avaliacao_por_descritor[0].nota_decimal = 3.5;
    c.avaliacao_por_descritor[0].nivel_sugerido = 3;
    c.avaliacao_por_descritor[1].confianca = 0.1;
    (c as any).consolidacao = { nivel_geral: 3, media_descritores: 3.4, travas_aplicadas: [] };
    (c as any).nivel_texto = 'N3';
    const m = mesclarSoTexto(original(), c);
    expect(m.avaliacao_por_descritor.map((d: any) => [d.nota_decimal, d.nivel_sugerido, d.confianca])).toEqual([[1.5, 1, 0.8], [2.33, 2, 0.7]]);
    expect(m.consolidacao).toEqual(original().consolidacao);
    expect(m.nivel_texto).toBe('N1');
  });

  it('o texto corrigido entra no mesmo lugar; o que não foi tocado fica', () => {
    const c: any = original();
    c.avaliacao_por_descritor[0].evidencias = ['R3: a pessoa citou "erro humano"'];
    c.avaliacao_por_descritor[0].racional = 'texto novo';
    c.feedback.mensagem_positiva = 'sem Diego';
    const m = mesclarSoTexto(original(), c);
    expect(m.avaliacao_por_descritor[0].evidencias).toEqual(['R3: a pessoa citou "erro humano"']);
    expect(m.avaliacao_por_descritor[0].racional).toBe('texto novo');
    expect(m.feedback.mensagem_positiva).toBe('sem Diego');
    expect(m.avaliacao_por_descritor[1].racional).toBe('ok');
  });

  it('lista de textos pode encolher (tirar uma barreira não demonstrada); lista de objetos com outro tamanho fica a original', () => {
    const c: any = original();
    c.recomendacoes_pdi.barreiras_provaveis = ['falta de Y'];
    c.recomendacoes_pdi.acoes = [];
    c.avaliacao_por_descritor = [c.avaliacao_por_descritor[0]];
    const m = mesclarSoTexto(original(), c);
    expect(m.recomendacoes_pdi.barreiras_provaveis).toEqual(['falta de Y']);
    expect(m.recomendacoes_pdi.acoes).toEqual(original().recomendacoes_pdi.acoes);
    expect(m.avaliacao_por_descritor).toHaveLength(2);
  });

  it('campo omitido pela correção volta da original; campo que só existe na correção é ignorado', () => {
    const c: any = original();
    delete c.recomendacoes_pdi;
    delete c.feedback.recomendacoes;
    c.campo_inventado = 'x';
    const m = mesclarSoTexto(original(), c);
    expect(m.recomendacoes_pdi).toEqual(original().recomendacoes_pdi);
    expect(m.feedback.recomendacoes).toEqual(['ação 1', 'ação 2']);
    expect('campo_inventado' in m).toBe(false);
  });

  it('nome de descritor e de competência, e categorias, não mudam mesmo sendo texto', () => {
    const c: any = original();
    c.avaliacao_por_descritor[0].nome = 'Outro descritor';
    c.recomendacoes_pdi.acoes[0].descritor = 'Outro';
    const m = mesclarSoTexto(original(), c);
    expect(m.avaliacao_por_descritor[0].nome).toBe('Constância');
    expect(m.recomendacoes_pdi.acoes[0].descritor).toBe('Constância');
  });

  it('número dentro de objeto de lista (prazo) também vem da original', () => {
    const c: any = original();
    c.recomendacoes_pdi.acoes[0].prazo_dias = 7;
    c.recomendacoes_pdi.acoes[0].acao = 'nova';
    const m = mesclarSoTexto(original(), c);
    expect(m.recomendacoes_pdi.acoes[0]).toEqual({ descritor: 'Constância', acao: 'nova', prazo_dias: 30 });
  });
});

describe('adotarCorrecao: só se o check melhorar', () => {
  it('veredito melhor é adotado; pior não', () => {
    expect(adotarCorrecao({ status: 'revisar', nota: 86 }, { status: 'aprovado_com_ajustes', nota: 82 })).toBe(true);
    expect(adotarCorrecao({ status: 'aprovado_com_ajustes', nota: 84 }, { status: 'revisar', nota: 95 })).toBe(false);
  });
  it('mesmo veredito: só com nota maior', () => {
    expect(adotarCorrecao({ status: 'revisar', nota: 78 }, { status: 'revisar', nota: 80 })).toBe(true);
    expect(adotarCorrecao({ status: 'revisar', nota: 78 }, { status: 'revisar', nota: 78 })).toBe(false);
  });
  it('candidata sem veredito válido nunca é adotada', () => {
    expect(adotarCorrecao({ status: 'revisar', nota: 70 }, { status: 'erro', nota: 99 })).toBe(false);
  });
});
