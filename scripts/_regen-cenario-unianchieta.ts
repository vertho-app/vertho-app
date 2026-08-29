/** Regenera o cenário IA3 da UniAnchieta com o feedback do check (60pts) e
 *  re-checa com o Terra — mesmo ciclo do botão "Regenerar" do pipeline, via
 *  núcleo headless (lib/ia3-cenarios). Rodar: npx tsx scripts/_regen-cenario-unianchieta.ts */
import './_env';
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  montarContextoIA3, buildIA3SystemPrompt, buildIA3UserPrompt,
  validarRespostaIA3, montarAlternativasIA3, checkCenarioIA3Core,
} from '@/lib/ia3-cenarios';
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', 'unianchieta').single();
  const { data: cen } = await sb.from('banco_cenarios')
    .select('*')
    .eq('empresa_id', emp!.id)
    .order('created_at', { ascending: false }).limit(1).single();
  if (!cen) throw new Error('cenário não encontrado');
  console.log(`Cenário atual: "${cen.titulo}" — ${cen.nota_check}pts (${cen.status_check})`);

  // Feedback enriquecido (mesma montagem do regenerarCenario da fase1)
  const alertas = typeof cen.alertas_check === 'object' ? (cen.alertas_check || {}) : {};
  const feedbackParts = [cen.justificativa_check, cen.sugestao_check];
  if (alertas.ponto_mais_fraco) feedbackParts.push(`Ponto mais fraco: ${alertas.ponto_mais_fraco}`);
  if (Array.isArray(alertas.descritores_sem_cobertura) && alertas.descritores_sem_cobertura.length) {
    feedbackParts.push(`Descritores sem cobertura: ${alertas.descritores_sem_cobertura.join(', ')}`);
  }
  if (Array.isArray(alertas.perguntas_com_risco)) {
    alertas.perguntas_com_risco.forEach((p: any) => {
      feedbackParts.push(`P${p.numero}: ${p.problema}. Sugestão: ${p.correcao_recomendada}`);
    });
  }
  const feedbackExtra = feedbackParts.filter(Boolean).join('\n');

  const mc = await montarContextoIA3(sb, emp!.id, cen.cargo, cen.competencia_id, cen.ppp_escola_id ?? null);
  if (!('ctx' in mc)) throw new Error(mc.error);
  const { empresa, comp, descritores, contextoPPP, valores, cargoDetalhe, gabCIS } = mc.ctx;

  const system = buildIA3SystemPrompt();
  let user = buildIA3UserPrompt(empresa, cen.cargo, cargoDetalhe, comp, descritores, valores, contextoPPP, gabCIS);
  user += `\n\nFEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS):\n${feedbackExtra}`;
  user += `\n\n═══ RESTRIÇÕES INEGOCIÁVEIS DESTA RODADA ═══
1. CONTEXTO ≤ 900 CARACTERES — conte os caracteres antes de finalizar; corte até caber.
2. EXATAMENTE 2 tensões (1 central + 1 complicador). Qualquer terceira tensão citada no feedback deve SUMIR do texto, não virar "consequência".
3. Siga o mapa de cobertura sugerido pelo feedback À RISCA.
4. Corrigir NÃO é adicionar: a versão anterior falhou por EXCESSO. A nova versão deve ser MENOR que a anterior.`;

  console.log('Regenerando (Sonnet)…');
  const resposta = await callAI(system, user, {}, 6144);
  const resultado = await extractJSON(resposta);
  const norm = resultado ? validarRespostaIA3(resultado, descritores.length) : null;
  if (!norm) throw new Error('IA não retornou cenário válido');
  if (norm.errors.length) console.warn('Avisos de validação:', norm.errors.join('; '));

  const alternativas = montarAlternativasIA3(resultado, norm.cen, norm.perguntas);
  // Mesmo shape do regenerarCenario: UPDATE na row, zera os campos de check.
  const { error: updErr } = await sb.from('banco_cenarios').update({
    titulo: norm.cen.titulo || norm.titulo,
    descricao: norm.cen.contexto || norm.contexto,
    alternativas,
    nota_check: null, status_check: null, dimensoes_check: null,
    justificativa_check: null, sugestao_check: null, alertas_check: null, checked_at: null,
  }).eq('id', cen.id).eq('empresa_id', emp!.id);
  if (updErr) throw new Error(updErr.message);
  console.log(`Regenerado: "${norm.cen.titulo || norm.titulo}"`);

  console.log('Re-checando (GPT 5.6 Terra)…');
  const chk = await checkCenarioIA3Core(sb, { cenarioId: cen.id, modelo: 'gpt-5.6-terra' });
  console.log(chk.success ? `CHECK: ${chk.nota}pts (${chk.status})` : `CHECK FALHOU: ${chk.error}`);
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
