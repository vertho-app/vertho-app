# Simulador de liderança

Jornada interativa de cinco encontros com a mesma equipe fictícia, em `/dashboard/simulador-lideranca`. O participante prepara a conversa, interage com um personagem, registra sua reflexão e recebe uma devolutiva pela matriz global de liderança. A avaliação por cenários permanece em `/dashboard/assessment?trilho=lideranca`; o treino não grava em `respostas`, `descriptor_assessments`, DISC, PDI ou prontidão formal.

## Experiência e continuidade

1. Ana: investigar atrasos — Análise e Diagnóstico de Situações.
2. Bruno: delegar com apoio — Desenvolvimento de Pessoas.
3. Camila: feedback e divergência — Comunicação e Conversas de Liderança.
4. Rafa: negociar capacidade e prioridades — Priorização e Tomada de Decisão.
5. Ana: ouvir feedback e ajustar a abordagem — Autoconsciência e Aprendizagem Contínua.

A abertura e o personagem recebem os acordos, consequências simuladas e pendências dos encontros anteriores. Acordos exigem citação literal de uma fala do participante. Consequências são acontecimentos da simulação, não resultados reais no trabalho. A preparação não é enviada ao personagem.

São de 3 a 16 rodadas por encontro. A reflexão encerra a conversa. Os encontros originais avançam em ordem; não há salto. Ao repetir um encontro concluído, o participante parte dos antecedentes originais daquele ponto. A repetição é arquivada separadamente e não reescreve a sequência já vivida. A tela compara a média e a cobertura com a primeira tentativa. Todas as tentativas ficam acessíveis em histórico paginado.

## Avaliação

A matriz global (cinco competências, seis descritores cada) e os textos N1–N4 são congelados no início. O avaliador recebe preparação, diálogo com autoria identificada e reflexão. Não recebe dossiê, consequências geradas ou avaliação de encontros anteriores. Todos os 30 códigos devem aparecer uma única vez; notas exigem citações literais da fonte correta. Ausência de oportunidade é `null`, fora da média, com cobertura explícita. A média por competência usa apenas os descritores observados e `nivelDaNota` converte para o nível oficial. Não há nota geral de prontidão nem bônus por concordância do personagem.

## Acesso e operação

A mesma população configurada na prontidão pode treinar: módulo contratado, cargo liberado, participação no programa e permissão `assessments.answer`. Isso inclui líderes atuais e futuros líderes. RH continua com o painel de prontidão, sem treino pessoal. Não depende de concluir DISC, cenários ou de ter Top 5 no cargo.

Administradores experimentam em `/admin/simulador-lideranca`, selecionando a empresa no painel. Cada administrador tem acervo próprio, separado dos colaboradores, e as chamadas são identificadas como `piloto`. A configuração do programa e dos cargos permanece nas telas existentes. Não há liberação automática de novos tenants nem envio de convites.

As tarefas `sim_lideranca_abertura`, `sim_lideranca_personagem`, `sim_lideranca_consequencia` e `sim_lideranca_avaliador` estão no catálogo central, pinadas para não herdar um modelo genérico incompatível. Prompts e modelos ficam congelados na jornada. Toda chamada usa `callAI`, JSON Schema estrito, `store:false` pelo wrapper e ledger central. O conteúdo da história e da matriz é em português brasileiro; controles têm traduções nos quatro idiomas da aplicação. Ditado reaproveita o componente de vendas.

## Persistência e recuperação

Migration 260: `sim_lideranca_jornadas` (uma por identidade/empresa), `sim_lideranca_episodios` (acervo de encontros concluídos) e `sim_lideranca_chamadas` (checkpoints de IA). O snapshot privado é projetado explicitamente para o navegador; prompts/modelos não são retornados. Os guards de leitura e mutação cobrem as três tabelas. A API valida tenant, proprietário, permissão e programa; anon/authenticated não acessam as tabelas nem a RPC diretamente.

Revisão e lease de 330 segundos impedem duas abas de gravarem simultaneamente. A RPC `sim_lideranca_salvar` grava estado, recibo e episódio na mesma transação, verificando tenant, proprietário, revisão e token. Comandos concluídos podem ser reenviados sem duplicar a transição. Checkpoints validados evitam repetir o avaliador se a etapa de consequência falhar. Uma queda entre receber a resposta do provedor e gravar seu checkpoint ainda pode gerar nova cobrança no reenvio.

Nenhuma rotina de exclusão automática foi adicionada. As FKs impedem excluir cadastros com acervo sem tratar esse acervo; não há cascade implícito. Para rollback operacional, ocultar a entrada do treino e manter os dados.

## Verificação

- `tests/unit/simulador-lideranca-*.test.ts`: sequência, repetição, evidências, projeção pública e acesso.
- `node scripts/verify-lideranca-ui.mjs`: componentes reais com API fictícia; cinco encontros, repetição, comparação, retomada, falha recuperável e mobile. Imagens em `tmp/lideranca-ui`.
- `node --env-file=.env.local scripts/verify-lideranca-db.mjs`: migration e contrato SQL real dentro de transação com rollback integral.
- Sonda de IA em tenant `is_demo`, usando acervo administrativo e sem disparos, antes da publicação.

Publicação segue build, typecheck, suíte unitária e push para master. Nenhuma task Trigger.dev foi criada.
