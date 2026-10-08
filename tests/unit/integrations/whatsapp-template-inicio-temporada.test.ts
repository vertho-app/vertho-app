/**
 * `inicio_temporada`: a abertura de uma temporada nova (proposto em 08/10/2026, ainda não submetido
 * à Meta). O que este arquivo congela, e por quê:
 *
 *  1. O corpo do código é byte a byte o aprovado pelo dono (a Meta compara o corpo), com 3
 *     variáveis na ordem nome, competência e link.
 *  2. O texto diz o que a TELA diz: "mapeamento de competências" (o botão é "Começar mapeamento"),
 *     "4 perguntas" e "~10 min por competência". Lê o catálogo da tela, não uma cópia do texto.
 *  3. Sem presumir gênero (regra de 17/09/2026) e sem as imprecisões do convite antigo
 *     ("São 4 cenários", "avaliação diagnóstica").
 *  4. O contrato manda 3 parâmetros e o link do assessment do tenant.
 *  5. Aparece na tela de Envios como entrada da temporada, com o corpo literal.
 *
 * O estado real na Meta (PENDING, APPROVED, a categoria) se confere lá, nunca aqui.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { INICIO_TEMPORADA } from '../../helpers/template-proposto-inicio-temporada';
import { TEMPLATES, contarVariaveis, renderTemplate } from '@/lib/whatsapp/templates';
import { contratoDoTemplate } from '@/lib/notifications/pilula-template';
import { listarTemplatesDisparaveis } from '@/lib/notifications/envio-template-lote';

const def = TEMPLATES.inicio_temporada as any;
const tela = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8')).Assessment.explanation;

describe('o texto que vai à Meta', () => {
  it('é byte a byte o aprovado, com 3 variáveis', () => {
    expect(def.body).toBe(INICIO_TEMPORADA.body);
    expect(def.example).toEqual(INICIO_TEMPORADA.example);
    expect(contarVariaveis(def.body)).toBe(INICIO_TEMPORADA.variaveis);
  });

  it('renderiza com o exemplo exatamente como foi escrito à mão', () => {
    expect(renderTemplate(def, [...INICIO_TEMPORADA.example])).toBe(INICIO_TEMPORADA.renderizadoComExemplo);
  });

  it('nasce UTILITY e com nome válido na API', () => {
    expect(def.category).toBe('UTILITY');
    expect(def.name).toBe('inicio_temporada');
    expect(def.name).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('o texto diz o que a tela diz', () => {
  it('a tela chama a etapa de mapeamento, com 4 perguntas e ~10 min por competência', () => {
    // Âncora: se a tela mudar, o texto que já saiu para a pessoa deixa de bater e este teste cai.
    expect(tela.start).toMatch(/mapeamento/i);
    expect(tela.questionsTitle).toMatch(/4 perguntas/);
    expect(tela.paceText).toMatch(/10 min por competência/);
  });

  it('usa o mesmo vocabulário e os mesmos números', () => {
    expect(def.body).toContain('mapeamento de competências');
    expect(def.body).toContain('4 perguntas');
    expect(def.body).toContain('10 minutos por competência');
  });

  it('não repete as imprecisões do convite antigo', () => {
    expect(def.body).not.toMatch(/4 cenários/);
    expect(def.body).not.toMatch(/avaliação diagnóstica/i);
    expect(def.body).not.toMatch(/\bavaliação de\b/i);
  });
});

describe('sem presumir gênero', () => {
  it('abre com "Boas-vindas", nunca "bem-vinda/o" nem marcação (a)/(o)', () => {
    expect(def.body).toContain('Boas-vindas');
    expect(def.body).not.toMatch(/bem[- ]?vind[oa]/i);
    expect(def.body).not.toMatch(/\([ao]\)/);
  });
});

describe('o contrato', () => {
  const montar = contratoDoTemplate('inicio_temporada')!;
  const args = {
    telefone: '5574999999999', nome: 'Elda', semana: 1, tema: '', slug: 'ibipeba',
    baseUrl: 'https://ibipeba.vertho.ai', instituicao: 'Secretaria', empresaId: 'e', colaboradorId: 'c',
    competencia: 'Comunicação',
  } as any;

  it('existe e manda 3 parâmetros na ordem nome, competência e link do assessment do tenant', () => {
    expect(montar).toBeTruthy();
    const { params, botaoParam } = montar(args);
    expect(params).toEqual(['Elda', 'Comunicação', 'https://ibipeba.vertho.ai/dashboard/assessment']);
    expect(params).toHaveLength(contarVariaveis(def.body));
    expect(botaoParam).toBeNull();
  });

  it('sem competência o parâmetro sai VAZIO (e o lote exclui antes: ver envio-inicio-temporada)', () => {
    expect(montar({ ...args, competencia: null }).params[1]).toBe('');
  });

  it('a mensagem final, com os parâmetros reais, é a do texto aprovado', () => {
    expect(renderTemplate(def, montar(args).params)).toBe(
      INICIO_TEMPORADA.renderizadoComExemplo
        .replace('Maria', 'Elda'),
    );
  });
});

describe('na tela de Envios', () => {
  const item = listarTemplatesDisparaveis().find((t) => t.template === 'inicio_temporada');

  it('aparece, com o corpo LITERAL e as variáveis explicadas', () => {
    expect(item).toBeTruthy();
    expect(item!.corpo).toBe(INICIO_TEMPORADA.body);
    expect(item!.variaveis).toHaveLength(3);
    expect(item!.rotulo).toBe('Início da temporada');
  });

  it('fica na entrada, ao lado das boas-vindas, e não entre os lembretes de avaliação', () => {
    expect(item!.etapa).toBe('Entrada');
  });
});
