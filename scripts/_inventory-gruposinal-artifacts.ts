import './_env';
import { createSupabaseAdmin } from '@/lib/supabase';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';

const SLUG = process.argv[2] || 'gruposinal';

function entregas(planoRaw: unknown) {
  const plano = normalizeTemporadaPlano(planoRaw);
  return plano.flatMap((semana: any) => {
    if (semana?.tipo !== 'conteudo') return [];
    const conteudos = Array.isArray(semana.conteudos_dia) && semana.conteudos_dia.length
      ? semana.conteudos_dia.map((item: any) => item?.conteudo).filter(Boolean)
      : (semana.conteudo ? [semana.conteudo] : []);
    return conteudos.flatMap((conteudo: any) => Object.entries(conteudo?.formatos_disponiveis || {})
      .map(([formato, info]: [string, any]) => ({
        semana: semana.calendario_semana ?? semana.semana,
        titulo: conteudo?.titulo || conteudo?.nome || null,
        formato,
        contentId: info?.id || null,
      })));
  });
}

function temas(planoRaw: unknown) {
  return normalizeTemporadaPlano(planoRaw)
    .filter((semana: any) => semana?.tipo === 'conteudo')
    .map((semana: any) => ({
      semana: semana.calendario_semana ?? semana.semana,
      competencia: semana.competencia || null,
      descritor: semana.descritor || null,
      titulo: semana.conteudo?.core_titulo || null,
      formatos: Object.keys(semana.conteudo?.formatos_disponiveis || {}),
    }));
}

async function main() {
  const sb = createSupabaseAdmin();
  const { data: empresa, error: empresaError } = await sb.from('empresas')
    .select('id,nome,slug,is_demo').eq('slug', SLUG).single();
  if (empresaError || !empresa) throw empresaError || new Error('Tenant não encontrado');

  const [{ data: colabs, error: colabsError }, { data: trilhas, error: trilhasError }, { data: relatorios, error: relatoriosError }] = await Promise.all([
    sb.from('colaboradores')
      .select('id,nome_completo,email,role,cargo,perfil_dominante,report_texts,report_generated_at,comportamental_pdf_path,comportamental_audio_path,comportamental_audio_at')
      .eq('empresa_id', empresa.id).order('nome_completo'),
    sb.from('trilhas')
      .select('id,colaborador_id,status,data_inicio,competencia_foco,temporada_plano,criado_em')
      .eq('empresa_id', empresa.id).order('criado_em', { ascending: false }),
    sb.from('relatorios')
      .select('id,colaborador_id,tipo,pdf_path,gerado_em,conteudo')
      .eq('empresa_id', empresa.id).order('gerado_em', { ascending: false }),
  ]);
  if (colabsError) throw colabsError;
  if (trilhasError) throw trilhasError;
  if (relatoriosError) throw relatoriosError;

  const byId = new Map((colabs || []).map((c: any) => [c.id, c]));
  const trilhasResumo = (trilhas || []).map((t: any) => ({
    id: t.id,
    colaborador: byId.get(t.colaborador_id)?.nome_completo || t.colaborador_id,
    status: t.status,
    data_inicio: t.data_inicio,
    competencia_foco: t.competencia_foco,
    temas: temas(t.temporada_plano),
    entregas: entregas(t.temporada_plano),
  }));

  const pares = [...new Map(trilhasResumo.flatMap((t: any) => t.temas)
    .filter((t: any) => t.competencia && t.descritor)
    .map((t: any) => [`${t.competencia}|||${t.descritor}`, t])).values()] as any[];
  const catalogo: any[] = [];
  for (const par of pares) {
    const { data, error } = await sb.from('micro_conteudos')
      .select('id,titulo,formato,competencia,descritor,cargo,empresa_id,url,storage_path,ativo')
      .eq('competencia', par.competencia)
      .eq('descritor', par.descritor)
      .or(`empresa_id.eq.${empresa.id},empresa_id.is.null`)
      .eq('ativo', true);
    if (error) throw error;
    catalogo.push(...(data || []));
  }

  const storage = async (bucket: string, path: string) => {
    const { data, error } = await sb.storage.from(bucket).list(path, { limit: 1000 });
    if (error) return { error: error.message };
    return (data || []).map((o: any) => ({ name: o.name, size: o.metadata?.size ?? null, type: o.metadata?.mimetype ?? null }));
  };

  console.log(JSON.stringify({
    empresa,
    colaboradores: (colabs || []).map((c: any) => ({
      id: c.id,
      nome: c.nome_completo,
      email: c.email,
      role: c.role,
      cargo: c.cargo,
      perfil: c.perfil_dominante,
      textosComportamentais: !!c.report_texts,
      pdfComportamental: c.comportamental_pdf_path,
      audioComportamental: c.comportamental_audio_path,
      audioEm: c.comportamental_audio_at,
    })),
    trilhas: trilhasResumo,
    catalogoTrilhas: catalogo,
    relatorios: (relatorios || []).map((r: any) => ({
      id: r.id,
      tipo: r.tipo,
      colaborador: r.colaborador_id ? (byId.get(r.colaborador_id)?.nome_completo || r.colaborador_id) : null,
      pdf: r.pdf_path,
      conteudo: !!r.conteudo,
      geradoEm: r.gerado_em,
    })),
    storage: {
      relatoriosTenant: await storage('relatorios-pdf', empresa.id),
      conteudosPdf: await storage('conteudos', `final/perso`),
      conteudosAudio: await storage('conteudos', `final/podcast-perso/${empresa.id}`),
      dna: await storage('conteudos', 'final/dna'),
      perfilOrg: await storage('conteudos', 'final/perfil-org'),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
