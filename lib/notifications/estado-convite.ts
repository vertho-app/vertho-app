/**
 * Decisão de qual estado o convite de push deve mostrar. Pura de propósito: a
 * ORDEM das checagens já causou um bug em produção e precisa ser testável sem
 * navegador.
 *
 * O bug (05/08): a versão original testava suporte a `PushManager` ANTES de
 * checar iOS-não-instalado. No iOS, `PushManager` não existe fora do app
 * instalado — então quem abria no Safari caía em 'sem-suporte', o componente
 * renderizava `null`, e a pessoa que mais precisava da instrução era
 * exatamente a que não via nada. Uma pessoa real abriu no iPhone, viu a home
 * limpa e o funil registrou zero eventos — indistinguível de "nunca entrou".
 */
export type EstadoConvite =
  | 'precisa-instalar'
  | 'sem-suporte'
  | 'negado'
  | 'ativo'
  | 'pode-ativar';

export interface SinaisAmbiente {
  ehIOS: boolean;
  /** rodando como app instalado (standalone) */
  instalado: boolean;
  /** `PushManager` disponível neste contexto */
  temPushManager: boolean;
  permissao: 'default' | 'granted' | 'denied';
  /** já existe inscrição registrada no navegador */
  jaInscrito: boolean;
}

export function decidirEstadoConvite(s: SinaisAmbiente): EstadoConvite {
  // 1º: iOS sem instalar. TEM que vir antes do suporte — ver o comentário no
  // topo. Inverter esta ordem reintroduz o bug de 05/08.
  if (s.ehIOS && !s.instalado) return 'precisa-instalar';

  // 2º: contexto sem push de verdade (desktop antigo, navegador in-app).
  if (!s.temPushManager) return 'sem-suporte';

  if (s.permissao === 'denied') return 'negado';
  if (s.jaInscrito) return 'ativo';
  return 'pode-ativar';
}
