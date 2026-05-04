/**
 * Normaliza um telefone brasileiro para formato E.164 sem o "+":
 *   "5511912345678" (móvel) ou "551112345678" (fixo)
 *
 * Convenção do app: TODOS os telefones em `colaboradores.telefone` devem
 * ser salvos com o country code 55 — Z-API exige isso para envio.
 *
 * Aceita inputs nos seguintes formatos:
 *   - "(11) 91234-5678"           → "5511912345678"
 *   - "11912345678"               → "5511912345678"
 *   - "+55 11 91234-5678"         → "5511912345678"
 *   - "5511912345678"             → "5511912345678" (já normalizado)
 *   - "0011 11 91234-5678"        → "5511912345678" (00 internacional)
 *   - "011912345678"              → "5511912345678" (0 prefixo operadora)
 *
 * Retorna `null` se o input for inválido (formato/comprimento errado).
 *
 * Use sempre antes de salvar telefone no banco e antes de enviar pra Z-API.
 */
export function normalizePhoneBR(value: unknown): string | null {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;

  // Prefixo internacional 00 → remove
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Prefixo operadora "0" antes de DDD → remove
  if (
    !digits.startsWith('55') &&
    digits.startsWith('0') &&
    (digits.length === 11 || digits.length === 12)
  ) {
    digits = digits.slice(1);
  }

  // Já tem 55 e tamanho válido (12 fixo / 13 móvel) → mantém
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // 10 ou 11 dígitos (DDD + número) → prefixa 55
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  return null;
}

/**
 * Valida especificamente um WhatsApp móvel BR no formato E.164:
 *   - 13 dígitos (55 + DDD + 9 + 8 dígitos)
 *   - DDD entre 11–99
 *   - Primeiro dígito após DDD = 9 (móvel pós-2017)
 *
 * Retorna { valid: true, e164 } ou { valid: false, error }.
 */
export function validateWhatsAppBR(value: unknown): { valid: true; e164: string } | { valid: false; error: string } {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 0) return { valid: false, error: 'WhatsApp obrigatório' };

  const e164 = normalizePhoneBR(digits);
  if (!e164) {
    return { valid: false, error: `WhatsApp inválido. Esperado: DDD + 9 + 8 dígitos (ex: 11912345678).` };
  }

  // E164 do BR móvel: "55" + DDD (2) + "9" + número (8) = 13 dígitos
  if (e164.length !== 13) {
    return { valid: false, error: `WhatsApp móvel deve ter 11 dígitos (DDD + 9 + número).` };
  }

  const ddd = parseInt(e164.slice(2, 4), 10);
  if (ddd < 11 || ddd > 99) return { valid: false, error: 'DDD inválido' };

  if (e164[4] !== '9') {
    return { valid: false, error: 'WhatsApp móvel deve começar com 9 após o DDD' };
  }

  return { valid: true, e164 };
}
