import { NextResponse } from 'next/server';
import { findColabByEmail, isPlatformAdmin } from '@/lib/authz';
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolveAppLocale } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { recepcaoHabilitada } from '@/lib/recepcao/flag';
import { vendasHabilitado } from '@/lib/simulador-vendas/access';
import { prontidaoLiderancaHabilitada } from '@/lib/prontidao-lideranca/habilitado';
import { acessoSimuladoresDoColaborador } from '@/lib/simuladores/acesso';
import { soAcompanhaSimuladores } from '@/lib/simuladores/papel';
import { resolverTrilhoLideranca } from '@/lib/prontidao-lideranca/trilho';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json(null);

    const data = await findColabByEmail(
      user.email,
      'id, nome_completo, foto_url, avatar_preset, role, locale, empresa_id, cargo',
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

    const [recepcaoEmpresa, vendasEmpresa, liderancaEmpresa, acessoSimuladores] = await Promise.all([
      recepcaoHabilitada((data as any)?.empresa_id), vendasHabilitado((data as any)?.empresa_id),
      // Módulo contratado → o menu do RH mostra "Prontidão para liderança".
      prontidaoLiderancaHabilitada(sbServico, (data as any)?.empresa_id),
      acessoSimuladoresDoColaborador(data),
    ]);
    // Gestor e RH ACOMPANHAM atendimento e vendas (17/09/2026): o item do menu
    // aparece com a empresa habilitada, sem depender da liberação por cargo, que
    // diz quem TREINA. O menu troca o nome do item para o de acompanhamento.
    const soAcompanha = soAcompanhaSimuladores({ role: (data as any)?.role, isPlatformAdmin: platformAdmin });
    const treinoRecepcao = recepcaoEmpresa && (platformAdmin || soAcompanha || acessoSimuladores.atendimento);
    const treinoVendas = vendasEmpresa && (platformAdmin || soAcompanha || acessoSimuladores.vendas);
    const prontidaoLideranca = liderancaEmpresa && (platformAdmin || acessoSimuladores.lideranca);

    // Simulador interativo no menu da população do trilho: líderes e futuros líderes. Só
    // quando ele de fato responde o trilho (módulo contratado, cargo liberado e
    // dentro da população do programa), com a MESMA régua da tela de
    // mapeamento; sem isso o item levaria a "não está aberto para você".
    let simuladorLideranca = false;
    if (sbServico && (data as any)?.role !== 'rh' && liderancaEmpresa && (platformAdmin || acessoSimuladores.lideranca)) {
      try {
        const { data: empresa, error } = await sbServico.from('empresas')
          .select('sys_config')
          .eq('id', (data as any).empresa_id)
          .maybeSingle();
        if (error) console.error('[api/me] configuração do simulador de liderança:', error.message);
        else if (empresa) {
          const trilho = await resolverTrilhoLideranca(sbServico, {
            id: (data as any).id,
            empresa_id: (data as any).empresa_id,
            cargo: (data as any).cargo,
            role: (data as any).role,
            email: user.email,
          }, empresa.sys_config);
          simuladorLideranca = trilho.ok;
        }
      } catch (erro: any) {
        // Na dúvida, esconde: o item levaria a uma tela que recusa.
        console.error('[api/me] trilho de liderança:', erro?.message);
      }
    }

    // O id do cadastro entrou na leitura para a régua do trilho; não sai na resposta.
    const { id: _id, ...publico } = (data || {}) as any;
    return NextResponse.json(data ? { ...publico, locale, platformAdmin, temTrilhaPossivel, treinoRecepcao, treinoVendas, prontidaoLideranca, soAcompanhaSimuladores: soAcompanha, simuladorLideranca } : {
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
