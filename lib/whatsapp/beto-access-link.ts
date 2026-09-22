/**
 * Emissão determinística do link de acesso pedido ao Beto no WhatsApp.
 *
 * A IA nunca vê o token. Este módulo recebe uma identidade já provada pelo
 * telefone (a pessoa ESCREVEU deste número, e a Meta autentica o remetente),
 * escolhe o destino por regras de banco, gera o magic link e entrega pelo
 * template aprovado da Cloud API.
 *
 * Duas origens de identidade:
 *  - `interno`: equipe da Vertho (`@vertho.ai`), resolvida pelo piloto.
 *  - `colaborador`: qualquer colaborador cujo telefone o webhook resolveu para
 *    UMA pessoa de UMA empresa. Mesmo contrato da porta pública
 *    (`phone-magic-link/request`): só com `login_por_whatsapp`, e o e-mail da
 *    conta sai de `emailDeAcessoPorTelefone`, a régua única das portas de
 *    telefone. O link vai para o MESMO número que pediu, então o Beto não dá
 *    acesso a ninguém que a porta pública já não daria.
 */
import { APP_URL, tenantUrl } from '@/lib/domain';
import {
  ACESSO_PLATAFORMA_SLUG,
  montarParametroAcesso,
} from '@/lib/auth/magic-link-whatsapp';
import { sendAccessLink } from '@/lib/notifications/access-link-service';
import { validateWhatsApp } from '@/lib/phone';
import { emailDeAcessoPorTelefone, isProxyEmail } from '@/lib/phone-otp';
import { tenantDb } from '@/lib/tenant-db';
import { formasDoTelefone } from '@/lib/whatsapp/nono-digito';

const JANELA_REENVIO_MS = 5 * 60 * 1000;
const JANELA_DIARIA_MS = 24 * 60 * 60 * 1000;
const TETO_DIARIO = 3;

export interface VinculoAcessoBeto {
  id: string | null;
  empresaId: string | null;
  loginPorWhatsapp: boolean;
}

export interface EntradaLinkAcessoBeto {
  /** Tenant do `tenantDb` e da telemetria quando o destino é a plataforma: a
   * ACME no piloto interno, a empresa do colaborador no caminho geral. */
  empresaBaseId: string;
  email: string;
  nome: string | null;
  telefone: string;
  numeroId: string | null;
  waMessageId: string;
  vinculos: VinculoAcessoBeto[];
  /** Default `interno`: exige `@vertho.ai`. */
  origem?: 'interno' | 'colaborador';
  /** Colaborador phone-only sem e-mail no cadastro: o proxy é gravado nele
   * antes de criar a conta, como a porta pública faz. Sem isso a sessão nasce
   * com um e-mail que `findColabByEmail` não encontra. */
  gravarEmailProxyEm?: string | null;
}

export interface ResultadoLinkAcessoBeto {
  enviou: boolean;
  motivo: string;
  detalhe?: string;
}

export type DestinoLinkBeto =
  | { tipo: 'plataforma'; empresaId: null; colaboradorId: null }
  | { tipo: 'tenant'; empresaId: string; colaboradorId: string | null }
  | { tipo: 'ambiguo'; empresaId: null; colaboradorId: null };

/** Regra pura: admin vai ao painel; colaborador precisa de UM tenant habilitado. */
export function decidirDestinoLinkBeto(
  platformAdmin: boolean,
  vinculos: VinculoAcessoBeto[],
): DestinoLinkBeto {
  if (platformAdmin) return { tipo: 'plataforma', empresaId: null, colaboradorId: null };
  const habilitados = vinculos.filter((v) => v.loginPorWhatsapp && v.empresaId);
  const empresas = new Set(habilitados.map((v) => v.empresaId!));
  if (empresas.size !== 1) return { tipo: 'ambiguo', empresaId: null, colaboradorId: null };
  const empresaId = [...empresas][0]!;
  const ids = new Set(habilitados.filter((v) => v.empresaId === empresaId).map((v) => v.id).filter(Boolean));
  return {
    tipo: 'tenant',
    empresaId,
    colaboradorId: ids.size === 1 ? ([...ids][0] as string) : null,
  };
}

export type IdentidadeColaboradorAcesso =
  | {
    ok: true;
    email: string;
    nome: string | null;
    vinculos: VinculoAcessoBeto[];
    gravarEmailProxyEm: string | null;
  }
  | { ok: false; motivo: string; detalhe?: string };

/**
 * Identidade de acesso de um colaborador que o webhook resolveu pelo telefone.
 * Revalida tudo o que decide acesso, em vez de confiar no resolver: a linha é
 * deste tenant, o número que escreveu é o do cadastro e o login por WhatsApp
 * está habilitado (a mesma exigência das rotas de OTP e de link por telefone).
 */
