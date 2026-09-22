/**
 * Contexto seguro da tela atual para o Beto interno.
 *
 * O pathname vem do navegador e, portanto, é apenas uma pista de navegação —
 * nunca autorização. Só devolvemos nomes controlados pelo servidor; ids e
 * segmentos desconhecidos não entram no prompt.
 */
export interface PaginaAtualBeto {
  rota: string;
  tela: string;
}

const PAGINAS_CONHECIDAS: Record<string, string> = {
  '/dashboard': 'Início do colaborador',
  '/dashboard/home': 'Início do colaborador',
  '/dashboard/assessment': 'Mapeamento de competências',
  '/dashboard/assessment/chat': 'Conversa do mapeamento de competências',
  '/dashboard/evolucao': 'Minha evolução',
  '/dashboard/gestor': 'Minha equipe',
  '/dashboard/gestor/engajamento': 'Engajamento da equipe',
  '/dashboard/gestor/engajamento/relatorio': 'Relatório de engajamento da equipe',
  '/dashboard/gestor/equipe-evolucao': 'Evolução da equipe',
  '/dashboard/gestor/prontidao-lideranca': 'Prontidão para liderança',
  '/dashboard/gestor/ranking': 'Ranking da equipe',
  '/dashboard/gestor/selecao': 'Seleção',
  '/dashboard/jornada': 'Minha jornada',
  '/dashboard/jornada/historico': 'Histórico da jornada',
  '/dashboard/pdi': 'Plano de desenvolvimento individual',
  '/dashboard/perfil': 'Meu perfil',
  '/dashboard/perfil-comportamental': 'Perfil comportamental',
  '/dashboard/perfil-comportamental/mapeamento': 'Mapeamento do perfil comportamental',
  '/dashboard/perfil-comportamental/relatorio': 'Relatório do perfil comportamental',
  '/dashboard/praticar': 'Praticar',
  '/dashboard/praticar/evidencia': 'Registro de evidência prática',
  '/dashboard/relatorios': 'Relatórios',
  '/dashboard/simulador-lideranca': 'Simulador de liderança',
  '/dashboard/simulador-vendas': 'Simulador de vendas',
  '/dashboard/temporada': 'Temporada atual',
  '/dashboard/temporada/concluida': 'Temporada concluída',
  '/dashboard/temporada/sem14': 'Fechamento da temporada',
  '/dashboard/treino-atendimento': 'Treino de atendimento',
  '/dashboard/votacao': 'Votação',
};

function pathnameSeguro(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const semQuery = valor.trim().split(/[?#]/, 1)[0]?.replace(/\/+$/, '') || '/';
  if (semQuery.length > 240) return null;
  if (!/^\/dashboard(?:\/[a-z0-9_-]+)*$/i.test(semQuery)) return null;
  return semQuery.toLowerCase();
}

export function resolverPaginaAtualBeto(valor: unknown): PaginaAtualBeto | null {
  const pathname = pathnameSeguro(valor);
  if (!pathname) return null;

  const conhecida = PAGINAS_CONHECIDAS[pathname];
  if (conhecida) return { rota: pathname, tela: conhecida };

  const semana = pathname.match(/^\/dashboard\/temporada\/semana\/(\d{1,2})$/);
  if (semana) {
    const numero = Number(semana[1]);
    if (numero >= 1 && numero <= 99) {
      return { rota: '/dashboard/temporada/semana/[semana]', tela: `Temporada — Semana ${numero}` };
    }
  }

  if (/^\/dashboard\/conteudo\/[a-z0-9_-]+$/.test(pathname)) {
    return { rota: '/dashboard/conteudo/[id]', tela: 'Conteúdo aberto' };
  }
  if (/^\/dashboard\/pulso\/[a-z0-9_-]+$/.test(pathname)) {
    return { rota: '/dashboard/pulso/[id]', tela: 'Pesquisa de pulso' };
  }
  if (/^\/dashboard\/jornada\/historico\/[a-z0-9_-]+$/.test(pathname)) {
    return { rota: '/dashboard/jornada/historico/[trilha]', tela: 'Detalhes de uma jornada anterior' };
  }

  // Continua útil para dizer que a pessoa está no ambiente autenticado, sem
  // colocar no prompt um segmento arbitrário controlado pelo cliente.
  return { rota: '/dashboard/[pagina]', tela: 'Área autenticada da plataforma' };
}

export function formatarPaginaAtualParaBeto(valor: unknown): string {
  const pagina = resolverPaginaAtualBeto(valor);
  if (!pagina) return '';
  return `CONTEXTO DA TELA ATUAL:
Tela: ${pagina.tela}
Rota reconhecida: ${pagina.rota}
Use a tela para entender referências como “aqui”, “esta página” ou “não consigo acessar”. Esse contexto ajuda a orientar, mas nunca concede acesso nem substitui os dados autenticados da sessão. Não invente botões, mensagens ou estados visuais que não foram fornecidos.`;
}
