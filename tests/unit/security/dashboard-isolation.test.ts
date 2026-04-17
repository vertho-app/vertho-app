import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Testes de regressão: verificam que actions de dashboard
 * NÃO aceitam email/identidade como parâmetro.
 * Se alguém voltar a adicionar `email` como parâmetro, estes testes falham.
 */

const ROOT = path.resolve(__dirname, '../../..');

function readAction(filePath: string): string {
  return fs.readFileSync(path.join(ROOT, filePath), 'utf-8');
}

function getExportedFunctionSignatures(source: string): { name: string; params: string }[] {
  const regex = /export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/g;
  const results: { name: string; params: string }[] = [];
  let match;
  while ((match = regex.exec(source)) !== null) {
    results.push({ name: match[1], params: match[2].trim() });
  }
  return results;
}

describe('Dashboard actions — identidade não vem por parâmetro', () => {
  const actionFiles = [
    { file: 'app/dashboard/dashboard-actions.ts', functions: ['loadDashboardData'] },
    { file: 'app/dashboard/jornada/jornada-actions.ts', functions: ['loadJornada'] },
    { file: 'app/dashboard/perfil/perfil-actions.ts', functions: ['loadPerfil', 'salvarFotoPerfil', 'salvarAvatarPreset', 'removerAvatar'] },
    { file: 'app/dashboard/pdi/pdi-actions.ts', functions: ['loadPDI', 'baixarMeuPdiPdf'] },
    { file: 'app/dashboard/praticar/praticar-actions.ts', functions: ['registrarEvidencia'] },
    { file: 'actions/dashboard-kpis.ts', functions: ['loadHomeKpis'] },
    { file: 'app/dashboard/gestor/equipe-evolucao/actions.ts', functions: ['listarEquipeEvolucao', 'listarCheckpointsPendentes', 'salvarCheckpointGestor', 'loadLideradoConcluida'] },
    { file: 'app/dashboard/assessment/assessment-actions.ts', functions: ['getDiagnosticoDoDia', 'salvarRespostaDiagnostico', 'loadAssessmentData'] },
    { file: 'app/dashboard/perfil-comportamental/perfil-comportamental-actions.ts', functions: ['loadPerfilCIS', 'gerarInsightsExecutivos'] },
    { file: 'app/dashboard/perfil-comportamental/mapeamento/mapeamento-actions.ts', functions: ['salvarPerfilComportamental'] },
    { file: 'app/dashboard/perfil-comportamental/relatorio/relatorio-actions.ts', functions: ['loadBehavioralReport', 'baixarRelatorioComportamentalPdf', 'gerarEsalvarRelatorioComportamental', 'regenerarRelatorioComportamental'] },
    { file: 'app/dashboard/evolucao/evolucao-actions.ts', functions: ['loadEvolucao'] },
    { file: 'app/dashboard/colab-action.ts', functions: ['getColabByEmail'] },
  ];

  for (const { file, functions } of actionFiles) {
    describe(file, () => {
      const source = readAction(file);
      const signatures = getExportedFunctionSignatures(source);

      for (const fnName of functions) {
        it(`${fnName}() não aceita email como parâmetro de identidade`, () => {
          const sig = signatures.find(s => s.name === fnName);
          expect(sig, `Função ${fnName} não encontrada em ${file}`).toBeDefined();
          // Rejeita 'email' standalone como primeiro param (identidade do caller).
          // Permite 'colabEmail' como alvo legítimo de operação.
          expect(sig!.params).not.toMatch(/^email\b|,\s*email\b/i);
        });

        it(`${fnName}() não aceita colaboradorId como parâmetro`, () => {
          const sig = signatures.find(s => s.name === fnName);
          expect(sig!.params).not.toMatch(/\bcolaboradorId\b/i);
        });

        it(`${fnName}() não aceita empresaId como parâmetro`, () => {
          const sig = signatures.find(s => s.name === fnName);
          expect(sig!.params).not.toMatch(/\bempresaId\b/i);
        });
      }

      it('usa getAuthenticatedEmailFromAction para derivar identidade', () => {
        for (const fnName of functions) {
          expect(source).toContain('getAuthenticatedEmailFromAction');
        }
      });
    });
  }
});

describe('Dashboard pages — não passam email para actions', () => {
  const pageFiles = [
    { file: 'app/dashboard/page.tsx', calls: ['loadDashboardData', 'loadHomeKpis'] },
    { file: 'app/dashboard/jornada/page.tsx', calls: ['loadJornada'] },
    { file: 'app/dashboard/perfil/page.tsx', calls: ['loadPerfil', 'salvarFotoPerfil', 'salvarAvatarPreset', 'removerAvatar'] },
    { file: 'app/dashboard/pdi/page.tsx', calls: ['loadPDI', 'baixarMeuPdiPdf'] },
    { file: 'app/dashboard/gestor/equipe-evolucao/page.tsx', calls: ['listarEquipeEvolucao', 'listarCheckpointsPendentes'] },
    { file: 'app/dashboard/assessment/page.tsx', calls: ['getDiagnosticoDoDia', 'salvarRespostaDiagnostico'] },
    { file: 'app/dashboard/perfil-comportamental/page.tsx', calls: ['loadPerfilCIS', 'loadBehavioralReport'] },
    { file: 'app/dashboard/evolucao/page.tsx', calls: ['loadEvolucao'] },
  ];

  for (const { file, calls } of pageFiles) {
    describe(file, () => {
      const source = readAction(file);

      for (const fnName of calls) {
        it(`chamada a ${fnName}() não passa user.email`, () => {
          const callPattern = new RegExp(`${fnName}\\([^)]*user\\.email[^)]*\\)`);
          expect(source).not.toMatch(callPattern);
        });

        it(`chamada a ${fnName}() não passa userEmail`, () => {
          const callPattern = new RegExp(`${fnName}\\([^)]*userEmail[^)]*\\)`);
          expect(source).not.toMatch(callPattern);
        });
      }
    });
  }
});
