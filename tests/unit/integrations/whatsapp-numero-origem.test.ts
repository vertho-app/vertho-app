// O NÚMERO de origem (mig 252): responder sai pelo mesmo número que recebeu.
//
// Três invariantes, todas FALHAM EM SILÊNCIO sem teste:
//   1. `resolverNumeroParaEnvio` decide por ONDE sai — pedido conhecido vai nele,
//      ausente/desconhecido cai no inicial sem exceção (exceção = msg que não sai).
//   2. O envio USA o número na URL (`/{id}/messages`), não o global.
//   3. Telemetria e conteúdo GRAVAM o número efetivo (`from_phone_id`) — sem isso
//      o dash não responde "quantas saíram por cada número".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../../helpers/supabase-mock';

const h = vi.hoisted(() => ({ sb: null as any }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<any>()),
  registrarDegradacao: async () => undefined,
}));

const { resolverNumeroParaEnvio, rotuloDoNumero } = await import('@/lib/whatsapp/numeros');
const { enviarTextoCloud, enviarTemplateCloud, enviarTemplateOtp, inspecionarCloudApi } = await import('@/lib/whatsapp/cloud-api');
const { checarCanalEntradaWhatsapp } = await import('@/lib/pipeline-health/regras');

const urls: string[] = [];
function stubarFetch() {
  global.fetch = vi.fn(async (url: any) => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.NOVA' }] }) } as any;
  }) as any;
}

function novoMock(): SupabaseMock {
  const m = criarSupabaseMock();
  h.sb = m;
  return m;
}

beforeEach(() => {
  urls.length = 0;
  process.env.META_WHATSAPPBUSINESS_API = 'token-de-teste';
  process.env.PHONE_NUMBER_ID = '111';
  delete process.env.WHATSAPP_NUMEROS_EXTRA;
  stubarFetch();
});

afterEach(() => {
  delete process.env.META_WHATSAPPBUSINESS_API;
  delete process.env.PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_NUMEROS_EXTRA;
  delete process.env.WABA_ID;
});

/** O catálogo como está em produção desde 16/09: um extra com empresas ligadas. */
const EXTRA_COM_EMPRESAS = JSON.stringify([
  { id: '222', rotulo: '+55 11 5199-1865', nome: '4Life e Amazon Bowling', empresas: ['emp-4life', 'emp-amazon'] },
]);

describe('resolverNumeroParaEnvio — por qual número sai', () => {
  it('sem pedido cai no inicial (histórico e cadência sem contexto)', () => {
    expect(resolverNumeroParaEnvio(null)).toEqual({ id: '111', caiuNoInicial: true });
    expect(resolverNumeroParaEnvio(undefined)).toEqual({ id: '111', caiuNoInicial: true });
    expect(resolverNumeroParaEnvio('')).toEqual({ id: '111', caiuNoInicial: true });
  });

  it('o próprio inicial não conta como queda', () => {
    expect(resolverNumeroParaEnvio('111')).toEqual({ id: '111', caiuNoInicial: false });
  });

  it('número extra conhecido sai por ele', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = JSON.stringify([{ id: '222', rotulo: '+55 11 90000-0002', nome: 'Atendimento' }]);
    expect(resolverNumeroParaEnvio('222')).toEqual({ id: '222', caiuNoInicial: false });
  });

  it('número desconhecido cai no inicial em vez de lançar', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = JSON.stringify([{ id: '222', rotulo: 'x' }]);
    expect(resolverNumeroParaEnvio('999')).toEqual({ id: '111', caiuNoInicial: true });
  });

  it('variável malformada não derruba a resolução', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = 'não-é-json';
    expect(resolverNumeroParaEnvio('222')).toEqual({ id: '111', caiuNoInicial: true });
  });
});

