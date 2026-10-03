/**
 * V-8 da revisão de 27/09/2026: o laço iniciar e descartar (descartar é livre
 * antes da primeira fala, e cada início paga o criador de cenário) só tinha
 * como freio os 10 POST/min por pessoa. Agora iniciar tem teto próprio por
 * hora, com mensagem que diz quanto falta; conversar não entra nesse teto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ executar: vi.fn(), ownerKey: 'colab:a' }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({ email: 'pessoa@cliente.test' }),
}));
vi.mock('@/lib/simulador-vendas/access', () => ({
  contexto: async () => ({ empresaId: 'empresa-a', ownerKey: mocks.ownerKey }),
}));
vi.mock('@/lib/simulador-vendas/service', () => ({
  executar: (...args: unknown[]) => mocks.executar(...args),
  consultar: vi.fn(),
  consultarHistorico: vi.fn(),
}));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_c: unknown, fn: () => unknown) => fn() }));
import { readFileSync } from 'node:fs';
import { createTranslator } from 'next-intl';
import { POST } from '@/app/api/simulador-vendas/route';
import { CODIGO_LIMITE_INICIOS_VENDAS, INICIOS_POR_HORA_VENDAS } from '@/lib/rate-limit';
import { lerResposta } from '@/lib/simuladores/ler-resposta';

let n = 0;
const uuid = () => `20000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const req = (corpo: Record<string, unknown>) =>
  new Request('http://localhost/api/simulador-vendas', {
    method: 'POST',
    headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: uuid(), ...corpo }),
  });
const iniciar = () => POST(req({ acao: 'iniciar', nivel: 1 }));

describe('V-8: teto de inícios por hora no simulador de vendas', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    mocks.ownerKey = `colab:${uuid()}`;
    mocks.executar.mockReset().mockResolvedValue({ sessao: { id: 'x' } });
  });

  it('depois do teto, iniciar recebe 429 com mensagem clara e não chega ao serviço', async () => {
    for (let i = 0; i < INICIOS_POR_HORA_VENDAS; i++) expect((await iniciar()).status).toBe(200);
    const bloqueado = await iniciar();
    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers.get('retry-after'))).toBeGreaterThan(55 * 60);
    expect((await bloqueado.json()).error).toMatch(
      /^Você começou 6 treinos na última hora\. Para começar outro, aguarde cerca de 60 min\./,
    );
    expect(mocks.executar).toHaveBeenCalledTimes(INICIOS_POR_HORA_VENDAS);
  });

  it('R-110: o 429 leva código, limite e espera, e a tela traduz a mensagem nos quatro idiomas', async () => {
    for (let i = 0; i < INICIOS_POR_HORA_VENDAS; i++) await iniciar();
    const corpo = await (await iniciar()).json();
    expect(corpo).toMatchObject({ codigo: CODIGO_LIMITE_INICIOS_VENDAS, limite: INICIOS_POR_HORA_VENDAS });
    expect(corpo.esperaSegundos).toBeGreaterThan(55 * 60);

    // O caminho da tela: o leitor comum com o tradutor do vendas.
    const minutos = Math.ceil(corpo.esperaSegundos / 60);
    for (const locale of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const mensagens = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      const t = createTranslator({ locale, messages: mensagens, namespace: 'SimuladorVendas' });
      const resposta = new Response(JSON.stringify(corpo), { status: 429 });
      const erro = await lerResposta(resposta, { semCorpo: 'x', generica: 'y' }, (c, status) =>
        status === 429 && c.codigo === CODIGO_LIMITE_INICIOS_VENDAS
          ? t('startLimitReached', { limit: c.limite, minutes: Math.ceil(c.esperaSegundos / 60) })
          : null,
      ).catch((e: Error) => e.message);
      expect(erro, locale).toContain(String(INICIOS_POR_HORA_VENDAS));
      expect(erro, locale).toContain(String(minutos));
      if (locale !== 'pt-BR') expect(erro, locale).not.toBe(corpo.error);
    }
    // E a tela de fato passa o tradutor ao leitor.
    const fonte = readFileSync('components/simulador-vendas/treino.tsx', 'utf8');
    expect(fonte).toMatch(/corpo\.codigo === CODIGO_LIMITE_INICIOS_VENDAS[\s\S]{0,80}t\('startLimitReached'/);
  });

  it('o teto é só de início: conversar e encerrar seguem', async () => {
    for (let i = 0; i <= INICIOS_POR_HORA_VENDAS; i++) await iniciar();
    const sessao = { sessaoId: uuid(), revisao: 1 };
    expect((await POST(req({ acao: 'responder', mensagem: 'Oi', ...sessao }))).status).toBe(200);
    expect((await POST(req({ acao: 'encerrar', ...sessao }))).status).toBe(200);
  });

  it('é por pessoa: o teto de uma não bloqueia a outra', async () => {
    for (let i = 0; i <= INICIOS_POR_HORA_VENDAS; i++) await iniciar();
    mocks.ownerKey = `colab:${uuid()}`;
    expect((await iniciar()).status).toBe(200);
  });
});
