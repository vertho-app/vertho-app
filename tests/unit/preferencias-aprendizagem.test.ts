import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import {
  colunasDePreferencias,
  FORMATOS_PREFERENCIA,
  N_FORMATOS,
  ordemDePrefs,
  precisaPreferenciasAprendizagem,
  prefsDeOrdem,
  usaMapeamentoComportamentalNativo,
} from '@/lib/access-gates';
import { calcularRanking } from '@/lib/preferencias-config';

/**
 * PREFERÊNCIAS DE APRENDIZAGEM FORA DO DISC (01/10/2026).
 *
 * O formulário era a última etapa do Mapeamento Comportamental. Quem não faz o
 * DISC nativo (fonte externa de perfil, ex.: Boehringer/OPQ32) nunca passava por
 * ela e ficava com `pref_* = 0`. Agora a tela é pedida ao fim do primeiro
 * mapeamento de competências — e só para esse público.
 */

// Uma ORDENAÇÃO completa: o 1º formato da tela vale 7, o último 1 (sem repetir).
const IDS = FORMATOS_PREFERENCIA.map((f) => f.id as string);
const TODAS = prefsDeOrdem(IDS);

describe('usaMapeamentoComportamentalNativo', () => {
  it('fonte externa de perfil = NÃO usa o DISC nativo', () => {
    expect(usaMapeamentoComportamentalNativo({ perfil_externo_fonte: 'opq32' })).toBe(false);
    expect(usaMapeamentoComportamentalNativo({ perfil_externo_fonte: 'hogan' })).toBe(false);
  });

  it('sem fonte externa usa — e perfil bloqueado sozinho NÃO tira o tenant do DISC (é estado da turma)', () => {
    expect(usaMapeamentoComportamentalNativo({})).toBe(true);
    expect(usaMapeamentoComportamentalNativo(null)).toBe(true);
    expect(usaMapeamentoComportamentalNativo({ perfil_externo_fonte: null })).toBe(true);
    expect(usaMapeamentoComportamentalNativo({ perfil_comportamental_liberado: false })).toBe(true);
  });
});

describe('precisaPreferenciasAprendizagem', () => {
  const externo = { perfil_externo_fonte: 'opq32' };

  it('só pede com as três condições juntas: sem DISC nativo, primeira competência respondida, ainda não preencheu', () => {
    expect(precisaPreferenciasAprendizagem({ config: externo, jaPreencheu: false, primeiraCompetenciaRespondida: true })).toBe(true);
  });

  it('não pede antes de a primeira competência ser respondida', () => {
    expect(precisaPreferenciasAprendizagem({ config: externo, jaPreencheu: false, primeiraCompetenciaRespondida: false })).toBe(false);
  });

  it('não pede de novo a quem já preencheu', () => {
    expect(precisaPreferenciasAprendizagem({ config: externo, jaPreencheu: true, primeiraCompetenciaRespondida: true })).toBe(false);
  });

  it('🔴 tenant com DISC nativo NÃO é puxado: lá a etapa já vive no mapeamento comportamental', () => {
    expect(precisaPreferenciasAprendizagem({ config: {}, jaPreencheu: false, primeiraCompetenciaRespondida: true })).toBe(false);
    expect(precisaPreferenciasAprendizagem({ config: null, jaPreencheu: false, primeiraCompetenciaRespondida: true })).toBe(false);
  });
});

describe('ordenação em vez de estrelas', () => {
  it('prefsDeOrdem: o primeiro vale N, o último 1, sem empate', () => {
    const p = prefsDeOrdem(['case', 'video_short', 'text', 'audio', 'infographic', 'exercise', 'mentor']);
    expect(p.case).toBe(N_FORMATOS);
    expect(p.mentor).toBe(1);
    expect(new Set(Object.values(p)).size).toBe(N_FORMATOS);
  });

  it('ordemDePrefs é a inversa de prefsDeOrdem', () => {
    const ordem = ['mentor', 'case', 'video_short', 'text', 'audio', 'infographic', 'exercise'];
    expect(ordemDePrefs(prefsDeOrdem(ordem))).toEqual(ordem);
  });

  it('🔴 estrelas (1-5, com empate) NÃO são uma ordem: não pré-preenchem a tela de quem respondeu antes', () => {
    expect(ordemDePrefs({ video_short: 5, text: 5, audio: 3, infographic: 4, exercise: 5, mentor: 2, case: 1 })).toBeNull();
    // mesmo sem repetir, 5 notas distintas em 7 formatos não fecham 1..7
    expect(ordemDePrefs({ video_short: 5, text: 4, audio: 3, infographic: 2, exercise: 1, mentor: 0, case: 0 })).toBeNull();
    expect(ordemDePrefs(null)).toBeNull();
  });
});

