/**
 * A Prontidão para o próximo cargo está OCULTA — decisão do dono, 10/09/2026.
 *
 * Motivo, para quem for religar: a comparação hoje mede só PERFIL comportamental
 * (os quatro blocos do fit derivam do mesmo DISC), e perfil não distingue cargos
 * vizinhos — nem deveria. A leitura ficou honesta (a tela avisa quando o
 * gabarito não separa e quando os dois cargos são indistinguíveis), mas honesta
 * não é suficiente: sem uma fonte de comportamento DEMONSTRADO (cenário do
 * cargo-alvo, checkpoint do gestor com nota, desempenho da jornada), ela não
 * sustenta a decisão que o nome promete. O plano de fontes está na conversa de
 * 10/09 e em `docs/ARQUITETURA.md` §Prontidão.
 *
 * A flag mora num arquivo próprio e mínimo de propósito: é importada por client
 * components E por actions, e importar `prontidao.ts` num client arrastaria a
 * cadeia do motor de scoring para o bundle.
 *
 * ⚠️ Religar é trocar UMA constante — mas a porta fecha em DOIS pontos (tela e
 * actions), porque tela oculta não desliga endpoint: os quatro exports de
 * `actions/prontidao-cargo.ts` recusam enquanto isto for `false`.
 */
export const PRONTIDAO_VISIVEL = false;
