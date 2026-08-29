/**
 * Dispara UM push de teste pelo núcleo real (`lib/notifications/push-core`).
 *
 * De propósito NÃO usa web-push direto: o objetivo é exercitar o caminho de
 * produção — gravar a entrega antes do envio, embutir o deliveryId no payload e
 * desligar endpoint morto. Um atalho aqui testaria outra coisa que não o produto.
 *
 * Script local (prefixo `_`): não é versionado.
 *
 * Uso:
 *   VAPID_PRIVATE_KEY=... NEXT_PUBLIC_VAPID_PUBLIC_KEY=... VAPID_SUBJECT=... \
 *     node --env-file=.env.local --import tsx scripts/_push-teste.ts
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { enviarPush } from '@/lib/notifications/push-core';

// main() em vez de top-level await: o projeto não declara "type": "module",
// então o .ts é tratado como CJS e o await de topo estoura no transform.
async function main() {
  const sb = createSupabaseAdmin();

  const { data: endpoints, error } = await sb
    .from('notification_endpoints')
    .select('colaborador_id, empresa_id, platform')
    .eq('enabled', true);

  if (error) {
    console.error('falha ao ler endpoints:', error.message);
    process.exit(1);
  }
  if (!endpoints?.length) {
    console.error('nenhum endpoint ativo');
    process.exit(1);
  }

  // `enviarPush` já envia para TODOS os endpoints da pessoa. Iterar endpoints
  // aqui a chamaria uma vez por aparelho, e quem tem 2 aparelhos receberia 2
  // notificações em CADA um. Aconteceu de verdade em 05/08. Itera-se PESSOAS.
  const porPessoa = new Map<string, any>();
  for (const ep of endpoints as any[]) {
    if (!porPessoa.has(ep.colaborador_id)) porPessoa.set(ep.colaborador_id, ep);
  }

  console.log(`endpoints ativos: ${endpoints.length} · pessoas: ${porPessoa.size}`);

  for (const ep of porPessoa.values()) {
    const r = await enviarPush({
      colaboradorId: ep.colaborador_id,
      empresaId: ep.empresa_id,
      kind: 'teste',
      titulo: 'Sua semana abriu',
      corpo: 'Toque para ver o conteúdo desta semana.',
      url: 'https://teste-piloto.vertho.ai/dashboard/perfil',
      dedupeKey: `teste:${ep.colaborador_id}:${process.argv[2] || '1'}`,
    });
    console.log(`[${ep.platform}]`, JSON.stringify(r));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('erro:', e?.message || e);
  process.exit(1);
});
