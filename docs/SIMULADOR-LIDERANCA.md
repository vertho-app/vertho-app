# Simulador de liderança

> Atualizado em 27/09/2026 com as correções da revisão de fluxo, UX e código (branch `fix/sim-lideranca-20260927`, resumo em [Correções de 27/09/2026](#correções-de-27092026)). A base anterior foi conferida com o commit `7b46e65f`. Resultados de execução têm suas datas indicadas abaixo.

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

A abertura e o personagem recebem os acordos, consequências simuladas e pendências dos encontros anteriores. Acordos exigem citação de uma fala do participante no turno indicado, conferida com a mesma régua do avaliador (`contemCitacao`: aspas, reticências, espaços e caixa equiparados; até 27/09 era `includes` cru e a cópia tipográfica derrubava o encerramento com 502). Acordo sem fala que o sustente continua recusando a consequência inteira, com um reenvio: a narrativa é gerada junto e seguiria contando o acordo ao personagem do encontro seguinte, e descartar em silêncio seria fallback invisível. Consequências são acontecimentos da simulação, não resultados reais no trabalho. A preparação não é enviada ao personagem.

O briefing e a preparação mostram a competência em foco e as duas secundárias ("Também observadas: X e Y"): as secundárias também valem nível. No celular, depois da preparação registrada, o briefing recolhe numa linha (encontro, personagem, foco), a tela vai até o campo de fala a cada rodada e a conversa rola com a página, sem rolagem própria. Preparação e reflexão ficam como rascunho no aparelho (`localStorage`, por empresa, encontro e etapa, em try/catch) até o envio confirmado; a tela diz "Rascunho salvo neste aparelho".

São de 3 a 16 rodadas por encontro. A reflexão encerra a conversa. Os encontros originais avançam em ordem; não há salto. Repetir um encontro concluído pede confirmação e parte dos antecedentes originais daquele ponto; a repetição é arquivada separadamente e não reescreve a sequência já vivida. Uma repetição em andamento pode ser abandonada (ação `abandonar`, sem chamada paga); o encontro da jornada original não pode. A tela compara o nível da competência em foco com a primeira tentativa.

A "Sua jornada" consolida todos os encontros concluídos (originais e repetições): por competência, o primeiro nível e o MAIOR nível demonstrado, com "Subiu de nível" quando houve avanço. Queda não é mostrada, como no resto do produto. Depois do quinto encontro, sugere repetir o encontro cuja competência em foco esteja sem nível ou tenha o menor nível alcançado, usando a quantidade de encontros com nível como desempate. Só há sugestão se essa competência ainda estiver abaixo de N3. A copy diz esse critério ("menor nível alcançado, ou sem nível"; até 27/09 dizia "menos evidência") e, numa frase, o que falta demonstrar; o botão "Repetir o encontro N" já abre a confirmação daquele encontro.

Fim da jornada: a devolutiva do 5º encontro original abre com a síntese aberta em cima (a tela rola até ela), com a sugestão à vista. Nos demais encontros a síntese fica em "Consultar evolução da jornada". Na devolutiva, as ações (repetir, continuar, retomar) ficam junto da "Próxima prática", no topo.

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

**Acompanhamento (decisão do dono, 18/09/2026):** RH e gestor veem quem pode praticar, quem começou, o progresso e o maior nível por competência, e abrem as devolutivas de cada pessoa (`/api/simulador-lideranca/equipe`, `lib/simulador-lideranca/equipe.ts`). A régua de acesso é a dos outros simuladores: papel de acompanhamento, `journey.team.view` e `reports.individual.view`, e por pessoa `canViewColabJourney` (RH vê a empresa, gestor os liderados; o papel tutor foi extinto em 22/09/2026). A devolutiva vai com os trechos da CONVERSA citados como evidência. **Decisão do dono (D1, 27/09/2026):** evidência cuja fonte é a preparação ou a reflexão chega à equipe sem o texto e sem a justificativa daquele comportamento (que parafraseia o mesmo texto): a tela mostra "Evidência da preparação (o texto fica com a pessoa)" e o nível. A projeção é uma só, `lib/simulador-lideranca/visao-equipe.ts`, usada pelo servidor e pelo verificador de tela; a pessoa segue vendo tudo na própria devolutiva, e `visibilityNotice` e `teamPrivacy` descrevem exatamente isso. A síntese e a próxima prática que o avaliador escreveu seguem visíveis para a equipe, a primeira rotulada "Devolutiva que a pessoa recebeu" (texto em segunda pessoa, como citação), a segunda como "Orientação sugerida à pessoa". O painel lê do banco só o que a síntese usa (índice, fim e avaliação de cada encontro original, por caminho JSON), nunca a conversa. Na tabela, "ainda não avaliada" e "evidência insuficiente" têm rótulos próprios, também no CSV; o CSV sai com a última atividade no horário de Brasília e proteção contra fórmulas. No celular, a tabela vira um cartão por pessoa. Quem pratica e acompanha vê as abas "Meu treino" e "Equipe"; o RH, que não pratica, entra pelo item "Simulações de liderança" do menu, e o link "Mapeamento de liderança" do cabeçalho o leva a `/dashboard/gestor/prontidao-lideranca` (quem só acompanha não recebe o link; quem treina vai ao próprio trilho).

A página do simulador não tem gate de página: o servidor decide quem pratica e quem acompanha, e só uma RECUSA (4xx) manda de volta ao início; falha de leitura (503) vai para a tela de erro. O Mapeamento do RH tem gate próprio, `exigirAcessoMapeamentoLideranca` (`lib/prontidao-lideranca/pagina.ts`); `exigirAcessoPaginaSimulador` só aceita vendas e atendimento. Falha ao ler a turma (`turma_membros`) lança em `resolverEscopoDeLote` e `carregarParticipacaoAtiva`, e o simulador responde 503, em vez de "não está aberto para você" ou "equipe vazia".

**Sem revisão humana (decisão do dono, 22/09/2026):** RH e gestor leem as devolutivas e não registram parecer; `/api/simulador-lideranca/equipe` só lê. A revisão existiu de 19 a 22/09 (migs 264 e 265); a tabela `sim_lideranca_revisoes` ficou no banco sem escritor, porque a retenção e a exclusão da mig 265 a leem. Na mesma decisão, a aba Simuladores de `/admin/cargos` passou a dizer só quem TREINA: o acompanhamento acima e o Mapeamento de liderança do RH não dependem dela.

Administradores experimentam em `/admin/simulador-lideranca`, selecionando a empresa no painel, e veem a aba da equipe. Cada administrador tem acervo próprio, separado dos colaboradores, e as chamadas são identificadas como `piloto`. Não há liberação automática de novos tenants nem envio de convites.

As tarefas `sim_lideranca_abertura`, `sim_lideranca_personagem`, `sim_lideranca_consequencia` e `sim_lideranca_avaliador` estão no catálogo central, pinadas para não herdar um modelo genérico incompatível. **Desde 27/09/2026 o modelo é resolvido na chamada** (`getModelForTask`, com a checagem de compatibilidade do formato estruturado): trocar o modelo da empresa ou o padrão alcança as jornadas já iniciadas. `estado.modelos` fica só como registro de com que modelo a jornada começou (e segue no hash de idempotência, para um reenvio não virar 409). Os prompts continuam congelados na jornada e só mudam com a VERSÃO: a jornada de uma versão em `VERSOES_ANTERIORES` é atualizada no próximo comando, com os prompts e o registro de modelos de hoje, preservando as avaliações concluídas. `tests/unit/simulador-lideranca-versao.test.ts` falha se `PROMPTS` mudar sem subir `VERSAO` (a assinatura dos prompts de cada versão fica no teste). Toda chamada usa `callAI`, JSON Schema estrito, `store:false` pelo wrapper e ledger central. O conteúdo da história e da matriz é em português brasileiro; controles têm traduções nos quatro idiomas. A devolutiva usa o componente comum aos três simuladores (`components/simuladores/relatorio-competencias.tsx`). Ditado reaproveita o componente de vendas.

## Persistência e recuperação

Migration 260: `sim_lideranca_jornadas` (uma por identidade/empresa), `sim_lideranca_episodios` (acervo de encontros concluídos) e `sim_lideranca_chamadas` (checkpoints de IA). O snapshot privado é projetado explicitamente para o navegador; prompts/modelos não são retornados. Os guards de leitura e mutação cobrem as três tabelas.

Revisão e lease de 330 segundos impedem duas abas de gravarem simultaneamente. Lock ocupado responde **423** (até 27/09 era 409, e o cliente descartava o pedido: com a rede caindo no meio do envio, a mesma fala entrava duas vezes). No 423 o cliente mantém o requestId, o reenvio recupera o recibo, e quando a leitura mostra que a fala pendente já entrou a caixa e o aviso somem sozinhos. 409 segue sendo "o pedido não vale mais" (revisão mudou, conteúdo trocado). O aviso de envio em processamento diz a partir de quando um novo envio vale ("a partir das HH:mm"). A RPC `sim_lideranca_salvar` grava estado, recibo e episódio na mesma transação, verificando tenant, proprietário, revisão e token. Comandos concluídos podem ser reenviados sem duplicar a transição. Checkpoints validados evitam repetir o avaliador se a etapa de consequência falhar. Uma queda entre receber a resposta do provedor e gravar seu checkpoint ainda pode gerar nova cobrança no reenvio.

Exclusão (migration 262): o DELETE direto de um colaborador (reset do demo) desvincula a jornada (`colaborador_id` vira NULL) em vez de travar; a exclusão confirmada pela interface inclui jornadas, encontros e chamadas na prévia, no backup e na mesma transação do vendas e do atendimento. A migration 265 também inclui as revisões humanas nos snapshots e hashes de exclusão. A retenção de seis meses do simulador de vendas não constitui uma rotina de retenção da liderança.

## Verificação

- `tests/unit/simulador-lideranca-*.test.ts`: sequência, repetição, abandono de repetição, avaliação v2 (estrutura, fonte, tolerância, cobertura, variante futuro, legado), síntese, acompanhamento (quem vê quem, sem conversa, preparação e reflexão sem texto, painel sem ler conversas) e acesso. Desde 27/09 também: citação do acordo (`-consequencia-citacao`), lock 423 e modelo resolvido na chamada (`-service`), guard de versão dos prompts (`-versao`), página recusa × falha (`-pagina`), link do Mapeamento (`-link-mapeamento`), sugestão da síntese (`-sintese-sugestao`), CSV e rótulos da equipe (`-csv-equipe`) e pt-PT (`-pt-pt`); `turmas-leitura-erro` para a leitura da turma e `demo-simulador-lideranca` para os turnos da demonstração.
- `node scripts/verify-lideranca-ui.mjs`: componentes reais com API fictícia; cinco encontros, síntese aberta no fim da jornada com a repetição sugerida, repetição com confirmação, comparação, retomada, falha recuperável, corrida com 423 sem fala duplicada, rascunho que sobrevive ao recarregar, aviso de processamento, próxima prática com as ações no topo, celular (briefing numa linha, campo de fala à vista, sem rolagem aninhada), aba da equipe (cartões no celular, rótulos distintos, evidência da preparação sem o texto, orientação sugerida, e desde 04/10/2026 a falha da primeira leitura do painel com "Atualizar" ali mesmo, que só aparece quando o painel não carregou), link do Mapeamento por papel e quatro idiomas. Imagens em `tmp/lideranca-ui`. Não roda no CI: de 03 a 04/10/2026 ficou vermelho no `master` ("Média da jornada" virou "Nível geral da jornada", R-35) sem ninguém ver.
- `node --env-file=.env.local scripts/verify-lideranca-db.mjs`: migration e contrato SQL real dentro de transação com rollback integral.
- `tests/unit/simulador-lideranca-schema-geracao.test.ts` e `tests/unit/simuladores-revisao-*.test.ts`: schema específico do encontro, autorização, idempotência e vínculo da revisão com o recorte atual.

A primeira entrega foi publicada em 17/09/2026 nos commits `b5adc5aa` e `ec91d260`, com a migration 260 aplicada. Naquela versão, passaram build, TypeScript, quatro idiomas, 5.516 testes e a jornada completa com IA real em tenant de demonstração. Os registros técnicos dessa sonda foram arquivados em backup local e removidos do acervo de treino; o ledger foi preservado.

As mudanças de 18 e 19/09 estão incorporadas neste documento. A validação da revisão `7b46e65f` registra 5.911 testes aprovados, interfaces em quatro idiomas, build e TypeScript, além dos ensaios de IA, em [simuladores-validacao.md](simuladores-validacao.md). Esses números são registros das respectivas entregas, não uma nova execução em 20/09.

**Dependência operacional:** a migration 265 precisa estar aplicada antes do código que usa o contexto de revisão. O registro de validação de 19/09 confirma o ensaio com rollback e deixa a aplicação definitiva pendente; esta atualização documental não aplica nem confirma essa migration. A verificação e aplicação estão descritas em [simuladores-validacao.md](simuladores-validacao.md#banco).

Publicação segue build, typecheck, suíte unitária e push para master; alterações apenas de Markdown dispensam build, conforme a skill de deploy do projeto. Nenhuma task Trigger.dev foi criada para o simulador.

## Correções de 27/09/2026

Revisão de fluxo, UX e código (relatório e plano fora do repositório, em `audit/simuladores-revisao-2026-09-27-claude/`). Sem migration; nenhum item escreve no banco fora do fluxo normal.

| Item | O que mudou |
|---|---|
| L-1 | Acordo da consequência confere a citação com `contemCitacao`, a régua do avaliador. |
| L-2 | D1: evidência da preparação e da reflexão chega à equipe sem texto (fonte e nível). |
| L-3 | Rascunho de preparação e reflexão no aparelho, limpo após o envio confirmado. |
| L-4 | Falha ao ler `turma_membros` lança; simulador responde 503; página só redireciona em recusa. |
| L-5 | Lock ocupado responde 423; o cliente mantém o pedido e não duplica a fala. |
| L-6 | Modelo resolvido na chamada; versão da jornada presa aos prompts por guard; atualização de versão renova prompts e modelos. |
| L-7 | Gate `exigirAcessoMapeamentoLideranca` e mensagens do Mapeamento com nome próprio. |
| L-8 | Painel da equipe lê só índice, fim e avaliação de cada encontro, por caminho JSON. |
| L-9 | Fim da jornada abre a síntese com "Repetir o encontro N". |
| L-10 | Ações junto da "Próxima prática"; a equipe vê a orientação sugerida. |
| L-11 | Celular: briefing numa linha, campo de fala à vista, sem rolagem aninhada; equipe em cartões. |
| L-12 | "Também observadas" no briefing e na preparação; síntese diz o que falta demonstrar. |
| L-13 | Copy de processamento e da sugestão; link do Mapeamento por papel; "Devolutiva que a pessoa recebeu"; rótulos distintos e CSV em Brasília. |
| L-14 | pt-PT localizado; demonstração com os turnos do fluxo real. |

O item comum C-1 (evidência descartada no resumo, `components/simuladores/relatorio-competencias.tsx`) ficou de fora desta rodada e foi resolvido em 27/09/2026 (`c8fa41e3`): competência sem nível porque a citação caiu diz "Evidência descartada", e não "sem oportunidade". O texto da história (CONTEXTO, EPISODIOS) e o que a IA escreve seguem em pt-BR em todos os idiomas.
