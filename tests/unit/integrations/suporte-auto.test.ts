// Piloto de suporte automático no WhatsApp: elegibilidade, contrato com a IA,
// contenção e envio. Tudo mockado — nenhuma rede, nenhum banco.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  respostaIA: '{"intencao":"acesso","resposta":"Oi! Aqui é o Beto 👋 Tente gerar um novo link em /entrar.","precisa_humano":false,"acao":"responder"}',
  chamadasIA: [] as any[],
  envios: [] as any[],
  falharEnvio: '',
  degradacoes: [] as any[],
  pessoa: null as any,
  linhasTelefone: null as any,
  erroLeitura: null as any,
  demoBlocked: false,
  chamadasTdb: [] as any[],
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
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantDb: (empresaId: string) => {
    h.chamadasTdb.push(empresaId);
    const linhaPessoa = h.pessoa;
    const linhas = h.linhasTelefone;
    const erro = h.erroLeitura;
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              erro ? { data: null, error: { message: erro } } : { data: linhaPessoa, error: null },
          }),
          or: async () =>
            erro ? { data: null, error: { message: erro } } : { data: linhas ?? [], error: null },
        }),
      }),
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
  telefoneNoPiloto,
  elegivelParaAuto,
  executarSuporteAuto,
  resetSuporteAutoMemoria,
  SUPORTE_AUTO_MODEL,
  SUPORTE_AUTO_TASK_KEY,
  type EntradaSuporte,
} from '@/lib/whatsapp/suporte-auto';

const base: EntradaSuporte = {
  fromPhone: '5511973882303',
  waMessageId: 'wamid.P1',
  tipo: 'text',
  texto: 'não consigo entrar, meu link expirou',
  numeroId: '1256487020887128',
  empresaId: 'emp-1',
  empresaNome: 'Acme',
  colaboradorId: 'col-1',
  ambiguidade: null,
};

beforeEach(() => {
  h.chamadasIA = [];
  h.envios = [];
  h.falharEnvio = '';
  h.degradacoes = [];
  h.pessoa = { id: 'col-1', nome_completo: 'Rodrigo', cargo: 'Dono' };
  h.linhasTelefone = null;
  h.erroLeitura = null;
  h.demoBlocked = false;
  h.chamadasTdb = [];
  h.respostaIA =
    '{"intencao":"acesso","resposta":"Oi! Aqui é o Beto 👋 Tente gerar um novo link em /entrar.","precisa_humano":false,"acao":"responder"}';
  delete process.env.SUPORTE_AUTO_PILOTO_EMPRESA_ID;
  resetSuporteAutoMemoria();
});
describe('suporte-auto · piloto restrito', () => {
  it('só o telefone do piloto passa, em qualquer forma', () => {
    expect(telefoneNoPiloto('5511973882303')).toBe(true);
    expect(telefoneNoPiloto('+55 (11) 97388-2303')).toBe(true);
    expect(telefoneNoPiloto('11973882303')).toBe(true);
    expect(telefoneNoPiloto('1173882303')).toBe(true);
    expect(telefoneNoPiloto('5511999998888')).toBe(false);
    expect(telefoneNoPiloto('557499225966')).toBe(false);
  });

  it('fora do piloto não gasta IA nem envia', async () => {
    const r = await executarSuporteAuto({ ...base, fromPhone: '5511999998888', waMessageId: 'wamid.X' });
    expect(r).toEqual({ enviou: false, motivo: 'fora-do-piloto' });
    expect(h.chamadasIA).toHaveLength(0);
    expect(h.envios).toHaveLength(0);
  });

  it('tipo sem texto e palavra do VER não disparam o auto', () => {
    expect(elegivelParaAuto({ ...base, tipo: 'audio', texto: null }).motivo).toBe('tipo-sem-texto');
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

  it('tenant limpo: consulta a pessoa e responde pelo mesmo número', async () => {
    const r = await executarSuporteAuto(base);
    expect(r).toEqual({ enviou: true, motivo: 'auto:acesso' });
    expect(h.chamadasTdb).toEqual(['emp-1']);
    const [system, user, aiConfig, , options] = h.chamadasIA[0];
    // Id EXATO do catálogo (o ledger faz lookup exato; sufixo de esforço no id
    // nasceria com `cost_usd = null`). Nível de raciocínio vai em reasoningEffort.
    expect(aiConfig).toEqual({ model: 'gemini-3.8-flash' });
    expect(aiConfig).toEqual({ model: SUPORTE_AUTO_MODEL });
    expect(options.taskKey).toBe(SUPORTE_AUTO_TASK_KEY);
    expect(options.empresaId).toBe('emp-1');
    expect(options.correlationId).toBeUndefined();
    expect(options.reasoningEffort).toBe('low');
    expect(options.timeoutMs).toBe(12000);
    expect(options.geminiResponseSchema).toMatchObject({
      type: 'object',
      required: ['intencao', 'resposta', 'precisa_humano', 'acao'],
    });
    expect(String(system)).toContain('Você é o Beto');
    expect(String(user)).toContain('Rodrigo');
    const envio = h.envios[0];
    expect(envio.meta.numeroId).toBe('1256487020887128');
    expect(envio.meta.dedupeKey).toBe('suporte-auto:wamid.P1');
    expect(envio.meta.motivo).toBe('suporte-auto');
    expect(envio.meta.autorEmail ?? null).toBeNull();
  });

  it('sem dono e sem pin: modo genérico, sem ler tenant, sem citar empresa', async () => {
    const r = await executarSuporteAuto({
      ...base,
      empresaId: null,
      empresaNome: null,
      colaboradorId: null,
      ambiguidade: 'telefone-em-multiplas-empresas',
      waMessageId: 'wamid.G1',
    });
    expect(r.enviou).toBe(true);
    expect(h.chamadasTdb).toHaveLength(0);
    const user = String(h.chamadasIA[0][1]);
    expect(user).toContain('"modo":"generico"');
    expect(user).not.toContain('Acme');
  });

  it('IA fora do contrato: contenção fixa + degradação de parse', async () => {
    h.respostaIA = 'texto livre, sem json';
    const r = await executarSuporteAuto({ ...base, waMessageId: 'wamid.J1' });
    expect(r).toEqual({ enviou: true, motivo: 'contencao-parse' });
    expect(h.envios[0].input.texto).toContain('Aqui é o Beto');
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
