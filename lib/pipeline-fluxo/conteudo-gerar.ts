/**
 * Gera UMA peça da biblioteca (conteúdo-base) sem sessão, para a etapa CONTEÚDOS do fluxo.
 * `gerarConteudoIA` é idempotente (já existe o par competência × descritor × formato × cargo = pula e devolve o id), e quando
 * a peça é áudio o MP3 precisa existir: o podcast só vira ATIVO com o arquivo, e conteúdo inativo é invisível à montagem da
 * trilha. Peça de áudio que já existia SEM o MP3 (um lote interrompido) é completada aqui, não ignorada.
 * Falha de uma peça NÃO derruba a etapa (o executor conta como falha e segue).
 */
import type { ConteudoItem } from './executor';

export async function gerarConteudoDaBiblioteca(sb: any, empresaId: string, item: ConteudoItem): Promise<{ ok: boolean; erro?: string }> {
  const { gerarConteudoIA } = await import('@/actions/conteudos');
  const r: any = await gerarConteudoIA({
    formato: item.formato, competencia: item.competencia, descritor: item.descritor, cargo: item.cargo, contexto: 'generico', empresaId, sb,
  });
  if (!r?.success) return { ok: false, erro: r?.error || 'geração falhou' };
  if (item.formato !== 'audio') return { ok: true };
  if (!r.conteudoId) return { ok: false, erro: 'áudio gerado sem id para renderizar' };

  const { data: mc, error } = await sb.from('micro_conteudos')
    .select('id, formato, titulo, competencia, conteudo_inline, empresa_id, url, ativo').eq('id', r.conteudoId).eq('empresa_id', empresaId).maybeSingle();
  if (error || !mc) return { ok: false, erro: `leitura do áudio para renderizar: ${error?.message || 'não achei'}` };
  if (mc.url && mc.ativo) return { ok: true };

  const { gerarPodcastAudioCore } = await import('@/lib/conteudo-podcast-core');
  const a = await gerarPodcastAudioCore(sb, mc, async (id: string, patch: Record<string, any>) => {
    const { data, error: e } = await sb.from('micro_conteudos').update(patch).eq('id', id).eq('empresa_id', empresaId).select('id').single();
    if (e) throw new Error(e.message);
    return data;
  });
  return a.success ? { ok: true } : { ok: false, erro: a.error || 'áudio não publicado' };
}
