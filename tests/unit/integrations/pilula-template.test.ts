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

const { enviarPilulaPorTemplate, enviarPorTemplate, caminhoDoBotao, templatePilulaAtivo } =
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
  delete process.env.WHATSAPP_TEMPLATE_EVIDENCIA;
  delete process.env.WHATSAPP_TEMPLATE_DESAFIO;
  delete process.env.WHATSAPP_TEMPLATE_RETOMADA;
  delete process.env.WHATSAPP_TEMPLATE_PERFIL;
});
afterEach(() => {
  delete process.env.WHATSAPP_TEMPLATE_PILULA;
  delete process.env.WHATSAPP_TEMPLATE_EVIDENCIA;
  delete process.env.WHATSAPP_TEMPLATE_DESAFIO;
  delete process.env.WHATSAPP_TEMPLATE_RETOMADA;
  delete process.env.WHATSAPP_TEMPLATE_PERFIL;
});

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

  it('✅ conteudo_semana (UTILITY, o preferido): nome, semana, tema e LINK no corpo', async () => {
    // Aprovado como UTILITY em 15/08 — custa 6× menos que o pilula_semanal pela
    // mesma entrega. Corpo conferido na Meta antes de mapear: 4 variáveis.
    process.env.WHATSAPP_TEMPLATE_PILULA = 'conteudo_semana';
    await enviarPilulaPorTemplate(base);

    const { params, botaoParam } = h.envios[0].input;
    expect(params).toEqual([
      'Maria', '5', 'Escuta ativa na sala de aula',
      'https://ibipeba.vertho.ai/dashboard/temporada/semana/5?formato=video&p=2',
    ]);
    expect(botaoParam).toBeNull();
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

describe('🔴 a quinta tem DOIS papéis, e trocá-los é entregar a cobrança errada', () => {
  // Semana de aplicação cobra EVIDÊNCIA; semana de conteúdo cobra o DESAFIO. Os
  // dois templates têm a MESMA forma (3 variáveis), então trocar um pelo outro
  // não quebra nada — só manda a mensagem errada para a pessoa certa.
  it('evidencia: nome, semana e link da SEMANA (sem formato)', async () => {
    process.env.WHATSAPP_TEMPLATE_EVIDENCIA = 'registro_evidencia';
    await enviarPorTemplate('evidencia', { ...base, tema: '', formato: null, pilula: null });

    const { template, params, botaoParam } = h.envios[0].input;
    expect(template).toBe('registro_evidencia');
    expect(params).toEqual(['Maria', '5', 'https://ibipeba.vertho.ai/dashboard/temporada/semana/5']);
    expect(botaoParam).toBeNull();
  });

  it('desafio usa o SEU template, não o da evidência', async () => {
    process.env.WHATSAPP_TEMPLATE_DESAFIO = 'registro_desafio';
    await enviarPorTemplate('desafio', { ...base, tema: '', formato: null, pilula: null });
    expect(h.envios[0].input.template).toBe('registro_desafio');
  });

  it('cada papel tem a SUA chave — ligar a pílula não liga a quinta', async () => {
    process.env.WHATSAPP_TEMPLATE_PILULA = 'conteudo_semana';
    expect((await enviarPorTemplate('evidencia', base)).tentou).toBe(false);
    expect((await enviarPorTemplate('desafio', base)).tentou).toBe(false);
    expect((await enviarPorTemplate('pilula', base)).tentou).toBe(true);
  });

  it('o `kind` da telemetria separa os papéis — senão a métrica funde os três', async () => {
    process.env.WHATSAPP_TEMPLATE_EVIDENCIA = 'registro_evidencia';
    await enviarPorTemplate('evidencia', base);
    expect(h.envios[0].meta.motivo).toBe('evidencia');
  });
});

describe('retomada de inatividade — UTILITY no lugar do MARKETING', () => {
  it('retomada_trilha: nome e link, 2 variáveis', async () => {
    // Substitui o `nudge_inatividade` (MARKETING): mesma função, 6× menos. A
    // diferença entre os dois é só a VOZ do texto — e é ela que a Meta cobra.
    process.env.WHATSAPP_TEMPLATE_RETOMADA = 'retomada_trilha';
    await enviarPorTemplate('retomada', { ...base, tema: '', formato: null, pilula: null });

    const { template, params } = h.envios[0].input;
    expect(template).toBe('retomada_trilha');
    expect(params).toEqual(['Maria', 'https://ibipeba.vertho.ai/dashboard/temporada/semana/5']);
  });

  it('a chave da retomada é independente das outras', async () => {
    process.env.WHATSAPP_TEMPLATE_PILULA = 'conteudo_semana';
    expect((await enviarPorTemplate('retomada', base)).tentou).toBe(false);
  });
});

describe('perfil pronto — o template aprovado que não tinha consumidor', () => {
  it('resultado_perfil: nome e link do perfil comportamental', async () => {
    // Aprovado desde sempre, copy pronta em lib/notifications.ts, e NINGUÉM
    // chamava: ~120 pessoas responderam a avaliação e nunca souberam do
    // resultado. Mesma classe do `listarNaoResolvidas` sem tela.
    process.env.WHATSAPP_TEMPLATE_PERFIL = 'resultado_perfil';
    await enviarPorTemplate('perfil', { ...base, tema: '', formato: null, pilula: null });

    const { template, params } = h.envios[0].input;
    expect(template).toBe('resultado_perfil');
    expect(params).toEqual(['Maria', 'https://ibipeba.vertho.ai/dashboard/perfil-comportamental']);
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
