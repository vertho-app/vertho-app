// Piloto de suporte automático no WhatsApp: elegibilidade, contrato com a IA,
// contenção e envio. Tudo mockado — nenhuma rede, nenhum banco.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  respostaIA: '{"intencao":"acesso","resposta":"Oi! Aqui é o Beto 👋 Tente gerar um novo link em /entrar.","precisa_humano":false,"acao":"responder"}',
  chamadasIA: [] as any[],
  envios: [] as any[],
  falharEnvio: '',
  degradacoes: [] as any[],
  internosGlobais: [] as any[],
  erroLeitura: null as any,
  demoBlocked: false,
  chamadasTdb: [] as any[],
  empresaNomeBanco: 'Acme',
  recebidas: [] as any[],
  enviadas: [] as any[],
  midiaUrl: { ok: true, url: 'https://meta.test/audio', mime: 'audio/ogg; codecs=opus' } as any,
  midiaDownload: { ok: true, body: new Uint8Array([1, 2, 3]).buffer, mime: 'audio/ogg' } as any,
}));

vi.mock('@/actions/ai-client', () => ({
  callAI: async (...args: any[]) => {
    h.chamadasIA.push(args);
    return h.respostaIA;
  },
}));

vi.mock('@/lib/whatsapp/cloud-api', () => ({
  enviarTextoCloud: async (input: any, meta: any) => {
    h.envios.push({ input, meta });
    if (h.falharEnvio) return { ok: false, reason: h.falharEnvio };
    return { ok: true, providerMessageId: 'wamid.AUTO1' };
  },
  urlDaMidia: async () => h.midiaUrl,
  baixarMidia: async () => h.midiaDownload,
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantDb: (empresaId: string) => {
    h.chamadasTdb.push(empresaId);
    const builder = (tabela: string, raw = false) => {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.is = () => b;
      b.in = () => b;
      b.order = () => b;
      b.ilike = () => b;
      b.or = async () => h.erroLeitura
        ? { data: null, error: { message: h.erroLeitura } }
        : { data: raw && tabela === 'colaboradores' ? h.internosGlobais : [], error: null };
      b.maybeSingle = async () => {
        if (h.erroLeitura) return { data: null, error: { message: h.erroLeitura } };
        if (raw && tabela === 'empresas') return { data: { nome: h.empresaNomeBanco }, error: null };
        return { data: null, error: null };
      };
      b.limit = async () => {
        if (h.erroLeitura) return { data: null, error: { message: h.erroLeitura } };
        if (tabela === 'whatsapp_mensagens_recebidas') return { data: h.recebidas, error: null };
        if (tabela === 'whatsapp_mensagens_enviadas') return { data: h.enviadas, error: null };
        return { data: [], error: null };
      };
      return b;
    };
    return {
      from: (tabela: string) => builder(tabela),
      raw: { from: (tabela: string) => builder(tabela, true) },
    };
  },
}));

vi.mock('@/lib/demo/envio-guard', () => ({
  gateEnvioDemo: async () => (h.demoBlocked ? { blocked: true, motivo: 'demo' } : { blocked: false }),
  isTenantDemo: async () => h.demoBlocked,
}));

vi.mock('@/lib/degradacao', () => ({
  DEGRADACAO: { WHATSAPP_STATUS_PERDIDO: 'whatsapp-status-perdido' },
  registrarDegradacao: async (d: any) => {
    h.degradacoes.push(d);
  },
}));

import {
  elegivelParaAuto,
  executarSuporteAuto,
  resetSuporteAutoMemoria,
  SUPORTE_AUTO_MODEL,
  SUPORTE_AUTO_TASK_KEY,
  type EntradaSuporte,
} from '@/lib/whatsapp/suporte-auto';

const ACME = 'emp-acme';

const base: EntradaSuporte = {
  fromPhone: '5511973882303',
  waMessageId: 'wamid.P1',
  tipo: 'text',
  texto: 'não consigo entrar, meu link expirou',
  numeroId: '1256487020887128',
  empresaId: 'emp-1',
  empresaNome: 'Empresa errada do resolver',
  colaboradorId: 'col-1',
  ambiguidade: null,
};

