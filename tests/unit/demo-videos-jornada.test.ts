import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { recomporVideosDaJornadaDemo } from '@/lib/demo/video-jornada';
import { ROSTER_ESCOLAR } from '@/lib/demo/rosters';

function banco(rows: Record<string, any[]>) {
  let nextId = 0;
  return {
    from: (table: string) => {
      const filters: Array<(row: any) => boolean> = [];
      let payload: any;
      let operation = 'select';
      let conflict = ['id'];
      const execute = () => {
        const records = rows[table] ||= [];
        const found = records.filter((row) => filters.every((filter) => filter(row)));
        if (operation === 'update') found.forEach((row) => Object.assign(row, payload));
        if (operation === 'insert' || operation === 'upsert') {
          const previous = operation === 'upsert'
            ? records.find((row) => conflict.every((key) => row[key] === payload[key])) : null;
          if (previous) Object.assign(previous, payload);
          else if (payload.id && records.some((row) => row.id === payload.id)) {
            return { data: null, error: { message: 'duplicate primary key' } };
          } else records.push({ id: `new-${++nextId}`, ...payload });
        }
        return { data: found, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
        neq: (key: string, value: unknown) => { filters.push((row) => row[key] !== value); return query; },
        is: (key: string, value: unknown) => { filters.push((row) => (row[key] ?? null) === value); return query; },
        update: (value: any) => { operation = 'update'; payload = value; return query; },
        insert: (value: any) => { operation = 'insert'; payload = value; return query; },
        upsert: (value: any, options: { onConflict: string }) => {
          operation = 'upsert'; payload = value; conflict = options.onConflict.split(','); return query;
        },
        maybeSingle: async () => {
          const result = execute();
          if (result.error) return result;
          return { data: result.data?.[0] || null, error: result.data!.length > 1 ? { message: 'multiple rows' } : null };
        },
        then: (resolve: any) => Promise.resolve(execute()).then(resolve),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

describe('vídeos de várias semanas da demo', () => {
  it('oferece assets distintos nos dois temas acessíveis no início da demo escolar', () => {
    const videos = ROSTER_ESCOLAR.videosDaJornada || [];
    expect(videos.map((video) => video.descritor)).toEqual(['Ritmo e transições', 'Engajamento ativo']);
    expect(new Set(videos.map((video) => video.bunnyVideoId)).size).toBe(2);
    expect(new Set(videos.map((video) => video.moduloId)).size).toBe(2);
    for (const video of videos) {
      expect(video.bunnyVideoId).toMatch(/^[a-f0-9-]{36}$/);
      if (video.nominal) {
        expect(video.nominal.personaKey).toBe('marina');
        expect(video.nominal.bunnyVideoId).toMatch(/^[a-f0-9-]{36}$/);
      }
    }
  });

  it('as três semanas usam os decks do formato novo (v7) de 20/10/2026, não os de 07/10', () => {
    // Os de 07/10 (88170e79, fc050c58, a601ca7e) eram do formato anterior ao v7; os de 3.1 antes deles variavam a voz entre cenas.
    // O comentário do fixture já disse o contrário sem o arquivo ter sido regerado, então os ids ficam fixados aqui.
    const [s1, s2] = ROSTER_ESCOLAR.videosDaJornada || [];
    const s3 = ROSTER_ESCOLAR.videoDaJornada!;
    expect([s1.bunnyVideoId, s2.bunnyVideoId, s3.bunnyVideoId]).toEqual([
      '851710a0-631a-4bf5-8931-ca3c8cd25213',
      '5028f57a-1ecd-4bf5-b870-a2089b9a0d5a',
      'ccf7d63b-dd56-4dc5-93a8-d701007dc084',
    ]);
    expect(s3.nominal?.bunnyVideoId).toBe('7ada533d-a34f-4c08-a96f-30387ef97263');
    // A duração do catálogo vem do deck (201, 245 e 210 s no Bunny): fixada, porque uma faixa deixaria passar a
    // duração do deck anterior, que é o defeito que este teste existe para barrar (a semana 1 já disse 4,13 min).
    expect([s1.duracaoMin, s2.duracaoMin, s3.duracaoMin]).toEqual([3.35, 4.08, 3.5]);
  });

  it('restaura cada tema, todos os formatos e o nominal sem duplicar no próximo reset', async () => {
    const configs = ['Ritmo e transições', 'Engajamento ativo'].map((descritor, index) => ({
      ...ROSTER_ESCOLAR.videoDaJornada!, descritor, moduloId: `modulo-${index}`,
      competenciaBaseId: `base-${index}`, celulaId: `celula-${index}`, bunnyVideoId: `video-${index}`,
      nominal: { personaKey: 'marina', bunnyVideoId: `nominal-${index}` },
    }));
    const roster = { ...ROSTER_ESCOLAR, videosDaJornada: configs };
    const todas = [roster.videoDaJornada!, ...configs];
    const rows = {
      micro_conteudos: todas.flatMap((cfg) => ['texto', 'audio', 'case'].map((formato) => ({
        id: `${cfg.moduloId}-${formato}`, empresa_id: 'demo', competencia: cfg.competencia,
        descritor: cfg.descritor, cargo: cfg.cargo, formato, modulo_base_id: null,
      }))),
      videos_gerados: todas.map((cfg) => ({
        id: cfg.celulaId, empresa_id: 'demo', modulo_base_id: cfg.moduloId,
        cargo: cfg.cargo, disc_dominante: cfg.disc, status: 'error',
      })),
      videos_personalizados: [] as any[],
      modulos_base_conteudo: [] as any[],
    };
    const vizinho = { ...rows.micro_conteudos[0], id: 'vizinho', empresa_id: 'outro' };
    const outroCargo = { ...rows.micro_conteudos[0], id: 'coordenacao', cargo: 'Coordenador(a)' };
    rows.micro_conteudos.push(vizinho, outroCargo);
    const sb = banco(rows);
    const personas = new Map([['marina', 'pessoa-atual']]);
    await recomporVideosDaJornadaDemo(sb, roster, 'demo', personas);
    await recomporVideosDaJornadaDemo(sb, roster, 'demo', personas);

    expect(rows.videos_gerados).toHaveLength(3);
    expect(rows.videos_personalizados).toHaveLength(3);
    expect(rows.modulos_base_conteudo).toHaveLength(3);
    for (const cfg of todas) {
      const contents = rows.micro_conteudos.filter((row) => row.empresa_id === 'demo'
        && row.descritor === cfg.descritor && row.cargo === cfg.cargo);
      expect(contents).toHaveLength(4);
      expect(contents.every((row) => row.modulo_base_id === cfg.moduloId)).toBe(true);
      expect(rows.videos_gerados.find((row) => row.id === cfg.celulaId))
        .toMatchObject({ status: 'done', bunny_video_id: cfg.bunnyVideoId });
      expect(rows.videos_personalizados.find((row) => row.cell_video_id === cfg.celulaId))
        .toMatchObject({ colaborador_id: 'pessoa-atual', status: 'done', bunny_video_id: cfg.nominal!.bunnyVideoId });
    }
    expect(vizinho.modulo_base_id).toBeNull();
    expect(outroCargo.modulo_base_id).toBeNull();
  });
});
