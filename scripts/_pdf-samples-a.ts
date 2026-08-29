/* eslint-disable */
// Gera 4 PDFs de amostra com dados fictícios ricos para padronização de look-and-feel.
// Rodar de dentro de nextjs-app: DEBUG=1 npx --yes tsx scripts/_pdf-samples-a.ts
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';
import RelatorioGestorPDF from '@/components/pdf/RelatorioGestor';
import { renderConteudoFinalPDF } from '@/lib/conteudo-final-pdf';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import { parseBlocks, type LayoutPlan, type PlanItem } from '@/lib/conteudo-layout-plan';

const OUT = (process.env.PDF_OUT || path.join(os.homedir(), 'Downloads', 'vertho-pdf-samples')); fs.mkdirSync(OUT, { recursive: true });
async function save(nome: string, bytes: Uint8Array | Buffer) {
  const p = path.join(OUT, nome + '.pdf'); fs.writeFileSync(p, Buffer.from(bytes));
  console.log('OK', nome, (Buffer.from(bytes).length / 1024 | 0) + 'KB');
}
const logo = getLogoCoverBase64() || undefined;
const EMPRESA = 'Acme Educação';
const NOW = new Date('2026-07-07T14:30:00-03:00').toISOString();

// ══════════════════════════════════════════════════════════════════════════
// 1) RELATÓRIO INDIVIDUAL (PDI)
// ══════════════════════════════════════════════════════════════════════════
function planoComp(temas: [string, string][], acoes: string[][]) {
  return {
    semana_1: { foco: temas[0][0], acoes: acoes[0] },
    semana_2: { foco: temas[1][0], acoes: acoes[1] },
    semana_3: { foco: temas[2][0], acoes: acoes[2] },
    semana_4: { foco: temas[3][0], acoes: acoes[3] },
  };
}

const individualConteudo = {
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
         ['Peça a 2 colegas: "fui claro no que precisava?".', 'Ajuste com base no retorno.']],
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

