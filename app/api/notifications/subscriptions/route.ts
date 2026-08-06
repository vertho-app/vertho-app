/**
 * Registra (ou atualiza) a inscrição de push da instalação atual.
 *
 * `empresa_id`/`colaborador_id` saem SEMPRE da sessão, nunca do corpo: campo
 * enviado pelo cliente é escolha do cliente, e aqui isso permitiria inscrever
 * push no nome de outra pessoa.
 *
 * Upsert por (colaborador_id, installation_id): reinstalar não cria linha nova.
 * Sem isso, "quantas pessoas ativaram push?" viraria contagem de reinstalações.
 */
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import { detectarPlataforma } from '@/lib/notifications/plataforma';
import { pushHabilitado } from '@/lib/notifications/flag';
import { validarSubscription } from '@/lib/notifications/validar-subscription';
import { csrfCheck } from '@/lib/csrf';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // CSRF antes do auth, como nas demais rotas mutativas. Sem isto, uma página
  // hostil poderia POSTar a subscription DELA com o cookie da vítima e passar a
  // receber as notificações da vítima — sequestro de canal, não só métrica suja.
  const csrf = csrfCheck(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const colaboradorId = auth.colaborador?.id;
  if (!colaboradorId) {
    return NextResponse.json({ error: 'sessão sem colaborador no tenant' }, { status: 403 });
  }

  // A flag precisa gatear a ROTA, não só a renderização do convite.
  // Enquanto ela vivia só no componente, o limite de contenção era a UI — e
  // limite de UI não é limite: a rota aceitava inscrição de qualquer tenant.
  // Mesma classe de "campo de UI ≠ régua do servidor" que já mordeu este repo.
  if (!(await pushHabilitado(auth.empresaId))) {
    return NextResponse.json({ error: 'notificações não habilitadas para esta empresa' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 });
  }

  const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : '';
  const subscription = body?.subscription;

  if (!installationId || installationId.length > 100) {
    return NextResponse.json({ error: 'installationId inválido' }, { status: 400 });
  }
  const forma = validarSubscription(subscription);
  if (!forma.ok) {
    // Validar a forma aqui evita gravar uma inscrição que só falha na hora do
    // envio — quando o erro aparece longe da causa e vira "push não funciona".
    return NextResponse.json({ error: forma.motivo }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent') || '';
  const sb = createSupabaseAdmin();

  // Desativa inscrições ANTERIORES do mesmo aparelho antes de registrar a nova.
  //
  // Medido em 05/08: reinstalar o PWA zera o localStorage, gera um
  // `installation_id` novo e cria uma segunda linha — enquanto a assinatura
  // antiga continua VÁLIDA na Apple. Resultado: duas notificações no mesmo
  // aparelho, e mais uma a cada reinstalação, para sempre. Nada se auto-corrige,
  // porque endpoint vivo nunca devolve 410.
  //
  // "Mesmo aparelho" = mesmo user-agent. É heurística: dois iPhones idênticos, no
  // mesmo iOS, da mesma pessoa, desativariam um ao outro. Caso raro e reversível
  // (basta reativar), enquanto o duplicado é comum e irreversível sozinho.
  const { error: erroLimpeza } = await sb
    .from('notification_endpoints')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('colaborador_id', colaboradorId)
    .eq('user_agent', userAgent.slice(0, 400))
    .neq('installation_id', installationId);
  if (erroLimpeza) {
    // Não aborta: registrar a inscrição nova é mais importante que limpar a
    // velha. O custo de falhar aqui é notificação dobrada, não ausência dela.
    console.warn('[notifications/subscriptions] limpeza de duplicados falhou:', erroLimpeza.message);
  }

  // 🔴 AMARRAÇÃO DE IDENTIDADE — troca de usuário no mesmo aparelho.
  //
  // A assinatura de Web Push pertence ao NAVEGADOR, não à conta. Sem isto:
  // A ativa push → faz logout → B entra no mesmo aparelho. A assinatura continua
  // viva e apontando para A no banco, então as notificações de A (com o conteúdo
  // de A) aparecem na tela de B. Pior: `pushManager.subscribe()` devolve a
  // assinatura EXISTENTE em vez de criar outra, então B nunca consegue se
  // registrar e fica preso recebendo o que é de A.
  //
  // A URL do endpoint é a identidade real do aparelho: uma assinatura tem um
  // dono só, e o último login vence. Corrigir apenas no logout não bastaria —
  // logout não é garantido (navegador fechado, sessão expirada, cookie limpo,
  // aparelho passado adiante).
  const { error: erroDono } = await sb
    .from('notification_endpoints')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('subscription->>endpoint', subscription.endpoint)
    .neq('colaborador_id', colaboradorId);
  if (erroDono) {
    console.warn('[notifications/subscriptions] reassociação de dono falhou:', erroDono.message);
  }

  const { data, error } = await sb
    .from('notification_endpoints')
    .upsert(
      {
        colaborador_id: colaboradorId,
        empresa_id: auth.empresaId ?? null,
        installation_id: installationId,
        platform: detectarPlataforma(userAgent),
        provider: 'webpush',
        subscription,
        enabled: true,
        user_agent: userAgent.slice(0, 400),
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'colaborador_id,installation_id' }
    )
    .select('id')
    .single();

  if (error) {
    console.error('[notifications/subscriptions] upsert falhou:', error.message);
    return NextResponse.json({ error: 'não foi possível registrar a inscrição' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, endpointId: (data as { id: string }).id });
}
