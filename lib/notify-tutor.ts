/**
 * Notificações push pro Tutor (Modo Onboarding).
 *
 * Dispara WhatsApp pro tutor quando o tutorado conclui uma missão integradora
 * com sugestão de pauta de check-in. Brief: sems 4 e 7 (não a 9 — final).
 *
 * Chamado de dentro de `/api/temporada/reflection/route.ts` em background,
 * em paralelo ao trigger da acumulada parcial.
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import { enviarWhatsApp } from '@/actions/whatsapp';
import { criarPaceadorSincrono } from '@/lib/whatsapp/cadencia';

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.vertho.ai';

/** Brief seção 3.4: tutor recebe push apenas nas sems 4 e 7 (sem 9 é final). */
const SEMANAS_NOTIFY = [4, 7];

interface NotifyParams {
  trilhaId: string;
  semana: number;
  competenciasIntegradas: string[];
}

export async function notifyTutorMissaoConcluida({ trilhaId, semana, competenciasIntegradas }: NotifyParams): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  if (!SEMANAS_NOTIFY.includes(Number(semana))) {
    return { ok: false, skipped: `semana ${semana} fora da janela de notify (${SEMANAS_NOTIFY.join(',')})` };
  }

  const sb = createSupabaseAdmin();
  const { data: trilha } = await sb.from('trilhas')
    .select('colaborador_id, empresa_id, numero_temporada')
    .eq('id', trilhaId).maybeSingle();
  if (!trilha) return { ok: false, error: 'trilha não encontrada' };

  // Tutorado: nome + cargo
  const { data: tutorado } = await sb.from('colaboradores')
    .select('id, nome_completo, cargo')
    .eq('id', trilha.colaborador_id).maybeSingle();
  if (!tutorado) return { ok: false, error: 'tutorado não encontrado' };

  // Tutor: colaborador da mesma empresa com role='tutor' e tutorados_ids contém o id do tutorado.
  // Postgres array contains via .contains() — em outros lugares do código usamos `.in()` mas aqui
  // o teste é "array contém o ID", então usamos contains com array unitário.
  const { data: tutores } = await sb.from('colaboradores')
    .select('id, nome_completo, telefone')
    .eq('empresa_id', trilha.empresa_id)
    .eq('role', 'tutor')
    .contains('tutorados_ids', [tutorado.id]);

  if (!tutores?.length) {
    return { ok: false, skipped: `sem tutor vinculado ao colab ${tutorado.id}` };
  }

  // Mensagem: primeiro nome do tutor, primeiro nome do tutorado, comps, link
  const missaoNum = SEMANAS_NOTIFY.indexOf(Number(semana)) + 1; // 1 ou 2
  const tutoradoNome = (tutorado.nome_completo || '').split(' ')[0] || 'seu tutorado';

  const compsList = competenciasIntegradas.length
    ? competenciasIntegradas.map(c => `• ${c}`).join('\n')
    : '• (lista não disponível)';

  const erros: string[] = [];
  let enviados = 0;
  // Tutores de um tutorado são poucos (1-2), mas o loop é um loop: sem cadência,
  // três tutores viram três mensagens no mesmo segundo, pelo mesmo número que
  // manda a trilha inteira. Foi a GUARDA que achou este caso — nenhuma das duas
  // varreduras manuais de 11/08/2026 o tinha listado.
  const paceador = criarPaceadorSincrono();
  for (const tutor of tutores) {
    if (!tutor.telefone) { erros.push(`${tutor.nome_completo}: sem telefone`); continue; }
    const tutorNome = (tutor.nome_completo || '').split(' ')[0] || 'tutor';
    const msg = `Olá *${tutorNome}*!

*${tutoradoNome}* concluiu a Missão Integradora ${missaoNum} (semana ${semana}/10) do Onboarding.

Competências cobertas até aqui:
${compsList}

*Sugestão de pauta pro check-in:*
1. O que ${tutoradoNome} percebeu como mais difícil nessa missão?
2. Em que situação real ele(a) aplicou — e o que aconteceu?
3. O que ajustar pra próxima missão integradora?

Ver progresso → ${APP_URL}/dashboard/gestor

— Vertho Mentor IA`;

    try {
      if (paceador.tetoAtingido()) { erros.push(`${tutor.nome_completo}: adiado pelo teto de cadência`); continue; }
      await paceador.aguardarVez();
      const r = await enviarWhatsApp(tutor.telefone, msg, true);
      if (r.success) enviados++;
      else erros.push(`${tutor.nome_completo}: ${r.error}`);
    } catch (e: any) {
      erros.push(`${tutor.nome_completo}: ${e?.message || 'erro'}`);
    }
  }

  if (enviados === 0 && erros.length) return { ok: false, error: erros.join(' | ') };
  return { ok: true };
}
