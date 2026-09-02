// Quem pode receber a lista de nomes da equipe.
//
// A resposta ao "VER" carrega PII de TERCEIROS: nome de liderado e o estado da
// trilha dele. O risco desta feature não é mandar de menos, é mandar para quem
// não devia — e a palavra "VER" é pública por construção, porque está escrita na
// mensagem que o gestor recebe e pode encaminhar.
//
// Invariantes (cada `it` prova uma):
//   1. Sem dono resolvido (telefone ambíguo ou desconhecido) não responde.
//   2. Sem template enviado nas últimas 24h não responde — é ESTA porta que faz
//      a autorização vir do nosso envio, e não de alguém saber a palavra.
//   3. Reentrega da Meta não responde duas vezes.
//   4. A palavra é EXATA: "ver o que?" não dispara.
//   5. Recusa é reconhecida mesmo sem estar oferecida no template.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  enviosTexto: [] as any[],
  deliveries: [] as any[],
  montou: 0,
}));

vi.mock('@/lib/whatsapp/cloud-api', () => ({
  enviarTextoCloud: async (input: any, meta: any) => {
    h.enviosTexto.push({ input, meta });
    return { ok: true };
  },
}));

vi.mock('@/lib/degradacao', () => ({
  registrarDegradacao: async () => {},
  DEGRADACAO: { WHATSAPP_INBOUND_PERDIDO: 'whatsapp_inbound_perdido' },
}));

// O client admin devolve o que `h.deliveries` disser, para cada consulta.
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => {
      const q: any = {
        _dedupe: false,
        select() { return q; },
        eq(col: string, val: string) {
          if (col === 'dedupe_key') q._dedupe = val;
          return q;
        },
        gte() { return q; },
        limit() {
          const linhas = q._dedupe
            ? h.deliveries.filter((d) => d.dedupe_key === q._dedupe)
            : h.deliveries.filter((d) => d.kind === 'resumo-gestor' && !d.dedupe_key);
          return Promise.resolve({ data: linhas, error: null });
        },
      };
      return q;
    },
  }),
}));

// A montagem tem seus próprios testes; aqui interessa SE ela é chamada.
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => { h.montou++; throw new Error('não deveria chegar aqui'); } }));

const { responderPedidoDeResumo, ehPedidoDeResumo, ehRecusa } = await import('@/lib/notifications/ver-gestor');

const base = {
  colaboradorId: 'colab-1',
  empresaId: 'empresa-1',
  telefone: '5511999998888',
  waMessageId: 'wamid.ABC',
};

beforeEach(() => {
  h.enviosTexto.length = 0;
  h.deliveries.length = 0;
  h.montou = 0;
});

describe('a palavra não autoriza nada', () => {
  it('sem dono resolvido, não responde nem consulta', async () => {
    const r = await responderPedidoDeResumo({ ...base, colaboradorId: null });

    expect(r.enviou).toBe(false);
    expect(r.motivo).toContain('sem dono');
    expect(h.enviosTexto).toHaveLength(0);
  });

  it('sem template enviado nas últimas 24h, não responde', async () => {
    // Nenhuma entrega registrada: é o caso de alguém que descobriu a palavra
    // (encaminhou a mensagem, viu a tela de outro) e escreveu VER.
    const r = await responderPedidoDeResumo(base);

    expect(r.enviou).toBe(false);
    expect(r.motivo).toContain('sem template enviado');
    // Nem chegou a montar o resumo: a PII não foi sequer lida do banco.
    expect(h.montou).toBe(0);
    expect(h.enviosTexto).toHaveLength(0);
  });

  it('reentrega da Meta não responde duas vezes', async () => {
    h.deliveries.push({ dedupe_key: 'resumo-gestor:wamid.ABC' });

    const r = await responderPedidoDeResumo(base);

    expect(r.enviou).toBe(false);
    expect(r.motivo).toContain('já respondido');
    expect(h.enviosTexto).toHaveLength(0);
  });
});

describe('reconhecimento da palavra', () => {
  it('a palavra é exata — prefixo não dispara', () => {
    expect(ehPedidoDeResumo('VER')).toBe(true);
    expect(ehPedidoDeResumo('ver')).toBe(true);
    expect(ehPedidoDeResumo(' Ver! ')).toBe(true);
    expect(ehPedidoDeResumo('vér')).toBe(true);

    // Errar para o lado de não responder: uma dúvida não é um pedido de PII.
    expect(ehPedidoDeResumo('ver o que?')).toBe(false);
    expect(ehPedidoDeResumo('quero ver')).toBe(false);
    expect(ehPedidoDeResumo('verdade')).toBe(false);
    expect(ehPedidoDeResumo('')).toBe(false);
    expect(ehPedidoDeResumo(null)).toBe(false);
  });

  it('recusa é reconhecida mesmo não sendo oferecida no template', () => {
    // O template não convida a sair; ainda assim quem pede tem que ser
    // entendido, senão a saída que sobra é o Bloquear.
    expect(ehRecusa('SAIR')).toBe(true);
    expect(ehRecusa('parar')).toBe(true);
    expect(ehRecusa('Para de mandar')).toBe(true);
    expect(ehRecusa('não quero')).toBe(true);
    expect(ehRecusa('cancelar')).toBe(true);

    expect(ehRecusa('ver')).toBe(false);
    expect(ehRecusa('obrigada')).toBe(false);
  });
});
