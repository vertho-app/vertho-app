import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const resolverMB = vi.fn();
const configs = vi.fn();
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/season-engine/modulo-base-integration', () => ({ resolverModuloBaseParaConteudo: (...a: any[]) => resolverMB(...a) }));
vi.mock('@/lib/turmas/contexto', () => ({ carregarConfigsEfetivasEmLote: (...a: any[]) => configs(...a) }));

import { coletarPrerequisitos } from '@/lib/pipeline-fluxo/prerequisitos-coleta';

/**
 * O coletor lê o banco e o ambiente e entrega o veredito. Três coisas que ele NÃO pode fazer: usar um critério de módulo-base
 * diferente do Kit, deixar uma leitura que falhou parecer "ok", e deixar a falha de UM item derrubar os outros quatro.
 */
const MODULO_COM_TEXTO = { modulo: { id: 'm1', conteudo_central: { ideia_principal: 'Organize a rotina', principios: [{ nome: 'a', explicacao: 'b' }] } }, criterio: 'x' };
const MODULO_VAZIO = { modulo: { id: 'm2', conteudo_central: {} }, criterio: 'x' };

const pessoaDoEscopo = (id: string, cargo = 'CAIXA') => ({ id, nome: `Pessoa ${id}`, cargo });
const entrada = (over: Record<string, any> = {}): any => ({
  pessoas: [pessoaDoEscopo('p1'), pessoaDoEscopo('p2')],
  cargos: [{ nome: 'CAIXA', foco: ['Rotina'], top5: 1 }],
  respostas: [], filaIA4: [], assessments: [], blueprints: [], pdis: [], trilhas: [],
  ...over,
});
const colabsBanco = (extra: Record<string, any> = {}) => ['p1', 'p2'].map((id) => ({ id, perfil_dominante: 'D', programa_modo: null, pref_texto: 5, pref_audio: 4, ...extra }));
const ENV = { HCLOUD_TOKEN: 't', RENDER_SNAPSHOT_ID: 's', DATABASE_URL: 'd' };

function bancos(t: { colabs?: any[]; top10?: any[]; comps?: any[]; falhar?: { tabela: string; mensagem: string } } = {}) {
  const tdb = criarSupabaseMock({
    lista: (tabela, _cols, cadeia) => {
      const emIn = (cadeia.find((c) => c.metodo === 'in')?.args[1] ?? []) as string[];
      if (tabela === 'colaboradores') return (t.colabs ?? colabsBanco()).filter((c) => emIn.includes(c.id));
      if (tabela === 'top10_cargos') return t.top10 ?? [];
      if (tabela === 'competencias') return (t.comps ?? []).filter((c) => emIn.includes(c.id));
      return [];
    },
  });
  if (t.falhar) tdb.falharEm({ tabela: t.falhar.tabela, op: 'select', mensagem: t.falhar.mensagem });
  const sb = criarSupabaseMock({ resolver: (tabela) => (tabela === 'empresas' ? { sys_config: { programa_modo: 'jornada' } } : null) });
  return { tdb, sb };
}
const rodar = (b: ReturnType<typeof bancos>, e = entrada(), env: Record<string, string | undefined> = ENV) =>
  coletarPrerequisitos({ sb: b.sb.client, tdb: b.tdb.client, empresaId: 'e1', entrada: e, env });
const item = (r: Awaited<ReturnType<typeof rodar>>, id: string) => r.itens.find((i) => i.id === id)!;
const modosJornada = (ids = ['p1', 'p2']) => new Map(ids.map((id) => [id, { programa_modo: 'jornada' }]));

beforeEach(() => {
  resolverMB.mockReset().mockResolvedValue(MODULO_COM_TEXTO);
  configs.mockReset().mockResolvedValue(modosJornada());
});

