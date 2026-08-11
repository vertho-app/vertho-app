// Guarda ESTRUTURAL: ninguém monta request de Anthropic à mão fora do wrapper.
//
// Por que este arquivo existe — medido em 09-10/08/2026. `lib/video/gerar-roteiro.ts`
// mandava `fetch` direto para `https://api.anthropic.com/v1/messages/batches` com
// `thinking:{type:'enabled',budget_tokens}` no corpo. Esse formato foi REMOVIDO na
// geração 5 do Claude (400: "use thinking.type.adaptive and output_config.effort") e
// `conteudo_video` virou `claude-opus-5` em 05/08.
//
// O detalhe que faz a guarda valer mais que o fix: em 08/08 o wrapper APRENDEU o
// formato novo (`ai-thinking-geracao.test.ts` prova) — e o vídeo continuou quebrado,
// porque quem monta request cru não passa pelo wrapper e portanto fica FORA do fix.
// Resultado: 0 vídeos gerados de 05/08 a 10/08 (o último foi 28/07), sem rastro no
// ledger, porque o request cru também não registrava uso de IA.
//
// A classe do bug não é "o parâmetro errado" — é "existe um segundo caminho para a
// API". Enquanto o único caminho for `callAI`/`callAIChat`/`lib/ai-batch`, a próxima
// troca de geração se resolve num arquivo só.
//
// Invariantes:
//   1. Nenhum arquivo de produção fala HTTP direto com `api.anthropic.com`.
//   2. Só o wrapper decide o formato do parâmetro de raciocínio — em QUALQUER
//      provedor. O vocabulário muda: `budget_tokens` (Anthropic),
//      `thinkingConfig.thinkingBudget` (Gemini), `reasoning_effort`
//      (OpenAI-compatible). O invariante 2 nasceu (10/08) só com o vocabulário
//      da Anthropic, e por isso não via `thinkingConfig:{thinkingBudget:0}` em
//      `trigger/extracao-video.ts` — a MESMA classe, outro fornecedor,
//      esperando a próxima troca de geração do Gemini para repetir o episódio.
//
// Por que o invariante 1 NÃO foi estendido para Gemini/OpenAI (decisão de 11/08,
// não esquecimento): lá o HTTP cru é legítimo em massa — TTS, embeddings, imagem
// e ASR são modalidades que `callAI` não cobre, e a allowlist ficaria com ~8
// arquivos corretos. Allowlist grande é allowlist que ninguém lê. O sinal que
// separa risco de rotina não é o HOST, é o PARÂMETRO DE RACIOCÍNIO — que só
// existe onde há geração de texto e só quebra quando a geração do modelo muda.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');
const DIRS = ['actions', 'lib', 'app', 'trigger', 'components'];
const IGNORAR = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

// Allowlists de DÍVIDA DECLARADA: só podem ENCOLHER. Acrescentar arquivo aqui para
// "passar o CI" é exatamente o bug que esta guarda existe para pegar — o caminho
// certo é `callAI`/`callAIChat` (síncrono) ou `lib/ai-batch` (lote, SDK oficial).
const PODE_FALAR_HTTP_CRU: string[] = [];
const PODE_DECIDIR_RACIOCINIO = [
  'actions/ai-client.ts',
  // Dívida declarada (11/08): MULTIMODAL — mandam áudio/vídeo por `inlineData`, e
  // `callAI` só transporta texto. Não é preguiça: rotear pelo wrapper hoje perderia
  // a modalidade. Saem daqui quando `callGemini` aceitar partes não-textuais.
  'lib/gemini-video.ts',        // vídeo → texto
  'trigger/extracao-video.ts',  // áudio → transcrição
];

// Arquivos que são PAYLOAD (string de HTML/markdown servida ao browser), não
// código de request: a tela de custo cita `reasoning_effort` em prosa. Casar
// texto de documentação como violação treina a ignorar a guarda.
const EH_CONTEUDO = (rel: string) => /-html\.ts$/.test(rel);

function varrer(dir: string, saida: string[] = []): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return saida; // diretório opcional (ex.: components/ ausente num checkout parcial)
  }
  for (const entrada of entradas) {
    if (IGNORAR.has(entrada)) continue;
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) varrer(caminho, saida);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(entrada)) saida.push(caminho);
  }
  return saida;
}

// Varre o DIRETÓRIO, não `git ls-files`: arquivo novo nasce untracked, e é
// justamente nessa janela que alguém cola um `fetch` de exemplo da documentação.
const ARQUIVOS = DIRS.flatMap((d) => varrer(join(RAIZ, d))).map((caminho) => ({
  rel: relative(RAIZ, caminho).split(sep).join('/'),
  texto: readFileSync(caminho, 'utf8'),
}));

describe('IA · nenhum request cru de Anthropic fora do wrapper', () => {
  it('há arquivos para varrer (a guarda não pode passar por varrer zero)', () => {
    expect(ARQUIVOS.length).toBeGreaterThan(100);
  });

  it('ninguém chama api.anthropic.com por HTTP direto', () => {
    const infratores = ARQUIVOS
      .filter((a) => a.texto.includes('api.anthropic.com'))
      .map((a) => a.rel)
      .filter((rel) => !PODE_FALAR_HTTP_CRU.includes(rel));

    expect(
      infratores,
      `Request cru para a Anthropic fica FORA do fix do wrapper quando a API muda de\n` +
        `geração — foi assim que o vídeo passou 5 dias gerando zero (05→10/08/2026).\n` +
        `Use callAI/callAIChat (síncrono) ou lib/ai-batch (lote). Infratores: ${infratores.join(', ')}`,
    ).toEqual([]);
  });

  it('só o wrapper decide o formato do parâmetro de raciocínio (todos os provedores)', () => {
    // Com dois-pontos: casa atribuição real e ignora as menções em comentário/prosa,
    // que são desejáveis — é assim que a lição fica no código.
    const VOCABULARIO = /(?:budget_tokens|thinkingBudget|thinkingConfig|reasoning_effort)\s*:/;
    const infratores = ARQUIVOS
      .filter((a) => VOCABULARIO.test(a.texto))
      .map((a) => a.rel)
      .filter((rel) => !PODE_DECIDIR_RACIOCINIO.includes(rel) && !EH_CONTEUDO(rel));

    expect(
      infratores,
      `O formato do parâmetro de raciocínio muda por GERAÇÃO de modelo e por PROVEDOR\n` +
        `(Anthropic: enabled+budget_tokens até a 4.6 → adaptive+output_config.effort da\n` +
        `4.7/5 em diante. Gemini: thinkingConfig.thinkingBudget. OpenAI: reasoning_effort).\n` +
        `Quem monta esse corpo fora de actions/ai-client.ts fica FORA do fix quando o\n` +
        `contrato muda — foi assim que o vídeo passou 5 dias gerando zero.\n` +
        `Infratores: ${infratores.join(', ')}`,
    ).toEqual([]);
  });

  it('a allowlist de raciocínio é pequena o bastante para alguém ler', () => {
    // Uma guarda com allowlist crescente vira carimbo. Se este número subir, a
    // pergunta certa é "por que o wrapper ainda não cobre isso?", não "+1 na lista".
    expect(PODE_DECIDIR_RACIOCINIO.length).toBeLessThanOrEqual(3);
  });
});
