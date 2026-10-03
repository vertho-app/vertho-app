/**
 * Mapeamento de liderança para o CLIENTE (R-39, decisão 1 do dono na revisão
 * de 02/10/2026): o RH vê nível de 1 a 4, nunca a nota decimal; a nota fica
 * só no admin da Vertho.
 *
 * Duas provas: a projeção pura (`lib/prontidao-lideranca/cliente.ts`) tira todo
 * número decimal do dado, e a PORTA do RH (`getProntidaoLideranca`,
 * `getParecerLideranca`) entrega o dado projetado, enquanto a do admin entrega
 * os números. Esconder só na tela deixaria a nota no corpo da resposta.
 *
 * E o erro técnico não chega à tela: vai para o log e volta como frase com
 * código.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nivelMeta, parecerParaCliente, prontidaoParaCliente } from '@/lib/prontidao-lideranca/cliente';
import type { Parecer, ProntidaoLideranca } from '@/lib/prontidao-lideranca/agregar';
import type { LinhaMatriz } from '@/lib/prontidao-lideranca/matriz';

const linha = (nome: string, quadrante: LinhaMatriz['quadrante'], mediaGeral: number): LinhaMatriz => ({
  colaboradorId: `id-${nome}`, nome, cargo: 'Vendedora', quadrante,
  posicao: {
    colaboradorId: `id-${nome}`, total: 2, cobertas: 2, completo: true, faltantes: [], mediaGeral, nivelGeral: 3,
    posicao: 'demonstra', gaps: ['Delegação'], parciais: [],
    competencias: [
      { competencia: 'Priorização', media: 3.85, nivel: 4, descritores: 6, parcial: false, posicao: 'demonstra', gap: false },
      { competencia: 'Delegação', media: 2.45, nivel: 2, descritores: 6, parcial: false, posicao: 'nao_demonstra', gap: true },
    ],
  },
  estilo: { colaboradorId: `id-${nome}`, nome, aderenciaPct: 61.27, estilo: 'distante', status: 'abaixo_do_corte' as any, statusLabel: 'Abaixo do corte', bloqueadoNoAlvo: false, motivosBloqueio: [], lacunas: [{ traco: 'Comando', bloco: 'Competencia', fitPct: 40.6 }], borderline: false },
  frasesGap: ['Delegação: média 2,45 (corte 3,00)'],
  auditoriaPendente: false,
});

const dados = (): ProntidaoLideranca => ({
  cargoAlvo: 'Gerente', competencias: ['Priorização', 'Delegação'], calculadoEm: '2026-10-03T12:00:00Z', corte: 3,
  populacao: 3,
  // Ordem do núcleo: quadrante, depois média desc (Zeca 3,41 antes de Ana 3,12).
  linhas: [linha('Zeca', 'pronta', 3.41), linha('Ana', 'pronta', 3.12), linha('Bia', 'nao_agora', 2.33)],
  porQuadrante: { pronta: 2, pronta_com_custo: 0, potencial: 0, nao_agora: 1 },
  incompletos: [], semEstilo: [], naoIniciados: 0, faixas: { recomendadoMin: 86.5, ressalvasMin: 75.4 },
  avisos: [], avisosCodigos: [],
});

/** Algum número com casa decimal em qualquer ponto do objeto? */
function decimais(obj: unknown): string[] {
  const achados: string[] = [];
  const andar = (v: unknown, caminho: string) => {
    if (typeof v === 'number' && !Number.isInteger(v)) achados.push(`${caminho}=${v}`);
    else if (typeof v === 'string' && /\d,\d{2}\b/.test(v)) achados.push(`${caminho}="${v}"`);
    else if (Array.isArray(v)) v.forEach((x, i) => andar(x, `${caminho}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) andar(x, `${caminho}.${k}`);
  };
  andar(obj, '');
  return achados;
}

describe('projeção do Mapeamento de liderança para o cliente', () => {
  it('pré-condição: o dado do núcleo TEM decimais (senão a prova abaixo passaria vazia)', () => {
    expect(decimais(dados()).length).toBeGreaterThan(5);
  });

  it('a matriz do cliente não leva nenhum número decimal, e leva o nível e a meta', () => {
    const c = prontidaoParaCliente(dados());
    expect(decimais(c)).toEqual([]);
    expect(c).toMatchObject({ corte: null, metaNivel: 3, exibeNota: false, faixas: null });
    expect(c.linhas[0].posicao.nivelGeral).toBe(3);
    expect(c.linhas[0].posicao.competencias.map((x) => x.nivel)).toEqual([4, 2]);
    expect(c.linhas[0].estilo.aderenciaPct).toBe(61);
    expect(c.linhas[0].frasesGap).toEqual([]);
  });

  it('dentro do quadrante a ordem é alfabética, não pela média escondida', () => {
    expect(dados().linhas.map((l) => l.nome)).toEqual(['Zeca', 'Ana', 'Bia']);
    expect(prontidaoParaCliente(dados()).linhas.map((l) => l.nome)).toEqual(['Ana', 'Zeca', 'Bia']);
  });

  it('o parecer do cliente troca a nota por nível em cada comportamento', () => {
    const p: Parecer = {
      linha: linha('Ana', 'pronta', 3.12), calculadoEm: '2026-10-03T12:00:00Z', cargoAlvo: 'Gerente', corte: 3,
      evidencias: [{
        respostaId: 'r', competenciaId: 'c', competencia: 'Priorização', auditoria: 'aprovado', avaliadoEm: null, feedback: null,
        descritores: [{ descritor: 'Foco', nota: 3.62, nivel: 4, nivelSugerido: 4, confianca: 0.82, sustentacao: 'forte', racional: null, limites: [], evidencias: [] }],
      }],
    };
    const c = parecerParaCliente(p);
    expect(decimais(c)).toEqual([]);
    expect(c.evidencias[0].descritores[0]).toMatchObject({ nota: null, confianca: null, nivel: 4 });
    expect(c).toMatchObject({ corte: null, metaNivel: 3, exibeNota: false });
  });

  it('nivelMeta: só o corte numa fronteira da régua vira nível', () => {
    expect(nivelMeta(3)).toBe(3);
    expect(nivelMeta(2)).toBe(2);
    expect(nivelMeta(2.75)).toBeNull();
    expect(nivelMeta(3.5)).toBeNull();
    expect(nivelMeta(null)).toBeNull();
  });
});

// ── As portas: RH recebe a projeção, admin recebe os números ──────────────────
const estado = { ctx: null as any, falha: null as Error | null };
const agregar = vi.fn(async () => { if (estado.falha) throw estado.falha; return dados(); });
const parecer = vi.fn(async () => ({
  linha: linha('Ana', 'pronta', 3.12), calculadoEm: '2026-10-03T12:00:00Z', cargoAlvo: 'Gerente', corte: 3,
  evidencias: [],
}));
vi.mock('@/lib/authz', () => ({ getUserContext: async () => estado.ctx }));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: async () => 'rh@example.test' }));
vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => ({ raw: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nome: 'E', sys_config: { modulos: { prontidao_lideranca: true }, prontidao_lideranca: { cargo_alvo: 'Gerente' } } }, error: null }) }) }) }) } }),
}));
vi.mock('@/lib/admin-supabase', () => ({
  requireEmpresaSupabase: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nome: 'E', sys_config: { modulos: { prontidao_lideranca: true }, prontidao_lideranca: { cargo_alvo: 'Gerente' } } }, error: null }) }) }) }) }),
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/turmas/contexto', () => ({ listarTurmasDoTenant: vi.fn() }));
vi.mock('@/lib/prontidao-lideranca/agregar', () => ({
  agregarProntidaoLideranca: (...a: unknown[]) => agregar(...(a as [])), carregarParecer: (...a: unknown[]) => parecer(...(a as [])),
  carregarCargosParaValidacao: vi.fn(), carregarPopulacao: vi.fn(),
}));
import { getProntidaoLideranca, getProntidaoLiderancaAdmin, getParecerLideranca, getParecerLiderancaAdmin } from '@/actions/prontidao-lideranca';

const ID = '10000000-0000-4000-8000-000000000001';

describe('portas do Mapeamento de liderança', () => {
  beforeEach(() => {
    estado.ctx = { role: 'rh', empresaId: 'empresa-a' };
    estado.falha = null;
  });

  it('🔴 o RH recebe a matriz e o parecer SEM nota decimal', async () => {
    const m: any = await getProntidaoLideranca();
    expect(m.success).toBe(true);
    expect(decimais(m.data)).toEqual([]);
    expect(m.data.exibeNota).toBe(false);
    const p: any = await getParecerLideranca(ID);
    expect(p.success).toBe(true);
    expect(decimais(p.data)).toEqual([]);
  });

  it('o admin da Vertho recebe os números, marcados para exibir', async () => {
    const m: any = await getProntidaoLiderancaAdmin('empresa-a');
    expect(m.data.exibeNota).toBe(true);
    expect(m.data.linhas[0].posicao.mediaGeral).toBe(3.41);
    const p: any = await getParecerLiderancaAdmin('empresa-a', ID);
    expect(p.data.exibeNota).toBe(true);
    expect(p.data.corte).toBe(3);
  });

  it('erro técnico não chega à tela: frase com código, sem a mensagem do banco', async () => {
    estado.falha = new Error('não foi possível ler as respostas: canceling statement due to statement timeout');
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r: any = await getProntidaoLideranca();
    expect(r).toMatchObject({ success: false, code: 'ERRO_LEITURA' });
    expect(r.error).not.toMatch(/statement|timeout|respostas/);
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });

  it('quem não é RH recebe o código, além do texto', async () => {
    estado.ctx = { role: 'colaborador', empresaId: 'empresa-a' };
    expect(await getProntidaoLideranca()).toMatchObject({ success: false, code: 'SO_RH' });
  });
});