beforeEach(() => {
  h.chamadasIA = [];
  h.envios = [];
  h.falharEnvio = '';
  h.degradacoes = [];
  h.internosGlobais = [{
    id: 'col-demo', empresa_id: 'emp-1', email: 'rodrigo@vertho.ai',
    nome_completo: 'Rodrigo', cargo: 'Dono',
  }];
  h.erroLeitura = null;
  h.demoBlocked = false;
  h.chamadasTdb = [];
  h.empresaNomeBanco = 'Acme';
  h.recebidas = [];
  h.enviadas = [];
  h.midiaUrl = { ok: true, url: 'https://meta.test/audio', mime: 'audio/ogg; codecs=opus' };
  h.midiaDownload = { ok: true, body: new Uint8Array([1, 2, 3]).buffer, mime: 'audio/ogg' };
  h.respostaIA =
    '{"intencao":"acesso","resposta":"Oi! Aqui é o Beto 👋 Tente gerar um novo link em /entrar.","precisa_humano":false,"acao":"responder"}';
  process.env.SUPORTE_AUTO_PILOTO_EMPRESA_ID = ACME;
  resetSuporteAutoMemoria();
});
describe('suporte-auto · piloto @vertho.ai na ACME', () => {
  it('telefone sem vínculo @vertho.ai não gasta IA nem envia', async () => {
    h.internosGlobais = [];
    const r = await executarSuporteAuto({ ...base, fromPhone: '5511999998888', waMessageId: 'wamid.X' });
    expect(r).toEqual({ enviou: false, motivo: 'fora-do-piloto' });
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios).toHaveLength(0);
  });

  it('áudio com mídia entra; tipo sem texto e palavra do VER não disparam', () => {
    expect(elegivelParaAuto({ ...base, tipo: 'audio', texto: null }).motivo).toBe('audio-sem-midia');
    expect(elegivelParaAuto({ ...base, tipo: 'audio', texto: null, mediaId: 'media-1' }).motivo).toBe('ok');
    expect(elegivelParaAuto({ ...base, tipo: 'image', texto: null }).motivo).toBe('tipo-sem-texto');
    expect(elegivelParaAuto({ ...base, texto: 'ver' }).motivo).toBe('fluxo-proprio');
    expect(elegivelParaAuto({ ...base, texto: 'parar' }).motivo).toBe('fluxo-proprio');
  });

  it('reentrega da Meta não responde duas vezes', async () => {
    const r1 = await executarSuporteAuto(base);
    const r2 = await executarSuporteAuto(base);
    expect(r1.enviou).toBe(true);
    expect(r2).toEqual({ enviou: false, motivo: 'reentrega' });
    expect(h.envios).toHaveLength(1);
  });

  it('vínculo @vertho.ai: atende como ACME mesmo se o webhook resolveu outro tenant', async () => {
    const r = await executarSuporteAuto(base);
    expect(r).toEqual({ enviou: true, motivo: 'auto:acesso' });
    expect(h.chamadasTdb).toEqual([ACME, ACME]);
    const [system, user, aiConfig, , options] = h.chamadasIA[0];
    // Id EXATO do catálogo (o ledger faz lookup exato; sufixo de esforço no id
    // nasceria com `cost_usd = null`). Nível de raciocínio vai em reasoningEffort.
    expect(aiConfig).toEqual({ model: 'gemini-3.8-flash' });
    expect(aiConfig).toEqual({ model: SUPORTE_AUTO_MODEL });
    expect(options.taskKey).toBe(SUPORTE_AUTO_TASK_KEY);
    expect(options.empresaId).toBe(ACME);
    expect(options.colaboradorId).toBeNull();
    expect(options.correlationId).toBeUndefined();
    expect(options.reasoningEffort).toBe('low');
    expect(options.timeoutMs).toBe(12000);
    expect(options.geminiResponseSchema).toMatchObject({
      type: 'object',
      required: ['intencao', 'resposta', 'precisa_humano', 'acao'],
    });
    expect(String(system)).toContain('Você é o Beto');
    expect(String(user)).toContain('Rodrigo');
    expect(String(user)).toContain('"empresa":"Acme"');
    expect(String(user)).not.toContain('Empresa errada do resolver');
    expect(String(user)).toContain('"empresa_conhecida":true');
    const envio = h.envios[0];
    expect(envio.meta.numeroId).toBe('1256487020887128');
    expect(envio.meta.dedupeKey).toBe('suporte-auto:wamid.P1');
    expect(envio.meta.motivo).toBe('suporte-auto');
    expect(envio.meta.origem).toBe('suporte-auto');
    expect(envio.meta.empresaId).toBe(ACME);
    expect(envio.meta.colaboradorId).toBeNull();
    expect(envio.meta.autorEmail ?? null).toBeNull();
  });

  it('duplicatas do mesmo e-mail interno são uma só identidade; id só é atribuído se pertence à ACME', async () => {
    h.empresaNomeBanco = 'ACME';
    h.internosGlobais = [
      { id: 'col-demo', empresa_id: 'emp-demo', email: 'RODRIGO@VERTHO.AI', nome_completo: 'Rodrigo', cargo: 'Dono' },
      { id: 'col-acme', empresa_id: ACME, email: 'rodrigo@vertho.ai', nome_completo: 'Rodrigo', cargo: 'Dono' },
    ];
    const r = await executarSuporteAuto({
      ...base,
      empresaId: null,
      empresaNome: null,
      colaboradorId: null,
      ambiguidade: 'telefone-em-multiplas-empresas',
      waMessageId: 'wamid.PIN',
    });
    expect(r.enviou).toBe(true);
    const [, user, , , options] = h.chamadasIA[0];
    expect(String(user)).toContain('"modo":"tenant-piloto"');
    expect(String(user)).toContain('"empresa":"ACME"');
    expect(String(user)).toContain('"empresa_conhecida":true');
    expect(String(user)).toContain('Rodrigo');
    expect(options.colaboradorId).toBe('col-acme');
  });

  it('dois e-mails internos no mesmo telefone falham fechados', async () => {
    h.internosGlobais = [
      { id: 'col-a', empresa_id: 'emp-a', email: 'ana@vertho.ai', nome_completo: 'Ana', cargo: null },
      { id: 'col-b', empresa_id: 'emp-b', email: 'bia@vertho.ai', nome_completo: 'Bia', cargo: null },
    ];
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.AMB' });
    expect(r).toEqual({ enviou: false, motivo: 'identidade-interna-ambigua' });
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios).toHaveLength(0);
    expect(h.degradacoes.some((d) => d.detalhe?.fase === 'identidade-interna-ambigua')).toBe(true);
  });

  it('revalida o domínio exato mesmo se o banco devolver um sufixo parecido', async () => {
    h.internosGlobais = [{
      id: 'col-falso', empresa_id: 'emp-1', email: 'alguem@vertho.ai.exemplo.com',
      nome_completo: 'Alguém', cargo: null,
    }];
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.DOM' });
    expect(r).toEqual({ enviou: false, motivo: 'fora-do-piloto' });
    expect(h.chamadasIA).toHaveLength(0);
  });

  it('falha de leitura da identidade não libera nem responde por contenção', async () => {
    h.erroLeitura = 'banco indisponível';
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.DB' });
    expect(r).toEqual({ enviou: false, motivo: 'falha-identidade-interna' });
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios).toHaveLength(0);
    expect(h.degradacoes).toContainEqual(expect.objectContaining({
      empresaId: ACME,
      colaboradorId: null,
      detalhe: expect.objectContaining({ fase: 'leitura-identidade-interna' }),
    }));
  });

  it('leva a conversa recente para a IA e não reinicia o atendimento a cada mensagem', async () => {
    const agora = Date.now();
    h.recebidas = [{
      wa_message_id: 'wamid.ANTIGA', empresa_id: 'emp-1', tipo: 'text',
      texto: 'não estou conseguindo acessar', recebida_em: new Date(agora - 60_000).toISOString(),
    }];
    h.enviadas = [{
      texto: 'Oi, Rodrigo! Sou o Beto, assistente virtual da Vertho. Qual é a sua empresa?',
      origem: 'cadencia', enviada_em: new Date(agora - 30_000).toISOString(),
    }];
    await executarSuporteAuto({ ...base, texto: 'acme', waMessageId: 'wamid.CONT' });
    const [system, user] = h.chamadasIA[0];
    expect(String(system)).toContain('NÃO repita seu nome');
    expect(String(user)).toContain('não estou conseguindo acessar');
    expect(String(user)).toContain('Qual é a sua empresa?');
    expect(String(user)).toContain('MENSAGEM_ATUAL: acme');
    expect(String(user)).toContain('"ja_conversou":true');
  });

  it('áudio: baixa da Meta e envia o binário inline para o Gemini', async () => {
    const r = await executarSuporteAuto({
      ...base,
      tipo: 'audio',
      texto: null,
      mediaId: 'media-1',
      waMessageId: 'wamid.AUDIO',
    });
    expect(r).toEqual({ enviou: true, motivo: 'auto:acesso' });
    const [, user, , , options] = h.chamadasIA[0];
    expect(String(user)).toContain('áudio do colaborador anexado');
    expect(options.geminiInlineData).toEqual({ mimeType: 'audio/ogg', data: 'AQID' });
  });

  it('áudio indisponível: responde na voz do Beto sem chamar a IA', async () => {
    h.midiaUrl = { ok: false, reason: 'mídia expirada' };
    const r = await executarSuporteAuto({
      ...base,
      tipo: 'audio',
      texto: null,
      mediaId: 'media-2',
      waMessageId: 'wamid.AUDIO2',
    });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-audio' });
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios[0].input.texto).toContain('Sou o Beto');
    expect(h.envios[0].input.texto).toContain('Não consegui ouvir');
    expect(h.degradacoes.some((d) => d.detalhe?.fase === 'audio')).toBe(true);
  });

  it('sem o pin da ACME falha fechado antes de consultar o banco', async () => {
    delete process.env.SUPORTE_AUTO_PILOTO_EMPRESA_ID;
    const r = await executarSuporteAuto({
      ...base,
      empresaId: null,
      empresaNome: null,
      colaboradorId: null,
      ambiguidade: 'telefone-em-multiplas-empresas',
      waMessageId: 'wamid.G1',
    });
    expect(r).toEqual({ enviou: false, motivo: 'piloto-sem-empresa' });
    expect(h.chamadasTdb).toHaveLength(0);
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios).toHaveLength(0);
  });

  it('IA fora do contrato: contenção fixa + degradação de parse', async () => {
    h.respostaIA = 'texto livre, sem json';
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.J1' });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-parse' });
    expect(h.envios[0].input.texto).toContain('Sou o Beto');
    expect(h.envios[0].input.texto).toContain('https://app.vertho.ai/entrar');
    expect(h.envios[0].input.texto).not.toContain('encaminhei para a equipe');
    expect(h.degradacoes.some((d) => d.detalhe?.fase === 'parse-ia')).toBe(true);
  });

  it('IA pedindo humano: contenção fixa, sem vazar o rascunho do modelo', async () => {
    h.respostaIA =
      '{"intencao":"pendencia","resposta":"RASCUNHO que não deve sair","precisa_humano":true,"acao":"escalar"}';
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.H1' });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-escala' });
    expect(h.envios[0].input.texto).not.toContain('RASCUNHO');
  });

  it('tenant demo: sem resposta automática e sem IA', async () => {
    h.demoBlocked = true;
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.D1' });
    expect(r).toEqual({ enviou: false, motivo: 'tenant-demo' });
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios).toHaveLength(0);
  });

  it('falha no envio (ex. janela 131047): sem segunda tentativa, com degradação', async () => {
    h.falharEnvio = 'Cloud API HTTP 400: Message failed to send (131047)';
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.F1' });
    expect(r.enviou).toBe(false);
    expect(r.motivo).toContain('falha-envio');
    expect(h.envios).toHaveLength(1);
    expect(h.degradacoes.some((d) => d.detalhe?.fase === 'envio')).toBe(true);
  });

  it('teto do piloto segura a rajada', async () => {
    for (let i = 0; i < 10; i++) {
      await executarSuporteAuto({ ...base, waMessageId: `wamid.T${i}` });
    }
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.T10' });
    expect(r).toEqual({ enviou: false, motivo: 'teto-piloto' });
    expect(h.envios).toHaveLength(10);
  });
});
