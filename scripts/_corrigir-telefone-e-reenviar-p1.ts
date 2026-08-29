/* eslint-disable */
// CORREÇÃO PONTUAL de telefone + REENVIO da P1 por WhatsApp, para UM colaborador.
//
// Caso de origem (27/07/2026, Ibipeba): a P1 da semana 3 saiu 08:01 BRT para 36
// pessoas; 35 foram aceitas pela Z-API e 1 deu `503 ok=false provider=-` em 3
// tentativas do QStash. Causa: o telefone estava gravado com DDI 597 (Suriname)
// em vez de 55 — um dígito trocado no cadastro. O carimbo
// `ultima_pilula1_whatsapp_em` ficou gravado assim mesmo, porque ele prova
// ENFILEIRAMENTO com provedor saudável, não entrega (F-C4 do FMEA).
//
// O que faz, nesta ordem:
//   1. valida o telefone atual (tem que bater com TEL_DE) e grava TEL_PARA;
//   2. reenvia a P1 da semana corrente por WhatsApp (só esse canal — o e-mail já saiu);
//   3. reconcilia o carimbo: timestamp real do reenvio no sucesso, NULL na falha
//      (carimbo falso é pior que carimbo ausente — cega a /admin/engajamento).
//
// Uso:  npx tsx scripts/_corrigir-telefone-e-reenviar-p1.ts            → DRY-RUN
//       npx tsx scripts/_corrigir-telefone-e-reenviar-p1.ts --executar → aplica e envia
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { assertWhatsappAvailable } from '@/lib/whatsapp';
import { zapiProvider } from '@/lib/whatsapp/providers/zapi';
import { parsePhoneNumberFromString } from 'libphonenumber-js/core';
import metadataMax from 'libphonenumber-js/metadata.max.json' with { type: 'json' };
import { templateWhatsAppPilula } from '@/lib/notifications';
import { textoPilulaWhatsapp } from '@/lib/notifications/pilula-envio';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { tenantUrl } from '@/lib/domain';

