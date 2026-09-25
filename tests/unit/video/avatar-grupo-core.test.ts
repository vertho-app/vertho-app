import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Núcleo do avatar compartilhado (`lib/video/avatar-grupo-core.ts`), com banco e IA
 * mockados.
 *
 * O que está em jogo: o grupo é ECONOMIA, não requisito. Toda falha aqui tem que
 * virar "as células seguem o fluxo de hoje" com a queda registrada, nunca um vídeo a
 * menos. E nenhuma célula pode ficar parada em `aguardando_avatar`: se o orquestrador
 * não sobe, cada uma sai sozinha, uma vez só.
 */

const callAI = vi.fn();
vi.mock('@/actions/ai-client', () => ({ callAI: (...a: any[]) => callAI(...a) }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(async () => 'claude-opus-5') }));
const degradacoes: any[] = [];
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<typeof import('@/lib/degradacao')>()),
  registrarDegradacao: vi.fn(async (d: any) => { degradacoes.push(d); }),
}));
vi.mock('@/lib/cargo-contexto', () => ({
  carregarCargoInfo: vi.fn(async () => ({ nome: 'Professor(a)' })),
  formatBlocoCargo: (c: any, emp: string | null) => `CARGO: ${c?.nome} · ${emp}`,
}));
const trigger = vi.fn();
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: (...a: any[]) => trigger(...a) } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));

import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { prepararGrupoAvatar, despacharGrupoAvatar, avatarGrupoLigado } from '@/lib/video/avatar-grupo-core';

const FIXO = {
  intro: { title: 'O que decide o seu dia', subtitle: 'Critério antes da urgência', narration: 'Quando tudo chega ao mesmo tempo, quem decide o seu dia é a urgência de outra pessoa. Hoje você vai ver como trocar essa lógica por um critério que é seu, claro e defensável.' },
  outro: { title: 'Sua próxima escolha', subtitle: 'O que sai da lista primeiro?', narration: 'Você já sabe o que protege o seu planejamento. Olhe para a sua semana com calma. Qual demanda vai sair da lista primeiro, e com que critério?' },
};
const MODULO = { titulo: 'Organização · N1→N2', descritor: 'Priorização', nivel_entrada: 'N1', nivel_destino: 'N2', conteudo_central: { ideia_principal: 'Priorizar é decidir o que não fazer.', principios: [] }, competencia_base_id: 'comp-1', locale: 'pt-BR' };
const P = { empresaId: 'emp-1', moduloBaseId: 'mod-1', cargo: 'Professor(a)', pppBrief: 'Escola integral.' };

/** `grupos` = o que cada leitura de `video_avatar_grupo` devolve, em ordem. */
function sbCom(grupos: any[]) {
  let leitura = 0;
  return criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'modulos_base_conteudo') return MODULO;
      if (tabela === 'competencias_base') return { nome: 'Autocuidado' };
      if (tabela === 'empresas') return { nome: 'Escola X' };
      if (tabela === 'video_avatar_grupo') return grupos[Math.min(leitura++, grupos.length - 1)] ?? null;
      return null;
    },
  });
}
const linha = (status: string) => ({ id: 'g-1', status, intro: FIXO.intro, outro: FIXO.outro });

beforeEach(() => {
  callAI.mockReset();
  trigger.mockReset();
  degradacoes.length = 0;
  vi.unstubAllEnvs();
});

describe('avatarGrupoLigado', () => {
  it('desligado por padrão; liga só com `on`', () => {
    expect(avatarGrupoLigado()).toBe(false);
    vi.stubEnv('VIDEO_AVATAR_GRUPO', ' ON ');
    expect(avatarGrupoLigado()).toBe(true);
    vi.stubEnv('VIDEO_AVATAR_GRUPO', 'true');
    expect(avatarGrupoLigado()).toBe(false);
  });
});