// A empresa escolhe o número quando NÃO há conversa (16/09/2026: 4Life e Amazon
// Bowling no segundo número). Cadência, acesso e OTP não têm `numeroId`; sem esta
// regra, tudo dessas empresas sairia pelo inicial, calado.
describe('resolverNumeroParaEnvio: o número da empresa', () => {
  it('sem conversa, empresa ligada sai pelo número dela', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = EXTRA_COM_EMPRESAS;
    expect(resolverNumeroParaEnvio(null, 'emp-4life')).toEqual({ id: '222', caiuNoInicial: false });
    expect(resolverNumeroParaEnvio(undefined, 'emp-amazon')).toEqual({ id: '222', caiuNoInicial: false });
  });

  it('🔴 a conversa VENCE a empresa: a janela de 24h é por número', () => {
    // A pessoa da 4Life escreveu para o inicial. Responder pelo 222 quebraria o
    // fio e, em texto livre, a Meta recusaria (131047).
    process.env.WHATSAPP_NUMEROS_EXTRA = EXTRA_COM_EMPRESAS;
    expect(resolverNumeroParaEnvio('111', 'emp-4life')).toEqual({ id: '111', caiuNoInicial: false });
  });

  it('pedido desconhecido passa para a empresa antes de cair no inicial', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = EXTRA_COM_EMPRESAS;
    expect(resolverNumeroParaEnvio('999', 'emp-4life')).toEqual({ id: '222', caiuNoInicial: false });
  });

  it('empresa sem vínculo continua no inicial', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = EXTRA_COM_EMPRESAS;
    expect(resolverNumeroParaEnvio(null, 'emp-ibipeba')).toEqual({ id: '111', caiuNoInicial: true });
    expect(resolverNumeroParaEnvio(null, null)).toEqual({ id: '111', caiuNoInicial: true });
  });

  it('`empresas` torto não derruba o número, só o vínculo', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = JSON.stringify([
      { id: '222', rotulo: 'x', empresas: 'emp-4life' },
      { id: '333', rotulo: 'y', empresas: [42, null, ' emp-amazon '] },
    ]);
    expect(resolverNumeroParaEnvio('222')).toEqual({ id: '222', caiuNoInicial: false });
    expect(resolverNumeroParaEnvio(null, 'emp-4life')).toEqual({ id: '111', caiuNoInicial: true });
    expect(resolverNumeroParaEnvio(null, 'emp-amazon')).toEqual({ id: '333', caiuNoInicial: false });
  });

  it('empresa em dois números fica com o PRIMEIRO da lista', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = JSON.stringify([
      { id: '222', rotulo: 'x', empresas: ['emp-4life'] },
      { id: '333', rotulo: 'y', empresas: ['emp-4life'] },
    ]);
    expect(resolverNumeroParaEnvio(null, 'emp-4life').id).toBe('222');
  });
});

describe('o envio usa o número na URL e grava por onde saiu', () => {
  it('resposta com numeroId sai pelo número de origem', async () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = JSON.stringify([{ id: '222', rotulo: '+55 11 90000-0002' }]);
    const sb = novoMock();

    await enviarTextoCloud({ phone: '5511999998888', texto: 'oi' }, { motivo: 'atendimento', numeroId: '222' });

    expect(urls.some((u) => u.includes('/222/messages'))).toBe(true);
    const tel = sb.escritas.find((e) => e.tabela === 'notification_deliveries');
    expect(tel?.payload.from_phone_id).toBe('222');
    const cont = sb.escritas.find((e) => e.tabela === 'whatsapp_mensagens_enviadas');
    expect(cont?.payload.from_phone_id).toBe('222');
  });

  it('sem numeroId sai pelo inicial e grava o inicial', async () => {
    const sb = novoMock();

    await enviarTextoCloud({ phone: '5511999998888', texto: 'oi' }, { motivo: 'atendimento' });

    expect(urls.some((u) => u.includes('/111/messages'))).toBe(true);
    const tel = sb.escritas.find((e) => e.tabela === 'notification_deliveries');
    expect(tel?.payload.from_phone_id).toBe('111');
  });

  it('template da cadência também pode fixar o número', async () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = JSON.stringify([{ id: '222', rotulo: 'x' }]);
    const sb = novoMock();

    await enviarTemplateCloud(
      { phone: '5511999998888', template: 'registro_desafio', params: ['Ana', '5', 'u'] },
      { motivo: 'desafio', numeroId: '222' },
    );

    expect(urls.some((u) => u.includes('/222/messages'))).toBe(true);
    const cont = sb.escritas.find((e) => e.tabela === 'whatsapp_mensagens_enviadas');
    expect(cont?.payload.from_phone_id).toBe('222');
  });

  it('🔴 cadência da empresa ligada sai pelo número dela e grava esse número', async () => {
    // O caso real: a pílula da 4Life não tem conversa, só `empresaId`.
    process.env.WHATSAPP_NUMEROS_EXTRA = EXTRA_COM_EMPRESAS;
    const sb = novoMock();

    await enviarTemplateCloud(
      { phone: '5511999998888', template: 'registro_desafio', params: ['Ana', '5', 'u'] },
      { motivo: 'pilula', empresaId: 'emp-4life', colaboradorId: 'c1' },
    );

    expect(urls.some((u) => u.includes('/222/messages'))).toBe(true);
    expect(urls.some((u) => u.includes('/111/'))).toBe(false);
    const tel = sb.escritas.find((e) => e.tabela === 'notification_deliveries');
    expect(tel?.payload.from_phone_id).toBe('222');
    const cont = sb.escritas.find((e) => e.tabela === 'whatsapp_mensagens_enviadas');
    expect(cont?.payload.from_phone_id).toBe('222');
  });

  it('OTP de login da empresa ligada também sai pelo número dela', async () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = EXTRA_COM_EMPRESAS;
    novoMock();

    await enviarTemplateOtp({ phone: '5511999998888', codigo: '123456' }, { motivo: 'otp', empresaId: 'emp-amazon' });

    expect(urls.some((u) => u.includes('/222/messages'))).toBe(true);
  });

  it('empresa sem vínculo continua saindo pelo inicial', async () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = EXTRA_COM_EMPRESAS;
    novoMock();

    await enviarTemplateCloud(
      { phone: '5511999998888', template: 'registro_desafio', params: ['Ana', '5', 'u'] },
      { motivo: 'pilula', empresaId: 'emp-ibipeba' },
    );

    expect(urls.some((u) => u.includes('/111/messages'))).toBe(true);
  });
});

