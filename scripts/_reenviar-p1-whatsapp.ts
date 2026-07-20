/* eslint-disable */
// REENVIO PONTUAL da P1 por WhatsApp (canal único), para o dia em que a Z-API
// caiu e `triggerDiario` gravou o carimbo mesmo sem enviar (cron-jobs.ts:370).
//
// Replica VERBATIM a resolução do cron (cron-jobs.ts:314-375): mesma query de
// fase4_envios, mesmo formato preferido, mesmo conteudos_dia[0] do temporada_plano,
// mesmo texto. NÃO aplica overlay de kit — o cron também não aplica, e o objetivo
// aqui é bater exatamente com o que já saiu por e-mail.
//
// NÃO manda e-mail (já saiu) e NÃO mexe no carimbo (já está gravado; reescrever
// só embaralharia a auditoria).
//
// Uso:  npx tsx scripts/_reenviar-p1-whatsapp.ts            → DRY-RUN (não envia)
//       npx tsx scripts/_reenviar-p1-whatsapp.ts --enviar   → envia de verdade
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { assertWhatsappAvailable } from '@/lib/whatsapp';
import { zapiProvider } from '@/lib/whatsapp/providers/zapi';
import { parsePhoneNumberFromString } from 'libphonenumber-js/core';
import metadataMax from 'libphonenumber-js/metadata.max.json' with { type: 'json' };

// ⚠️ NÃO usar sendWhatsapp()/normalizePhone() aqui: sob tsx o interop ESM/CJS
// entrega a metadata do libphonenumber como `{ default }`, o parse lança e o
// try/catch de phone.ts:23 devolve null CALADO → todo número vira "inválido".
// Em produção (bundler do Next) o interop está correto — comprovado nos logs do
// webhook. Então validamos aqui pela API `core` com metadata explícita e
// despachamos direto no zapiProvider (que só faz digits()), preservando o mesmo
// comportamento de envio. Sem failover WaSender — não está configurado.
function validarE164(v: string): string | null {
  const p = parsePhoneNumberFromString('+' + String(v).replace(/\D/g, ''), undefined, metadataMax as any);
  return p && p.isValid() ? p.number.replace('+', '') : null;
}
import { templateWhatsAppPilula } from '@/lib/notifications';
import { textoPilulaWhatsapp } from '@/lib/notifications/pilula-envio';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { tenantUrl } from '@/lib/domain';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // ibipeba
const SLUG = 'ibipeba';
const DIA = process.env.P1_DIA || new Date().toISOString().slice(0, 10);
const ENVIAR = process.argv.includes('--enviar');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('slug, is_demo').eq('id', EMP).single();
  if (!emp) throw new Error('empresa não encontrada');
  if (emp.is_demo) throw new Error('ABORT: tenant is_demo — não envia comunicação real');
  if (emp.slug !== SLUG) throw new Error(`ABORT: slug inesperado (${emp.slug})`);

  const baseUrl = tenantUrl(SLUG);
  const tdb = tenantDb(EMP);

  // Mesma query do cron.
  const { data: envios } = await tdb.from('fase4_envios')
    .select('id, colaborador_id, semana_atual, status, ultima_pilula1_em, colaboradores!inner(nome_completo, whatsapp, telefone, email, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso)')
    .eq('status', 'ativo');
  if (!envios?.length) throw new Error('nenhum envio ativo');

  // Só quem foi carimbado NO DIA da falha — o carimbo é a prova de que o cron
  // passou por essa linha e, portanto, de que o e-mail correspondente saiu.
  const alvos = (envios as any[]).filter(
    (e) => e.ultima_pilula1_em && String(e.ultima_pilula1_em).slice(0, 10) === DIA
  );

  console.log(`empresa=${SLUG} dia=${DIA} ativos=${envios.length} carimbados_no_dia=${alvos.length}`);
  console.log(ENVIAR ? '>>> MODO ENVIO <<<\n' : '>>> DRY-RUN (nada será enviado) <<<\n');

  if (ENVIAR) await assertWhatsappAvailable(); // falha cedo se a Z-API caiu de novo

  let ok = 0, falhas = 0, semTelefone = 0, semConteudo = 0, invalidos = 0;
  const erros: string[] = [];

  for (const envio of alvos) {
    const c = envio.colaboradores;
    const nome = c.nome_completo || 'Colaborador';
    const telefoneRaw = c.whatsapp || c.telefone;
    if (!telefoneRaw) { semTelefone++; console.log(`  ⚠️  ${nome}: sem telefone`); continue; }
    const telefone = validarE164(telefoneRaw);
    if (!telefone) { invalidos++; console.log(`  ⚠️  ${nome}: telefone INVÁLIDO (${telefoneRaw}) — pulado`); continue; }

    const semana = envio.semana_atual || 1;
    const formatoPref = derivarPrioridadeFormatos(c)[0];

    // conteudos_dia[0] do temporada_plano — idêntico ao cron.
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
    if (!item) { semConteudo++; console.log(`  ⚠️  ${nome}: sem conteudos_dia[0] (semana ${semana})`); continue; }

    const mensagem = templateWhatsAppPilula(
      nome, semana,
      textoPilulaWhatsapp(item, { formato: formatoPref, semana, baseUrl, pilula: 1 })
    );

    if (!ENVIAR) {
      console.log(`── ${nome} | ${telefone} | sem ${semana} | fmt ${formatoPref}`);
      console.log(mensagem.split('\n').map((l) => '   ' + l).join('\n'));
      console.log('');
      ok++;
      continue;
    }

    const r = await zapiProvider.send({ kind: 'text', phone: telefone, text: mensagem });
    if (r.ok) { ok++; console.log(`  ✅ ${nome}`); }
    else { falhas++; erros.push(`${nome}: ${r.reason}`); console.log(`  ❌ ${nome}: ${r.reason}`); }

    await new Promise((res) => setTimeout(res, 2000)); // ~2s/msg, mesmo ritmo do QStash
  }

  console.log(`\nRESUMO ${ENVIAR ? '(envio)' : '(dry-run)'}: ok=${ok} falhas=${falhas} invalidos=${invalidos} sem_telefone=${semTelefone} sem_conteudo=${semConteudo}`);
  if (erros.length) console.log('falhas:\n' + erros.map((e) => '  - ' + e).join('\n'));
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