describe('colunasDePreferencias', () => {
  it('traduz a ordenação para as colunas pref_* de colaboradores', () => {
    expect(colunasDePreferencias(TODAS)).toMatchObject({
      pref_video_curto: 7, pref_texto: 6, pref_audio: 5,
      pref_infografico: 4, pref_exercicio: 3, pref_mentor: 2, pref_estudo_caso: 1,
    });
    expect(FORMATOS_PREFERENCIA).toHaveLength(7);
  });

  it('🔴 vídeo longo saiu da tela e a coluna é ZERADA ao salvar (o motor lê max(curto, longo): um 5 antigo venceria o que a pessoa acabou de dizer)', () => {
    expect(FORMATOS_PREFERENCIA.some((f) => f.id === ('video_long' as string))).toBe(false);
    expect(colunasDePreferencias(TODAS)!.pref_video_longo).toBe(0);
    // a chave antiga, se o cliente ainda mandar, é ignorada — não vira valor gravado
    expect(colunasDePreferencias({ ...TODAS, video_long: 5 })!.pref_video_longo).toBe(0);
  });

  it('🔴 recusa empate: marcar tudo igual (o defeito das estrelas) não passa, nem no servidor', () => {
    expect(colunasDePreferencias(Object.fromEntries(IDS.map((id) => [id, 5])))).toBeNull();
    expect(colunasDePreferencias({ ...TODAS, text: TODAS.video_short })).toBeNull();
  });

  it('recusa ordem parcial, fora de 1..N ou não inteira', () => {
    const { text: _omitido, ...faltando } = TODAS as Record<string, number>;
    expect(colunasDePreferencias(faltando)).toBeNull();
    expect(colunasDePreferencias({ ...TODAS, text: 0 })).toBeNull();
    expect(colunasDePreferencias({ ...TODAS, text: N_FORMATOS + 1 })).toBeNull();
    expect(colunasDePreferencias({ ...TODAS, text: 2.5 })).toBeNull();
    expect(colunasDePreferencias({ ...TODAS, text: '3' })).toBeNull();
    expect(colunasDePreferencias(null)).toBeNull();
    expect(colunasDePreferencias('x')).toBeNull();
  });
});

describe('média do admin com as duas escalas (estrelas 1-5 e ordenação 1-7)', () => {
  const linha = (o: Record<string, number>) => ({
    pref_video_curto: 0, pref_video_longo: 0, pref_texto: 0, pref_audio: 0,
    pref_infografico: 0, pref_exercicio: 0, pref_mentor: 0, pref_estudo_caso: 0, ...o,
  });

  it('quem ordenou entra normalizado para 1-5: o favorito (7) vale 5 e o último (1) vale 1', () => {
    const r = calcularRanking([linha({ pref_video_curto: 7, pref_texto: 1, pref_audio: 4 })]);
    const por = Object.fromEntries(r.map((x) => [x.key, x.media]));
    expect(por.pref_video_curto).toBe(5);
    expect(por.pref_texto).toBe(1);
    expect(por.pref_audio).toBe(3);
  });

  it('🔴 estrelas continuam como estão — um 5 em estrelas não é rebaixado', () => {
    const r = calcularRanking([linha({ pref_video_curto: 5, pref_texto: 2 })]);
    const por = Object.fromEntries(r.map((x) => [x.key, x.media]));
    expect(por.pref_video_curto).toBe(5);
    expect(por.pref_texto).toBe(2);
  });

  it('mistura as duas escalas sem distorcer a média', () => {
    const r = calcularRanking([linha({ pref_video_curto: 5 }), linha({ pref_video_curto: 7, pref_texto: 1 })]);
    expect(Object.fromEntries(r.map((x) => [x.key, x.media])).pref_video_curto).toBe(5);
  });
});

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'colaboradores'
    ? { pref_video_curto: 5, pref_video_longo: 0, pref_texto: null, pref_audio: 3, pref_infografico: 1, pref_exercicio: 2, pref_mentor: 4, pref_estudo_caso: 9 }
    : null),
});
const sessao = { email: 'ana@cliente.com' as string | null };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn(async () => ({ id: 'colab-1', empresa_id: 'emp-1' })),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: vi.fn(async () => sessao.email),
}));

describe('actions da tela de preferências', () => {
  let acoes: typeof import('@/app/dashboard/preferencias-aprendizagem/actions');
  beforeEach(async () => {
    sb.reset();
    sessao.email = 'ana@cliente.com';
    acoes = await import('@/app/dashboard/preferencias-aprendizagem/actions');
  });

  it('salva SÓ as colunas pref_*, no colaborador e no tenant da sessão', async () => {
    const r: any = await acoes.salvarPreferenciasAprendizagem(TODAS);
    expect(r).toEqual({ success: true });

    const escritas = sb.escritas.filter((e) => e.tabela === 'colaboradores');
    expect(escritas).toHaveLength(1);
    expect(escritas[0].op).toBe('update');
    // as colunas dos formatos da tela + a do vídeo longo, zerada
    expect(Object.keys(escritas[0].payload).sort()).toEqual([...FORMATOS_PREFERENCIA.map((f) => f.coluna), 'pref_video_longo'].sort());
    expect(escritas[0].payload.pref_video_longo).toBe(0);
    expect(sb.usou('colaboradores', 'eq', 'id')).toBe(true);
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
  });

  it('formulário inválido não escreve nada', async () => {
    const r: any = await acoes.salvarPreferenciasAprendizagem({ ...TODAS, audio: 0 });
    expect(r.success).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });

  it('sem sessão não escreve nada', async () => {
    sessao.email = null;
    const r: any = await acoes.salvarPreferenciasAprendizagem(TODAS);
    expect(r.success).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });

  it('🔴 falha do update vira success:false (o supabase-js RETORNA o erro, não lança)', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'update', mensagem: 'timeout no pool' });
    const r: any = await acoes.salvarPreferenciasAprendizagem(TODAS);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/timeout no pool/);
  });

  it('a leitura devolve o que está gravado e zera o que é inválido (null, 0, fora de 1..7)', async () => {
    const r: any = await acoes.getMinhasPreferenciasAprendizagem();
    expect(r.prefs).toEqual({
      video_short: 5, text: 0, audio: 3, infographic: 1, exercise: 2, mentor: 4, case: 0,
    });
  });

  it('falha de leitura devolve erro, não "nenhuma preferência"', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'coluna inexistente' });
    const r: any = await acoes.getMinhasPreferenciasAprendizagem();
    expect(r.prefs).toBeUndefined();
    expect(r.error).toMatch(/coluna inexistente/);
  });
});
