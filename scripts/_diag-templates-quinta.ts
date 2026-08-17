/**
 * O CORPO real de um template aprovado, direto da Meta — antes de disparar.
 *
 * POR QUE ELE EXISTE
 * ──────────────────
 * Status e categoria já aparecem no log da R13 (`[templates-ligados]`, health
 * estrutural das 06:30 UTC). O que não aparece em lugar nenhum é o **CONTRATO**:
 * quantas variáveis o corpo aprovado tem e em que ordem. Deduzir isso do nome já
 * produziu envio com os valores trocados de lugar — o `pilula_semanal` foi
 * aprovado com `{{1}}`=formato/`{{2}}`=tema/`{{3}}`=link enquanto o código mandava
 * `[nome, semana, tema]`, e ligar sem conferir teria entregado *"Seu Maria de
 * hoje: 5"* a 36 pessoas (15/08/2026).
 *
 * ⚠️ Ele NÃO prova o que está ligado em PRODUÇÃO: as `WHATSAPP_TEMPLATE_*` são
 * *Sensitive* na Vercel e nem existem no `.env.local`. O nome aplicado vem do log
 * da R13; aqui ele pode ser passado por argumento.
 *
 * Leitura pura — sem banco, sem envio.
 *
 * USO
 *   npx tsx scripts/_diag-templates-quinta.ts                    # os 3 da cadência
 *   npx tsx scripts/_diag-templates-quinta.ts registro_desafio   # um nome específico
 */
import './_env';
import { contratoDoTemplate, templateAtivo, type PapelCadencia } from '@/lib/notifications/pilula-template';

const GRAPH = 'https://graph.facebook.com/v22.0';

async function main() {
  const waba = process.env.WABA_ID || '';
  const token = process.env.META_WHATSAPPBUSINESS_API || '';
  if (!waba || !token) throw new Error('WABA_ID/META_WHATSAPPBUSINESS_API ausentes no .env.local');

  const r = await fetch(`${GRAPH}/${waba}/message_templates?limit=200&fields=name,status,category,components`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j: any = await r.json();
  if (j?.error) throw new Error(j.error.message);

  const porNome = new Map<string, any>();
  for (const t of j.data || []) porNome.set(t.name, t);

  // As `WHATSAPP_TEMPLATE_*` são *Sensitive* na Vercel e não existem no
  // `.env.local` — o valor APLICADO em produção vem do log da R13
  // ([templates-ligados], health estrutural das 06:30 UTC). Aqui os nomes podem
  // vir por argumento, e o default é o que aquele log mostrou.
  const alvos: Array<[PapelCadencia, string]> = (
    process.argv.slice(2).filter((a) => !a.startsWith('-')).length
      ? process.argv.slice(2).filter((a) => !a.startsWith('-')).map((n) => ['evidencia' as PapelCadencia, n])
      : [['evidencia', 'registro_evidencia'], ['desafio', 'registro_desafio'], ['pilula', 'conteudo_semana']]
  );

  for (const [papel, nomeArg] of alvos) {
    const nome = templateAtivo(papel) ?? nomeArg;
    console.log(`\n═══ ${papel} → ${nome}${templateAtivo(papel) ? '' : ' (do log de produção; env local não tem)'}`);

    console.log(`   contrato mapeado no código: ${contratoDoTemplate(nome) ? 'SIM' : '🔴 NÃO (não envia)'}`);
    const t = porNome.get(nome);
    if (!t) { console.log('   🔴 a Meta não conhece este nome (envio falharia com 132001)'); continue; }

    console.log(`   status=${t.status} categoria=${t.category}`);
    for (const c of t.components || []) {
      if (c.type === 'BODY') {
        const vars = [...String(c.text).matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]);
        console.log(`   variáveis do corpo: ${vars.length ? vars.join(', ') : '(nenhuma)'}`);
        console.log('   ---');
        console.log(String(c.text).split('\n').map((l: string) => '   | ' + l).join('\n'));
        console.log('   ---');
      }
      if (c.type === 'BUTTONS') {
        console.log(`   botões: ${JSON.stringify(c.buttons)}`);
      }
    }
  }
}

main()
  .then(async () => {
    // O canal em si: inscrição do webhook e qualidade do número. Um template
    // aprovado não vale nada se o número estiver restrito.
    const { inspecionarCloudApi } = await import('@/lib/whatsapp/cloud-api');
    const s = await inspecionarCloudApi();
    console.log('\n═══ canal');
    console.log(`   configurada=${s.configurada} inscrito=${s.inscrito} apps=${s.appsInscritos.join(',') || '(nenhum)'}`);
    console.log(`   numeroOk=${s.numeroOk} qualidade=${s.qualidade} nome=${s.nomeVerificado} motivo=${s.motivo ?? '-'}`);
  })
  .catch((e) => { console.error(e); process.exit(1); });