// ⚠️ NÃO usar normalizePhone() aqui: sob tsx o interop ESM/CJS entrega a metadata
// do libphonenumber como `{ default }`, o parse lança e o try/catch de phone.ts:23
// devolve null CALADO → todo número vira "inválido". Ver _reenviar-p1-whatsapp.ts.
function validarE164(v: string): string | null {
  const p = parsePhoneNumberFromString('+' + String(v).replace(/\D/g, ''), undefined, metadataMax as any);
  return p && p.isValid() ? p.number.replace('+', '') : null;
}

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // ibipeba
const SLUG = 'ibipeba';
const EMAIL_ALVO = process.env.ALVO_EMAIL || 'nilvane.amb@gmail.com';
const TEL_DE = process.env.TEL_DE || '5974988079827';   // errado (DDI 597 = Suriname)
const TEL_PARA = process.env.TEL_PARA || '5574988079827'; // certo (55 + DDD 74, Bahia)
const EXECUTAR = process.argv.includes('--executar');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('slug, is_demo').eq('id', EMP).single();
  if (!emp) throw new Error('empresa não encontrada');
  if (emp.is_demo) throw new Error('ABORT: tenant is_demo — não envia comunicação real');
  if (emp.slug !== SLUG) throw new Error(`ABORT: slug inesperado (${emp.slug})`);

  const alvoE164 = validarE164(TEL_PARA);
  if (!alvoE164) throw new Error(`ABORT: TEL_PARA (${TEL_PARA}) não é E.164 válido`);

  const tdb = tenantDb(EMP);
  const baseUrl = tenantUrl(SLUG);

  const { data: envios } = await tdb.from('fase4_envios')
    .select('id, colaborador_id, semana_atual, status, ultima_pilula1_whatsapp_em, colaboradores!inner(id, nome_completo, email, whatsapp, telefone, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso)')
    .eq('status', 'ativo');
  const envio = (envios as any[] | null)?.find((e) => e.colaboradores?.email === EMAIL_ALVO);
  if (!envio) throw new Error(`ABORT: nenhum envio ativo para ${EMAIL_ALVO}`);

  const c = envio.colaboradores;
  const atual = c.whatsapp || c.telefone;
  if (atual !== TEL_DE) throw new Error(`ABORT: telefone atual (${atual}) ≠ TEL_DE (${TEL_DE}) — cadastro mudou, revisar à mão`);
  const campo = c.whatsapp ? 'whatsapp' : 'telefone';

  // Ninguém mais pode estar com o número de destino (evita mandar pro zap de outro).
  const { data: colisao } = await tdb.from('colaboradores')
    .select('id, nome_completo').or(`telefone.eq.${alvoE164},whatsapp.eq.${alvoE164}`);
  const outro = (colisao as any[] | null)?.find((x) => x.id !== c.id);
  if (outro) throw new Error(`ABORT: ${alvoE164} já pertence a ${outro.nome_completo}`);

  const semana = envio.semana_atual || 1;
  const formatoPref = derivarPrioridadeFormatos(c)[0];

  // conteudos_dia[0] do temporada_plano — idêntico ao cron (cron-jobs.ts:327-355).
  const { data: trilha } = await tdb.from('trilhas')
    .select('temporada_plano, competencia_foco')
    .eq('colaborador_id', envio.colaborador_id)
    .order('numero_temporada', { ascending: false }).limit(1).maybeSingle();
  const plano = ((trilha as any)?.temporada_plano || []) as any[];
  const plan = plano.find((s: any) => Number(s.semana) === Number(semana)) || plano[semana - 1] || null;
  const conteudosDia = plan
    ? (Array.isArray(plan.conteudos_dia) && plan.conteudos_dia.length
        ? plan.conteudos_dia
        : (plan.conteudo ? [{ competencia: (trilha as any)?.competencia_foco, descritor: plan.descritor, conteudo: plan.conteudo }] : []))
    : [];
  const item = conteudosDia[0];
  if (!item) throw new Error(`ABORT: sem conteudos_dia[0] na semana ${semana}`);

  const nome = c.nome_completo || 'Colaborador';
  const mensagem = templateWhatsAppPilula(
    nome, semana,
    textoPilulaWhatsapp(item, { formato: formatoPref, semana, baseUrl, pilula: 1 })
  );

  console.log(`alvo=${nome} <${EMAIL_ALVO}>`);
  console.log(`telefone: ${campo} ${atual} → ${alvoE164}`);
  console.log(`semana=${semana} formato=${formatoPref} carimbo_atual=${envio.ultima_pilula1_whatsapp_em}`);
  console.log(EXECUTAR ? '\n>>> MODO EXECUÇÃO <<<\n' : '\n>>> DRY-RUN (nada será gravado nem enviado) <<<\n');
  console.log(mensagem.split('\n').map((l) => '   ' + l).join('\n'));
  if (!EXECUTAR) return;

  await assertWhatsappAvailable(); // falha cedo se a Z-API estiver fora

  const { error: errUpd } = await tdb.from('colaboradores')
    .update({ [campo]: alvoE164 }).eq('id', c.id);
  if (errUpd) throw new Error(`falha ao gravar telefone: ${errUpd.message}`);
  console.log(`\n✅ telefone corrigido (${campo} = ${alvoE164})`);

  const r = await zapiProvider.send({ kind: 'text', phone: alvoE164, text: mensagem });
  const agora = new Date().toISOString();
  await tdb.from('fase4_envios')
    .update({ ultima_pilula1_whatsapp_em: r.ok ? agora : null })
    .eq('id', envio.id);

  if (r.ok) console.log(`✅ P1 semana ${semana} reenviada por WhatsApp — carimbo = ${agora}`);
  else console.log(`❌ envio falhou: ${r.reason} — carimbo zerado (o dia continua pendente pro cron)`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
