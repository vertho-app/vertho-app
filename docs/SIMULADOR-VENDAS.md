# Simulador de vendas PACE

Integração do núcleo de `C:\GAS\Simulador` na Vertho (13/09/2026). Um produto de treinamento com domínio próprio, usando a infraestrutura, identidade e operação da Vertho. O Copiloto comercial existente permanece independente deste treino.

## Acesso e liberação

1. No admin da Vertho, abra **Comercial → Simulador de vendas** (`/admin/simulador-vendas`).
2. Escolha a empresa e preencha **Configuração da empresa**: produtos, público-alvo, diferenciais, preços, condições e desafios comerciais.
3. Salve e experimente com a liberação desligada. Testes de plataforma ficam identificados no histórico e no ledger como `piloto`.
4. Defina início e fim do acesso (a tela informa o fuso), depois marque **Liberar para participantes da empresa**. O menu do dashboard passa a mostrar o treino (`/dashboard/simulador-vendas`), usando o login e o vínculo já existentes.

Não exige DISC, cargo com Top 5 ou temporada. A permissão `assessments.answer` continua obrigatória para treinar. Só administradores de plataforma autorizados configuram o módulo. Cada participante consulta somente seus próprios treinos; RH, gestor e tutor com `journey.team.view` e `reports.individual.view` acompanham a população autorizada pela mesma régua da jornada (`canViewColabJourney`). A gestão recebe resumos e o relatório selecionado, não as conversas.

**Decisão comercial de 13/09/2026: uso ilimitado no prazo contratado, sem cota por pessoa, teto de gasto ou alerta de custo PACE.** O período comercial normal é 90 dias, mas as datas reais precisam ser informadas explicitamente; o sistema não inventa nem renova datas. Início inclusivo, fim exclusivo; período ausente não libera participantes. A janela é conferida no início e antes de cada nova chamada paga. Depois do prazo, o histórico, o relatório já concluído e o feedback continuam disponíveis durante a retenção (desde que o módulo permaneça habilitado). Teste administrativo é identificado e independe da janela comercial. Existe uma única conversa aberta por pessoa/empresa. Rate limits e 60 turnos por conversa são proteções técnicas, não cota contratual. O campo legado `limite_sessoes` não é aplicado pelo v2.

## Agentes e ferramentas

| Responsabilidade | Implementação na Vertho |
|---|---|
| Tela e servidor | Next.js 16, React 19, TypeScript, Tailwind/CSS Modules; mesma aplicação/deploy Vercel |
| Banco e identidade | Supabase PostgreSQL + Supabase Auth existentes; `tenantDb` e guards de permissão |
| Criador do cenário | `sim_vendas_criador` — `gpt-5.4-2026-03-05` |
| Cliente simulado | `sim_vendas_cliente` — `gpt-5.4-2026-03-05` |
| Moderador | `sim_vendas_moderador` — `gpt-5.4-mini` |
| Intenção de encerramento | `sim_vendas_intencao` — `gpt-5.4-mini` |
| Gerente / devolutiva | `sim_vendas_gerente` — `gpt-5.4-2026-03-05` |
| Transporte e custo | `callAI`, Responses API com JSON Schema estrito, `store:false`, ledger `ia_usage_log` |
| Ditado opcional | SpeechRecognition do navegador, quando suportado; permissão de microfone por clique e revisão antes de enviar |

Os modelos são os padrões migrados, não uma mudança de modelo. Override explícito por tarefa continua disponível no painel de IA, restrito aos modelos qualificados em `modelos.ts`: provedor genérico compatível com chat não basta para este contrato. Modelos e prompts ficam congelados em cada treino. O modelo efetivo retornado pela API é registrado no ledger, incluindo o snapshot do Mini. Preços: [catálogo oficial do Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini); a conta é feita pelo catálogo central da Vertho.

