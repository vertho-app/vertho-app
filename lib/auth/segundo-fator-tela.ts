/**
 * Regras da tela do segundo fator (`app/segundo-fator/segundo-fator-cliente.tsx`), fora do React
 * para serem testadas com as funções reais (a suíte roda em Node, sem navegador). Módulo puro: roda
 * no navegador e recebe o cliente de auth e o `document` por parâmetro.
 *
 * Por quê (13/10/2026, primeiro cadastro do master): a pessoa digita o e-mail numa aba e abre o
 * link do e-mail em OUTRA. A aba do login percebe a sessão nova (`onAuthStateChange` do login), vai
 * sozinha para o painel e cai aqui também. As duas abas cadastravam um aparelho ao abrir, e o
 * cadastro apaga o fator pendente: a aba de trás apagou, 2 s depois, o QR que a pessoa tinha acabado
 * de ler na da frente. Ela digitou três códigos certos e ouviu "Código inválido" nas três (o servidor
 * respondia `mfa_factor_not_found`). É o caminho normal de qualquer admin, não um acaso.
 *
 * Daí as duas regras:
 *  1. só cadastra com a aba NA FRENTE; a de trás espera e, quando vier para a frente, relê tudo
 *     (nesse meio-tempo a pessoa pode ter cadastrado e confirmado na outra);
 *  2. QR trocado mesmo assim (a pessoa troca de aba no meio) é dito com esse nome, não como código
 *     inválido, porque a saída é outra: gerar um QR novo, não redigitar.
 */

export type Fator = { id: string; friendly_name?: string | null };

export type Etapa =
  | { tipo: 'carregando' }
  | { tipo: 'sem-sessao' }
  | { tipo: 'cadastrar'; factorId: string; qr: string; chave: string; reserva: boolean }
  | { tipo: 'confirmar'; fatores: Fator[] }
  | { tipo: 'pronto'; fatores: Fator[] }
  | { tipo: 'erro'; detalhe: string };

export type ResultadoDoCodigo =
  | { tipo: 'ok' }
  | { tipo: 'invalido' }
  | { tipo: 'substituido' }
  | { tipo: 'falha'; detalhe: string };

type ErroDeAuth = { message?: string; code?: string } | null;

/** O pedaço do cliente de auth do supabase-js que a tela usa. */
export interface AuthDaTela {
  getUser(): Promise<{ data: { user: unknown } }>;
  mfa: {
    getAuthenticatorAssuranceLevel(): Promise<{ data: { currentLevel: string | null } | null; error: ErroDeAuth }>;
    listFactors(): Promise<{
      data: { all: Array<{ id: string; factor_type: string; status: string }>; totp: Fator[] } | null;
      error: ErroDeAuth;
    }>;
    unenroll(params: { factorId: string }): Promise<unknown>;
    enroll(params: { factorType: 'totp'; friendlyName: string }): Promise<{
      data: { id: string; totp: { qr_code: string; secret: string } } | null;
      error: ErroDeAuth;
    }>;
    challengeAndVerify(params: { factorId: string; code: string }): Promise<{ error: ErroDeAuth }>;
  };
}

export type Visibilidade = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

/**
 * Resolve `true` quando a aba está na frente (na hora, se já estiver) e `false` se o `sinal`
 * cancelar antes: a tela saiu, e quem esperava não pode mais cadastrar nada.
 */
export function esperarAbaVisivel(doc: Visibilidade, sinal?: AbortSignal): Promise<boolean> {
  if (sinal?.aborted) return Promise.resolve(false);
  if (doc.visibilityState === 'visible') return Promise.resolve(true);
  return new Promise((resolve) => {
    const terminar = (visivel: boolean) => {
      doc.removeEventListener('visibilitychange', aoMudar);
      sinal?.removeEventListener('abort', aoCancelar);
      resolve(visivel);
    };
    const aoMudar = () => { if (doc.visibilityState === 'visible') terminar(true); };
    const aoCancelar = () => terminar(false);
    doc.addEventListener('visibilitychange', aoMudar);
    sinal?.addEventListener('abort', aoCancelar);
  });
}

const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/**
 * Nome do aparelho no Supabase, que a pessoa vê na lista quando tem mais de um. Horário de Brasília
 * (até 13/10 saía em UTC: "10:48" para um cadastro das 07:48). "reserva" separa o segundo aparelho
 * na lista e evita o `mfa_factor_name_conflict` de quem cadastra a reserva no mesmo minuto do
 * principal (o nome é único por usuário).
 */
export function nomeDoAparelho(agora: Date, reserva: boolean): string {
  return `vertho.ai${reserva ? ' reserva' : ''} ${QUANDO.format(agora).replace(',', '')}`;
}

/** Apaga o cadastro pendente (o próximo `enroll` pode falhar por ele) e cria o aparelho novo. */
export async function cadastrarAparelho(auth: AuthDaTela, agora: Date, reserva: boolean): Promise<Etapa> {
  // Sem a lista não dá para limpar o pendente, e o `enroll` seguinte falharia por ele.
  const { data: atuais, error: erroLista } = await auth.mfa.listFactors();
  if (erroLista) return { tipo: 'erro', detalhe: erroLista.message || '' };
  const pendentes = (atuais?.all || []).filter((f) => f.factor_type === 'totp' && f.status === 'unverified');
  for (const f of pendentes) await auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: nomeDoAparelho(agora, reserva) });
  if (error || !data) return { tipo: 'erro', detalhe: error?.message || '' };
  return { tipo: 'cadastrar', factorId: data.id, qr: data.totp.qr_code, chave: data.totp.secret, reserva };
}

/** O que a tela mostra ao abrir. Só cadastra (o que apaga o QR pendente de outra aba) com a aba na frente. */
export async function lerEtapa(
  auth: AuthDaTela,
  doc: Visibilidade,
  agora: () => Date,
  sinal?: AbortSignal,
): Promise<Etapa> {
  const { data: { user } } = await auth.getUser();
  if (!user) return { tipo: 'sem-sessao' };

  const [{ data: nivel, error: erroNivel }, { data: fatores, error: erroFatores }] = await Promise.all([
    auth.mfa.getAuthenticatorAssuranceLevel(),
    auth.mfa.listFactors(),
  ]);
  if (erroNivel || erroFatores || !fatores) {
    return { tipo: 'erro', detalhe: (erroNivel || erroFatores)?.message || '' };
  }
  const verificados = fatores.totp || [];
  if (nivel?.currentLevel === 'aal2') return { tipo: 'pronto', fatores: verificados };
  if (verificados.length > 0) return { tipo: 'confirmar', fatores: verificados };

  if (doc.visibilityState !== 'visible') {
    if (!(await esperarAbaVisivel(doc, sinal))) return { tipo: 'carregando' };
    return lerEtapa(auth, doc, agora, sinal);
  }
  if (sinal?.aborted) return { tipo: 'carregando' };
  return cadastrarAparelho(auth, agora(), false);
}

/** Confere o código e separa QR trocado (fator sumiu) de código errado. */
export async function confirmarCodigo(auth: AuthDaTela, factorId: string, codigo: string): Promise<ResultadoDoCodigo> {
  const { error } = await auth.mfa.challengeAndVerify({ factorId, code: codigo });
  if (!error) return { tipo: 'ok' };
  if (error.code === 'mfa_factor_not_found') return { tipo: 'substituido' };
  if (error.code === 'mfa_verification_failed' || error.code === 'mfa_challenge_expired') return { tipo: 'invalido' };
  return { tipo: 'falha', detalhe: error.message || '' };
}
