import { NextResponse } from 'next/server';
import { findColabByEmail, isPlatformAdmin } from '@/lib/authz';
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolveAppLocale } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { recepcaoHabilitada } from '@/lib/recepcao/flag';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json(null);

    const data = await findColabByEmail(
      user.email,
      'nome_completo, foto_url, avatar_preset, role, locale, empresa_id, cargo',
    );

    /**
     * O cargo da pessoa tem competências para avaliar?
     *
     * Cargo com Top 5 vazio existe de propósito: é o cargo de ADEQUAÇÃO, que
     * entra no ranking e gere equipe, mas não faz mapeamento nem trilha. Para
     * ele, "Jornada", "Temporada" e "Evolução" são portas para tela vazia — a
     * mesma razão que já tirava essas telas do Admin da empresa. Sem este
     * campo, o menu só sabia perguntar pelo PAPEL, e o coordenador via três
     * abas que nunca teriam conteúdo.
     */
    // Um client de serviço para as duas leituras da rota (cargo e locale): a
    // allowlist do guard conta CHAMADAS de `createSupabaseAdmin`, e abrir um
    // segundo para a mesma requisição seria dívida sem contrapartida.
    const sbServico = (data as any)?.empresa_id ? createSupabaseAdmin() : null;

    let temTrilhaPossivel = true;
    if (sbServico && (data as any)?.cargo) {
      try {
        const { data: cargo, error } = await sbServico.from('cargos_empresa')
          .select('top5_workshop')
          .eq('empresa_id', (data as any).empresa_id)
          .eq('nome', (data as any).cargo)
          .maybeSingle();
        // Erro de banco NÃO esconde o menu: na dúvida, mostra. Um menu a menos
        // por falha de consulta é pior que um item que abre vazio.
        if (!error && cargo) temTrilhaPossivel = Array.isArray(cargo.top5_workshop) && cargo.top5_workshop.length > 0;
      } catch {}
    }

    // Atalho para o painel no shell do dashboard. É só EXIBIÇÃO: o gate de
    // verdade continua no layout de `/admin`, que refaz a pergunta server-side —
    // este campo não concede nada, e sem ele quem administra a plataforma entrava
    // por um tenant e não tinha caminho de volta ao painel.
    const platformAdmin = await isPlatformAdmin(user.email);

    let locale = resolveAppLocale((data as any)?.locale);
    if (sbServico) {
      try {
        const { data: empresa, error } = await sbServico
          .from('empresas')
          .select('default_locale')
          .eq('id', (data as any).empresa_id)
          .maybeSingle();
        // Sem checar, falha de banco vira "empresa sem locale padrão" e a pessoa
        // recebe o idioma de fallback sem que nada acuse.
        if (error) console.error('[api/me] locale da empresa:', error.message);
        else locale = resolveAppLocale((data as any)?.locale, empresa?.default_locale);
      } catch {}
    }

    const treinoRecepcao = await recepcaoHabilitada((data as any)?.empresa_id);
    return NextResponse.json(data ? { ...data, locale, platformAdmin, temTrilhaPossivel, treinoRecepcao } : {
      nome_completo: user.email,
      foto_url: null,
      avatar_preset: null,
      role: 'colaborador',
      locale,
      platformAdmin,
    });
  } catch (err) {
    console.error('[/api/me]', err);
    return NextResponse.json(null);
  }
}
