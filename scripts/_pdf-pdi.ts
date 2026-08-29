/* eslint-disable */
// Gera UM relatório de PDI (relatório individual, tipo='individual' — mesmo
// componente que o app usa em pdi-actions.ts) com dados fictícios, usando as
// CONFIGURAÇÕES ATUAIS do tokens.ts (flags slate/vivid). Salva em ~/Downloads.
// Rodar de nextjs-app:  npx --yes tsx scripts/_pdf-pdi.ts
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';

const EMPRESA = 'Acme Educação';
const NOW = new Date('2026-07-08T10:00:00-03:00').toISOString();

function planoComp(temas: [string, string][], acoes: string[][]) {
  return {
    semana_1: { foco: temas[0][0], acoes: acoes[0] },
    semana_2: { foco: temas[1][0], acoes: acoes[1] },
    semana_3: { foco: temas[2][0], acoes: acoes[2] },
    semana_4: { foco: temas[3][0], acoes: acoes[3] },
  };
}

const conteudo = {
  acolhimento: 'Mariana, sua trajetória neste ciclo mostra alguém que assumiu responsabilidades com seriedade e que já colhe frutos concretos em várias frentes. Este plano celebra o que você construiu e aponta, com clareza e sem rodeios, onde um pequeno ajuste pode gerar um salto grande.',
  resumo_geral: {
    leitura: 'Você combina uma escuta genuína com forte senso de organização, o que faz da sua sala um ambiente previsível e acolhedor. O ponto que mais destrava seu próximo nível é a firmeza para conduzir conversas difíceis sem adiá-las. Quando você sustenta esse desconforto momentâneo, a equipe responde com mais clareza e menos retrabalho.',
    principais_forcas: ['Escuta ativa e acolhimento consistentes', 'Organização e cumprimento de combinados'],
    principal_ponto_de_atencao: 'Adiar feedbacks corretivos até o problema crescer.',
  },
  perfil_comportamental: {
    descricao: 'Seu perfil tende a favorecer estabilidade, cuidado com as pessoas e consistência nas rotinas — um padrão que costuma indicar alta confiabilidade e baixa rotatividade emocional no time. Em contextos de pressão, esse mesmo traço pode levar a evitar o conflito necessário, priorizando a harmonia de curto prazo sobre a clareza que resolve.\n\nA leitura comportamental é uma hipótese contextual, não um rótulo. Use-a como espelho: onde ela ressoa, aprofunde; onde não bate, confie na sua experiência. O objetivo é ampliar repertório, não te encaixar numa caixa.',
    pontos_forca: ['Constrói confiança rápido com pares e liderados', 'Mantém a calma e a previsibilidade sob estresse', 'Cumpre o que promete — referência de confiabilidade'],
    pontos_atencao: ['Tende a postergar conversas de correção', 'Pode absorver tarefas para evitar atrito', 'Dá menos visibilidade às próprias entregas'],
  },
  resumo_desempenho: [
    { competencia: 'Comunicação Assertiva', nivel: 2, nota_decimal: 2.3, leitura: 'Comunica bem no dia a dia, mas evita o confronto necessário.' },
    { competencia: 'Gestão de Conflitos', nivel: 1, nota_decimal: 1.4, leitura: 'Ponto prioritário: adia mediações até o desgaste aparecer.' },
    { competencia: 'Organização e Planejamento', nivel: 4, nota_decimal: 3.8, leitura: 'Referência do time em previsibilidade e combinados.' },
    { competencia: 'Foco no Resultado', nivel: 3, nota_decimal: 3.1, leitura: 'Entrega com consistência; pode elevar o nível de ambição.' },
  ],
  competencias: [
    {
      nome: 'Comunicação Assertiva',
      nivel: 2, nota_decimal: 2.3, flag: false,
      descritores_desenvolvimento: ['Expressar discordância de forma direta e respeitosa', 'Dar feedback específico no momento certo', 'Fazer pedidos claros sem rodeios'],
      fez_bem: ['Adapta a linguagem ao interlocutor com naturalidade', 'Escuta até o fim antes de responder', 'Reconhece publicamente o esforço da equipe'],
      melhorar: ['Nomear o problema já na primeira ocorrência', 'Substituir "talvez a gente pudesse" por pedidos diretos', 'Sustentar a própria posição diante de pressão'],
      feedback: 'Sua comunicação é calorosa e cria segurança, mas perde força quando o assunto é sensível. Nesses momentos você tende a suavizar tanto a mensagem que o outro sai da conversa sem entender o que precisa mudar. Assertividade aqui não é dureza: é clareza com respeito. O treino é dizer o essencial em uma frase e resistir ao impulso de amaciar.',
      plano_30_dias: planoComp(
        [['Vou nomear um desconforto por dia', ''], ['Vou dar um feedback específico por semana', ''], ['Vou fazer pedidos diretos', ''], ['Vou pedir retorno sobre minha clareza', '']],
        [['Anote 1 situação/dia em que você suavizou algo e reescreva a frase direta.', 'Compartilhe com um par de confiança.'],
         ['Escolha 1 pessoa e dê um feedback específico usando fato + impacto + pedido.', 'Registre a reação e o que aprendeu.'],
         ['Troque 3 pedidos indiretos por diretos em reuniões.', 'Observe se o combinado ficou mais claro.'],
         ['Peça a 2 colegas: "fui clara no que precisava?".', 'Ajuste com base no retorno.']],
      ),
      dicas_desenvolvimento: ['Quando sentir vontade de amaciar, diga: "Vou ser direta porque respeito seu tempo: ..."', 'Quando alguém discordar, responda "me ajuda a entender o que você viu?" antes de rebater.'],
      estudo_recomendado: [
        { titulo: 'Feedback que gera ação', formato: 'video', por_que_ajuda: 'Modelo fato-impacto-pedido aplicável já na próxima 1:1', url: 'trilha://comunicacao/feedback' },
        { titulo: 'A arte da conversa difícil', formato: 'texto', por_que_ajuda: 'Estrutura para abrir temas sensíveis sem escalar', url: 'trilha://comunicacao/conversa-dificil' },
      ],
      checklist_tatico: ['Dei ao menos 1 feedback específico esta semana', 'Fiz um pedido direto sem "talvez"', 'Sustentei minha posição em pelo menos 1 reunião'],
    },
    {
      nome: 'Gestão de Conflitos',
      nivel: 1, nota_decimal: 1.4, flag: true,
      descritores_desenvolvimento: ['Mediar divergências antes que virem desgaste', 'Separar a pessoa do problema', 'Conduzir acordos com combinados verificáveis'],
      fez_bem: ['Mantém a calma quando o clima esquenta', 'Não toma partido de forma precipitada'],
      melhorar: ['Intervir na primeira fricção, não na terceira', 'Trazer as partes para a mesma conversa', 'Fechar acordos com prazo e responsável'],
      feedback: 'Este é o ponto de maior alavancagem do seu ciclo. Hoje o conflito é tratado tarde, quando já custou energia e confiança do time. Sua serenidade é um ativo enorme para mediar — falta apenas o gatilho de agir cedo. Uma mediação de 15 minutos no dia 1 evita uma crise de duas semanas.',
      plano_30_dias: planoComp(
        [['Vou identificar fricções no início', ''], ['Vou mediar uma divergência', ''], ['Vou fechar acordos verificáveis', ''], ['Vou acompanhar acordos combinados', '']],
        [['Mapeie 2 tensões latentes no time e escreva o custo de não agir.', 'Escolha uma para abordar.'],
         ['Traga as duas partes para uma conversa estruturada de 15 min.', 'Foque em fatos, não em julgamentos.'],
         ['Feche cada acordo com "quem faz o quê até quando".', 'Registre por escrito.'],
         ['Revise os acordos após uma semana.', 'Reforce o que funcionou.']],
      ),
      dicas_desenvolvimento: ['Quando notar um clima estranho, diga: "Percebi uma tensão aqui, podemos conversar 10 minutos?"', 'Quando as partes se acusarem, redirecione: "vamos focar no que precisa mudar, não em quem errou."'],
      estudo_recomendado: [
        { titulo: 'Mediação em 15 minutos', formato: 'podcast', por_que_ajuda: 'Roteiro curto para intervir cedo sem virar juiz', url: 'trilha://conflitos/mediacao-rapida' },
        { titulo: 'Caso: a fofoca que virou crise', formato: 'case', por_que_ajuda: 'Mostra o custo de adiar e como cortar cedo', url: 'trilha://conflitos/caso-fofoca' },
      ],
      checklist_tatico: ['Abordei uma tensão no dia em que percebi', 'Conduzi ao menos 1 mediação estruturada', 'Fechei acordos com responsável e prazo'],
    },
    {
      nome: 'Organização e Planejamento',
      nivel: 4, nota_decimal: 3.8, flag: false,
      descritores_desenvolvimento: [],
      fez_bem: ['Cumpre prazos e antecipa gargalos', 'Documenta combinados de forma clara', 'Cria rotinas que o time consegue seguir'],
      melhorar: ['Delegar mais para desenvolver o time', 'Compartilhar seus métodos com pares'],
      feedback: 'Aqui você é referência. Sua organização gera previsibilidade e reduz o retrabalho de todos ao redor. O próximo passo não é fazer mais, é multiplicar: transformar seu método pessoal em padrão do time e usar essa força para desenvolver quem ainda patina no planejamento.',
      plano_30_dias: null,
      dicas_desenvolvimento: ['Quando pegar uma tarefa que outro poderia fazer, pergunte: "isso desenvolve alguém se eu delegar?"'],
      estudo_recomendado: [
        { titulo: 'De executor a multiplicador', formato: 'texto', por_que_ajuda: 'Como transformar força individual em capacidade do time', url: 'trilha://gestao/multiplicador' },
      ],
      checklist_tatico: ['Deleguei ao menos 1 tarefa que eu faria sozinha', 'Compartilhei um método meu com um par'],
    },
    {
      nome: 'Foco no Resultado',
      nivel: 3, nota_decimal: 3.1, flag: false,
      descritores_desenvolvimento: ['Elevar o nível de ambição das metas', 'Conectar esforço diário a indicadores'],
      fez_bem: ['Entrega com consistência e qualidade', 'Não deixa pendências se acumularem'],
      melhorar: ['Definir metas mais desafiadoras', 'Tornar o resultado visível para a liderança'],
      feedback: 'Você entrega com regularidade e isso constrói confiança. O crescimento agora está em ambição: puxar metas um degrau acima do confortável e tornar seus resultados visíveis, sem timidez. Resultado que não é comunicado vira invisível na hora das decisões.',
      plano_30_dias: planoComp(
        [['Vou definir uma meta ambiciosa', ''], ['Vou conectar tarefas a indicadores', ''], ['Vou tornar resultados visíveis', ''], ['Vou revisar e recalibrar', '']],
        [['Escolha uma meta 20% acima do usual e escreva o "como".', 'Compartilhe com seu gestor.'],
         ['Ligue suas 3 tarefas principais a um indicador claro.', 'Acompanhe semanalmente.'],
         ['Envie um resumo curto de resultados à liderança.', 'Sem minimizar as entregas.'],
         ['Revise o que funcionou e ajuste a próxima meta.', 'Celebre os avanços.']],
      ),
      dicas_desenvolvimento: ['Quando terminar algo relevante, registre o impacto em uma frase e compartilhe.'],
      estudo_recomendado: [
        { titulo: 'Metas que puxam para cima', formato: 'video', por_que_ajuda: 'Como calibrar ambição sem cair em metas irreais', url: 'trilha://resultado/metas' },
      ],
      checklist_tatico: ['Defini 1 meta acima do confortável', 'Conectei minhas tarefas a um indicador', 'Comuniquei um resultado à liderança'],
    },
  ],
  mensagem_final: 'Mariana, tudo aqui é treinável — e você já provou que aprende rápido. A firmeza que falta hoje não é um traço fixo, é um músculo. Comece pela mediação de conflitos: uma conversa de 15 minutos no momento certo muda a semana inteira do seu time. Pequenos ajustes, grande impacto.',
  alertas_metodologicos: ['A competência "Gestão de Conflitos" teve poucas evidências situacionais — recomenda-se nova observação no próximo ciclo para confirmar a leitura.'],
};

(async () => {
  const nome = 'Mariana Figueiredo Costa';
  const data = { conteudo, colaborador_nome: nome, colaborador_cargo: 'Coordenadora Pedagógica', gerado_em: NOW };
  const buf = await renderToBuffer(
    // @ts-ignore - JSX com renderToBuffer (mesmo padrão de app/api/radar/lead-pdf/route.ts)
    React.createElement(RelatorioIndividualPDF, { data, empresaNome: EMPRESA, logoBase64: getLogoCoverBase64() || undefined }),
  );
  const slug = nome.replace(/\s+/g, '-').toLowerCase();
  const out = path.join(os.homedir(), 'Downloads', `vertho-pdi-${slug}${process.env.PDI_SUFFIX || ''}.pdf`);
  fs.writeFileSync(out, Buffer.from(buf));
  console.log(`OK  ${out}  (${(Buffer.from(buf).length / 1024) | 0} KB)`);
})().catch((e) => { console.error(e); process.exit(1); });