// ══════════════════════════════════════════════════════════════════════════
// 2) RELATÓRIO RH / T&D
// ══════════════════════════════════════════════════════════════════════════
const rhConteudo = {
  resumo_executivo: {
    leitura_geral: 'A organização apresenta boa maturidade em execução e organização, mas concentra risco em competências relacionais — comunicação assertiva e gestão de conflitos — especialmente nas lideranças intermediárias. O quadro é sólido no operacional e vulnerável quando o desafio exige conversas difíceis e decisões impopulares.',
    principal_forca_organizacional: 'Cultura de cumprimento de combinados e previsibilidade operacional em quase todos os cargos.',
    principal_risco_organizacional: 'Lideranças intermediárias adiam conflitos, gerando desgaste acumulado e retrabalho.',
  },
  indicadores: {
    total_avaliados: 48,
    total_avaliacoes: 192,
    media_geral: 2.7,
    pct_nivel_1: 12, pct_nivel_2: 33, pct_nivel_3: 41, pct_nivel_4: 14,
  },
  comparativo_f1_f3: {
    analise: 'Entre o diagnóstico inicial (F1) e o mapeamento atual (F3), a média subiu de 2,3 para 2,7. O avanço mais forte veio de Organização e Foco no Resultado; as competências relacionais evoluíram pouco.',
    destaque_positivo: 'Coordenação Pedagógica saiu de média 2,1 para 3,0 em um ciclo.',
    destaque_atencao: 'Gestão de Conflitos segue estagnada em 1,9 apesar das ações do último ciclo.',
  },
  visao_por_cargo: [
    { cargo: 'Coordenação Pedagógica', media: 3.0, analise: 'Cargo mais maduro do quadro: domina rotina, planejamento e acompanhamento de resultados. O teto de crescimento está em desenvolver liderados, não em executar mais.', ponto_forte: 'Excelência em planejamento e cumprimento de metas pedagógicas.', ponto_critico: 'Delega pouco — concentra decisões e satura a agenda.' },
    { cargo: 'Professores Referência', media: 2.8, analise: 'Grupo consistente na entrega e no vínculo com alunos. Comunicação com pares é o principal vetor de crescimento.', ponto_forte: 'Alto engajamento e domínio técnico da sala.', ponto_critico: 'Evita feedback entre pares, o que limita a troca de práticas.' },
    { cargo: 'Líderes de Turno', media: 2.2, analise: 'Cargo de maior alavancagem organizacional e também de maior risco: é onde os conflitos operacionais aparecem primeiro e são tratados tarde.', ponto_forte: 'Boa presença e proximidade com as equipes de base.', ponto_critico: 'Adia conversas corretivas — gera desgaste e retrabalho.' },
    { cargo: 'Equipe Administrativa', media: 2.6, analise: 'Sólida em processos e confiabilidade; ganha muito ao ampliar visão de contexto e priorização estratégica.', ponto_forte: 'Confiabilidade e rigor no processo.', ponto_critico: 'Foco no operacional imediato em detrimento das prioridades.' },
  ],
  competencia_foco_por_cargo: [
    { cargo: 'Coordenação Pedagógica', competencia_recomendada: 'Desenvolvimento de Pessoas', justificativa: 'Média alta (3,0) em execução com baixa delegação: o ganho marginal agora vem de multiplicar capacidade, não de fazer mais. Quanti: 80% concentram decisões. Quali: relatos de saturação de agenda.', expectativa_impacto: 'Times mais autônomos e redução da dependência da coordenação.', horizonte_sugerido: 'medio' },
    { cargo: 'Professores Referência', competencia_recomendada: 'Comunicação Assertiva', justificativa: 'Entrega técnica forte, mas troca entre pares travada pela evitação de feedback. Destravar isso multiplica boas práticas com custo zero.', expectativa_impacto: 'Disseminação de práticas e menos ilhas de conhecimento.', horizonte_sugerido: 'curto' },
    { cargo: 'Líderes de Turno', competencia_recomendada: 'Gestão de Conflitos', justificativa: 'Competência mais crítica (média 1,9) no cargo de maior exposição a fricção. É a alavanca de maior retorno organizacional do ciclo.', expectativa_impacto: 'Queda no desgaste de equipe e no retrabalho por conflito mal resolvido.', horizonte_sugerido: 'curto' },
    { cargo: 'Equipe Administrativa', competencia_recomendada: 'Visão Estratégica', justificativa: 'Confiabilidade alta com foco excessivo no imediato. Ampliar contexto eleva a qualidade das priorizações.', expectativa_impacto: 'Priorização mais alinhada às metas institucionais.', horizonte_sugerido: 'longo' },
  ],
  competencias_criticas: [
    { competencia: 'Gestão de Conflitos', criticidade: 'CRITICA', motivo: 'Menor média do quadro (1,9) e concentrada exatamente nas lideranças intermediárias, que são o ponto de contato com a base.', impacto: 'Conflitos mal resolvidos escalam para a direção e corroem a confiança das equipes.' },
    { competencia: 'Comunicação Assertiva', criticidade: 'ATENCAO', motivo: 'Média intermediária (2,4), mas com forte efeito multiplicador: destrava feedback e troca entre pares.', impacto: 'Sem ela, boas práticas ficam presas em silos e o clima acumula não-ditos.' },
    { competencia: 'Organização e Planejamento', criticidade: 'ESTAVEL', motivo: 'Ponto forte transversal (3,3), sustenta a previsibilidade da operação.', impacto: 'Base sólida que permite investir energia nas competências relacionais.' },
  ],
  treinamentos_sugeridos: [
    { titulo: 'Mediação de Conflitos na Prática', competencia: 'Gestão de Conflitos', publico: 'Líderes de Turno e Coordenação', custo: 'medio', prioridade: 'URGENTE', carga_horaria: '16h (4 encontros)', formato: 'presencial', justificativa: 'Ataca diretamente a competência mais crítica no cargo de maior exposição, com prática guiada de casos reais.', entra_se_orcamento_curto: true },
    { titulo: 'Feedback que Gera Ação', competencia: 'Comunicação Assertiva', publico: 'Professores Referência e lideranças', custo: 'baixo', prioridade: 'IMPORTANTE', carga_horaria: '8h (2 encontros)', formato: 'misto', justificativa: 'Modelo fato-impacto-pedido, alto retorno e baixo custo; destrava a troca entre pares.', entra_se_orcamento_curto: true },
    { titulo: 'Delegar para Desenvolver', competencia: 'Desenvolvimento de Pessoas', publico: 'Coordenação Pedagógica', custo: 'medio', prioridade: 'IMPORTANTE', carga_horaria: '12h (mentoria em grupo)', formato: 'mentoria', justificativa: 'Reduz a saturação da coordenação e forma sucessores.', entra_se_orcamento_curto: false },
    { titulo: 'Visão Estratégica para Times de Apoio', competencia: 'Visão Estratégica', publico: 'Equipe Administrativa', custo: 'alto', prioridade: 'DESEJAVEL', carga_horaria: '20h (trilha online)', formato: 'online', justificativa: 'Amplia o contexto de decisão do time de apoio; retorno de médio prazo.', entra_se_orcamento_curto: false },
  ],
  perfil_disc_organizacional: {
    descricao: 'O perfil coletivo tende a concentrar traços de Estabilidade (S) e Conformidade (C), o que costuma indicar uma cultura confiável, cuidadosa e orientada a processo. Como hipótese, esse padrão favorece a consistência, mas pode tornar a organização lenta para confrontar problemas e avessa a mudanças bruscas.',
    forca_coletiva: 'Confiabilidade, baixa rotatividade e forte adesão a combinados e processos.',
    risco_coletivo: 'Evitação coletiva de conflito e resistência a decisões impopulares necessárias.',
  },
  decisoes_chave: [
    { colaborador: 'Rafael Nogueira (Líder de Turno)', situacao: 'Alto potencial de liderança, mas mediações adiadas geraram duas escaladas no último mês.', acao: 'Inscrever na turma de Mediação e acompanhar com mentoria quinzenal da coordenação.', criterio_reavaliacao: 'Reavaliar em 60 dias pela redução de escaladas.', consequencia: 'Sem ação, risco de desgaste da equipe e perda de um talento por sobrecarga de conflito.' },
    { colaborador: 'Beatriz Lemos (Coordenação)', situacao: 'Excelente executora saturada por concentrar decisões que poderia delegar.', acao: 'Definir 2 liderados para desenvolvimento e transferir decisões operacionais de rotina.', criterio_reavaliacao: 'Revisar carga e delegação em 45 dias.', consequencia: 'Risco de burnout e gargalo de decisões no setor pedagógico.' },
    { colaborador: 'Turma de Professores Referência', situacao: 'Grupo técnico forte com troca de práticas travada pela evitação de feedback.', acao: 'Rodar a formação de Feedback e criar rituais quinzenais de troca entre pares.', criterio_reavaliacao: 'Medir número de práticas compartilhadas em 90 dias.', consequencia: 'Conhecimento segue em silos e a evolução coletiva estagna.' },
  ],
  plano_acao: {
    curto_prazo: ['Abrir turma de Mediação de Conflitos para Líderes de Turno e Coordenação', 'Rodar a formação de Feedback com Professores Referência', 'Instituir ritual quinzenal de troca de práticas entre pares'],
    medio_prazo: ['Estruturar programa de delegação e sucessão na Coordenação', 'Acompanhar indicadores de conflito e retrabalho por turno', 'Criar trilha de comunicação assertiva no LMS interno'],
    longo_prazo: ['Desenvolver visão estratégica na equipe de apoio', 'Consolidar cultura de feedback contínuo institucional', 'Reavaliar o quadro completo no próximo ciclo semestral'],
  },
  mensagem_final: 'A base operacional é sólida e confiável — esse é um ativo raro. O próximo ciclo deve concentrar energia nas competências relacionais das lideranças intermediárias, onde está o maior risco e também o maior retorno. Investir em mediação e feedback agora evita crises caras adiante.',
  alertas_metodologicos: ['As médias por cargo com n<5 (Líderes de Turno) devem ser lidas como tendência, não como estatística fechada.'],
};

