/**
 * Regras de ANEXO — puras, e num módulo que o cliente pode importar.
 *
 * Elas nasceram dentro de `lib/whatsapp/cloud-api.ts` e saíram de lá no mesmo
 * dia: aquele módulo importa `registrarEntrega` e `registrarDegradacao`, que
 * puxam o client admin do Supabase. Um `import` disso num componente
 * `'use client'` — só para saber quais extensões o `accept` do input aceita —
 * arrastaria código de servidor para o bundle do navegador.
 *
 * A régua tem que ser a MESMA nas duas pontas: o `accept` do input evita a
 * pessoa escolher o que seria recusado, e a validação do servidor é a que
 * decide (o input é escolha do cliente, e cliente não decide).
 */

export type TipoMidia = 'image' | 'audio' | 'video' | 'document';

/**
 * 🔴 O TETO É NOSSO, NÃO DA META.
 *
 * A Meta aceita 5 MB de imagem, 16 MB de áudio/vídeo e **100 MB** de documento
 * (conferido na doc oficial em 15/08/2026). Mas o corpo de uma request na Vercel
 * para em **4,5 MB** — acima disso vem 413 `FUNCTION_PAYLOAD_TOO_LARGE`, antes
 * de qualquer código nosso rodar.
 *
 * ⚠️ E o `next.config.mjs` declara `serverActions.bodySizeLimit: '15mb'`, que é
 * uma promessa que a plataforma não cumpre: funciona em dev e dá 413 em
 * produção. Config declarada não é config aplicada — quem manda aqui é a
 * hospedagem. Por isso 4 MB, com margem para o overhead do multipart, e a
 * recusa acontece ANTES do upload dizendo o número verdadeiro.
 */
export const TETO_ANEXO_BYTES = 4 * 1024 * 1024;

/** MIMEs aceitos pela Cloud API, com o teto de cada um segundo a Meta. */
export const TIPOS_MIDIA: Record<string, { tipo: TipoMidia; tetoMeta: number }> = {
  'image/jpeg': { tipo: 'image', tetoMeta: 5 * 1024 * 1024 },
  'image/png': { tipo: 'image', tetoMeta: 5 * 1024 * 1024 },
  'audio/aac': { tipo: 'audio', tetoMeta: 16 * 1024 * 1024 },
  'audio/amr': { tipo: 'audio', tetoMeta: 16 * 1024 * 1024 },
  'audio/mpeg': { tipo: 'audio', tetoMeta: 16 * 1024 * 1024 },
  'audio/mp4': { tipo: 'audio', tetoMeta: 16 * 1024 * 1024 },
  'audio/ogg': { tipo: 'audio', tetoMeta: 16 * 1024 * 1024 },
  'video/3gpp': { tipo: 'video', tetoMeta: 16 * 1024 * 1024 },
  'video/mp4': { tipo: 'video', tetoMeta: 16 * 1024 * 1024 },
  'application/pdf': { tipo: 'document', tetoMeta: 100 * 1024 * 1024 },
  'application/msword': { tipo: 'document', tetoMeta: 100 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { tipo: 'document', tetoMeta: 100 * 1024 * 1024 },
  'application/vnd.ms-excel': { tipo: 'document', tetoMeta: 100 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { tipo: 'document', tetoMeta: 100 * 1024 * 1024 },
  'application/vnd.ms-powerpoint': { tipo: 'document', tetoMeta: 100 * 1024 * 1024 },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { tipo: 'document', tetoMeta: 100 * 1024 * 1024 },
  'text/plain': { tipo: 'document', tetoMeta: 100 * 1024 * 1024 },
};

/** Para o `accept` do input — evita escolher o que seria recusado depois. */
export const MIMES_ACEITOS = Object.keys(TIPOS_MIDIA);

/**
 * ⚠️ Interface achatada, não união discriminada: com `strict: false` no
 * `tsconfig` o TypeScript não estreita união por booleano literal, e o
 * `if (!c.ok)` deixaria de dar acesso a `c.motivo`. Mesma razão do
 * `ResultadoEnvio` — está documentado lá também.
 */
export interface Classificacao {
  ok: boolean;
  /** Presente quando `ok`. */
  tipo?: TipoMidia;
  /** Presente quando `!ok` — frase para a tela, não código de erro. */
  motivo?: string;
}

/**
 * O arquivo pode ir? Decide ANTES de gastar upload — e a recusa explica o porquê
 * na linguagem de quem escolheu o arquivo, não em código de erro.
 */
export function classificarMidia(mime: string, tamanhoBytes: number): Classificacao {
  const entrada = TIPOS_MIDIA[String(mime || '').toLowerCase()];
  if (!entrada) {
    return {
      ok: false,
      motivo: `O WhatsApp não aceita este tipo de arquivo (${mime || 'desconhecido'}). Vale imagem JPG/PNG, PDF, Office, texto, áudio e vídeo.`,
    };
  }
  if (tamanhoBytes <= 0) return { ok: false, motivo: 'Arquivo vazio.' };
  if (tamanhoBytes > TETO_ANEXO_BYTES) {
    return {
      ok: false,
      motivo: `Arquivo de ${(tamanhoBytes / 1024 / 1024).toFixed(1)} MB — o limite aqui é 4 MB (restrição da nossa hospedagem, não do WhatsApp). Para algo maior, mande o link.`,
    };
  }
  return { ok: true, tipo: entrada.tipo };
}
