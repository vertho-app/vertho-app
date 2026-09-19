# Simulador de liderança

Jornada interativa de cinco encontros com a mesma equipe fictícia, em `/dashboard/simulador-lideranca`. O participante prepara a conversa, interage com um personagem, registra sua reflexão e recebe uma devolutiva pela matriz global de liderança. O Mapeamento de liderança (avaliação por cenários, antes chamado de prontidão) permanece em `/dashboard/assessment?trilho=lideranca`; o treino não grava em `respostas`, `descriptor_assessments`, DISC, PDI ou no mapeamento.

## Experiência e continuidade

Cada encontro avalia a competência em FOCO e duas SECUNDÁRIAS, escolhidas pelo que o dossiê daquele encontro provoca (jornada v2, 18/09/2026). A distribuição é equilibrada: cada competência é avaliada em exatamente 3 dos 5 encontros.

| Encontro | Situação | Foco | Secundárias |
|---|---|---|---|
| 1 | Ana: investigar atrasos | Análise e Diagnóstico de Situações | Comunicação; Priorização |
| 2 | Bruno: delegar com apoio | Desenvolvimento de Pessoas | Comunicação; Priorização |
| 3 | Camila: feedback e divergência | Comunicação e Conversas de Liderança | Desenvolvimento; Autoconsciência |
| 4 | Rafa: negociar capacidade e prioridades | Priorização e Tomada de Decisão | Análise; Autoconsciência |
| 5 | Ana: ouvir feedback e ajustar a abordagem | Autoconsciência e Aprendizagem Contínua | Análise; Desenvolvimento |

A abertura e o personagem recebem os acordos, consequências simuladas e pendências dos encontros anteriores. Acordos exigem citação literal de uma fala do participante. Consequências são acontecimentos da simulação, não resultados reais no trabalho. A preparação não é enviada ao personagem.

São de 3 a 16 rodadas por encontro. A reflexão encerra a conversa. Os encontros originais avançam em ordem; não há salto. Repetir um encontro concluído pede confirmação e parte dos antecedentes originais daquele ponto; a repetição é arquivada separadamente e não reescreve a sequência já vivida. Uma repetição em andamento pode ser abandonada (ação `abandonar`, sem chamada paga); o encontro da jornada original não pode. A tela compara o nível da competência em foco com a primeira tentativa.

A "Sua jornada" consolida todos os encontros concluídos (originais e repetições): por competência, o primeiro nível e o MAIOR nível demonstrado, com "Subiu de nível" quando houve avanço. Queda não é mostrada, como no resto do produto. Depois do quinto encontro, sugere repetir aquele cujo foco teve menos evidência.

## Avaliação

A matriz global (cinco competências, seis descritores cada, variantes Líder `LD0x` e Futuro Líder `FL0x`, mesmos nomes) é congelada no início. Competências se casam pelo NOME, igual nas duas variantes: até 18/09 o casamento era pelo código `LD0x`, e o futuro líder recebia a devolutiva vazia.

O avaliador recebe só os 18 descritores do encontro (foco + 2 secundárias), a preparação, o diálogo com autoria identificada, a reflexão e, dos encontros anteriores, só os acordos e pendências (para julgar continuidade). Não recebe o dossiê, as consequências geradas nem as avaliações anteriores.

- **Fonte por descritor:** a preparação só sustenta o descritor de preparação e propósito da conversa (Comunicação, D1); a reflexão só sustenta Autoconsciência; os demais exigem fala do líder.
- **Citação tolerante** (`lib/simuladores/citacao.ts`): aspas, reticências, travessões, espaços e caixa são equiparados. Citação inválida em até 20% dos descritores avaliados rebaixa só esses (ficam sem nível, marcados em `descartados`); acima disso, a avaliação é recusada e reenviada uma vez.
- **Regra de cobertura** (`lib/simuladores/cobertura.ts`, decisão do dono de 18/09/2026): a competência só recebe nível com pelo menos 4 descritores observados; a média do encontro e a da jornada exigem 3 competências com nível. A versão da regra fica gravada na avaliação (`regraCobertura`).
- **Medição real (19/09/2026, `tests/unit/simulador-lideranca-avaliador-live.test.ts`, opt-in):** encontro 1 com uma condução razoável escrita à mão, modelo `gpt-5.4-2026-03-05`: 17 s (o teto é 115 s por tentativa), validação estrutural ok, nenhum descartado; Análise 6/6 (Nível 3), Comunicação 5/6 (Nível 3), Priorização 0/6 (sem nível). Leitura: como cada encontro avalia só 3 competências, a regra de 3 competências com nível exige que as TRÊS cheguem a 4 observados, e a média do ENCONTRO tende a não aparecer; a média da JORNADA (5 competências, cada uma em 3 encontros) é onde a regra funciona. Decisão pendente do dono: manter assim ou aplicar a média só à jornada. Uma medição, uma conversa: não é calibração.
- Avaliações da jornada v1 (30 descritores, sem regra) são lidas como foram geradas. A jornada v1 é atualizada para v2 no próximo comando, com os prompts novos.

