'use server';

import { after } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

/**
 * Salva os resultados do mapeamento comportamental DISC no Supabase.
 * Todas as métricas em colunas separadas para facilitar queries e relatórios.
 */
export async function salvarPerfilComportamental(email, resultados) {
  if (!email || !resultados) {
    return { success: false, error: 'Dados incompletos' };
  }

  // Resolver o colaborador via tenant. Update por ID, não por email
  // (mesmo email pode existir em múltiplas empresas).
  const colab = await findColabByEmail(email, 'id');
  if (!colab) return { success: false, error: 'Colaborador não encontrado' };

  const sb = createSupabaseAdmin();
  const { disc, dA, lead, comp, profile, learnPrefs } = resultados;

  const { error } = await sb.from('colaboradores')
    .update({
      // Perfil
      perfil_dominante: profile,

      // DISC Natural
      d_natural: Math.round(disc.D),
      i_natural: Math.round(disc.I),
      s_natural: Math.round(disc.S),
      c_natural: Math.round(disc.C),

      // DISC Adaptado
      d_adaptado: Math.round(dA.D),
      i_adaptado: Math.round(dA.I),
      s_adaptado: Math.round(dA.S),
      c_adaptado: Math.round(dA.C),

      // Liderança
      lid_executivo: Math.round(lead.Executivo * 10) / 10,
      lid_motivador: Math.round(lead.Motivador * 10) / 10,
      lid_metodico: Math.round(lead.Metódico ?? lead.Metodico ?? 0),
      lid_sistematico: Math.round(lead.Sistemático ?? lead.Sistematico ?? 0),

      // 16 Competências
      comp_ousadia: Math.round(comp.Ousadia ?? comp['Ousadia'] ?? 0),
      comp_comando: Math.round(comp.Comando ?? 0),
      comp_objetividade: Math.round(comp.Objetividade ?? 0),
      comp_assertividade: Math.round(comp.Assertividade ?? 0),
      comp_persuasao: Math.round(comp['Persuasão'] ?? comp.Persuasao ?? 0),
      comp_extroversao: Math.round(comp['Extroversão'] ?? comp.Extroversao ?? 0),
      comp_entusiasmo: Math.round(comp.Entusiasmo ?? 0),
      comp_sociabilidade: Math.round(comp.Sociabilidade ?? 0),
      comp_empatia: Math.round(comp.Empatia ?? 0),
      comp_paciencia: Math.round(comp['Paciência'] ?? comp.Paciencia ?? 0),
      comp_persistencia: Math.round(comp['Persistência'] ?? comp.Persistencia ?? 0),
      comp_planejamento: Math.round(comp.Planejamento ?? 0),
      comp_organizacao: Math.round(comp['Organização'] ?? comp.Organizacao ?? 0),
      comp_detalhismo: Math.round(comp.Detalhismo ?? 0),
      comp_prudencia: Math.round(comp['Prudência'] ?? comp.Prudencia ?? 0),
      comp_concentracao: Math.round(comp['Concentração'] ?? comp.Concentracao ?? 0),

      // Preferências de aprendizagem (1-5)
      pref_video_curto: learnPrefs?.video_short || 0,
      pref_video_longo: learnPrefs?.video_long || 0,
      pref_texto: learnPrefs?.text || 0,
      pref_audio: learnPrefs?.audio || 0,
      pref_infografico: learnPrefs?.infographic || 0,
      pref_exercicio: learnPrefs?.exercise || 0,
      pref_mentor: learnPrefs?.mentor || 0,
      pref_estudo_caso: learnPrefs?.case || 0,

      // Timestamp + JSON backup
      mapeamento_em: new Date().toISOString(),
      disc_resultados: JSON.stringify({
        lead, comp, learnPrefs,
        rawData: resultados.rawData,
      }),

      // Invalida caches de PDF/LLM (serão regerados no próximo acesso)
      comportamental_pdf_path: null,
      report_texts: null,
      report_generated_at: null,
      insights_executivos: null,
      insights_executivos_at: null,
    })
    .eq('id', colab.id);

  if (error) return { success: false, error: error.message };

  // Pós-resposta: gera textos LLM + PDF em background para que, quando o
  // colab clicar em "Relatório Completo", já esteja pronto. `after()` do
  // Next 16 garante que o trabalho seja concluído mesmo em serverless.
  after(async () => {
    try {
      const { gerarEsalvarRelatorioComportamental } = await import(
        '@/app/dashboard/perfil-comportamental/relatorio/relatorio-actions'
      );
      const result = await gerarEsalvarRelatorioComportamental({ email });
      if (result?.error) {
        console.warn('[salvarPerfilComportamental] pré-geração falhou:', result.error);
      }
    } catch (e) {
      console.warn('[salvarPerfilComportamental] pré-geração threw:', e?.message || e);
    }
  });

  return { success: true };
}
