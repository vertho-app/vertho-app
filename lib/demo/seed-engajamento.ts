import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { rosterDemo } from './rosters';
import { formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { PROGRESSO } from '@/lib/status';

const checked = async (query: PromiseLike<any>) => {
  const { data, error } = await query;
  if (error) throw new Error(`engajamento demo: ${error.message}`);
  return data;
};
const id = (key: string) => {
  const h = createHash('sha256').update(`engajamento-demo-v1:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Sinais editoriais acompanham semanas já concluídas. Nunca disparam mídia, IA ou mensagens. */
export async function seedEngajamentoDemo(sb: SupabaseClient, empresaId: string, agora = new Date()) {
  const empresa = await checked(sb.from('empresas').select('slug,is_demo').eq('id', empresaId).single());
  if (!empresa.is_demo || !['acme-demo', 'gruposinal', 'escolas-acme'].includes(empresa.slug)) throw new Error('Somente elenco fictício.');
  const roster = rosterDemo(empresa.slug === 'escolas-acme' ? 'escolar' : 'comercial');
  const elenco = [...roster.personas, ...(roster.diretorio || [])];
  const pessoas = await checked(sb.from('colaboradores').select('id,email,pref_video_curto,pref_video_longo,pref_audio,pref_texto,pref_estudo_caso').eq('empresa_id', empresaId).in('email', elenco.map(p => p.email)).order('email'));
  const progresso = await checked(sb.from('temporada_semana_progresso').select('id,trilha_id,colaborador_id,semana,tira_duvidas').eq('empresa_id', empresaId).in('colaborador_id', pessoas.map((p: any) => p.id)).eq('status', PROGRESSO.CONCLUIDO).order('semana'));
  const apoio = new Set((roster.diretorio || []).map(p => p.email));
  const atraso = new Set((roster.panorama?.atrasados || []).map(key => elenco.find(p => p.key === key)?.email));
  const videos: any[] = [], eventos: any[] = [];
  let conversas = 0;
  for (const [i, p] of pessoas.entries()) {
    const semanas = progresso.filter((pr: any) => pr.colaborador_id === p.id);
    if (!semanas.length) continue;
    if (apoio.has(p.email)) {
      const campo = ['pref_video_curto', 'pref_audio', 'pref_texto', 'pref_estudo_caso'][i % 4];
      const prefs = { pref_video_curto: 2, pref_video_longo: 2, pref_audio: 2, pref_texto: 2, pref_estudo_caso: 2, [campo]: 5 };
      const { error: prefsError } = await sb.from('colaboradores').update(prefs).eq('id', p.id).eq('empresa_id', empresaId);
      if (prefsError) throw new Error(`engajamento demo: ${prefsError.message}`);
      Object.assign(p, prefs);
    }
    const formato = formatoPreferido(p);
    const em = new Date(agora.getTime() - (atraso.has(p.email) ? 21 : 3) * 86400000).toISOString();
    for (const pr of semanas) {
      const base = { empresa_id: empresaId, colaborador_id: p.id, trilha_id: pr.trilha_id, semana: pr.semana, pilula: 1, criado_em: em };
      eventos.push({ ...base, id: id(`${pr.id}:formato`), tipo: 'formato', formato });
      if (formato === 'audio') eventos.push({ ...base, id: id(`${pr.id}:audio_fim`), tipo: 'audio_fim', formato });
      if (formato === 'video' || pr.semana % 3 === 0) videos.push({
        id: id(`${pr.id}:video`), empresa_id: empresaId, colaborador_id: p.id, semana: pr.semana,
        // Identificador explícito de consumo sintético, sem fingir um evento do provedor.
        video_id: `demo:${pr.trilha_id}:${pr.semana}`, event_type: atraso.has(p.email) ? 'play_progress' : 'play_finished',
        video_length: 120, seconds_watched: atraso.has(p.email) ? 72 : 120,
        raw_payload: { demo_fixture: true, origem: 'engajamento-demo-v1' }, created_at: em,
      });
    }
    if (i % 3 !== 0 && apoio.has(p.email) && !semanas[0].tira_duvidas) {
      const { error: conversaError } = await sb.from('temporada_semana_progresso').update({ tira_duvidas: {
        demo_fixture: true,
        transcript_completo: [
          { role: 'user', content: 'Como transformar o aprendizado da semana em uma ação que eu consiga acompanhar?', timestamp: em },
          { role: 'assistant', content: 'Escolha uma situação da sua rotina, defina uma ação pequena e registre o que aconteceu. Combine com sua liderança qual evidência vocês vão observar na próxima conversa.', timestamp: em },
        ],
      } }).eq('id', semanas[0].id).eq('empresa_id', empresaId).is('tira_duvidas', null);
      if (conversaError) throw new Error(`engajamento demo: ${conversaError.message}`);
      conversas++;
    }
  }
  for (const [tabela, rows] of [['videos_watched', videos], ['trilha_eventos', eventos]] as const) {
    for (let offset = 0; offset < rows.length; offset += 200) {
      const { error } = await sb.from(tabela).upsert(rows.slice(offset, offset + 200), { onConflict: 'id' });
      if (error) throw new Error(`engajamento demo: ${error.message}`);
    }
  }
  return { videos: videos.length, eventos: eventos.length, conversas };
}