Fluxo normal: criador → planejamento registrado pelo participante → (moderador → cliente → intenção) por turno → gerente no encerramento → avaliação da experiência → devolutiva PACE. O relatório é gerado e persistido antes da avaliação, mas a projeção pública não entrega seu conteúdo enquanto o participante não responder aos cinco aspectos da experiência. A tela informa que essa resposta não altera a nota PACE; qualquer pontuação válida libera a devolutiva, e a primeira avaliação fica preservada. O histórico individual mostra a nota geral do treino, mas não o indicador de relatório; níveis por competência, foco sugerido e a devolutiva só aparecem depois da avaliação da experiência (pace-7, abaixo). A gestão autorizada continua consultando o relatório persistido sem depender dessa etapa de interface. Um treino concluído com N turnos usa normalmente `3N + 2` chamadas, além de eventual regeneração de resposta inválida. Não há LangChain, banco vetorial ou serviço de agentes novo neste módulo. O ditado não utiliza Whisper/OpenAI no backend nem grava áudio no banco do módulo; o processamento de voz depende do navegador.

Os cinco templates vivem em `lib/simulador-vendas/prompts.ts`; a versão atual é `pace-rnaves-2.1.2-vertho-7` e a régua dos treinos novos é `pace-7` (seção no fim deste documento). Desde a `pace-5` os treinos usam a matriz aprovada `pace-competencias-1`: **Planejamento comercial, Preparar, Analisar, Co-criar e Engajar**, seis descritores cada. Os 120 textos de N1 a N4 estão integralmente em `lib/simulador-vendas/matriz.ts`; o prompt e a devolutiva usam essa fonte única. Os três graus de dificuldade do cliente continuam independentes dos quatro níveis de competência.

**Fontes exclusivas da devolutiva, conforme orientação de 15/09/2026:** `Manual da Metodologia PACE_v8.docx` (SHA-256 `058b5ebb2d133498a29153cc374c2c175909707d473ef4c621e125e7dd000c30`) e a matriz aprovada. `lib/simulador-vendas/fontes.ts` contém trechos literais conferidos no manual, identificados por seção: planejamento, etapas e anexos IV, X, XII e XIII. O manual fundamenta a orientação; a matriz operacionaliza os níveis N1–N4, prevalecendo sobre a escala antiga do checklist do Anexo X. Cada recomendação exige código de descritor e referência válida ao manual, preservados no estado e exibidos no relatório. Não há busca externa nem inclusão de outras metodologias no avaliador.

O gerente v5 recebe somente o plano prévio e o diálogo como evidências. Gabarito oculto, cortes de negociação e classificações do moderador não entram nessa chamada. Não produz listas de descobertas reservadas nem classificação de fechamento por preço ideal. A decisão de compra é apenas descrição do que foi expresso na conversa, sem bônus na competência. O moderador continua protegendo a interação, mas a nota v5 não tem descontos avulsos: respeito, escuta e transparência são avaliados pelos próprios descritores. A pesquisa de experiência (realismo, desafio, interação, utilidade e aprendizado) permanece separada da devolutiva e não compõe sua nota.

Antes da primeira fala, o participante registra um plano de até 6.000 caracteres, mascarado e persistido em `estado.planejamento` pelo mesmo fluxo de lease/revisão/recibo. Não há chamada de IA para salvar o plano. O servidor impede conversa sem plano na v4 e impede alterar o plano depois de registrado. O cliente simulado não recebe o plano; o gerente o recebe como dado para avaliar PL1–PL6. Sessões anteriores continuam seu fluxo original.

O gerente retorna os 30 descritores com nível 1–4 ou `null`, justificativa e até duas evidências literais por descritor. O servidor exige códigos únicos, versão válida e citações da fonte correta: plano para PL e falas do vendedor para P/A/C/E. Ausência de oportunidade fica `null` e fora da média da competência. E5/E6 ficam obrigatoriamente não observados, pois o exercício não inclui execução de pós-venda. A devolutiva mostra cobertura, nível parcial quando faltam descritores, justificativas, citações e a rubrica completa. Participante e gestão autorizada usam o mesmo componente.

