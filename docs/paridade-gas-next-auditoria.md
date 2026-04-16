# Auditoria de Paridade GAS → Next.js

> Gerado em: Abril/2026
> Status: P0-P4 IMPLEMENTADOS

## GAPS CORRIGIDOS

### P0 — System Prompt Conversa ✅
**Antes:** 30 linhas genéricas
**Depois:** ~120 linhas com regras completas do GAS PromptBuilder.js:
- Proibições absolutas (nunca julgar, nunca sugerir, nunca induzir)
- 4 dimensões (SITUAÇÃO, AÇÃO, RACIOCÍNIO, AUTOSSENSIBILIDADE)
- Tipos de evidência (explícito, explícito_forte, inferido)
- [META] completo com razao, dimensao_explorada, dimensoes_cobertas, indicadores

### P1 — [EVAL] Block ✅
**Antes:** 6 campos simples
**Depois:** Estrutura completa do GAS:
- consolidacao: nivel_geral, nota_decimal, gap, confianca_geral, travas_aplicadas
- descritores_destaque: pontos_fortes + gaps_prioritarios com evidencia
- evidencias tipadas (trecho literal + indicador + tipo)
- feedback personalizado 3-5 parágrafos
- recomendacoes_pdi: 3 prioridades com descritor_foco, acao, barreira
- Regras de avaliação: travas (N1 crítico → max N2), arredondamento para BAIXO

### P2 — Business Rules ✅
**Antes:** Sem validação de mensagem, sem mínimo de evidências
**Depois:**
- MIN_EVIDENCIAS_ENCERRAR = 2 (não encerra sem evidência explícita)
- MIN_MESSAGE_LENGTH = 10 chars
- MAX_MESSAGE_LENGTH = 4096 chars (trunca)
- decidirFase conta evidências explícitas antes de permitir encerramento

### P3 — Cenário B ✅
**Antes:** Prompt genérico sem regras de construção
**Depois:** Prompt completo do GAS CenarioBGenerator.js:
- Regras: realismo, dilema, poder discriminante, diversidade vs cenário A
- Output: descricao + personagens + situacao_gatilho + 4 perguntas por dimensão
- referencia_avaliacao N1-N4
- dilema_etico_embutido (valor testado, caminho fácil vs ético)

### P4 — Check IA4 ✅
**Antes:** Não existia
**Depois:** Validação de qualidade 4D × 25pts (baseada em GAS Checkia4.js):
- D1: Evidências e Níveis (25pts)
- D2: Coerência da Consolidação (25pts)
- D3: Feedback + Perfil (25pts)
- D4: Plano PDI (25pts)
- Threshold: >= 90 Aprovado, < 90 Revisar
- Migration 019: check_nota, check_status, check_resultado

### PPP — 10 Seções ✅ (corrigido anteriormente)
Template de extração alinhado ao GAS PPPExtractor.js

---

## GAPS PENDENTES (P5-P6)

### P5 — Relatórios com Template Detalhado
**Status:** PARCIAL
**Gap:** Os relatórios individuais/gestor/RH usam callAI genérico. No GAS, havia templates Google Docs com seções específicas (resumo executivo, tabela por competência, evolução, PDI, recomendações DISC).
**Ação necessária:** Enriquecer prompts de geração de relatórios em fase3.js com as seções do GAS.
**Risco:** Médio — afeta qualidade do output mas não funcionalidade.

### P6 — Tutor Feedback com Critérios
**Status:** PARCIAL
**Gap:** BETO agora tem contexto de pílula (implementado), mas o GAS tinha 5 critérios de avaliação de evidência (concretude, autenticidade, reflexão, impacto, aplicação) + sistema de pontuação (0-20pts/semana).
**Ação necessária:** Adicionar avaliação de evidência no cron triggerQuinta + feedback estruturado.
**Risco:** Médio — afeta engajamento da fase 4.

---

## DIFERENÇAS INTENCIONAIS (não são gaps)

| Aspecto | GAS | Next.js | Motivo |
|---|---|---|---|
| Storage | Google Sheets + Drive JSON | Supabase PostgreSQL | Arquitetura nova |
| PDF | Google Docs template injection | @react-pdf/renderer em memória | Sem dependência Google |
| Auth | OTP 6 dígitos caseiro | Supabase Auth Magic Link | Padrão seguro |
| Deploy | GAS WebApp (6min timeout) | Vercel Serverless (60s + QStash) | Escalável |
| Batch | ScriptProperties + triggers | QStash delay incremental | Async nativo |
| Multi-tenant | 1 planilha por empresa | 1 banco, empresa_id + subdomínio | Unificado |
| Gamificação | Pontos + badges + streak | Não implementado (decisão do produto) | Excluído por escolha |
| Cache Claude | cache_control ephemeral | Não implementado | Otimização futura |
| Extended Thinking | adaptive/max_effort configurable | Implementado em ai-client.js | ✅ |

---

## RESUMO QUANTITATIVO

| Categoria | Total | Corrigido | Pendente |
|---|---|---|---|
| Prompts críticos | 5 | 5 | 0 |
| Business rules | 6 | 4 | 2 |
| Automações | 3 | 3 | 0 |
| Validações | 2 | 2 | 0 |
| Persistência | 3 | 3 | 0 |
| Templates output | 3 | 1 | 2 |
| **TOTAL** | **22** | **18** | **4** |

## ARQUIVOS ALTERADOS NESTA AUDITORIA

1. `app/api/chat/route.js` — System prompt, [EVAL], business rules
2. `actions/cenario-b.js` — Prompt completo do GAS
3. `actions/check-ia4.js` — NOVO: validação 4D × 25pts
4. `app/admin/empresas/[empresaId]/actions.js` — Check IA4 conectado
5. `supabase/migrations/019_check_ia4.sql` — Colunas de check
6. `docs/paridade-gas-next-auditoria.md` — Este relatório
