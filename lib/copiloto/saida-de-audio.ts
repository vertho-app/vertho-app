/**
 * Por que a tela inteira pode vir muda mesmo com "compartilhar áudio" marcado.
 *
 * O Windows mantém DOIS dispositivos de saída padrão ao mesmo tempo: o "Padrão"
 * (eConsole/eMultimedia) e o "Comunicação" (eCommunications). Aplicativo de
 * reunião — Teams, Meet no app, Zoom — manda a voz do outro lado para o de
 * COMUNICAÇÃO; o Chrome, ao capturar "Tela inteira", grava o loopback do
 * PADRÃO. Quando os dois apontam para aparelhos diferentes, a captura funciona
 * perfeitamente e grava silêncio: a faixa de áudio existe, o compartilhamento
 * está ativo, e nada no navegador acusa erro.
 *
 * `Medido em 11/09/2026` na máquina do Rodrigo: padrão em "Alto-falantes
 * (Realtek(R) Audio)" e comunicação em "Fones de ouvido (Realtek(R) Audio)".
 * A reunião inteira saiu só com a voz do vendedor, e o remédio que a tela
 * oferecia era recompartilhar marcando a caixa — exatamente o que ele já
 * tinha feito.
 *
 * Só vale para a superfície `monitor`. Aba (`browser`) captura o áudio do
 * renderer daquela guia e não passa pelo loopback, então não sofre disto.
 */
export type SaidaDeAudio = { padrao: string; comunicacao: string };

type DispositivoDeSaida = { kind: string; deviceId: string; label: string };

/**
 * O Chrome rotula as duas entradas sintéticas com um prefixo traduzido
 * ("Padrão - Alto-falantes", "Communications - Headset"). Comparar com ele
 * dentro faria dois nomes iguais parecerem diferentes.
 */
const PREFIXOS = /^(padr[ãa]o|default|comunica[çc][õo]es|communications)\s*[-–—:]\s*/i;

function nomeLimpo(label: unknown): string {
  return typeof label === 'string' ? label.replace(PREFIXOS, '').trim() : '';
}

/**
 * Devolve os dois aparelhos quando eles divergem, e `null` quando não há o que
 * dizer — mesmo aparelho, rótulo vazio (o navegador só revela o nome depois da
 * permissão de microfone) ou sistema sem a entrada de comunicação, que é o caso
 * de macOS e Linux. Na dúvida NÃO acusa: alarme falso aqui manda o vendedor
 * mexer no som do computador minutos antes de uma reunião.
 */
export function divergenciaDeSaida(dispositivos: unknown): SaidaDeAudio | null {
  const lista = (Array.isArray(dispositivos) ? dispositivos : []) as DispositivoDeSaida[];
  const saidas = lista.filter((item) => item?.kind === 'audiooutput');
  const padrao = nomeLimpo(saidas.find((item) => item?.deviceId === 'default')?.label);
  const comunicacao = nomeLimpo(saidas.find((item) => item?.deviceId === 'communications')?.label);
  if (!padrao || !comunicacao || padrao === comunicacao) return null;
  return { padrao, comunicacao };
}

/** A frase que nomeia os dois aparelhos, usada no aviso e no erro de captura. */
export function explicarDivergencia(saida: SaidaDeAudio): string {
  return `O Windows está com duas saídas diferentes: o som comum toca em “${saida.padrao}” `
    + `e as chamadas tocam em “${saida.comunicacao}”. Compartilhar a tela inteira grava `
    + `“${saida.padrao}”, que é onde a voz do cliente NÃO está — por isso vem silêncio mesmo `
    + 'com a caixa de áudio marcada.';
}

/** O que fazer, na ordem em que resolve mais rápido. */
export const REMEDIOS_DE_SAIDA = [
  'Em Configurações do Windows › Sistema › Som › Mais configurações de som, na aba Reprodução, '
    + 'clique no aparelho que você usa na reunião e marque as DUAS opções: “Definir como dispositivo '
    + 'padrão” e “Definir como dispositivo de comunicação padrão”.',
  'Ou entre na reunião pelo Teams no navegador e compartilhe a ABA dela com “Compartilhar áudio da '
    + 'guia”: a aba não passa pelo som do Windows, então a divergência deixa de importar.',
] as const;
