/**
 * Quem recebe a SAUDAÇÃO NOMINAL ("Olá, {nome}") numa célula de vídeo do Kit.
 *
 * Regra (02/10/2026): numa célula de kit nascido da regra "2 primeiros formatos das preferências"
 * (`kits.desafio.por_preferencia`), só recebe a saudação quem tem o VÍDEO entre os 2 primeiros formatos dela. O vídeo base
 * é gerado se UMA pessoa da célula o quer; a saudação, que é por pessoa, só para quem de fato vai vê-lo. Célula de kit
 * anterior à regra, ou vídeo fora de kit: todos da célula, como sempre.
 *
 * É a MESMA ordem de `derivarPrioridadeFormatos` (lib/season-engine/formato-preferido.ts): vídeo = o maior entre curto e
 * longo; desempate vídeo, texto, áudio, caso; sem nenhuma das 4 preferências = sem preferência (texto + caso, sem vídeo).
 * Vive aqui, em .mjs puro, porque o worker da Hetzner roda sem o TypeScript do app; um teste de PARIDADE
 * (tests/unit/saudacao-paridade.test.ts) trava as duas versões juntas.
 */

export const COLUNAS_PREFERENCIA = ['pref_video_curto', 'pref_video_longo', 'pref_texto', 'pref_audio', 'pref_estudo_caso'];

const n = (v) => Number(v) || 0;

export function videoNoTopDois(colab) {
  const s = {
    video: Math.max(n(colab?.pref_video_curto), n(colab?.pref_video_longo)),
    texto: n(colab?.pref_texto),
    audio: n(colab?.pref_audio),
    case: n(colab?.pref_estudo_caso),
  };
  if (s.video + s.texto + s.audio + s.case === 0) return false;
  const ordem = [['video', s.video], ['texto', s.texto], ['audio', s.audio], ['case', s.case]];
  // sort estável (Node >= 11): empate preserva a ordem acima, igual a `derivarPrioridadeFormatos`.
  const top2 = [...ordem].sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]);
  return top2.includes('video');
}

/** Das pessoas da célula, quem recebe a saudação. `porPreferencia` = o kit da célula nasceu da regra das preferências. */
export function destinatariosDaSaudacao(pessoas, porPreferencia) {
  return porPreferencia ? pessoas.filter(videoNoTopDois) : pessoas;
}
