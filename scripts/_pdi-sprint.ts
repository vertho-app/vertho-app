/* eslint-disable */
// INTERNO/descartável: renderiza o PDI com o schema NOVO (sprint) pra validar
// o layout (sprint + one-pager + "vira trilha"). Rodar: npx tsx scripts/_pdi-sprint.ts
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';

const NOW = new Date('2026-07-08T10:00:00-03:00').toISOString();

const conteudo = {
  acolhimento: 'Elizângela, este plano parte das suas respostas reais neste ciclo. Ele reconhece o que você já sustenta na coordenação e aponta, com clareza, os dois próximos movimentos que mais destravam seu trabalho nos próximos 30 dias.',
  resumo_geral: {
    leitura: 'Você conduz a coordenação com cuidado e presença. Os dois pontos de maior alavancagem agora são proteger seus próprios limites em períodos intensos e dar estrutura aos encontros formativos, para que virem prática contínua — e não mais uma reunião.',
    principais_forcas: ['Presença e escuta com os professores', 'Compromisso com a formação da equipe'],
    principal_ponto_de_atencao: 'Absorver demandas demais sem renegociar prioridades.',
  },
  perfil_comportamental: {
    descricao: 'Seu perfil tende a combinar execução e influência: você age rápido e mobiliza pessoas. Em períodos de alta demanda, esse mesmo traço pode levar a assumir tudo sozinha e a resolver tensões de forma superficial. A leitura é um espelho, não um rótulo.',
    pontos_forca: ['Mobiliza a equipe com naturalidade', 'Age rápido diante do que precisa ser feito'],
    pontos_atencao: ['Tende a absorver demandas em excesso', 'Pode adiar o próprio cuidado nos picos'],
  },
  resumo_desempenho: [
    { competencia: 'Autocuidado e resiliência emocional', nivel: 1, nota_decimal: 1.2, leitura: 'Prioritário: falta conectar sinais de desgaste a decisões.' },
    { competencia: 'Colaboração docente e cultura formativa', nivel: 1, nota_decimal: 1.3, leitura: 'Prioritário: encontros ainda sem propósito e continuidade.' },
  ],
  competencias: [
    {
      nome: 'Autocuidado e resiliência emocional',
      nivel: 1, nota_decimal: 1.2, flag: false,
      descritores_desenvolvimento: ['Reconhecer sinais de desgaste', 'Buscar apoio antes do limite', 'Renegociar prioridades'],
      fez_bem: ['Mantém o compromisso mesmo sob pressão', 'É referência de presença para a equipe'],
      melhorar: ['Conectar sinais de cansaço a uma decisão concreta', 'Pedir apoio antes de chegar ao limite'],
      feedback: 'Hoje o cansaço aparece, mas não vira decisão: você segue absorvendo até o esgotamento. O treino não é "descansar mais" no abstrato — é transformar cada sinal de desgaste em uma escolha prática (renegociar, pedir apoio, redistribuir).',
      sprint: {
        foco_30_dias: 'Transformar sinais de desgaste em decisão.',
        acao_principal: 'Mapear 3 sinais pessoais de desgaste e definir uma ação para cada um.',
        acao_apoio: 'Ativar 1 par de apoio profissional (colega de confiança).',
        evidencia_esperada: 'Antes do próximo conselho, usar pelo menos 1 sinal para renegociar uma prioridade ou pedir apoio.',
        ritual: 'Revisão semanal de 10 minutos sobre o próprio estado.',
        checklist: ['Sinais mapeados', 'Par de apoio acionado', 'Reunião de prioridades com a diretora feita'],
      },
      dicas_desenvolvimento: ['Quando notar um sinal recorrente, diga a si mesma: "isso é um alerta — qual decisão ele pede?"'],
      estudo_recomendado: [
        { titulo: 'Sinais de sobrecarga no trabalho educacional — como reconhecer limites e buscar apoio', formato: 'texto', por_que_ajuda: 'Ajuda a nomear limites e transformar sinais em decisão', url: 'trilha://autocuidado/limites' },
      ],
    },
    {
      nome: 'Colaboração docente e cultura formativa',
      nivel: 1, nota_decimal: 1.3, flag: false,
      descritores_desenvolvimento: ['Dar propósito aos encontros', 'Gerar produto tangível', 'Sustentar continuidade'],
      fez_bem: ['Reúne a equipe com regularidade', 'Cria um clima de abertura'],
      melhorar: ['Definir o propósito antes de convocar', 'Fechar cada encontro com um compromisso verificável'],
      feedback: 'Os encontros acontecem, mas ainda funcionam como reunião, não como ritual formativo. A virada é desenhar cada encontro com propósito, produto e continuidade — para que o combinado de hoje seja retomado no próximo.',
      sprint: {
        foco_30_dias: 'Transformar o encontro formativo em ritual com continuidade.',
        acao_principal: 'Desenhar o próximo encontro com 3 perguntas: para quê, com o quê, o que vem depois.',
        acao_apoio: 'Negociar previamente a participação de 1 professor resistente.',
        evidencia_esperada: 'Professores saem com um produto tangível e retomam o combinado no encontro seguinte.',
        ritual: '5 min finais para compromisso + 10 min iniciais no encontro seguinte para devolutiva.',
        checklist: ['Propósito definido', 'Produto entregue', 'Compromisso registrado'],
      },
      dicas_desenvolvimento: ['Ao convocar, responda antes: "que produto sai daqui?"'],
      estudo_recomendado: [
        { titulo: 'Reunião, formação e ritual: as diferenças', formato: 'video', por_que_ajuda: 'Mostra como dar propósito e continuidade a um encontro', url: 'trilha://colaboracao/ritual' },
      ],
    },
  ],
  mensagem_final: 'Elizângela, as duas competências avaliadas estão no nível 1 — mas isso não significa que você está começando do zero: significa que a prática ainda não está sistematizada. Comece pelos dois movimentos deste plano. Pequenos ajustes, feitos com constância, mudam o ciclo inteiro.',
  alertas_metodologicos: [],
};

(async () => {
  const nome = 'Elizângela Ferreira Bastos';
  const data = { conteudo, colaborador_nome: nome, colaborador_cargo: 'Coordenação Pedagógica', gerado_em: NOW };
  const buf = Buffer.from(await renderToBuffer(
    // @ts-ignore - JSX com renderToBuffer (mesmo padrão de app/api/radar/lead-pdf/route.ts)
    React.createElement(RelatorioIndividualPDF, { data, empresaNome: 'Secretaria Municipal de Ibipeba/BA', logoBase64: getLogoCoverBase64() || undefined }),
  ));
  const out = path.join(os.homedir(), 'Downloads', 'vertho-pdi-SPRINT-check.pdf');
  fs.writeFileSync(out, buf);
  console.log('OK', out, (buf.length / 1024 | 0) + 'KB');
})().catch((e) => { console.error(e); process.exit(1); });
