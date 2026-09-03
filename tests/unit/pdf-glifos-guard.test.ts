/**
 * Guard: glifo que a fonte dos PDFs NÃO TEM não pode chegar ao papel.
 *
 * 🔴 O QUE ELE PEGA, e por que um teste comum não pegaria
 *
 * O corpo de todo PDF do produto é a Inter no subset `latin` do fontsource,
 * registrada como 'NotoSans' em `components/pdf/styles.ts`. Esse subset cobre
 * U+2191 (↑) e U+2193 (↓) e **pula o U+2192 (→)** — junto com ✓, ✗, ●, ★, ≥ e
 * ≤, que são exatamente os caracteres que se quer usar num relatório.
 *
 * Quando o glifo falta, o `@react-pdf/renderer` não lança: ele desenha um vazio.
 * O PDF é gerado, o job termina com sucesso, o teste de conteúdo passa — e quem
 * abre o arquivo vê "2  4" no lugar de "2 → 4", com o buraco no ponto exato onde
 * morava o sentido da frase. `lib/temporada-concluida-pdf.tsx` fazia isso, e o
 * `dna-organizacional-pdf` já tinha registrado a mesma classe em comentário
 * ("renderizava como V V V dourado"). Duas descobertas independentes do mesmo
 * defeito, nenhuma das duas virou verificação — é para isso que este arquivo
 * existe.
 *
 * `Medido: 03/09/2026` — fontkit sobre o TTF que o PDF baixa do CDN. A lista
 * abaixo é o resultado dessa medição, não um palpite.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, relative } from 'path';

const RAIZ = join(__dirname, '..', '..');

/**
 * Code points AUSENTES do subset latin da Inter (medidos com fontkit).
 * Ao lado de cada um, o substituto que renderiza.
 */
const AUSENTES: Record<string, string> = {
  '→': 'seta →  → escreva "de X para Y" (ver `transicao` em temporada-concluida-pdf)',
  '←': 'seta ←  → escreva a direção por extenso',
  '↔': 'seta ↔  → escreva a relação por extenso',
  '⇒': 'seta ⇒  → escreva "implica" / "leva a"',
  '▸': 'triângulo ▸ → use "•" (U+2022, coberto)',
  '●': 'bola ● → use "•" (U+2022, coberto)',
  '○': 'bola vazada ○ → use "•" ou um View com borda',
  '★': 'estrela ★ → use um View/Svg, ou texto ("destaque")',
  '☆': 'estrela vazada ☆ → idem',
  '✓': 'check ✓ → use um Svg, ou a palavra ("sim", "inclui")',
  '✔': 'check ✔ → idem',
  '✗': 'xis ✗ → use um Svg, ou a palavra ("não", "não inclui")',
  '✘': 'xis ✘ → idem',
  '✕': 'xis ✕ → idem',
  '≥': 'maior-ou-igual ≥ → escreva "N ou mais"',
  '≤': 'menor-ou-igual ≤ → escreva "até N"',
  '≠': 'diferente ≠ → escreva "diferente de"',
  '†': 'adaga † → use "*" ou nota numerada',
  '‡': 'adaga dupla ‡ → idem',
};

/**
 * DÍVIDA DECLARADA — ocorrências que já estavam no repositório em 03/09/2026,
 * com o defeito que cada uma produz. **Esta lista só pode ENCOLHER**: uma
 * entrada nova aqui é o bug que o guard existe para pegar.
 *
 * Nenhuma foi corrigida na rodada em que o guard nasceu porque as duas telas
 * estão fora do escopo dela e nenhuma foi verificada no papel — trocar glifo em
 * PDF comercial sem abrir o arquivo é como o defeito nasce.
 */
const DIVIDA: Record<string, string> = {
  'components/pdf/PropostaComercialPDF.tsx':
    'o ✕ da coluna "não inclui" sai em branco — a linha fica sem marcação nenhuma',
  'components/pdf/RadarPropostaPDF.tsx':
    'a ★ da escola-alvo, o → dos bullets e o ≥ das notas de rodapé saem vazios',
};

/** Geradores de PDF: `components/pdf/**` + os `lib/*pdf*`. */
function geradores(): string[] {
  const achados: string[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) { varrer(p); continue; }
      if (/\.tsx?$/.test(nome)) achados.push(p);
    }
  };
  varrer(join(RAIZ, 'components', 'pdf'));
  for (const nome of readdirSync(join(RAIZ, 'lib'))) {
    if (/pdf/i.test(basename(nome)) && /\.tsx?$/.test(nome)) achados.push(join(RAIZ, 'lib', nome));
  }
  return achados.sort();
}

/**
 * Tira os comentários antes de procurar. O aviso "→ vira tofu" escrito num
 * comentário é justamente o que se quer manter; é o glifo no LITERAL que
 * chega ao papel.
 */
function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // bloco /* */ e {/* */} do JSX
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // linha // (sem casar "https://")
}

describe('guard: glifos ausentes da fonte dos PDFs', () => {
  const arquivos = geradores();

  it('varre os geradores de PDF (denominador visível)', () => {
    // Alvo vazio reporta verde: o guard tem que provar que olhou para algo.
    expect(arquivos.length).toBeGreaterThan(20);
  });

  it('nenhum literal usa glifo que a Inter (subset latin) não tem', () => {
    const violacoes: string[] = [];

    for (const arquivo of arquivos) {
      const rel = relative(RAIZ, arquivo).replace(/\\/g, '/');
      if (rel in DIVIDA) continue;
      const linhas = semComentarios(readFileSync(arquivo, 'utf8')).split('\n');
      linhas.forEach((linha, i) => {
        for (const [ch, dica] of Object.entries(AUSENTES)) {
          if (linha.includes(ch)) violacoes.push(`${rel}:${i + 1} — ${dica}`);
        }
      });
    }

    expect(violacoes, `Glifo sem cobertura na fonte do PDF (sai em BRANCO, sem erro):\n${violacoes.join('\n')}`)
      .toEqual([]);
  });

  it('a dívida declarada aponta para arquivos que existem e ainda violam', () => {
    // Entrada de allowlist cujo alvo sumiu (ou já foi corrigido) é allowlist que
    // envelheceu em silêncio — a lista tem que ser podada quando o defeito sai.
    for (const [rel, motivo] of Object.entries(DIVIDA)) {
      const src = semComentarios(readFileSync(join(RAIZ, rel), 'utf8'));
      const aindaViola = Object.keys(AUSENTES).some((ch) => src.includes(ch));
      expect(aindaViola, `${rel} não viola mais (${motivo}) — remova a entrada de DIVIDA`).toBe(true);
    }
  });
});
