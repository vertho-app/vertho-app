/**
 * A tela `/dashboard/treino-atendimento` do RH (abas Cenários e Competências)
 * com a chave própria `simulador.casos.manage` (03/10/2026).
 *
 * Até aqui ela vivia de `content.manage`, que abria ao RH, pelo action id, cerca
 * de 80 exports de operação da Vertho. A chave larga saiu do papel rh; esta é a
 * prova de que a tela dele NÃO saiu junto.
 *
 * O `can` é o REAL (`BASE_ROLE_PERMISSIONS` + overrides vazios). Os testes
 * vizinhos da recepção mockam `can` como `true` e passariam com qualquer chave:
 * nenhum deles pegaria um consumidor esquecido na chave antiga.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { bancoEmMemoria } from '../helpers/tabelas-em-memoria';

const estado = vi.hoisted(() => ({ auth: null as any, ctx: null as any }));
const efeitos = vi.hoisted(() => ({ gerarRascunho: vi.fn(async () => ({ titulo: 'rascunho' })) }));

// `permission_overrides` vazio: o teste mede a matriz do código.
const overrides = criarSupabaseMock({ lista: () => [], resolver: () => null });
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => overrides.client }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => estado.auth,
  requireAdmin: async () => estado.auth,
}));
vi.mock('@/lib/recepcao/access', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  contextoRecepcao: async () => estado.ctx,
}));
vi.mock('@/lib/recepcao/equipe', () => ({ detalheEquipe: async () => ({}), painelEquipe: async () => ({}) }));
vi.mock('@/lib/recepcao/rascunho', () => ({ gerarRascunho: efeitos.gerarRascunho }));
vi.mock('@/lib/recepcao/ai', () => ({ geradorRecepcao: () => ({ gerar: vi.fn(), chamadas: [], validar: async () => {} }), textoParaTreino: (s: string) => s }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null } }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));

import { GET, POST } from '@/app/api/recepcao/gestao/route';
import { listarCompetencias, editarCompetencia } from '@/lib/recepcao/competencias';
import { editarCenario } from '@/lib/recepcao/cenarios';
import { consultar } from '@/lib/recepcao/service';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { competenciasBase } from '@/lib/recepcao/competencias-base';

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const pessoa = (role: string, extra: Record<string, unknown> = {}) => ({
  email: `${role}@empresa.test`, role, empresaId: EMPRESA, isPlatformAdmin: false,
  colaborador: { id: `${role}-1`, empresa_id: EMPRESA }, ...extra,
});
const AUTH = {
  rh: pessoa('rh'),
  gestor: pessoa('gestor'),
  colaborador: pessoa('colaborador'),
  master: { email: 'master@vertho.ai', role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'master', colaborador: null },
  socio: { email: 'socio@vertho.ai', role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'socio', colaborador: null },
};

let banco: ReturnType<typeof bancoEmMemoria>;
function como(quem: keyof typeof AUTH) {
  estado.auth = AUTH[quem];
  estado.ctx = {
    auth: estado.auth, empresaId: EMPRESA, empresaNome: 'Clínica de teste', habilitado: true,
    soAcompanha: quem === 'rh' || quem === 'gestor', sb: banco.client, owner: estado.auth.email,
    ownerKey: `colab:${quem}-1`, dominio: 'recepcao_medica', segmentoDefinido: true,
  };
  return estado.ctx;
}

const get = (q: string) => GET(new Request(`http://localhost/api/recepcao/gestao?${q}`));
const post = (payload: unknown) => POST(new Request('http://localhost/api/recepcao/gestao', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
}));

beforeEach(() => {
  overrides.reset();
  efeitos.gerarRascunho.mockClear();
  banco = bancoEmMemoria({
    recepcao_cenarios: [{
      id: 'global', empresa_id: null, estado: 'publicado', versao: '1', revisao: 0,
      created_at: '2026-09-20T12:00:00Z', conteudo: structuredClone(catalogoInicial[0]),
    }],
    recepcao_competencias: [],
    recepcao_sessoes: [],
  });
});

describe('RH: a tela de treino do atendimento segue aberta com simulador.casos.manage', () => {
  it('aba Cenários (GET visao=cenarios): RH e plataforma entram e editam; gestor e colaborador não entram', async () => {
    como('rh');
    const rh = await get('visao=cenarios');
    expect(rh.status).toBe(200);
    expect((await rh.json()).podeEditar).toBe(true);
    como('master');
    const master = await get('visao=cenarios');
    expect(master.status).toBe(200);
    expect((await master.json()).podeEditar).toBe(true);
    for (const quem of ['gestor', 'colaborador'] as const) {
      como(quem);
      expect((await get('visao=cenarios')).status, quem).toBe(403);
    }
  });

  it('rascunho por IA (POST rascunho_ia): RH passa do gate; gestor é barrado antes da IA', async () => {
    como('rh');
    const r = await post({ acao: 'rascunho_ia', descricao: 'Paciente chega atrasado e pede encaixe no mesmo dia.' });
    expect(r.status).toBe(200);
    expect(efeitos.gerarRascunho).toHaveBeenCalledTimes(1);
    como('gestor');
    const g = await post({ acao: 'rascunho_ia', descricao: 'Paciente chega atrasado e pede encaixe no mesmo dia.' });
    expect(g.status).toBe(403);
    expect(efeitos.gerarRascunho).toHaveBeenCalledTimes(1);
  });

  it('aba Competências: RH lê a biblioteca (sem editar); gestor não lê', async () => {
    const r = await listarCompetencias(como('rh'));
    expect(r.podeEditar).toBe(false);
    await expect(listarCompetencias(como('gestor'))).rejects.toThrow('não permite');
  });

  it('a biblioteca de competências continua escrita só pela plataforma', async () => {
    await expect(editarCompetencia(como('rh'), { acao: 'competencia', op: 'salvar', conteudo: competenciasBase[0] } as any))
      .rejects.toThrow('editada pela plataforma');
    expect(banco.escritas).toEqual([]);
  });

  it('casos: RH cria cópia da própria empresa; Catálogo Vertho só a plataforma; gestor não edita', async () => {
    const criado: any = await editarCenario(como('rh'), { acao: 'salvar', conteudo: structuredClone(catalogoInicial[0]) } as any);
    expect(criado).toBeTruthy();
    const inserts = banco.escritas.filter((e) => e.tabela === 'recepcao_cenarios' && e.op === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload.empresa_id).toBe(EMPRESA);

    await expect(editarCenario(como('rh'), { acao: 'salvar', catalogo: true, conteudo: structuredClone(catalogoInicial[0]) } as any))
      .rejects.toThrow('Só a plataforma');
    await expect(editarCenario(como('gestor'), { acao: 'salvar', conteudo: structuredClone(catalogoInicial[0]) } as any))
      .rejects.toThrow('não permite editar');
  });

  it('a tela desenha as abas (podeCenarios) para o RH e não para o gestor', async () => {
    expect((await consultar(como('rh'))).podeCenarios).toBe(true);
    expect((await consultar(como('gestor'))).podeCenarios).toBe(false);
  });
});

/**
 * Sócio: LÊ os casos e a biblioteca de competências (`simulador.casos.view`), sem
 * criar, editar, publicar, arquivar nem rascunhar com IA. Pedido do dono em
 * 03/10/2026, depois que a chave de edição saiu do papel rh.
 */
