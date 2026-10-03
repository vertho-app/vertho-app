import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import {
  resolverDescritores,
  montarReqsManuscrito,
  persistirModuloDeManuscrito,
  modulosExistentes,
  moduloJaExiste,
  tituloDoModuloDeCapitulo,
} from '@/lib/manuscrito-modulos';

/**
 * MODO DESCRITOR ÚNICO (02/10/2026).
 *
 * O QPM01 é o manuscrito de UM descritor do Boehringer (CN_01_06 "Questionamento propositivo e
 * melhoria de processos"); os 6 capítulos são subtemas dele. O casamento normal é por ORDEM de
 * `cod_desc` e ancoraria o capítulo 1 em CN_01_01, o 3 em CN_01_03… — módulo no descritor errado,
 * sem erro. Aqui o descritor é declarado e todos os capítulos caem nele.
 */

const EMPRESA = 'emp-boehringer';
const CAPITULOS = [
  'Distinção entre reclamação e questionamento',
  'Definição do problema a melhorar',
  'Evidências e análise de causas',
  'Questionamento respeitoso e contextualizado',
  'Proposta viável e teste em escala segura',
  'Aprendizagem com resultados e melhoria coletiva',
];

const NIVEIS = [['N1', 'N2'], ['N2', 'N3'], ['N3', 'N4']] as const;

function parseSintetico(): any {
  return {
    cod_comp: 'QPM01', cargo: 'Consultor', titulo: 'T', subtitulo: 'S', sintese: '', recursos: [], avisos: [],
    stats: { totalMicroblocos: 54, totalDescritores: 6, mbsPorFaixa: 2, modulosPrevistos: 18, charsUteis: 1, charsDescartados: 0 },
    descritores: CAPITULOS.map((nome, i) => ({
      indice: i + 1, descritor: nome, microblocos: [],
      transicoes: NIVEIS.map(([ne, nd], ti) => ({
        nivel_entrada: ne, nivel_destino: nd,
        microblocos: [`QPM01_MB${String(i * 2 + ti + 1).padStart(2, '0')}`],
        textoFonte: `Texto do capítulo ${i + 1}, transição ${ne}→${nd}. `.repeat(20), chars: 800,
      })),
    })),
  };
}

const LINHA_CN0106 = {
  id: 'row-cn0106', cod_comp: '1', cod_desc: 'CN_01_06', nome: 'Pensamento Estratégico', cargo: 'Rare Diseases Demand Consultant',
  nome_curto: 'Questionamento propositivo e melhoria de processos',
  n1_gap: 'g', n2_desenvolvimento: 'd', n3_meta: 'm', n4_referencia: 'r',
};

