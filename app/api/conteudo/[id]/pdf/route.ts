import { NextResponse } from 'next/server';
import { gerarConteudoFinalPersonalizado } from '@/actions/conteudos';
import { requireUser, assertColabAccess } from '@/lib/auth/request-context';
import { logAdminAction } from '@/lib/audit';
import { servirComoDownload } from '@/lib/conteudo/download';

export const dynamic = 'force-dynamic';

/**
 * Entrega do PDF de conteúdo final PERSONALIZADO (DISC + PPP).
 *
 * Dois chamadores, uma régua:
 *  - **o colaborador**, que abre o PDF dele — sem parâmetro nenhum;
 *  - **quem audita** (platform admin, RH/gestor do tenant), com
 *    `?colaboradorId=` para ver o PDF **DA PESSOA**.
 *
 * 🔴 POR QUE O PARÂMETRO EXISTE (19/08/2026)
 * ─────────────────────────────────────────
 * Antes, esta rota resolvia a personalização **pela sessão de quem chamava** —
 * então o admin abrindo o "PDF da Taluana" recebia o genérico (ou o dele), com
 * cara de ser o dela. A tela do admin até avisava isso em letra miúda
 * ("versão genérica — a personalização resolve pela sessão do colaborador"), o
 * que é documentar a armadilha em vez de fechá-la. Ao ganhar um botão de
 * DOWNLOAD, o problema mudou de tamanho: um arquivo salvo no computador não
 * carrega a letra miúda junto.
 *
 * A gêmea do áudio (`../podcast`) já fazia certo desde a auditoria — e a régua é
 * a dela, deliberadamente: `assertColabAccess` autoriza o id pedido (cobre
 * platform admin, o próprio colaborador e RH/gestor do tenant) e a action relê
 * o colaborador **do banco**, nunca do payload. Duas réguas para a mesma
 * pergunta é como nasce a divergência.
 *
 * ⚠️ NÃO existe `/api/admin/conteudo/*` de propósito: rota-espelho para admin
 * foi descartada (arquivo novo somaria violações aos guards de tenant). O
 * caminho é a rota do colaborador com parâmetro AUTORIZADO.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const url = new URL(req.url);
  const pedido = url.searchParams.get('colaboradorId');
  const baixar = url.searchParams.get('download') === '1';

  try {
    // Sem `colaboradorId` (ou pedindo o próprio): comportamento de sempre — a
    // action resolve o colaborador pela sessão.
    //
    // 🔑 A rota NÃO lê `colaboradores`, e isso é escolha, não economia: quem
    // relê o colaborador do banco (e confere que ele pertence ao tenant do
    // conteúdo) é a action, num lugar só. Buscar aqui também significaria uma
    // segunda régua para a mesma pergunta — e uma leitura raw de tabela de PII
    // sem filtro de tenant, que os guards de CI acusam com razão: eu não sei o
    // tenant do alvo nesta camada, a action sabe.
    let colab: { id: string } | undefined;

    if (pedido && pedido !== auth.colaborador?.id) {
      const denied = await assertColabAccess(auth, pedido);
      if (denied) return denied;
      colab = { id: pedido };
    }

    const res = await gerarConteudoFinalPersonalizado(colab ? { contentId: id, colab } : { contentId: id });
    if (!res.url) return NextResponse.json({ error: res.error || 'conteúdo indisponível' }, { status: 404 });

    // Material NOMINAL saindo da plataforma deixa rastro. Só quando é auditoria
    // (alguém pedindo o conteúdo de OUTRA pessoa) — o colaborador abrindo o
    // próprio PDF é uso normal, não evento de auditoria.
    if (colab) {
      await logAdminAction({
        adminEmail: auth.email,
        acao: baixar ? 'conteudo.download_pdf' : 'conteudo.abrir_pdf',
        // O id, não o nome: o nome viria de uma leitura extra (ou do cliente, que
        // é falsificável). Quem audita cruza o id com o cadastro.
        alvo: colab.id,
        detalhes: { conteudoId: id, colaboradorId: colab.id, personalizado: res.personalized !== false },
        resultado: 'ok',
      });
    }

    if (baixar) {
      return servirComoDownload(res.url, url.searchParams.get('name'), 'pdf');
    }
    return NextResponse.redirect(res.url, 302);
  } catch (err: any) {
    console.error('[/api/conteudo/[id]/pdf]', err);
    return NextResponse.json({ error: 'erro ao gerar PDF' }, { status: 500 });
  }
}
