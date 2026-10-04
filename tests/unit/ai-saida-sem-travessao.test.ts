/**
 * R-57 (04/10/2026): o sanitizador de travessão da saída de IA e o registro das
 * tarefas cujo texto chega ao cliente. O caractere só aparece como escape
 * (— longo, – médio): a regra da casa vale para o teste também.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  SAIDAS_AO_CLIENTE,
  formaDaSaidaAoCliente,
  resumoSemTravessao,
  sanitizarSaidaDaTarefa,
  tirarTravessao,
  tirarTravessaoDeJson,
  tirarTravessaoDeValor,
} from '@/lib/ai-saida-sem-travessao';

const EM = '—';
const EN = '–';
const QUALQUER_TRAVESSAO = /[–—―]/;

describe('tirarTravessao: a pausa vira pontuação', () => {
  it.each([
    [`Olá ${EM} mundo`, 'Olá, mundo'],
    [`Olá ${EN} mundo`, 'Olá, mundo'],
    [`A vida ${EM} e o trabalho ${EM} segue`, 'A vida, e o trabalho, segue'],
    [`palavra${EM}outra`, 'palavra, outra'],
    [`Fim. ${EM} Começo`, 'Fim. Começo'],
    [`Primeiro, ${EM} e depois`, 'Primeiro, e depois'],
    [`texto ${EM}`, 'texto'],
    [`texto ${EM}.`, 'texto.'],
    [`(${EM} ressalva)`, '(ressalva)'],
    [`${EM} Olá, tudo bem?`, '- Olá, tudo bem?'],
    [`  ${EM} item recuado`, '  - item recuado'],
  ])('%j vira %j', (entrada, esperado) => {
    expect(tirarTravessao(entrada)).toBe(esperado);
  });

  it('título e rótulo em negrito viram "rótulo: texto"', () => {
    expect(tirarTravessao(`## Passo 1 ${EM} Fazer`)).toBe('## Passo 1: Fazer');
    expect(tirarTravessao(`**Desafio** ${EM} realizado`)).toBe('**Desafio**: realizado');
    expect(tirarTravessao(`- **Compromisso** ${EN} ligar na segunda`)).toBe('- **Compromisso**: ligar na segunda');
  });

  it('régua, valor vazio e célula de tabela não viram vírgula solta', () => {
    expect(tirarTravessao(`${EM}${EM}${EM}`)).toBe('---');
    expect(tirarTravessao(EM)).toBe('-');
    expect(tirarTravessao(`| ${EM} | x |`)).toBe('| - | x |');
  });

  it('o código da matriz fica com hífen, que normDescritor e semCodigoDaMatriz ainda aceitam', () => {
    expect(tirarTravessao(`COO03_D5 ${EM} Busca de apoio`)).toBe('COO03_D5 - Busca de apoio');
  });

  it('cada linha é tratada sozinha e o texto sem travessão passa idêntico', () => {
    expect(tirarTravessao(`um ${EM} dois\n${EM} tres\nquatro`)).toBe('um, dois\n- tres\nquatro');
    const limpo = 'Sem pausa longa. Só vírgula, e hífen: guarda-chuva - ok.';
    expect(tirarTravessao(limpo)).toBe(limpo);
    expect(tirarTravessao('')).toBe('');
  });
});

describe('tirarTravessao: o que NÃO pode ser estragado', () => {
  it('intervalo numérico e faixa de nível viram hífen, não vírgula', () => {
    expect(tirarTravessao(`10${EN}15`)).toBe('10-15');
    expect(tirarTravessao(`2020${EM}2024`)).toBe('2020-2024');
    expect(tirarTravessao(`N1${EN}N4`)).toBe('N1-N4');
    expect(tirarTravessao(`de 3 ${EN} 5 semanas`)).toBe('de 3-5 semanas');
    expect(tirarTravessao(`de N1 ${EN} N4`)).toBe('de N1-N4');
  });

  it('travessão longo entre números com espaço segue sendo pausa', () => {
    expect(tirarTravessao(`em 2024 ${EM} 3 pessoas entraram`)).toBe('em 2024, 3 pessoas entraram');
  });

  it('hífen comum nunca é tocado', () => {
    for (const t of ['Tira-Dúvidas', 'guarda-chuva', 'pós-venda - ok', 'N1-N4', '3-5']) {
      expect(tirarTravessao(t)).toBe(t);
    }
  });

  it('citação entre aspas fica como a pessoa escreveu, e o resto da frase é limpo', () => {
    const entrada = `Você disse "faço ${EM} mas só quando dá" e depois ${EM} agiu.`;
    expect(tirarTravessao(entrada)).toBe(`Você disse "faço ${EM} mas só quando dá" e depois, agiu.`);
    expect(tirarTravessao(`Sobre “preciso ${EM} delegar” ${EM} faz sentido`)).toBe(`Sobre “preciso ${EM} delegar”, faz sentido`);
    expect(tirarTravessao(`> fala ${EM} literal\ntexto ${EM} meu`)).toBe(`> fala ${EM} literal\ntexto, meu`);
    expect(tirarTravessao(`use \`a ${EM} b\` e ${EM} pronto`)).toBe(`use \`a ${EM} b\` e, pronto`);
  });

  it('bloco [META] das conversas fica intocado, inclusive o JSON dentro dele', () => {
    const meta = `[META]\n{"evidencias_coletadas":[{"trecho":"x ${EM} y"}],"encerrar":false}\n[/META]`;
    const entrada = `Entendi ${EM} conta mais?\n${meta}`;
    expect(tirarTravessao(entrada)).toBe(`Entendi, conta mais?\n${meta}`);
  });

  it('é idempotente e não deixa o caractere fora dos trechos protegidos', () => {
    const amostras = [
      `A ${EM} B ${EM} C`, `${EM}`, `x${EM}`, `${EM}x`, `a ${EM}, b`, `a ,${EM} b`, `1. ${EM} item`,
      `## ${EM} Título`, `**Rótulo** ${EM}`, `fim.${EM}`, `a${EM}${EM}b`, `\n${EM}\n`,
    ];
    for (const a of amostras) {
      const uma = tirarTravessao(a);
      expect(uma, a).not.toMatch(QUALQUER_TRAVESSAO);
      expect(tirarTravessao(uma)).toBe(uma);
    }
  });

  it('o ponto de interrogação final continua sendo o último caractere (pareceFechamento depende disso)', () => {
    expect(tirarTravessao(`Faz sentido ${EM} ou não?`).endsWith('?')).toBe(true);
    expect(tirarTravessao(`Qual o próximo passo ${EM}?`)).toBe('Qual o próximo passo?');
  });
});

describe('tirarTravessaoDeValor e tirarTravessaoDeJson', () => {
  it('percorre objetos e listas, limpa só os valores e nunca a chave', () => {
    const entrada = { [`chave ${EM}`]: `a ${EM} b`, lista: [`p ${EM} q`, 3, null, true], aninhado: { d: `x ${EM} y`, n: null } };
    expect(tirarTravessaoDeValor(entrada)).toEqual({
      [`chave ${EM}`]: 'a, b', lista: ['p, q', 3, null, true], aninhado: { d: 'x, y', n: null },
    });
  });

  it('o eco exato da entrada fica como veio (nome de descritor, cargo, pessoa)', () => {
    const nome = `Feedback ${EM} receber e aplicar`;
    const eco = (t: string) => t === nome;
    expect(tirarTravessaoDeValor({ descritor: nome, texto: `um ${EM} dois` }, { eco })).toEqual({ descritor: nome, texto: 'um, dois' });
  });

  it('um valor que é só um traço continua não vazio', () => {
    expect(tirarTravessaoDeValor({ nota: EM })).toEqual({ nota: '-' });
  });

  it('JSON com cerca e preâmbulo: devolve o mesmo envelope com o JSON limpo e parseável', () => {
    const bruto = 'Segue:\n```json\n' + JSON.stringify({ leitura: `bom ${EM} mas falta prazo`, itens: [`a ${EN} b`], n: 2 }) + '\n```';
    const saida = tirarTravessaoDeJson(bruto);
    expect(saida).not.toMatch(QUALQUER_TRAVESSAO);
    expect(saida.startsWith('Segue:\n```json\n')).toBe(true);
    expect(saida.endsWith('\n```')).toBe(true);
    const json = saida.slice(saida.indexOf('{'), saida.lastIndexOf('}') + 1);
    expect(JSON.parse(json)).toEqual({ leitura: 'bom, mas falta prazo', itens: ['a, b'], n: 2 });
  });

  it('o travessão escrito como escape JSON também sai', () => {
    const saida = tirarTravessaoDeJson('{"t":"um \\u2014 dois"}');
    expect(JSON.parse(saida)).toEqual({ t: 'um, dois' });
  });

  it('sem travessão, ou só na chave, devolve o texto original byte a byte', () => {
    const formatado = '{\n  "a": "um",\n  "b": [1, 2]\n}';
    expect(tirarTravessaoDeJson(formatado)).toBe(formatado);
    const soNaChave = `{ "k ${EM}": "v" }`;
    expect(tirarTravessaoDeJson(soNaChave)).toBe(soNaChave);
  });

  it('JSON cortado cai no texto: nunca lança e o JSON de antes continua do mesmo tamanho de estrutura', () => {
    const cortado = `{"a":"um ${EM} dois","b":"trunc`;
    const saida = tirarTravessaoDeJson(cortado);
    expect(saida).toBe('{"a":"um, dois","b":"trunc');
  });
});

describe('registro das tarefas e sanitizarSaidaDaTarefa', () => {
  it('conversa em texto corrido: limpa o texto e preserva o [META]', () => {
    const meta = `[META]{"k":"a ${EM} b"}[/META]`;
    expect(sanitizarSaidaDaTarefa('tira_duvidas', `Boa pergunta ${EM} vamos ver.`)).toBe('Boa pergunta, vamos ver.');
    expect(sanitizarSaidaDaTarefa('arguicao_turno', `Fale mais ${EM} pode ser?\n${meta}`)).toBe(`Fale mais, pode ser?\n${meta}`);
  });

  it('JSON do cliente: limpa os textos e preserva o que a IA devolveu como eco da entrada', () => {
    const nome = `Feedback ${EM} receber e aplicar`;
    const user = `Competências avaliadas:\n1. ${nome}\n2. Escuta ativa`;
    const bruto = JSON.stringify({ competencias: [{ nome, feedback: `Você avançou ${EM} falta prazo.` }] });
    const saida = JSON.parse(sanitizarSaidaDaTarefa('pdi_individual', bruto, [user]));
    expect(saida.competencias[0].nome).toBe(nome);
    expect(saida.competencias[0].feedback).toBe('Você avançou, falta prazo.');
  });

  it('o eco ignora acento, caixa e espaço extra, como o casamento por nome faz', () => {
    const user = `Descritor: Feedback ${EM} receber e aplicar`;
    const bruto = JSON.stringify({ d: `FEEDBACK  ${EM} Receber e Aplicar`, t: `outro ${EM} texto` });
    expect(JSON.parse(sanitizarSaidaDaTarefa('relatorio_gestor', bruto, [user]))).toEqual({ d: `FEEDBACK  ${EM} Receber e Aplicar`, t: 'outro, texto' });
  });

  it('tarefa fora do registro passa intacta, inclusive as que conferem citação ou nome', () => {
    for (const k of ['sem14_scorer', 'ia4_avaliacao', 'arguicao_avaliacao', 'evidencias_socratic_extracao', 'sim_lideranca_avaliador', undefined, null, 'constructor', 'toString']) {
      expect(sanitizarSaidaDaTarefa(k as any, `a ${EM} b`)).toBe(`a ${EM} b`);
    }
    expect(formaDaSaidaAoCliente('constructor')).toBeNull();
  });

  it('o registro não inclui a tarefa que casa o eco por nome nem as que conferem citação literal', () => {
    for (const k of ['sem14_scorer', 'ia4_avaliacao', 'arguicao_avaliacao', 'temporada_extracao', 'chat_fase3_eval', 'sim_lideranca_avaliador', 'sim_vendas_gerente', 'recepcao_avaliacao']) {
      expect(Object.keys(SAIDAS_AO_CLIENTE)).not.toContain(k);
    }
  });

  it('toda chave do registro tem um call-site vivo (config sem consumidor não fica)', () => {
    const raiz = join(__dirname, '..', '..');
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (nome === 'node_modules' || nome === '.next' || nome.startsWith('.')) continue;
        if (statSync(p).isDirectory()) varrer(p);
        else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(p);
      }
    };
    for (const d of ['actions', 'app', 'lib', 'trigger']) varrer(join(raiz, d));
    const corpus = arquivos
      .filter((a) => !a.endsWith('ai-saida-sem-travessao.ts') && !a.endsWith('ia-cost-catalog.ts') && !a.endsWith('ai-tasks.ts'))
      .map((a) => readFileSync(a, 'utf8')).join('\n');
    for (const k of Object.keys(SAIDAS_AO_CLIENTE)) {
      expect(corpus, `taskKey '${k}' do registro não aparece em nenhum call-site`).toMatch(new RegExp(`['"\`]${k}['"\`]`));
    }
  });
});

describe('resumoSemTravessao (leitura do resumo do fechamento)', () => {
  it('limpa os textos autorais e deixa as evidências citadas e as notas como estão', () => {
    const resumo = {
      mensagem_geral: `Você agiu ${EM} e isso conta.`,
      principal_avanco: `delegou ${EM} com prazo`,
      principal_ponto_de_atencao: `prazo ${EN} falta`,
      mensagem_final: `Leve isto ${EM} agora.`,
      proximos_passos: [`Ligue ${EM} segunda`, 'ok'],
      evidencias_citadas: [`eu disse ${EM} sem pensar`],
      nota_media_pos: 3.2,
    };
    expect(resumoSemTravessao(resumo)).toEqual({
      mensagem_geral: 'Você agiu, e isso conta.',
      principal_avanco: 'delegou, com prazo',
      principal_ponto_de_atencao: 'prazo, falta',
      mensagem_final: 'Leve isto, agora.',
      proximos_passos: ['Ligue, segunda', 'ok'],
      evidencias_citadas: [`eu disse ${EM} sem pensar`],
      nota_media_pos: 3.2,
    });
  });

  it('aceita a forma em string, nula e a que não é objeto', () => {
    expect(resumoSemTravessao(`a ${EM} b`)).toBe('a, b');
    expect(resumoSemTravessao(null)).toBeNull();
    expect(resumoSemTravessao([1, 2])).toEqual([1, 2]);
  });
});
