/**
 * Contrato dos templates de WhatsApp (fonte única, 14/08/2026).
 *
 * Dois papéis distintos aqui:
 *
 *  1. **Contrato de render** — o texto livre do caminho legado é gerado do MESMO
 *     corpo que foi aprovado pela Meta. Se as variáveis não baterem, uma pessoa
 *     real receberia `{{3}}` cru no meio da mensagem, e ninguém veria: não há
 *     tela que mostre o que foi entregue.
 *
 *  2. **Guard de categoria** — congela os sinais que, medidos em 14/08/2026,
 *     fizeram a Meta reclassificar templates de UTILITY para MARKETING (6× o
 *     custo: R$ 0,06–0,09 → R$ 0,40–0,55). Não é regra publicada pela Meta; é
 *     heurística observada numa amostra de sete templates. O valor do guard não
 *     é adivinhar o classificador — é impedir que copy nova reintroduza um sinal
 *     conhecido SEM ALGUÉM DECIDIR ISSO, que é como um custo 6× maior entra em
 *     produção sem ninguém notar.
 */
import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  renderTemplate,
  contarVariaveis,
  payloadDaMeta,
  type TemplateDef,
} from '@/lib/whatsapp/templates';

const TODOS = Object.values(TEMPLATES) as unknown as TemplateDef[];

describe('render a partir do corpo aprovado', () => {
  it('substitui as variáveis na ordem posicional', () => {
    const texto = renderTemplate(TEMPLATES.evidencia_semanal as unknown as TemplateDef, [
      'Maria', '5', 'https://x.test/s/5',
    ]);
    expect(texto).toContain('Olá, Maria.');
    expect(texto).toContain('semana 5');
    expect(texto).toContain('https://x.test/s/5');
    expect(texto).not.toContain('{{');
  });

  it('LANÇA quando faltam variáveis — mensagem com {{3}} cru não pode sair', () => {
    expect(() =>
      renderTemplate(TEMPLATES.evidencia_semanal as unknown as TemplateDef, ['Maria', '5']),
    ).toThrow(/esperava 3 variáveis, recebeu 2/);
  });

  it('LANÇA quando sobram variáveis (troca de assinatura sem atualizar o call-site)', () => {
    expect(() =>
      renderTemplate(TEMPLATES.perfil_disponivel as unknown as TemplateDef, ['Maria', 'url', 'sobra']),
    ).toThrow(/esperava 2 variáveis, recebeu 3/);
  });

  it('conta pelo MAIOR índice, não pela quantidade de ocorrências', () => {
    // {{1}} repetido duas vezes e {{2}} uma vez = 2 variáveis, não 3.
    expect(contarVariaveis('Oi {{1}}, tudo bem {{1}}? Sua semana é a {{2}}.')).toBe(2);
  });
});

describe('cada template tem exemplo compatível com o corpo', () => {
  it.each(TODOS.map((t) => [t.name, t] as const))('%s', (_nome, def) => {
    // A Meta REJEITA template cujo example não cobre todas as variáveis.
    expect(def.example).toHaveLength(contarVariaveis(def.body));
    expect(() => renderTemplate(def, def.example as unknown as string[])).not.toThrow();
  });
});

describe('regras de formato da Meta', () => {
  it.each(TODOS.map((t) => [t.name, t] as const))('%s não começa nem termina com variável', (_n, def) => {
    // Corpo que abre ou fecha com {{n}} é rejeitado na submissão.
    expect(def.body.trimStart().startsWith('{{')).toBe(false);
    expect(def.body.trimEnd().endsWith('}}')).toBe(false);
  });

  it.each(TODOS.map((t) => [t.name, t] as const))('%s não tem variáveis adjacentes', (_n, def) => {
    expect(/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(def.body)).toBe(false);
  });

  it.each(TODOS.map((t) => [t.name, t] as const))('%s usa nome válido na API', (_n, def) => {
    expect(def.name).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('guard de categoria — sinais que derrubaram templates em MARKETING', () => {
  // Medidos em 14/08/2026 comparando os que caíram com os que passaram.
  const SINAIS: Array<{ rotulo: string; re: RegExp }> = [
    { rotulo: 'nome do produto no corpo', re: /vertho\s*mentor|plataforma\s+vertho/i },
    { rotulo: 'urgência', re: /acesse\s+agora|ainda\s+d[áa]\s+tempo|d[áa]\s+tempo\s+at[ée]|hoje!/i },
    { rotulo: 'pergunta engajadora', re: /voc[êe]\s+j[áa]\s+(fez|viu|conferiu)/i },
    { rotulo: 'convite promocional', re: /que\s+tal\s+|n[ãa]o\s+perca|aproveite/i },
  ];

  it.each(
    TODOS.filter((t) => t.category === 'UTILITY').flatMap((t) =>
      SINAIS.map((s) => [t.name, s.rotulo, t, s.re] as const),
    ),
  )('%s não contém: %s', (_nome, _rotulo, def, re) => {
    expect(re.test(def.body)).toBe(false);
  });

  it('o guard PODE falhar — a copy antiga da evidência bate nos sinais', () => {
    // Valida o guard por mutação, com o texto real que a Meta reclassificou.
    const antiga = 'Acesse a plataforma Vertho e registre sua evidência hoje!';
    expect(SINAIS.some((s) => s.re.test(antiga))).toBe(true);
  });
});

describe('chave interna ≠ nome na Meta', () => {
  // Três nomes ficaram queimados em 14/08 (apagados, bloqueados para recriação
  // com outra categoria), então a chave do objeto e o `name` divergem. Enviar a
  // chave para a API daria "template not found" NA HORA DO ENVIO — em produção,
  // no cron, para gente real. Aqui isso é um teste, não uma esperança.
  const RENOMEADOS: Array<[keyof typeof TEMPLATES, string]> = [
    ['evidencia_semanal', 'registro_evidencia'],
    ['nudge_desafio', 'registro_desafio'],
    ['perfil_disponivel', 'resultado_perfil'],
  ];

  it.each(RENOMEADOS)('a chave %s aponta para o template %s', (chave, nomeNaMeta) => {
    expect((TEMPLATES[chave] as unknown as TemplateDef).name).toBe(nomeNaMeta);
  });

  it('nenhum name repetido — dois templates com o mesmo nome sobrescrevem na Meta', () => {
    const nomes = TODOS.map((t) => t.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});

describe('payload da Graph API', () => {
  it('monta o corpo no formato que a Meta espera', () => {
    const p = payloadDaMeta(TEMPLATES.nudge_desafio as unknown as TemplateDef);
    // O payload leva o `name` (o que existe na Meta), NUNCA a chave do objeto.
    expect(p).toMatchObject({ name: 'registro_desafio', language: 'pt_BR', category: 'UTILITY' });
    expect(p.components[0]!.type).toBe('BODY');
    // example.body_text é ARRAY DE ARRAYS — um array por conjunto de exemplos.
    expect(p.components[0]!.example.body_text[0]).toEqual(TEMPLATES.nudge_desafio.example);
  });
});
