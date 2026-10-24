import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tirarTravessaoDeConteudo, desafioSemTravessao } from '@/lib/ai-saida-sem-travessao';

/**
 * Kit sem travessão (24/10/2026). O texto, o case e o desafio do Kit saem do LOTE, que não passa pelo wrapper: em
 * 23/10 todos os textos e cases dos últimos 45 dias tinham travessão (média de 18 por texto na Amazon) e 122 de 122
 * desafios de kit também. Os exemplos abaixo são trechos reais do banco.
 */
const EM = '—';
const EN = '–';
const TRAVESSAO = /[–—―]/;

describe('tirarTravessaoDeConteudo: fala de diálogo vira aspas', () => {
  it.each([
    [`${EM} E o que te fez continuar olhando esse aqui, sendo que o outro é mais barato?`,
      '"E o que te fez continuar olhando esse aqui, sendo que o outro é mais barato?"'],
    [`${EM} Que concessionária foi? ${EM} ele pergunta, com tom neutro.`,
      '"Que concessionária foi?", ele pergunta, com tom neutro.'],
    [`${EM} Marcelo, me ajuda a entender uma coisa ${EM} Rafael disse, devagar. ${EM} Quando você fala que o preço está alto, comparado com o quê?`,
      '"Marcelo, me ajuda a entender uma coisa", Rafael disse, devagar. "Quando você fala que o preço está alto, comparado com o quê?"'],
    [`${EM} Bom ${EM} ele começou ${EM}, eu estava olhando um modelo da outra marca.`,
      '"Bom", ele começou, "eu estava olhando um modelo da outra marca."'],
    [`${EM} Sim. Aparece "CNPJ do tomador não identificado". Achei que vocês já soubessem disso.`,
      `"Sim. Aparece 'CNPJ do tomador não identificado'. Achei que vocês já soubessem disso."`],
    // Narração que é AÇÃO (frase nova, com maiúscula, depois de fala fechada) não leva vírgula nem perde o ponto.
    [`${EM} Entendo. ${EM} Rafael abre o notebook, vira levemente a tela para Amaral. ${EM} Deixa eu te mostrar uma coisa.`,
      '"Entendo." Rafael abre o notebook, vira levemente a tela para Amaral. "Deixa eu te mostrar uma coisa."'],
    [`${EM} Você conferiu se eles têm esse modelo para entrega agora? ${EM} Rafael pergunta.`,
      '"Você conferiu se eles têm esse modelo para entrega agora?" Rafael pergunta.'],
  ])('%s', (entrada, esperado) => {
    expect(tirarTravessaoDeConteudo(entrada)).toBe(esperado);
  });
});

describe('tirarTravessaoDeConteudo: par na mesma frase vira parênteses', () => {
  it.each([
    [`Se você percebeu algo que pode afetar outro setor ${EM} caixa, cozinha, manutenção, o próximo turno ${EM}, essa informação precisa chegar antes.`,
      'Se você percebeu algo que pode afetar outro setor (caixa, cozinha, manutenção, o próximo turno), essa informação precisa chegar antes.'],
    [`Ela abriu o arquivo, conferiu o endereço ${EM} estava completo ${EM}, verificou o CFOP ${EM} correto ${EM}, e lançou a nota.`,
      'Ela abriu o arquivo, conferiu o endereço (estava completo), verificou o CFOP (correto), e lançou a nota.'],
    [`Essa anotação ${EM} simples, concreta, com hora ${EM} muda o que acontece a seguir.`,
      'Essa anotação (simples, concreta, com hora) muda o que acontece a seguir.'],
  ])('%s', (entrada, esperado) => {
    expect(tirarTravessaoDeConteudo(entrada)).toBe(esperado);
  });
});

