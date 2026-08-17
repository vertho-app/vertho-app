// O LADO ENVIADO da conversa: o que a caixa de entrada mostra do que NÓS mandamos.
//
// As duas invariantes aqui nasceram do mesmo dia (17/08/2026) e do mesmo sintoma
// — a conversa aparecendo pela metade, sem nenhum erro na tela:
//
//   1. `whatsapp_mensagens_enviadas` tinha 5 linhas no banco inteiro, todas da
//      caixa de entrada. Tudo o que a cadência mandava (pílula, missão, cobrança,
//      acesso) só existia em `notification_deliveries` — sem texto e sem telefone.
//   2. O telefone que a Meta usa não é o que está no cadastro: o `wa_id` dos DDDs
//      ≥ 31 vem sem o nono dígito, e `normalizePhone` RECUSA essa forma. Responder
//      a quem escreveu de lá falharia com "telefone inválido".
//
// Nenhuma das duas produz exceção — por isso elas moram aqui.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../../helpers/supabase-mock';
import { alternarNonoDigito, formasDoTelefone } from '@/lib/whatsapp/nono-digito';

const h = vi.hoisted(() => ({ sb: null as any, degradacoes: [] as any[] }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<any>()),
  registrarDegradacao: async (d: any) => { h.degradacoes.push(d); },
}));

const { enviarTemplateCloud, enviarTemplateOtp, enviarTextoCloud } = await import('@/lib/whatsapp/cloud-api');

const corpos: any[] = [];

function stubarFetch(resposta: () => any) {
  global.fetch = vi.fn(async (_url: any, init: any) => {
    corpos.push(JSON.parse(String(init?.body ?? '{}')));
    return resposta();
  }) as any;
}

const okComWamid = () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.NOVA' }] }) });

function novoMock(): SupabaseMock {
  const m = criarSupabaseMock();
  h.sb = m;
  return m;
}

const enviadas = (sb: SupabaseMock) => sb.escritas.filter((e) => e.tabela === 'whatsapp_mensagens_enviadas');

beforeEach(() => {
  corpos.length = 0;
  h.degradacoes.length = 0;
  process.env.META_WHATSAPPBUSINESS_API = 'token-de-teste';
  process.env.PHONE_NUMBER_ID = '123456';
  stubarFetch(okComWamid);
});

afterEach(() => {
  // O env vaza entre arquivos no mesmo worker do vitest, e "Cloud API
  // configurada" muda o caminho de outros testes da suíte.
  delete process.env.META_WHATSAPPBUSINESS_API;
  delete process.env.PHONE_NUMBER_ID;
});

describe('a régua do nono dígito', () => {
  it('vai e volta entre as duas formas do mesmo celular', () => {
    expect(alternarNonoDigito('5574999225966')).toBe('557499225966');
    expect(alternarNonoDigito('557499225966')).toBe('5574999225966');
    expect(formasDoTelefone('557499225966')).toEqual(['557499225966', '5574999225966']);
  });

  it('não inventa dígito onde não cabe', () => {
    expect(alternarNonoDigito('551130214455')).toBeNull();  // fixo (começa com 3)
    expect(alternarNonoDigito('351926360862')).toBeNull();  // Portugal
    expect(alternarNonoDigito('')).toBeNull();
    expect(alternarNonoDigito('55')).toBeNull();
    expect(formasDoTelefone('')).toEqual([]);
  });
});

