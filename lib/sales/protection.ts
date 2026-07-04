// Proteção de oportunidade — 90 dias a partir do registro/aceite.
// Regra de canal: garante atribuição comercial ao RC que originou, sem
// qualquer semântica de controle de rotina.
import { PROTECTION_DAYS, PROTECTION_EXPIRING_DAYS } from './constants';
import type { ProtectionStatus } from './types';

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calcula início/fim da proteção a partir da data de registro. */
export function computeProtectionWindow(startDate: Date | string): { start: string; end: string } {
  const start = typeof startDate === 'string' ? new Date(`${startDate.slice(0, 10)}T00:00:00Z`) : startDate;
  const end = new Date(start.getTime() + PROTECTION_DAYS * 24 * 60 * 60 * 1000);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

/** Dias restantes de proteção (negativo = vencida). */
export function protectionDaysLeft(protectionEnd: string | null | undefined, today = new Date()): number | null {
  if (!protectionEnd) return null;
  const end = new Date(`${protectionEnd.slice(0, 10)}T23:59:59Z`);
  return Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Status derivado da proteção. `extended` é um estado explícito (Vertho
 * prorrogou) e só é preservado enquanto a nova janela não vencer.
 */
export function computeProtectionStatus(
  protectionEnd: string | null | undefined,
  current: ProtectionStatus = 'active',
  today = new Date(),
): ProtectionStatus {
  const left = protectionDaysLeft(protectionEnd, today);
  if (left === null) return current;
  if (left < 0) return 'expired';
  if (left <= PROTECTION_EXPIRING_DAYS) return 'expiring';
  return current === 'extended' ? 'extended' : 'active';
}

/** Alertas de vencimento (15/10/5 dias e vencida) para a área de atenção do RC. */
export function protectionAlertLabel(protectionEnd: string | null | undefined, today = new Date()): string | null {
  const left = protectionDaysLeft(protectionEnd, today);
  if (left === null) return null;
  if (left < 0) return 'Proteção vencida';
  if (left <= 5) return `Proteção vence em ${left} dia${left === 1 ? '' : 's'}`;
  if (left <= 10) return `Proteção vence em ${left} dias`;
  if (left <= 15) return `Proteção vence em ${left} dias`;
  return null;
}
