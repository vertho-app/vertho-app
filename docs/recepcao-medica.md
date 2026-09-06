# Treino de atendimento — recepção médica

## Uso

Em `/admin/treino-atendimento`, escolha a empresa. Administradores podem experimentar sem habilitar a equipe. A habilitação exige a permissão de configuração da empresa. Colaboradores usam `/dashboard/treino-atendimento` e só entram quando o módulo está habilitado para a clínica.

- **Meu treino:** escolha um caso, leia a ficha e converse. É possível preparar outro atendimento e retomar os anteriores pelo histórico.
- **Equipe e revisões:** participação no período, relatórios concluídos, pendências de revisão e resultados separados por cenário, versão da rubrica e cobertura. Gestores acessam os liderados definidos por `gestor_email`; tutores, os tutorados; RH, a empresa. Testes administrativos só entram no painel quando o administrador marca a opção.
- **Cenários:** catálogo comum e versões da clínica. Crie uma cópia, adapte a ficha, os pacientes e os critérios; salve o rascunho e publique. Publicação exige `content.manage`. Uma versão publicada não pode ter seu conteúdo alterado. Arquivar impede novos treinos dessa versão, preservando as sessões existentes.

A revisão humana exige permissão de acompanhamento, leitura individual e registro. O parecer é acrescentado ao atendimento com autoria, data, competências e motivo; nunca sobrescreve a avaliação da IA. Não é permitido revisar o próprio treino. Pareceres anteriores permanecem visíveis.

## Casos e metodologia

Cinco casos iniciais, com duas variantes curadas de paciente por caso: segunda remarcação, autorização pendente, primeira consulta, falta à consulta e informação sobre outra pessoa. Dados e procedimentos são fictícios e precisam de validação pedagógica pelas clínicas. O caso de informação sobre terceiros treina o procedimento descrito na ficha; não pretende representar todas as exigências legais ou operacionais de uma clínica real.

### Versões 2.0 — Sob pressão

Estas versões constituem o nível anterior, preservado como referência editorial. O catálogo comum agora utiliza as versões 3.0 descritas a seguir; sessões antigas conservam seu snapshot.

As sessões da etapa 2.0 utilizaram os cinco casos **Sob pressão**, definidos em `catalogo-desafiador.ts`, com dez perfis curados. As versões introdutórias 1.0 são arquivadas na publicação editorial; cópias das clínicas e snapshots de sessões anteriores são preservados. Para o nível atual, prepare um novo atendimento e selecione um caso Limite contestado.

A dificuldade vem de restrições e objeções concretas: exigência de encaixe, receio de nova remarcação, prazo pessoal incompatível com o retorno da autorização, cobrança de previsão de saída e pressão por informação de familiar. Cada perfil distingue o que pede, o que realmente precisa, quando revela uma restrição e que encaminhamento pode aceitar. Um dos perfis recusa a orientação e encerra descontente, mesmo diante de boa condução.

O prompt `recepcao-2.1-resistencia` evita aceitação por simples cordialidade e elogios automáticos. A paciente mantém a objeção que não foi tratada, responde a perguntas pertinentes e reduz a resistência diante de uma saída suficiente. Não há número mínimo de turnos, frase mágica ou obrigação de criar outra barreira após um acordo. Hostilidade não autoriza inventar urgência, insultos discriminatórios ou ameaças de violência.

As versões difíceis têm seis competências: acolhimento (20), compreensão (15), clareza (20), resolução (20), procedimentos (10) e **condução sob pressão (15)**. O avaliador separa qualidade de atendimento e satisfação: sustentar um limite e respeitar uma recusa pode ser adequado com desfecho não resolvido. Promessa indevida não ganha mérito por agradar a paciente. Notas antigas e novas continuam separadas por versão e rubrica.

O prompt distingue orientação clínica efetiva, divulgação de informação e desrespeito grave de respostas administrativas genéricas. Não cabe converter qualquer falha em ocorrência crítica. A conferência semântica ainda depende de revisão humana. Se a fala da paciente vier com JSON inválido ou fora do schema, há uma única regeneração de formato; cada tentativa mantém seu próprio registro de custo/rejeição. Falhas de rede não recebem esse retry, e o avaliador preserva sua correção limitada no core.

### Versões 3.0 — Limite contestado

Os cinco casos em `catalogo-limites.ts` têm dez perfis com `paciente.postura=resistencia_persistente`. O campo é opcional para manter compatibilidade; na ausência dele, o personagem segue o comportamento negociável anterior. A postura fica reservada no servidor, integra o snapshot e pode ser selecionada no editor em **Reação aos limites**, por paciente e variante.