// ══════════════════════════════════════════════════════════════════════════
// 3) RELATÓRIO DO GESTOR
// ══════════════════════════════════════════════════════════════════════════
const gestorConteudo = {
  resumo_executivo: {
    leitura_geral: 'Sua equipe é engajada e confiável no dia a dia, com avanços claros em organização e foco no resultado. O ponto que mais trava o próximo salto do grupo é a forma como os conflitos são tratados: cedo demais eles somem, tarde demais viram desgaste. Há dois nomes em atenção prioritária e três destaques que merecem reconhecimento imediato.',
    principal_avanco: 'Camila evoluiu de N2 para N3 em Foco no Resultado em um único ciclo.',
    principal_ponto_de_atencao: 'Dois liderados adiam conversas corretivas, gerando retrabalho recorrente.',
  },
  destaques_evolucao: [
    { nome: 'Camila Torres', competencia: 'Foco no Resultado', nivel: 3, motivo_destaque: 'Assumiu uma meta acima do confortável e entregou com qualidade, puxando o grupo.' },
    { nome: 'André Prado', competencia: 'Organização e Planejamento', nivel: 4, motivo_destaque: 'Virou referência do time em documentação e antecipação de gargalos.' },
    { nome: 'Juliana Reis', competencia: 'Comunicação Assertiva', nivel: 3, motivo_destaque: 'Passou a dar feedback específico e no momento certo, sem esperar acumular.' },
  ],
  ranking_atencao: [
    { nome: 'Rafael Nogueira', competencia: 'Gestão de Conflitos', nivel: 1, urgencia: 'alta', motivo: 'Adia mediações até a fricção virar escalada.', risco_se_nao_agir: 'Desgaste da equipe e possível perda de um talento por sobrecarga de conflito.' },
    { nome: 'Marcos Vidal', competencia: 'Comunicação Assertiva', nivel: 1, urgencia: 'media', motivo: 'Suaviza tanto as mensagens sensíveis que o combinado não fica claro.', risco_se_nao_agir: 'Retrabalho por instruções ambíguas e frustração acumulada no time.' },
    { nome: 'Patrícia Alves', competencia: 'Foco no Resultado', nivel: 2, urgencia: 'baixa', motivo: 'Entrega no prazo, mas com metas pouco ambiciosas.', risco_se_nao_agir: 'Estagnação do potencial; risco baixo no curto prazo.' },
  ],
  analise_por_competencia: [
    { competencia: 'Gestão de Conflitos', media_nivel: 1.8, distribuicao: { n1: 3, n2: 2, n3: 1, n4: 0 }, padrao_observado: 'O grupo evita o conflito no início e só intervém quando o custo já é alto. A serenidade existe, falta o gatilho de agir cedo.', acao_gestor: 'Combine com cada liderado uma regra simples: toda tensão percebida vira conversa de 15 minutos no mesmo dia.', impacto_se_nao_agir: 'Conflitos pequenos viram crises de semanas e chegam à sua mesa já corroídos.' },
    { competencia: 'Comunicação Assertiva', media_nivel: 2.3, distribuicao: { n1: 1, n2: 3, n3: 2, n4: 0 }, padrao_observado: 'Comunicação calorosa no cotidiano, mas que perde clareza nos temas sensíveis por excesso de suavização.', acao_gestor: 'Modele o padrão fato-impacto-pedido nas suas 1:1 e peça que repliquem em uma situação por semana.', impacto_se_nao_agir: 'Instruções ambíguas geram retrabalho e não-ditos que pesam no clima.' },
    { competencia: 'Organização e Planejamento', media_nivel: 3.4, distribuicao: { n1: 0, n2: 1, n3: 3, n4: 2 }, padrao_observado: 'Força consolidada do time: previsibilidade alta e poucos combinados perdidos.', acao_gestor: 'Use os mais fortes (André) como multiplicadores de método para quem ainda patina.', impacto_se_nao_agir: 'Subaproveitamento de uma força que poderia elevar todo o grupo.' },
    { competencia: 'Foco no Resultado', media_nivel: 2.9, distribuicao: { n1: 0, n2: 2, n3: 3, n4: 1 }, padrao_observado: 'Entrega consistente; o teto está na ambição das metas e na visibilidade dos resultados.', acao_gestor: 'Peça a cada um uma meta 20% acima do usual e um resumo curto de resultados por quinzena.', impacto_se_nao_agir: 'Time competente que permanece invisível nas decisões por não comunicar entregas.' },
  ],
  perfil_disc_equipe: {
    descricao: 'A equipe tende a concentrar perfis de Estabilidade (S), o que costuma indicar um grupo leal, cooperativo e previsível. Como hipótese contextual, esse padrão favorece a harmonia, mas pode dificultar o confronto necessário e a velocidade de mudança.',
    forca_coletiva: 'Cooperação, lealdade e baixa rotatividade — um time que sustenta o combinado.',
    risco_coletivo: 'Evitação de conflito e desconforto coletivo com decisões impopulares.',
  },
  acoes: {
    acao_principal: 'Institua a regra da "conversa de 15 minutos no mesmo dia" para qualquer tensão percebida — comece por Rafael.',
    esta_semana: ['Ter uma 1:1 com Rafael sobre a mediação adiada mais recente', 'Reconhecer publicamente a evolução de Camila e André', 'Modelar o feedback fato-impacto-pedido em duas conversas'],
    proximas_semanas: ['Combinar com cada liderado a regra dos 15 minutos para conflitos', 'Colocar André como par de apoio de quem patina em planejamento', 'Pedir a cada um uma meta 20% acima do usual'],
    medio_prazo: ['Inscrever Rafael e Marcos na formação de mediação/feedback', 'Criar ritual quinzenal de troca de práticas no time', 'Acompanhar a queda de retrabalho por conflito mal resolvido'],
  },
  papel_do_gestor: {
    semanal: 'Uma 1:1 curta por liderado com foco em um combinado verificável; reforce sempre o avanço antes da correção.',
    quinzenal: 'Revisar os acordos de conflito e as metas ambiciosas combinadas; ajustar quem precisa de mais apoio.',
    proximo_ciclo: 'Consolidar a cultura de feedback contínuo e reavaliar Rafael e Marcos nas competências relacionais.',
  },
  mensagem_final: 'Você tem um time bom que pode ficar excelente com um único ajuste de hábito: tratar o conflito cedo. Não precisa fazer tudo na segunda-feira — comece pela conversa com o Rafael e deixe o resto seguir.',
  alertas_metodologicos: ['A leitura de Gestão de Conflitos apoia-se em poucas situações observadas; confirme no próximo ciclo.'],
};

