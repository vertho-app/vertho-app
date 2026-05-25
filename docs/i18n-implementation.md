# Internacionalização Vertho

Locales suportados:

- `pt-BR`: padrão global e fallback.
- `pt-PT`: português de Portugal.
- `es-ES`: espanhol da Espanha.

## Camadas

1. UI fixa: `next-intl` com arquivos em `messages/*.json`.
2. Preferência de idioma: cookie `vertho-locale`, depois `empresas.default_locale` e futuramente `colaboradores.locale`.
3. Conteúdo de negócio: deve migrar para tabelas de tradução por entidade em sprint própria.
4. IA: `actions/ai-client.ts` injeta instrução de idioma, mantendo chaves JSON técnicas.
5. Canais externos: templates de acesso ficam em `lib/i18n-auth-templates.ts`.

## Convenção de chaves

- Namespaces por área: `Login`, `DashboardHome`, `DashboardJourney`, `Profile`, `Assessment`, `AssessmentChat`, `Pdi`, `Season`, `SeasonDone`, `Evolution`, `Voting`.
- Textos comuns em `Common`.
- Evitar concatenação de frases. Preferir placeholders:

```json
{
  "hello": "Olá, {name}"
}
```

## Fluxo para migrar uma tela

1. Adicionar as chaves nos três arquivos de `messages`.
2. Em Server Component, usar `getTranslations`.
3. Em Client Component, usar `useTranslations`.
4. Rodar `npm run typecheck`.
5. Rodar `npm run build` quando a mudança tocar layout, providers ou rotas.

## Auditoria

Rodar:

```bash
node scripts/i18n-audit.mjs
npm run i18n:check
```

O script lista possíveis textos em português ainda hardcoded. Ele é intencionalmente ruidoso; serve para priorizar próximas telas, não para bloquear build automaticamente.
`npm run i18n:check` valida que `pt-PT` e `es-ES` têm as mesmas chaves de `pt-BR`.

## Conteúdo dinâmico e IA histórica

Política adotada:

- UI fixa sempre usa `messages/*.json`.
- Conteúdo vindo do banco permanece no idioma em que foi criado, incluindo relatórios, evidências, auditorias e respostas antigas de IA.
- Novas chamadas de IA recebem instrução de idioma via `actions/ai-client.ts`, usando o locale resolvido do usuário/empresa.
- Para conteúdo histórico, a melhor evolução é armazenar traduções por entidade quando houver necessidade real de republicação multi-idioma, evitando sobrescrever o original auditável.
- Campos técnicos, nomes oficiais, CNAEs, CNPJs, classificações de dados públicos e nomenclaturas de pipelines não devem ser traduzidos automaticamente.

## Status do lote atual

Implementado:

- Configuração base `next-intl`, provider global, metadata localizada e resolução de locale.
- Seleção de idioma no login e persistência via cookie.
- Locale padrão da empresa no admin de configurações.
- Templates localizados para magic link, cadastro e OTP por WhatsApp/e-mail.
- Instrução de idioma nas chamadas de IA.
- UI fixa migrada em home, login, shell do dashboard, jornada, perfil, assessment, chat do assessment, PDI, temporada, semanas internas da temporada, avaliação final da temporada, temporada concluída, evolução, votação, tela consolidada de perfil comportamental, questionário de mapeamento DISC, acesso admin, nova empresa, camada principal do dashboard admin, gerenciamento de colaboradores/cargos, camada principal do pipeline da empresa, administração de temporadas, votação administrativa de competências, perfil comportamental externo, perfis comportamentais administrativos, administração principal de pulso, dashboard agregado de pulso, envio de convites de pulso, relatórios administrativos da empresa, fase 1, fase 2, fase 4, gestão global de cargos, competências, assessment inicial de descritores, métricas de vídeos, banco de micro-conteúdos incluindo modais, relatórios globais, evolução administrativa, camada principal de Fit v2, seletor de idioma no perfil do usuário, extração de PPPs incluindo modal de dossiê, Top 10 global, administradores da plataforma, preferências de aprendizagem, simulador administrativo, lixeira, simulador de custo de IA, admin Radar, funis Radar, qualidade de dados Radar, orçamento, potencial por cidade, base de conhecimento, evidências semanais, envios WhatsApp/e-mail, Radar Empresas, listas, redes, ficha de empresa, avaliação acumulada e auditoria sem 14.

Pendente para próximos lotes:

- Refinamento semântico de `pt-PT` e `es-ES` para chaves recém-adicionadas que inicialmente herdaram texto base em português brasileiro.
- Migração completa da tela legada de Mercado Potencial, que ainda contém muitos rótulos internos e fórmulas explicativas específicas.
- Conteúdos dinâmicos de banco, relatórios históricos e textos gerados previamente por IA seguem política acima.

## Banco

Migration:

```txt
migrations/114-i18n-locales.sql
```

Adiciona:

- `empresas.default_locale`
- `colaboradores.locale`

Fallback esperado:

```txt
colaboradores.locale -> empresas.default_locale -> pt-BR
```