describe('tirarTravessaoDeConteudo: o resto segue a regra de sempre', () => {
  it.each([
    [`Não é burocracia ${EM} é eficiência.`, 'Não é burocracia, é eficiência.'],
    [`## Passo 1 ${EM} Registre na hora`, '## Passo 1: Registre na hora'],
    [`1. **Apresente opções** ${EM} Quando possível, ofereça duas.`, '1. **Apresente opções**: Quando possível, ofereça duas.'],
    [`Pergunte: "Isso resolve o que estava pendente ${EM} ou falta algo?"`, 'Pergunte: "Isso resolve o que estava pendente, ou falta algo?"'],
    [`Leve de 2${EN}4 exemplos.`, 'Leve de 2-4 exemplos.'],
    ['- item de lista com hífen fica como está', '- item de lista com hífen fica como está'],
  ])('%s', (entrada, esperado) => {
    expect(tirarTravessaoDeConteudo(entrada)).toBe(esperado);
  });

  it('um texto inteiro sai sem nenhum travessão, com as quebras de linha e o markdown intactos, e é idempotente', () => {
    const md = [
      `# Prazo não é promessa de boca ${EM} é registro`,
      '',
      `Rodrigo é gerente operacional. Toda semana ele revisa com os quatro supervisores ${EM} manutenção, loja, alimentos e operação ${EM} o que está pendente.`,
      '',
      `> **"A diferença entre uma promessa e uma intenção não está na boa vontade ${EM} está no planejamento."**`,
      '',
      `${EM} Só lembrando que o levantamento fecha hoje às 14h ${EM} ele escreveu.`,
      '',
      '- Registre na hora.',
      `- Revise ${EM} toda sexta.`,
    ].join('\n');
    const limpo = tirarTravessaoDeConteudo(md);
    expect(limpo).not.toMatch(TRAVESSAO);
    expect(limpo.split('\n')).toHaveLength(md.split('\n').length);
    expect(limpo).toContain('# Prazo não é promessa de boca');
    expect(limpo).toContain('(manutenção, loja, alimentos e operação)');
    expect(limpo).toContain('"Só lembrando que o levantamento fecha hoje às 14h", ele escreveu.');
    expect(limpo).toContain('- Registre na hora.');
    expect(tirarTravessaoDeConteudo(limpo)).toBe(limpo);
  });
});

describe('desafioSemTravessao', () => {
  it('limpa os campos de texto do desafio e não mexe nas chaves nem no que não é texto', () => {
    const d = {
      desafio_texto: `Escolha uma pendência ${EM} a mais antiga ${EM} e registre.`,
      acao_observavel: 'Registrar a pendência',
      criterio_de_execucao: `Conta qual era ${EM} e o que fez.`,
      por_preferencia: true,
    };
    const limpo = desafioSemTravessao(d);
    expect(Object.keys(limpo)).toEqual(Object.keys(d));
    expect(JSON.stringify(limpo)).not.toMatch(TRAVESSAO);
    expect(limpo.desafio_texto).toBe('Escolha uma pendência (a mais antiga) e registre.');
    expect(limpo.por_preferencia).toBe(true);
  });
});

describe('o gerador do Kit aplica a regra e o sanitizador', () => {
  const ler = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

  it('texto e case: regra de pontuação no system e sanitizador depois da expansão, antes do título e do PDF', () => {
    const src = ler('actions/conteudos.ts');
    const ini = src.indexOf('export async function gerarConteudoIA');
    const fn = src.slice(ini, src.indexOf('\nexport async function', ini + 10));
    expect(fn).toMatch(/system = `\$\{system\}\\n\\n\$\{REGRA_PONTUACAO_DA_SAIDA\}/);
    const expansao = fn.indexOf('await garantirMinimoPdf(');
    const sanitiza = fn.indexOf('conteudoGerado = tirarTravessaoDeConteudo(conteudoGerado)');
    expect(sanitiza, 'o sanitizador do conteúdo sumiu').toBeGreaterThan(-1);
    expect(sanitiza, 'a expansão pode reintroduzir travessão: o sanitizador vem depois dela').toBeGreaterThan(expansao);
    expect(sanitiza, 'o título e o PDF saem do texto já limpo').toBeLessThan(fn.indexOf('extrairTitulo(conteudoGerado'));
  });

  it('desafio do kit: regra no system e desafioSemTravessao no retorno', () => {
    const src = ler('lib/season-engine/kit/brief.ts');
    const ini = src.indexOf('export async function gerarKitDesafio');
    const fn = src.slice(ini, src.indexOf('\n}\n', ini));
    expect(fn).toContain('${REGRA_PONTUACAO_DA_SAIDA}');
    expect(fn).toContain('return desafioSemTravessao(desafio)');
  });
});