// ══════════════════════════════════════════════════════════════════════════
// 4) CONTEÚDO FINAL (editorial com plano de layout rico)
// ══════════════════════════════════════════════════════════════════════════
const conteudoMd = `# Antecipar Problemas Antes que Eles Estourem

## Por que isso importa
No dia a dia da liderança, o problema quase nunca chega de surpresa: ele avisa antes, em sinais fracos que a rotina abafa. Quem aprende a ler esses sinais decide com calma; quem espera o estouro decide no susto, sob pressão e com menos opções. A diferença entre um líder reativo e um antecipativo raramente é inteligência — é o hábito de olhar cedo.

> O melhor momento para resolver um problema é quando ele ainda é pequeno o bastante para caber numa conversa de quinze minutos.

## O que é pensar à frente
Pensar à frente é criar margem de manobra antes que a urgência tire suas escolhas. É um comportamento treinável, feito de pequenos rituais de atenção — não de um dom raro de previsão.
- Lê os sinais fracos antes que virem crise
- Cria margem de tempo e de opções
- Transforma pressa em decisão calma
Pensar à frente não é adivinhar o futuro nem viver ansioso com tudo que pode dar errado. Não é controlar cada variável, e sim proteger as poucas que realmente importam.

## Um caso real
Uma coordenadora percebeu, numa terça qualquer, dois professores se evitando no corredor. Custava-lhe nada esperar "para ver se passava". Em vez disso, chamou os dois para um café de quinze minutos ainda naquela semana. O desconforto era pequeno, a conversa foi curta, e a fricção morreu ali. Três meses depois, ela soube por acaso que uma tensão idêntica em outra equipe — deixada para depois — havia virado um pedido de transferência.

## Reativo vs Antecipativo
### Reativo
- Espera o problema estourar para agir
- Decide no susto, com poucas opções na mesa
- Gasta energia apagando incêndios
- Custo alto e moral da equipe abalada
### Antecipativo
- Lê os sinais fracos e age cedo
- Decide com calma, tempo e dados
- Investe energia em prevenção
- Custo menor e equipe mais confiante

## Passo a passo
1. Reserve dez minutos no fim do dia para varrer os sinais fracos da equipe
2. Nomeie por escrito a tensão ou risco que você percebeu, sem julgar
3. Estime o custo de não agir agora — em tempo, clima e retrabalho
4. Escolha a menor ação possível que reduz esse custo e execute em 48 horas

## Checklist da semana
- Identifiquei ao menos um sinal fraco antes que virasse problema
- Nomeei a tensão por escrito, separando fato de interpretação
- Tomei uma ação pequena dentro de 48 horas
- Registrei o que funcionou para repetir na próxima vez

## Roteiro de conversa
- Percebi uma tensão aqui e prefiro tratar enquanto é pequena — tudo bem conversarmos dez minutos?
- Me ajuda a entender o que você viu dessa situação?
- O que precisaria mudar para isso não se repetir na próxima semana?

## Perguntas para refletir
- Qual sinal fraco você tem ignorado por parecer pequeno demais?
- Que conversa de quinze minutos você vem adiando há semanas?
`;

