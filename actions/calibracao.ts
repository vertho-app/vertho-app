'use server';
/**
 * Diagnóstico de Calibração (Fase 1) — orquestrador DEV-ONLY (admin-gated).
 *
 * Junta as camadas: higiene (0), cartão engine-free (1), direção (consistency-check) e a
 * materialidade (SIMULAÇÃO rotulada — única peça que toca o motor). DESCREVE e CLASSIFICA;
 * NUNCA prescreve. NÃO entra no PDF do cliente — é instrumentação interna de autoria.
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { aggregateAdequacao } from '@/lib/adequacao-cargo/aggregate';
import { camada0Higiene, camada1Cartao, camada1Direcao, saudeCalibracao } from '@/lib/calibracao/diagnostico';
import { simularMaterialidade } from '@/lib/calibracao/materialidade';
import { buildRoleSpec } from '@/lib/scoring/role-spec';
import { buildCandidateProfile, candidateColumns } from '@/lib/scoring/candidate';
import { scoreCandidate } from '@/lib/scoring/engine';
import { COMP_LABEL } from '@/lib/perfil-organizacional/aggregate';

const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
type Mudanca = { tipo: 'direcao'; para: 'floor' | 'target' | 'ceiling' } | { tipo: 'ombro'; lo: number };

/** Aplica a mudança no SPEC (em memória) — usado pelo e-se. */
function specComMudanca(spec: any, tracoKey: string, m: Mudanca) {
  return { ...spec, traits: spec.traits.map((t: any) => t.key !== tracoKey ? { ...t } : (m.tipo === 'direcao' ? { ...t, direction: m.para } : { ...t, lo: m.lo })) };
}

export async function listarCargosCalibracao(empresaId: string): Promise<{ cargos: string[] }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const { data } = await sb.from('cargos_empresa').select('nome, gabarito').eq('empresa_id', empresaId);
    const cargos = (data || []).filter((c: any) => c.gabarito?.tela4).map((c: any) => c.nome).sort((a: string, b: string) => a.localeCompare(b));
    return { cargos };
  } catch { return { cargos: [] }; }
}

export async function diagnosticarCalibracao(empresaId: string, cargo: string): Promise<any> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const data = await aggregateAdequacao(sb, empresaId, cargo);
    if (data.semGabarito) return { success: false, error: 'Cargo sem gabarito.' };
    if (data.semColaboradores) return { success: false, error: 'Nenhum colaborador com DISC.' };

    // Camada 0 — higiene (lista de candidatos crua)
    const { data: cl } = await sb.from('colaboradores').select('id, nome_completo, email, d_natural').eq('empresa_id', empresaId).eq('cargo', cargo);
    const higiene = camada0Higiene((cl || []).map((r: any) => ({ id: r.id, nome: r.nome_completo, email: r.email, dNatural: r.d_natural })));

    // Camada 1 — cartão (engine-free, lê o resultado) + direção (consistency-check)
    const { n, cartao, semTracos } = camada1Cartao(data);
    const direcao = camada1Direcao(data);

    // Materialidade — SIMULAÇÃO (engine) só p/ os traços flagados (não design-by-choice / não curvilíneo-correto)
    const { data: cgRow } = await sb.from('cargos_empresa').select('gabarito, eh_lideranca').eq('empresa_id', empresaId).eq('nome', cargo).maybeSingle();
    const { data: colabs } = await sb.from('colaboradores')
      .select(['id', ...candidateColumns()].join(', '))
      .eq('empresa_id', empresaId).eq('cargo', cargo).not('d_natural', 'is', null).not('email', 'ilike', '%@vertho.ai%');
    const materialidade: Record<string, any> = {};
    if (cgRow?.gabarito && colabs) {
      for (const l of cartao.filter((x) => x.quadrante === 'sinal-recuperavel' || x.quadrante === 'tensao-de-autoria')) {
        const m = simularMaterialidade(cgRow.gabarito, cargo, !!cgRow.eh_lideranca, colabs, l.key);
        if (m) materialidade[l.key] = m;
      }
    }

    const saude = saudeCalibracao(cartao, higiene.some((i: any) => i.tipo !== 'sem_disc'), n);
    return { success: true, cargo, n, semTracos, higiene, cartao, direcao, materialidade, saude };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro no diagnóstico de calibração.' };
  }
}

