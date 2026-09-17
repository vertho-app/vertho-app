# Ipi — assistência operacional interna

Ipi orienta admins e analistas no preenchimento, navegação, relatórios e pré-requisitos da Vertho. É separado do Beto e aparece nos shells `/admin` e `/admin-v2`.

## Acesso e limites

O componente servidor e `POST /api/ipi` exigem sessão autenticada, cadastro como administrador da plataforma, permissão efetiva `admin.access` e domínio exato `@vertho.ai`. Personas `*.demo@vertho.ai` não são staff e ficam excluídas. A identidade não vem do body. A rota valida origem, tamanho, histórico e empresa, limita a oito perguntas por minuto por usuário e não permite cache da resposta.

Não há ferramentas de escrita, execução de comandos, SQL livre, envio de mensagens ou alteração de programação. O catálogo de consultas em `lib/ipi/data.ts` contém somente SELECTs, com colunas fixas, limite de resultados, permissões específicas e `tenantDb(empresaId)`. Admins de plataforma podem consultar qualquer empresa, como no painel; o modelo não escolhe a empresa. A leitura de `empresas` usa id exato. Sem empresa selecionada, não há consulta de dados.

Consultas disponíveis: contagens de cadastros/trilhas, nomes de cargos e competências, cadastro e presença de perfil comportamental, status de trilhas e metadados de relatórios por pessoa identificada. Não lê respostas de avaliações, conversas, telefones, conteúdo de relatórios ou configurações privadas. Nomes ambíguos pedem esclarecimento. Falhas são evidência de indisponibilidade, nunca ausência de registros. O registro de custo da IA usa o ledger já existente, com a task `ipi`; não há gravação de dados de negócio pelo bot.

## Conhecimento

- `docs/ipi/manual.json`: extrato textual das 77 telas administrativas do Manual de Telas de 10/08/2026. Sem capturas, alvos, e-mails ou UUIDs de produção. As instruções têm a data original e precisam de revisão quando um fluxo mudar. Origem e manutenção do manual: `docs/MANUAL-DE-TELAS.md`.
- `scripts/build-ipi-knowledge.mts`: roda em `predev` e `prebuild`, gera `.ipi/knowledge.json` com o manual e trechos dos arquivos de produto permitidos. Ignora envs, backups, scripts e links simbólicos; remove referências a configuração privada e padrões de credenciais. O índice não fica em `public/`, não é versionado e é incluído somente na função do Ipi pelo tracing do Next.
- A consulta ao código usa o índice do **build em execução**, não o working tree de um desenvolvedor. O hash muda com as fontes. `lib/blocos-offline.ts` é consultado em runtime; conteúdo histórico de módulo desativado não significa recurso disponível.
- O modelo planeja até três buscas/consultas por pergunta em JSON validado. Busca lexical seleciona até quatro trechos do manual e quatro de código. A resposta deve identificar limites e citar as fontes fornecidas. Não há acesso livre ao disco nem execução do código pesquisado.

O painel mostra referências e links internos resolvidos pelo servidor. Links arbitrários e HTML gerados pelo modelo não são clicáveis. Histórico fica somente na memória da aba; trocar de empresa inicia outra conversa e cancela a resposta anterior.

## Verificação

`npx vitest run tests/unit/security/ipi-access.test.ts tests/unit/ipi-data.test.ts tests/unit/ipi-knowledge.test.ts`

Cobertura: domínio exato/demo, sessão, permissão negada, identidade adulterada, origem, cota, esquema de consulta, filtro de tenant, ambiguidade, falhas do banco, ausência de escrita e busca no extrato real. Build gera o índice e o inclui no artefato de servidor; typecheck e suíte completa fazem parte da publicação.
