// Beto no WhatsApp (suporte automático): elegibilidade, identidade, guardas de
// conduta, contrato com a IA, contenção e envio. Tudo mockado: nenhuma rede,
// nenhum banco.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  respostaIA: '',
  erroIA: '' as string,
  chamadasIA: [] as any[],
  envios: [] as any[],
  falharEnvio: '',
  degradacoes: [] as any[],
  internosGlobais: [] as any[],
  erroLeitura: null as any,
  erroHistorico: null as any,
  demoBlocked: false,
  chamadasTdb: [] as any[],
  empresaNomeBanco: 'Acme',
  colaborador: null as any,
  recebidas: [] as any[],
  enviadas: [] as any[],
  midiaUrl: { ok: true, url: 'https://meta.test/audio', mime: 'audio/ogg; codecs=opus' } as any,
  midiaDownload: { ok: true, body: new Uint8Array([1, 2, 3]).buffer, mime: 'audio/ogg' } as any,
  linksAcesso: [] as any[],
  resultadoLink: { enviou: false, motivo: 'destino-ambiguo' } as any,
  identidadesPedidas: [] as any[],
  identidadeColab: null as any,
}));

vi.mock('@/actions/ai-client', () => ({
  callAI: async (...args: any[]) => {
    h.chamadasIA.push(args);
    if (h.erroIA) throw new Error(h.erroIA);
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

vi.mock('@/lib/whatsapp/beto-access-link', () => ({
  enviarLinkAcessoBeto: async (entrada: any) => {
    h.linksAcesso.push(entrada);
    return h.resultadoLink;
  },
  identidadeDeAcessoDoColaborador: async (...args: any[]) => {
    h.identidadesPedidas.push(args);
    return h.identidadeColab;
  },
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
        if (!raw && tabela === 'colaboradores') return { data: h.colaborador, error: null };
        return { data: null, error: null };
      };
      b.limit = async () => {
        if (h.erroLeitura || h.erroHistorico) return { data: null, error: { message: h.erroLeitura || h.erroHistorico } };
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
  DEGRADACAO: {
    SUPORTE_AUTO_FALHOU: 'suporte-auto-falhou',
    SUPORTE_AUTO_CONDUTA: 'suporte-auto-conduta',
  },
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
  ehPedidoClaroDeLink,
  type EntradaSuporte,
} from '@/lib/whatsapp/suporte-auto';
import {
  SAFETY_SETTINGS_SUPORTE,
  TEXTO_DENUNCIA,
  TEXTO_OFENSA,
  TEXTO_SOFRIMENTO,
} from '@/lib/whatsapp/suporte-conduta';

const ACME = 'emp-acme';

function ia(campos: Record<string, unknown> = {}): string {
  return JSON.stringify({
    intencao: 'acesso',
    tom_usuario: 'neutro',
    continua_escalada: false,
    solicita_link: false,
    resposta: 'Oi! Aqui é o Beto 👋 Tente gerar um novo link em https://app.vertho.ai/entrar.',
    precisa_humano: false,
    acao: 'responder',
    ...campos,
  });
}

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

/** Colaborador comum: o telefone não tem vínculo `@vertho.ai`. */
const colab: EntradaSuporte = {
  ...base,
  fromPhone: '5574999225966',
  waMessageId: 'wamid.C1',
  texto: 'o vídeo da semana não carrega',
  empresaId: 'emp-ibipeba',
  empresaNome: 'Ibipeba',
  colaboradorId: 'col-ana',
};

const horaAtras = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

beforeEach(() => {
  h.chamadasIA = [];
  h.erroIA = '';
  h.envios = [];
  h.falharEnvio = '';
  h.degradacoes = [];
  h.internosGlobais = [{
    id: 'col-demo', empresa_id: 'emp-1', email: 'rodrigo@vertho.ai',
    nome_completo: 'Rodrigo', cargo: 'Dono',
  }];
  h.erroLeitura = null;
  h.erroHistorico = null;
  h.demoBlocked = false;
  h.chamadasTdb = [];
  h.empresaNomeBanco = 'Acme';
  h.colaborador = { id: 'col-ana', nome_completo: 'Ana Souza', cargo: 'Professora' };
  h.recebidas = [];
  h.enviadas = [];
  h.midiaUrl = { ok: true, url: 'https://meta.test/audio', mime: 'audio/ogg; codecs=opus' };
  h.midiaDownload = { ok: true, body: new Uint8Array([1, 2, 3]).buffer, mime: 'audio/ogg' };
  h.linksAcesso = [];
  h.resultadoLink = { enviou: false, motivo: 'destino-ambiguo' };
  h.identidadesPedidas = [];
  h.identidadeColab = {
    ok: true,
    email: 'ana@escola.gov.br',
    nome: 'Ana Souza',
    vinculos: [{ id: 'col-ana', empresaId: 'emp-ibipeba', loginPorWhatsapp: true }],
    gravarEmailProxyEm: null,
  };
  h.respostaIA = ia();
  process.env.SUPORTE_AUTO_PILOTO_EMPRESA_ID = ACME;
  delete process.env.SUPORTE_AUTO_ESCOPO;
  resetSuporteAutoMemoria();
});

describe('suporte-auto · equipe @vertho.ai na ACME (piloto, inalterado)', () => {
  it('separa pedido de login de dúvida sobre conteúdo dentro do app', () => {
    expect(ehPedidoClaroDeLink('meu link expirou')).toBe(true);
    expect(ehPedidoClaroDeLink('não consigo entrar')).toBe(true);
    expect(ehPedidoClaroDeLink('erro no meu acesso')).toBe(true);
    expect(ehPedidoClaroDeLink('acesso')).toBe(true);
    expect(ehPedidoClaroDeLink('não consigo acessar o vídeo')).toBe(false);
    expect(ehPedidoClaroDeLink('erro na atividade da semana')).toBe(false);
  });

  it('pedido claro entrega link sem gastar Gemini nem mandar resposta duplicada', async () => {
    h.resultadoLink = { enviou: true, motivo: 'link-plataforma' };
    const r = await executarSuporteAuto(base);
    expect(r).toEqual({ enviou: true, motivo: 'link-acesso-enviado' });
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios).toHaveLength(0);
    expect(h.linksAcesso).toEqual([expect.objectContaining({
      empresaBaseId: ACME,
      email: 'rodrigo@vertho.ai',
      telefone: base.fromPhone,
      numeroId: base.numeroId,
      waMessageId: base.waMessageId,
      vinculos: [expect.objectContaining({ empresaId: 'emp-1' })],
    })]);
    expect(h.linksAcesso[0].origem).toBeUndefined();
  });

  it('dúvida sobre vídeo não gera link e segue para orientação do Beto', async () => {
    h.resultadoLink = { enviou: true, motivo: 'link-plataforma' };
    const r = await executarSuporteAuto({
      ...base,
      texto: 'não consigo acessar o vídeo da semana',
      waMessageId: 'wamid.VIDEO',
    });
    expect(r).toEqual({ enviou: true, motivo: 'auto:acesso' });
    expect(h.linksAcesso).toHaveLength(0);
    expect(h.chamadasIA).toHaveLength(1);
    expect(h.envios).toHaveLength(1);
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
    expect(options.geminiSafetySettings).toEqual(SAFETY_SETTINGS_SUPORTE);
    expect(options.geminiResponseSchema).toMatchObject({
      type: 'object',
      required: ['intencao', 'tom_usuario', 'continua_escalada', 'solicita_link', 'resposta', 'precisa_humano', 'acao'],
    });
    expect(String(system)).toContain('Você é o Beto');
    expect(String(system)).toContain('Nunca use palavrão');
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

  it('revalida o domínio exato: sufixo parecido não é equipe', async () => {
    process.env.SUPORTE_AUTO_ESCOPO = 'interno';
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
      tipo: 'suporte-auto-falhou',
      empresaId: ACME,
      colaboradorId: null,
      detalhe: expect.objectContaining({ fase: 'leitura-identidade-interna' }),
    }));
  });

  it('leva a conversa recente para a IA e não reinicia o atendimento a cada mensagem', async () => {
    h.recebidas = [{
      wa_message_id: 'wamid.ANTIGA', empresa_id: 'emp-1', tipo: 'text',
      texto: 'não estou conseguindo acessar', recebida_em: horaAtras(0.02),
    }];
    h.enviadas = [{
      texto: 'Oi, Rodrigo! Sou o Beto, assistente virtual da Vertho. Qual é a sua empresa?',
      origem: 'cadencia', enviada_em: horaAtras(0.01),
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

  it('áudio pedindo acesso usa a IA só para entender e entrega o link determinístico', async () => {
    h.resultadoLink = { enviou: true, motivo: 'link-plataforma' };
    h.respostaIA = ia({ solicita_link: true, resposta: 'Vou te ajudar com o acesso.' });
    const r = await executarSuporteAuto({
      ...base,
      tipo: 'audio',
      texto: null,
      mediaId: 'media-link',
      waMessageId: 'wamid.AUDIO-LINK',
    });
    expect(r).toEqual({ enviou: true, motivo: 'link-acesso-enviado' });
    expect(h.chamadasIA).toHaveLength(1);
    expect(h.linksAcesso).toHaveLength(1);
    expect(h.envios).toHaveLength(0);
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

  it('IA fora do contrato: contenção fixa + degradação de parse', async () => {
    h.respostaIA = 'texto livre, sem json';
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.J1' });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-parse' });
    expect(h.envios[0].input.texto).toContain('Sou o Beto');
    expect(h.envios[0].input.texto).toContain('https://app.vertho.ai/entrar');
    expect(h.envios[0].input.texto).not.toContain('encaminhei para a equipe');
    expect(h.degradacoes.some((d) => d.detalhe?.fase === 'parse-ia')).toBe(true);
  });

  it('IA sem tom_usuario também é fora do contrato', async () => {
    h.respostaIA = JSON.stringify({
      intencao: 'duvida', continua_escalada: false, solicita_link: false, resposta: 'Oi', precisa_humano: false, acao: 'responder',
    });
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.J2' });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-parse' });
  });

  it('IA pedindo humano: contenção fixa, sem vazar o rascunho do modelo', async () => {
    h.respostaIA = ia({ intencao: 'pendencia', resposta: 'RASCUNHO que não deve sair', precisa_humano: true, acao: 'escalar' });
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.H1' });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-escala' });
    expect(h.envios[0].input.texto).not.toContain('RASCUNHO');
    // Mesmo sendo sobre acesso: se o modelo pediu uma pessoa, "gere outro link"
    // já não resolveu.
    expect(h.envios[0].input.texto).toContain('deixei com a equipe da Vertho');
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

  it('teto por hora em memória segura a rajada', async () => {
    for (let i = 0; i < 10; i++) {
      await executarSuporteAuto({ ...base, waMessageId: `wamid.T${i}` });
    }
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.T10' });
    expect(r).toEqual({ enviou: false, motivo: 'teto-piloto' });
    expect(h.envios).toHaveLength(10);
  });
});

describe('suporte-auto · qualquer colaborador (aberto em 22/09/2026)', () => {
  beforeEach(() => {
    // Telefone do colaborador não tem vínculo @vertho.ai.
    h.internosGlobais = [];
    h.empresaNomeBanco = 'Prefeitura de Ibipeba';
  });

  it('atende no tenant resolvido pelo webhook, com nome e cargo do cadastro', async () => {
    const r = await executarSuporteAuto(colab);
    expect(r).toEqual({ enviou: true, motivo: 'auto:acesso' });
    // 1º: pin (busca da equipe), 2º: pessoa, 3º: conversa.
    expect(h.chamadasTdb).toEqual([ACME, 'emp-ibipeba', 'emp-ibipeba']);
    const [, user, , , options] = h.chamadasIA[0];
    expect(String(user)).toContain('"modo":"colaborador"');
    expect(String(user)).toContain('"empresa":"Prefeitura de Ibipeba"');
    expect(String(user)).toContain('Ana Souza');
    expect(String(user)).toContain('Professora');
    expect(options.empresaId).toBe('emp-ibipeba');
    expect(options.colaboradorId).toBe('col-ana');
    expect(options.geminiSafetySettings).toEqual(SAFETY_SETTINGS_SUPORTE);
    expect(h.envios[0].meta).toEqual(expect.objectContaining({
      empresaId: 'emp-ibipeba',
      colaboradorId: 'col-ana',
      origem: 'suporte-auto',
      dedupeKey: 'suporte-auto:wamid.C1',
    }));
  });

  it('sem o pin da equipe, o colaborador é atendido do mesmo jeito', async () => {
    delete process.env.SUPORTE_AUTO_PILOTO_EMPRESA_ID;
    const r = await executarSuporteAuto(colab);
    expect(r.enviou).toBe(true);
    expect(h.chamadasTdb).toEqual(['emp-ibipeba', 'emp-ibipeba']);
  });

  it('telefone sem empresa (desconhecido ou em várias) fica só com a equipe', async () => {
    for (const ambiguidade of ['telefone-desconhecido', 'telefone-em-multiplas-empresas']) {
      const r = await executarSuporteAuto({
        ...colab, empresaId: null, empresaNome: null, colaboradorId: null, ambiguidade,
        waMessageId: `wamid.${ambiguidade}`,
      });
      expect(r).toEqual({ enviou: false, motivo: 'sem-empresa' });
    }
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios).toHaveLength(0);
  });

  it('erro na resolução do dono vira degradação, sem resposta', async () => {
    const r = await executarSuporteAuto({
      ...colab, empresaId: null, colaboradorId: null, ambiguidade: 'erro-na-resolucao: timeout',
    });
    expect(r).toEqual({ enviou: false, motivo: 'sem-empresa' });
    expect(h.degradacoes.some((d) => d.detalhe?.fase === 'resolucao-dono')).toBe(true);
  });

  it('telefone de duas pessoas da mesma empresa: atende sem nome e sem link', async () => {
    const r = await executarSuporteAuto({
      ...colab, colaboradorId: null, ambiguidade: 'telefone-em-multiplas-pessoas',
      texto: 'meu link expirou', waMessageId: 'wamid.DUAS',
    });
    expect(r.enviou).toBe(true);
    expect(h.identidadesPedidas).toHaveLength(0);
    expect(h.linksAcesso).toHaveLength(0);
    const [, user, , , options] = h.chamadasIA[0];
    expect(String(user)).toContain('"pessoa":{"nome":null,"cargo":null}');
    expect(options.colaboradorId).toBeNull();
  });

  it('pedido claro de link: identidade revalidada e link com origem colaborador', async () => {
    h.resultadoLink = { enviou: true, motivo: 'link-tenant' };
    const r = await executarSuporteAuto({ ...colab, texto: 'meu link expirou', waMessageId: 'wamid.LINK' });
    expect(r).toEqual({ enviou: true, motivo: 'link-acesso-enviado' });
    expect(h.identidadesPedidas).toEqual([['emp-ibipeba', 'col-ana', colab.fromPhone]]);
    expect(h.linksAcesso[0]).toEqual(expect.objectContaining({
      empresaBaseId: 'emp-ibipeba',
      email: 'ana@escola.gov.br',
      origem: 'colaborador',
      telefone: colab.fromPhone,
      waMessageId: 'wamid.LINK',
    }));
    expect(h.chamadasIA).toHaveLength(0);
  });

  it('IA reconhece pedido de acesso em texto que a regex não pega e o link sai', async () => {
    h.resultadoLink = { enviou: true, motivo: 'link-tenant' };
    h.respostaIA = ia({ solicita_link: true });
    const r = await executarSuporteAuto({ ...colab, texto: 'Não estou conseguindo acesso', waMessageId: 'wamid.LINK2' });
    expect(r).toEqual({ enviou: true, motivo: 'link-acesso-enviado' });
    expect(h.chamadasIA).toHaveLength(1);
    expect(h.linksAcesso).toHaveLength(1);
  });

  it('login por WhatsApp desabilitado: sem link, com degradação, e o Beto orienta pelo /entrar', async () => {
    h.identidadeColab = { ok: false, motivo: 'login-whatsapp-desabilitado' };
    const r = await executarSuporteAuto({ ...colab, texto: 'meu link expirou', waMessageId: 'wamid.SEMWA' });
    expect(r).toEqual({ enviou: true, motivo: 'auto:acesso' });
    expect(h.linksAcesso).toHaveLength(0);
    // Tentou uma vez só (atalho), e não de novo depois da IA.
    expect(h.identidadesPedidas).toHaveLength(1);
    expect(h.degradacoes.some((d) => d.detalhe?.fase === 'identidade-acesso')).toBe(true);
  });

  it('tenant de demonstração não recebe resposta', async () => {
    h.demoBlocked = true;
    const r = await executarSuporteAuto(colab);
    expect(r).toEqual({ enviou: false, motivo: 'tenant-demo' });
    expect(h.chamadasIA).toHaveLength(0);
  });

  it('falha ao ler o histórico: cala (pode haver uma pessoa na conversa)', async () => {
    h.erroHistorico = 'timeout';
    const r = await executarSuporteAuto(colab);
    expect(r).toEqual({ enviou: false, motivo: 'falha-historico' });
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios).toHaveLength(0);
  });
});

describe('suporte-auto · freio SUPORTE_AUTO_ESCOPO', () => {
  beforeEach(() => {
    h.internosGlobais = [];
  });

  it('interno: colaborador comum fica fora, como no piloto', async () => {
    process.env.SUPORTE_AUTO_ESCOPO = 'interno';
    const r = await executarSuporteAuto(colab);
    expect(r).toEqual({ enviou: false, motivo: 'fora-do-piloto' });
    expect(h.chamadasIA).toHaveLength(0);
  });

  it('interno sem o pin: falha fechado', async () => {
    process.env.SUPORTE_AUTO_ESCOPO = 'interno';
    delete process.env.SUPORTE_AUTO_PILOTO_EMPRESA_ID;
    const r = await executarSuporteAuto(colab);
    expect(r).toEqual({ enviou: false, motivo: 'piloto-sem-empresa' });
    expect(h.chamadasTdb).toHaveLength(0);
  });

  it('desligado: ninguém é atendido, nem a equipe', async () => {
    process.env.SUPORTE_AUTO_ESCOPO = 'desligado';
    h.internosGlobais = [{ id: 'col-demo', empresa_id: 'emp-1', email: 'rodrigo@vertho.ai', nome_completo: 'Rodrigo', cargo: 'Dono' }];
    const r = await executarSuporteAuto(base);
    expect(r).toEqual({ enviou: false, motivo: 'desligado' });
    expect(h.chamadasTdb).toHaveLength(0);
  });

  it('valor desconhecido cai no piloto, nunca em todos', async () => {
    process.env.SUPORTE_AUTO_ESCOPO = 'tudo';
    const r = await executarSuporteAuto(colab);
    expect(r).toEqual({ enviou: false, motivo: 'fora-do-piloto' });
  });
});

describe('suporte-auto · quando o Beto fica calado', () => {
  beforeEach(() => {
    h.internosGlobais = [];
  });

  it('uma pessoa da equipe respondeu pela inbox nos últimos 30 min', async () => {
    h.enviadas = [{ texto: 'Oi Ana, vou olhar seu acesso.', origem: 'inbox', enviada_em: horaAtras(0.4) }];
    const r = await executarSuporteAuto(colab);
    expect(r).toEqual({ enviou: false, motivo: 'humano-na-conversa' });
    expect(h.chamadasIA).toHaveLength(0);
  });

  it('resposta da equipe há mais de 30 min não segura o Beto, e entra no histórico', async () => {
    h.enviadas = [{ texto: 'Oi Ana, resolvido?', origem: 'inbox', enviada_em: horaAtras(0.6) }];
    const r = await executarSuporteAuto(colab);
    expect(r.enviou).toBe(true);
    const [, user] = h.chamadasIA[0];
    expect(String(user)).toContain('"papel":"equipe"');
  });

  it('"ok"/"obrigada" fora de uma conversa com o Beto não tem resposta', async () => {
    for (const [i, texto] of ['Obrigada', 'Ok vou fazer', '👍🏼'].entries()) {
      const r = await executarSuporteAuto({ ...colab, texto, waMessageId: `wamid.OK${i}` });
      expect(r).toEqual({ enviou: false, motivo: 'so-confirmacao' });
    }
    expect(h.chamadasIA).toHaveLength(0);
  });

  it('"ok" DENTRO de uma conversa com o Beto vai para a IA (pode ser resposta a uma pergunta)', async () => {
    h.enviadas = [{ texto: 'Quer que eu te envie um novo link?', origem: 'suporte-auto', enviada_em: horaAtras(0.05) }];
    const r = await executarSuporteAuto({ ...colab, texto: 'Ok', waMessageId: 'wamid.OKBETO' });
    expect(r.enviou).toBe(true);
    expect(h.chamadasIA).toHaveLength(1);
  });

  it('teto por hora conferido no banco (vale entre instâncias)', async () => {
    h.enviadas = Array.from({ length: 10 }, (_, i) => ({
      texto: `resposta ${i}`, origem: 'suporte-auto', enviada_em: horaAtras(0.5),
    }));
    const r = await executarSuporteAuto(colab);
    expect(r).toEqual({ enviou: false, motivo: 'teto-hora' });
    expect(h.chamadasIA).toHaveLength(0);
  });

  it('o histórico não leva link com token ao modelo', async () => {
    h.enviadas = [{
      texto: 'Seu acesso: https://ibipeba.vertho.ai/auth/callback?token_hash=SEGREDO',
      origem: 'cadencia', enviada_em: horaAtras(1),
    }];
    await executarSuporteAuto(colab);
    const [, user] = h.chamadasIA[0];
    expect(String(user)).not.toContain('SEGREDO');
    expect(String(user)).toContain('[link]');
  });
});

describe('suporte-auto · guardas de conduta', () => {
  beforeEach(() => {
    h.internosGlobais = [];
  });

  const conduta = () => h.degradacoes.filter((d) => d.tipo === 'suporte-auto-conduta');

  it('sofrimento na mensagem: CVV fixo, sem IA, degradação crítica, mesmo com a equipe na conversa', async () => {
    h.enviadas = [{ texto: 'Oi Ana', origem: 'inbox', enviada_em: horaAtras(1) }];
    const r = await executarSuporteAuto({ ...colab, texto: 'não aguento mais, quero morrer', waMessageId: 'wamid.S1' });
    expect(r).toEqual({ enviou: true, motivo: 'conduta:sofrimento' });
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios[0].input.texto).toBe(TEXTO_SOFRIMENTO);
    expect(conduta()).toEqual([expect.objectContaining({
      severidade: 'critico',
      empresaId: 'emp-ibipeba',
      colaboradorId: 'col-ana',
      detalhe: { caso: 'sofrimento', origem: 'regex' },
    })]);
    // O conteúdo da mensagem não vai para o registro.
    expect(JSON.stringify(conduta())).not.toContain('morrer');
  });

  it('sofrimento percebido pela IA (áudio, frase fora da lista): mesmo texto fixo', async () => {
    h.respostaIA = ia({ tom_usuario: 'sofrimento', resposta: 'RASCUNHO' });
    const r = await executarSuporteAuto({ ...colab, texto: 'nada mais faz sentido pra mim', waMessageId: 'wamid.S2' });
    expect(r).toEqual({ enviou: true, motivo: 'conduta:sofrimento' });
    expect(h.envios[0].input.texto).toBe(TEXTO_SOFRIMENTO);
    expect(conduta()[0].detalhe).toEqual({ caso: 'sofrimento', origem: 'ia' });
  });

  it('denúncia: texto fixo com o caminho certo, degradação crítica, rascunho não sai', async () => {
    h.respostaIA = ia({ tom_usuario: 'denuncia', resposta: 'RASCUNHO' });
    const r = await executarSuporteAuto({ ...colab, texto: 'meu diretor me assedia', waMessageId: 'wamid.DEN' });
    expect(r).toEqual({ enviou: true, motivo: 'conduta:denuncia' });
    expect(h.envios[0].input.texto).toBe(TEXTO_DENUNCIA);
    expect(conduta()[0].severidade).toBe('critico');
  });

  it('ofensa: 1ª vez recebe aviso calmo; ofensa de novo em 24 h fica sem resposta', async () => {
    h.respostaIA = ia({ tom_usuario: 'ofensivo', resposta: 'RASCUNHO' });
    const r1 = await executarSuporteAuto({ ...colab, texto: 'vocês são uns incompetentes', waMessageId: 'wamid.O1' });
    expect(r1).toEqual({ enviou: true, motivo: 'conduta:ofensivo' });
    expect(h.envios[0].input.texto).toBe(TEXTO_OFENSA);
    expect(conduta()[0].severidade).toBe('aviso');

    for (const [i, horas] of [0.1, 13].entries()) {
      h.enviadas = [{ texto: TEXTO_OFENSA, origem: 'suporte-auto', enviada_em: horaAtras(horas) }];
      const r = await executarSuporteAuto({ ...colab, texto: 'lixo de sistema', waMessageId: `wamid.O${i + 2}` });
      expect(r).toEqual({ enviou: false, motivo: 'ofensa-repetida' });
    }
    expect(h.envios).toHaveLength(1);
    expect(conduta().map((d) => d.detalhe.caso)).toEqual(['ofensivo', 'ofensa-repetida', 'ofensa-repetida']);
  });

  it('depois do aviso de ofensa, pedido educado sobre outro assunto é respondido', async () => {
    h.enviadas = [{ texto: TEXTO_OFENSA, origem: 'suporte-auto', enviada_em: horaAtras(0.2) }];
    h.respostaIA = ia({ intencao: 'duvida', continua_escalada: false });
    const r = await executarSuporteAuto({ ...colab, texto: 'desculpa. como vejo meu PDI?', waMessageId: 'wamid.O5' });
    expect(r).toEqual({ enviou: true, motivo: 'auto:duvida' });
  });

  describe('depois de escalar', () => {
    let escalada = '';
    beforeEach(async () => {
      h.respostaIA = ia({ intencao: 'duvida', resposta: 'RASCUNHO', precisa_humano: true, acao: 'escalar' });
      await executarSuporteAuto({ ...colab, texto: 'o vídeo trava em processando', waMessageId: 'wamid.E0' });
      escalada = h.envios[0].input.texto;
      h.envios = [];
      h.chamadasIA = [];
    });

    it('o modelo sabe que há um assunto com a equipe', async () => {
      h.enviadas = [{ texto: escalada, origem: 'suporte-auto', enviada_em: horaAtras(2) }];
      await executarSuporteAuto({ ...colab, texto: 'e aí???', waMessageId: 'wamid.E1' });
      expect(String(h.chamadasIA[0][1])).toContain('"aguardando_equipe":true');
      expect(String(h.chamadasIA[0][0])).toContain('continua_escalada');
    });

    it('insistir no MESMO assunto: sem resposta, a equipe segue', async () => {
      h.enviadas = [{ texto: escalada, origem: 'suporte-auto', enviada_em: horaAtras(2) }];
      h.respostaIA = ia({ intencao: 'duvida', continua_escalada: true, resposta: 'RASCUNHO' });
      const r = await executarSuporteAuto({ ...colab, texto: 'e aí???', waMessageId: 'wamid.E2' });
      expect(r).toEqual({ enviou: false, motivo: 'aguardando-equipe' });
      expect(h.envios).toHaveLength(0);
    });

    it('assunto NOVO: o Beto responde', async () => {
      h.enviadas = [{ texto: escalada, origem: 'suporte-auto', enviada_em: horaAtras(2) }];
      h.respostaIA = ia({ intencao: 'duvida', continua_escalada: false, resposta: 'O PDI fica em Relatórios, dentro do app.' });
      const r = await executarSuporteAuto({ ...colab, texto: 'outra coisa: onde vejo meu PDI?', waMessageId: 'wamid.E3' });
      expect(r).toEqual({ enviou: true, motivo: 'auto:duvida' });
      expect(h.envios[0].input.texto).toBe('O PDI fica em Relatórios, dentro do app.');
    });

    it('sem a leitura do modelo não dá para saber o assunto: cala, a conversa já está com a equipe', async () => {
      h.enviadas = [{ texto: escalada, origem: 'suporte-auto', enviada_em: horaAtras(2) }];
      h.respostaIA = 'texto livre, sem json';
      const r = await executarSuporteAuto({ ...colab, texto: 'e aí???', waMessageId: 'wamid.E4' });
      expect(r).toEqual({ enviou: false, motivo: 'aguardando-equipe' });
    });

    it('passadas 12 h, o assunto antigo não segura mais nada', async () => {
      h.enviadas = [{ texto: escalada, origem: 'suporte-auto', enviada_em: horaAtras(13) }];
      h.respostaIA = ia({ intencao: 'duvida', continua_escalada: true });
      const r = await executarSuporteAuto({ ...colab, texto: 'e aí???', waMessageId: 'wamid.E5' });
      expect(r.enviou).toBe(true);
      expect(String(h.chamadasIA[0][1])).toContain('"aguardando_equipe":false');
    });
  });

  it('sofrimento continua saindo mesmo com a conversa passada para a equipe', async () => {
    h.enviadas = [{ texto: TEXTO_OFENSA, origem: 'suporte-auto', enviada_em: horaAtras(1) }];
    const r = await executarSuporteAuto({ ...colab, texto: 'não quero mais viver', waMessageId: 'wamid.S3' });
    expect(r).toEqual({ enviou: true, motivo: 'conduta:sofrimento' });
  });

  it('irritado sem ofensa: o Beto responde normalmente', async () => {
    h.respostaIA = ia({ tom_usuario: 'irritado', resposta: 'Entendo a chateação. Vamos resolver: tente em https://app.vertho.ai/entrar.' });
    const r = await executarSuporteAuto({ ...colab, texto: 'já pedi três vezes!!', waMessageId: 'wamid.IRR' });
    expect(r).toEqual({ enviou: true, motivo: 'auto:acesso' });
    expect(conduta()).toHaveLength(0);
  });

  it('resposta do modelo com palavrão é reprovada antes do envio', async () => {
    h.respostaIA = ia({ intencao: 'duvida', resposta: 'Porra, tenta de novo aí.' });
    const r = await executarSuporteAuto({ ...colab, waMessageId: 'wamid.PAL' });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-reprovada' });
    expect(h.envios[0].input.texto).not.toContain('Porra');
    expect(conduta()).toEqual([expect.objectContaining({
      severidade: 'critico',
      detalhe: { caso: 'resposta-reprovada', motivo: 'linguagem-impropria', trecho: 'porra' },
    })]);
  });

  it('resposta do modelo com link fora da lista é reprovada', async () => {
    h.respostaIA = ia({ intencao: 'duvida', resposta: 'Acesse https://bit.ly/beto para continuar.' });
    const r = await executarSuporteAuto({ ...colab, waMessageId: 'wamid.LNK' });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-reprovada' });
    expect(h.envios[0].input.texto).not.toContain('bit.ly');
    expect(conduta()[0].detalhe.motivo).toBe('link-nao-permitido');
  });

  it('bloqueio do filtro do Google: escala com texto neutro, sem inventar resposta', async () => {
    h.erroIA = 'Gemini gemini-3.7-flash devolveu conteúdo VAZIO (finishReason=ausente, blockReason=SAFETY, output=0, thinking=0).';
    const r = await executarSuporteAuto({ ...colab, texto: 'mensagem pesada', waMessageId: 'wamid.BLK' });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-bloqueio' });
    expect(h.envios[0].input.texto).toContain('equipe da Vertho');
    expect(h.degradacoes.some((d) => d.detalhe?.fase === 'bloqueio-seguranca')).toBe(true);
  });

  it('defeito relatado: escala com pedido de print, sem o rascunho do modelo', async () => {
    h.respostaIA = ia({ intencao: 'duvida', resposta: 'RASCUNHO', precisa_humano: true, acao: 'escalar' });
    const r = await executarSuporteAuto({ ...colab, texto: 'Assisto o vídeo e não consigo marcar que concluí', waMessageId: 'wamid.BUG' });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-escala' });
    expect(h.envios[0].input.texto).toContain('print');
    expect(h.envios[0].input.texto).not.toContain('RASCUNHO');
  });
});
