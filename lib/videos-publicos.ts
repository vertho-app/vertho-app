/**
 * Vídeos que a rota `/v/{guid}` mostra SEM login.
 *
 * A regra padrão do `/v/{guid}` é o contrário: quem não tem sessão vai pro
 * /login (os tutoriais de PDI, jornada e semana de missão falam de dentro do
 * produto e não fazem sentido fora dele). A exceção existe para UM caso: vídeo
 * de convite/boas-vindas, enviado por WhatsApp para quem **ainda não tem
 * acesso** — exigir login ali é pedir que a pessoa faça primeiro justamente o
 * que o vídeo está explicando.
 *
 * Allowlist explícita e por GUID, com o motivo ao lado, porque isto é abertura
 * de um gate de autenticação: tem que dar pra auditar lendo o arquivo. Não
 * generalizar (nada de "todo vídeo com título X é público") — cada entrada é
 * uma decisão consciente sobre um vídeo que alguém já assistiu inteiro e sabe
 * que não expõe dado de ninguém.
 */
export const VIDEOS_PUBLICOS: Record<string, string> = {
  // UniAnchieta · boas-vindas (entrar + mapeamento + cenários). Gravado com
  // persona FICTÍCIA em telas do app; nenhum dado de participante real aparece.
  '3bb52aa2-1d63-4507-9bb1-028e9e7565e1': 'UniAnchieta · Boas-vindas',
};

export function isVideoPublico(videoId: string): boolean {
  return Object.prototype.hasOwnProperty.call(VIDEOS_PUBLICOS, (videoId || '').toLowerCase());
}
