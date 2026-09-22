/**
 * Emissão determinística do link de acesso pedido ao Beto no WhatsApp.
 *
 * A IA nunca vê o token. Este módulo recebe uma identidade que o piloto já
 * provou por telefone + e-mail interno, escolhe o destino por regras de banco,
 * gera o magic link e entrega pelo template aprovado da Cloud API.
 */
import { APP_URL, tenantUrl } from '@/lib/domain';
import {
  ACESSO_PLATAFORMA_SLUG,
  montarParametroAcesso,
} from '@/lib/auth/magic-link-whatsapp';
import { sendAccessLink } from '@/lib/notifications/access-link-service';
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
  empresaAcmeId: string;
  email: string;
  nome: string | null;
  telefone: string;
  numeroId: string | null;
  waMessageId: string;
  vinculos: VinculoAcessoBeto[];
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

export async function enviarLinkAcessoBeto(
  entrada: EntradaLinkAcessoBeto,
  now = Date.now(),
): Promise<ResultadoLinkAcessoBeto> {
  try {
    const tdb = tenantDb(entrada.empresaAcmeId);
    const email = entrada.email.trim().toLowerCase();
    if (!/^[^@\s]+@vertho\.ai$/.test(email)) {
      return { enviou: false, motivo: 'email-interno-invalido' };
    }

    const telefones = [...new Set(
      formasDoTelefone(entrada.telefone).flatMap((fone) => [fone, `+${fone}`]),
    )];
    if (!telefones.length) return { enviou: false, motivo: 'telefone-invalido' };

    const desdeDia = new Date(now - JANELA_DIARIA_MS).toISOString();
    const [adminR, anterioresR] = await Promise.all([
      tdb.raw.from('platform_admins').select('id').eq('email', email).maybeSingle(),
      tdb.raw.from('whatsapp_mensagens_enviadas')
        .select('dedupe_key, erro, enviada_em')
        .in('to_phone', telefones)
        .like('dedupe_key', 'beto-acesso:%')
        .gte('enviada_em', desdeDia)
        .order('enviada_em', { ascending: false })
        .limit(10),
    ]);
    if (adminR.error || anterioresR.error) {
      return {
        enviou: false,
        motivo: 'falha-leitura-acesso',
        detalhe: adminR.error?.message || anterioresR.error?.message,
      };
    }

    const dedupeKey = `beto-acesso:${entrada.waMessageId}`;
    const anteriores = (anterioresR.data ?? []) as Array<any>;
    if (anteriores.some((x) => x.dedupe_key === dedupeKey)) {
      return { enviou: false, motivo: 'reentrega' };
    }
    const enviados = anteriores.filter((x) => !x.erro);
    if (enviados.some((x) => now - Date.parse(x.enviada_em) < JANELA_REENVIO_MS)) {
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
    let empresaEnvioId = entrada.empresaAcmeId;
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