describe('coletarPrerequisitos: caminho feliz', () => {
  it('base completa: tudo ok', async () => {
    const r = await rodar(bancos());
    expect(r.itens.map((i) => [i.id, i.gravidade])).toEqual([['modulo-base', 'ok'], ['programa', 'ok'], ['disc', 'ok'], ['preferencias', 'ok'], ['render', 'ok']]);
  });

  it('o módulo-base é consultado pelo MESMO resolvedor do Kit, sem descritor (sem descritor não há embedding), por cargo com gente', async () => {
    await rodar(bancos(), entrada({ cargos: [{ nome: 'CAIXA', foco: ['Rotina', 'Metas'], top5: 1 }, { nome: 'GERENTE', foco: ['Visão'], top5: 1 }] }));
    const chamadas = resolverMB.mock.calls.map((c) => c[1]);
    expect(chamadas).toHaveLength(2);                                   // GERENTE não tem ninguém no escopo: não é consultado
    expect(chamadas.map((c) => c.competenciaNome).sort()).toEqual(['Metas', 'Rotina']);
    for (const c of chamadas) {
      expect(c).toMatchObject({ cargo: 'CAIXA', empresaId: 'e1', nivelMin: 1 });
      expect(c).not.toHaveProperty('descritor');
    }
  });

  it('lê DISC e as 5 preferências do Kit, em lotes de 150, escopado pelo tdb', async () => {
    const muitas = Array.from({ length: 320 }, (_, i) => pessoaDoEscopo(`q${i}`));
    const colabs = muitas.map((p) => ({ id: p.id, perfil_dominante: 'I', programa_modo: null, pref_texto: 5 }));
    configs.mockResolvedValue(modosJornada(muitas.map((p) => p.id)));
    const b = bancos({ colabs });
    await rodar(b, entrada({ pessoas: muitas }));
    const lotes = b.tdb.chamadas.filter((c) => c.tabela === 'colaboradores' && c.metodo === 'in').map((c) => c.args[1].length);
    expect(lotes).toEqual([150, 150, 20]);
    const sel = b.tdb.chamadas.find((c) => c.tabela === 'colaboradores' && c.metodo === 'select')!.args[0] as string;
    for (const col of ['perfil_dominante', 'programa_modo', 'pref_video_curto', 'pref_video_longo', 'pref_texto', 'pref_audio', 'pref_estudo_caso']) expect(sel).toContain(col);
  });
});

describe('módulo-base', () => {
  it('resolvedor sem módulo: crítico', async () => {
    resolverMB.mockResolvedValue(null);
    const r = item(await rodar(bancos()), 'modulo-base');
    expect(r).toMatchObject({ gravidade: 'critico', quantidade: 1, exemplos: ['CAIXA: Rotina'] });
  });

  it('módulo existe mas SEM matéria-prima (conteudo_central vazio): crítico, como no brief do Kit', async () => {
    resolverMB.mockResolvedValue(MODULO_VAZIO);
    expect(item(await rodar(bancos()), 'modulo-base').gravidade).toBe('critico');
  });

  it.each([
    ['só com ideia principal', { ideia_principal: 'Organize a rotina' }, 'ok'],
    ['só com princípios', { principios: [{ nome: 'a', explicacao: 'b' }] }, 'ok'],
    ['ideia vazia e lista de princípios vazia', { ideia_principal: '', principios: [] }, 'critico'],
    ['sem conteudo_central', undefined, 'critico'],
  ])('matéria-prima do módulo, mesma regra do brief do Kit: %s', async (_nome, conteudo, esperado) => {
    resolverMB.mockResolvedValue({ modulo: { id: 'mx', ...(conteudo === undefined ? {} : { conteudo_central: conteudo }) }, criterio: 'x' });
    expect(item(await rodar(bancos()), 'modulo-base').gravidade).toBe(esperado);
  });

  it('o resolvedor lança: só esse item vira "não medido"; os outros 4 saem', async () => {
    resolverMB.mockRejectedValue(new Error('competências: timeout'));
    const r = await rodar(bancos());
    expect(item(r, 'modulo-base')).toMatchObject({ gravidade: 'atencao' });
    expect(item(r, 'modulo-base').resumo).toMatch(/Não foi possível medir: CAIXA, Rotina: competências: timeout/);
    expect(['programa', 'disc', 'preferencias', 'render'].map((id) => item(r, id).gravidade)).toEqual(['ok', 'ok', 'ok', 'ok']);
  });
});

describe('DISC e preferências', () => {
  it('quem não tem DISC nem preferência aparece nos dois itens', async () => {
    const b = bancos({ colabs: [{ id: 'p1', perfil_dominante: null, programa_modo: null }, ...colabsBanco().slice(1)] });
    const r = await rodar(b);
    expect(item(r, 'disc')).toMatchObject({ gravidade: 'atencao', quantidade: 1, exemplos: ['Pessoa p1'] });
    expect(item(r, 'preferencias')).toMatchObject({ gravidade: 'atencao', quantidade: 1, exemplos: ['Pessoa p1'] });
  });

  it('falha ao ler colaboradores: DISC, preferências, programa e render ficam "não medido"; o módulo-base segue', async () => {
    const r = await rodar(bancos({ falhar: { tabela: 'colaboradores', mensagem: 'rede caiu' } }));
    for (const id of ['disc', 'preferencias', 'programa', 'render']) {
      expect(item(r, id).gravidade, id).toBe('atencao');
      expect(item(r, id).resumo, id).toMatch(/rede caiu/);
    }
    expect(item(r, 'modulo-base').gravidade).toBe('ok');
    expect(configs).not.toHaveBeenCalled();
  });
});

