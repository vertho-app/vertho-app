/** Critérios operacionais compartilhados entre filtros, tela e relatório. */
export type EngagementBlocker = 'ativacao' | 'consumo' | 'evidencia';

export const BLOCKER_META: Record<EngagementBlocker, { label: string; action: string; guidance: string; owner: string; deadline: string }> = {
  ativacao: {
    label: 'Sem ativação', action: 'Verificar envio e acesso',
    guidance: 'Conferir o registro do envio, a validade do link e possíveis bloqueios de acesso. Se o acesso estiver funcionando, preparar um lembrete para o grupo sem atividade.',
    owner: 'Operação e gestor', deadline: 'Hoje',
  },
  consumo: {
    label: 'Consumo pendente', action: 'Apoiar a retomada do conteúdo',
    guidance: 'Verificar onde a pessoa parou, orientar a retomada e oferecer o formato disponível mais adequado. Combinar um prazo para concluir o conteúdo.',
    owner: 'Gestor', deadline: 'Próximo dia útil',
  },
  evidencia: {
    label: 'Evidência pendente', action: 'Orientar o registro da prática',
    guidance: 'Confirmar se houve dificuldade na atividade ou no registro da evidência. Reforçar a orientação da semana e combinar a entrega com o grupo.',
    owner: 'Gestor', deadline: 'Antes do próximo acompanhamento',
  },
};

export function isEngagementBlocker(value: unknown): value is EngagementBlocker {
  return value === 'ativacao' || value === 'consumo' || value === 'evidencia';
}

export function hasEngagementSignal(person: {
  abriuLink?: boolean; formatosAbertos?: unknown[]; consumiu?: boolean;
  enviouEvidencia?: boolean; conversouTutor?: boolean; deuPlay?: boolean;
}): boolean {
  return Boolean(person.abriuLink || person.formatosAbertos?.length || person.consumiu
    || person.enviouEvidencia || person.conversouTutor || person.deuPlay);
}

/** Grupos exclusivos: uma pessoa aparece na primeira etapa que falta concluir. */
export function engagementBlocker(person: Parameters<typeof hasEngagementSignal>[0]): EngagementBlocker | null {
  if (person.enviouEvidencia) return null;
  if (!hasEngagementSignal(person)) return 'ativacao';
  return person.consumiu ? 'evidencia' : 'consumo';
}

export function engagementDetailHref(empresaId: string, person?: { id?: string; week?: number }): string {
  const params = new URLSearchParams({ empresa: empresaId });
  if (person?.id) params.set('pessoa', person.id);
  if (person?.week) params.set('semana', String(person.week));
  return `/admin/engajamento?${params}#pessoas`;
}