describe('🔴 o telefone que vai para a Meta', () => {
  it('o wa_id sem o nono dígito é aceito e sai na forma que valida', async () => {
    // `normalizePhone('557499225966')` devolve null — é o formato que a própria
    // Cloud API usa e que o plano de numeração brasileiro não reconhece mais.
    // Sem a tolerância, responder a quem escreveu daquele DDD nem chegava à rede.
    novoMock();
    const r = await enviarTextoCloud({ phone: '557499225966', texto: 'oi' });

    expect(r.ok).toBe(true);
    expect(corpos[0].to).toBe('5574999225966');
  });

  it('número que não existe em plano nenhum continua recusado antes da rede', async () => {
    novoMock();
    const r = await enviarTextoCloud({ phone: '123', texto: 'oi' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/telefone inválido/);
    expect(corpos).toHaveLength(0);
  });
});

describe('🔴 o que a cadência manda vira linha na conversa', () => {
  it('template grava o CORPO renderizado, não só o nome', async () => {
    const sb = novoMock();
    await enviarTemplateCloud(
      { phone: '5574999225966', template: 'conteudo_semana', params: ['Ana', '5', 'Escuta ativa', 'https://x/5'] },
      { motivo: 'pilula', empresaId: 'e1', colaboradorId: 'c1' },
    );

    const [linha] = enviadas(sb);
    expect(linha).toBeTruthy();
    expect(linha.payload.template_nome).toBe('conteudo_semana');
    // Sem o corpo, a thread mostraria "enviado: conteudo_semana" e quem atende
    // não saberia a que a pessoa está respondendo.
    expect(linha.payload.texto).toContain('Ana');
    expect(linha.payload.texto).toContain('Escuta ativa');
    expect(linha.payload.origem).toBe('cadencia');
    expect(linha.payload.autor_email).toBeNull(); // automático, não humano
    expect(linha.payload.wa_message_id).toBe('wamid.NOVA');
  });

  it('template desconhecido ainda vira linha, com o rótulo', async () => {
    const sb = novoMock();
    await enviarTemplateCloud({ phone: '5511999998888', template: 'template_de_terceiro', params: [] }, {});

    const [linha] = enviadas(sb);
    expect(linha.payload.texto).toBeNull();
    expect(linha.payload.template_nome).toBe('template_de_terceiro');
  });

  it('envio que FALHOU também é gravado — tentativa invisível faz reescrever', async () => {
    const sb = novoMock();
    stubarFetch(() => ({ ok: false, status: 400, json: async () => ({ error: { message: 'template not found', code: 132001 } }) }));

    await enviarTemplateCloud({ phone: '5511999998888', template: 'conteudo_semana', params: ['A', '1', 'T', 'u'] }, {});

    const [linha] = enviadas(sb);
    expect(linha.payload.erro).toMatch(/132001/);
    expect(linha.payload.wa_message_id).toBeNull();
  });

  /**
   * 🔴 A chave da cadência NÃO é única no tempo — e a coluna tem índice único.
   *
   * `ultima_evidencia_whatsapp_em:<id>` e `missao:<id>` se repetem toda semana:
   * lá elas identificam o CARIMBO, não a mensagem. Gravadas aqui, o segundo envio
   * para a mesma pessoa colidiria em 23505 e sumiria da conversa — a thread
   * mostraria a primeira semana e mais nada, sem erro na tela.
   */
  it('🔴 envio de cadência NÃO carrega dedupe_key (a chave se repete toda semana)', async () => {
    const sb = novoMock();
    const chaveQueSeRepete = 'ultima_evidencia_whatsapp_em:envio-1';

    await enviarTemplateCloud(
      { phone: '5511999998888', template: 'registro_desafio', params: ['Ana', '5', 'u'] },
      { motivo: 'desafio', dedupeKey: chaveQueSeRepete },
    );
    await enviarTemplateCloud(
      { phone: '5511999998888', template: 'registro_desafio', params: ['Ana', '6', 'u'] },
      { motivo: 'desafio', dedupeKey: chaveQueSeRepete },
    );

    const linhas = enviadas(sb);
    expect(linhas).toHaveLength(2);
    for (const l of linhas) expect(l.payload.dedupe_key).toBeNull();
  });

  it('a caixa de entrada CONTINUA gravando a chave — é lá que o duplo clique existe', async () => {
    const sb = novoMock();
    await enviarTextoCloud(
      { phone: '5511999998888', texto: 'oi' },
      { origem: 'cadencia', dedupeKey: 'x' }, // origem inbox não grava aqui; ver o teste vizinho
    );
    expect(enviadas(sb)[0].payload.dedupe_key).toBeNull();
    // E o caminho do inbox: quem grava é `gravarEnviada` na action, com a chave.
    // Ver `tests/unit/integrations/inbox-fluxo.test.ts`.
  });

  it('🔴 o OTP grava o rótulo e NUNCA o código', async () => {
    const sb = novoMock();
    await enviarTemplateOtp({ phone: '5511999998888', codigo: '314159' }, { motivo: 'otp' });

    const [linha] = enviadas(sb);
    expect(linha.payload.template_nome).toBe('otp_acesso');
    expect(linha.payload.texto).toBeNull();
    // A caixa é lida pela equipe: um código ali é credencial de outra pessoa.
    expect(JSON.stringify(linha.payload)).not.toContain('314159');
  });
});

describe('🔴 quem grava é UM só — a mesma mensagem não pode aparecer duas vezes', () => {
  it('envio da caixa de entrada não grava aqui (a action já gravou, com autor e anexo)', async () => {
    const sb = novoMock();
    await enviarTextoCloud(
      { phone: '5511999998888', texto: 'resposta da equipe' },
      { motivo: 'atendimento', empresaId: 'e1', origem: 'inbox' },
    );

    expect(enviadas(sb)).toHaveLength(0);
  });
});

describe('a falha do registro não derruba o envio, e não some', () => {
  it('insert que falha vira degradação CRÍTICA — o efeito está do lado de fora', async () => {
    const sb = novoMock();
    sb.falharEm({ tabela: 'whatsapp_mensagens_enviadas', op: 'insert', mensagem: 'deadlock detected' });

    const r = await enviarTemplateCloud({ phone: '5511999998888', template: 'conteudo_semana', params: ['A', '1', 'T', 'u'] }, { empresaId: 'e1' });

    expect(r.ok).toBe(true); // a mensagem SAIU: o registro não pode desfazer isso
    const d = h.degradacoes.find((x) => x.chave === 'registrar-saida');
    expect(d?.severidade).toBe('critico');
    expect(d?.detalhe.motivo).toContain('deadlock');
  });

  it('conflito de unicidade é idempotência, não incidente', async () => {
    // Os dois índices únicos (wamid, dedupe_key) existem para o segundo registro
    // do mesmo envio não virar linha nova. Alarme aqui ensinaria a ignorá-lo.
    const sb = novoMock();
    sb.falharEm({ tabela: 'whatsapp_mensagens_enviadas', op: 'insert', mensagem: 'duplicate key', code: '23505' });

    await enviarTemplateCloud({ phone: '5511999998888', template: 'conteudo_semana', params: ['A', '1', 'T', 'u'] }, {});
    expect(h.degradacoes).toHaveLength(0);
  });
});
