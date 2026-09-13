# Simulador de vendas PACE

Integração do núcleo de `C:\GAS\Simulador` na Vertho (13/09/2026). Um produto de treinamento com domínio próprio, usando a infraestrutura, identidade e operação da Vertho. O Copiloto comercial existente permanece independente deste treino.

## Acesso e liberação

1. No admin da Vertho, abra **Comercial → Simulador de vendas** (`/admin/simulador-vendas`).
2. Escolha a empresa e preencha **Configuração da empresa**: produtos, público-alvo, diferenciais, preços, condições e desafios comerciais.
3. Salve e experimente com a liberação desligada. Testes de plataforma ficam identificados no histórico e no ledger como `piloto`.
4. Quando o contexto estiver aprovado, marque **Liberar para participantes da empresa**. O menu do dashboard passa a mostrar o treino (`/dashboard/simulador-vendas`), usando o login e o vínculo já existentes.

Não exige DISC, cargo com Top 5 ou temporada. A permissão `assessments.answer` continua obrigatória. Só administradores de plataforma autorizados configuram e consultam o histórico da empresa. Cada participante consulta somente seus próprios treinos.

A cota por pessoa é opcional, sem valor comercial inventado. Treinos com cenário criado consomem cota, inclusive se abandonados; uma preparação que falhou e foi abandonada não consome. Existe uma única conversa aberta por pessoa/empresa. O limite técnico de 60 turnos não é uma cota contratual.

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

Os modelos são os padrões migrados, não uma mudança de modelo. Override explícito por tarefa continua disponível no painel de IA; o contrato requer OpenAI. Modelos e prompts ficam congelados em cada treino. O modelo efetivo retornado pela API é registrado no ledger, incluindo o snapshot do Mini. Preços: [catálogo oficial do Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini); a conta é feita pelo catálogo central da Vertho.

Fluxo normal: criador → (moderador → cliente → intenção) por turno → gerente no encerramento. Um treino concluído com N turnos usa normalmente `3N + 2` chamadas, além de eventual regeneração de resposta inválida. Não há LangChain, banco vetorial ou serviço de agentes novo neste módulo. O ditado não utiliza Whisper/OpenAI no backend nem grava áudio no banco do módulo; o processamento de voz depende do navegador.

Os cinco prompts literais de origem vivem em `lib/simulador-vendas/prompts.ts`, versão `pace-rnaves-2.1.1-vertho-1`. A régua permanece PACE: preparar, analisar, cocriar, engajar; três dificuldades. JSON e regras de negócio são validados antes de aceitar respostas. A média é recalculada no código; descobertas exigem citação literal em turno do vendedor. A devolutiva não altera automaticamente DISC, PDI, avaliação formal ou trilhas.

## Persistência e recuperação

Migration **249** (aditiva):

- `sim_vendas_config`: contexto comercial, liberação e cota por empresa.
- `sim_vendas_sessoes`: snapshot privado do treino, estado, revisão e trava temporária.
- `sim_vendas_tentativas`: etapa, correlação de custo, hash do prompt e resposta validada para retomada.

As tabelas têm RLS e acesso direto negado a `anon`/`authenticated`; o servidor valida identidade, permissão, tenant e propriedade. As referências compostas impedem associar participante ou tentativa a uma empresa diferente da sessão. O browser recebe uma lista explícita de campos públicos, nunca o gabarito, personalidade reservada ou prompts.

Criação/cota são atômicas. Cada comando traz um UUID e revisão; o servidor adquire uma lease e confirma por compare-and-swap. Reenvios reaproveitam recibos e resultados aceitos. Um relatório concluído é reutilizado, não regenerado. Se a chamada do provedor terminar e o processo cair **antes** de persistir o checkpoint, a tentativa seguinte ainda pode gerar nova cobrança: não se promete execução exatamente uma vez em dois serviços distintos.

O admin tem histórico paginado, relatório e exportação CSV da empresa selecionada (com proteção contra fórmulas). Custos ficam no painel central, filtráveis pelas cinco tarefas. Treinos administrativos são identificados separadamente.

## Origem e dados anteriores

O site original é `simulador.rnavesconsultoria.com.br`. Sua base usava Next.js 15/React 19, JavaScript, Supabase, OpenAI SDK/Responses e Resend para o acesso por código. Essa autenticação não foi copiada para a Vertho.

**Decisão do responsável: não importar os usos antigos.** Não há importador, tabela de acervo, cópia de conversas, notas ou custos legados. Os novos treinos usam os cadastros da Vertho; clientes ainda não cadastrados seguem o fluxo normal de cadastro/convite da plataforma. Nenhum convite é enviado pela migration.

O domínio e a aplicação originais não são alterados por este deploy. Publicar o módulo na Vertho não redireciona automaticamente o endereço da RNaves nem migra contas de acesso antigas.

## Verificação e operação

Base: `docs/CHECKLISTS.md` §1. Checklist específico:

- **Antes do código:** separar treino de vendas do Copiloto e confirmar ausência de importação legada.
- **Antes de publicar:** gates de API e menu, incluindo acesso pelo domínio principal sem tenant no layout.
- **Antes de publicar:** testes de tenant/propriedade, revisões, moderação, idempotência, JSON e falha de persistência.
- **Antes de publicar:** validar SQL em transação com rollback (RLS, privilégios, FK, cota, lease e commit), depois aplicar migration.
- **Antes de publicar:** conversa real dos cinco agentes, persistência do relatório e custo atribuído; nenhum convite/disparo.
- **Antes de publicar:** imagem desktop/mobile e fluxo de configuração, chat e relatório com fixtures fictícias.
- **Antes de publicar:** stage seletivo, suíte completa, typecheck e build; commit somente dos arquivos da entrega.
- **Depois do push:** confirmar SHA/deployment e rotas de produção; manter liberação de participantes explícita por empresa.

Testes do núcleo, acesso, checkpoints, serviço e Responses em `tests/unit/simulador-vendas-*.test.ts` e `tests/unit/integrations/simulador-vendas-responses.test.ts`. Os guards de leitura/mutação também cobrem as três tabelas. A sonda real usa somente o tenant de demonstração, identificada como verificação técnica, com liberação de participantes desligada.

Rollback operacional: desligar a liberação por empresa e reverter o código. Preservar as tabelas e os novos históricos; não apagar dados para reverter a interface.
