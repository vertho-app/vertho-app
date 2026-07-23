import { describe, expect, it } from 'vitest';
import { buildBehavioralReportPrompt } from '@/lib/prompts/behavioral-report-prompt';
import {
  BEHAVIORAL_REPORT_SCHEMA_VERSION,
  isCurrentBehavioralReport,
} from '@/lib/behavioral-report-schema';

const reportInput = {
  nome: 'Ana Teste',
  perfil_dominante: 'D',
  disc_natural: { D: 70, I: 50, S: 40, C: 40 },
  lideranca: { executivo: 35, motivador: 25, metodico: 20, sistematico: 20 },
  tipo_psicologico: { tipo: 'ENT', extroversao: 55, intuicao: 60, pensamento: 50 },
  competencias: [{ nome: 'Ousadia', natural: 67.3 }],
};

describe('relatório comportamental natural-only', () => {
  it('não inclui o perfil adaptado no prompt nem no contrato JSON', () => {
    const prompt = buildBehavioralReportPrompt(reportInput);
    expect(prompt.toLowerCase()).not.toContain('adaptad');
    expect(prompt).toContain('DISC Natural');
    expect(prompt).toContain('Ousadia: 67.3');
  });

  it('rejeita caches anteriores à versão natural-only', () => {
    expect(isCurrentBehavioralReport({ sintese_perfil: 'legado' })).toBe(false);
    expect(isCurrentBehavioralReport({
      _schema_version: BEHAVIORAL_REPORT_SCHEMA_VERSION,
      sintese_perfil: 'atual',
    })).toBe(true);
  });
});
