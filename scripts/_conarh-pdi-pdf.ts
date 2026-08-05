/**
 * CONARH 52 — gera o PDF do PDI da Renata com o COMPONENTE REAL do produto
 * (`components/pdf/RelatorioIndividual`), a partir do próprio pacote de
 * conteúdo da feira (`app/conarh/_data/conteudo.json`).
 *
 *   npx --yes tsx scripts/_conarh-pdi-pdf.ts
 *   → public/conarh/pdi-renata-falcao.pdf
 *
 * POR QUE UM SCRIPT, e não um PDF desenhado à mão: a etapa 3 vende "ninguém
 * escreveu à mão". Um PDF montado à parte diverge do texto da tela no primeiro
 * ajuste de conteúdo — que é exatamente a classe de erro que já mordeu esta
 * rota duas vezes (nota × nível, prancheta × tela). Aqui a fonte é o JSON: se
 * a missão mudar na tela, roda de novo e o PDF acompanha.
 *
 * O arquivo gerado é versionado (a demo roda em modo avião — nada é gerado no
 * pavilhão). Guard: `tests/unit/conarh-conteudo.test.ts` confere que o PDF
 * existe e que o script continua apontando para o mesmo destino.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import conteudoJson from '@/app/conarh/_data/conteudo.json';
import type { ConteudoConarh } from '@/app/conarh/_data/types';
import { formatarNota, lerRespostas } from '@/lib/conarh/leitura';

export const DESTINO = 'public/conarh/pdi-renata-falcao.pdf';

const conteudo = conteudoJson as unknown as ConteudoConarh;

/** "D — direta, orientada a resultado" → "D" (o PDF mostra o combo por extenso). */
function valorDoInsumo(rotulo: string): string {
  return conteudo.porta3.insumos.find((i) => i.rotulo.startsWith(rotulo))?.valor ?? '';
}

function montarData() {
  const { porta1, porta3, caso } = conteudo;
  const cenario = porta1.cenario!;
  const leitura = lerRespostas(cenario);
  const testado = porta1.descritores.find((d) => d.cod === cenario.descritor_cod)!;

  // O resumo de desempenho é a matriz inteira, com a nota que a etapa 1 e a
  // prancheta mostram — o PDF não pode contar outra história sobre a mesma
  // pessoa. `nivel` vem do leitura_motor (já validado como floor(nota)).
  const resumo = porta1.descritores.map((d) => ({
    competencia: d.nome_curto,
    nivel: d.leitura_motor.nivel,
    nota: d.leitura_motor.nota,
  }));

  const fortes = porta1.descritores
    .filter((d) => d.leitura_motor.nivel >= 3)
    .map((d) => `${d.nome_curto}: ${d.leitura_motor.evidencia}`);
  const aMelhorar = porta1.descritores
    .filter((d) => d.leitura_motor.nivel <= 1)
    .map((d) => `${d.nome_curto}: ${d.leitura_motor.limite}`);

  // A JORNADA (05/08/2026): 6 semanas de conteúdo + 1 de avaliação, uma
  // competência. Sem este mapa o componente cai na timeline computada — que,
  // para 1 competência, imprime "Semanas 1–8 / 9–12 / 13–14", o calendário do
  // formato de 14 semanas. A demo passaria a ensinar um programa que não
  // existe mais, no documento que ela usa como prova.
  const OBJETIVO_ID = 'obj-lid-d04';
  const trilhaMapa = {
    semanas: [
      ...Array.from({ length: 6 }, (_, i) => ({
        semana: i + 1,
        tipo: 'conteudo',
        competencia_foco: [porta1.competencia],
        conexao_com_pdi: [OBJETIVO_ID],
      })),
      // A avaliação vai SEM competência de propósito: o relatório agrupa
      // semanas consecutivas pela assinatura de `competencia_foco`, então
      // repeti-la aqui fundiria as 7 num bloco só ("Semanas 1–7") e o
      // conteúdo apareceria rotulado como avaliação. Sem ela, vira o bloco
      // próprio "Avaliação", que é o que a jornada tem na 7ª semana.
      { semana: 7, tipo: 'avaliacao' },
    ],
  };

  return {
    colaborador_nome: caso.personagem.nome,
    colaborador_cargo: caso.personagem.cargo,
    conteudo: {
      total_semanas: 7,
      trilha_mapa: trilhaMapa,
      blueprint_objetivos: { [OBJETIVO_ID]: { acao_principal: porta3.missao } },
      blueprint_conteudos: {
        [porta1.competencia]: porta1.descritores.slice(0, 6).map((d) => ({ tema: d.nome_curto })),
      },
      acolhimento:
        `Este plano nasceu de uma conversa real e de uma régua explícita — não de uma impressão. ` +
        `A avaliação do cenário situacional colocou ${caso.personagem.nome.split(' ')[0]} em ` +
        `${formatarNota(leitura.nota)} (N${leitura.nivel}) no descritor mais baixo da matriz de ` +
        `${porta1.competencia}, e é dele que parte o ciclo a seguir.`,
      // Perfil no padrão do relatório real (2ª pessoa, parágrafos, forças e
      // atenções DO PERFIL). A 1ª versão passava a linha do card da etapa 3 e
      // os descritores fortes/fracos — o bloco saía mais pobre que o do produto.
      perfil_comportamental: porta3.perfil,
      resumo_desempenho: resumo,
      competencias: [
        {
          nome: porta1.competencia,
          nivel: leitura.nivel,
          descritores_desenvolvimento: [
            `${testado.cod} · ${testado.nome_curto} — ${formatarNota(leitura.nota)} (N${leitura.nivel})`,
          ],
          fez_bem: fortes,
          melhorar: aMelhorar,
          feedback: cenario.justificativa,
          sprint: {
            foco_30_dias: porta3.objetivo,
            acao_principal: porta3.missao,
            // `acao_apoio` fica de fora de propósito: o caso da feira tem UMA
            // ação e um ritual. Preenchê-lo com o ritual (a saída fácil) faz o
            // PDF imprimir o mesmo texto em dois cartões lado a lado.
            evidencia_esperada: porta3.evidencia_esperada,
            ritual: porta3.ritual,
          },
        },
      ],
      mensagem_final:
        `O formato deste plano segue o perfil comportamental e o modelo de aprendizagem de ` +
        `${caso.personagem.nome.split(' ')[0]}: ${valorDoInsumo('Modelo de aprendizagem')}. ` +
        `A mesma lacuna, em outro perfil, chegaria com outro formato — e a mesma régua.`,
    },
  };
}

async function main() {
  const data = montarData();
  const logo = await getLogoCoverBase64();
  const bytes = await renderToBuffer(
    React.createElement(RelatorioIndividualPDF as never, {
      data,
      empresaNome: 'Empresa demonstrativa · CONARH 52',
      logoBase64: logo,
    }) as never,
  );
  const destino = path.join(process.cwd(), DESTINO);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, Buffer.from(bytes));
  console.log(`OK ${DESTINO} — ${(Buffer.from(bytes).length / 1024) | 0} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