O prompt `recepcao-2.2-limite-contestado` separa entender e aceitar. A personagem pode entender perfeitamente a regra e continuar exigindo encaixe, cobertura, prioridade ou informação de terceiro. Explicação correta não dispara aceitação automática. A cobrança permanece ligada à mesma demanda, sem inventar restrições, repetir dúvidas já respondidas ou seguir uma quantidade obrigatória de turnos.

Cada caso informa publicamente o procedimento fictício para reclamação e encerramento: não há chefia disponível para transferência imediata; reclamação autorizada recebe retorno da coordenação até hoje às 17h no chat, sem garantia de exceção. Depois de tratar a objeção, apresentar saídas e sustentar o limite, a recepção pode encerrar respeitosamente diante de insistência repetida, sem depender de concordância para encerrar e sem encaminhar o que foi recusado. A última fala do paciente pode ser apenas um protesto.

A rubrica `3.0-limites` mantém os seis eixos e respectivos pesos, explicitando encerramento sem acordo como condução adequada. Uma variante pode autorizar apenas a reclamação, continuando insatisfeita; a outra rejeita o encaminhamento posterior. Não se infere concordância com uma alternativa porque a pessoa autorizou registrar sua discordância.

`recepcao_cenarios` armazena o conteúdo. `catalogo.ts` contém apenas as sementes iniciais; o runtime lê o banco. `cenario.mjs` preserva a fixture original para compatibilidade de testes históricos. O editor aceita de 3 a 7 competências; exige IDs únicos, pesos somando 100 e conteúdo limitado. Cada alteração da rubrica recebe uma identidade calculada pelo hash dos critérios. A versão e a variante selecionadas ficam no snapshot da sessão. Repetição imediata do mesmo caso alterna a variante.

`core.ts` separa juízo da IA e cálculo da nota. Confere citações literais, autoria, oportunidade e vocabulários do snapshot. O avaliador recebe participantes explícitos, `secretaria` e `paciente`. Há uma correção limitada, com a saída recusada e o campo inválido. Cobertura reduzida não vira reprovação. Citação válida não garante pertinência semântica: a revisão humana continua necessária.

A paciente tem validação de formato e detecção limitada de exposição de instruções. Fatos reservados podem ser revelados legitimamente durante a conversa; o filtro não promete impedir toda tentativa de jailbreak. Conteúdo reservado e critérios não são devolvidos pela API de treino. Identificadores comuns são mascarados nas mensagens e transcrições, sem promessa de detecção completa de dados pessoais.

## Voz opcional

Botões permitem ouvir a última fala da paciente e gravar uma resposta de até 60 segundos. A gravação só vai ao reconhecimento quando a pessoa pede a transcrição. O texto volta ao campo de resposta para conferência e envio explícito. O áudio não é salvo pelo módulo.

