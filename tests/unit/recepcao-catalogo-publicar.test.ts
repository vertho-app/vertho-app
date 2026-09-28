/**
 * A-1 da revisão de 27/09/2026: publicar uma versão no Catálogo arquiva só a
 * versão publicada do MESMO DEGRAU do caso.
 *
 * No banco (SELECT de 27/09/2026) cada um dos 5 códigos tem 3 degraus publicados
 * ao mesmo tempo: introdução 1.3, sob pressão 2.3 e limite 3.3, todos no
 * Catálogo. O arquivamento filtrava só `codigo`, então publicar o 3.4 do Limite
 * arquivava também 1.3 e 2.3, para todas as empresas, e arquivado é imutável.
 *
 * O teste aplica os filtros REAIS da escrita de arquivamento (a cadeia gravada
 * pelo `criarSupabaseMock`) sobre as 15 linhas do banco, em vez de conferir um
 * `.eq` isolado: o que importa é quais linhas a cadeia atinge.
 */
import { describe, expect, test, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '@/tests/helpers/supabase-mock';

vi.mock('@/lib/permissions', () => ({ can: async () => true }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => { throw new Error('sem banco no teste'); } }));

import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { aplicarMatrizAtendimento } from '@/lib/recepcao/matriz-avaliacao';
import { editarCenario } from '@/lib/recepcao/cenarios';

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const RASCUNHO = '50000000-0000-4000-8000-000000000034';
const CAMINHO_NIVEL = 'conteudo->publico->>nivel';

// As 15 versões publicadas do Catálogo em produção (codigo, versao, nivel).
const PUBLICADAS = ['convenio-pendente', 'falta-consulta', 'informacao-terceiro', 'primeira-consulta', 'remarcacao-02'].flatMap(
  (codigo, i) =>
    (['1.3:introducao', '2.3:pressao', '3.3:limite'] as const).map((vn, j) => {
      const [versao, nivel] = vn.split(':');
      return { id: `6000000${i}-0000-4000-8000-00000000000${j}`, empresa_id: null, codigo, versao, nivel, estado: 'publicado' };
    }),
);

const valor = (linha: any, coluna: string) => (coluna === CAMINHO_NIVEL ? (linha.nivel ?? null) : linha[coluna]);
function atingidas(linhas: any[], cadeia: Chamada[]) {
  return linhas.filter((l) =>
    cadeia.every(({ metodo, args: [k, v] }) =>
      metodo === 'eq' ? valor(l, k) === v : metodo === 'neq' ? valor(l, k) !== v : metodo === 'is' ? valor(l, k) === v : true,
    ),
  );
}

/** Publica um rascunho do Catálogo e devolve a cadeia da escrita de arquivamento. */
async function publicar(conteudo: any) {
  const atual = { id: RASCUNHO, empresa_id: null, codigo: conteudo.id, versao: conteudo.versao, estado: 'rascunho', revisao: 0, conteudo };
  const sb = criarSupabaseMock({ resolver: (t) => (t === 'recepcao_cenarios' ? atual : null) });
  const ctx: any = { auth: { isPlatformAdmin: true, email: 'admin@example.test' }, empresaId: EMPRESA, ownerKey: 'admin:1', dominio: 'recepcao_medica', sb: sb.client };
  await editarCenario(ctx, { acao: 'publicar', id: RASCUNHO, revisao: 0, conteudo, catalogo: true } as any);
  const updates = sb.chamadas.map((c, i) => ({ ...c, i })).filter((c) => c.tabela === 'recepcao_cenarios' && c.metodo === 'update');
  // 1ª escrita: publicar o rascunho; 2ª: arquivar a versão anterior.
  expect(updates).toHaveLength(2);
  expect(updates[1].args[0]).toMatchObject({ estado: 'arquivado' });
  const proxima = sb.chamadas.slice(updates[1].i + 1).findIndex((c) => c.metodo === 'update' || c.metodo === 'insert');
  const fim = proxima < 0 ? sb.chamadas.length : updates[1].i + 1 + proxima;
  return sb.chamadas.slice(updates[1].i + 1, fim).filter((c) => c.tabela === 'recepcao_cenarios');
}

describe('A-1: publicar no Catálogo arquiva só o mesmo degrau', () => {
  test('3.4 do Limite de "primeira-consulta" arquiva só o 3.3; 1.3 e 2.3 seguem publicados', async () => {
    const limite = aplicarMatrizAtendimento(structuredClone(catalogoLimites.find((c) => c.id === 'primeira-consulta')!));
    limite.versao = '3.4';
    expect(limite.publico.nivel).toBe('limite');
    const cadeia = await publicar(limite);
    const alvo = atingidas(PUBLICADAS, cadeia);
    expect(alvo.map((l) => `${l.codigo} ${l.versao} ${l.nivel}`)).toEqual(['primeira-consulta 3.3 limite']);
    // Os outros 14 continuam publicados: a escada inteira dos cinco casos.
    expect(PUBLICADAS.filter((l) => !alvo.includes(l))).toHaveLength(14);
  });

  test('1.4 da Introdução arquiva só o 1.3 do mesmo caso', async () => {
    const intro = aplicarMatrizAtendimento(structuredClone(catalogoInicial.find((c) => c.id === 'remarcacao-02')!));
    intro.versao = '1.4';
    const alvo = atingidas(PUBLICADAS, await publicar(intro));
    expect(alvo.map((l) => `${l.codigo} ${l.versao}`)).toEqual(['remarcacao-02 1.3']);
  });

  test('versão sem degrau (legado) não arquiva nenhum degrau publicado, só outra sem degrau', async () => {
    const legado = aplicarMatrizAtendimento(structuredClone(catalogoLimites.find((c) => c.id === 'primeira-consulta')!));
    legado.versao = '0.9';
    delete legado.publico.nivel;
    const semNivel = { id: '70000000-0000-4000-8000-000000000001', empresa_id: null, codigo: 'primeira-consulta', versao: '0.8', nivel: null, estado: 'publicado' };
    const alvo = atingidas([...PUBLICADAS, semNivel], await publicar(legado));
    expect(alvo).toEqual([semNivel]);
  });
});