function buildConteudoFinalPlan(): LayoutPlan {
  const blocks = parseBlocks(conteudoMd, { skipFirstH1: true });
  const h2 = blocks.filter(b => b.kind === 'h2').map(b => b.id);
  const ps = blocks.filter(b => b.kind === 'p').map(b => b.id);
  const uls = blocks.filter(b => b.kind === 'ul').map(b => b.id);
  const ols = blocks.filter(b => b.kind === 'ol').map(b => b.id);
  const quotes = blocks.filter(b => b.kind === 'quote').map(b => b.id);
  console.log('[conteudo-final blocks]', { h2: h2.length, p: ps.length, ul: uls.length, ol: ols.length, quote: quotes.length });

  return {
    summary: 'Micro-conteúdo editorial sobre antecipação de problemas na liderança.',
    pages: [
      {
        role: 'contexto',
        heroImage: true,
        items: [
          { as: 'heading', ref: h2[0] },
          { as: 'synthesis', ref: ps[0] },
          { as: 'pullquoteText', ref: ps[0], text: 'a diferença entre um líder reativo e um antecipativo raramente é inteligência' },
          { as: 'pullquote', ref: quotes[0] },
        ] as PlanItem[],
      },
      {
        role: 'conceito',
        items: [
          { as: 'heading', ref: h2[1] },
          { as: 'diagram', affirm: { refs: [ps[1], uls[0]] }, negate: { refs: [ps[2]] } },
        ] as PlanItem[],
      },
      {
        role: 'exemplo',
        items: [
          { as: 'heading', ref: h2[2] },
          { as: 'caseCard', ref: ps[3] },
        ] as PlanItem[],
      },
      {
        role: 'comparativo',
        items: [
          { as: 'heading', ref: h2[3] },
          { as: 'comparison', left: { label: 'Reativo', refs: [uls[1]] }, right: { label: 'Antecipativo', refs: [uls[2]] } },
        ] as PlanItem[],
      },
      {
        role: 'ferramenta',
        items: [
          { as: 'heading', ref: h2[4] },
          { as: 'flow', ref: ols[0] },
          { as: 'heading', ref: h2[5] },
          { as: 'checklist', ref: uls[3] },
          { as: 'heading', ref: h2[6] },
          { as: 'script', ref: uls[4] },
        ] as PlanItem[],
      },
      {
        role: 'reflexao',
        items: [
          { as: 'heading', ref: h2[7] },
          { as: 'reflectionCards', ref: uls[5] },
        ] as PlanItem[],
      },
    ],
  };
}

