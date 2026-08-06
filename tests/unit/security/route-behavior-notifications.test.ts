// Comportamento real das rotas de push (app/api/notifications/*).
//
// A invariante nº 1 é a que motivou este arquivo: a assinatura de Web Push
// pertence ao NAVEGADOR, não à conta. Sem reassociação de dono, o cenário
// A → logout → B faz as notificações de A (com o conteúdo de A) aparecerem na
// tela de B — e B nunca consegue se registrar, porque `pushManager.subscribe()`
// devolve a assinatura existente em vez de criar outra.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  auth: null as any,
  flagLigada: true,
  updates: [] as Array<{ patch: any; filtros: Array<[string, string, any]> }>,
  upsertPayload: null as any,
  /** injeta erro no update cujo filtro casar com esta coluna */
  erroNoUpdateDe: null as string | null,
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      update(patch: any) {
        const registro = { patch, filtros: [] as Array<[string, string, any]> };
        estado.updates.push(registro);
        const q: any = {
          eq(col: string, val: any) { registro.filtros.push(['eq', col, val]); return q; },
          neq(col: string, val: any) { registro.filtros.push(['neq', col, val]); return q; },
          then(res: any) {
            const falhou = estado.erroNoUpdateDe
              && registro.filtros.some(([, col]) => col === estado.erroNoUpdateDe);
            return Promise.resolve(
              falhou ? { error: { message: 'conexão caiu' } } : { error: null },
            ).then(res);
          },
        };
        return q;
      },
      upsert(payload: any) {
        estado.upsertPayload = payload;
        return { select: () => ({ single: async () => ({ data: { id: 'ep-1' }, error: null }) }) };
      },
    }),
  }),
}));

vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => estado.auth,
}));

vi.mock('@/lib/notifications/flag', () => ({
  pushHabilitado: async () => estado.flagLigada,
}));

const { POST } = await import('@/app/api/notifications/subscriptions/route');

const SUB = {
  endpoint: 'https://web.push.apple.com/abc123',
  keys: { p256dh: 'chave-p256', auth: 'chave-auth' },
};

