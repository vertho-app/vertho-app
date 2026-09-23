'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { excludeInternalEmails } from '@/lib/internal-emails';

export async function loadAdminDashboard() {
  const sb = await requireAdminSupabase();

  const [empresasRes, colabsRes, respostasRes, cenariosRes, trilhasRes, capacitacaoRes] = await Promise.all([
    sb.from('empresas').select('id, nome, segmento, slug, created_at').order('nome'),
    excludeInternalEmails(sb.from('colaboradores').select('id, empresa_id', { count: 'exact', head: false })), // exclui internos @vertho.ai das estatísticas
    sb.from('respostas').select('id', { count: 'exact', head: true }),
    sb.from('banco_cenarios').select('id', { count: 'exact', head: true }),
    (sb.from('trilhas').select('id', { count: 'exact', head: true }) as any).then((r: any) => r).catch(() => ({ count: 0 })),
    (sb.from('capacitacao').select('id', { count: 'exact', head: true }) as any).then((r: any) => r).catch(() => ({ count: 0 })),
  ]);

  const empresas = empresasRes.data || [];
  const colabs = colabsRes.data || [];

  // Enriquecer empresas com contagem de colaboradores
  const colabsPorEmpresa = {};
  colabs.forEach(c => {
    colabsPorEmpresa[c.empresa_id] = (colabsPorEmpresa[c.empresa_id] || 0) + 1;
  });

  const enriched = empresas.map(emp => ({
    ...emp,
    totalColab: colabsPorEmpresa[emp.id] || 0,
  }));

  // PDI = relatório individual (`relatorios`, tipo 'individual'), decisão do dono
  // de 16/08/2026. Até 22/09 este KPI repetia a contagem de `respostas` "como
  // proxy", e a tela mostrava Avaliações e PDIs com o MESMO número. Contado por
  // empresa, com o `empresa_id` na mesma cadeia: a leitura entre tenants fica no
  // padrão do `/admin-v2`, sem entrada nova na allowlist do tenant-read-guard.
  const pdisPorEmpresa = await Promise.all(empresas.map(async (emp: any) => {
    const { count, error } = await sb.from('relatorios')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', emp.id)
      .eq('tipo', 'individual');
    return error ? null : (count || 0);
  }));
  const totalPDIs = pdisPorEmpresa.some((n) => n === null)
    ? null
    : pdisPorEmpresa.reduce((s: number, n) => s + (n || 0), 0);

  const health = await carregarSaudeOperacao(sb);

  return {
    empresas: enriched,
    totalColabs: colabs.length,
    totalAvaliacoes: respostasRes.count || 0,
    totalPDIs,
    totalCenarios: cenariosRes.count || 0,
    totalTrilhas: trilhasRes.count || 0,
    totalCapacitacao: capacitacaoRes.count || 0,
    health,
  };
}

/**
 * Saúde da operação: a última rodada de cada modo do health-check do pipeline
 * (`lib/pipeline-health`, gravada em `pipeline_health_runs` pelos crons).
 *
 * 🔴 Até 22/09/2026 este bloco só testava se 6 tabelas respondiam a um SELECT, e
 * a linha "Supabase: conectado" era fixa na tela: ficava verde com o pipeline
 * quebrado. Agora mostra o que os crons acharam, e o banco aparece como
 * "respondeu" só quando a própria leitura destas rodadas funcionou.
 *
 * Uma rodada de cron grava várias linhas de uma vez (uma por empresa), então a
 * rodada é a última linha do modo mais as dos 10 minutos anteriores. Modo sem
 * linha nenhuma sai `semRun`, que não é falha por si: o preflight só grava
 * quando há entrega no dia seguinte.
 */
const MODOS_SAUDE = ['estrutural', 'preflight', 'postflight', 'horizonte'] as const;
const JANELA_DA_RODADA_MS = 10 * 60 * 1000;
const PESO_SEVERIDADE: Record<string, number> = { ok: 0, aviso: 1, critico: 2 };

async function carregarSaudeOperacao(sb: any) {
  const modos = await Promise.all(MODOS_SAUDE.map(async (modo) => {
    const { data: ultimo, error: e1 } = await sb.from('pipeline_health_runs')
      .select('criado_em')
      .eq('modo', modo)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) return { modo, falhouLeitura: true as const };
    if (!ultimo) return { modo, status: 'semRun' as const, achados: 0, em: null };

    const inicio = new Date(new Date(ultimo.criado_em).getTime() - JANELA_DA_RODADA_MS).toISOString();
    const { data: linhas, error: e2 } = await sb.from('pipeline_health_runs')
      .select('severidade, total_achados, erro')
      .eq('modo', modo)
      .gte('criado_em', inicio)
      .lte('criado_em', ultimo.criado_em);
    if (e2) return { modo, falhouLeitura: true as const };

    const rodada = linhas || [];
    const pior = rodada.reduce((p: string, l: any) =>
      (PESO_SEVERIDADE[l.severidade] ?? 0) > (PESO_SEVERIDADE[p] ?? 0) ? l.severidade : p, 'ok');
    // `erro` preenchido = o CHECK falhou, que é pior que achar problema: o
    // silêncio de um check que não rodou parece silêncio bom.
    const status = rodada.some((l: any) => !!l.erro) ? 'erro' : pior;
    const achados = rodada.reduce((s: number, l: any) => s + (Number(l.total_achados) || 0), 0);
    return { modo, status, achados, em: ultimo.criado_em as string };
  }));

  const bancoRespondeu = !modos.some((m: any) => m.falhouLeitura);
  return {
    bancoRespondeu,
    modos: modos.map((m: any) => (m.falhouLeitura
      ? { modo: m.modo, status: 'erro', achados: 0, em: null }
      : m)),
  };
}
