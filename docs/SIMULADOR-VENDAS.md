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

Fluxo normal: criador → (moderador → cliente → intenção) por turno → gerente no encerramento → avaliação da experiência → devolutiva PACE. O relatório é gerado e persistido antes da avaliação, mas a projeção pública não entrega seu conteúdo enquanto o participante não responder aos cinco aspectos da experiência. A tela informa que essa resposta não altera a nota PACE; qualquer pontuação válida libera a devolutiva, e a primeira avaliação fica preservada. A navegação do histórico individual também não antecipa nota nem indicador de relatório. A gestão autorizada continua consultando o relatório persistido sem depender dessa etapa de interface. Um treino concluído com N turnos usa normalmente `3N + 2` chamadas, além de eventual regeneração de resposta inválida. Não há LangChain, banco vetorial ou serviço de agentes novo neste módulo. O ditado não utiliza Whisper/OpenAI no backend nem grava áudio no banco do módulo; o processamento de voz depende do navegador.

Os cinco templates vivem em `lib/simulador-vendas/prompts.ts`, versão `pace-rnaves-2.1.1-vertho-2`. A régua permanece PACE: preparar, analisar, cocriar, engajar; três dificuldades. No `pace-2`, o gerente fornece notas brutas: o código deriva as violações das moderações persistidas, desconta 0,5/1,5/2,5 por gravidade no pilar correspondente, respeita o piso 0,5 e calcula a média. O relatório identifica a versão da régua; notas antigas não são recalculadas. Objeção profunda usa `nome` igual à `descricao` canônica; descobertas exigem citação literal de um turno real do vendedor e não podem se repetir. Desvios leves de tamanho/arredondamento são normalizados; conteúdo/evidência inválidos continuam rejeitados.

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

Criação e edição da configuração são atômicas. Cada comando traz um UUID e revisão; o servidor adquire uma lease e confirma por compare-and-swap. Reenvios reaproveitam recibos e resultados aceitos, inclusive relatório já concluído após o prazo. A lease de 330 s cobre o limite da rota; ao recarregar, a tela informa processamento, mostra o tempo máximo de retomada e consulta o servidor. Preparação sem cenário, sem lease e sem atividade há uma hora é abandonada ao tentar criar outro treino. Não existe encerramento sem relatório na interface do participante; o comando interno de abandono permanece restrito à recuperação administrativa e à compatibilidade. Se a chamada do provedor terminar e o processo cair **antes** de persistir o checkpoint, a tentativa seguinte ainda pode gerar nova cobrança: não se promete execução exatamente uma vez em dois serviços distintos.

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

Rollback operacional: desligar a liberação por empresa e restaurar uma revisão compatível com referências de prompt e `pace-2`. Código anterior à migration 250 não entende os novos snapshots: não voltar a ele sem restauração literal controlada. Preservar tabelas, catálogo e relatórios; não apagar dados para reverter a interface.
