// A pílula pela Cloud API, com template aprovado.
//
// Este caminho fica atrás de `WHATSAPP_TEMPLATE_PILULA` porque template não
// aprovado é recusado com 132001 — e do ponto de vista da pessoa a pílula
// simplesmente não chega. Em 15/08/2026, 12 dos 16 templates da conta estavam
// PENDING. Ligar antes de aprovar trocaria um canal que às vezes funciona por um
// que não funciona nunca.
//
// Os testes exercitam os DOIS ramos — chave declarada que ninguém lê já custou
// caro nesta base, e um ramo que só roda em produção é um ramo não testado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ envios: [] as any[], resultado: { ok: true, providerMessageId: 'wamid.T1' } as any }));

vi.mock('@/lib/whatsapp/cloud-api', () => ({
  cloudApiConfigurada: () => true,
  enviarTemplateCloud: async (input: any, meta: any) => {
    h.envios.push({ input, meta });
    return h.resultado;
  },
}));

const { enviarPilulaPorTemplate, caminhoDoBotao, templatePilulaAtivo } =
  await import('@/lib/notifications/pilula-template');

const base = {
  telefone: '5511999998888',
  nome: 'Maria',
  semana: 5,
  tema: 'Escuta ativa na sala de aula',
  slug: 'ibipeba',
  baseUrl: 'https://ibipeba.vertho.ai',
  formato: 'video',
  pilula: 2,
  empresaId: 'e1',
  colaboradorId: 'c1',
  dedupeKey: 'ultima_pilula1_whatsapp_em:env1',
};

beforeEach(() => {
  h.envios.length = 0;
  h.resultado = { ok: true, providerMessageId: 'wamid.T1' };
  delete process.env.WHATSAPP_TEMPLATE_PILULA;
});
afterEach(() => { delete process.env.WHATSAPP_TEMPLATE_PILULA; });

describe('o caminho só liga quando o template está aprovado', () => {
  it('🔴 sem a chave, NÃO tenta — o legado segue valendo', async () => {
    const r = await enviarPilulaPorTemplate(base);
    expect(r.tentou).toBe(false);
    expect(h.envios).toHaveLength(0);
  });

  it('chave vazia ou só com espaço também não liga', async () => {
    for (const v of ['', '   ']) {
      process.env.WHATSAPP_TEMPLATE_PILULA = v;
      expect(templatePilulaAtivo()).toBeNull();
      expect((await enviarPilulaPorTemplate(base)).tentou).toBe(false);
    }
  });

  it('com a chave, envia pelo template e diz que tentou', async () => {
    process.env.WHATSAPP_TEMPLATE_PILULA = 'conteudo_semana_v2';
    const r = await enviarPilulaPorTemplate(base);

    expect(r).toEqual({ tentou: true, ok: true, reason: undefined });
    expect(h.envios[0].input.template).toBe('conteudo_semana_v2');
  });

  it('falha da Meta volta como tentou+erro — o chamador NÃO cai no legado', async () => {
    // Cair no legado aqui mandaria a MESMA pílula duas vezes se a primeira
    // tiver saído: a Meta pode ter aceitado e falhado depois.
    process.env.WHATSAPP_TEMPLATE_PILULA = 'conteudo_semana_v2';
    h.resultado = { ok: false, reason: 'Cloud API HTTP 400: template not approved (132001)' };

    const r = await enviarPilulaPorTemplate(base);
    expect(r.tentou).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/132001/);
  });
});

describe('parâmetros do template', () => {
  beforeEach(() => { process.env.WHATSAPP_TEMPLATE_PILULA = 'conteudo_semana_v2'; });

  it('a ordem do corpo é contrato: nome, semana, tema', async () => {
    await enviarPilulaPorTemplate(base);
    expect(h.envios[0].input.params).toEqual(['Maria', '5', 'Escuta ativa na sala de aula']);
  });

  it('🔴 o botão recebe o SUFIXO, nunca a URL inteira', async () => {
    // A URL fixa mora no template, na Meta. Mandar a URL completa produziria
    // `/ir/https://…` — sem erro na API e quebrado para quem recebe.
    await enviarPilulaPorTemplate(base);
    const p = h.envios[0].input.botaoParam;
    expect(p).toBe('ibipeba/5/video/2');
    expect(p).not.toMatch(/^https?:/);
  });

  it('a telemetria vai com empresa, colaborador e dedupe', async () => {
    await enviarPilulaPorTemplate(base);
    expect(h.envios[0].meta).toMatchObject({
      motivo: 'pilula', empresaId: 'e1', colaboradorId: 'c1',
      dedupeKey: 'ultima_pilula1_whatsapp_em:env1',
    });
  });
});

describe('🔴 contrato POR TEMPLATE — cada aprovado tem o seu', () => {
  it('pilula_semanal: formato, tema e LINK no corpo, sem botão', async () => {
    // Estrutura real do template aprovado em 15/08: {{1}}=formato, {{2}}=tema,
    // {{3}}=link. Mandar [nome, semana, tema] aqui entregaria "Seu Maria de
    // hoje: *5*" a gente de verdade.
    process.env.WHATSAPP_TEMPLATE_PILULA = 'pilula_semanal';
    await enviarPilulaPorTemplate(base);

    const { params, botaoParam } = h.envios[0].input;
    expect(params[1]).toBe('Escuta ativa na sala de aula');
    expect(params[2]).toBe('https://ibipeba.vertho.ai/dashboard/temporada/semana/5?formato=video&p=2');
    expect(params[0]).not.toBe('Maria');       // {{1}} é o FORMATO, não o nome
    expect(botaoParam).toBeNull();             // este template não tem botão
  });

  it('conteudo_semana_v2: nome, semana, tema — e o link no BOTÃO', async () => {
    process.env.WHATSAPP_TEMPLATE_PILULA = 'conteudo_semana_v2';
    await enviarPilulaPorTemplate(base);

    const { params, botaoParam } = h.envios[0].input;
    expect(params).toEqual(['Maria', '5', 'Escuta ativa na sala de aula']);
    expect(botaoParam).toBe('ibipeba/5/video/2');
  });

  it('🔴 template DESCONHECIDO não envia — fail-closed', async () => {
    // Parâmetro no formato errado não quebra o build: quebra a mensagem de
    // quem recebe. Sem contrato, o certo é não mandar.
    process.env.WHATSAPP_TEMPLATE_PILULA = 'template_que_nao_mapeamos';
    const r = await enviarPilulaPorTemplate(base);
    expect(r.tentou).toBe(false);
    expect(h.envios).toHaveLength(0);
  });
});

describe('caminho do botão', () => {
  it('sem formato, para na semana — o caminho é posicional', () => {
    expect(caminhoDoBotao({ slug: 'macae', semana: 3, formato: null, pilula: 2 })).toBe('macae/3');
  });

  it('com formato e sem pílula, para no formato', () => {
    expect(caminhoDoBotao({ slug: 'macae', semana: 3, formato: 'audio', pilula: null })).toBe('macae/3/audio');
  });

  it('completo, leva os quatro segmentos', () => {
    expect(caminhoDoBotao({ slug: 'ibipeba', semana: 12, formato: 'texto', pilula: 1 })).toBe('ibipeba/12/texto/1');
  });
});
