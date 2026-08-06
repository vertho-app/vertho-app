// Guard: todo registro de service worker declara `scope` explicitamente.
//
// Por que existe: `public/conarh-sw.js` mora na RAIZ de public/, então o escopo
// PADRÃO de um registro sem `scope` é `/` — o mesmo de `public/sw.js`, o worker
// de push. Registrar outro script no mesmo escopo SUBSTITUI a registration: o
// handler de `push` desaparece e as inscrições param de entregar, sem erro
// nenhum, em nenhuma tela.
//
// Havia exatamente esse fallback em app/conarh/_components/registrar-sw.tsx
// (`.catch(() => register('/conarh-sw.js'))`). Era correto quando foi escrito —
// o push não existia — e virou bomba quando o vizinho mudou. Um comentário
// avisando não é garantia; é disciplina de quem editar depois. Isto é a garantia.
//
// Varre apenas arquivos VERSIONADOS: rascunho local não deve pintar o guard de
// vermelho (mesma decisão do service-role-guard, pelo mesmo motivo — vermelho
// crônico local é sinal ignorado).
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { extname } from 'path';
import { describe, it, expect } from 'vitest';

function arquivosVersionados(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

const EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** Casa `.register(` precedido de `serviceWorker`, mesmo com quebra de linha. */
const REGISTRO = /serviceWorker\s*(?:\r?\n\s*)?\.?\s*(?:\r?\n\s*)?register\s*\(([^;]*?)\)/gs;

describe('Guard: service worker sempre com scope explícito', () => {
  it('nenhum register() sem `scope:`', () => {
    const violacoes: string[] = [];

    for (const rel of arquivosVersionados()) {
      if (!EXT.has(extname(rel))) continue;
      if (rel.includes('/tests/') || rel.startsWith('tests/')) continue;

      let conteudo: string;
      try { conteudo = readFileSync(rel, 'utf-8'); } catch { continue; }
      if (!conteudo.includes('serviceWorker')) continue;

      for (const m of conteudo.matchAll(REGISTRO)) {
        const args = m[1] || '';
        if (!args.includes('scope')) {
          violacoes.push(`  ❌ ${rel} → register(${args.trim().slice(0, 80)})`);
        }
      }
    }

    if (violacoes.length) {
      throw new Error(
        `register() de service worker SEM scope explícito em ${violacoes.length} lugar(es):\n` +
        violacoes.join('\n') +
        '\n\nSem `scope`, o escopo padrão é o diretório do script — para arquivos na raiz de public/, isso é `/`, ' +
        'e o registro SUBSTITUI o worker de push (public/sw.js), matando as notificações em silêncio.',
      );
    }
  });

  it('o worker de push segue sem handler de `fetch`', () => {
    // Uma vez registrado, ele controla `/` inteiro daquele aparelho para sempre.
    // Cache aqui serviria app shell velho depois de um deploy, sem erro visível.
    const sw = readFileSync('public/sw.js', 'utf-8');
    const temFetch = /addEventListener\(\s*['"]fetch['"]/.test(sw);
    expect(temFetch, 'public/sw.js ganhou um handler de fetch — ver o comentário no topo do arquivo').toBe(false);
  });
});