Na `pace-5`, a nota 1–4 da competência era a média dos descritores observados. O nível seguia `nivelDaNota` em `lib/nivel-regua.ts`: N1 abaixo de 2; N2 abaixo de 3; N3 de 3 até 3,5; N4 acima de 3,5. Sem descritores observados, nota e nível ficavam nulos. Para manter a escala de treino 0–10 então vigente, cada etapa recebia média dos níveis × 2,5, arredondada em passos de 0,5: N1=2,5; N2=5; N3=7,5; N4=10. A nota 0–10 não era usada para inferir nível. Planejamento tinha avaliação própria e não entrava na média PACE. As quatro etapas mantinham peso igual de 25%; etapa sem observação entrava como zero apenas nessa média do treino. A interface explicava a projeção como regra de apresentação do simulador, não como escala numérica publicada no manual. Descontos legados de 0,5/1,5/2,5 são preservados apenas nas réguas anteriores à v5. A `pace-6` substituiu essa projeção pela escala comum 1–4 descrita abaixo.

### Compatibilidade das réguas

Histórico concluído não é recalculado. Schema, prompt, pontuação e apresentação são escolhidos pela versão gravada na sessão:

| Régua | Escala e média preservadas |
|---|---|
| `pace-2` | P/A/C/E na escala 0–10, em passos de 0,5, com piso 0,5. |
| `pace-3` | P/A/C/E na escala 0–10, em passos de 0,5 e com pesos iguais de 25%. Ausência de evidência vale zero no cálculo e aparece como `—`, sem piso artificial de 0,5. |
| `pace-4` | Primeira matriz e planejamento, ainda projetados na escala 0–10; preserva os descontos de conduta da regra anterior. |
| `pace-5` | Matriz aprovada e fontes documentais, projeção 0–10 sem descontos externos; Planejamento é separado e P/A/C/E mantêm 25% cada. |
| `pace-6` | Escala nativa 1–4; Planejamento passa a integrar a média geral, com peso igual ao de P/A/C/E. |
| `pace-7` | Mantém a escala 1–4 e acrescenta a regra comum de cobertura: quatro comportamentos para formar uma competência e três competências para formar a média geral. |

A matriz e o planejamento usam o JSON de estado existente, sem migration ou alteração em avaliações formais, DISC, PDI ou trilhas. O gerente com matriz tem limite de saída de 16.000 tokens para comportar os 30 descritores; modelos, prazo, ledger e checkpoints continuam pelo wrapper único.

No v2, instruções estáticas vão em `system` e entradas vão como dados JSON em `user`, com marcadores de tag escapados. Turno/autor são atributos do histórico, não rótulos confiados ao texto da fala. O gerente recebe orientação contra manipulação de nota, e saídas do cliente contendo estruturas reservadas são rejeitadas. Isso reduz risco de prompt injection, sem prometer imunidade: preços e necessidades isolados podem fazer parte da negociação legítima e não são bloqueados por coincidência literal. O prefixo estático favorece cache; economia real só é afirmada após medição no ledger. A devolutiva não altera automaticamente DISC, PDI, avaliação formal ou trilhas.

## Persistência e recuperação

Migrations **249**, **250** e **251**:

- `sim_vendas_config`: contexto comercial, liberação, prazo por empresa e revisão contra sobrescrita concorrente.
- `sim_vendas_sessoes`: snapshot privado do treino, estado, revisão e trava temporária.
- `sim_vendas_tentativas`: etapa, correlação de custo, hash do prompt e resposta validada para retomada.
- `sim_vendas_prompt_versions`: catálogo global imutável de templates estáticos, com SHA-256 verificado pelo banco/leitor; nenhum briefing ou conversa neste catálogo.
- `sim_vendas_manutencao`: apenas o checkpoint global do cron, sem conversa ou dado de participante, para retomar uma execução parcial sem reprocessar tenants anteriores.

Sessões novas guardam somente referência, versão, hash e modelo para cada template. A migration arquiva os literais legados e substitui a representação sem alterar relatório, régua ou recibos. A coluna gerada `resumo` permite listar histórico sem transferir `estado`; apenas a sessão aberta carrega o estado privado no servidor. Participante e gestão usam paginação por cursor `(created_at,id)`, sem truncar o 31º treino. CSV sai de um único snapshot SQL projetado; recortes acima de 3.000 treinos/3 MB pedem intervalo menor, sem exportação parcial silenciosa.