function req(body: any, headers: Record<string, string> = {}) {
  return new Request('https://teste-piloto.vertho.ai/api/notifications/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'https://teste-piloto.vertho.ai', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/notifications/subscriptions', () => {
  beforeEach(() => {
    estado.auth = { colaborador: { id: 'colab-B' }, empresaId: 'emp-1', email: 'b@x.com' };
    estado.flagLigada = true;
    estado.updates = [];
    estado.upsertPayload = null;
    estado.erroNoUpdateDe = null;
  });

  // ── caminho de FALHA da reassociação (o que faltava) ───────────────────────
  it('🔴 se a reassociação de dono FALHA, não registra e devolve 500', () => {
    // Registrar a inscrição sem ter desativado o dono anterior é o único caminho
    // que produz "notificação de A na tela de B". Falhar aqui é obrigatório —
    // continuar seria trocar um erro visível por vazamento silencioso.
    estado.erroNoUpdateDe = 'subscription->>endpoint';
    return POST(req({ installationId: 'inst-1', subscription: SUB })).then((res) => {
      expect(res.status).toBe(500);
      expect(estado.upsertPayload, 'não pode ter registrado a inscrição nova').toBeNull();
    });
  });

  it('🔴 MESMA pessoa reinstalando: desativa a instalação anterior pelo endpoint', async () => {
    // A limpeza por user_agent casa por igualdade EXATA — um bump de iOS
    // (18_7 → 18_8) já a faz errar. E a reassociação de dono exclui o próprio
    // colaborador de propósito. Sem esta terceira regra o par (mesma pessoa,
    // mesmo endpoint, installation_id novo) violaria o índice único da mig 205 e
    // a pessoa levaria 500 ao reativar o push no PRÓPRIO aparelho.
    await POST(req({ installationId: 'inst-NOVA', subscription: SUB }));

    const limpeza = estado.updates.find((u) =>
      u.filtros.some(([, col, val]) => col === 'subscription->>endpoint' && val === SUB.endpoint)
      && u.filtros.some(([op, col, val]) => op === 'eq' && col === 'colaborador_id' && val === 'colab-B')
      && u.filtros.some(([op, col, val]) => op === 'neq' && col === 'installation_id' && val === 'inst-NOVA'),
    );
    expect(limpeza, 'nenhum update cobriu a reinstalação do mesmo dono').toBeTruthy();
    expect(limpeza!.patch.disabled_reason).toBe('reinstalacao');
  });

  it('falha na limpeza de DUPLICADOS não aborta — o custo é outro', () => {
    // Aqui o pior caso é notificação dobrada para a MESMA pessoa. Abortar
    // custaria a inscrição inteira, que é pior. A assimetria é deliberada.
    estado.erroNoUpdateDe = 'user_agent';
    return POST(req({ installationId: 'inst-1', subscription: SUB })).then((res) => {
      expect(res.status).toBe(200);
      expect(estado.upsertPayload).not.toBeNull();
    });
  });

  // ── 1. o bloqueador ────────────────────────────────────────────────────────
  it('🔴 A → logout → B: desativa o endpoint de OUTRO dono com a mesma subscription', async () => {
    const res = await POST(req({ installationId: 'inst-1', subscription: SUB }));
    expect(res.status).toBe(200);

    const reassociacao = estado.updates.find((u) =>
      u.filtros.some(([, col, val]) => col === 'subscription->>endpoint' && val === SUB.endpoint),
    );
    expect(reassociacao, 'nenhum update reassociou o dono da subscription').toBeTruthy();
    expect(reassociacao!.patch.enabled).toBe(false);
    // e tem que excluir o dono ATUAL, senão desativaria a própria inscrição nova
    expect(reassociacao!.filtros).toContainEqual(['neq', 'colaborador_id', 'colab-B']);
  });

  it('grava colaborador/empresa da SESSÃO, nunca do corpo', async () => {
    await POST(req({
      installationId: 'inst-1',
      subscription: SUB,
      colaboradorId: 'colab-INVASOR',
      empresaId: 'emp-INVASORA',
    }));
    expect(estado.upsertPayload.colaborador_id).toBe('colab-B');
    expect(estado.upsertPayload.empresa_id).toBe('emp-1');
  });

  // ── 2. flag como régua do SERVIDOR, não da UI ──────────────────────────────
  it('flag desligada → 403, mesmo com sessão válida', async () => {
    estado.flagLigada = false;
    const res = await POST(req({ installationId: 'inst-1', subscription: SUB }));
    expect(res.status).toBe(403);
    expect(estado.upsertPayload).toBeNull();
  });

  // ── 3. CSRF ────────────────────────────────────────────────────────────────
  it('origin não confiável → 403 antes de qualquer escrita', async () => {
    const res = await POST(req({ installationId: 'inst-1', subscription: SUB }, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(estado.upsertPayload).toBeNull();
  });

  // ── 4. sessão sem colaborador ──────────────────────────────────────────────
  it('sessão sem colaborador no tenant → 403', async () => {
    estado.auth = { colaborador: null, empresaId: 'emp-1', email: 'x@x.com' };
    const res = await POST(req({ installationId: 'inst-1', subscription: SUB }));
    expect(res.status).toBe(403);
  });

  // ── 5. forma da subscription ───────────────────────────────────────────────
  it('endpoint http:// → 400', async () => {
    const res = await POST(req({
      installationId: 'inst-1',
      subscription: { ...SUB, endpoint: 'http://push.example/x' },
    }));
    expect(res.status).toBe(400);
    expect(estado.upsertPayload).toBeNull();
  });

  it('subscription sem chaves → 400', async () => {
    const res = await POST(req({ installationId: 'inst-1', subscription: { endpoint: SUB.endpoint } }));
    expect(res.status).toBe(400);
  });
});