// A checagem diária (R12) pergunta à Meta por TODOS os números. O payload do 222
// abaixo é o que a Meta devolveu em 16/09/2026 para o +55 11 5199-1865 antes do
// registro: HTTP 200, nome aprovado, e mesmo assim sem condição de enviar.
describe('saúde: todos os números, e HTTP 200 não é "ok"', () => {
  const ERRO_SIP = { error_code: 138025, error_description: 'This app cannot use SIP for WhatsApp Business calling' };
  const RESPOSTAS: Record<string, unknown> = {
    subscribed_apps: { data: [{ whatsapp_business_api_data: { name: 'Vertho' } }] },
    '111': {
      verified_name: 'Vertho.ai', quality_rating: 'GREEN', platform_type: 'CLOUD_API', status: 'CONNECTED',
      // Erro de SIP com envio AVAILABLE: é chamada de voz e não pode reprovar.
      health_status: { can_send_message: 'AVAILABLE', entities: [{ entity_type: 'APP', can_send_message: 'AVAILABLE', errors: [ERRO_SIP] }] },
    },
    '222': {
      verified_name: 'Vertho.ai', quality_rating: 'UNKNOWN', platform_type: 'NOT_APPLICABLE', status: 'PENDING',
      health_status: {
        can_send_message: 'BLOCKED',
        entities: [
          { entity_type: 'PHONE_NUMBER', can_send_message: 'BLOCKED', errors: [{ error_code: 141000, error_description: 'The phone number you are trying to send messages from is not linked to your WhatsApp account.' }] },
          { entity_type: 'APP', can_send_message: 'AVAILABLE', errors: [ERRO_SIP] },
        ],
      },
    },
  };

  function stubarMeta(respostas: Record<string, unknown>) {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      urls.push(u);
      const chave = Object.keys(respostas).find((k) => u.includes(`/${k}?`) || u.endsWith(`/${k}`));
      return { ok: true, status: 200, json: async () => (chave ? respostas[chave] : {}) } as any;
    }) as any;
  }

  it('🔴 número extra bloqueado vira achado crítico com o motivo da Meta', async () => {
    process.env.WABA_ID = 'waba-1';
    process.env.WHATSAPP_NUMEROS_EXTRA = EXTRA_COM_EMPRESAS;
    stubarMeta(RESPOSTAS);

    const saude = await inspecionarCloudApi();

    expect(saude.numeroOk).toBe(true); // o erro de SIP do inicial NÃO reprova
    expect(saude.extras).toHaveLength(1);
    expect(saude.extras[0].numeroOk).toBe(false);
    expect(saude.extras[0].motivo).toContain('141000');

    const a = checarCanalEntradaWhatsapp(saude).find((x) => x.id === 'whatsapp-numero-inacessivel');
    expect(a?.severidade).toBe('critico');
    expect(a?.amostra?.[0]).toContain('+55 11 5199-1865');
    expect(a?.amostra?.[0]).toContain('141000');
  });

  it('número fora da Cloud API reprova mesmo sem `health_status`', async () => {
    process.env.WABA_ID = 'waba-1';
    stubarMeta({ ...RESPOSTAS, '111': { verified_name: 'Vertho.ai', platform_type: 'NOT_APPLICABLE', status: 'PENDING' } });

    const saude = await inspecionarCloudApi();

    expect(saude.numeroOk).toBe(false);
    expect(saude.motivo).toContain('NOT_APPLICABLE');
  });

  it('sem extras configurados, a lista vem vazia e o inicial segue saudável', async () => {
    process.env.WABA_ID = 'waba-1';
    stubarMeta(RESPOSTAS);

    const saude = await inspecionarCloudApi();

    expect(saude.extras).toEqual([]);
    expect(checarCanalEntradaWhatsapp(saude)).toEqual([]);
  });
});

