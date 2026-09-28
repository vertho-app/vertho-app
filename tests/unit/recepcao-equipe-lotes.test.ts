/**
 * A-4 da revisão de 27/09/2026: a aba Equipe do atendimento quebrava a partir de
 * cerca de 300 pessoas visíveis.
 *
 * `painelEquipe` mandava TODAS as pessoas num único `.in('colaborador_id', …)`,
 * que o supabase-js serializa na query string do GET. Medido com o cliente real:
 * 100 pessoas = 4.116 caracteres; 300 = 11.916, acima da recusa perto de 11 KB
 * que o próprio repo registra (`lib/prontidao-lideranca/agregar.ts`).
 *
 * O teste usa o supabase-js DE VERDADE com o `fetch` interceptado: o que se mede
 * é a URL que sairia para o PostgREST, não uma cadeia de mock.
 */
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

vi.mock('@/lib/permissions', () => ({ can: async (_a: unknown, p: string) => p !== 'ai.costs.view' }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => { throw new Error('sem banco no teste'); } }));

import { painelEquipe } from '@/lib/recepcao/equipe';
import { abrirSessao } from '@/lib/recepcao/core';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { aplicarMatrizAtendimento } from '@/lib/recepcao/matriz-avaliacao';

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const PESSOAS = Array.from({ length: 300 }, (_, i) => ({
  id: `2${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`,
  empresa_id: EMPRESA,
  nome_completo: `Pessoa ${i}`,
  email: `p${i}@exemplo.test`,
  gestor_email: 'rh@exemplo.test',
  cargo: 'Recepção',
  role: 'colaborador',
}));
/** Uma sessão da pessoa 250: só aparece se o ÚLTIMO lote também for consultado. */
function sessaoDa(pessoa: (typeof PESSOAS)[number]) {
  const estado = abrirSessao(aplicarMatrizAtendimento(structuredClone(catalogoLimites[0])), 0);
  estado.respostas = 1;
  return { id: estado.id, empresa_id: EMPRESA, colaborador_id: pessoa.id, owner_key: `colab:${pessoa.id}`, created_at: '2026-09-26T12:00:00Z', estado };
}

describe('A-4: painel da equipe com 300 pessoas', () => {
  it('consulta as sessões em lotes de 100, sem URL acima de ~4,5 mil caracteres, e junta todos os lotes', async () => {
    const urls: URL[] = [];
    const alvo = sessaoDa(PESSOAS[250]);
    const sb = createClient('https://abcdefghijklmnopqrst.supabase.co', 'chave-ficticia', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (u: any) => {
          const url = new URL(String(u));
          urls.push(url);
          const tabela = url.pathname.split('/').at(-1);
          let corpo: unknown = [];
          if (tabela === 'colaboradores') corpo = PESSOAS;
          else if (tabela === 'recepcao_sessoes') {
            const ids = (url.searchParams.get('colaborador_id') || '').replace(/^in\.\(|\)$/g, '').split(',');
            corpo = ids.includes(alvo.colaborador_id) ? [alvo] : [];
          }
          return new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
        },
      },
    });
    const ctx: any = {
      empresaId: EMPRESA,
      dominio: 'recepcao_medica',
      sb,
      auth: { isPlatformAdmin: false, role: 'rh', empresaId: EMPRESA, email: 'rh@exemplo.test', colaborador: { id: 'rh', empresa_id: EMPRESA, email: 'rh@exemplo.test' } },
    };
    const painel = await painelEquipe(ctx, 30);
    const sessoes = urls.filter((u) => u.pathname.endsWith('/recepcao_sessoes'));
    const maior = Math.max(...urls.map((u) => u.search.length));
    console.log('[A-4] leituras de sessões:', sessoes.length, '· maior query string:', maior);
    expect(sessoes).toHaveLength(3);
    expect(maior).toBeLessThan(4_500);
    // Todos os 300 ids foram consultados, cada um uma vez.
    const consultados = sessoes.flatMap((u) => (u.searchParams.get('colaborador_id') || '').replace(/^in\.\(|\)$/g, '').split(','));
    expect(new Set(consultados).size).toBe(300);
    expect(painel.sessoes.map((s: any) => s.id)).toEqual([alvo.id]);
  });
});
