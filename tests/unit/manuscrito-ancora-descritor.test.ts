import { describe, it, expect } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { persistirModuloDeManuscrito } from '@/lib/manuscrito-modulos';

/**
 * O campo `descritor` do Módulo-Base é a ÂNCORA por onde o resolver de conteúdo
 * casa a semana com o material — não é rótulo editorial (F-I12: 18 MBs gravados
 * com o título fizeram 14 conteúdos ancorarem no assunto vizinho, em silêncio).
 *
 * O manuscrito nomeia o capítulo como a autora quis ("POSTURA DIANTE DO
 * CONFLITO"); a régua nomeia o descritor como o produto mede ("Postura diante do
 * conflito"). Quem manda é a RÉGUA. No DIR08 os dois coincidem a menos de caixa,
 * mas `resolverDescritores` trata divergência de nome como aviso e casa por
 * ORDEM — ou seja, o caso em que discordam é previsto, não hipotético.
 */
const COMP = {
  id: 'c-007-d1',
  cod_comp: 'C007',
  cod_desc: 'C007_D1',
  nome: 'GERENCIAMENTO DE CONFLITOS',
  nome_curto: 'Postura diante do conflito',
  cargo: 'Diretor(a) Escolar',
};

const CORPO = {
  conteudo_central: { a: 1 },
  conteudo_aplicavel: { b: 2 },
  guarda_corpos: { c: 3 },
  adaptacao_por_formato: { d: 4 },
};

function args(extra: Partial<Parameters<typeof persistirModuloDeManuscrito>[1]> = {}) {
  return {
    comp: COMP as any,
    empresaId: 'emp-1',
    nivel_entrada: 'N1' as const,
    nivel_destino: 'N2' as const,
    locale: 'pt-BR',
    descritor: 'POSTURA DIANTE DO CONFLITO', // rótulo do manuscrito
    corpo: CORPO,
    codManuscrito: 'DIR08',
    microblocos: ['DIR08_MB01', 'DIR08_MB02'],
    createdBy: 'teste',
    ...extra,
  };
}

describe('persistirModuloDeManuscrito — âncora do descritor', () => {
  it('grava o nome_curto da RÉGUA no campo `descritor`, não o rótulo do manuscrito', async () => {
    const sb = criarSupabaseMock({ resolver: () => ({ id: 'mb-1' }) });
    const r = await persistirModuloDeManuscrito(sb.client, args());
    expect(r.error).toBeUndefined();

    const ins = sb.escritas.find((e) => e.tabela === 'modulos_base_conteudo' && e.op === 'insert');
    expect(ins).toBeDefined();
    expect((ins!.payload as any).descritor).toBe('Postura diante do conflito');
    expect((ins!.payload as any).titulo).toBe('Postura diante do conflito · N1→N2');
    // o código do manuscrito continua rastreável, mas como TAG — não como âncora
    expect((ins!.payload as any).tags).toContain('DIR08');
  });

  it('cai no rótulo do manuscrito quando a régua não tem nome_curto', async () => {
    const sb = criarSupabaseMock({ resolver: () => ({ id: 'mb-1' }) });
    await persistirModuloDeManuscrito(sb.client, args({ comp: { ...COMP, nome_curto: null } as any }));

    const ins = sb.escritas.find((e) => e.tabela === 'modulos_base_conteudo' && e.op === 'insert');
    expect((ins!.payload as any).descritor).toBe('POSTURA DIANTE DO CONFLITO');
  });

  it('devolve o erro do insert em vez de fingir sucesso', async () => {
    const sb = criarSupabaseMock({ resolver: () => ({ id: 'mb-1' }) });
    sb.falharEm({ tabela: 'modulos_base_conteudo', op: 'insert', mensagem: 'boom' });
    const r = await persistirModuloDeManuscrito(sb.client, args());
    expect(r.error).toMatch(/boom/);
    expect(r.id).toBeUndefined();
  });
});
