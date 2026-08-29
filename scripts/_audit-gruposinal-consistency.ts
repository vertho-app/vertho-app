/** Auditoria somente leitura da coerência entre as três visões da demo Grupo Sinal. */
import './_env';
import { createSupabaseAdmin } from '@/lib/supabase';
import { carregarDashboardData, carregarJornada, carregarPanoramaRH } from '@/lib/home/loaders';

const sb = createSupabaseAdmin();
const SLUG = 'gruposinal';

const asObject = (value: any) => {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
};

function zeroLevels(value: any, base = '$', out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item, index) => zeroLevels(item, `${base}[${index}]`, out));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const next = `${base}.${key}`;
      if (typeof item === 'number' && item === 0 && /^(nivel|nível|nivel_atual|nível_atual|nivel_geral|nível_geral|nivel_ia4)$/i.test(key)) out.push(next);
      zeroLevels(item, next, out);
    }
  }
  return out;
}

async function main() {
  const { data: empresa, error: empresaError } = await sb.from('empresas')
    .select('id,nome,slug,is_demo,sys_config').eq('slug', SLUG).maybeSingle();
  if (empresaError || !empresa) throw new Error(empresaError?.message || 'tenant não encontrado');

  const { data: colabs, error: colabsError } = await sb.from('colaboradores')
    .select('id,empresa_id,nome_completo,email,role,cargo,area_depto,gestor_nome,gestor_email,perfil_dominante,mapeamento_em')
    .eq('empresa_id', empresa.id).order('nome_completo');
  if (colabsError || !colabs) throw new Error(colabsError?.message || 'colaboradores não encontrados');
  const ids = colabs.map((c) => c.id);

  const [cargosRes, respostasRes, assessRes, trilhasRes, relatoriosRes] = await Promise.all([
    sb.from('cargos_empresa').select('id,nome,top5_workshop,competencia_foco,competencias_foco').eq('empresa_id', empresa.id),
    sb.from('respostas').select('id,colaborador_id,competencia_id,competencia_nome,nivel_ia4,nota_ia4,avaliacao_ia,status_ia4').eq('empresa_id', empresa.id).in('colaborador_id', ids),
    sb.from('descriptor_assessments').select('id,colaborador_id,competencia,descritor,nota,nivel,origem').eq('empresa_id', empresa.id).in('colaborador_id', ids),
    sb.from('trilhas').select('id,colaborador_id,status,competencia_foco,competencias_foco,temporada_plano,data_inicio,criado_em').eq('empresa_id', empresa.id).in('colaborador_id', ids),
    sb.from('relatorios').select('id,colaborador_id,tipo,conteudo,pdf_path,gerado_em').eq('empresa_id', empresa.id),
  ]);
  const error = cargosRes.error || respostasRes.error || assessRes.error || trilhasRes.error || relatoriosRes.error;
  if (error) throw new Error(error.message);

  const cargos = cargosRes.data || [];
  const respostas = respostasRes.data || [];
  const assessments = assessRes.data || [];
  const trilhas = trilhasRes.data || [];
  const relatorios = relatoriosRes.data || [];
  const cargoPorNome = new Map(cargos.map((c: any) => [c.nome, c]));

  const pessoas: any[] = [];
  for (const colab of colabs) {
    const cargo: any = cargoPorNome.get(colab.cargo);
    const top5: string[] = Array.isArray(cargo?.top5_workshop) ? cargo.top5_workshop : [];
    const rs = respostas.filter((r: any) => r.colaborador_id === colab.id);
    const das = assessments.filter((a: any) => a.colaborador_id === colab.id);
    const ts = trilhas.filter((t: any) => t.colaborador_id === colab.id);
    const reps = relatorios.filter((r: any) => r.colaborador_id === colab.id);
    const porComp = new Map<string, any[]>();
    for (const da of das) {
      const arr = porComp.get(da.competencia) || [];
      arr.push(da);
      porComp.set(da.competencia, arr);
    }
    const descritores = [...porComp.entries()].map(([competencia, rows]) => {
      const notas = rows.map((r: any) => Number(r.nota));
      return { competencia, quantidade: rows.length, media: Number((notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2)), min: Math.min(...notas), max: Math.max(...notas) };
    });
    const respostasCompactas = rs.map((r: any) => {
      const av = asObject(r.avaliacao_ia);
      return {
        competencia: r.competencia_nome,
        nivel_coluna: r.nivel_ia4,
        nota_coluna: r.nota_ia4,
        nivel_consolidacao: av?.consolidacao?.nivel_geral ?? null,
        nota_consolidacao: av?.consolidacao?.media_descritores ?? av?.consolidacao?.nota_geral ?? null,
        avaliada: Boolean(r.avaliacao_ia),
        status_ia4: r.status_ia4,
      };
    });
    const pdis = reps.filter((r: any) => r.tipo === 'individual').map((r: any) => ({
      id: r.id,
      pdf: Boolean(r.pdf_path),
      gerado_em: r.gerado_em,
      zeros_nivel_nota: zeroLevels(r.conteudo),
      competencias: Array.isArray(r.conteudo?.competencias)
        ? r.conteudo.competencias.map((c: any) => ({ nome: c.nome || c.competencia, nivel: c.nivel_atual ?? c.nivel, nota: c.nota_decimal }))
        : [],
    }));
    const jornada = colab.role === 'rh' ? null : await carregarJornada(colab as any);
    const dashboard = colab.email === 'bruna.demo@vertho.ai'
      ? await carregarDashboardData({ colaborador: colab as any, role: colab.role as any, isPlatformAdmin: false } as any)
      : null;
    pessoas.push({
      nome: colab.nome_completo,
      email: colab.email,
      role: colab.role,
      cargo: colab.cargo,
      gestor_email: colab.gestor_email,
      perfil: { dominante: colab.perfil_dominante, mapeamento_em: colab.mapeamento_em },
      cargo_config: { top5, foco: cargo?.competencias_foco || (cargo?.competencia_foco ? [cargo.competencia_foco] : []) },
      respostas: respostasCompactas,
      descriptor_assessments: descritores,
      trilhas: ts.map((t: any) => ({ status: t.status, foco: t.competencias_foco || [t.competencia_foco].filter(Boolean), semanas: Array.isArray(t.temporada_plano) ? t.temporada_plano.length : 0, data_inicio: t.data_inicio })),
      pdis,
      jornada: jornada ? jornada.fases : null,
      dashboard: dashboard ? {
        total_competencias: dashboard.colaborador.totalComp,
        respondidas: dashboard.colaborador.respondidas,
        avaliadas: dashboard.colaborador.avaliadas,
        progresso: dashboard.colaborador.progresso,
      } : null,
      invariantes: {
        respostas_top5: `${new Set(rs.map((r: any) => r.competencia_nome)).size}/${top5.length}`,
        respostas_avaliadas: `${rs.filter((r: any) => r.avaliacao_ia != null).length}/${top5.length}`,
        competencias_com_assessment: `${new Set(das.map((a: any) => a.competencia)).size}/${top5.length}`,
        tem_pdi_sem_mapeamento: pdis.length > 0 && new Set(das.map((a: any) => a.competencia)).size < top5.length,
        tem_trilha_sem_mapeamento: ts.length > 0 && new Set(das.map((a: any) => a.competencia)).size < top5.length,
        tem_nivel_zero: respostasCompactas.some((r: any) => r.nivel_coluna === 0 || r.nivel_consolidacao === 0)
          || pdis.some((p: any) => p.zeros_nivel_nota.length > 0),
      },
    });
  }

  const rh = await carregarPanoramaRH(empresa.id);
  const relatoriosEmpresa = relatorios.filter((r: any) => !r.colaborador_id).map((r: any) => ({
    tipo: r.tipo,
    pdf: Boolean(r.pdf_path),
    zeros_nivel_nota: zeroLevels(r.conteudo),
  }));
  console.log(JSON.stringify({ empresa, rh, pessoas, relatoriosEmpresa }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
