/**
 * Marca a ABERTURA de uma notificação. Chamado pelo `notificationclick` do
 * service worker.
 *
 * Por que POST autenticado e não um GET de redirect:
 * um GET que muta estado é disparado por pré-fetcher, antivírus corporativo e
 * bots de preview de link — inclusive o do próprio WhatsApp, se a URL algum dia
 * aparecer numa mensagem. Isso inflaria `opened_at` com robô e a métrica passaria
 * a medir varredura em vez de gente. Métrica inflada é pior que métrica ausente.
 *
 * O `.eq('colaborador_id')` é o gate de POSSE — sem ele, sessão válida bastaria
 * para marcar a entrega de qualquer outra pessoa como aberta.
 *
 * Falha de rede aqui perde UMA abertura. O viés é para BAIXO (subcontagem), que
 * é o lado seguro: nunca vai inventar engajamento que não houve.
 */
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-context';
import { createSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// ⚠️ DECISÃO: esta rota NÃO usa `csrfCheck`, ao contrário das outras três.
//
// Ela é chamada pelo `notificationclick` do service worker, que autentica por
// COOKIE (o SW não tem acesso ao access token para mandar Bearer). Não está
// verificado que um POST originado de service worker carrega `Origin` ou
// `Referer` em todos os navegadores — e `csrfCheck` falha FECHADO quando não
// encontra nenhum dos dois. Ou seja: ligar o check aqui pode parar de registrar
// abertura silenciosamente, matando a única métrica de engajamento do projeto.
//
// O risco que se aceita em troca é pequeno e limitado por construção: o gate de
// posse (`.eq('colaborador_id')`) faz com que uma requisição forjada só consiga
// marcar entregas DA PRÓPRIA vítima, e o `deliveryId` é UUID não-adivinhável. O
// dano máximo é um `opened_at` falso numa linha, para quem já é dono dela.
//
// Trocar isso por um check que pode zerar a medição seria trocar um risco
// desprezível por um dano certo. Reavaliar se o SW passar a mandar Bearer.

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const colaboradorId = auth.colaborador?.id;
  if (!colaboradorId) {
    return NextResponse.json({ error: 'sessão sem colaborador no tenant' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 });
  }

  const deliveryId = typeof body?.deliveryId === 'string' ? body.deliveryId.trim() : '';
  if (!deliveryId) {
    return NextResponse.json({ error: 'deliveryId obrigatório' }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('notification_deliveries')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', deliveryId)
    .eq('colaborador_id', colaboradorId)
    .is('opened_at', null) // primeira abertura vale; reabrir não recarimba
    .select('id');

  if (error) {
    console.error('[notifications/opened] update falhou:', error.message);
    return NextResponse.json({ error: 'não foi possível registrar' }, { status: 500 });
  }

  // Zero linhas = id inexistente, de outra pessoa, ou já aberto antes. Os três
  // são não-eventos, não erros: responder 200 evita ensinar o cliente a
  // distinguir "não é seu" de "não existe" (enumeração).
  return NextResponse.json({ ok: true, registrado: (data ?? []).length > 0 });
}
