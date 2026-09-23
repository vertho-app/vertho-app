# Simulador de liderança

> Atualizado em 20/09/2026, conferido com o código do commit `7b46e65f`. Resultados de execução têm suas datas indicadas abaixo.

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

A "Sua jornada" consolida todos os encontros concluídos (originais e repetições): por competência, o primeiro nível e o MAIOR nível demonstrado, com "Subiu de nível" quando houve avanço. Queda não é mostrada, como no resto do produto. Depois do quinto encontro, sugere repetir o encontro cuja competência em foco esteja sem nível ou tenha o menor nível alcançado, usando a quantidade de encontros com nível como desempate. Só há sugestão se essa competência ainda estiver abaixo de N3.

## Avaliação

A matriz global (cinco competências, seis descritores cada, variantes Líder `LD0x` e Futuro Líder `FL0x`, mesmos nomes) é congelada no início. Competências se casam pelo NOME, igual nas duas variantes: até 18/09 o casamento era pelo código `LD0x`, e o futuro líder recebia a devolutiva vazia.

O avaliador recebe só os 18 descritores do encontro (foco + 2 secundárias), a preparação, o diálogo com autoria identificada, a reflexão e, dos encontros anteriores, só os acordos e pendências (para julgar continuidade). Não recebe o dossiê, as consequências geradas nem as avaliações anteriores. O JSON Schema enviado à IA exige a quantidade exata e restringe os códigos à matriz daquele encontro, inclusive os descritores sem oportunidade; a validação posterior também exige cada código uma única vez.

- **Fonte por descritor:** a preparação só sustenta o descritor de preparação e propósito da conversa (Comunicação, D1); a reflexão só sustenta Autoconsciência; os demais exigem fala do líder.
- **Citação tolerante** (`lib/simuladores/citacao.ts`): aspas, reticências, travessões, espaços e caixa são equiparados. Citação inválida em até 20% dos descritores avaliados rebaixa só esses (ficam sem nível, marcados em `descartados`); acima disso, a avaliação é recusada e reenviada uma vez.
- **Regra de cobertura** (`lib/simuladores/cobertura.ts`, decisão do dono de 18/09/2026): a competência só recebe nível com pelo menos 4 descritores observados. Desde a revisão de 19/09, participante e equipe veem os níveis por competência no encontro; a média geral aparece apenas na síntese da jornada, com pelo menos 3 competências com nível. **Confirmado pelo dono em 22/09/2026 e travado por teste:** cada encontro avalia 3 competências, então exigir 3 com nível deixava a caixa "Média do encontro" quase sempre vazia (na sonda de 19/09: Análise 6/6, Comunicação 5/6, Priorização 0/6). O rótulo dela saiu dos quatro idiomas e `tests/unit/simulador-lideranca-media-encontro.test.ts` falha se a média voltar ao encontro, inclusive no caso em que ela existiria. A síntese usa a maior nota demonstrada em cada competência, entre encontros originais e repetições. Não é nota de prontidão nem resultado do Mapeamento de liderança. A versão da regra fica gravada na avaliação (`regraCobertura`).
- **Medições de IA (19/09/2026):** a sonda `tests/unit/simulador-lideranca-avaliador-live.test.ts` registrou 17 s no encontro 1, sem descritores descartados: Análise 6/6 (N3), Comunicação 5/6 (N3), Priorização 0/6 (sem nível). O ensaio posterior, com schema específico, produziu 20/20 avaliações válidas e níveis iguais em 23/30 comparações entre repetições; nove descritores foram descartados em cinco relatórios por evidência inválida. São verificações de formato, evidência e repetibilidade; a classificação independente por profissionais segue pendente. Método, limites e resultados completos em [simuladores-validacao.md](simuladores-validacao.md).
- Avaliações da jornada v1 (30 descritores, sem regra) são lidas como foram geradas. A jornada v1 é atualizada para v2 no próximo comando, com os prompts novos.

## Acesso e operação

A mesma população do programa de liderança pode treinar: módulo contratado, cargo liberado, participação no programa e permissão `assessments.answer`. Isso inclui líderes atuais e futuros líderes. Não depende de concluir DISC, cenários ou de ter Top 5 no cargo.

**Acompanhamento (decisão do dono, 18/09/2026):** RH e gestor veem quem pode praticar, quem começou, o progresso e o maior nível por competência, e abrem as devolutivas de cada pessoa (`/api/simulador-lideranca/equipe`, `lib/simulador-lideranca/equipe.ts`). A régua de acesso é a dos outros simuladores: papel de acompanhamento, `journey.team.view` e `reports.individual.view`, e por pessoa `canViewColabJourney` (RH vê a empresa, gestor os liderados; o papel tutor foi extinto em 22/09/2026). A devolutiva vai com os trechos citados como evidência; a conversa completa, a preparação e a reflexão ficam com a pessoa, e a tela do participante diz isso. Exportação CSV com proteção contra fórmulas. Quem pratica e acompanha vê as abas "Meu treino" e "Equipe"; o RH, que não pratica, entra pelo item "Simulações de liderança" do menu.

