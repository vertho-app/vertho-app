// Fluxo da caixa de entrada: o que o webhook grava, o que a thread pede ao
// banco e o que a associação manual pode tocar.
//
// Todas as invariantes aqui têm a mesma assinatura: FALHAM EM SILÊNCIO. Um
// update que não casa nada volta `error: null`; uma consulta ordenada ao
// contrário devolve dados válidos da parte errada da conversa; uma associação
// larga demais reescreve linha de outro tenant sem erro nenhum. Nenhuma delas
// aparece na tela — só aqui.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { criarSupabaseMock, type SupabaseMock } from '../../helpers/supabase-mock';

const SEGREDO = 'segredo-de-teste';

const h = vi.hoisted(() => ({
  sb: null as any,
  degradacoes: [] as any[],
  auditorias: [] as any[],
  autorizado: true,
}));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => h.sb.client }));
vi.mock('@/lib/authz-plataforma', () => ({
  checarAcessoPlataforma: async () =>
    h.autorizado ? { authorized: true, email: 'equipe@vertho.ai' } : { authorized: false, reason: 'unauthorized' },
}));
vi.mock('@/lib/audit', () => ({
  logAdminAction: async (e: any) => { h.auditorias.push(e); },
}));
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<any>()),
  registrarDegradacao: async (d: any) => { h.degradacoes.push(d); },
}));

const { POST } = await import('@/app/api/webhooks/whatsapp-cloud/route');
const { carregarThread, listarConversas, responderConversa, marcarLida, responderComAnexo } = await import('@/app/admin-v2/cliente/inbox-actions');
const { associarTelefone, reprocessarNaoIdentificadas } = await import('@/app/admin-v2/inbox/inbox-actions');

/** Request assinada como a Meta assina: HMAC-SHA256 sobre o corpo CRU. */
function requisicao(body: unknown): Request {
  const raw = JSON.stringify(body);
  const assinatura = 'sha256=' + crypto.createHmac('sha256', SEGREDO).update(raw, 'utf8').digest('hex');
  return new Request('https://vertho.ai/api/webhooks/whatsapp-cloud', {
    method: 'POST',
    body: raw,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinatura },
  });
}

const payloadStatus = (status = 'delivered', wamid = 'wamid.ABC') => ({
  entry: [{
    id: 'waba-1',
    changes: [{
      field: 'messages',
      value: { metadata: { phone_number_id: '123' }, statuses: [{ id: wamid, status, timestamp: '1786000000' }] },
    }],
  }],
});

const payloadMensagem = (from = '5511999998888') => ({
  entry: [{
    id: 'waba-1',
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: '123' },
        messages: [{ id: 'wamid.IN1', from, type: 'text', timestamp: '1786000000', text: { body: 'oi' } }],
      },
    }],
  }],
});

function novoMock(opts: Parameters<typeof criarSupabaseMock>[0] = {}): SupabaseMock {
  const m = criarSupabaseMock(opts);
  h.sb = m;
  return m;
}

beforeEach(() => {
  process.env.META_APP_SECRET = SEGREDO;
  h.degradacoes.length = 0;
  h.auditorias.length = 0;
  h.autorizado = true;
});

describe('webhook — status de entrega que não casa com ninguém', () => {
  it('🔴 update que afeta ZERO linhas registra degradação em vez de passar por sucesso', async () => {
    // O supabase-js devolve `error: null` para um update que não casou nada.
    // Quando isto foi escrito, 0 de 979 linhas de notification_deliveries tinham
    // provider_message_id — ou seja, TODO status caía neste ramo, calado.
    novoMock({ escrita: () => [] });

    const res = await POST(requisicao(payloadStatus()));
    expect(res.status).toBe(200); // 200 sempre: 500 faz a Meta desativar a inscrição

    const d = h.degradacoes.find((x) => x.chave === 'sem-destino');
    expect(d).toBeTruthy();
    expect(d.severidade).toBe('aviso'); // degrada a MEDIÇÃO, não a entrega
    expect(d.detalhe.wamid).toBe('wamid.ABC');
  });

  it('update que casa uma linha NÃO registra degradação', async () => {
    novoMock({ escrita: () => [{ id: 'nd-1' }] });

    await POST(requisicao(payloadStatus()));
    expect(h.degradacoes.filter((x) => x.chave === 'sem-destino')).toHaveLength(0);
  });

  it('`read` carimba entrega e leitura na mesma passada', async () => {
    const sb = novoMock({ escrita: () => [{ id: 'nd-1' }] });
    await POST(requisicao(payloadStatus('read')));

    const escrita = sb.escritas.find((e) => e.tabela === 'notification_deliveries');
    expect(escrita?.payload.opened_at).toBeTruthy();
    // `read` implica entregue: a ordem dos webhooks não é garantida, e sem isso
    // uma leitura que chega antes deixaria a mensagem eternamente "não entregue".
    expect(escrita?.payload.delivered_at).toBeTruthy();
    expect(escrita?.payload.status).toBeUndefined(); // aceite e entrega são eixos diferentes
  });

  it('erro de banco no status vira degradação, e o webhook ainda responde 200', async () => {
    const sb = novoMock();
    sb.falharEm({ tabela: 'notification_deliveries', op: 'update', mensagem: 'conexão caiu' });

    const res = await POST(requisicao(payloadStatus()));
    expect(res.status).toBe(200);
    expect(h.degradacoes.some((d) => d.chave === 'status' && d.detalhe.motivo.includes('conexão caiu'))).toBe(true);
  });
});

