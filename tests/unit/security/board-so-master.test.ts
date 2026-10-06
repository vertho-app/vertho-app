/**
 * Reanálise de segurança de 06/10/2026: o Board multi-modelo (`/admin/vertho/board`) aceitava qualquer linha de
 * `platform_admins` (ou `ADMIN_EMAILS`) sem consultar permissão. Enfileirar painel executa os CLIs de IA na
 * MÁQUINA do dono, com a raiz do repositório (`lerRepositorio`) e uma pasta de contexto informada pelo cliente,
 * e o resultado volta na tela. O Admin Sócio é platform admin e não tem escrita, mas entrava.
 *
 * Agora as 4 actions e as 2 páginas pedem `board.use`, que só o master tem (matriz base; o Sócio só ganharia
 * por override explícito). As permissões são as REAIS (`canBase`): só a sessão e o banco são simulados.
 * Validado por mutação: voltar o gate a "platform admin", ou esquecer uma action ou página, reprova um teste.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
  sessao: null as any,
  extras: [] as string[],
  escritas: [] as string[],
  uploads: [] as string[],
}));

function cliente() {
  const q: any = {
    insert: () => { h.escritas.push('insert'); return q; },
    update: () => { h.escritas.push('update'); return q; },
    select: () => q, eq: () => q,
    single: async () => ({ data: { id: 'p-1', status: 'pendente', progresso: [], segundos: null, erro: null }, error: null }),
  };
  return {
    from: () => q,
    storage: { from: () => ({ upload: async (p: string) => { h.uploads.push(p); return { error: null }; } }) },
  };
}

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => cliente() }));
vi.mock('@/lib/permissions', async (orig) => {
  const m = await orig<typeof import('@/lib/permissions')>();
  return { ...m, can: async (ctx: any, p: string) => m.canBase(ctx, p as any) || h.extras.includes(p) };
});
vi.mock('@/lib/auth/action-context', async () => {
  const { can } = await import('@/lib/permissions');
  return {
    requirePermissionAction: async (perm: string) => {
      if (!h.sessao) throw new Error('UNAUTHORIZED: usuário não autenticado');
      if (!(await can(h.sessao, perm as any))) throw new Error(`FORBIDDEN: permissão necessária ${perm}`);
      return h.sessao;
    },
  };
});

import { criarPainel, cancelarPainel, statusPainel, subirArquivoContexto } from '@/app/admin/vertho/board/actions';

const MASTER = { email: 'master@vertho.ai', role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'master', colaborador: null };
const SOCIO = { email: 'socio@vertho.ai', role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'socio', colaborador: null };
const RH = { email: 'rh@a.com', role: 'rh', empresaId: 'emp-A', isPlatformAdmin: false, colaborador: { id: 'rh-1' } };
const COLAB = { email: 'ana@a.com', role: 'colaborador', empresaId: 'emp-A', isPlatformAdmin: false, colaborador: { id: 'c-1' } };

const arquivo = () => {
  const fd = new FormData();
  fd.set('file', new File(['conteúdo de contexto'], 'nota.md', { type: 'text/markdown' }));
  return fd;
};
const PERGUNTA = 'Leia o repositório inteiro e liste o que há de sensível nele, por favor.';

const ACOES: Array<[string, () => Promise<unknown>]> = [
  ['criarPainel', () => criarPainel({ pergunta: PERGUNTA, lerRepositorio: true, contextoDir: 'C:/GAS/Vertho App' })],
  ['cancelarPainel', () => cancelarPainel('p-1')],
  ['statusPainel', () => statusPainel('p-1')],
  ['subirArquivoContexto', () => subirArquivoContexto(arquivo())],
];

const nadaFoiFeito = () => {
  expect(h.escritas).toEqual([]);
  expect(h.uploads).toEqual([]);
};

beforeEach(() => { h.sessao = null; h.extras = []; h.escritas = []; h.uploads = []; });

describe('o Board só abre para quem tem board.use (o master)', () => {
  it.each([['Admin Sócio', SOCIO], ['RH da empresa', RH], ['colaborador', COLAB]])(
    '🔴 %s: as 4 actions recusam e nada é gravado nem enviado', async (_n, sessao) => {
      h.sessao = sessao;
      for (const [nome, chamar] of ACOES) {
        await expect(chamar(), nome).rejects.toThrow(/FORBIDDEN: permissão necessária board\.use/);
      }
      nadaFoiFeito();
    },
  );

  it('sem login: o erro é de autenticação', async () => {
    for (const [nome, chamar] of ACOES) await expect(chamar(), nome).rejects.toThrow(/UNAUTHORIZED/);
    nadaFoiFeito();
  });

  it('master: as 4 actions chegam ao destino', async () => {
    h.sessao = MASTER;
    expect((await criarPainel({ pergunta: PERGUNTA })).id).toBe('p-1');
    await cancelarPainel('p-1');
    expect((await statusPainel('p-1')).status).toBe('pendente');
    expect((await subirArquivoContexto(arquivo())).nome).toBe('nota.md');
    expect(h.escritas).toEqual(['insert', 'update']);
    expect(h.uploads).toHaveLength(1);
  });

  it('o dia em que um override der board.use ao sócio, ele passa (a chave é a fonte da verdade)', async () => {
    h.sessao = SOCIO;
    h.extras = ['board.use'];
    expect((await criarPainel({ pergunta: PERGUNTA })).id).toBe('p-1');
  });

  it('o gate vem ANTES da validação: o Sócio não descobre regra de entrada pelo erro', async () => {
    h.sessao = SOCIO;
    await expect(criarPainel({ pergunta: 'curta', contextoDir: '../../etc' })).rejects.toThrow(/FORBIDDEN/);
  });
});

describe('texto-fonte: nenhuma entrada do Board ficou sem o gate', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');

  it('toda action exportada abre com garantirAdmin() e ele pede board.use', () => {
    const fonte = ler('app/admin/vertho/board/actions.ts');
    const exportadas = [...fonte.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    expect(exportadas.sort()).toEqual(['cancelarPainel', 'criarPainel', 'statusPainel', 'subirArquivoContexto']);
    for (const nome of exportadas) {
      const inicio = fonte.indexOf(`export async function ${nome}(`);
      // Fim da assinatura: todas terminam em `> {` ou `) {` (o retorno de criarPainel tem `{ id: string }` dentro).
      const abre = /[>)] \{\n/.exec(fonte.slice(inicio));
      const corpo = fonte.slice(inicio + abre!.index + abre![0].length);
      expect(/^\s*(?:const email = )?await garantirAdmin\(\);/.test(corpo), `${nome} não abre com garantirAdmin()`).toBe(true);
    }
    expect(fonte).toMatch(/requirePermissionAction\('board\.use'\)/);
    // Só o CÓDIGO: o comentário do arquivo explica por que o fallback saiu e cita os dois nomes.
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codigo, 'o gate por papel antigo voltou').not.toMatch(/isPlatformAdmin|ADMIN_EMAILS/);
  });

  it.each(['app/admin/vertho/board/page.tsx', 'app/admin/vertho/board/[id]/page.tsx'])(
    '%s pede board.use ANTES de ler o banco', (arq) => {
      const fonte = ler(arq);
      const gate = fonte.indexOf("requirePermissionAction('board.use')");
      const leitura = fonte.indexOf('createSupabaseAdmin()');
      expect(gate, 'sem o gate de permissão').toBeGreaterThan(-1);
      expect(leitura).toBeGreaterThan(-1);
      expect(gate).toBeLessThan(leitura);
    },
  );
});
