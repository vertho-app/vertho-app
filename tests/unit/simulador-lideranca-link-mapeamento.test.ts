/**
 * Link "Mapeamento de liderança" do cabeçalho do simulador (revisão de
 * 27/09/2026, L-13).
 *
 * Até então o link era fixo em `/dashboard/assessment?trilho=lideranca` para
 * qualquer não-admin, sem olhar se a pessoa treina: o RH (que só acompanha) e
 * o gestor que só acompanha caíam numa recusa. O Mapeamento do RH mora em
 * `/dashboard/gestor/prontidao-lideranca`. A sonda da revisão provava o
 * defeito; aqui ela está invertida.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('@/lib/auth/fetch-auth', () => ({ fetchAuth: vi.fn() }));

import TreinoLideranca from '@/components/simulador-lideranca/treino';
import { resolverTrilhoLideranca } from '@/lib/prontidao-lideranca/trilho';

const pt = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8'));
const cabecalho = (props: Record<string, unknown>) => {
  const html = renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: 'pt-BR',
      messages: pt,
      timeZone: 'America/Sao_Paulo',
      children: createElement(TreinoLideranca, props),
    }),
  );
  return html.slice(0, html.indexOf('</header>'));
};
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

describe('link do cabeçalho para o Mapeamento de liderança', () => {
  it('o trilho do participante recusa o RH por regra (por isso o RH não pode ser mandado para lá)', async () => {
    const semBanco = new Proxy({}, { get: () => { throw new Error('não deveria ler o banco'); } });
    const sys = { modulos: { prontidao_lideranca: true }, prontidao_lideranca: { cargo_alvo: 'Gerente' } };
    const r = await resolverTrilhoLideranca(semBanco, { id: 'x', empresa_id: 'e', role: 'rh', email: 'rh@cliente.test' }, sys);
    expect(r).toMatchObject({ ok: false, code: 'FORA_DA_POPULACAO' });
  });

  it('🔴 RH vai para o Mapeamento dele', () => {
    const html = cabecalho({ podeTreinar: false, podeAcompanhar: true, mapeamento: '/dashboard/gestor/prontidao-lideranca' });
    expect(hrefs(html)).toEqual(['/dashboard/gestor/prontidao-lideranca']);
    expect(html).toContain(pt.SimuladorLideranca.assessment);
  });

  it('🔴 quem só acompanha (sem treinar) não recebe link para uma recusa', () => {
    const html = cabecalho({ podeTreinar: false, podeAcompanhar: true });
    expect(hrefs(html)).toEqual([]);
    expect(html).not.toContain(pt.SimuladorLideranca.assessment);
  });

  it('quem treina segue indo ao próprio trilho, e o admin à configuração', () => {
    expect(hrefs(cabecalho({ podeTreinar: true }))).toEqual(['/dashboard/assessment?trilho=lideranca']);
    expect(hrefs(cabecalho({ admin: true, empresaId: 'e1' }))).toEqual(['/admin/fit?empresa=e1&tab=prontidao']);
  });
});