A fala usa `generateNarrationAudio`, com voz Aoede e sem vinhetas. A transcrição usa Whisper com `verbose_json`, conforme a [API oficial](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create). O custo da transcrição usa a duração retornada e a [tarifa por minuto](https://developers.openai.com/api/docs/models/whisper-1), conferida em 05/09/2026. Não há ligação telefônica nem envio para WhatsApp real. O cenário de mensagens simula esse contexto dentro do Vertho. A avaliação permanece sobre o texto confirmado, sem avaliar entonação.

As rotas de voz conferem autenticação, CSRF, permissão de treino, empresa, proprietário, limite de requisições e tamanho do upload. A fala a sintetizar vem do histórico salvo, nunca de texto arbitrário enviado pelo navegador. A gravação é opcional e depende de suporte e permissão de microfone do navegador.

## Identidade, persistência e medição

`owner_key` usa o ID do colaborador ou do cadastro administrativo. O e-mail permanece como informação histórica, não como chave de acesso. Migration 241 preenche a chave dos registros antigos; um trigger também cobre criações pela versão anterior durante o deploy. As RPCs v2 usam a identidade estável e preservam revisão e lease. As RPCs anteriores ficam disponíveis para compatibilidade durante a publicação.

Sessões antigas continuam com seu snapshot. Retries de mensagem confirmada reutilizam recibos. As novas tabelas têm RLS e acesso de serviço explicitamente limitado. Revisões só permitem SELECT/INSERT ao serviço. A integridade por empresa das tentativas e revisões também é conferida por FK composta.

`recepcao_tentativas` registra a operação ANTES da chamada paga. Cada rejeição e a tentativa corrigida ficam em linhas distintas, independentemente do commit da sessão. `ia_usage_log.correlation_id` concilia custo e modelo efetivo com a tentativa; não se usa aproximação por horário. Metadados não contêm texto da conversa, prompt bruto ou resposta da IA. Falha de finalização da telemetria é sinalizada e deixa a tentativa aberta.

O painel de operação exige `ai.costs.view`. Mostra custo conhecido por sessão, rejeições, tentativas abertas e chamadas sem uso registrado. Ausência de registro não equivale a custo zero. Sessões anteriores à instrumentação ficam fora do custo conciliado. O filtro considera sessões iniciadas no período. Há paginação de leitura e limite explícito de 10 mil registros por conjunto para evitar truncamento silencioso.

## Verificação e publicação

- `npm run typecheck` e testes `recepcao-*` sem flags não fazem chamadas pagas nem alteram produção.
- `RECEPCAO_DB_CHECK=1`: `node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/recepcao-db.test.ts` aplica a migration dentro de transação, confere catálogo, revisão, identidade, concorrência e privilégios; sempre faz rollback.
- **Aplicação permanente autorizada:** o mesmo comando com `RECEPCAO_APPLY=1` grava a migration 241 e as cinco sementes, sem habilitar empresas. Só usar essa segunda flag ao publicar. As sementes usam IDs determinísticos e não sobrescrevem conteúdo existente.
- `RECEPCAO_LIVE_SMOKE=1`: ensaio real do cenário inicial. `RECEPCAO_LIVE_CATALOGO=1`: ensaios dos quatro novos casos. Usar o runner acima com `tests/unit/recepcao-live-smoke.test.ts`. Há custo e telemetria; não habilitar no CI padrão.
- `RECEPCAO_VOZ_LIVE=1`: `recepcao-voz-live.test.ts` sintetiza uma fala fictícia e a transcreve pelos provedores reais. A autenticação e a sessão são fixtures; não cria treino de usuário. Há custo registrado no ledger.
- `RECEPCAO_UI=1`: `recepcao-ui.test.ts` usa Playwright, API simulada e uma página de prévia LOCAL temporária que renderiza `TreinoRecepcao`. `RECEPCAO_UI_URL` permite mudar a URL da prévia. Nunca publicar essa página de teste.
- `RECEPCAO_DESAFIOS_LIVE=1`: `node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/recepcao-desafios-live.test.ts --maxConcurrency=2` ensaia os dez perfis com resposta genérica e condução concreta. Compara avaliações em dois casos, incluindo recusa respeitada. Há custo; diálogos sintéticos ficam em `backups/recepcao-desafio-ensaio-*.json`, sem sessões de usuários. É um ensaio de comportamento, não comprovação de calibração com pessoas.
- `RECEPCAO_DESAFIOS_DB=1`: `node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/recepcao-desafios-db.test.ts` ensaia a publicação editorial em transação revertida. Somente com **`RECEPCAO_DESAFIOS_APPLY=1`** publica permanentemente as versões 2.0 e arquiva as sementes globais 1.0 identificadas por autoria. Salva backup do catálogo anterior, não altera sessões nem cenários personalizados e recusa sobrescrever versão divergente. Esta operação não exige nova migration de estrutura.
- `RECEPCAO_LIMITES_LIVE=1`: `node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/recepcao-limites-live.test.ts --maxConcurrency=2` verifica os dez perfis após respostas corretas, incluindo avaliações de encerramento sem acordo. Os diálogos fictícios ficam em `backups/recepcao-limites-ensaio-*.json` para inspeção semântica; as asserções textuais não comprovam, sozinhas, resistência realista.
- `RECEPCAO_LIMITES_DB=1`: o runner acima com `tests/unit/recepcao-limites-db.test.ts` ensaia a publicação de 3.0 em transação revertida. **`RECEPCAO_LIMITES_APPLY=1`** confirma a operação com backup e arquiva somente sementes globais 2.0. Publicar o código antes do catálogo, pois o schema anterior não aceita o novo campo opcional. Não reexecutar publicação de versões anteriores já arquivadas.

Aplicar a migration antes do deploy. A API e a UI anteriores continuam funcionando durante a atualização. Commit + push em master publica na Vercel.

## Passagem do piloto para uso ampliado

Instrumentação, conteúdo, painel, editor, revisão e voz opcional estão disponíveis. O piloto de 1–2 clínicas depende da seleção das participantes e do uso humano; 30 sessões são um marco de aprendizado, não comprovação de calibração. Examinar divergências da revisão, taxa de rejeição, conclusão e custo antes de ampliar.

Modelos continuam configuráveis por tenant no catálogo existente. O default da paciente não foi trocado sem comparação de qualidade. Os ensaios podem apoiar a comparação, mas a escolha de modelo deve usar as mesmas conversas e revisão humana.

As evidências de treino ficam disponíveis para acompanhamento, mas não alteram N1–N4, Temporada ou PDI automaticamente. A integração de notas à jornada e a geração livre de personas continuam condicionadas à decisão de produto e à calibração; não são ativadas por uma contagem automática de sessões.
