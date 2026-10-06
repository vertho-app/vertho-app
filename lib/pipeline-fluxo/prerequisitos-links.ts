/**
 * Para onde cada pré-requisito do fluxo completo se resolve: a(s) tela(s) do admin onde a pessoa destrava o item.
 * Puro e sem dependência de servidor (a tela importa daqui no cliente). Um teste confere que TODA rota daqui existe de verdade
 * em `app/`: rota renomeada ou removida deixa de ser um link morto no painel sem ninguém perceber.
 *
 * Só entram telas do próprio admin. As variáveis de ambiente do render vivem na Vercel e no Trigger.dev, que não têm tela aqui:
 * o texto do item diz isso, e o link do render leva ao que o admin enxerga (a fila de vídeos).
 */
import type { IdPrereq } from './prerequisitos';

export interface LinkPrereq {
  rotulo: string;
  href: string;
}

export function linksDoPrerequisito(id: IdPrereq, empresaId: string): LinkPrereq[] {
  const e = encodeURIComponent(empresaId);
  switch (id) {
    case 'modulo-base':
      return [
        { rotulo: 'Catálogo de módulos-base', href: '/admin/vertho/modulos-base' },
        { rotulo: 'Cobertura por descritor', href: '/admin/vertho/modulos-base/cobertura' },
      ];
    case 'programa':
      return [
        { rotulo: 'Programa da empresa', href: `/admin/empresas/${e}/configuracoes` },
        { rotulo: 'Competências foco do cargo', href: `/admin/empresas/${e}` },
      ];
    case 'disc':
      return [{ rotulo: 'Perfis comportamentais da empresa', href: `/admin/empresas/${e}/perfis-comportamentais` }];
    case 'preferencias':
      return [{ rotulo: 'Preferências de aprendizagem', href: `/admin/preferencias-aprendizagem?empresa=${e}` }];
    case 'render':
      return [{ rotulo: 'Vídeos e fila de render', href: `/admin/videos?empresa=${e}` }];
  }
}
