import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { COMPETENCIAS_LIDERANCA } from '@/lib/simuladores/lideranca/matriz-global';

/**
 * O assessment decide, no SERVIDOR, quando a tela de preferências de aprendizagem
 * entra (01/10/2026): logo depois da PRIMEIRA competência respondida do primeiro
 * mapeamento, tenant sem DISC nativo, pessoa que ainda não preencheu. A tela só
 * obedece `precisaPreferencias`.
 *
 * 🔴 A 1ª versão pedia só ao CONCLUIR as 5-6 competências: quem terminava a
 * primeira (Boehringer, mesmo dia) nunca via a tela. Os casos abaixo respondem
 * 1 de 5 de propósito.
 *
 * Molde: assessment-trilho-lideranca.test.ts. Aqui `@/lib/access-gates` é o REAL —
 * a regra sob teste mora nele.
 */

const CARGO5 = ['Prospecção', 'Negociação', 'Pós-venda', 'Resiliência', 'Metas'];
const LID5 = [...COMPETENCIAS_LIDERANCA];
const CONTRATADO = { modulos: { prontidao_lideranca: true }, prontidao_lideranca: { cargo_alvo: 'Gerente Comercial' } };

const cenario = {
  cfg: {} as any,
  sysConfig: {} as any,
  prefVideoCurto: 0 as number | null,
  top5Cargo: CARGO5 as string[],
  respondidas: [] as string[],
};

const comps = [
  ...CARGO5.map((nome, i) => ({ id: `c-${i + 1}`, nome, cod_desc: null })),
  ...LID5.map((nome, i) => ({ id: `l-${i + 1}`, nome, cod_desc: null })),
];

let sb: ReturnType<typeof criarSupabaseMock>;

sb = criarSupabaseMock({
  resolver: (table, cols) => {
    if (table === 'cargos_empresa') {
      return cols.includes('nome') ? { nome: 'Gerente Comercial', top5_workshop: LID5 } : { top5_workshop: cenario.top5Cargo };
    }
    if (table === 'empresas') return { is_demo: false, sys_config: cenario.sysConfig };
    if (table === 'colaboradores') return { pref_video_curto: cenario.prefVideoCurto };
    if (table === 'banco_cenarios') return { id: 'cen-1', titulo: 'Cenário', descricao: 'Contexto', alternativas: [] };
    return null;
  },
  lista: (table) => {
    if (table === 'cargos_empresa') return [{ nome: 'Gerente Comercial', top5_workshop: LID5 }, { nome: 'Vendedor', top5_workshop: CARGO5 }];
    if (table === 'competencias') return comps;
    if (table === 'respostas') {
      // O que já estava no banco + o que a action acabou de gravar (o mock não persiste).
      const gravadas = (sb?.escritas || [])
        .filter((e) => e.tabela === 'respostas')
        .map((e) => ({ competencia_id: e.payload?.competencia_id, competencia_nome: e.payload?.competencia_nome, timestamp_resposta: e.payload?.timestamp_resposta }));
      return [
        ...cenario.respondidas.map((nome) => ({
          competencia_id: comps.find((c) => c.nome === nome)?.id,
          competencia_nome: nome,
          timestamp_resposta: '2026-09-30T12:00:00Z',
        })),
        ...gravadas,
      ];
    }
    if (table === 'banco_cenarios') return comps.map((c) => ({ id: `cen-${c.id}`, competencia_id: c.id }));
    return [];
  },
  escrita: (table) => (table === 'respostas' ? [{ id: 'resp-nova' }] : null),
});

vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn(async () => ({ id: 'colab-1', nome_completo: 'Ana', cargo: 'Vendedor', role: 'colaborador', empresa_id: 'emp', escola_id: null, email: 'ana@cliente.com' })),
}));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: vi.fn(async () => 'ana@cliente.com') }));
vi.mock('@/lib/turmas', () => ({ configEfetivaDoColaborador: vi.fn(async () => cenario.cfg) }));

import { getDiagnosticoDoDia, salvarRespostaDiagnostico } from '@/app/dashboard/assessment/assessment-actions';

const EXTERNO = { perfil_externo_fonte: 'opq32', mapeamento_cenarios_liberado: true };
const COM_DISC = { mapeamento_cenarios_liberado: true };
const resposta = { r1: 'x'.repeat(30), r2: 'x'.repeat(30), r3: 'x'.repeat(30), r4: 'x'.repeat(30), repr: 8 };

