/**
 * Toda chamada de IA etiquetada tem que dizer DE QUEM é o custo.
 *
 * 🔴 POR QUE ESTE GUARD (07/09/2026): o relatório semanal de custo passou a
 * separar operação de P&D, e o bloco por empresa é o número que vira preço. Uma
 * chamada sem `empresaId` não some do total — ela migra para "sem tenant", ou
 * seja, sai da conta do cliente e entra na da plataforma. O cliente parece mais
 * barato do que é, e **nada no sistema acusa**: não há erro, não há linha
 * faltando, só um número menor.
 *
 * O tamanho disso foi medido antes de existir este guard: **US$ 45 em 30 dias**
 * em 13 call-sites, sendo o campeão o `conteudo_layout_plan` com 435 de 435
 * chamadas órfãs. Em quase todos, o `empresaId` estava no escopo — em vários,
 * usado na LINHA DE CIMA para escolher o modelo. Não era falta de informação,
 * era falta de alguém conferindo.
 *
 * ⚠️ O guard é textual, não semântico: ele vê se `empresaId` aparece nas opções
 * da chamada, não se o VALOR é o tenant certo. É a mesma limitação declarada dos
 * guards de tenant desta base — pega a omissão, não a troca.
 *
 * 🔑 **Cobre os DOIS caminhos de escrita no ledger.** A primeira versão olhava só
 * `callAI`/`callAIChat` e por isso deixou passar `tts_video_cena`: o TTS grava por
 * `ledger: { feature }` em `generateNarrationAudio`, não pelo wrapper de LLM. Foi
 * 100% órfão em 105 chamadas num único dia, com o guard verde ao lado. Guard que
 * cobre um caminho de dois dá a garantia mais perigosa que existe: a parcial que
 * parece total.
 *
 * A allowlist é dívida declarada e **só encolhe**. Entrada nova ali exige motivo
 * escrito; sem isso, a saída fácil de um CI vermelho seria justamente desligar a
 * medição que este relatório existe para ter.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const RAIZ = process.cwd();
const DIRS = ['app', 'actions', 'lib', 'trigger'];

const allowlist: Record<string, string> = JSON.parse(
  readFileSync(join(RAIZ, 'config/ledger-sem-empresa-allowlist.json'), 'utf-8'),
).allowlist;

function arquivosDeProducao(): string[] {
  const out: string[] = [];
  const varrer = (dir: string) => {
    let entradas: string[];
    try { entradas = readdirSync(dir); } catch { return; }
    for (const nome of entradas) {
      if (nome === 'node_modules' || nome.startsWith('.')) continue;
      const p = join(dir, nome);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) varrer(p);
      else if (/\.(ts|tsx)$/.test(nome)) out.push(p.slice(RAIZ.length + 1).replace(/\\/g, '/'));
    }
  };
  for (const d of DIRS) varrer(join(RAIZ, d));
  return out;
}

export interface Violacao {
  chave: string;
  arquivo: string;
  linha: number;
  taskKey: string;
}

/**
 * Chamadas de `callAI`/`callAIChat` que declaram `taskKey` e não passam
 * `empresaId`. Uma chamada pode ocupar várias linhas: o trecho é lido até o
 * parêntese que fecha.
 */