describe('prepararGrupoAvatar', () => {
  it('sem grupo: escreve os textos 1×, com o dono do custo, e cria o grupo pendente', async () => {
    callAI.mockResolvedValue(JSON.stringify(FIXO));
    const sb = sbCom([null, linha('pendente')]);
    const g = await prepararGrupoAvatar(sb.client, P);

    expect(g).toEqual({ id: 'g-1', status: 'pendente', textos: FIXO });
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(callAI.mock.calls[0][4]).toEqual({ taskKey: 'video_avatar_grupo', empresaId: 'emp-1' });
    // O texto não recebe DISC: é o mesmo para os quatro perfis.
    expect(`${callAI.mock.calls[0][0]}${callAI.mock.calls[0][1]}`).not.toMatch(/\bDISC\b|dominante|perfil (D|I|S|C)\b/);
    const up = sb.escritas.find((e) => e.tabela === 'video_avatar_grupo' && e.op === 'upsert');
    expect(up?.payload).toMatchObject({ empresa_id: 'emp-1', modulo_base_id: 'mod-1', cargo: 'Professor(a)', status: 'pendente', intro: FIXO.intro });
    expect(sb.chamadas.find((c) => c.metodo === 'upsert')?.args[1]).toEqual({ onConflict: 'chave', ignoreDuplicates: true });
    expect(degradacoes).toEqual([]);
  });

  it('a leitura do grupo é presa ao tenant', async () => {
    const sb = sbCom([linha('pronto')]);
    await prepararGrupoAvatar(sb.client, P);
    expect(sb.chamadas.some((c) => c.tabela === 'video_avatar_grupo' && c.metodo === 'eq' && c.args[0] === 'empresa_id' && c.args[1] === 'emp-1')).toBe(true);
  });

  it('grupo já existe: reaproveita o texto, sem chamar o modelo', async () => {
    const sb = sbCom([linha('pronto')]);
    const g = await prepararGrupoAvatar(sb.client, P);
    expect(g).toEqual({ id: 'g-1', status: 'pronto', textos: FIXO });
    expect(callAI).not.toHaveBeenCalled();
    expect(sb.escritas).toEqual([]);
  });

  it('grupo em erro: reabre como pendente (nova mãe), mantendo o texto', async () => {
    const sb = sbCom([linha('erro')]);
    const g = await prepararGrupoAvatar(sb.client, P);
    expect(g?.status).toBe('pendente');
    const up = sb.escritas.find((e) => e.op === 'update');
    expect(up?.payload).toMatchObject({ status: 'pendente', erro: null, mae_video_id: null });
    expect(callAI).not.toHaveBeenCalled();
  });

  it('leitura do grupo falha: segue SEM grupo e registra (não vira "grupo novo")', async () => {
    const sb = sbCom([null]);
    sb.falharEm({ tabela: 'video_avatar_grupo', op: 'select', mensagem: 'pool esgotado' });
    expect(await prepararGrupoAvatar(sb.client, P)).toBeNull();
    expect(callAI).not.toHaveBeenCalled();
    expect(sb.escritas).toEqual([]);
    expect(degradacoes).toHaveLength(1);
    expect(degradacoes[0]).toMatchObject({ fluxo: 'video', tipo: 'video-avatar-grupo-fallback', chave: 'grupo:leitura', empresaId: 'emp-1' });
  });

  it('leitura do módulo falha: segue sem grupo, sem gastar IA', async () => {
    const sb = sbCom([null]);
    sb.falharEm({ tabela: 'modulos_base_conteudo', op: 'select', mensagem: 'timeout' });
    expect(await prepararGrupoAvatar(sb.client, P)).toBeNull();
    expect(callAI).not.toHaveBeenCalled();
    expect(degradacoes[0]?.detalhe?.erro).toMatch(/módulo-base: timeout/);
  });

  it('texto fora da régua nas 2 tentativas: segue sem grupo; a 2ª recebe o motivo', async () => {
    callAI.mockResolvedValue(JSON.stringify({ ...FIXO, outro: { ...FIXO.outro, narration: 'Um fecho sem pergunta.' } }));
    const sb = sbCom([null]);
    expect(await prepararGrupoAvatar(sb.client, P)).toBeNull();
    expect(callAI).toHaveBeenCalledTimes(2);
    expect(callAI.mock.calls[1][1]).toMatch(/recusada por: .*outro não termina em pergunta/);
    expect(sb.escritas.filter((e) => e.op === 'upsert')).toEqual([]);
    expect(degradacoes[0]?.chave).toBe('grupo:textos');
  });

  it('1ª resposta sem JSON, 2ª boa: o grupo nasce', async () => {
    callAI.mockResolvedValueOnce('desculpe, não consegui').mockResolvedValueOnce('```json\n' + JSON.stringify(FIXO) + '\n```');
    const sb = sbCom([null, linha('pendente')]);
    expect((await prepararGrupoAvatar(sb.client, P))?.id).toBe('g-1');
    expect(callAI).toHaveBeenCalledTimes(2);
  });

  it('inserção falha: segue sem grupo e registra', async () => {
    callAI.mockResolvedValue(JSON.stringify(FIXO));
    const sb = sbCom([null]);
    sb.falharEm({ tabela: 'video_avatar_grupo', op: 'upsert', mensagem: 'relation does not exist' });
    expect(await prepararGrupoAvatar(sb.client, P)).toBeNull();
    expect(degradacoes[0]?.chave).toBe('grupo:insercao');
  });
});

