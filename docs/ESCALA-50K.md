# Escala — gargalos para um cliente de ~50 mil usuários

Análise de 25/06/2026. **Princípio:** o que é caro de PRODUZIR já é REUSADO, então
conteúdo **não** escala com o nº de usuários — o gargalo é a camada **por pessoa**.

## O que NÃO é gargalo (o design acerta)
- **Conteúdo do kit** (texto/case/áudio): reusado por **(competência × descritor × cargo × DISC)**. 50k pessoas numa empresa caem em poucas dezenas de células.
- **Vídeo (deck)**: por célula. **PDF personalizado**: por **arquétipo DISC** (lazy + cache), não por pessoa.
- **Render Hetzner**: efêmero, proporcional a células.
- **Conexões Postgres**: o app conecta 100% via supabase-js → **PostgREST (REST)**, não `pg` direto (só scripts) → não esgota conexões serverless.

## Gargalos (por pessoa)

### #1 — WhatsApp (entrega em massa) · 🔴 DURO, pendente
`actions/whatsapp-lote.ts` enfileira no QStash com `DELAY_BETWEEN_MS=2000` → **0,5 msg/s por número**. 50k × ~2 msg/semana = **~55h de envio/semana** num número. E o **Z-API é não-oficial** → 50k/dia = ban quase certo.
**Saída:** WhatsApp **Cloud API oficial** (Meta, ~80 msg/s escalável; 50k em ~10 min) + **templates aprovados** (outbound fora da janela de 24h). É envio transacional — vai direto na Cloud API, separado do **atendimento humano**, que tem tela própria (`docs/INBOX-WHATSAPP.md`).

> ⚠️ Corrigido em 14/08/2026: esta linha citava o **Chatwoot** como destino do atendimento humano. O
> Chatwoot foi **descartado** — ele não separa tenants, e um único número serve ~10 empresas, o que
> misturaria as conversas de todos os clientes numa inbox só. A caixa de entrada é construída no
> próprio app, onde o webhook já resolve o tenant na entrada.

### #2 — Saudação nominal por pessoa · ✅ resolvido
Era TTS (Vertex, rate-limited) + render Remotion por (usuário × material). **Cache** por usuário (`worker-hetzner/personalizar.mjs` → `greetings-cache` no storage): grava 1× e reutiliza. O(usuários × materiais) → O(usuários). Ver `GERADOR-VIDEO-MODULO.md`.

### #3a — Chat IA (reflexão/evidências) · 🟡 proposto
Hoje **Sonnet 4.6** em tudo (diálogo + extração de evidência), prompt caching já ligado. Custo **linear com usuários** + rate-limit da Anthropic.
**Proposta (não implementada — segurar):** **não** usar Haiku (conversa fica superficial). **Diálogo 50/50 Sonnet ↔ GPT-5.4, sticky por usuário** (2 provedores = ~2× throughput + resiliência; já há `AI_FALLBACK_MODEL=gpt-5.4` reativo) + **extração de evidência num modelo barato** (não é diálogo) + **teto de turnos**. Resolve **rate-limit**, não custo (ambos premium).

### #3b — Postgres/Supabase · ✅ 2 otimizações feitas; ⚠️ RLS pendente
**Feito (25/06):**
- **N+1 do overlay de kit**: `precarregarKits` (`entrega-semana.ts`) carrega todos os kits da trilha em **3 queries** e casa em memória — antes 2-3 queries POR semana (~30/abertura de tela).
- **`loadTemporada` leve**: select sem os 3 JSONB de transcript; traz reflexão/feedback/tira-dúvidas só da **semana em foco** (1 linha, não 14).
- **Compute**: escala com tier do Supabase + **read replica** para leituras quentes ($, não arquitetura). Índices tenant (empresa_id/colaborador_id) já OK.

**⚠️ RLS ausente = risco de SEGURANÇA (não de escala):** tudo usa **service-role**, que **bypassa RLS**. O isolamento multi-tenant depende 100% do wrapper `tenantDb` (filtro no código) — um bug de query sem `empresa_id` **vaza dados entre clientes** (LGPD). Decisão pendente:
- **(a)** manter `tenantDb` + **testes automatizados de isolamento** (mais barato, é a trilha das Fases 0-2) — recomendado começar por aqui;
- **(b)** migrar auth para **JWT + RLS real** (`auth.uid()`/claims por tenant) — defesa no banco, mas reescrita grande do acesso a dados.

## Quadro-resumo
| Gargalo | Status |
|---|---|
| WhatsApp (Z-API) | 🔴 pendente — Cloud API oficial + templates |
| Saudação por pessoa | ✅ cache feito |
| Chat IA (custo/rate) | 🟡 proposto (dual Sonnet+GPT-5.4) |
| Postgres (N+1 + load) | ✅ feito |
| Postgres (RLS/isolamento) | ⚠️ decisão pendente (segurança/LGPD) |
| Conteúdo (IA de produção) | 🟢 não é gargalo (reuso por célula) |