**Sem revisão humana (decisão do dono, 22/09/2026):** RH e gestor leem as devolutivas e não registram parecer; `/api/simulador-lideranca/equipe` só lê. A revisão existiu de 19 a 22/09 (migs 264 e 265); a tabela `sim_lideranca_revisoes` ficou no banco sem escritor, porque a retenção e a exclusão da mig 265 a leem. Na mesma decisão, a aba Simuladores de `/admin/cargos` passou a dizer só quem TREINA: o acompanhamento acima e o Mapeamento de liderança do RH não dependem dela.

Administradores experimentam em `/admin/simulador-lideranca`, selecionando a empresa no painel, e veem a aba da equipe. Cada administrador tem acervo próprio, separado dos colaboradores, e as chamadas são identificadas como `piloto`. Não há liberação automática de novos tenants nem envio de convites.

As tarefas `sim_lideranca_abertura`, `sim_lideranca_personagem`, `sim_lideranca_consequencia` e `sim_lideranca_avaliador` estão no catálogo central, pinadas para não herdar um modelo genérico incompatível. Prompts e modelos são registrados no snapshot da jornada; a atualização explícita de v1 para v2 substitui os prompts no próximo comando, preservando as avaliações concluídas. Toda chamada usa `callAI`, JSON Schema estrito, `store:false` pelo wrapper e ledger central. O conteúdo da história e da matriz é em português brasileiro; controles têm traduções nos quatro idiomas. A devolutiva usa o componente comum aos três simuladores (`components/simuladores/relatorio-competencias.tsx`). Ditado reaproveita o componente de vendas.

## Persistência e recuperação

Migration 260: `sim_lideranca_jornadas` (uma por identidade/empresa), `sim_lideranca_episodios` (acervo de encontros concluídos) e `sim_lideranca_chamadas` (checkpoints de IA). O snapshot privado é projetado explicitamente para o navegador; prompts/modelos não são retornados. Os guards de leitura e mutação cobrem as três tabelas.

Revisão e lease de 330 segundos impedem duas abas de gravarem simultaneamente. A RPC `sim_lideranca_salvar` grava estado, recibo e episódio na mesma transação, verificando tenant, proprietário, revisão e token. Comandos concluídos podem ser reenviados sem duplicar a transição. Checkpoints validados evitam repetir o avaliador se a etapa de consequência falhar. Uma queda entre receber a resposta do provedor e gravar seu checkpoint ainda pode gerar nova cobrança no reenvio.

Exclusão (migration 262): o DELETE direto de um colaborador (reset do demo) desvincula a jornada (`colaborador_id` vira NULL) em vez de travar; a exclusão confirmada pela interface inclui jornadas, encontros e chamadas na prévia, no backup e na mesma transação do vendas e do atendimento. A migration 265 também inclui as revisões humanas nos snapshots e hashes de exclusão. A retenção de seis meses do simulador de vendas não constitui uma rotina de retenção da liderança.

## Verificação

- `tests/unit/simulador-lideranca-*.test.ts`: sequência, repetição, abandono de repetição, avaliação v2 (estrutura, fonte, tolerância, cobertura, variante futuro, legado), síntese, acompanhamento (quem vê quem, sem conversa) e acesso.
- `node scripts/verify-lideranca-ui.mjs`: componentes reais com API fictícia; cinco encontros, síntese, repetição com confirmação, comparação, retomada, falha recuperável, aba da equipe e detalhe, mobile e quatro idiomas. Imagens em `tmp/lideranca-ui`.
- `node --env-file=.env.local scripts/verify-lideranca-db.mjs`: migration e contrato SQL real dentro de transação com rollback integral.
- `tests/unit/simulador-lideranca-schema-geracao.test.ts` e `tests/unit/simuladores-revisao-*.test.ts`: schema específico do encontro, autorização, idempotência e vínculo da revisão com o recorte atual.

A primeira entrega foi publicada em 17/09/2026 nos commits `b5adc5aa` e `ec91d260`, com a migration 260 aplicada. Naquela versão, passaram build, TypeScript, quatro idiomas, 5.516 testes e a jornada completa com IA real em tenant de demonstração. Os registros técnicos dessa sonda foram arquivados em backup local e removidos do acervo de treino; o ledger foi preservado.

As mudanças de 18 e 19/09 estão incorporadas neste documento. A validação da revisão `7b46e65f` registra 5.911 testes aprovados, interfaces em quatro idiomas, build e TypeScript, além dos ensaios de IA, em [simuladores-validacao.md](simuladores-validacao.md). Esses números são registros das respectivas entregas, não uma nova execução em 20/09.

**Dependência operacional:** a migration 265 precisa estar aplicada antes do código que usa o contexto de revisão. O registro de validação de 19/09 confirma o ensaio com rollback e deixa a aplicação definitiva pendente; esta atualização documental não aplica nem confirma essa migration. A verificação e aplicação estão descritas em [simuladores-validacao.md](simuladores-validacao.md#banco).

Publicação segue build, typecheck, suíte unitária e push para master; alterações apenas de Markdown dispensam build, conforme a skill de deploy do projeto. Nenhuma task Trigger.dev foi criada para o simulador.