As tabelas têm RLS e acesso direto negado a `anon`/`authenticated`; o servidor valida identidade, permissão, tenant e propriedade. As referências compostas impedem associar participante ou tentativa a uma empresa diferente da sessão. O browser recebe uma lista explícita de campos públicos, nunca o gabarito, personalidade reservada ou prompts.

Criação e edição da configuração são atômicas. Cada comando traz um UUID e revisão; o servidor adquire uma lease e confirma por compare-and-swap. Reenvios reaproveitam recibos e resultados aceitos, inclusive relatório já concluído após o prazo. A lease de 330 s cobre o limite da rota; ao recarregar, a tela informa processamento, mostra o tempo máximo de retomada e consulta o servidor. Preparação sem cenário, sem lease e sem atividade há uma hora é abandonada ao tentar criar outro treino. O participante pode **descartar** um treino só antes da primeira fala dele (cenário que não serviu, preparação travada): o treino fica no histórico como encerrado sem relatório. Com conversa, o servidor recusa (409) e o caminho é concluir e receber a devolutiva; o abandono com conversa continua restrito à recuperação administrativa. Se a chamada do provedor terminar e o processo cair **antes** de persistir o checkpoint, a tentativa seguinte ainda pode gerar nova cobrança: não se promete execução exatamente uma vez em dois serviços distintos.

O admin tem histórico paginado, relatório e exportação CSV da empresa selecionada (com proteção contra fórmulas). Custos ficam no painel central, filtráveis pelas cinco tarefas. Treinos administrativos são identificados separadamente.

## Retenção e exclusão

**Decisão: seis meses corridos.** Conta-se do encerramento da conversa ou da última atualização de treino inativo; tentativas técnicas recentes também completam sua janela antes do expurgo conjunto. Cálculo em UTC com adição de meses (inclusive fevereiro/ano bissexto), não 180 dias. Lease viva impede exclusão. O cron `retencao_pace`, agendado em `vercel.json`, varre por tenant em lotes limitados. Ao atingir o orçamento global de 1.000 verificações/exclusões ou o prazo da execução, grava um cursor e termina como parcial, sem classificar tenants ainda não visitados como falha; erros reais continuam observáveis.

Antes de expurgar, gera JSON compactado no bucket **privado** `backups/pace-retencao`, baixa de volta e confere os bytes. O banco trava sessão/tentativas, revalida a elegibilidade e compara o hash do snapshot completo: qualquer mudança posterior ao backup preserva o registro. Se o banco confirmar que recusou o expurgo, o arquivo recém-gerado é removido; em timeout ou resposta ambígua, ele é preservado. Backups de segurança não aparecem no histórico e seguem a decisão operacional de **sete dias**, com rotação restrita às pastas `pace-retencao` e `pace-exclusao`. Após restauração de backup, executar a manutenção antes de reabrir acesso ao acervo.

Excluir colaborador ou empresa pela interface agora exige uma prévia gerada no servidor, com contagem de treinos/tentativas e um hash do estado completo. Depois da confirmação, a aplicação cria e confere um backup privado em `backups/pace-exclusao`; o banco trava os registros, compara novamente o hash, exige que o arquivo exista, grava a auditoria e só então remove o acervo PACE e o cadastro na mesma transação. Se qualquer dependência de outro módulo bloquear a raiz, o PACE e a auditoria da tentativa também sofrem rollback. O backup cobre o cadastro raiz, vínculos necessários e dados PACE — não é cópia integral dos outros módulos da plataforma — e permanece recuperável por sete dias.

Exclusões legadas que ainda removam um colaborador diretamente apenas tornam `colaborador_id` nulo na sessão PACE; não apagam o treino por efeito colateral. DELETE direto de empresa fica bloqueado quando há dados PACE, obrigando o fluxo confirmado. A aplicação não apaga registros ao simplesmente vencer o prazo comercial. A interface avisa o mascaramento de telefone, e-mail e CPF; CNPJ de 14 dígitos não é confundido com telefone. Um identificador comercial nu com formato de telefone continua sendo mascarado por segurança — identifique-o no texto como número de proposta ou use separadores não telefônicos. Use dados fictícios nos treinos.