describe('webhook — a quem a mensagem recebida pertence', () => {
  it('🔴 a consulta de dono NÃO limita o número de candidatos', async () => {
    // O limite é o bug: com ORDER BY nenhum, cinco linhas quaisquer podiam
    // esconder a sexta empresa e o tenant errado ficava carimbado.
    const sb = novoMock({ lista: (t) => (t === 'colaboradores' ? [{ id: 'c1', empresa_id: 'e1' }] : []) });

    await POST(requisicao(payloadMensagem()));
    expect(sb.usou('colaboradores', 'limit')).toBe(false);
    expect(sb.usou('colaboradores', 'or')).toBe(true);
  });

  it('telefone em duas empresas grava a mensagem SEM empresa e com o motivo', async () => {
    const sb = novoMock({
      lista: (t) => (t === 'colaboradores'
        ? [{ id: 'c1', empresa_id: 'e1' }, { id: 'c2', empresa_id: 'e2' }]
        : []),
    });

    await POST(requisicao(payloadMensagem()));

    const gravada = sb.escritas.find((e) => e.tabela === 'whatsapp_mensagens_recebidas');
    expect(gravada?.payload.empresa_id).toBeNull();
    expect(gravada?.payload.colaborador_id).toBeNull();
    expect(gravada?.payload.ambiguidade).toBe('telefone-em-multiplas-empresas');
    // Gravar mesmo sem dono é o ponto: o número da Cloud API não tem aplicativo,
    // então o que não for gravado aqui não existe em lugar nenhum.
    expect(gravada?.op).toBe('upsert');
  });
});

