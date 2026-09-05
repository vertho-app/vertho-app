# Treino de atendimento — recepção médica

Primeira versão, 05/09/2026. Um caso administrativo fictício: segunda remarcação.

## Uso

- Admin: `/admin/treino-atendimento` (menu Sistema → Treino de atendimento). Selecione uma empresa para testar. Administradores com permissão `assessments.answer` podem treinar mesmo com a clínica desabilitada.
- Habilitação da equipe: na mesma tela, `Habilitar para a equipe` exige admin de plataforma e `settings.company.manage`.
- Colaboradoras: `/dashboard/treino-atendimento`. O atalho aparece no menu do tenant habilitado. A API também verifica a habilitação, identidade, empresa e propriedade da sessão.
- Ler a ficha → iniciar → conversar → encerrar e avaliar → praticar novamente. Os últimos 20 atendimentos próprios aparecem no histórico.

O conteúdo é fictício, em português brasileiro; a empresa selecionada define acesso e atribuição de custo, não personaliza automaticamente a ficha. Não existe integração com agenda ou WhatsApp real. A nota não alimenta PDI, `respostas` ou N1–N4. A revisão por gestoras e a calibração ampla continuam necessárias para uso pedagógico mais amplo.

## Implementação

`lib/recepcao/core.mjs` e `cenario.mjs` vieram do protótipo local, ajustados para o runtime. `schema.ts` valida entradas e saídas com Zod. `ai.ts` usa o roteador existente e as tarefas `recepcao_paciente` e `recepcao_avaliacao`, configuráveis no catálogo de modelos. Os defaults são `claude-sonnet-4-6`.

O paciente não atribui nota. O avaliador devolve classificações e citações; o código confere literalidade, papel, oportunidade e consolida os pesos. Relatório inválido tem uma tentativa de correção. Se ambas falharem, o estado anterior é preservado para retry. Uma citação existir não prova, por si, que ela sustenta semanticamente a classificação; a calibração humana cobre essa limitação.

Metadados das chamadas incluem modelo solicitado, hash do prompt e versão `recepcao-1.0`, gravados junto à sessão. A tabela legada `prompt_versions` não é uma dependência: ela não estava disponível no schema cache do projeto no teste integrado. O roteador registra custo/uso normalmente e pode aplicar seus fallbacks; o modelo solicitado não deve ser confundido com o provedor efetivo do ledger. Testes administrativos usam `source=piloto`; treinos de colaboradoras usam `wrapper`.

O mascaramento existente reduz identificadores comuns em novas mensagens antes de salvar/enviar à IA. Não é detecção completa de dados pessoais ou de saúde; a tela instrui a usar apenas dados fictícios. Não há protocolo de triagem clínica neste caso.

## Persistência e concorrência

Migration `240-recepcao-treinamento.sql`: `recepcao_config` e `recepcao_sessoes`. Esta versão usa um snapshot JSON limitado a 12 respostas, com histórico, recibos e relatório, para salvar o turno e sua revisão juntos.

- RLS ligada; `anon` e `authenticated` não acessam tabelas/RPC diretamente.
- Backend exige identidade e filtra empresa + e-mail proprietário. A identidade enviada pelo navegador não é aceita.
- Criação usa UUID de requisição como chave, para não duplicar em retry.
- `recepcao_claim` adquire lease de 330 segundos com revisão esperada; outra requisição recebe conflito.
- `recepcao_commit` valida token e revisão, grava todo o estado e libera a lease numa operação atômica.
- Retry de turno confirmado devolve o recibo sem nova chamada. Falha antes do commit pode custar uma nova chamada, mas não duplica mensagens.
- Fechar a aba preserva turnos já confirmados; texto ainda não enviado não é salvo.

Novas entradas da allowlist de service role: `access.ts` (cliente após autenticação; consultas escopadas), `flag.ts` (apenas booleano de disponibilidade por empresa no layout) e API `config` (admin + permissão de configuração). Os testes verificam os acessos; essas entradas não dispensam guards.

## Verificação

- Testes de núcleo e serviço: notas, referências, projeção pública, retry, falha, isolamento e concorrência.
- Guards existentes: autenticação/CSRF, service role, mutações e leituras por empresa, ledger e separação de P&D.
- `scripts/_recepcao-db-check.mjs`: aplica a migration dentro de uma transação, testa FK, ACL, RLS, claim/commit, revisão e proprietário, e faz rollback.
- UI conferida por Playwright com API simulada: início, 3 turnos, relatório e repetição; desktop 1440 px e celular 390 px sem overflow.
- `tests/unit/recepcao-live-smoke.test.ts`: opt-in com `RECEPCAO_LIVE_SMOKE=1`; sessão sintética com três turnos e avaliação pelo roteador/provedor reais. Tem custo e grava telemetria. Não habilitar no CI padrão.

O primeiro ensaio real identificou uma dimensão sem oportunidade citada; o relatório foi rejeitado. Instrução explicitada e retry limitado implementado; o ensaio seguinte passou. Esse teste demonstra integração, não validação estatística das notas.

## Operação

Aplicar a migration antes da publicação. Todas as clínicas começam desabilitadas; nenhuma empresa existente é habilitada pela migration. A ferramenta administrativa permite testar e habilitar uma clínica específica.

Para suspender o piloto: desabilitar a clínica pela tela administrativa. Isso bloqueia novas operações de colaboradoras e esconde o atalho no próximo carregamento, preservando o histórico. Não apagar tabelas para reverter a interface.