describe('resolverDescritores com descritorUnico', () => {
  it('🔴 os 6 capítulos caem em UMA linha (CN_01_06) — nenhum em CN_01_01…05', async () => {
    const sb = criarSupabaseMock({ lista: (t) => (t === 'competencias' ? [LINHA_CN0106] : []) });
    const r = await resolverDescritores(sb.client, parseSintetico(), EMPRESA, { descritorUnico: 'CN_01_06' });
    expect(r.error).toBeUndefined();
    expect(r.resolvidos).toHaveLength(6);
    expect(new Set(r.resolvidos!.map((x) => x.comp.id))).toEqual(new Set(['row-cn0106']));
    expect(r.resolvidos!.every((x) => x.descritorUnico === true)).toBe(true);
    expect(r.resolvidos!.map((x) => x.descritorManuscrito)).toEqual(CAPITULOS);
  });

  it('busca pelo cod_desc DA EMPRESA — não por cod_comp (o casamento por ordem que ancoraria errado)', async () => {
    const sb = criarSupabaseMock({ lista: (t) => (t === 'competencias' ? [LINHA_CN0106] : []) });
    await resolverDescritores(sb.client, parseSintetico(), EMPRESA, { descritorUnico: 'CN_01_06' });
    expect(sb.usou('competencias', 'eq', 'cod_desc')).toBe(true);
    expect(sb.usou('competencias', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('competencias', 'eq', 'cod_comp')).toBe(false);
  });

  it('um aviso só (não um por capítulo) dizendo onde tudo foi ancorado', async () => {
    const sb = criarSupabaseMock({ lista: (t) => (t === 'competencias' ? [LINHA_CN0106] : []) });
    const r = await resolverDescritores(sb.client, parseSintetico(), EMPRESA, { descritorUnico: 'CN_01_06' });
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toMatch(/CN_01_06/);
    expect(r.avisos[0]).toMatch(/Questionamento propositivo/);
  });

  it('descritor inexistente na empresa = erro, não ancoragem em outro', async () => {
    const sb = criarSupabaseMock({ lista: () => [] });
    const r = await resolverDescritores(sb.client, parseSintetico(), EMPRESA, { descritorUnico: 'CN_09_99' });
    expect(r.resolvidos).toBeUndefined();
    expect(r.error).toMatch(/CN_09_99.*não encontrado/);
  });

  it('o mesmo código com descritores DIFERENTES em cargos distintos pede a escolha do cargo (não adivinha)', async () => {
    const outra = { ...LINHA_CN0106, id: 'row-outro', cargo: 'Outro Cargo', nome_curto: 'Outro nome de descritor' };
    const sb = criarSupabaseMock({ lista: () => [LINHA_CN0106, outra] });
    const r = await resolverDescritores(sb.client, parseSintetico(), EMPRESA, { descritorUnico: 'CN_01_06' });
    expect(r.resolvidos).toBeUndefined();
    expect(r.cargosDisponiveis).toHaveLength(2);
  });

  it('exige empresa: o descritor é do modelo do tenant', async () => {
    const sb = criarSupabaseMock();
    const r = await resolverDescritores(sb.client, parseSintetico(), null, { descritorUnico: 'CN_01_06' });
    expect(r.error).toMatch(/exige empresa/);
  });

  it('SEM a opção, o caminho de sempre segue valendo: 6 capítulos × 2 linhas é erro (regressão)', async () => {
    const sb = criarSupabaseMock({ lista: () => [LINHA_CN0106, { ...LINHA_CN0106, id: 'x', cod_desc: 'CN_01_05' }] });
    const r = await resolverDescritores(sb.client, parseSintetico(), EMPRESA, { codCompAlvo: '1' });
    expect(r.error).toMatch(/O manuscrito tem 6 descritores/);
  });
});

describe('montarReqsManuscrito e título por capítulo', () => {
  const resolvidosUnicos = () => parseSintetico().descritores.map((g: any) => ({
    indice: g.indice, descritorManuscrito: g.descritor, comp: LINHA_CN0106, matchExato: false,
    idsEquivalentes: ['row-cn0106'], cargosDaMatriz: [LINHA_CN0106.cargo], descritorUnico: true,
  }));

  it('18 requisições (3 transições × 6 capítulos), cada uma carregando o título do SEU capítulo', () => {
    const reqs = montarReqsManuscrito({ parse: parseSintetico(), resolvidos: resolvidosUnicos() });
    expect(reqs).toHaveLength(18);
    expect(reqs.filter((r) => r.nivel_entrada === 'N1')).toHaveLength(6);
    expect(reqs.map((r) => r.tituloCapitulo)).toEqual(CAPITULOS.flatMap((c) => [c, c, c]));
    expect(new Set(reqs.map((r) => r.comp.id))).toEqual(new Set(['row-cn0106']));
  });

  it('fora do modo único o título do capítulo NÃO é carregado (comportamento de antes)', () => {
    const res = resolvidosUnicos().map((r: any) => ({ ...r, descritorUnico: undefined }));
    const reqs = montarReqsManuscrito({ parse: parseSintetico(), resolvidos: res });
    expect(reqs.every((r) => r.tituloCapitulo === undefined)).toBe(true);
  });
});

describe('persistirModuloDeManuscrito com tituloCapitulo', () => {
  const corpo = { conteudo_central: {}, conteudo_aplicavel: {}, guarda_corpos: {}, adaptacao_por_formato: {} };
  const base = (extra: object = {}) => ({
    comp: LINHA_CN0106 as any, empresaId: EMPRESA, nivel_entrada: 'N1' as const, nivel_destino: 'N2' as const, locale: 'pt-BR',
    descritor: 'Distinção entre reclamação e questionamento', corpo, codManuscrito: 'QPM01', microblocos: ['QPM01_MB01'], createdBy: 't', ...extra,
  });

  it('🔴 o título leva o CAPÍTULO e o campo `descritor` segue sendo a âncora da régua (nunca o título editorial)', async () => {
    const sb = criarSupabaseMock({ escritaUnica: () => ({ id: 'novo' }) });
    const r = await persistirModuloDeManuscrito(sb.client, base({ tituloCapitulo: CAPITULOS[0] }));
    expect(r.id).toBe('novo');
    const row = sb.escritas.find((e) => e.tabela === 'modulos_base_conteudo')!.payload;
    expect(row.titulo).toBe('Distinção entre reclamação e questionamento · N1→N2');
    expect(row.titulo.length).toBeLessThanOrEqual(120);
    expect(row.descritor).toBe('Questionamento propositivo e melhoria de processos');
    expect(row.competencia_id).toBe('row-cn0106');
    expect(row.finalidade).toMatch(/capítulo "Distinção entre reclamação e questionamento"/);
    expect(row.finalidade.length).toBeLessThanOrEqual(400);
  });

  it('título longo é cortado em 120 (CHECK do banco)', async () => {
    const sb = criarSupabaseMock({ escritaUnica: () => ({ id: 'novo' }) });
    await persistirModuloDeManuscrito(sb.client, base({ tituloCapitulo: 'x'.repeat(300) }));
    expect(sb.escritas[0].payload.titulo.length).toBe(120);
  });

  it('SEM tituloCapitulo: o título é o de sempre (descritor · transição)', async () => {
    const sb = criarSupabaseMock({ escritaUnica: () => ({ id: 'novo' }) });
    await persistirModuloDeManuscrito(sb.client, base());
    expect(sb.escritas[0].payload.titulo).toBe('Questionamento propositivo e melhoria de processos · N1→N2');
  });

  it('o título gravado é EXATAMENTE o que a idempotência procura (uma conta só)', async () => {
    const sb = criarSupabaseMock({ escritaUnica: () => ({ id: 'novo' }) });
    await persistirModuloDeManuscrito(sb.client, base({ tituloCapitulo: CAPITULOS[2] }));
    expect(sb.escritas[0].payload.titulo).toBe(tituloDoModuloDeCapitulo(CAPITULOS[2], 'N1', 'N2'));
  });
});

describe('idempotência por capítulo', () => {
  const linhas = [{ id: 'm1', competencia_id: 'row-cn0106', nivel_entrada: 'N1', nivel_destino: 'N2', titulo: tituloDoModuloDeCapitulo(CAPITULOS[0], 'N1', 'N2') }];

  it('🔴 pula o capítulo que já existe e NÃO pula outro capítulo da mesma transição', async () => {
    const sb = criarSupabaseMock({ lista: () => linhas });
    const existentes = await modulosExistentes(sb.client, { compIds: ['row-cn0106'], empresaId: EMPRESA, locale: 'pt-BR' });
    const ids = ['row-cn0106'];
    expect(moduloJaExiste(existentes, ids, 'N1', 'N2', tituloDoModuloDeCapitulo(CAPITULOS[0], 'N1', 'N2'))).toBe(true);
    expect(moduloJaExiste(existentes, ids, 'N1', 'N2', tituloDoModuloDeCapitulo(CAPITULOS[1], 'N1', 'N2'))).toBe(false);
    expect(moduloJaExiste(existentes, ids, 'N2', 'N3', tituloDoModuloDeCapitulo(CAPITULOS[0], 'N2', 'N3'))).toBe(false);
  });

  it('sem título, a chave antiga (competência|transição) segue valendo — callers atuais intactos', async () => {
    const sb = criarSupabaseMock({ lista: () => linhas });
    const existentes = await modulosExistentes(sb.client, { compIds: ['row-cn0106'], empresaId: EMPRESA, locale: 'pt-BR' });
    expect(moduloJaExiste(existentes, ['row-cn0106'], 'N1', 'N2')).toBe(true);
    expect(moduloJaExiste(existentes, ['row-cn0106'], 'N3', 'N4')).toBe(false);
  });
});

describe('modulosExistentes falha ALTO', () => {
  it('🔴 leitura que falha NÃO vira "nenhum módulo existe" (a idempotência abriria e reimportar duplicaria e pagaria IA)', async () => {
    const sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'modulos_base_conteudo', op: 'select', mensagem: 'timeout no pool' });
    await expect(
      modulosExistentes(sb.client, { compIds: ['row-cn0106'], empresaId: EMPRESA, locale: 'pt-BR' }),
    ).rejects.toThrow(/modulosExistentes: timeout no pool/);
  });
});