describe('thread — o limite tem que cair sobre a cauda da conversa', () => {
  const AGORA = Date.UTC(2026, 7, 15, 12, 0, 0);
  const nova = new Date(AGORA - 3600_000).toISOString();
  const velha = new Date(AGORA - 40 * 3600_000).toISOString();

  beforeEach(() => {
    vi.setSystemTime(AGORA);
  });

  it('🔴 pede DESC nas três consultas — ASC + limit devolveria as mais ANTIGAS', async () => {
    const sb = novoMock({
      lista: (t) => (t === 'whatsapp_mensagens_recebidas'
        ? [{ id: 'm2', texto: 'nova', tipo: 'text', recebida_em: nova, colaborador_id: 'c1' },
           { id: 'm1', texto: 'velha', tipo: 'text', recebida_em: velha, colaborador_id: 'c1' }]
        : []),
    });

    await carregarThread('e1', '5511999998888');

    const ordens = sb.chamadas.filter((c) => c.metodo === 'order');
    expect(ordens.length).toBeGreaterThanOrEqual(2);
    for (const o of ordens) expect(o.args[1]).toEqual({ ascending: false });
  });

  it('🔴 a janela sai da mensagem MAIS RECENTE, não da primeira linha devolvida', async () => {
    novoMock({
      lista: (t) => (t === 'whatsapp_mensagens_recebidas'
        ? [{ id: 'm2', texto: 'nova', tipo: 'text', recebida_em: nova, colaborador_id: null },
           { id: 'm1', texto: 'velha', tipo: 'text', recebida_em: velha, colaborador_id: null }]
        : []),
    });

    const t = await carregarThread('e1', '5511999998888');
    // Com DESC, a recente é a [0]. Ler `.at(-1)` aqui daria a de 40h atrás e a
    // janela nasceria FECHADA numa conversa viva — o campo de resposta sumiria.
    expect(t.janela.estado).toBe('aberta');
    expect(t.itens.map((i) => i.texto)).toEqual(['velha', 'nova']); // exibição segue cronológica
  });

  it('a leitura é escopada por empresa_id (tenantDb), não só por telefone', async () => {
    const sb = novoMock();
    await carregarThread('e1', '5511999998888');
    expect(sb.usou('whatsapp_mensagens_recebidas', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('whatsapp_mensagens_enviadas', 'eq', 'empresa_id')).toBe(true);
  });

  it('erro na leitura das recebidas EXPLODE — thread pela metade parece defeito', async () => {
    const sb = novoMock();
    sb.falharEm({ tabela: 'whatsapp_mensagens_recebidas', op: 'select', mensagem: 'timeout' });
    await expect(carregarThread('e1', '5511999998888')).rejects.toThrow(/timeout/);
  });
});

describe('lista de conversas — agrupada no banco', () => {
  it('lê a view `whatsapp_conversas`, não a tabela de mensagens', async () => {
    const sb = novoMock({
      lista: (t) => (t === 'whatsapp_conversas'
        ? [{ empresa_id: 'e1', from_phone: '5511999998888', ultima_em: new Date().toISOString(), total: 2, nao_lidas: 1, ultimo_texto: 'oi', ultimo_tipo: 'text', colaborador_id: null, ambiguidade: null }]
        : []),
    });

    const conversas = await listarConversas('e1');
    expect(conversas).toHaveLength(1);
    expect(sb.usou('whatsapp_conversas', 'eq', 'empresa_id')).toBe(true);
    expect(sb.chamadas.some((c) => c.tabela === 'whatsapp_mensagens_recebidas')).toBe(false);
  });

  it('acesso negado não devolve conversa nenhuma — a action é um endpoint HTTP', async () => {
    novoMock();
    h.autorizado = false;
    await expect(listarConversas('e1')).rejects.toThrow(/restrito/i);
  });
});

describe('associação manual de telefone não identificado', () => {
  const colab = { id: 'c1', nome_completo: 'Ana' };

  it('🔴 só toca linhas SEM empresa — senão o conserto sequestra conversa de outro tenant', async () => {
    const sb = novoMock({
      resolver: (t) => (t === 'colaboradores' ? colab : null),
      escrita: (t) => (t === 'whatsapp_mensagens_recebidas' ? [{ id: 'm1' }, { id: 'm2' }] : null),
    });

    const r = await associarTelefone({ telefone: '5511999998888', colaboradorId: 'c1', empresaId: 'e1' });

    expect(r).toEqual({ ok: true, mensagens: 2 });
    expect(sb.usou('whatsapp_mensagens_recebidas', 'is', 'empresa_id')).toBe(true);
    const escrita = sb.escritas.find((e) => e.tabela === 'whatsapp_mensagens_recebidas');
    expect(escrita?.payload).toEqual({ empresa_id: 'e1', colaborador_id: 'c1', ambiguidade: null });
  });

  it('🔴 o par (empresa, pessoa) é CONFIRMADO no banco — o cliente propõe, o servidor confere', async () => {
    const sb = novoMock({ resolver: (t) => (t === 'colaboradores' ? colab : null), escrita: () => [{ id: 'm1' }] });
    await associarTelefone({ telefone: '5511999998888', colaboradorId: 'c1', empresaId: 'e1' });

    // Ler só por `id` e aceitar o `empresa_id` que voltasse tiraria a decisão de
    // escopo do servidor. A leitura vai escopada pelo tenant proposto: par que
    // não existe não acha linha, e a ação recusa.
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('colaboradores', 'eq', 'id')).toBe(true);
    expect(h.auditorias[0].empresaId).toBe('e1');
  });

  it('colaborador que não pertence ao cliente informado não associa nada', async () => {
    const sb = novoMock({ resolver: () => null });
    const r = await associarTelefone({ telefone: '5511999998888', colaboradorId: 'c1', empresaId: 'e-outra' });
    expect(r.ok).toBe(false);
    expect(sb.escritas).toHaveLength(0);
    expect(h.auditorias).toHaveLength(0);
  });

  it('a ação é auditada — numa caixa compartilhada, "quem disse que é da escola X" é a pergunta seguinte', async () => {
    novoMock({ resolver: (t) => (t === 'colaboradores' ? colab : null), escrita: () => [{ id: 'm1' }] });
    await associarTelefone({ telefone: '5511999998888', colaboradorId: 'c1', empresaId: 'e1' });

    expect(h.auditorias).toHaveLength(1);
    expect(h.auditorias[0].acao).toBe('inbox.associar');
    expect(h.auditorias[0].adminEmail).toBe('equipe@vertho.ai');
    expect(h.auditorias[0].alvo).toBe('5511999998888');
    expect(h.auditorias[0].detalhes.mensagens).toBe(1);
  });

  it('argumento faltando recusa antes de qualquer leitura', async () => {
    const sb = novoMock({ resolver: (t) => (t === 'colaboradores' ? colab : null) });
    const r = await associarTelefone({ telefone: '', colaboradorId: 'c1', empresaId: 'e1' });
    expect(r.ok).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });

  it('sem acesso de plataforma, nem lê', async () => {
    const sb = novoMock({ resolver: (t) => (t === 'colaboradores' ? colab : null) });
    h.autorizado = false;
    await expect(
      associarTelefone({ telefone: '5511999998888', colaboradorId: 'c1', empresaId: 'e1' }),
    ).rejects.toThrow(/restrito/i);
    expect(sb.escritas).toHaveLength(0);
  });
});