## Origem e dados anteriores

O site original é `simulador.rnavesconsultoria.com.br`. Sua base usava Next.js 15/React 19, JavaScript, Supabase, OpenAI SDK/Responses e Resend para o acesso por código. Essa autenticação não foi copiada para a Vertho.

**Decisão do responsável: não importar os usos antigos.** Não há importador, tabela de acervo, cópia de conversas, notas ou custos legados. Os novos treinos usam os cadastros da Vertho; clientes ainda não cadastrados seguem o fluxo normal de cadastro/convite da plataforma. Nenhum convite é enviado pela migration.

O domínio e a aplicação originais não são alterados por este deploy. Publicar o módulo na Vertho não redireciona automaticamente o endereço da RNaves nem migra contas de acesso antigas.

Hoje existem dois caminhos de entrada: na Vertho, a pessoa usa o cadastro e o login existentes, abre **Simulador de vendas** no dashboard e treina durante o período contratado; no endereço da RNaves, o aplicativo legado pede o e-mail cadastrado e envia um código de seis dígitos antes de abrir seu fluxo próprio. A arquitetura-alvo recomendada é manter uma única implementação do motor e dos dados na Vertho, com `simulador.rnavesconsultoria.com.br` como uma porta de entrada identificada da RNaves para o tenant correspondente. Esse redirecionamento e a resolução do cadastro precisam ser publicados como uma etapa separada; enquanto isso não ocorrer, os dois endereços continuam sendo aplicações independentes e podem divergir.

## Verificação e operação

Base: `docs/CHECKLISTS.md` §1. Checklist específico:

- **Antes do código:** separar treino de vendas do Copiloto e confirmar ausência de importação legada.
- **Antes de publicar:** gates de API e menu, incluindo acesso pelo domínio principal sem tenant no layout.
- **Antes de publicar:** testes de tenant/propriedade, revisões, moderação, idempotência, JSON e falha de persistência.
- **Antes de publicar:** validar SQL em transação com rollback (RLS, privilégios, FK, prazo sem cota, retenção, lease e commit), salvar backup e depois aplicar migration.
- **Antes de publicar:** conversa real dos cinco agentes, persistência do relatório e custo atribuído; nenhum convite/disparo.
- **Antes de publicar:** imagem desktop/mobile e fluxo de configuração, chat e relatório com fixtures fictícias.
- **Antes de publicar:** stage seletivo, suíte completa, typecheck e build; commit somente dos arquivos da entrega.
- **Depois do push:** confirmar SHA/deployment e rotas de produção; manter liberação de participantes explícita por empresa.

Testes do núcleo, acesso, checkpoints, serviço e Responses em `tests/unit/simulador-vendas-*.test.ts` e `tests/unit/integrations/simulador-vendas-responses.test.ts`. Os guards de leitura/mutação também cobrem as tabelas PACE. `node --env-file=.env.local scripts/verify-pace-migration.mjs` executa o contrato SQL em transação com rollback integral; `node --env-file=.env.local scripts/verify-pace-migration.mjs --check` é o portão somente leitura que confirma 249/250/251 no banco já publicado. `node scripts/verify-pace-ui.mjs` verifica os componentes e CSS reais com APIs fictícias (quatro idiomas, mobile, paginação, CSV, lease e troca de contexto), salvando imagens em `tmp/pace-ui-v2`. A sonda real usa somente o tenant de demonstração, identificada como verificação técnica, com liberação de participantes desligada.

Rollback operacional: desligar a liberação por empresa e restaurar uma revisão compatível com referências de prompt e `pace-2`/`pace-3`. Código anterior à migration 250 não entende os novos snapshots: não voltar a ele sem restauração literal controlada. Preservar tabelas, catálogo e relatórios; não apagar dados para reverter a interface.