/**
 * E-SE de uma mudança de régua (read-only, NÃO aplica). Roda o rito decomposto: mede o
 * efeito antes de promover. Mostra o PERIGO (gate destravando) explicitamente — gate
 * avaliado em betaBand-held no baseline + bloqueados antes/depois nominais.
 */
export async function simularMudancaRegua(empresaId: string, cargo: string, tracoKey: string, m: Mudanca): Promise<any> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const { data: cg } = await sb.from('cargos_empresa').select('gabarito, eh_lideranca').eq('empresa_id', empresaId).eq('nome', cargo).maybeSingle();
    if (!cg?.gabarito) return { success: false, error: 'Cargo sem gabarito.' };
    const { data: colabs } = await sb.from('colaboradores').select(['id', 'nome_completo', ...candidateColumns()].join(', ')).eq('empresa_id', empresaId).eq('cargo', cargo).not('d_natural', 'is', null).not('email', 'ilike', '%@vertho.ai%');
    if (!colabs?.length) return { success: false, error: 'Sem colaboradores com DISC.' };
    const spec0 = buildRoleSpec(cg.gabarito, cargo, { ehLideranca: cg.eh_lideranca });
    const profiles = colabs.map((c: any) => buildCandidateProfile(c, cg.gabarito));
    // recuperação: ombro = p75 dos brutos (top quartil satura, resto ganha gradiente)
    if (m.tipo === 'ombro' && m.lo == null) { const br = profiles.map((p) => Number(p[tracoKey]) || 0).sort((a, b) => a - b); m.lo = Math.round(br[Math.floor(0.75 * (br.length - 1))]); }
    const specM = specComMudanca(spec0, tracoKey, m);
    const band = (r: any[], which: 'betaBand') => ['verde', 'amarelo', 'vermelho'].map((b) => r.filter((x) => x[which] === b).length);
    const rows = colabs.map((c: any, i: number) => { const p = profiles[i]; return { nome: (c.nome_completo || '').split(' ').slice(0, 2).join(' '), r0: scoreCandidate(spec0, p), rM: scoreCandidate(specM, p) }; });
    const naoBloq = rows.filter((x) => !x.r0.knockoutFailed);
    const cruzam = naoBloq.filter((x) => x.r0.betaBand !== x.rM.betaBand).map((x) => ({ nome: x.nome, de: x.r0.betaBand, para: x.rM.betaBand }));
    // PERIGO: gate destravando (bloqueado no baseline → passa depois) ou bloqueando novo
    const desbloqueados = rows.filter((x) => x.r0.knockoutFailed && !x.rM.knockoutFailed).map((x) => x.nome);
    const bloqueadosNovos = rows.filter((x) => !x.r0.knockoutFailed && x.rM.knockoutFailed).map((x) => x.nome);
    const [v0, a0, r0c] = band(rows.map((x) => x.r0), 'betaBand'); const [vM, aM, rMc] = band(rows.map((x) => x.rM), 'betaBand');
    // Spearman beta
    const sp = (() => { const A = rows.map((x) => x.r0.betaPct), B = rows.map((x) => x.rM.betaPct); const rk = (z: number[]) => { const i = z.map((v, j) => [v, j] as [number, number]).sort((p, q) => p[0] - q[0]); const o: number[] = []; i.forEach(([, j], k) => o[j] = k); return o; }; const ra = rk(A), rb = rk(B); const n = A.length, ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n; let c = 0, x2 = 0, y2 = 0; for (let i = 0; i < n; i++) { c += (ra[i] - ma) * (rb[i] - mb); x2 += (ra[i] - ma) ** 2; y2 += (rb[i] - mb) ** 2; } return x2 && y2 ? Math.round(c / Math.sqrt(x2 * y2) * 1000) / 1000 : 1; })();
    // SUGESTÃO = veredito de SEGURANÇA mecânica (lê o e-se), NÃO o "deve" clínico.
    let sugNivel: 'seguro' | 'opcional' | 'cuidado' | 'nao'; let sugTexto: string;
    if (desbloqueados.length) { sugNivel = 'nao'; sugTexto = `Não aplicar — destrava ${desbloqueados.length} gate(s) (afrouxa a eliminatória). Decisão de mesa.`; }
    else if (bloqueadosNovos.length) { sugNivel = 'cuidado'; sugTexto = `Cuidado — bloqueia ${bloqueadosNovos.length} novo(s) pelo gate (a mudança aperta a eliminatória). Confira os nomes.`; }
    else if (sp < 0.9) { sugNivel = 'cuidado'; sugTexto = `Cuidado — reordena o ranking (Spearman ${sp}). Revise quem se move antes de aplicar.`; }
    else if (cruzam.length === 0) { sugNivel = 'opcional'; sugTexto = `Seguro, mas INERTE neste grupo — não muda ninguém aqui. Aplicar corrige a forma da régua p/ grupos futuros; sem efeito agora.`; }
    else { sugNivel = 'seguro'; sugTexto = `Seguro de aplicar — re-classifica ${cruzam.length} pessoa(s), rank preservado, sem destravar gate.`; }
    return { success: true, n: rows.length, naoBloqueados: naoBloq.length, mudanca: m, dist0: { v: v0, a: a0, r: r0c }, distM: { v: vM, a: aM, r: rMc }, cruzam, desbloqueados, bloqueadosNovos, spearman: sp, sugestao: { nivel: sugNivel, texto: sugTexto } };
  } catch (e: any) { return { success: false, error: e?.message || 'Erro no e-se.' }; }
}