describe('despacharGrupoAvatar', () => {
  it('orquestrador disparado: nada mais sai daqui', async () => {
    trigger.mockResolvedValue({ id: 'run_1' });
    const sb = criarSupabaseMock();
    const r = await despacharGrupoAvatar(sb.client, { grupoId: 'g-1', empresaId: 'emp-1' });
    expect(r).toEqual({ via: 'grupo', erros: [] });
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger.mock.calls[0].slice(0, 2)).toEqual(['gerar-video-grupo', { grupoId: 'g-1' }]);
    expect(sb.chamadas).toEqual([]);
  });

  it('orquestrador não sobe: cada célula que espera sai pelo fluxo de hoje, uma vez só', async () => {
    trigger.mockImplementation(async (id: string) => { if (id === 'gerar-video-grupo') throw new Error('trigger fora do ar'); return { id: 'r' }; });
    const sb = criarSupabaseMock({
      lista: (t) => (t === 'videos_gerados' ? [{ id: 'v-D', roteiro: { scenes: [] } }, { id: 'v-I', roteiro: { scenes: [] } }] : []),
      // v-I já foi tirada da espera por outra rodada: o UPDATE condicional não casa.
      escrita: (_t, op, payload) => (op === 'update' && payload?.etapa === 'roteiro' ? (quem.shift() ?? []) : null),
    });
    const quem: any[][] = [[{ id: 'v-D' }], []];
    const r = await despacharGrupoAvatar(sb.client, { grupoId: 'g-1', empresaId: 'emp-1' });

    expect(r.via).toBe('celula');
    const modulo = trigger.mock.calls.filter((c) => c[0] === 'gerar-video-modulo');
    expect(modulo.map((c) => c[1].videoId)).toEqual(['v-D']);
    expect(modulo[0][1]).not.toHaveProperty('avatarGrupo');
    // A trava é o UPDATE condicionado à etapa, no tenant.
    const claims = sb.chamadas.filter((c) => c.tabela === 'videos_gerados' && c.metodo === 'eq');
    expect(claims.some((c) => c.args[0] === 'etapa' && c.args[1] === 'aguardando_avatar')).toBe(true);
    expect(claims.some((c) => c.args[0] === 'avatar_grupo_id' && c.args[1] === 'g-1')).toBe(true);
    expect(claims.filter((c) => c.args[0] === 'empresa_id').every((c) => c.args[1] === 'emp-1')).toBe(true);
    expect(degradacoes[0]?.chave).toBe('grupo:despacho');
  });

  it('fallback: se o disparo da célula falhar, ela vira erro (visível), não fica esperando', async () => {
    trigger.mockRejectedValue(new Error('rate limit'));
    const sb = criarSupabaseMock({
      lista: (t) => (t === 'videos_gerados' ? [{ id: 'v-D', roteiro: {} }] : []),
      escrita: (_t, op, payload) => (op === 'update' && payload?.etapa === 'roteiro' ? [{ id: 'v-D' }] : null),
    });
    const r = await despacharGrupoAvatar(sb.client, { grupoId: 'g-1', empresaId: 'emp-1' });
    expect(r.erros).toEqual(['v-D: rate limit']);
    expect(sb.escritas.find((e) => e.op === 'update' && e.payload?.status === 'error')?.payload.error).toBe('rate limit');
  });

  it('fallback: leitura das células falha → devolve o erro (não finge que despachou)', async () => {
    trigger.mockRejectedValue(new Error('fora do ar'));
    const sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'videos_gerados', op: 'select', mensagem: 'timeout' });
    const r = await despacharGrupoAvatar(sb.client, { grupoId: 'g-1', empresaId: 'emp-1' });
    expect(r.erros.join()).toMatch(/timeout/);
  });
});
