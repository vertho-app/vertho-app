/**
 * CONARH 52 — gera o GUIA ESCRITO da Sandra (etapa 4, formato texto) como PDF,
 * pelo gerador real de conteúdo do produto (`lib/conteudo-final-pdf`).
 *
 *   npx --yes tsx scripts/_conarh-guia-pdf.ts
 *   → public/conarh/media/guia-sandra-roteiro.pdf
 *
 * A etapa 4 mostra três formatos: vídeo (Marcos), texto (Sandra) e podcast
 * (Rogério). Os outros dois abrem a peça REAL; o texto era o único que ficava
 * só na tela. Agora o expositor abre o mesmo PDF editorial que o colaborador
 * recebe — mesma capa, mesma tipografia, mesmo corpo.
 *
 * O conteúdo é o do descritor que a etapa inteira usa (LID-D04, acordo e
 * acompanhamento observável), escrito no registro do perfil S: passo a passo,
 * com frases prontas, sem exigir que ela vire outra pessoa.
 */
import fs from 'node:fs';
import path from 'node:path';
// A ordem importa: `styles` registra a fonte NotoSans por efeito colateral, e o
// render tem que acontecer na MESMA instância do @react-pdf/renderer.
//
// Por isso o script NÃO usa `renderConteudoFinalPDF`: ele faz
// `await import('@react-pdf/renderer')` dentro da função e, sob `tsx`, esse
// import dinâmico resolve uma instância diferente da que o `styles` registrou —
// "Font family not registered: NotoSans" com a fonte registrada. Usando o
// COMPONENTE + o `renderToBuffer` estático daqui, é tudo a mesma cópia.
import '@/components/pdf/styles';
import { renderToBuffer } from '@react-pdf/renderer';
import { ConteudoFinalPDF } from '@/lib/conteudo-final-pdf';

export const DESTINO = 'public/conarh/media/guia-sandra-roteiro.pdf';

const TITULO = 'O roteiro de 3 passos para a conversa de correção';

const CONTEUDO = `## Por que um roteiro

Você não precisa virar outra pessoa para corrigir alguém. Precisa de uma frase
de fechamento que proteja a clareza sem abrir mão do cuidado — e essa frase é
mais fácil de dizer quando já foi escrita antes.

O roteiro abaixo tem três passos. Ele cabe em uma conversa de dez minutos e
termina com algo que vocês dois conseguem verificar na semana seguinte.

## Passo 1 — Ouvir a versão, inteira

Comece pela pergunta, não pelo diagnóstico: *"me conta como foi da sua
perspectiva"*. Deixe a pessoa terminar, mesmo quando você já sabe o que
aconteceu. O que ela diz aqui é o que você vai usar no passo 3 — e a correção
que ignora a versão do outro vira monólogo com plateia.

Uma pergunta a mais, quando algo importante aparecer: *"o que passou pela sua
cabeça naquele momento?"*. É ela que separa erro de capacidade de erro de
clareza.

## Passo 2 — Construir o combinado JUNTO

Não anuncie a regra: pergunte o que muda. *"O que você faria diferente na
próxima vez, com o mesmo aperto?"*

A resposta dela é o rascunho. Você ajusta, não substitui. O combinado precisa
das três partes:

- **Ação** — o que a pessoa faz de diferente, em palavras que descrevem
  comportamento, não intenção. "Redobrar a atenção" não é ação.
- **Medida** — como vocês dois vão enxergar que aconteceu. Um registro, uma
  planilha, um aviso: qualquer coisa que exista fora da memória de vocês.
- **Data** — o dia em que sentam para olhar. Sem data, a revisão só acontece se
  houver um novo problema.

## Passo 3 — Registrar e devolver no mesmo dia

Escreva o combinado em três linhas e mande para a pessoa ainda hoje. Não é
formalidade: é o que permite que a conversa da próxima semana comece de onde
esta terminou.

> "Combinado de hoje: o relatório sai com a aba de checagem preenchida até quinta. Sexta, 10 minutos, a gente olha o que apareceu. Qualquer coisa que travar antes disso, me chama."

## O que você leva desta semana

Na próxima conversa de correção, use o roteiro inteiro — e depois anote qual
foi a frase exata de fechamento que você usou. Ela é o seu material da semana
seguinte: as frases que funcionam com você são as que você consegue repetir.
`;

async function main() {
  const bytes = await renderToBuffer(ConteudoFinalPDF({
    titulo: TITULO,
    conteudoMd: CONTEUDO,
    competencia: 'Liderança',
    descritor: 'Acordo e acompanhamento observável',
    formato: 'texto',
    empresaNome: 'Empresa demonstrativa · CONARH 52',
  }) as never);
  const destino = path.join(process.cwd(), DESTINO);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, Buffer.from(bytes));
  console.log(`OK ${DESTINO} — ${(Buffer.from(bytes).length / 1024) | 0} KB`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
