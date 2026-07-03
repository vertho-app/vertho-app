// Fachada de re-exports — o código vive em actions/fase5/* (split físico 03/07/2026).
// Mantém o caminho público '@/actions/fase5' estável para os callers.

export {
  gerarCenariosBLote,
  checkCenarioBUm,
  regenerarCenarioB,
  loadCenariosB,
  checkCenariosBLote,
  regenerarERecheckarCenariosBLote,
} from './fase5/cenarios-b';

export {
  iniciarReavaliacaoLote,
  processarReavaliacao,
} from './fase5/reavaliacao';

export {
  gerarEvolucaoFusao,
  gerarPlenariaEvolucao,
} from './fase5/evolucao';

export {
  gerarRelatoriosEvolucaoLote,
  gerarRelatorioRHManual,
  gerarRelatorioPlenaria,
  enviarLinksPerfil,
  gerarDossieGestor,
  checkCenarios,
} from './fase5/relatorios-envios';
