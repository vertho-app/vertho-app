// O VALOR de uma variável de template, no formato que a Meta aceita.
//
// A regra que este arquivo guarda é a do PARÂMETRO, e ela é oposta à do corpo:
// o corpo aprovado pode ter quebra de linha (26 dos nossos 28 têm — é assim que
// existe layout de lista), o valor que preenche `{{1}}` não pode. A Meta recusa
// com 400 (`Param text cannot have new-line/tab characters or more than 4
// consecutive spaces`) e recusa também parâmetro vazio.
//
// Por que vale um teste: a falha é TOTAL e MUDA. Não sai um campo torto — não sai
// a mensagem, e para quem esperava é indistinguível de nunca ter sido enviada.
// Até 02/09/2026 o valor ia cru (`String(text ?? '')`), então bastava um nome
// colado de planilha com quebra de linha, ou um contador que veio `null`.
//
// Invariantes (cada `it` prova uma):
//   1. Quebra de linha no valor não chega na Meta — vira espaço, e a mensagem sai.
//   2. Tab e espaços em sequência idem (o limite da Meta é 4 consecutivos).
//   3. Parâmetro vazio falha ANTES da rede, dizendo QUAL variável está vazia.
//   4. `null`/`undefined` na lista contam como vazio (era o caso do contador).
//   5. O sufixo do botão passa pela mesma régua.
//   6. O CORPO do catálogo segue livre para ter `\n` — a regra não é dele.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ entregas: [] as any[] }));

vi.mock('@/lib/notifications/delivery-log', () => ({
  registrarEntrega: async (e: any) => { h.entregas.push(e); },
}));

const { enviarTemplateCloud } = await import('@/lib/whatsapp/cloud-api');
const { TEMPLATES } = await import('@/lib/whatsapp/templates');

const chamadas: any[] = [];

function stubarFetch() {
  global.fetch = vi.fn(async (_url: any, init: any) => {
    chamadas.push(JSON.parse(String(init.body)));
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.X' }] }) };
  }) as any;
}

/** Os textos que foram parar no componente `body` da última chamada. */
function paramsEnviados(): string[] {
  const body = chamadas.at(-1)?.template?.components?.find((c: any) => c.type === 'body');
  return (body?.parameters ?? []).map((p: any) => p.text);
}

beforeEach(() => {
  chamadas.length = 0;
  h.entregas.length = 0;
  process.env.META_WHATSAPPBUSINESS_API = 'token-de-teste';
  process.env.PHONE_NUMBER_ID = '123456';
  stubarFetch();
});

const base = { phone: '5511999998888', template: 'resumo_equipe_semanal' };

describe('o valor de uma variável nunca sai no formato que a Meta recusa', () => {
  it('quebra de linha vira espaço, e a mensagem sai', async () => {
    const r = await enviarTemplateCloud({ ...base, params: ['Carla\nSouza', '8', '11', '3'] });

    expect(r.ok).toBe(true);
    expect(paramsEnviados()[0]).toBe('Carla Souza');
    expect(paramsEnviados()[0]).not.toContain('\n');
  });

  it('tab e espaços em sequência também são colapsados', async () => {
    await enviarTemplateCloud({ ...base, params: ['Ana\tMaria', '8', '11', '3'] });
    expect(paramsEnviados()[0]).toBe('Ana Maria');

    await enviarTemplateCloud({ ...base, params: ['Ana      Maria', '8', '11', '3'] });
    expect(paramsEnviados()[0]).toBe('Ana Maria');
    expect(paramsEnviados()[0]).not.toMatch(/ {4,}/);
  });

  it('parâmetro vazio falha antes da rede e diz qual variável é', async () => {
    const r = await enviarTemplateCloud({ ...base, params: ['Carla', '', '11', '3'] });

    expect(r.ok).toBe(false);
    expect(r.reason).toContain('{{2}}');
    // O ponto do gate: nada foi para a Meta. Mandar produziria 400, e o motivo
    // dela não diria qual das quatro variáveis estava vazia.
    expect(chamadas).toHaveLength(0);
  });

  it('só-espaços conta como vazio', async () => {
    const r = await enviarTemplateCloud({ ...base, params: ['Carla', '   ', '11', '3'] });
    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it('null e undefined na lista contam como vazio — era o caso do contador', async () => {
    const r = await enviarTemplateCloud({ ...base, params: ['Carla', null as any, '11', '3'] });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('{{2}}');

    const r2 = await enviarTemplateCloud({ ...base, params: ['Carla', '8', undefined as any, '3'] });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain('{{3}}');
    expect(chamadas).toHaveLength(0);
  });

  it('o sufixo do botão passa pela mesma régua', async () => {
    const r = await enviarTemplateCloud({
      ...base, template: 'conteudo_semana_v2',
      params: ['Carla', '5', 'Escuta ativa'], botaoParam: '  ',
    });

    expect(r.ok).toBe(false);
    expect(r.reason).toContain('botão');
    expect(chamadas).toHaveLength(0);
  });
});

describe('a regra é do parâmetro, não do corpo', () => {
  it('o corpo do catálogo segue livre para ter quebra de linha', () => {
    // Se alguém "corrigir" isto achando que a regra do parâmetro vale para o
    // corpo, o layout de lista de todos os templates morre de uma vez.
    const comQuebra = Object.values(TEMPLATES).filter((t) => t.body.includes('\n'));
    expect(comQuebra.length).toBeGreaterThan(0);
    expect(TEMPLATES.resumo_equipe_semanal.body).toContain('\n');
  });

  it('o resumo do gestor cabe na régua de proporção da Meta', () => {
    // ~3 palavras fixas por variável, +1. Abaixo disso a Meta rejeita por
    // "too many variable parameters relative to the message length".
    const body = TEMPLATES.resumo_equipe_semanal.body;
    const vars = body.match(/\{\{\d+\}\}/g) ?? [];
    const palavras = body.replace(/\{\{\d+\}\}/g, ' ').split(/\s+/).filter(Boolean);

    expect(vars).toHaveLength(4);
    expect(palavras.length).toBeGreaterThanOrEqual(3 * vars.length + 1);
    expect(body.length).toBeLessThanOrEqual(1024);
    expect(TEMPLATES.resumo_equipe_semanal.example).toHaveLength(vars.length);
    // Não começa nem termina com variável, e não tem duas coladas.
    expect(body.trimStart().startsWith('{{')).toBe(false);
    expect(body.trimEnd().endsWith('}}')).toBe(false);
    expect(/\}\}[\s\W]{0,2}\{\{/.test(body)).toBe(false);
  });
});