### Escala comum Vertho — pace-6 (17/09/2026)

As novas avaliações persistem notas de 1 a 4, calculadas diretamente da matriz PACE. Cada competência usa a média dos descritores observados; a média geral inclui as cinco competências com peso igual, incluindo Planejamento comercial. Itens não observados são nulos e não entram na média. A conversão para N1–N4 permanece em `nivelDaNota`, sem arredondamento prévio. E5/E6 continuam não observáveis na reunião inicial.

Relatório, histórico, gestão e CSV usam a escala 1–4. Avaliações históricas sem matriz são apresentadas com conversão linear `1 + 3 × nota / 10`, identificadas como legadas; zero previamente usado como ausência de evidência continua sem nota. Os snapshots originais e versões dos prompts são preservados. A pesquisa de experiência mantém seu instrumento próprio. A versão pace-6 preserva a exclusividade do manual PACE v8 e da matriz como fontes metodológicas.

### Regra de cobertura e experiência do participante: pace-7 (18/09/2026)

Revisão dos três simuladores de 18/09. Vale para treinos NOVOS; `pace-6` e anteriores continuam lidas como foram geradas (`regraDaVersao`, `usaRegraCobertura`).

- **Regra de cobertura comum** (`lib/simuladores/cobertura.ts`, decisão do dono): uma competência só tem nível com pelo menos **4 comportamentos observados**; a média geral só existe com pelo menos **3 competências com nível**. Antes, uma conversa curta (plano, abertura e uma pergunta) fechava em 3,0, à frente de quem percorria todas as etapas. A versão da regra fica gravada no relatório (`regraCobertura`).
- **E5 e E6 fora da avaliação**: acompanhamento da implementação e verificação de resultados não cabem numa reunião inicial. Não contam no total de Engajar (4 comportamentos) nem aparecem como "sem oportunidade"; nível que o gerente der a eles é descartado.
- **Citação tolerante** (`lib/simuladores/citacao.ts`): a comparação ignora tipografia (aspas, reticências, caixa). Citação que não confere em até 20% dos descritores avaliados (mínimo 1) rebaixa só esses, listados em `Matriz.descartados`; acima disso a avaliação inteira é recusada e o gerente é reenviado, como antes. Até 18/09 uma citação inexata entre cerca de 60 derrubava os 30 níveis. O relatório gravado já traz a matriz validada.
- **Gerente**: recebe o contexto público que o vendedor tinha (`contexto_vendedor`) e o grau de dificuldade, para julgar PL1 e P1; o contexto não é evidência. Teto de 200 s (os 30 descritores com citação estouravam 110 s). Excesso de forma (justificativa ou citação longa, terceira evidência) é cortado na normalização em vez de recusado.
- **Cliente simulado**: pede objetivo e agenda quando o vendedor não os alinha (gatilho de avanço em Preparar), não bloqueia quando ele mesmo já trouxe a informação e cria oportunidades de escuta, adaptação e co-criação (pedir explicação, relatar um incômodo concreto, propor um ajuste e citar outro decisor, crítica direta em Pleno e Sênior).
- **Prazo**: pedir a devolutiva (`encerrar`) tem 24 h de tolerância depois do fim do período (`podeEncerrar`), para quem estava no meio da conversa; iniciar, planejar e responder seguem a janela exata.
- **Plano guiado**: seis perguntas, uma por comportamento de Planejamento comercial (PL1 a PL6), com mínimo de 4 respostas, o mesmo da regra de cobertura. O servidor continua recebendo um texto só, com o título de cada pergunta antes da resposta (`lib/simulador-vendas/plano-guiado.ts`). O rascunho fica no `sessionStorage` da aba.
- **Devolutiva**: o relatório por competência é o componente comum aos três simuladores (`components/simuladores/relatorio-competencias.tsx`): nível por extenso, regra dita em palavras quando falta cobertura, leitura do avaliador por etapa dentro da competência, comportamentos com citação e régua recolhida. Recomendações mostram o nome do comportamento (não o código) e a primeira prioritária vem marcada como prioridade do próximo treino. Treinos sem matriz mantêm os cartões por pilar. A linha "Régua: pace-x" saiu da tela do participante.
- **Evolução e foco**: o histórico do participante traz, só de devolutiva liberada e na escala 1 a 4 nativa, as notas por competência e o título da recomendação prioritária (`COLUNAS_HISTORICO_PARTICIPANTE`, caminhos JSON pequenos, sem o relatório). A tela mostra o maior nível alcançado em cada competência e "Subiu de nível" quando passou do primeiro, a partir de 2 treinos (`lib/simulador-vendas/evolucao.ts`): regressão não é exibida. O foco sugerido aparece antes de iniciar o próximo treino.
- **Celular**: com treino em curso, a conversa vem antes do histórico e a ficha do cliente fica recolhível no topo dela.