describe('programa', () => {
  const duo = (ids = ['p1', 'p2']) => new Map(ids.map((id) => [id, { programa_modo: 'regular_duo' }]));

  it('lê o programa EFETIVO por pessoa (a mesma leitura da geração), com o programa_modo da pessoa e o sys_config da empresa', async () => {
    const b = bancos({ colabs: colabsBanco({ programa_modo: 'piloto' }) });
    await rodar(b);
    expect(configs).toHaveBeenCalledTimes(1);
    const [, empresaId, colabs, sysConfig] = configs.mock.calls[0];
    expect(empresaId).toBe('e1');
    expect(colabs).toEqual([{ id: 'p1', programa_modo: 'piloto' }, { id: 'p2', programa_modo: 'piloto' }]);
    expect(sysConfig).toEqual({ programa_modo: 'jornada' });
  });

  it('DUO + cargo com 1 competência e sem top 10: crítico', async () => {
    configs.mockResolvedValue(duo());
    const r = item(await rodar(bancos()), 'programa');
    expect(r).toMatchObject({ gravidade: 'critico', quantidade: 2 });
    expect(r.resumo).toMatch(/DUO indisponível/);
  });

  it('DUO + cargo com 1 competência, mas o top 10 do cargo traz outra: ok', async () => {
    configs.mockResolvedValue(duo());
    const b = bancos({ top10: [{ cargo: 'CAIXA', competencia_id: 'c9', posicao: 1 }], comps: [{ id: 'c9', nome: 'Metas' }] });
    expect(item(await rodar(b), 'programa').gravidade).toBe('ok');
  });

  it('DUO + competencias_regular_duo na config EFETIVA da pessoa (a da turma, não a da empresa): ok', async () => {
    configs.mockResolvedValue(new Map([['p1', { programa_modo: 'regular_duo', competencias_regular_duo: ['A', 'B'] }], ['p2', { programa_modo: 'regular_duo', competencias_regular_duo: ['A', 'B'] }]]));
    expect(item(await rodar(bancos()), 'programa').gravidade).toBe('ok');
  });

  it('o top 10 só é lido quando alguém está em DUO com foco curto (na Jornada não custa leitura)', async () => {
    const jornada = bancos();
    await rodar(jornada);
    expect(jornada.tdb.chamadas.some((c) => c.tabela === 'top10_cargos')).toBe(false);

    configs.mockResolvedValue(duo());
    const emDuo = bancos();
    await rodar(emDuo);
    expect(emDuo.tdb.chamadas.some((c) => c.tabela === 'top10_cargos')).toBe(true);

    configs.mockResolvedValue(duo());
    const focoCompleto = bancos();
    await rodar(focoCompleto, entrada({ cargos: [{ nome: 'CAIXA', foco: ['A', 'B'], top5: 1 }] }));
    expect(focoCompleto.tdb.chamadas.some((c) => c.tabela === 'top10_cargos')).toBe(false);
  });

  it('falha ao ler as turmas/participações: o item "programa" fica não medido, o resto sai', async () => {
    configs.mockRejectedValue(new Error('não foi possível ler as turmas: x'));
    const r = await rodar(bancos());
    expect(item(r, 'programa')).toMatchObject({ gravidade: 'atencao' });
    expect(item(r, 'programa').resumo).toMatch(/ler as turmas/);
    expect(item(r, 'disc').gravidade).toBe('ok');
  });

  it('falha ao ler o top 10: "programa" não medido (em vez de concluir que o cargo tem 1 competência)', async () => {
    configs.mockResolvedValue(duo());
    const r = await rodar(bancos({ falhar: { tabela: 'top10_cargos', mensagem: 'sem acesso' } }));
    expect(item(r, 'programa').gravidade).toBe('atencao');
    expect(item(r, 'programa').resumo).toMatch(/sem acesso/);
  });
});

describe('render', () => {
  const comVideo = () => bancos({ colabs: colabsBanco({ pref_video_curto: 5, pref_texto: 4, pref_audio: 0 }) });

  it('lê o ambiente INJETADO, não o process.env', async () => {
    const r = item(await rodar(comVideo(), entrada(), { RENDER_SNAPSHOT_ID: 's', DATABASE_URL: 'd' }), 'render');
    expect(r).toMatchObject({ gravidade: 'atencao', exemplos: ['HCLOUD_TOKEN'] });
  });

  it('variável vazia conta como ausente', async () => {
    const r = item(await rodar(comVideo(), entrada(), { ...ENV, RENDER_SNAPSHOT_ID: '' }), 'render');
    expect(r.exemplos).toEqual(['RENDER_SNAPSHOT_ID']);
  });

  it('tudo presente: ok', async () => {
    expect(item(await rodar(comVideo()), 'render').gravidade).toBe('ok');
  });
});
