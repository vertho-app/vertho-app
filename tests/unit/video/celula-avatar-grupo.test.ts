import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Célula do Kit com e sem o avatar do grupo (`actions/gerar-video.ts`
 * `dispararVideoDoKit` → `criarEDispararVideo`).
 *
 * Sem grupo, nada muda: dispara na hora, etapa `roteiro`, sem `avatar_grupo_id`.
 * Com grupo: o roteiro recebe o texto fixo (e o código o impõe mesmo que o modelo
 * não copie), a célula é inserida em `aguardando_avatar` e NÃO é disparada: quem a
 * dispara é o orquestrador, depois da mãe.
 */

const gerarRoteiro = vi.fn();
vi.mock('@/lib/video/gerar-roteiro', () => ({ gerarRoteiroDeModulo: (...a: any[]) => gerarRoteiro(...a) }));
const trigger = vi.fn(async (..._a: any[]) => ({ id: 'run_1' }));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: (...a: any[]) => (trigger as any)(...a) } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn() }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(), requireUserAction: vi.fn(), getAuthenticatedEmailFromAction: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/authz', () => ({ canViewColabJourney: vi.fn(), findColabByEmail: vi.fn() }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }));
vi.mock('@/lib/season-engine/modulo-base-integration', () => ({ resolverModuloBaseParaConteudo: vi.fn() }));
vi.mock('@/lib/cargo-contexto', () => ({ carregarCargoInfo: vi.fn(async () => null), formatBlocoCargo: () => 'CARGO: Professor(a).' }));

import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { dispararVideoDoKit } from '@/actions/gerar-video';

const FIXO = {
  intro: { title: 'O que decide o seu dia', subtitle: 'Critério antes da urgência', narration: 'Quando tudo chega ao mesmo tempo, quem decide o seu dia é a urgência de outra pessoa. Hoje você vai ver como trocar essa lógica por um critério que é seu, claro e defensável.' },
  outro: { title: 'Sua próxima escolha', subtitle: 'O que sai da lista primeiro?', narration: 'Você já sabe o que protege o seu planejamento. Olhe para a sua semana com calma. Qual demanda vai sair da lista primeiro, e com que critério?' },
};
const roteiroDoModelo = () => ({
  title: 'T',
  scenes: [
    { id: 'scene-1', type: 'avatar_intro', title: 'Do modelo', subtitle: 's', narration: 'Uma abertura que o modelo reescreveu.', key_idea: 'k', source_anchor: 'IDEIA_PRINCIPAL' },
    { id: 'scene-2', type: 'concept_reveal', title: 'C', narration: 'Miolo no tom C.', key_idea: 'k', source_anchor: 'PRINCIPIOS', bullets: ['a', 'b', 'c'] },
    { id: 'scene-3', type: 'avatar_outro', title: 'Fecho do modelo', subtitle: 's', narration: 'Um fecho do modelo.', key_idea: 'k', source_anchor: 'IDEIA_PRINCIPAL' },
  ],
});

function sbCelula() {
  const inseridos: any[] = [];
  const sb = criarSupabaseMock({
    resolver: (t) => (t === 'modulos_base_conteudo' ? { id: 'mod-1', titulo: 'M', competencia_base_id: null } : t === 'empresas' ? { nome: 'Escola X' } : null),
  });
  // O insert de `videos_gerados` devolve o id criado (o mock genérico devolve o payload).
  const from = sb.client.from;
  sb.client.from = (t: string) => {
    const b = from(t);
    if (t !== 'videos_gerados') return b;
    const insertOriginal = b.insert;
    b.insert = (p: any) => {
      inseridos.push(p);
      insertOriginal(p);
      return { select: () => ({ maybeSingle: async () => ({ data: { id: 'v-1' }, error: null }) }) };
    };
    return b;
  };
  return { sb, inseridos };
}

const ARGS = { moduloBaseId: 'mod-1', empresaId: 'emp-1', cargo: 'Professor(a)', disc: 'C' as const, desafioTexto: 'Liste três demandas.', kitId: 'kit-1', pppBrief: 'Escola integral.' };

