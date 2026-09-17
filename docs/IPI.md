# Ipi — assistência operacional interna

O Ipi orienta usuários internos no preenchimento, navegação, relatórios e pré-requisitos da Vertho. É separado do Beto e aparece nos shells `/admin`, `/admin-v2`, `/dashboard` e `/representante`. No dashboard, seu botão fica acima do Beto.

## Acesso e limites

O componente servidor e `POST /api/ipi` exigem somente sessão autenticada e domínio exato `@vertho.ai`, independentemente de papel ou permissão `admin.access` (liberação ampliada solicitada em 17/09/2026). Subdomínios e outros domínios ficam bloqueados. A identidade não vem do body. A rota valida origem, tamanho, histórico e empresa, limita a oito perguntas por minuto por usuário e não permite cache da resposta.

Não há ferramentas de escrita, execução de comandos, SQL livre, envio de mensagens ou alteração de programação. O catálogo de consultas em `lib/ipi/data.ts` contém somente SELECTs, com colunas fixas, limite de resultados, permissões específicas e `tenantDb(empresaId)`. Admins de plataforma podem consultar qualquer empresa, como no painel; os demais ficam limitados à empresa da sessão, revalidada tanto na rota quanto no catálogo de leitura. O modelo não escolhe a empresa. O acesso ao assistente não amplia permissões de dados: as consultas empresariais exigem `companies.view`, as permissões específicas de cada dado e escopo de empresa inteira (admin de plataforma ou RH). Perfis com escopo de equipe, tutorados ou dados próprios continuam recebendo orientação pelo manual e código, sem executar esse catálogo de consultas globais. A leitura de `empresas` usa id exato. Sem empresa selecionada, não há consulta de dados.

Consultas disponíveis: contagens de cadastros/trilhas, nomes de cargos e competências, cadastro e presença de perfil comportamental, status de trilhas e metadados de relatórios por pessoa identificada. Não lê respostas de avaliações, conversas, telefones, conteúdo de relatórios ou configurações privadas. Nomes ambíguos pedem esclarecimento. Falhas são evidência de indisponibilidade, nunca ausência de registros. O registro de custo da IA usa o ledger já existente, com a task `ipi`; não há gravação de dados de negócio pelo assistente.

## Modelo de IA

Modelo principal: Claude Sonnet 4.6 (`claude-sonnet-4-6`), resolvido pela task `ipi` em `lib/ai-tasks.ts` nas duas etapas (planejamento da consulta e resposta). O wrapper padrão mantém o fallback de provedor.

## Conhecimento

- `docs/ipi/manual.json`: extrato textual das 77 telas administrativas do Manual de Telas de 10/08/2026. Sem capturas, alvos, e-mails ou UUIDs de produção. As instruções têm a data original e precisam de revisão quando um fluxo mudar. Origem e manutenção do manual: `docs/MANUAL-DE-TELAS.md`.
- `scripts/build-ipi-knowledge.mts`: roda em `predev` e `prebuild`, gera `.ipi/knowledge.json` com o manual e trechos dos arquivos de produto permitidos. Ignora envs, backups, scripts e links simbólicos; remove referências a configuração privada e padrões de credenciais. O índice não fica em `public/`, não é versionado e é incluído somente na função do Ipi pelo tracing do Next.
- A consulta ao código usa o índice do **build em execução**, não o working tree de um desenvolvedor. O hash muda com as fontes. `lib/blocos-offline.ts` é consultado em runtime; conteúdo histórico de módulo desativado não significa recurso disponível.
- O modelo planeja até três buscas/consultas por pergunta em JSON validado. Busca lexical seleciona até quatro trechos do manual e quatro de código. As fontes são usadas internamente para fundamentar a orientação, sem citações na resposta. Não há acesso livre ao disco nem execução do código pesquisado.

O painel não mostra fontes consultadas nem marcadores como `[F1]` ou `[D1]`. O prompt pede orientação sem citações, e o servidor e a interface removem os marcadores caso o modelo os produza. Metadados das fontes não são devolvidos pela API. Links arbitrários e HTML gerados pelo modelo não são clicáveis. Histórico fica somente na memória da aba; trocar de empresa inicia outra conversa e cancela a resposta anterior.

## Verificação

`npx vitest run tests/unit/security/ipi-access.test.ts tests/unit/ipi-data.test.ts tests/unit/ipi-knowledge.test.ts tests/unit/ipi-answer.test.ts tests/unit/ipi-visibility.test.ts`

Cobertura: acesso de contas @vertho.ai sem papel administrativo, visibilidade nos shells, bloqueio de outros domínios, sessão, permissões de dados, identidade adulterada, origem, cota, esquema de consulta, isolamento de tenant e escopo de dados, ambiguidade, falhas do banco, ausência de escrita e busca no extrato real. Build gera o índice e o inclui no artefato de servidor; typecheck e suíte completa fazem parte da publicação.
