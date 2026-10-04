/**
 * Valores de reserva da leitura de evolução do RH (R-67).
 *
 * `carregarEvolucaoRH` precisa gravar ALGO quando o banco não tem o nome da
 * pessoa, a competência ou o cargo, e grava estes textos em português. A tela
 * não os imprime como estão: compara com a constante e troca pelo rótulo do
 * idioma (`RhReports.dashboard.evolution.fallback*`). O dado fica estável para
 * agrupar e ordenar, e a leitura de quem usa espanhol ou inglês não ganha uma
 * palavra em português no meio da tabela.
 *
 * Arquivo puro, sem import de servidor: a tela de cliente importa daqui.
 */
export const PARTICIPANTE_SEM_NOME = 'Participante';
export const COMPETENCIA_SEM_NOME = 'Competência';
export const CARGO_SEM_NOME_NA_EVOLUCAO = 'Cargo não informado';
