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

/** Bucket dos anexos enviados pela equipe (mig 217). Privado e temporário. */
export const BUCKET_ANEXOS = 'inbox-anexos';

/**
 * Validade da URL assinada que a META vai buscar.
 *
 * Curta de propósito: é a única janela em que o arquivo de uma conversa fica
 * alcançável por quem tiver o link. A Meta baixa durante o `POST /messages` e
 * re-hospeda — depois disso a URL não serve mais para nada, e a cópia local
 * vira lixo a ser expurgado.
 */
export const TTL_LINK_SEGUNDOS = 300;

/**
 * Teto por TIPO — os limites da própria Meta (doc oficial, 15/08/2026).
 *
 * 🔴 ESTES NÚMEROS SÓ VALEM PORQUE O ARQUIVO NÃO PASSA MAIS PELA NOSSA FUNÇÃO.
 * O desenho anterior subia o binário pela Server Action, e ali o teto real era
 * **4,5 MB** — o corpo máximo de uma request na Vercel (413
 * `FUNCTION_PAYLOAD_TOO_LARGE`), que mordeu no primeiro envio real. Hoje o
 * navegador sobe direto para o Storage (bucket `inbox-anexos`, mig 217) e a Meta
 * busca por URL assinada; o servidor só assina e manda o link.
 *
 * ⚠️ O `next.config.mjs` continua declarando `bodySizeLimit: '15mb'`, que a
 * plataforma não cumpre — quem depender de corpo grande em OUTRO fluxo vai
 * encontrar o mesmo 413. Config declarada não é config aplicada.
 */
export const TETOS_POR_TIPO: Record<TipoMidia, number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

/** Maior teto possível — usado só para mensagens genéricas. */
export const TETO_ANEXO_BYTES = TETOS_POR_TIPO.document;

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
 * MB para gente ler: sem casa decimal quando é inteiro ("16 MB", não "16.0 MB")
 * e com VÍRGULA quando não é — a mensagem aparece em pt-BR, e "8.4" ali parece
 * erro de formatação de sistema, não número.
 */
function megabytes(bytes: number): string {
  const v = bytes / 1024 / 1024;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}

const ROTULO_TIPO: Record<TipoMidia, string> = {
  image: 'imagem',
  audio: 'áudio',
  video: 'vídeo',
  document: 'documento',
};

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
/**
 * Traduz uma falha de ENVIO que não veio como resposta da action.
 *
 * 🔴 MEDIDO EM 15/08/2026, e é o motivo desta função existir: um anexo acima do
 * limite da plataforma **nunca chega ao servidor** — a Vercel devolve 413 na
 * borda, sem invocar a função (os logs mostraram GETs da página e NENHUM POST da
 * action). O Next então rejeita a chamada com "An unexpected response was
 * received from the server", o error boundary engole a tela inteira, e quem
 * anexou lê "Algo deu errado nesta seção".
 *
 * Ou seja: a mensagem amigável de "limite é 4 MB", que vive no servidor, era
 * INALCANÇÁVEL justamente para os arquivos que mais precisavam dela. Mesma
 * classe do pré-requisito impossível que torna a etapa seguinte inatingível.
 */
export function mensagemDeFalhaDeEnvio(erro: unknown): string {
  const texto = String((erro as any)?.message || erro || '');
  if (/unexpected response|Failed to fetch|NetworkError|413|too large/i.test(texto)) {
    return 'O servidor recusou o envio antes de recebê-lo — em geral, arquivo grande demais (o limite é 4 MB) ou sessão expirada. Tente um arquivo menor; se persistir, recarregue a página.';
  }
  if (/restrito|não autorizado|unauthorized/i.test(texto)) {
    return 'Sua sessão expirou. Recarregue a página e entre de novo.';
  }
  return texto ? `Falha ao enviar: ${texto}` : 'Falha ao enviar.';
}

export function classificarMidia(mime: string, tamanhoBytes: number): Classificacao {
  const entrada = TIPOS_MIDIA[String(mime || '').toLowerCase()];
  if (!entrada) {
    return {
      ok: false,
      motivo: `O WhatsApp não aceita este tipo de arquivo (${mime || 'desconhecido'}). Vale imagem JPG/PNG, PDF, Office, texto, áudio e vídeo.`,
    };
  }
  if (tamanhoBytes <= 0) return { ok: false, motivo: 'Arquivo vazio.' };

  // O teto é POR TIPO, e a mensagem diz qual é o do tipo escolhido: "limite de
  // 16 MB" num vídeo e "100 MB" num PDF explicam; um número único obrigaria a
  // pessoa a adivinhar por que o mesmo tamanho passa num caso e não no outro.
  const teto = TETOS_POR_TIPO[entrada.tipo];
  if (tamanhoBytes > teto) {
    return {
      ok: false,
      motivo: `Arquivo de ${megabytes(tamanhoBytes)} MB — o WhatsApp aceita até ${megabytes(teto)} MB para ${ROTULO_TIPO[entrada.tipo]}. Para algo maior, mande o link.`,
    };
  }
  return { ok: true, tipo: entrada.tipo };
}