beforeEach(() => {
  trigger.mockClear();
  gerarRoteiro.mockReset().mockImplementation(async () => ({ roteiro: roteiroDoModelo() }));
});

describe('dispararVideoDoKit', () => {
  it('sem grupo: igual a antes (dispara na hora, sem avatar fixo nem grupo)', async () => {
    const { sb, inseridos } = sbCelula();
    const r = await dispararVideoDoKit(sb.client, ARGS);

    expect(r).toEqual({ id: 'v-1', status: 'processing' });
    expect(gerarRoteiro.mock.calls[0][0]).not.toHaveProperty('avatarFixo');
    expect(inseridos[0].etapa).toBe('roteiro');
    expect(inseridos[0]).not.toHaveProperty('avatar_grupo_id');
    expect(inseridos[0].roteiro.scenes[0].narration).toBe('Uma abertura que o modelo reescreveu.');
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger.mock.calls[0][0]).toBe('gerar-video-modulo');
  });

  it('com grupo: o roteiro leva o texto fixo, a célula espera e NÃO é disparada', async () => {
    const { sb, inseridos } = sbCelula();
    const r = await dispararVideoDoKit(sb.client, { ...ARGS, avatarGrupo: { grupoId: 'g-1', textos: FIXO } });

    expect(r).toEqual({ id: 'v-1', status: 'processing', adiado: true });
    expect(gerarRoteiro.mock.calls[0][0].avatarFixo).toEqual(FIXO);
    expect(inseridos[0]).toMatchObject({ etapa: 'aguardando_avatar', avatar_grupo_id: 'g-1', disc_dominante: 'C', kit_id: 'kit-1' });
    // O modelo não copiou; o código impõe (o clipe da HeyGen só serve para o MESMO texto).
    const cenas = inseridos[0].roteiro.scenes;
    expect(cenas[0]).toMatchObject({ type: 'avatar_intro', narration: FIXO.intro.narration, title: FIXO.intro.title });
    expect(cenas.at(-1)).toMatchObject({ type: 'avatar_outro', narration: FIXO.outro.narration, subtitle: FIXO.outro.subtitle });
    expect(cenas[1].narration).toBe('Miolo no tom C.');
    expect(trigger).not.toHaveBeenCalled();
  });

  it('com grupo e o modelo esquecendo o fecho: o fecho do grupo é criado no fim, com id de cena', async () => {
    gerarRoteiro.mockImplementation(async () => {
      const r = roteiroDoModelo();
      r.scenes = r.scenes.filter((s) => s.type !== 'avatar_outro');
      return { roteiro: r };
    });
    const { sb, inseridos } = sbCelula();
    await dispararVideoDoKit(sb.client, { ...ARGS, avatarGrupo: { grupoId: 'g-1', textos: FIXO } });
    const cenas = inseridos[0].roteiro.scenes;
    expect(cenas.map((s: any) => s.id)).toEqual(['scene-1', 'scene-2', 'scene-3']);
    expect(cenas[2]).toMatchObject({ type: 'avatar_outro', narration: FIXO.outro.narration });
  });

  it('célula do kit já existe: reaproveita, com ou sem grupo (não cria outra)', async () => {
    const { sb, inseridos } = sbCelula();
    const resolverOriginal = sb.client.from;
    sb.client.from = (t: string) => {
      const b = resolverOriginal(t);
      if (t === 'videos_gerados') b.maybeSingle = async () => ({ data: { id: 'v-antigo', status: 'processing' }, error: null });
      return b;
    };
    const r = await dispararVideoDoKit(sb.client, { ...ARGS, avatarGrupo: { grupoId: 'g-1', textos: FIXO } });
    expect(r).toEqual({ id: 'v-antigo', reused: true, status: 'processing' });
    expect(inseridos).toEqual([]);
    expect(gerarRoteiro).not.toHaveBeenCalled();
  });
});