export function violacoes(arquivos = arquivosDeProducao()): Violacao[] {
  const achados: Violacao[] = [];
  for (const rel of arquivos) {
    let src: string;
    try { src = readFileSync(join(RAIZ, rel), 'utf-8'); } catch { continue; }
    const linhas = src.split('\n');

    for (let i = 0; i < linhas.length; i++) {
      if (!/\b(callAIChat|callAI)\s*\(/.test(linhas[i])) continue;

      let prof = 0, trecho = '';
      for (let j = i; j < Math.min(i + 30, linhas.length); j++) {
        for (const ch of linhas[j]) {
          if (ch === '(') prof++;
          else if (ch === ')') prof--;
        }
        trecho += linhas[j] + '\n';
        if (prof <= 0 && j > i) break;
      }

      if (!/taskKey\s*:/.test(trecho)) continue;
      // `empresaId` como chave, como shorthand (`{ ..., empresaId }`) ou vindo de
      // um spread de opções que já o carrega.
      const temEmpresa = /empresaId\s*[:,}]/.test(trecho)
        || /empresaId\s*$/m.test(trecho)
        || /\.\.\.\s*\w*[Ll]edger/.test(trecho)
        || /\.\.\.opcoesLedger/.test(trecho)
        || /\.\.\.simOpts/.test(trecho)
        || /\.\.\.opts\b/.test(trecho);
      if (temEmpresa) continue;

      const tk = trecho.match(/taskKey\s*:\s*['"]([^'"]+)['"]/);
      const taskKey = tk ? tk[1] : '(dinâmica)';
      achados.push({ chave: `${rel}:${taskKey}`, arquivo: rel, linha: i + 1, taskKey });
    }

    // Segundo caminho: `ledger: { feature: 'x' }` — o TTS e o Batch escrevem por
    // aqui, sem passar pelo wrapper de LLM.
    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(/ledger\s*:\s*\{([^}]*)\}/);
      if (!m) continue;
      const dentro = m[1];
      const f = dentro.match(/feature\s*:\s*['"]([^'"]+)['"]/);
      if (!f) continue;
      // `[:,}]` OU fim da captura: o `}` do objeto fica FORA de `dentro`, então
      // `ledger: { feature: 'x', empresaId }` (shorthand no fim) escapava do teste
      // e aparecia como violação. Terceira vez que o shorthand engana um detector
      // textual nesta rodada — por isso o caso está fixado em teste abaixo.
      if (/empresaId\s*([:,}]|$)/.test(dentro.trim())) continue;
      achados.push({ chave: `${rel}:${f[1]}`, arquivo: rel, linha: i + 1, taskKey: f[1] });
    }
  }
  return achados;
}

describe('Guard: chamada de IA etiquetada declara o dono do custo', () => {
  const encontradas = violacoes();

  it('a varredura enxergou o código (senão o guard passa verde sem olhar nada)', () => {
    const arquivos = arquivosDeProducao();
    expect(arquivos.length).toBeGreaterThan(500);
    // E encontra as chamadas de IA — se o parser quebrasse, `violacoes` voltaria
    // vazio e a allowlist inteira apareceria como "resolvida".
    const comTaskKey = arquivos.filter((a) => /taskKey\s*:/.test(readFileSync(join(RAIZ, a), 'utf-8')));
    expect(comTaskKey.length).toBeGreaterThan(20);
  });

  it('🔴 nenhuma chamada nova sem `empresaId`', () => {
    const novas = encontradas.filter((v) => !(v.chave in allowlist));
    expect(
      novas.map((v) => `${v.arquivo}:${v.linha} (${v.taskKey})`),
      'Estas chamadas gravam custo no ledger SEM dono. O efeito não é um erro: o '
      + 'custo sai da conta do cliente e entra na da plataforma, e o relatório '
      + 'semanal passa a mostrar aquele cliente mais barato do que ele é.\n'
      + 'Passe `empresaId` (e `colaboradorId` quando houver) nas opções da chamada. '
      + 'Se realmente não há tenant, declare em config/ledger-sem-empresa-allowlist.json '
      + 'com o motivo.',
    ).toEqual([]);
  });

  it('🔴 a allowlist só encolhe: entrada resolvida tem que sair', () => {
    const chaves = new Set(encontradas.map((v) => v.chave));
    const resolvidas = Object.keys(allowlist).filter((k) => !chaves.has(k));
    expect(
      resolvidas,
      'Estas entradas já não são violação — remova-as da allowlist. Dívida que fica '
      + 'na lista depois de paga é permissão pré-aprovada para o próximo esquecimento.',
    ).toEqual([]);
  });

  it('🔴 shorthand no fim do objeto conta como etiquetado', () => {
    // `ledger: { feature: 'kit_semanal', empresaId }` é a forma real em
    // `actions/kits.ts`. Sem este caso, o guard acusaria um call-site CORRETO — e
    // a saída fácil seria allowlistar algo que já está certo, virando a lista numa
    // permissão pré-aprovada.
    const kits = violacoes(['actions/kits.ts']).map((v) => v.taskKey);
    expect(kits).not.toContain('kit_semanal');
  });

  it('toda entrada da allowlist tem motivo escrito', () => {
    const semMotivo = Object.entries(allowlist).filter(([, motivo]) => !motivo || motivo.trim().length < 20);
    expect(semMotivo.map(([k]) => k), 'entrada sem motivo em ledger-sem-empresa-allowlist.json').toEqual([]);
  });
});