- **Visão da equipe** (aba "Acompanhamento da equipe", `lib/simulador-vendas/painel.ts` + `painelEquipe` em `equipe.ts`): a população é quem PODERIA treinar e a pessoa que pergunta enxerga (cargo liberado para o vendas pela mesma régua do gate, fora gestor, RH e contas internas; `canViewColabJourney` por pessoa), então "não começou" só aparece para quem tinha acesso. Mostra quantos começaram e concluíram, a distribuição do maior nível por competência, a tabela por pessoa (com "Subiu de nível") com CSV, e quem ainda não começou. Treino descartado não conta; treino na escala antiga não entra no nível.
- **Pesquisa de experiência** (decisão do dono: continua obrigatória, agora com painel): médias dos cinco aspectos (1 a 5) e os comentários mais recentes, SEM o nome de quem escreveu, porque avaliam o simulador e não a pessoa.
- **Revisão humana** (19/09/2026, mig 264): no relatório aberto pela gestão, quem acompanha registra se concorda com a avaliação da IA (concordo, concordo em parte, discordo), com motivo e as competências comentadas. Mesmo contrato do atendimento: não altera a nota, não se edita, o dono do treino não revisa o próprio, exige `assessments.answer` além da régua de equipe, e o motivo é gravado com dados pessoais comuns mascarados. Tabela `sim_vendas_revisoes` (só INSERT, `ON DELETE CASCADE` na sessão, para o expurgo e a exclusão não travarem); rota `POST /api/simulador-vendas/gestao` com o contexto de LEITURA, porque gestor e RH não treinam; núcleo em `lib/simuladores/revisao.ts` e tela em `components/simuladores/revisao-humana.tsx`, comuns à liderança. A pessoa não vê a revisão.

Verificação: `tests/unit/simulador-vendas-pace7.test.ts`, `tests/unit/simulador-vendas-experiencia.test.ts`, `tests/unit/simulador-vendas-painel.test.ts` (provados por mutação) e `node scripts/verify-pace-ui.mjs` (plano guiado, descartar, devolutiva pace-5 e pace-7, conversa curta, evolução, celular e quatro idiomas).

**Medição real do gerente na pace-7 (19/09/2026).** Até então nenhuma sessão de produção tinha passado pela matriz: a última é de 14/09, ainda na pace-2. O ensaio opt-in `tests/unit/simulador-vendas-gerente-live.test.ts` percorre o encerramento de produção (`executarCore` com o `gerador` real; só o banco em memória) com uma conversa completa de 9 turnos e o plano guiado nas seis perguntas (`tests/fixtures/simulador-vendas-conversa.ts`). Primeira medição, `gpt-5.4-2026-03-05`: **26 s** numa chamada (teto de 200 s), validação aprovada, nenhum descritor descartado pela tolerância de citação; Planejamento 6/6 N3, Preparar 6/6 N2, Analisar 6/6 N2, Co-criar 6/6 N2, Engajar 4/4 N3, média 2,83. Uma conversa dessas cobre as cinco competências; é a conversa curta que fica sem nível, como a regra pretende. O ensaio grava a saída bruta em `backups/` e, se o gerador recusar, diz o motivo de cada tentativa (`diagnosticarGerente`), que o gerador só registra pelo tipo.
