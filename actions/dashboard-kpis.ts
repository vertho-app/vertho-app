'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { loadJornada } from '@/app/dashboard/jornada/jornada-actions';

const SEMANA_DIAS = 7;
const TOTAL_SEMANAS = 14;
const SEMANAS_IMPLEMENTACAO = [4, 8, 12];
const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * KPIs da home alinhados ao ciclo SEMANAL da capacitação. São 4 dados que
 * mudam toda semana (alguns todo dia):
 *
 * 1. Pílula da semana    — título + status
 * 2. Evidência da semana — registrada / pendente / atrasada
 * 3. Fase atual           — Fase 1-5 da jornada
 * 4. Próximo marco        — countdown em dias
 */
export async function loadHomeKpis(email: string): Promise<any> {
  try {
    if (!email) return { error: 'Não autenticado' };

    const colab = await findColabByEmail(email, 'id, empresa_id');
    if (!colab) return { error: 'Colaborador não encontrado' };

    const sb = createSupabaseAdmin();
    const agora = new Date();

    // ── Trilha + progresso (base de quase tudo) ──────────────────────────
    const { data: trilha } = await sb.from('trilhas')
      .select('id, cursos, competencia_foco')
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: progresso } = await sb.from('temporada_semana_progresso')
      .select('semana, conteudo_consumido, created_at')
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id)
      .order('semana', { ascending: false })
      .limit(1)
      .maybeSingle();

    const semanaAtual = progresso?.semana || 0;
    const cursos = Array.isArray(trilha?.cursos) ? trilha.cursos : [];
    const cursosProg = Array.isArray(progresso?.conteudo_consumido) ? progresso.conteudo_consumido : [];

    // ── 1. Pílula da semana ──────────────────────────────────────────────
    let pilula = null;
    if (semanaAtual > 0) {
      // Tenta achar curso específico da semana; se não houver, usa o índice
      const cursoSemana = cursos[semanaAtual - 1] || null;
      const concluida = cursosProg.some(p => p?.semana === semanaAtual && p?.concluido);
      pilula = {
        titulo: cursoSemana?.nome || `Pílula da semana ${semanaAtual}`,
        semana: semanaAtual,
        status: concluida ? 'concluida' : 'em-curso',
        ehImplementacao: SEMANAS_IMPLEMENTACAO.includes(semanaAtual),
      };
    }

    // ── 2. Evidência da semana ──────────────────────────────────────────
    let evidencia = null;
    if (semanaAtual > 0 && progresso?.created_at) {
      let evid = null;
      try {
        const { data } = await sb.from('capacitacao')
          .select('id, created_at')
          .eq('colaborador_id', colab.id)
          .eq('empresa_id', colab.empresa_id)
          .eq('semana', semanaAtual)
          .eq('tipo', 'evidencia')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        evid = data;
      } catch (e) {
        console.warn('[loadHomeKpis] capacitacao query falhou (tabela pode não existir):', e?.message);
      }

      const inicioCapacitacao = new Date(progresso.created_at);
      const inicioSemana = new Date(inicioCapacitacao.getTime() + (semanaAtual - 1) * SEMANA_DIAS * MS_DIA);
      const fimSemana = new Date(inicioSemana.getTime() + SEMANA_DIAS * MS_DIA);

      if (evid) {
        evidencia = { status: 'registrada', dataRegistro: evid.created_at };
      } else if (agora >= fimSemana) {
        const diasAtraso = Math.floor((agora.getTime() - fimSemana.getTime()) / MS_DIA);
        evidencia = { status: 'atrasada', diasAtraso };
      } else {
        const diasRestantes = Math.max(0, Math.ceil((fimSemana.getTime() - agora.getTime()) / MS_DIA));
        evidencia = { status: 'pendente', diasRestantes };
      }
    }

    // ── 3. Fase atual da jornada ─────────────────────────────────────────
    let faseAtual = null;
    try {
      const jornadaR = await loadJornada();
      if (!jornadaR?.error && jornadaR?.fases?.length) {
        const fases = jornadaR.fases;
        const proxima = fases.find(f => f.status !== 'completed');
        if (proxima) {
          faseAtual = { numero: proxima.fase, titulo: proxima.titulo, status: proxima.status };
        } else {
          // Tudo concluído
          const ultima = fases[fases.length - 1];
          faseAtual = { numero: ultima.fase, titulo: ultima.titulo, status: 'completed', concluida: true };
        }
      }
    } catch (e) {
      console.warn('[loadHomeKpis] loadJornada falhou:', e?.message);
    }

    // ── 4. Próximo marco (countdown em dias) ─────────────────────────────
    let proximoMarco = null;
    if (semanaAtual > 0 && progresso?.created_at) {
      const inicio = new Date(progresso.created_at);
      const marcos = [];
      for (let s = semanaAtual + 1; s <= TOTAL_SEMANAS; s++) {
        const dataSemana = new Date(inicio.getTime() + (s - 1) * SEMANA_DIAS * MS_DIA);
        const diasAte = Math.ceil((dataSemana.getTime() - agora.getTime()) / MS_DIA);
        if (diasAte <= 0) continue;
        const ehImpl = SEMANAS_IMPLEMENTACAO.includes(s);
        const ehFim = s === TOTAL_SEMANAS;
        marcos.push({
          tipo: ehFim ? 'fim' : ehImpl ? 'implementacao' : 'pilula',
          semana: s,
          diasAte,
          label: ehFim ? 'Trilha conclui'
            : ehImpl ? 'Semana de Implementação'
            : 'Próxima pílula',
        });
      }
      // Pega o evento mais próximo no futuro
      marcos.sort((a, b) => a.diasAte - b.diasAte);
      proximoMarco = marcos[0] || null;
    }

    return {
      pilula,
      evidencia,
      fase: faseAtual,
      proximoMarco,
    };
  } catch (err) {
    console.error('[loadHomeKpis]', err);
    return { error: err?.message || 'Erro ao carregar KPIs' };
  }
}