describe('Sócio: lê os casos do treino de atendimento, sem editar', () => {
  it('abre a aba Cenários, com podeEditar falso', async () => {
    como('socio');
    const r = await get('visao=cenarios');
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.podeEditar).toBe(false);
    expect(corpo.cenarios.length).toBeGreaterThan(0);
  });

  it('não rascunha com IA, e a IA nem é chamada', async () => {
    como('socio');
    const r = await post({ acao: 'rascunho_ia', descricao: 'Paciente chega atrasado e pede encaixe no mesmo dia.' });
    expect(r.status).toBe(403);
    expect(efeitos.gerarRascunho).not.toHaveBeenCalled();
  });

  it('não grava caso nenhum', async () => {
    await expect(editarCenario(como('socio'), { acao: 'salvar', conteudo: structuredClone(catalogoInicial[0]) } as any))
      .rejects.toThrow('não permite editar');
    expect(banco.escritas).toEqual([]);
  });

  it('lê a biblioteca de competências sem botão de editar, embora seja da plataforma', async () => {
    const r = await listarCompetencias(como('socio'));
    expect(r.podeEditar).toBe(false);
    await expect(editarCompetencia(como('socio'), { acao: 'competencia', op: 'salvar', conteudo: competenciasBase[0] } as any))
      .rejects.toThrow('editada pela plataforma');
    expect(banco.escritas).toEqual([]);
  });

  it('a tela desenha as abas para o Sócio', async () => {
    expect((await consultar(como('socio'))).podeCenarios).toBe(true);
  });
});
