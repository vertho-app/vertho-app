import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * O que conta como CONSUMO no painel (decisão do dono, 22/09/2026).
 *
 * Vídeo e podcast só contam CONCLUÍDOS. Material de leitura (texto e estudo de
 * caso) conta ao ser ABERTO — PDF em outra aba não tem evento de conclusão, e
 * abrir é o máximo que existe para medir.
 *
 * 🔴 `conteudo_consumido` SAIU da régua. O botão "Marcar como realizado" não
 * existe mais na tela da pessoa: hoje a coluna é gravada sozinha quando alguém
 * entra na conversa ou abre o Tira-Dúvidas. Ou seja, virou "começou a
 * conversar" — e pintava de verde quem nunca terminou o conteúdo. `Medido:
 * 22/09/2026` nas etapas atuais: Ibipeba 12 → 6 pessoas, Macaé 24 → 9.
 */

const INICIO = '2026-07-14';
const PLANO = [{ semana: 1, descritor: 'd1' }];

const pessoa = (id: string, nome: string, prefs: Record<string, number>) => ({
  colaborador_id: id, semana_atual: 1, status: 'ativo', data_inicio: INICIO,
  ultima_evidencia_em: null, ultima_pilula1_em: null, ultima_pilula2_em: null,
  colaboradores: { nome_completo: nome, cargo: 'Gestão', ...prefs },
});

const ENVIOS = [
  pessoa('vid', 'Vera', { pref_video_curto: 5 }),
  pessoa('aud', 'Alice', { pref_audio: 5 }),
  pessoa('txt', 'Tere', { pref_texto: 5 }),
  pessoa('play', 'Paula', { pref_video_curto: 5 }),
  pessoa('chat', 'Carmen', { pref_video_curto: 5 }),
];

const TRILHAS = ENVIOS.map((e) => ({
  id: `tr-${e.colaborador_id}`, colaborador_id: e.colaborador_id,
  numero_temporada: 1, temporada_plano: PLANO, data_inicio: INICIO,
}));

// Carmen entrou na conversa: `conteudo_consumido` = true, e NADA mais.
const PROGRESSO = ENVIOS.map((e) => ({
  trilha_id: `tr-${e.colaborador_id}`, colaborador_id: e.colaborador_id, semana: 1,
  tipo: 'conteudo', status: 'em_andamento', qualidade: null,
  conteudo_consumido: e.colaborador_id === 'chat',
}));

const EVENTOS = [
  { trilha_id: 'tr-aud', colaborador_id: 'aud', pilula: 1, semana: 1, formato: 'audio', tipo: 'audio_fim', criado_em: '2026-07-20T10:00:00Z' },
  { trilha_id: 'tr-txt', colaborador_id: 'txt', pilula: 1, semana: 1, formato: 'texto', tipo: 'formato', criado_em: '2026-07-20T10:00:00Z' },
];

const VIDEOS = [
  { colaborador_id: 'vid', semana: 1, event_type: 'play_finished', seconds_watched: 250, video_length: 250, created_at: '2026-07-20T10:00:00Z' },
  { colaborador_id: 'play', semana: 1, event_type: 'play_progress', seconds_watched: 14, video_length: 324, created_at: '2026-07-20T10:00:00Z' },
];

const sb = criarSupabaseMock({
  lista: (tabela, cols) => {
    if (tabela === 'fase4_envios') return ENVIOS;
    if (tabela === 'trilhas') return TRILHAS;
    if (tabela === 'trilha_eventos') return EVENTOS;
    if (tabela === 'videos_watched') return VIDEOS;
    if (tabela === 'temporada_semana_progresso') return cols.includes('tipo') ? PROGRESSO : [];
    return [];
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));

import { rollUpEngajamento } from '@/lib/engajamento/roll-up';

const porNome = (r: any) => Object.fromEntries(r.colaboradores.map((c: any) => [c.nome, c]));

describe('consumo: só conclusão conta (leitura conta ao abrir)', () => {
  beforeEach(() => sb.reset());

  it('vídeo e podcast concluídos contam, e a tela sabe qual foi', async () => {
    const p = porNome(await rollUpEngajamento('emp-1'));
    expect(p.Vera.consumiu).toBe(true);
    expect(p.Vera.origemConsumo).toBe('video');
    expect(p.Alice.consumiu).toBe(true);
    expect(p.Alice.origemConsumo).toBe('audio');
  });

  it('material de leitura conta ao ser aberto', async () => {
    const p = porNome(await rollUpEngajamento('emp-1'));
    expect(p.Tere.consumiu).toBe(true);
    expect(p.Tere.origemConsumo).toBe('material');
  });

  it('🔴 vídeo começado NÃO é consumo — e a linha diz isso', async () => {
    const p = porNome(await rollUpEngajamento('emp-1'));
    expect(p.Paula.consumiu).toBe(false);
    expect(p.Paula.origemConsumo).toBe('video_iniciado');
  });

  it('🔴 entrar na conversa (conteudo_consumido) NÃO é consumo', async () => {
    const p = porNome(await rollUpEngajamento('emp-1'));
    // O fato continua publicado — o que mudou é que ele não pinta de verde.
    expect(p.Carmen.marcouConcluido).toBe(true);
    expect(p.Carmen.consumiu).toBe(false);
    expect(p.Carmen.origemConsumo).toBeNull();
  });

  it('o resumo conta as mesmas pessoas que a lista', async () => {
    const r: any = await rollUpEngajamento('emp-1');
    expect(r.resumo.consumiram).toBe(3);   // Vera, Alice, Tere
    expect(r.colaboradores.filter((c: any) => c.consumiu).length).toBe(3);
  });
});
