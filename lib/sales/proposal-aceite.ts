// Núcleo headless do aceite do cliente na página pública da proposta.
//
// Fica em lib/ (e não no arquivo 'use server') porque num arquivo 'use server'
// todo export vira endpoint HTTP: uma função de validação exportada de lá seria
// uma rota a mais na superfície pública, sem ganho nenhum. Aqui ela é testável
// direto, sem subir o Next.

export type DadosAceite = { nome: string; cargo: string; email: string };

export type AceiteValidado =
  | { ok: true; valor: DadosAceite }
  | { ok: false; erro: string; campo: 'nome' | 'cargo' | 'email' };

const MAX_NOME = 120;
const MAX_CARGO = 120;
const MAX_EMAIL = 160;

// Régua deliberadamente frouxa: o e-mail aqui é canal de resposta, não login.
// Rejeitar "joao@empresa.com.br " por espaço ou um TLD novo seria barrar um
// aceite real por formalidade — o que importa é não gravar lixo nem HTML.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function limpar(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Valida quem está aceitando. Os três campos são obrigatórios por decisão do
 * dono (14/09/2026): a escrita acontece SEM SESSÃO, então "alguém com o link
 * aceitou" só vira manifestação de vontade se estiver assinada por alguém.
 */
export function validarAceite(bruto: unknown): AceiteValidado {
  const b = (bruto ?? {}) as Record<string, unknown>;

  const nome = limpar(b.nome);
  if (nome.length < 3) return { ok: false, erro: 'Informe o seu nome completo.', campo: 'nome' };
  if (nome.length > MAX_NOME) return { ok: false, erro: 'Nome muito longo.', campo: 'nome' };

  const cargo = limpar(b.cargo);
  if (cargo.length < 2) return { ok: false, erro: 'Informe o seu cargo.', campo: 'cargo' };
  if (cargo.length > MAX_CARGO) return { ok: false, erro: 'Cargo muito longo.', campo: 'cargo' };

  const email = limpar(b.email).toLowerCase();
  if (!email) return { ok: false, erro: 'Informe o seu e-mail.', campo: 'email' };
  if (email.length > MAX_EMAIL) return { ok: false, erro: 'E-mail muito longo.', campo: 'email' };
  if (!EMAIL_RE.test(email)) return { ok: false, erro: 'E-mail inválido.', campo: 'email' };

  return { ok: true, valor: { nome, cargo, email } };
}

/** Primeiro IP da cadeia do proxy (o cliente); null quando não há header. */
export function ipDoCliente(headers: { get(name: string): string | null }): string | null {
  const fwd = headers.get('x-forwarded-for');
  const ip = (fwd ? fwd.split(',')[0] : '') || headers.get('x-real-ip') || '';
  return ip.trim().slice(0, 64) || null;
}
