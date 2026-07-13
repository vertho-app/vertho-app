import { describe, it, expect } from 'vitest';
import { formatBlueprintResumo } from '@/lib/blueprint/resumo';

const bp: any = {
  spec_version: 4,
  colaborador: { nome: 'Fulana', cargo: 'Diretora' },
  foco_geral: { tese_de_desenvolvimento: 'Estruturar antes de agir.', mensagem_central: 'Planeje.' },
  competencias: [
    { nome: 'Planejamento e Organização', nivel_atual: 'N1', prioridade: 'alta', leitura: 'Ainda reativa.',
      objetivos_30_dias: [{ id: 'o1', objetivo: 'Montar plano trimestral', criterio_de_sucesso: 'plano escrito' }] },
    { nome: 'Autocuidado', nivel_atual: 'N2', prioridade: 'media', leitura: 'Sobrecarga.',
      objetivos_30_dias: [{ id: 'o2', objetivo: 'Agenda com folga', criterio_de_sucesso: 'sem overbooking' }] },
  ],
  trilha: { duracao_semanas: 14, semanas: [] },
};

describe('formatBlueprintResumo', () => {
  it('null → string vazia', () => {
    expect(formatBlueprintResumo(null)).toBe('');
  });

  it('sem competenciaFoco: traz foco geral + TODAS as competências', () => {
    const r = formatBlueprintResumo(bp);
    expect(r).toContain('Estruturar antes de agir');
    expect(r).toContain('Planejamento e Organização');
    expect(r).toContain('Autocuidado');
    expect(r).toContain('Montar plano trimestral');
  });

  it('competenciaFoco: restringe àquela competência (acento/caixa-insensível)', () => {
    const r = formatBlueprintResumo(bp, { competenciaFoco: 'planejamento e organização' });
    expect(r).toContain('Planejamento e Organização');
    expect(r).toContain('Montar plano trimestral');
    expect(r).not.toContain('Autocuidado');
    expect(r).not.toContain('Agenda com folga');
  });

  it('inclui o critério de sucesso do objetivo', () => {
    expect(formatBlueprintResumo(bp)).toContain('sucesso: plano escrito');
  });
});
