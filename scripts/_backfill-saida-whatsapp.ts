/**
 * Backfill do LADO ENVIADO da caixa, a partir da telemetria.
 *
 * POR QUE
 * ───────
 * `whatsapp_mensagens_enviadas` só passou a receber o que sai pela cadência em
 * 17/08/2026. Antes disso, tudo o que o app mandou (pílula, missão, cobrança de
 * quinta, acesso, OTP) existia apenas em `notification_deliveries` — sem texto e
 * **sem telefone**. Resultado: a caixa de entrada, mesmo com "mostrar enviadas
 * sem resposta" ligado, não tinha nenhuma conversa para mostrar, porque conversa
 * sem mensagem gravada não existe.
 *
 * 🔑 O TELEFONE VEM DO `wamid`, NÃO DO CADASTRO. O identificador que a Meta
 * devolve carrega o número REAL para onde a mensagem foi: base64, terceiro byte =
 * tamanho, seguido dos dígitos em ASCII. Ler do cadastro seria inferir "deve ter
 * ido para o telefone atual dele" — e é justamente essa suposição que falha,
 * porque a Meta normaliza o nono dígito (`5574999225966` → `557499225966`).
 *
 * ⚠️ SEM TEXTO, DE PROPÓSITO. Os parâmetros do template não foram guardados, e
 * reconstruir a frase a partir do nome/semana/tema de hoje produziria uma
 * mensagem *parecida* com a que a pessoa recebeu — que é pior que nenhuma. Fica o
 * rótulo (`template_nome` = o papel da cadência) e o status, que é exatamente o
 * que a telemetria sabe.
 *
 * ⚠️ SÓ O QUE TEM `provider_message_id`. Envio antigo por Z-API não tem wamid,
 * então não tem telefone verificável — ficaria de fora, e ficar de fora é melhor
 * que entrar com um número suposto.
 *
 * IDEMPOTENTE por construção: `uq_wa_enviadas_wamid` recusa o segundo insert do
 * mesmo wamid (23505), que é contado como "já existia".
 *
 * USO
 *   npx tsx scripts/_backfill-saida-whatsapp.ts            # dry-run
 *   npx tsx scripts/_backfill-saida-whatsapp.ts --executar
 *   -- reverter: delete from whatsapp_mensagens_enviadas where origem = 'cadencia-backfill';
 */
import './_env';
import { createSupabaseAdmin } from '@/lib/supabase';

const executar = process.argv.includes('--executar');

/** O número real do envio, lido de dentro do `wamid`. `null` se não der para ler. */
export function foneDoWamid(wamid: string | null): string | null {
  if (!wamid?.startsWith('wamid.')) return null;
  try {
    const b = Buffer.from(wamid.slice(6), 'base64');
    const tam = b[2];
    if (!tam || tam < 8 || tam > 15 || b.length < 3 + tam) return null;
    const fone = b.subarray(3, 3 + tam).toString('utf8');
    return /^\d{8,15}$/.test(fone) ? fone : null;
  } catch {
    return null;
  }
}

async function main() {
  const sb = createSupabaseAdmin();

  const { data, error } = await sb.from('notification_deliveries')
    .select('id, kind, empresa_id, colaborador_id, sent_at, provider_message_id, error, provider')
    .eq('channel', 'whatsapp')
    .not('provider_message_id', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(2000);
  if (error) throw new Error(`telemetria: ${error.message}`);

  const linhas = (data || []) as any[];
  console.log(`entregas com wamid: ${linhas.length}`);

  let semFone = 0, inseridas = 0, jaExistiam = 0, falhas = 0;

  for (const d of linhas) {
    const fone = foneDoWamid(d.provider_message_id);
    if (!fone) { semFone++; continue; }

    if (!executar) continue;

    const { error: eI } = await sb.from('whatsapp_mensagens_enviadas').insert({
      empresa_id: d.empresa_id ?? null,
      colaborador_id: d.colaborador_id ?? null,
      wa_message_id: d.provider_message_id,
      to_phone: fone,
      tipo: 'template',
      texto: null,
      // O papel da cadência é o que a telemetria registrou; o NOME do template
      // daquele dia não está gravado em lugar nenhum, e inventá-lo seria afirmar
      // o que ninguém verificou.
      template_nome: d.kind ?? null,
      autor_email: null,
      origem: 'cadencia-backfill',
      erro: d.error ?? null,
      enviada_em: d.sent_at,
    });

    if (!eI) inseridas++;
    else if ((eI as any).code === '23505') jaExistiam++;
    else { falhas++; console.error(`  ${d.provider_message_id.slice(0, 24)}…: ${eI.message}`); }
  }

  const comFone = linhas.length - semFone;
  console.log(
    executar
      ? `✓ ${inseridas} inserida(s) · ${jaExistiam} já existia(m) · ${falhas} falha(s) · ${semFone} sem telefone legível`
      : `dry-run: ${comFone} com telefone legível, ${semFone} sem. Rode com --executar.`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
