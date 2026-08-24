import { redirect } from 'next/navigation';

/**
 * Seleção do RH — APOSENTADA (24/08/2026).
 *
 * A tela era 100% verbo: criar vaga, gerar o perfil ideal (IA2) e disparar a
 * avaliação dos candidatos. Pela decisão de produto de 24/08 — **a Vertho opera,
 * o cliente consome** — essas três ações são operação da plataforma e vivem em
 * `/admin/empresas/[empresaId]/selecao`, com o mesmo `SelecaoPanel`.
 *
 * O que o RH consome do módulo de Seleção continua inteiro em
 * `/dashboard/gestor/ranking`: `listarCargosComRanking()` passa `incluirVagas=true`,
 * então as VAGAS com snapshot aparecem lá, e o gate é o self-service
 * (`ctxGestor` → `reports.individual.view`, empresa da SESSÃO), permissão que o
 * papel `rh` tem. Nada de leitura se perde aqui.
 *
 * 🔴 A tela também já não funcionava. Desde o commit 7afc0c33 (H0, 23/08 23h05)
 * `requireEmpresaSupabase` exige a permissão de TODO papel — antes ela era
 * ignorada no ramo `rh`. As três actions do painel pedem `admin.access` /
 * `ai.audit.regenerate`, que o papel `rh` NÃO tem, e a cadeia do "avaliar" tem
 * mais dois gates iguais por baixo (`gerarRelatorioAdequacao`,
 * `exportarRankingPDFAdmin`). Não era um gate para afrouxar: era uma tela de
 * operação no lugar errado.
 *
 * Redireciona (em vez de sumir) para não quebrar link antigo — mesmo padrão de
 * `app/dashboard/home/page.tsx`.
 */
export default function SelecaoAposentada() {
  redirect('/dashboard/gestor/ranking');
}