// ══════════════════════════════════════════════════════════════════════════
async function main() {
  const errors: string[] = [];

  try {
    // renderConteudoFinalPDF importa @react-pdf/renderer DINAMICAMENTE; sob tsx
    // esse import resolve numa instância cujo Font store não vê a fonte registrada
    // pelo import estático de styles.ts. Registramos NotoSans nessa instância.
    const rpdf: any = await import('@react-pdf/renderer');
    const F = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/';
    rpdf.Font.register({
      family: 'NotoSans',
      fonts: [
        { src: F + 'latin-400-normal.ttf', fontWeight: 400 },
        { src: F + 'latin-400-italic.ttf', fontWeight: 400, fontStyle: 'italic' },
        { src: F + 'latin-500-normal.ttf', fontWeight: 500 },
        { src: F + 'latin-600-normal.ttf', fontWeight: 600 },
        { src: F + 'latin-700-normal.ttf', fontWeight: 700 },
      ],
    });
    rpdf.Font.registerHyphenationCallback((w: string) => [w]);
    const plan = buildConteudoFinalPlan();
    const buf = await renderConteudoFinalPDF({
      titulo: 'Antecipar Problemas Antes que Eles Estourem',
      conteudoMd,
      competencia: 'Pensamento Estratégico',
      descritor: 'Antecipação de riscos',
      formato: 'texto',
      empresaNome: EMPRESA,
      coverBase64: null,
      plan,
      sectionImageBase64: null,
    });
    await save('13-conteudo-final', buf);
  } catch (e: any) { console.error('FAIL conteudo-final', e); errors.push('conteudo-final: ' + e.message); }

  try {
    const data = { conteudo: individualConteudo, colaborador_nome: 'Mariana Figueiredo Costa', colaborador_cargo: 'Coordenadora Pedagógica', gerado_em: NOW };
    // @ts-ignore - JSX com renderToBuffer (mesmo padrão de app/api/radar/lead-pdf/route.ts)
    const buf = await renderToBuffer(React.createElement(RelatorioIndividualPDF, { data, empresaNome: EMPRESA, logoBase64: logo }));
    await save('06-relatorio-individual', buf);
  } catch (e: any) { console.error('FAIL individual', e); errors.push('individual: ' + e.message); }

  try {
    const data = { conteudo: rhConteudo, gerado_em: NOW };
    // @ts-ignore - JSX com renderToBuffer (mesmo padrão de app/api/radar/lead-pdf/route.ts)
    const buf = await renderToBuffer(React.createElement(RelatorioRHPDF, { data, empresaNome: EMPRESA, logoBase64: logo }));
    await save('07-relatorio-rh', buf);
  } catch (e: any) { console.error('FAIL rh', e); errors.push('rh: ' + e.message); }

  try {
    const data = { conteudo: gestorConteudo, gestor_nome: 'Eduardo Menezes', gerado_em: NOW };
    // @ts-ignore - JSX com renderToBuffer (mesmo padrão de app/api/radar/lead-pdf/route.ts)
    const buf = await renderToBuffer(React.createElement(RelatorioGestorPDF, { data, empresaNome: EMPRESA, logoBase64: logo }));
    await save('08-relatorio-gestor', buf);
  } catch (e: any) { console.error('FAIL gestor', e); errors.push('gestor: ' + e.message); }

  if (errors.length) { console.error('\nERROS:', errors); process.exit(1); }
  console.log('\nTodos os 4 PDFs gerados em', OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
