/**
 * Publish no QStash via FETCH CRU (nunca o SDK — padrão do repo, ver gêmeos em
 * actions/whatsapp-lote.ts e app/radar/actions.ts).
 *
 * Vive em `lib/` porque num arquivo `'use server'` todo export vira endpoint
 * HTTP — e o núcleo do trigger diário (lib/fase4/trigger-diario-empresa.ts)
 * não pode importar de `actions/`.
 *
 * Dois usos:
 *  - `publicarWhatsappCis`: mensagem de WhatsApp via webhook whatsapp-cis
 *    (checa saúde do provedor antes de enfileirar);
 *  - `publicarQStashTask`: task interna para uma rota worker (ex.: fan-out do
 *    trigger diário, UMA task por empresa).
 */
import { APP_WEBHOOK_URL, QSTASH_BASE_URL } from '@/lib/domain';
import { assertWhatsappAvailable } from '@/lib/whatsapp';

async function publicarQStash(caminho: string, payload: any, delaySec: number): Promise<void> {
  const qstashToken = process.env.QSTASH_TOKEN!;

  // Usa APP_WEBHOOK_URL (app.{ROOT_DOMAIN}) — APP_URL pode apontar pra raiz
  // vertho.ai que está servida pelo Gamma e retorna 405 nos endpoints API.
  const webhookUrl = `${APP_WEBHOOK_URL}${caminho}`;

  // QStash exige URL raw no path (sem encodeURIComponent) — encoded dá "invalid scheme"
  const res = await fetch(`${QSTASH_BASE_URL}/v2/publish/${webhookUrl}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${qstashToken}`,
      'Content-Type': 'application/json',
      'Upstash-Delay': `${delaySec}s`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`QStash ${res.status}: ${detail}`);
  }
}

/** Enfileira mensagem de WhatsApp no webhook whatsapp-cis. LANÇA se o canal está indisponível. */
export async function publicarWhatsappCis(payload: any, delaySec: number = 0): Promise<void> {
  if (!process.env.QSTASH_TOKEN) {
    // LANÇA — não "pula". A versão antiga deste guard dava `return` (sucesso
    // implícito) e o chamador seguia para `pilulas++` + carimbo do canal: o
    // WhatsApp da coorte inteira morria em silêncio, com o banco afirmando que
    // a pílula saiu e a /admin/engajamento reportando 100%. Lançar faz o
    // `catch` do chamador contar erro e NÃO carimbar, deixando o dia pendente
    // e visível ao pós-voo.
    throw new Error('QSTASH_TOKEN não configurado — canal WhatsApp indisponível');
  }

  await assertWhatsappAvailable();
  await publicarQStash('/api/webhooks/qstash/whatsapp-cis', payload, delaySec);
}

/** Enfileira uma task interna (rota worker própria, sem checagem de WhatsApp). */
export async function publicarQStashTask(caminho: string, payload: any): Promise<void> {
  if (!process.env.QSTASH_TOKEN) {
    throw new Error('QSTASH_TOKEN não configurado — fan-out indisponível');
  }
  await publicarQStash(caminho, payload, 0);
}
