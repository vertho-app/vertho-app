import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SAIDAS_AO_CLIENTE } from '@/lib/ai-saida-sem-travessao';

/**
 * Onda E (04/10/2026): toda tarefa de IA cujo texto o CLIENTE lê passa o idioma de quem lê ao `callAI`.
 *
 * O registro `SAIDAS_AO_CLIENTE` (`lib/ai-saida-sem-travessao.ts`) já é a lista das tarefas que escrevem para
 * o cliente: é ele que decide a regra de pontuação da saída. O idioma é a mesma fronteira, então o guard usa o
 * MESMO registro como denominador. Sem `locale`, o `callAI` lê o cookie de quem disparou a geração (a operação
 * da Vertho) ou, numa task ou num cron, cai em pt-BR: o texto sai no idioma errado só para quem lê em outro
 * idioma, e ninguém vê.
 *
 * Cada call-site de uma tarefa do registro precisa de `locale` na chamada. A exceção é DECLARADA, com o motivo.
 * O que fica de fora de propósito (JSON interno, nota, extração, auditoria, conteúdo reaproveitado) não está no
 * registro, e por isso não entra aqui: o inventário completo, com o motivo de cada um, está no relatório da onda.
 */

/** Tarefa do registro que NÃO passa `locale`, e por quê. Exceção nova pede motivo escrito e revisão. */
const EXCECOES: Record<string, string> = {
  suporte_whatsapp:
    'Beto no WhatsApp: a resposta do modelo passa por `verificarResposta` (linguagem imprópria e links, em português) e todo texto de contenção é fixo em pt-BR (CVV 188). Em outro idioma a conduta ficaria cega. Decisão do dono.',
};

/**
 * Tarefas que escrevem para a pessoa e NÃO estão no registro da pontuação: o blueprint (alimenta o PDI dela) fica
 * fora do registro de propósito, porque o código aplica o nível real pelo NOME da competência que a IA devolve, e
 * o sanitizador de travessão não pode mexer em eco de nome. O idioma, esse sim, vale (a regra dos nomes dos dados
 * em `lib/ai-language.ts` protege o casamento).
 */
const ALEM_DO_REGISTRO = ['blueprint_gerar'];
const ALVOS = new Set([...Object.keys(SAIDAS_AO_CLIENTE), ...ALEM_DO_REGISTRO]);

const RAIZES = ['actions', 'app', 'lib', 'trigger'];

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, acc);
    else if (/\.(ts|tsx)$/.test(nome) && !/\.d\.ts$/.test(nome)) acc.push(p);
  }
  return acc;
}

/** O texto da chamada, do abre ao fecha-parênteses, respeitando string, template e comentário. */
function textoDaChamada(src: string, depoisDoParentese: number): string {
  let i = depoisDoParentese;
  let prof = 1;
  const lerString = (q: string) => { i++; while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i++] === q) return; } };
  const lerTemplate = (): void => {
    i++;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return; }
      if (c === '$' && src[i + 1] === '{') {
        i += 2;
        let d = 1;
        while (i < src.length && d > 0) {
          const k = src[i];
          if (k === '`') { lerTemplate(); continue; }
          if (k === '"' || k === "'") { lerString(k); continue; }
          if (k === '{') d++; else if (k === '}') d--;
          i++;
        }
        continue;
      }
      i++;
    }
  };
  while (i < src.length && prof > 0) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'") { lerString(c); continue; }
    if (c === '`') { lerTemplate(); continue; }
    if (c === '(') prof++; else if (c === ')') prof--;
    i++;
  }
  return src.slice(depoisDoParentese, i);
}

interface Chamada { arquivo: string; taskKey: string | null; temLocale: boolean }

function chamadasDoRepo(): Chamada[] {
  const out: Chamada[] = [];
  for (const raiz of RAIZES) {
    for (const arquivo of arquivos(raiz)) {
      const src = readFileSync(arquivo, 'utf8');
      if (!/\b(callAI|callAIChat)\b/.test(src)) continue;
      const re = /\b(callAI|callAIChat)\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const iniLinha = src.lastIndexOf('\n', m.index) + 1;
        const linha = src.slice(iniLinha, src.indexOf('\n', m.index) < 0 ? src.length : src.indexOf('\n', m.index));
        if (/^\s*(\/\/|\*|\/\*)/.test(linha) || /function\s+(callAI|callAIChat)\b/.test(linha)) continue;
        const corpo = textoDaChamada(src, m.index + m[0].length);
        const tk = corpo.match(/taskKey\s*:\s*'([a-z0-9_]+)'/);
        out.push({ arquivo, taskKey: tk ? tk[1] : null, temLocale: /\blocale\b/.test(corpo) });
      }
    }
  }
  return out;
}

const CHAMADAS = chamadasDoRepo();
const DO_REGISTRO = CHAMADAS.filter((c) => c.taskKey && ALVOS.has(c.taskKey));

describe('o guard enxerga o alvo (não está verde por não achar nada)', () => {
  it('acha os call-sites do repo e os das tarefas que escrevem ao cliente', () => {
    expect(CHAMADAS.length).toBeGreaterThan(100);
    expect(DO_REGISTRO.length).toBeGreaterThan(10);
    // Os que a Onda E ligou ao idioma têm de aparecer: se o parser deixar de vê-los, o guard esvazia.
    for (const tarefa of ['conversa_fase3', 'tira_duvidas', 'pdi_individual', 'blueprint_gerar', 'relatorio_rh', 'relatorio_comportamental', 'devolutiva_comportamental', 'beto', 'relatorio_gestor']) {
      expect(DO_REGISTRO.some((c) => c.taskKey === tarefa), `call-site de ${tarefa}`).toBe(true);
    }
  });
});

describe('toda tarefa que escreve ao cliente passa o idioma de quem lê', () => {
  it('cada call-site das tarefas do registro leva `locale`, ou a exceção está declarada com motivo', () => {
    const sem = DO_REGISTRO
      .filter((c) => !c.temLocale && !(c.taskKey! in EXCECOES))
      .map((c) => `${c.arquivo} (${c.taskKey})`);
    expect(sem, 'tarefa que o cliente lê, sem idioma explícito: o texto sai no idioma do cookie de quem disparou (ou pt-BR numa task)').toEqual([]);
  });

  it('toda exceção diz o motivo', () => {
    // Exceção velha pode sobrar sem derrubar nada. O que o guard cobra é o motivo escrito, não que a lista esteja sempre limpa.
    for (const [tarefa, motivo] of Object.entries(EXCECOES)) {
      expect(motivo.length, tarefa).toBeGreaterThan(30);
    }
  });

  it('a conversa de Evidências (taskKey por variável) passa o idioma nas duas chamadas', () => {
    const rota = CHAMADAS.filter((c) => c.arquivo.replace(/\\/g, '/') === 'app/api/temporada/reflection/route.ts' && c.taskKey === null);
    // As duas `callAIChat` da rota (turno e fechamento forçado) usam `taskKeyDaConversa`.
    const conversas = readFileSync('app/api/temporada/reflection/route.ts', 'utf8').match(/callAIChat\(/g) ?? [];
    expect(conversas.length).toBe(2);
    expect(rota.filter((c) => c.temLocale).length).toBe(2);
  });
});