describe('assessment: pede as preferências de aprendizagem depois da primeira competência', () => {
  beforeEach(() => {
    sb.reset();
    cenario.cfg = EXTERNO;
    cenario.sysConfig = {};
    cenario.prefVideoCurto = 0;
    cenario.top5Cargo = CARGO5;
    cenario.respondidas = CARGO5.slice(0, 1);
  });

  it('🔴 tenant sem DISC nativo, SÓ a primeira competência respondida, nada preenchido -> pede (o caso do Boehringer)', async () => {
    const r: any = await getDiagnosticoDoDia('cargo');
    expect(r.error).toBeUndefined();
    expect(r.concluiuTudo).toBe(false);
    expect(r.progresso).toMatchObject({ respondidas: 1, total: 5 });
    expect(r.precisaPreferencias).toBe(true);
  });

  it('mapeamento todo concluído e nada preenchido também pede (quem já terminou antes do deploy)', async () => {
    cenario.respondidas = [...CARGO5];
    const r: any = await getDiagnosticoDoDia('cargo');
    expect(r.concluiuTudo).toBe(true);
    expect(r.precisaPreferencias).toBe(true);
  });

  it('nenhuma competência respondida ainda -> não pede, e nem lê a coluna', async () => {
    cenario.respondidas = [];
    const r: any = await getDiagnosticoDoDia('cargo');
    expect(r.concluiuTudo).toBe(false);
    expect(r.precisaPreferencias).toBe(false);
    expect(sb.usou('colaboradores', 'select')).toBe(false);
  });

  it('já preencheu -> não pede de novo', async () => {
    cenario.prefVideoCurto = 4;
    const r: any = await getDiagnosticoDoDia('cargo');
    expect(r.precisaPreferencias).toBe(false);
  });

  it('🔴 tenant COM DISC nativo não é puxado — e nem lê a coluna', async () => {
    cenario.cfg = COM_DISC;
    const r: any = await getDiagnosticoDoDia('cargo');
    expect(r.precisaPreferencias).toBe(false);
    expect(sb.usou('colaboradores', 'select')).toBe(false);
  });

  it('falha ao ler a preferência devolve erro — não vira "não precisa" nem "precisa" por engano', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'coluna inexistente' });
    const r: any = await getDiagnosticoDoDia('cargo');
    expect(r.error).toMatch(/coluna inexistente/);
    expect(r.precisaPreferencias).toBeUndefined();
  });

  describe('ao SALVAR a resposta (a tela segue direto para as preferências)', () => {
    beforeEach(() => { cenario.respondidas = []; });

    it('🔴 salvar a PRIMEIRA competência já devolve precisaPreferencias (a pergunta de aderência é seguida da tela)', async () => {
      const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', CARGO5[0], resposta, 'cargo');
      expect(r.success).toBe(true);
      expect(r.concluiuTudo).toBe(false);
      expect(r.precisaPreferencias).toBe(true);
    });

    it('já preencheu -> a resposta salva sem pedir', async () => {
      cenario.prefVideoCurto = 5;
      const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', CARGO5[0], resposta, 'cargo');
      expect(r.success).toBe(true);
      expect(r.precisaPreferencias).toBe(false);
    });

    it('tenant com DISC nativo -> salva sem pedir', async () => {
      cenario.cfg = COM_DISC;
      const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', CARGO5[0], resposta, 'cargo');
      expect(r.success).toBe(true);
      expect(r.precisaPreferencias).toBe(false);
    });

    it('🔴 falha ao ler a preferência NÃO derruba o salvamento (a resposta já foi gravada)', async () => {
      sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'coluna inexistente' });
      const r: any = await salvarRespostaDiagnostico('cen-1', 'c-1', CARGO5[0], resposta, 'cargo');
      expect(r.success).toBe(true);
      expect(r.error).toBeUndefined();
      expect(r.precisaPreferencias).toBe(false);
      expect(sb.escritas.some((e) => e.tabela === 'respostas')).toBe(true);
    });
  });

  describe('trilho de liderança é o SEGUNDO mapeamento', () => {
    beforeEach(() => {
      cenario.sysConfig = CONTRATADO;
      cenario.respondidas = LID5.slice(0, 1);
    });

    it('quem tem mapeamento de cargo disponível não é pedido aqui (é pedido no do cargo)', async () => {
      const r: any = await getDiagnosticoDoDia('lideranca');
      expect(r.error).toBeUndefined();
      expect(r.precisaPreferencias).toBe(false);
    });

    it('quem SÓ lidera (cargo sem Top 5) tem o de liderança como primeiro -> pede', async () => {
      cenario.top5Cargo = [];
      const r: any = await getDiagnosticoDoDia('lideranca');
      expect(r.error).toBeUndefined();
      expect(r.precisaPreferencias).toBe(true);
    });
  });
});