export async function identidadeDeAcessoDoColaborador(
  empresaId: string,
  colaboradorId: string,
  telefoneRemetente: string,
): Promise<IdentidadeColaboradorAcesso> {
  try {
    const tdb = tenantDb(empresaId);
    const { data, error } = await tdb.from('colaboradores')
      .select('id, nome_completo, email, telefone, whatsapp, login_por_whatsapp')
      .eq('id', colaboradorId)
      .maybeSingle();
    if (error) return { ok: false, motivo: 'falha-leitura-colaborador', detalhe: error.message };
    const colab = data as any;
    if (!colab) return { ok: false, motivo: 'colaborador-nao-encontrado' };
    if (colab.login_por_whatsapp !== true) return { ok: false, motivo: 'login-whatsapp-desabilitado' };

    const doRemetente = new Set(formasDoTelefone(telefoneRemetente));
    const doCadastro = [colab.telefone, colab.whatsapp]
      .flatMap((t) => formasDoTelefone(String(t ?? '').replace(/\D/g, '')));
    if (!doCadastro.some((t) => doRemetente.has(t))) {
      return { ok: false, motivo: 'telefone-divergente' };
    }

    // O proxy usa o telefone de LOGIN do cadastro, como a porta pública: outra
    // forma do número geraria outro e-mail e uma segunda conta para a pessoa.
    const login = validateWhatsApp(colab.telefone);
    if (!colab.email && login.valid === false) {
      return { ok: false, motivo: 'telefone-cadastro-invalido' };
    }
    const email = emailDeAcessoPorTelefone(
      colab.email,
      empresaId,
      login.valid ? login.e164 : '',
    );
    return {
      ok: true,
      email,
      nome: colab.nome_completo ?? null,
      vinculos: [{ id: colab.id, empresaId, loginPorWhatsapp: true }],
      gravarEmailProxyEm: isProxyEmail(email) && (colab.email || '').toLowerCase() !== email ? colab.id : null,
    };
  } catch (err: any) {
    return { ok: false, motivo: 'erro-identidade-colaborador', detalhe: String(err?.message ?? err) };
  }
}