describe('rotuloDoNumero — o que a tela mostra', () => {
  it('NULL é o número inicial, não erro', () => {
    expect(rotuloDoNumero(null)).toBe('número inicial');
  });

  it('id conhecido vira rótulo com nome', () => {
    const cat = [{ id: '222', rotulo: '+55 11 90000-0002', nome: 'Atendimento', inicial: false }];
    expect(rotuloDoNumero('222', cat)).toBe('+55 11 90000-0002 (Atendimento)');
  });

  it('id desconhecido não inventa rótulo', () => {
    expect(rotuloDoNumero('999', [])).toMatch(/^número 999/);
  });
});

describe('thread e caixa carregam o número (sem partir a conversa)', () => {
  it('recebida leva o to_phone_id, enviada leva o from_phone_id', async () => {
    const { montarThread } = await import('@/lib/inbox/thread');
    const itens = montarThread({
      recebidas: [{ id: 'r1', texto: 'oi', tipo: 'text', recebida_em: '2026-09-14T10:00:00Z', numero_id: '222' }],
      enviadas: [{
        id: 's1', texto: 'olá', tipo: 'text', template_nome: null, autor_email: 'e@v.ai',
        origem: 'inbox', erro: null, enviada_em: '2026-09-14T10:01:00Z', wa_message_id: null, numero_id: '222',
      }],
      entregas: [],
    });

    expect(itens.map((i) => i.numeroId)).toEqual(['222', '222']);
  });

  it('histórico sem número vira NULL (número inicial), não lixo', async () => {
    const { montarThread } = await import('@/lib/inbox/thread');
    const itens = montarThread({
      recebidas: [{ id: 'r1', texto: 'oi', tipo: 'text', recebida_em: '2026-09-14T10:00:00Z' }],
      enviadas: [],
      entregas: [{ id: 'e1', kind: 'pilula', sent_at: '2026-09-14T09:00:00Z', provider_status: 'delivered', delivered_at: null, opened_at: null, error: null, provider_message_id: null }],
    });

    expect(itens[0].numeroId).toBeUndefined();
    expect(itens[1].numeroId).toBeNull();
  });

  it('ultimo_numero_id e numeros_ids chegam à tela', async () => {
    const { montarConversas } = await import('@/lib/inbox/caixa');
    const [c] = montarConversas([{
      empresa_id: 'e1',
      from_phone: '5511999998888',
      ultima_em: '2026-09-14T10:01:00Z',
      ultima_recebida_em: '2026-09-14T10:00:00Z',
      total: 1,
      enviadas: 1,
      nao_lidas: 0,
      ultimo_texto: 'olá',
      ultimo_tipo: 'text',
      ultimo_lado: 'equipe',
      colaborador_id: null,
      ambiguidade: null,
      ultimo_numero_id: '222',
      numeros_ids: ['111', '222'],
    }], new Map());

    expect(c.numeroId).toBe('222');
    expect(c.numerosIds).toEqual(['111', '222']);
  });

  it('linha antiga (sem colunas) vira NULL + array vazio, sem explodir', async () => {
    const { montarConversas } = await import('@/lib/inbox/caixa');
    const [c] = montarConversas([{
      empresa_id: 'e1',
      from_phone: '5511999998888',
      ultima_em: '2026-09-14T10:01:00Z',
      total: 1,
      nao_lidas: 0,
      ultimo_texto: 'oi',
      ultimo_tipo: 'text',
      colaborador_id: null,
      ambiguidade: null,
    }], new Map());

    expect(c.numeroId).toBeNull();
    expect(c.numerosIds).toEqual([]);
  });
});
