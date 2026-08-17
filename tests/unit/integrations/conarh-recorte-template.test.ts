// O recorte do CONARH pela Cloud API — o papel `recorte`.
//
// 🔴 Medido em 17/08/2026: os 4 call-sites de WhatsApp do CONARH usavam
// `sendWhatsapp` (legado → Z-API), desconectada desde 11/08. Foram **388
// falhas** com "zapi: saúde: desconectada", a última **um segundo depois** de um
// lead entrar às 19:56. O recorte simplesmente não saía, e nada no produto
// dizia isso.
//
// ⚠️ O lead é contato FRIO: nunca escreveu para o nosso número. Fora da janela
// de 24h só sai TEMPLATE — texto livre volta 131047. Por isso a troca não é de
// canal, é de FORMATO: o detalhe variável (porta, competência crítica, reunião
// marcada) não cabe, porque template não tem bloco condicional e todo `{{n}}`
// precisa de valor sempre.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = { envios: [] as any[], resultado: { ok: true, providerMessageId: 'wamid.R1' } };

vi.mock('@/lib/whatsapp/cloud-api', () => ({
  enviarTemplateCloud: async (input: any) => { h.envios.push({ input }); return h.resultado; },
  cloudApiConfigurada: () => true,
}));

const { enviarPorTemplate } = await import('@/lib/notifications/pilula-template');

const base = {
  telefone: '5511999999999',
  nome: 'Maria',
  semana: 1, tema: '', slug: '', baseUrl: '',
  formato: null, pilula: null,
  empresaId: null, colaboradorId: null, dedupeKey: null,
};

function limpar() {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('WHATSAPP_TEMPLATE_')) delete process.env[k];
  }
}
beforeEach(() => { h.envios.length = 0; h.resultado = { ok: true, providerMessageId: 'wamid.R1' }; limpar(); });
afterEach(limpar);

describe('papel `recorte`', () => {
  it('🔴 sem a env, NÃO tenta — o legado segue valendo, sem regressão', () => {
    // É o estado enquanto o template está PENDING na Meta. Ligar antes da
    // aprovação faria toda mensagem voltar 132001.
    return enviarPorTemplate('recorte', { ...base, linkDireto: 'https://app.vertho.ai/conarh/mapa/abc' })
      .then((r) => {
        expect(r.tentou).toBe(false);
        expect(h.envios).toHaveLength(0);
      });
  });

  it('recorte_demonstracao: nome e link do Mapa — 2 variáveis', async () => {
    process.env.WHATSAPP_TEMPLATE_RECORTE = 'recorte_demonstracao';
    await enviarPorTemplate('recorte', { ...base, linkDireto: 'https://app.vertho.ai/conarh/mapa/abc123' });

    const { template, params, botaoParam } = h.envios[0].input;
    expect(template).toBe('recorte_demonstracao');
    expect(params).toEqual(['Maria', 'https://app.vertho.ai/conarh/mapa/abc123']);
    expect(botaoParam).toBeNull();
  });

  it('🔴 o link vem de `linkDireto`, NÃO de `baseUrl`', async () => {
    // O Mapa vive em `app.vertho.ai` e o lead não tem tenant. Se o contrato
    // usasse `baseUrl` (como todos os outros papéis), o link sairia vazio ou
    // apontando para o subdomínio errado — e o recorte prometido não abriria.
    process.env.WHATSAPP_TEMPLATE_RECORTE = 'recorte_demonstracao';
    await enviarPorTemplate('recorte', {
      ...base,
      baseUrl: 'https://ibipeba.vertho.ai',
      linkDireto: 'https://app.vertho.ai/conarh/mapa/xyz',
    });
    expect(h.envios[0].input.params[1]).toBe('https://app.vertho.ai/conarh/mapa/xyz');
  });

  it('a chave do recorte é independente dos outros papéis', async () => {
    process.env.WHATSAPP_TEMPLATE_PILULA = 'conteudo_semana';
    expect((await enviarPorTemplate('recorte', base)).tentou).toBe(false);
  });

  it('🔴 nome desconhecido na env não envia — fail-closed', async () => {
    // Sem contrato, `CONTRATOS` não sabe montar os params. Enviar "às cegas"
    // produziria uma mensagem com variáveis trocadas para um PROSPECT.
    process.env.WHATSAPP_TEMPLATE_RECORTE = 'template_que_nao_existe';
    const r = await enviarPorTemplate('recorte', { ...base, linkDireto: 'https://x' });
    // `tentou: false` e não `ok: false`: o contrato de retorno distingue "não
    // tentei" de "tentei e falhou" — e é essa diferença que faz o chamador
    // escolher entre cair no legado ou parar. Ver o ramo no `artefato/route.ts`.
    expect(r.tentou).toBe(false);
    expect(h.envios).toHaveLength(0);
  });
});
