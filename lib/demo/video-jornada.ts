import type { SupabaseClient } from '@supabase/supabase-js';
import type { DemoRoster } from '@/lib/demo/rosters/types';
import { encontrarCelulaVideoDemo } from '@/lib/demo/celula-video';

/** Recompõe os vídeos prontos e seus vínculos sem alterar a jornada ou o progresso. */
export async function recomporVideosDaJornadaDemo(
  sb: SupabaseClient,
  roster: DemoRoster,
  destId: string,
  personaMap: Map<string, string>,
) {
  const videos = [
    ...(roster.videoDaJornada ? [roster.videoDaJornada] : []),
    ...(roster.videosDaJornada || []),
  ];
  for (const cfg of videos) {
    const libraryId = String(process.env.BUNNY_LIBRARY_ID || 636615);

    // A ancora e o CATALOGO GLOBAL, nao a competencia do tenant: `competencias`
    // e apagada a cada reset, e um modulo preso a ela deixa o delete violar
    // `chk_modulo_competencia` — abortando o reset com o tenant ja meio limpo.
    const compBase = await sb.from('competencias_base').upsert({
      id: cfg.competenciaBaseId,
      segmento: cfg.segmento,
      cod_comp: cfg.codComp,
      nome: cfg.competencia,
      pilar: cfg.pilar,
      descricao: cfg.descricaoCompetencia,
      cod_desc: cfg.codDesc,
      nome_curto: cfg.descritor,
      descritor_completo: cfg.descritorCompleto,
      ...cfg.regua,
      cargo: cfg.cargo,
    }, { onConflict: 'id' });
    if (compBase.error) throw new Error(`competencia-base do video da jornada: ${compBase.error.message}`);

    const moduloResult = await sb.from('modulos_base_conteudo').upsert({
      id: cfg.moduloId,
      empresa_id: destId,
      competencia_id: null,
      competencia_base_id: cfg.competenciaBaseId,
      locale: 'pt-BR',
      nivel_entrada: cfg.nivelEntrada,
      nivel_destino: cfg.nivelDestino,
      titulo: cfg.titulo,
      finalidade: cfg.finalidade,
      contexto_pedagogico: cfg.cargo,
      tags: cfg.tags,
      preferido: false,
      status: 'publicado',
      versao: 1,
      descritor: cfg.descritor,
      conteudo_central: cfg.conteudoCentral,
      conteudo_aplicavel: cfg.conteudoAplicavel,
      guarda_corpos: cfg.guardaCorpos,
      adaptacao_por_formato: cfg.adaptacaoPorFormato,
      created_by: 'demo-jornada',
      published_by: 'demo-jornada',
      published_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (moduloResult.error) throw new Error(`modulo do video da jornada: ${moduloResult.error.message}`);

    // Liga TODOS os micro-conteudos daquela semana ao modulo: o resolvedor
    // recebe o `core_id` do formato que a pessoa esta vendo, e qualquer um
    // deles precisa levar ao mesmo video.
    const vinculo = await sb.from('micro_conteudos')
      .update({ modulo_base_id: cfg.moduloId })
      .eq('empresa_id', destId).eq('competencia', cfg.competencia)
      .eq('descritor', cfg.descritor).eq('cargo', cfg.cargo);
    if (vinculo.error) throw new Error(`vincular conteudos ao modulo do video: ${vinculo.error.message}`);

    // O VÍDEO tambem entra no catalogo de conteudos.
    //
    // A celula (`videos_gerados`) serve a TRILHA — a semana que resolve o video
    // ao vivo. A vitrine de capacitacao da home, porem, le `micro_conteudos`, e
    // ali o formato video simplesmente nao existia no tenant escolar: a home
    // exibia audio, texto e case, e quem olha conclui que a plataforma nao tem
    // video. A linha abaixo publica o MESMO asset como conteudo do catalogo,
    // como o ACME ja fazia com o video editorial da apresentacao.
    const videoNoCatalogo = {
      empresa_id: destId,
      titulo: cfg.titulo,
      descricao: cfg.finalidade,
      formato: 'video',
      duracao_min: cfg.duracaoMin ?? 3.5,
      bunny_video_id: cfg.bunnyVideoId,
      url: `https://iframe.mediadelivery.net/embed/${libraryId}/${cfg.bunnyVideoId}`,
      competencia: cfg.competencia,
      descritor: cfg.descritor,
      nivel_min: 1,
      nivel_max: 4,
      tipo_conteudo: 'core',
      contexto: 'educacional',
      cargo: cfg.cargo,
      setor: 'todos',
      origem: 'pre_produzido',
      ativo: true,
      modulo_base_id: cfg.moduloId,
    };
    // O tuple e o mesmo da unique parcial `uq_micro_conteudos_core`: buscar pelo
    // SLOT torna o upsert idempotente entre resets.
    const videoExistente = await sb.from('micro_conteudos')
      .select('id')
      .eq('empresa_id', destId)
      .eq('competencia', cfg.competencia)
      .eq('descritor', cfg.descritor)
      .eq('formato', 'video')
      .eq('cargo', cfg.cargo)
      .is('kit_id', null)
      .maybeSingle();
    if (videoExistente.error) throw new Error(`video no catalogo: ${videoExistente.error.message}`);
    const gravouCatalogo = videoExistente.data?.id
      ? await sb.from('micro_conteudos').update(videoNoCatalogo)
          .eq('id', videoExistente.data.id).eq('empresa_id', destId)
      : await sb.from('micro_conteudos').insert(videoNoCatalogo);
    if (gravouCatalogo.error) throw new Error(`gravar video no catalogo: ${gravouCatalogo.error.message}`);

    const celulaExistente = await encontrarCelulaVideoDemo(sb, {
      id: cfg.celulaId, moduloId: cfg.moduloId, empresaId: destId,
      cargo: cfg.cargo, disc: cfg.disc,
    });

    const cellId = celulaExistente?.id || cfg.celulaId;
    const payloadCelula = {
      modulo_base_id: cfg.moduloId,
      empresa_id: destId,
      status: 'done',
      etapa: 'done',
      bunny_video_id: cfg.bunnyVideoId,
      bunny_library: libraryId,
      video_url: `https://iframe.mediadelivery.net/play/${libraryId}/${cfg.bunnyVideoId}`,
      cargo: cfg.cargo,
      disc_dominante: cfg.disc,
      created_by: 'demo-jornada',
      error: null,
    };
    const gravou = celulaExistente?.id
      ? await sb.from('videos_gerados').update(payloadCelula).eq('id', cellId).eq('empresa_id', destId)
      : await sb.from('videos_gerados').insert({ id: cellId, ...payloadCelula });
    if (gravou.error) throw new Error(`gravar celula do video da jornada: ${gravou.error.message}`);

    // A versao NOMINAL da persona. `videos_personalizados` cascateia com
    // `colaboradores`, e o reset recria as pessoas com ids novos — sem recriar
    // aqui, a saudacao some toda noite e a persona volta a ver o generico.
    if (cfg.nominal) {
      const personaId = personaMap.get(cfg.nominal.personaKey);
      if (personaId) {
        const nominal = await sb.from('videos_personalizados').upsert({
          cell_video_id: cellId,
          colaborador_id: personaId,
          nome_usado: (roster.personas.find((p) => p.key === cfg.nominal!.personaKey)?.nome_completo || '').split(/\s+/)[0] || null,
          status: 'done',
          bunny_video_id: cfg.nominal.bunnyVideoId,
          bunny_library: libraryId,
          video_url: `https://iframe.mediadelivery.net/play/${libraryId}/${cfg.nominal.bunnyVideoId}`,
          error: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'cell_video_id,colaborador_id' });
        if (nominal.error) throw new Error(`video nominal da jornada: ${nominal.error.message}`);
      }
    }
  }
}
