/**
 * `inicio_temporada_v2` (08/10/2026): a versão enxuta da abertura de temporada, a 2ª tentativa de
 * ficar em UTILITY. O que este arquivo congela, e por quê:
 *
 *  1. O corpo do código é byte a byte o aprovado pelo dono (a Meta compara o corpo), com 4
 *     variáveis na ordem nome, competência, instituição e link.
 *  2. O texto NÃO tem o que saiu de propósito: "Boas-vindas", "Boa temporada!" e a frase de
 *     benefício. É a diferença que a tentativa testa; se voltarem, é outro template.
 *  3. Continua dizendo o que a TELA diz ("mapeamento", "4 perguntas", "~10 min por competência"),
 *     sem presumir gênero e sem afirmar o que não é verdade hoje ("já começou": a turma abre em
 *     diagnóstico e a trilha só começa na data dela).
 *  4. O contrato manda 4 parâmetros: mandar 3 para um corpo de 4 variáveis faz a Meta recusar.
 *  5. Aparece na tela de Envios, na etapa Entrada, sem o aviso de custo do MARKETING.
 *
 * O estado real na Meta (PENDING, APPROVED, a categoria) se confere lá, nunca aqui.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { INICIO_TEMPORADA_V2 } from '../../helpers/template-submetido-inicio-temporada-v2';
import { TEMPLATES, contarVariaveis, renderTemplate } from '@/lib/whatsapp/templates';
import { contratoDoTemplate } from '@/lib/notifications/pilula-template';
import { listarTemplatesDisparaveis } from '@/lib/notifications/envio-template-lote';

const def = TEMPLATES.inicio_temporada_v2 as any;
const tela = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8')).Assessment.explanation;

describe('o texto que vai à Meta', () => {
  it('é byte a byte o aprovado, com 4 variáveis', () => {
    expect(def.body).toBe(INICIO_TEMPORADA_V2.body);
    expect(def.example).toEqual(INICIO_TEMPORADA_V2.example);
    expect(contarVariaveis(def.body)).toBe(INICIO_TEMPORADA_V2.variaveis);
  });

  it('renderiza com o exemplo exatamente como foi escrito à mão', () => {
    expect(renderTemplate(def, [...INICIO_TEMPORADA_V2.example])).toBe(INICIO_TEMPORADA_V2.renderizadoComExemplo);
  });

  it('nasce UTILITY, com nome novo e válido na API (o nome do antigo está ocupado)', () => {
    expect(def.category).toBe('UTILITY');
    expect(def.name).toBe('inicio_temporada_v2');
    expect(def.name).toMatch(/^[a-z0-9_]+$/);
    expect(def.name).not.toBe((TEMPLATES.inicio_temporada as any).name);
  });
});

describe('a versão enxuta é enxuta', () => {
  it('não tem o acolhimento, o fecho nem a frase de benefício que o texto anterior tinha', () => {
    expect(def.body).not.toMatch(/boas-vindas/i);
    expect(def.body).not.toMatch(/boa temporada/i);
    expect(def.body).not.toMatch(/montamos/i);
    expect(def.body).not.toMatch(/trilha/i);
  });

  it('em vez disso, ancora na inscrição: cita a instituição, como o boas_vindas_v2 e o votacao_pendente_v3', () => {
    expect(def.body).toMatch(/no programa da \{\{3\}\}/);
    expect((TEMPLATES.boas_vindas_v2 as any).body).toMatch(/\{\{2\}\}/);
    expect((TEMPLATES.votacao_pendente_v3 as any).body).toMatch(/no programa da \{\{2\}\}/);
  });
});

describe('o texto diz o que a tela diz e é verdade hoje', () => {
  it('usa o vocabulário e os números da tela do assessment', () => {
    expect(tela.start).toMatch(/mapeamento/i);
    expect(tela.questionsTitle).toMatch(/4 perguntas/);
    expect(tela.paceText).toMatch(/10 min por competência/);
    expect(def.body).toContain('mapeamento de competências');
    expect(def.body).toContain('4 perguntas');
    expect(def.body).toContain('10 minutos por competência');
  });

  it('não repete as imprecisões do convite antigo', () => {
    expect(def.body).not.toMatch(/4 cenários/);
    expect(def.body).not.toMatch(/avaliação diagnóstica/i);
  });

  it('diz "já está disponível" e NÃO "já começou": a turma abre em diagnóstico e a trilha começa na data dela', () => {
    expect(def.body).toContain('já está disponível');
    expect(def.body).not.toMatch(/começ(ou|a agora)|já (está|foi) (aberta|iniciada)/i);
  });

  it('sem presumir gênero', () => {
    expect(def.body).not.toMatch(/bem[- ]?vind[oa]/i);
    expect(def.body).not.toMatch(/\([ao]\)/);
  });
});

describe('o contrato', () => {
  const montar = contratoDoTemplate('inicio_temporada_v2')!;
  const args = {
    telefone: '5574999999999', nome: 'Elda', semana: 1, tema: '', slug: 'ibipeba',
    baseUrl: 'https://ibipeba.vertho.ai', instituicao: 'Secretaria Municipal de Ibipeba/BA',
    empresaId: 'e', colaboradorId: 'c', competencia: 'Comunicação',
  } as any;

  it('manda 4 parâmetros na ordem nome, competência, instituição e link do assessment do tenant', () => {
    expect(montar).toBeTruthy();
    const { params, botaoParam } = montar(args);
    expect(params).toEqual(['Elda', 'Comunicação', 'Secretaria Municipal de Ibipeba/BA', 'https://ibipeba.vertho.ai/dashboard/assessment']);
    expect(params).toHaveLength(contarVariaveis(def.body));
    expect(botaoParam).toBeNull();
  });

  it('a mensagem final, com os parâmetros reais, é a do texto aprovado', () => {
    expect(renderTemplate(def, montar(args).params)).toBe(
      INICIO_TEMPORADA_V2.renderizadoComExemplo.replace('Maria', 'Elda'),
    );
  });

  it('sem competência ou sem instituição o parâmetro sai VAZIO (o lote exclui antes: ver envio-inicio-temporada)', () => {
    expect(montar({ ...args, competencia: null }).params[1]).toBe('');
    expect(montar({ ...args, instituicao: null }).params[2]).toBe('');
  });
});

describe('na tela de Envios', () => {
  const item = listarTemplatesDisparaveis().find((t) => t.template === 'inicio_temporada_v2');

  it('aparece com o corpo LITERAL, as 4 variáveis explicadas e o rótulo limpo (sem aviso de custo)', () => {
    expect(item).toBeTruthy();
    expect(item!.corpo).toBe(INICIO_TEMPORADA_V2.body);
    expect(item!.variaveis).toHaveLength(4);
    expect(item!.rotulo).toBe('Início da temporada');
    expect(item!.etapa).toBe('Entrada');
  });

  it('as duas aberturas ficam distintas na tela', () => {
    const antigo = listarTemplatesDisparaveis().find((t) => t.template === 'inicio_temporada');
    expect(antigo!.rotulo).not.toBe(item!.rotulo);
  });
});