## Acesso e operação

A mesma população do programa de liderança pode treinar: módulo contratado, cargo liberado, participação no programa e permissão `assessments.answer`. Isso inclui líderes atuais e futuros líderes. Não depende de concluir DISC, cenários ou de ter Top 5 no cargo.

**Acompanhamento (decisão do dono, 18/09/2026):** RH, gestor e tutor veem quem pode praticar, quem começou, o progresso e o maior nível por competência, e abrem as devolutivas de cada pessoa (`/api/simulador-lideranca/equipe`, `lib/simulador-lideranca/equipe.ts`). A régua de acesso é a dos outros simuladores: papel de acompanhamento, `journey.team.view` e `reports.individual.view`, e por pessoa `canViewColabJourney` (RH vê a empresa, gestor os liderados, tutor os tutorados). A devolutiva vai com os trechos citados como evidência; a conversa completa, a preparação e a reflexão ficam com a pessoa, e a tela do participante diz isso. Exportação CSV com proteção contra fórmulas. Quem pratica e acompanha vê as abas "Meu treino" e "Equipe"; o RH, que não pratica, entra pelo item "Simulações de liderança" do menu.

Administradores experimentam em `/admin/simulador-lideranca`, selecionando a empresa no painel, e veem a aba da equipe. Cada administrador tem acervo próprio, separado dos colaboradores, e as chamadas são identificadas como `piloto`. Não há liberação automática de novos tenants nem envio de convites.

As tarefas `sim_lideranca_abertura`, `sim_lideranca_personagem`, `sim_lideranca_consequencia` e `sim_lideranca_avaliador` estão no catálogo central, pinadas para não herdar um modelo genérico incompatível. Prompts e modelos ficam congelados na jornada. Toda chamada usa `callAI`, JSON Schema estrito, `store:false` pelo wrapper e ledger central. O conteúdo da história e da matriz é em português brasileiro; controles têm traduções nos quatro idiomas. A devolutiva usa o componente comum aos três simuladores (`components/simuladores/relatorio-competencias.tsx`). Ditado reaproveita o componente de vendas.

## Persistência e recuperação

Migration 260: `sim_lideranca_jornadas` (uma por identidade/empresa), `sim_lideranca_episodios` (acervo de encontros concluídos) e `sim_lideranca_chamadas` (checkpoints de IA). O snapshot privado é projetado explicitamente para o navegador; prompts/modelos não são retornados. Os guards de leitura e mutação cobrem as três tabelas.

Revisão e lease de 330 segundos impedem duas abas de gravarem simultaneamente. A RPC `sim_lideranca_salvar` grava estado, recibo e episódio na mesma transação, verificando tenant, proprietário, revisão e token. Comandos concluídos podem ser reenviados sem duplicar a transição. Checkpoints validados evitam repetir o avaliador se a etapa de consequência falhar. Uma queda entre receber a resposta do provedor e gravar seu checkpoint ainda pode gerar nova cobrança no reenvio.

Exclusão (migration 262): o DELETE direto de um colaborador (reset do demo) desvincula a jornada (`colaborador_id` vira NULL) em vez de travar; a exclusão confirmada pela interface inclui jornadas, encontros e chamadas na prévia, no backup e na mesma transação do vendas e do atendimento.

## Verificação

- `tests/unit/simulador-lideranca-*.test.ts`: sequência, repetição, abandono de repetição, avaliação v2 (estrutura, fonte, tolerância, cobertura, variante futuro, legado), síntese, acompanhamento (quem vê quem, sem conversa) e acesso.
- `node scripts/verify-lideranca-ui.mjs`: componentes reais com API fictícia; cinco encontros, síntese, repetição com confirmação, comparação, retomada, falha recuperável, aba da equipe e detalhe, mobile e quatro idiomas. Imagens em `tmp/lideranca-ui`.
- `node --env-file=.env.local scripts/verify-lideranca-db.mjs`: migration e contrato SQL real dentro de transação com rollback integral.
- Sonda de IA em tenant `is_demo`, usando acervo administrativo e sem disparos, antes da publicação.

Publicação segue build, typecheck, suíte unitária e push para master. Nenhuma task Trigger.dev foi criada.