describe('reprocessar a fila', () => {
  it('🔴 aplica o que ficou inequívoco e DEIXA o ambíguo na fila', async () => {
    // Duas empresas casando o mesmo telefone: continua sem dono. Afrouxar aqui
    // seria decidir por chute exatamente onde já se sabe que há dúvida.
    const sb = novoMock({
      lista: (t) => {
        if (t === 'whatsapp_conversas') return [{ from_phone: '5511999998888' }];
        if (t === 'empresas') return [{ id: 'e1', nome: 'Alfa' }, { id: 'e2', nome: 'Beta' }];
        if (t === 'colaboradores') return [{ id: 'c1', nome_completo: 'Ana', email: null, whatsapp: '5511999998888', telefone: null }];
        return [];
      },
    });

    const r = await reprocessarNaoIdentificadas();
    expect(r.resolvidas).toBe(0);
    expect(r.restantes).toBe(1);
    expect(sb.escritas.filter((e) => e.tabela === 'whatsapp_mensagens_recebidas')).toHaveLength(0);
    expect(h.auditorias[0].acao).toBe('inbox.reprocessar');
  });

  it('telefone que passou a existir em uma única empresa é resolvido', async () => {
    const sb = novoMock({
      lista: (t) => {
        if (t === 'whatsapp_conversas') return [{ from_phone: '5511999998888' }];
        if (t === 'empresas') return [{ id: 'e1', nome: 'Alfa' }];
        if (t === 'colaboradores') return [{ id: 'c1', nome_completo: 'Ana', email: null, whatsapp: '5511999998888', telefone: null }];
        return [];
      },
      escrita: (t) => (t === 'whatsapp_mensagens_recebidas' ? [{ id: 'm1' }, { id: 'm2' }] : null),
    });

    const r = await reprocessarNaoIdentificadas();
    expect(r).toEqual({ resolvidas: 1, mensagens: 2, restantes: 0 });
    const escrita = sb.escritas.find((e) => e.tabela === 'whatsapp_mensagens_recebidas');
    expect(escrita?.payload).toEqual({ empresa_id: 'e1', colaborador_id: 'c1', ambiguidade: null });
  });
});

/**
 * Pontos cegos: escritas locais que falhavam num `console.error` e sumiam.
 *
 * O pior deles tem o efeito FORA da nossa tela: a mensagem sai pela Cloud API, a
 * gravação local falha, e a thread não mostra que já foi respondido. Quem atende
 * reescreve — e a pessoa do outro lado recebe duas. Um log que ninguém lê é
 * indistinguível de não registrar nada.
 */
describe('escrita local que falha não pode sumir', () => {
  const AGORA = Date.UTC(2026, 7, 15, 12, 0, 0);

  beforeEach(() => { vi.setSystemTime(AGORA); });

  it('🔴 mensagem enviada que não foi gravada vira degradação CRÍTICA', async () => {
    const sb = novoMock({
      // Janela aberta: a última recebida é de uma hora atrás.
      resolver: (t) => (t === 'whatsapp_mensagens_recebidas'
        ? { recebida_em: new Date(AGORA - 3600_000).toISOString(), colaborador_id: 'c1' }
        : null),
    });
    sb.falharEm({ tabela: 'whatsapp_mensagens_enviadas', op: 'insert', mensagem: 'deadlock detected' });

    await responderConversa({ empresaId: 'e1', telefone: '5511999998888', texto: 'já resolvido' });

    const d = h.degradacoes.find((x) => x.chave === 'gravar-enviada');
    expect(d).toBeTruthy();
    expect(d.severidade).toBe('critico');
    expect(d.empresaId).toBe('e1');
    expect(d.detalhe.motivo).toContain('deadlock');
  });

  it('marcarLida que falha vira aviso — o contador não zera e ninguém investigaria', async () => {
    const sb = novoMock();
    sb.falharEm({ tabela: 'whatsapp_mensagens_recebidas', op: 'update', mensagem: 'timeout' });

    await marcarLida('e1', '5511999998888');

    const d = h.degradacoes.find((x) => x.chave === 'marcar-lida');
    expect(d?.severidade).toBe('aviso');
  });

  it('caminho feliz não registra degradação nenhuma', async () => {
    novoMock({
      resolver: (t) => (t === 'whatsapp_mensagens_recebidas'
        ? { recebida_em: new Date(AGORA - 3600_000).toISOString(), colaborador_id: 'c1' }
        : null),
    });

    await responderConversa({ empresaId: 'e1', telefone: '5511999998888', texto: 'oi' });
    await marcarLida('e1', '5511999998888');

    expect(h.degradacoes).toHaveLength(0);
  });
});

