import { parsePhoneNumberFromString, type PhoneNumber } from 'libphonenumber-js/max';

/**
 * Telefone em E.164 INTERNACIONAL, persistido sem o "+" (convenção do banco e
 * exigência da Z-API): "5511912345678" (BR), "351926360862" (PT).
 *
 * Histórico: era BR-only por regex de comprimento. Isso rejeitava qualquer
 * número estrangeiro (o app roda em pt-PT desde a mig 114) e — pior — corrompia
 * calado: um celular dos EUA "12025550143" tem 11 dígitos, então caía na regra
 * "10-11 dígitos = nacional" e virava "5512025550143", um BR inexistente que
 * passava na validação e sumia no envio. Agora a validação é a do libphonenumber
 * (port oficial do Google), que conhece comprimento e faixa de cada país.
 *
 * O Brasil segue sendo o país DEFAULT: número sem indicativo é interpretado
 * como BR, então tudo que era digitado antes ("11912345678", "(11) 91234-5678")
 * continua valendo.
 */
const DEFAULT_COUNTRY = 'BR' as const;

function tryParse(input: string, country?: typeof DEFAULT_COUNTRY): PhoneNumber | null {
  try {
    return parsePhoneNumberFromString(input, country) || null;
  } catch {
    return null;
  }
}

/**
 * Interpreta a entrada do usuário. A ORDEM importa: um número nacional de 10-11
 * dígitos ("11912345678") precisa ser lido como BR antes de qualquer tentativa
 * de E.164, senão o "1" inicial vira o indicativo dos EUA.
 */
function parseAny(value: unknown): PhoneNumber | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const hadPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // "+55 11 ..." → E.164 explícito, respeita o país que o usuário declarou.
  if (hadPlus) return tryParse(`+${digits}`);

  // "0055 11 ..." → prefixo internacional discado.
  if (digits.startsWith('00')) return tryParse(`+${digits.slice(2)}`);

  // "011912345678" → prefixo de operadora antes do DDD.
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    return tryParse(digits.slice(1), DEFAULT_COUNTRY);
  }

  // Nacional sem indicativo → BR.
  if (digits.length === 10 || digits.length === 11) return tryParse(digits, DEFAULT_COUNTRY);

  // Resto: E.164 sem o "+" ("351926360862", "5511912345678").
  return tryParse(`+${digits}`);
}

/**
 * Normaliza para E.164 sem "+", ou `null` se o número não existir no plano de
 * numeração do país. Use SEMPRE antes de gravar telefone ou chamar a Z-API.
 */
export function normalizePhone(value: unknown): string | null {
  const parsed = parseAny(value);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number.replace('+', '');
}

/** Tipos que podem ter WhatsApp. Vários países não separam fixo de móvel. */
const MOBILE_TYPES = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE']);

/**
 * Valida um WhatsApp em qualquer país: precisa ser um número válido E capaz de
 * ser móvel. Retorna { valid: true, e164 } (sem "+") ou { valid: false, error }.
 */
export function validateWhatsApp(value: unknown): { valid: true; e164: string } | { valid: false; error: string } {
  if (String(value ?? '').replace(/\D/g, '').length === 0) {
    return { valid: false, error: 'WhatsApp obrigatório' };
  }

  const parsed = parseAny(value);
  if (!parsed || !parsed.isValid()) {
    return {
      valid: false,
      error: 'WhatsApp inválido. Use o número com indicativo do país (ex.: +351 926 360 862) ou, no Brasil, DDD + 9 + 8 dígitos (ex.: 11912345678).',
    };
  }

  // getType() é undefined quando o país não permite deduzir o tipo — nesse caso
  // aceitamos: rejeitar seria pior que deixar o envio falhar.
  const type = parsed.getType();
  if (type && !MOBILE_TYPES.has(type)) {
    return { valid: false, error: 'Esse número não é de celular — o WhatsApp precisa de um número móvel.' };
  }

  return { valid: true, e164: parsed.number.replace('+', '') };
}