/**
 * APLICA a mudança de DIREÇÃO no gabarito (mutação real, GUARDADA: só após o e-se +
 * confirmação na UI). Lê o gabarito, muda a direção do traço, reescreve o objeto inteiro.
 * Só `tipo:'direcao'` — ombro/recuperação é composição (não one-field), fica fora.
 */
export async function aplicarMudancaRegua(empresaId: string, cargo: string, tracoKey: string, m: Mudanca): Promise<any> {
  try {
    if (m.tipo !== 'direcao') return { success: false, error: 'Só mudança de direção é aplicável por aqui (recuperação de ombro é decisão de mesa).' };
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    const { data: cg } = await sb.from('cargos_empresa').select('gabarito').eq('empresa_id', empresaId).eq('nome', cargo).maybeSingle();
    const g = cg?.gabarito; if (!g) return { success: false, error: 'Cargo sem gabarito.' };
    let alvo = '';
    if (['D', 'I', 'S', 'C'].includes(tracoKey)) {
      if (g.tela4?.[tracoKey]) { g.tela4[tracoKey].direcao = m.para; alvo = tracoKey; }
    } else {
      const nome = COMP_LABEL.find((c: any) => c.key === tracoKey)?.nome;
      const sub = (g.tela2?.subcompetencias || []).find((s: any) => norm(s.nome) === norm(nome));
      if (sub) { sub.direcao = m.para; alvo = sub.nome; }
    }
    if (!alvo) return { success: false, error: `Traço ${tracoKey} não encontrado no gabarito.` };
    const { error } = await sb.from('cargos_empresa').update({ gabarito: g }).eq('empresa_id', empresaId).eq('nome', cargo);
    if (error) return { success: false, error: error.message };
    return { success: true, alvo, para: m.para };
  } catch (e: any) { return { success: false, error: e?.message || 'Erro ao aplicar.' }; }
}