/**
 * Anexo: mesma janela do texto, e tentativa sempre gravada.
 *
 * O anexo compartilha a regra da janela com o texto (`prepararEnvio`) de
 * propósito — duas cópias divergiriam na primeira correção. E o upload que falha
 * precisa virar linha na thread: sem isso o atendente não sabe se o arquivo foi.
 */
describe('responder com anexo', () => {
  const AGORA = Date.UTC(2026, 7, 15, 12, 0, 0);
  const arquivo = (nome = 'contrato.pdf', tipo = 'application/pdf', bytes = 1024) =>
    new File([new Uint8Array(bytes)], nome, { type: tipo });

  function formulario(over: { arquivo?: File; legenda?: string } = {}): FormData {
    const f = new FormData();
    f.append('empresaId', 'e1');
    f.append('telefone', '5511999998888');
    f.append('legenda', over.legenda ?? '');
    f.append('arquivo', over.arquivo ?? arquivo());
    return f;
  }

  const janelaAberta = (t: string) => (t === 'whatsapp_mensagens_recebidas'
    ? { recebida_em: new Date(AGORA - 3600_000).toISOString(), colaborador_id: 'c1' }
    : null);

  beforeEach(() => { vi.setSystemTime(AGORA); });

  it('🔴 arquivo grande demais é recusado ANTES de qualquer I/O', async () => {
    const sb = novoMock({ resolver: janelaAberta });
    const r = await responderComAnexo(formulario({ arquivo: arquivo('gigante.pdf', 'application/pdf', 5 * 1024 * 1024) }));

    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/limite aqui é 4 MB/);
    // Nem leu a conversa: a recusa é de graça e não gasta rede.
    expect(sb.chamadas).toHaveLength(0);
  });

  it('tipo não suportado é recusado sem tocar no banco', async () => {
    const sb = novoMock({ resolver: janelaAberta });
    const r = await responderComAnexo(formulario({ arquivo: arquivo('vírus.exe', 'application/x-msdownload') }));
    expect(r.ok).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });

  it('🔴 janela fechada bloqueia o anexo pela MESMA regra do texto', async () => {
    novoMock({
      resolver: (t) => (t === 'whatsapp_mensagens_recebidas'
        ? { recebida_em: new Date(AGORA - 30 * 3600_000).toISOString(), colaborador_id: 'c1' }
        : null),
    });

    const r = await responderComAnexo(formulario());
    expect(r.ok).toBe(false);
    expect(r.janelaFechada).toBe(true);
  });

  it('🔴 falha no upload vira TENTATIVA gravada, não silêncio', async () => {
    // Sem credencial, `subirMidia` recusa — o efeito é o mesmo de um upload que
    // falhou. A linha tem que existir na thread com o erro à vista.
    delete process.env.META_WHATSAPPBUSINESS_API;
    const sb = novoMock({ resolver: janelaAberta });

    const r = await responderComAnexo(formulario());

    expect(r.ok).toBe(false);
    const escrita = sb.escritas.find((e) => e.tabela === 'whatsapp_mensagens_enviadas');
    expect(escrita?.payload.tipo).toBe('document');
    expect(escrita?.payload.erro).toBeTruthy();
    expect(escrita?.payload.wa_message_id).toBeNull();
  });

  it('sem acesso de plataforma não lê nem escreve', async () => {
    const sb = novoMock({ resolver: janelaAberta });
    h.autorizado = false;
    await expect(responderComAnexo(formulario())).rejects.toThrow(/restrito/i);
    expect(sb.escritas).toHaveLength(0);
  });
});