export async function enviarLinkAcessoBeto(
  entrada: EntradaLinkAcessoBeto,
  now = Date.now(),
): Promise<ResultadoLinkAcessoBeto> {
  try {
    const tdb = tenantDb(entrada.empresaBaseId);
    const origem = entrada.origem ?? 'interno';
    const email = entrada.email.trim().toLowerCase();
    if (origem === 'interno' && !/^[^@\s]+@vertho\.ai$/.test(email)) {
      return { enviou: false, motivo: 'email-interno-invalido' };
    }
    if (origem === 'colaborador' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { enviou: false, motivo: 'email-invalido' };
    }

    const telefones = [...new Set(
      formasDoTelefone(entrada.telefone).flatMap((fone) => [fone, `+${fone}`]),
    )];
    if (!telefones.length) return { enviou: false, motivo: 'telefone-invalido' };

    // Links já enviados a este número nas últimas 24 h.
    //
    // 🔴 A chave `beto-acesso:<wamid>` vive em `notification_deliveries`, e NÃO
    // em `whatsapp_mensagens_enviadas`: lá só o inbox grava `dedupe_key`
    // (`registro-saida.ts`). A versão anterior procurava lá e nunca achava nada,
    // então o intervalo de 5 min e o teto diário não seguravam link nenhum
    // (medido 22/09/2026: 7 respostas do Beto nas enviadas, 0 com chave; as
    // chaves estavam todas em deliveries). `notification_deliveries` não tem
    // telefone: o elo é o wamid da mensagem que pediu, lido nas recebidas deste
    // número.
    const desdeDia = new Date(now - JANELA_DIARIA_MS).toISOString();
    const dedupeKey = `beto-acesso:${entrada.waMessageId}`;
    const [adminR, recebidasR] = await Promise.all([
      tdb.raw.from('platform_admins').select('id').eq('email', email).maybeSingle(),
      tdb.raw.from('whatsapp_mensagens_recebidas')
        .select('wa_message_id')
        .in('from_phone', telefones)
        .gte('recebida_em', desdeDia)
        .order('recebida_em', { ascending: false })
        .limit(50),
    ]);
    if (adminR.error || recebidasR.error) {
      return {
        enviou: false,
        motivo: 'falha-leitura-acesso',
        detalhe: adminR.error?.message || recebidasR.error?.message,
      };
    }
    const chaves = [...new Set([
      dedupeKey,
      ...((recebidasR.data ?? []) as Array<any>).map((x) => `beto-acesso:${x.wa_message_id}`),
    ])];
    const anterioresR = await tdb.raw.from('notification_deliveries')
      .select('dedupe_key, status, created_at')
      .in('dedupe_key', chaves)
      .gte('created_at', desdeDia)
      .limit(60);
    if (anterioresR.error) {
      return { enviou: false, motivo: 'falha-leitura-acesso', detalhe: anterioresR.error.message };
    }

    const anteriores = (anterioresR.data ?? []) as Array<any>;
    if (anteriores.some((x) => x.dedupe_key === dedupeKey)) {
      return { enviou: false, motivo: 'reentrega' };
    }
    const enviados = anteriores.filter((x) => x.status === 'sucesso');
    if (enviados.some((x) => now - Date.parse(x.created_at) < JANELA_REENVIO_MS)) {
      return { enviou: false, motivo: 'link-recente' };
    }
    if (enviados.length >= TETO_DIARIO) {
      return { enviou: false, motivo: 'teto-diario' };
    }

    const destino = decidirDestinoLinkBeto(Boolean(adminR.data), entrada.vinculos);
    if (destino.tipo === 'ambiguo') {
      return { enviou: false, motivo: 'destino-ambiguo' };
    }

    let empresaNome = 'Vertho';
    let empresaEnvioId = entrada.empresaBaseId;
    let colaboradorId: string | null = null;
    let slugBotao = ACESSO_PLATAFORMA_SLUG;
    let origemCallback = APP_URL;
    let nextPath = '/admin-v2';

    if (destino.tipo === 'tenant') {
      const empresaR = await tdb.raw.from('empresas')
        .select('id, nome, slug')
        .eq('id', destino.empresaId)
        .maybeSingle();
      if (empresaR.error || !empresaR.data?.slug) {
        return {
          enviou: false,
          motivo: 'empresa-acesso-indisponivel',
          detalhe: empresaR.error?.message,
        };
      }
      empresaNome = empresaR.data.nome || 'Vertho';
      empresaEnvioId = destino.empresaId;
      colaboradorId = destino.colaboradorId;
      slugBotao = empresaR.data.slug;
      origemCallback = tenantUrl(slugBotao);
      nextPath = '/dashboard';
    }

    // Phone-only sem e-mail: grava o proxy ANTES de criar a conta, como a porta
    // pública. Nunca sobrescreve e-mail real (a identidade só chega aqui como
    // proxy quando o cadastro não tinha e-mail nenhum).
    if (origem === 'colaborador' && entrada.gravarEmailProxyEm && isProxyEmail(email)) {
      const { error: syncErr } = await tdb.from('colaboradores')
        .update({ email })
        .eq('id', entrada.gravarEmailProxyEm);
      if (syncErr) {
        return { enviou: false, motivo: 'falha-gravar-email-proxy', detalhe: syncErr.message };
      }
    }

    // Mesmo contrato da porta pública: só cria conta depois de provar que a
    // identidade é colaborador habilitado ou platform admin.
    try {
      const { error: createErr } = await tdb.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createErr && !/already|registered|exists/i.test(createErr.message)) {
        console.warn('[beto-acesso] createUser:', createErr.message);
      }
    } catch (err: any) {
      console.warn('[beto-acesso] createUser:', err?.message || err);
    }

    const redirectTo = new URL(nextPath, origemCallback).toString();
    const { data: linkData, error: linkErr } = await tdb.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      return {
        enviou: false,
        motivo: 'falha-gerar-link',
        detalhe: linkErr?.message || 'token ausente',
      };
    }

    const callbackLink =
      `${origemCallback}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}` +
      `&type=email&next=${encodeURIComponent(nextPath)}`;
    const acessoParam = montarParametroAcesso(slugBotao, tokenHash);
    const envio = await sendAccessLink({
      to: email,
      telefone: entrada.telefone,
      nome: (entrada.nome || '').split(' ')[0] || '',
      empresaNome,
      empresaId: empresaEnvioId,
      colaboradorId,
      locale: 'pt-BR',
      whatsappLink: callbackLink,
      acessoParam,
      tenantSlug: destino.tipo === 'tenant' ? slugBotao : null,
      channels: ['whatsapp'],
      whatsappDedupeKey: dedupeKey,
      whatsappOrigem: 'suporte-auto',
      numeroId: entrada.numeroId,
      whatsappTemplateRequired: true,
    });
    if (envio.whatsapp !== 'sent') {
      return {
        enviou: false,
        motivo: 'falha-envio-link',
        detalhe: envio.whatsappReason || 'canal não confirmou o envio',
      };
    }
    return { enviou: true, motivo: destino.tipo === 'plataforma' ? 'link-plataforma' : 'link-tenant' };
  } catch (err: any) {
    return { enviou: false, motivo: 'erro-link-acesso', detalhe: String(err?.message ?? err) };
  }
}
