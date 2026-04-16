# Política de Proteção de Dados — Vertho Mentor IA

**Versão**: 1.0 · **Vigência**: 2026-04-16 · **Próxima revisão**: 2026-10-16

## 1. Escopo

Este documento define como a plataforma Vertho Mentor IA trata dados pessoais, em conformidade com a **Lei 13.709/2018 (LGPD)**. Cobre dados de colaboradores das empresas clientes, administradores RH/Gestor e admins da Vertho.

## 2. Papéis (Art. 5º LGPD)

| Papel | Quem | Responsabilidade |
|---|---|---|
| **Controlador** | Empresa cliente (contratante do serviço) | Define finalidades e meios do tratamento. É quem firma o contrato do SaaS. |
| **Operador** | Vertho (fornecedor da plataforma) | Trata dados em nome do controlador, por instrução contratual. |
| **Encarregado (DPO)** | *[NOME DO DPO A DEFINIR]* — `dpo@vertho.ai` | Canal de comunicação entre controladores, titulares e ANPD. |

**IMPORTANTE**: o DPO precisa ser designado formalmente antes do go-live com clientes reais. Placeholder até a decisão.

## 3. Categorias de dado tratadas

| Categoria | Exemplos | Sensibilidade LGPD | Base legal |
|---|---|---|---|
| Identificação | nome, email, foto, cargo | Pessoal comum (Art. 5º I) | Execução de contrato (Art. 7º V) |
| Profissional | área/depto, tempo de empresa, hierarquia | Pessoal comum | Execução de contrato |
| Comportamental | perfil DISC, valores, estilos | **Sensível** (Art. 5º II — dado comportamental) | Legítimo interesse (Art. 7º IX) com teste de proporcionalidade formal |
| Desenvolvimento | transcripts de conversas IA, respostas a cenários, evidências relatadas, notas por descritor, insights | Pessoal comum com potencial sensibilidade quando contextual | Execução de contrato + Legítimo interesse |
| Técnicos | cookies, logs, IP, user agent | Pessoal comum | Legítimo interesse (segurança) + Consentimento (analytics) |
| Comunicação | WhatsApp/email enviados | Pessoal comum | Execução de contrato |

**NÃO TRATAMOS**: CPF, RG, dados bancários, saúde, orientação sexual, religião, filiação política ou sindical, dado de menor de 18 (exceto com consentimento parental explícito do cliente controlador).

## 4. Finalidades

- **Primárias** (execução de contrato):
  - Avaliação de competências e desenvolvimento profissional.
  - Geração de trilhas personalizadas, relatórios, feedbacks e PDIs.
  - Comunicação com colaborador (notificações de progresso, lembretes).
- **Secundárias** (legítimo interesse):
  - Melhoria do produto via análise agregada (padrões de uso, não individuais).
  - Segurança e auditoria.
- **Proibido**:
  - Venda, locação ou compartilhamento com terceiros sem base legal.
  - Uso pra treinamento de modelos de IA de terceiros (Anthropic/OpenAI/Google — ver §9).

## 5. Retenção e descarte

| Dado | Prazo | Base | Descarte |
|---|---|---|---|
| Identificação e profissional | Enquanto colab ativo no cliente + 5 anos após desligamento | CLT/tributário | Anonimização irreversível (agregação, remoção de identificadores) |
| Comportamental (DISC) | Enquanto colab ativo + 2 anos | Legítimo interesse + portabilidade | Exclusão mediante solicitação do titular |
| Transcripts IA | 18 meses após conclusão da trilha | Fins analíticos agregados | Anonimização (substituir nomes por aliases) |
| Evolution Reports | 5 anos (registro histórico) | Relatório final do desenvolvimento | Manutenção pelo cliente controlador |
| Logs técnicos | 12 meses | Segurança | Rotação automática |
| Dados de pagamento | Não tratamos (gateway externo) | N/A | N/A |

**Trigger de descarte**:
- Solicitação do titular (Art. 18 V) → executado em até 15 dias.
- Fim do contrato com o cliente → exclusão em 90 dias (SLA contratual).
- Inatividade prolongada → colab não faz login há 24 meses → anonimização automática.

## 6. Direitos do titular (Art. 18)

Canal exclusivo: `dpo@vertho.ai`. SLA de resposta: **15 dias úteis**.

| Direito | Como exercer | SLA |
|---|---|---|
| Confirmação/acesso | Solicitação ao DPO com email cadastrado | 15 dias |
| Correção | Autoatendimento em /dashboard/perfil + solicitação ao DPO | Imediato/15 dias |
| Anonimização/exclusão | Solicitação ao DPO (requer aviso ao controlador) | 30 dias |
| Portabilidade | Solicitação ao DPO — CSV/JSON estruturado | 30 dias |
| Informação sobre compartilhamento | Lista automática no canal DPO | 15 dias |
| Revogação de consentimento | Colab pode desativar Analytics e notificações | Imediato |

## 7. Trilha de auditoria

Logs obrigatórios (já implementados ou previstos):

- **`ia_usage_log`** (migration 038): chamadas de IA por colab, modelo, tokens, timestamp.
- **`admin_access_log`** (planejado — sprint masking painéis): acesso Vertho a dados identificados de colabs.
- **`videos_watched`**: eventos de consumo de conteúdo.
- **`checkpoints_gestor`** (migration 039): validações humanas do gestor.
- **Supabase Auth logs**: sign-in, sign-out, reset de senha (retidos 90 dias pela infra Supabase).

**Gap atual**: não há log de acesso geral quando Vertho (platform admin) abre painéis com dados de colabs. Prioridade alta pro próximo sprint.

## 8. Segurança

### Camadas ativas
- **HTTPS obrigatório** (Vercel + Supabase — TLS 1.2+).
- **RLS habilitado** em todas as tabelas sensíveis (migrations 037+).
- **Autenticação** via Supabase Auth (email + magic link).
- **Multi-tenant isolation** via filtro `empresa_id` em todas as queries (helper `lib/tenant-db.js` em rollout).
- **Secrets** em variáveis de ambiente, nunca commitadas.
- **Backups** automáticos Supabase (retention 7 dias — upgrade pra Pro dá 30d point-in-time).
- **Rate limit** em endpoints de IA (Tira-Dúvidas 10/dia, expansível).

### Melhorias planejadas
- Audit log de acesso a dados identificados por admin.
- Masking default de PII em painéis cross-tenant.
- Backup/restore trimestral validado.
- MFA obrigatório pra admins.
- Rotação de secrets trimestral.
- Pentest anual.

## 9. Compartilhamento com terceiros

| Fornecedor | Dado enviado | Finalidade | Base legal | Config LGPD |
|---|---|---|---|---|
| **Supabase** | Todos (DB + Auth + Storage) | Infra | Execução de contrato | Subprocessador. DPA contratado. Dados em região `us-east-1` (TODO: mover pra BR). |
| **Anthropic (Claude)** | Prompts IA com PII anonimizada (aliases opacos — `lib/pii-masker.js`) | Geração de conteúdo e avaliação | Legítimo interesse + anonimização | Anthropic não retém dados (zero-retention enterprise). Validação recorrente. |
| **Google (Gemini)** | Prompts com PII anonimizada | Alternativa Claude | Legítimo interesse | Mesma validação. |
| **OpenAI** | Prompts com PII anonimizada | Alternativa Claude | Legítimo interesse | Zero-retention em modo API (não treina). |
| **Bunny Stream** | Metadata (não vídeos de colab) | Hospedagem de conteúdo didático | Execução de contrato | Videos são do cliente, não do colab. |
| **Z-API** | Telefone + texto WhatsApp | Envio de notificações | Execução de contrato | LGPD-compliant. |
| **QStash** | Mensagens sem PII | Scheduler | Legítimo interesse | Upstash. |
| **Resend** | Email + conteúdo da mensagem | Envio transacional | Execução de contrato | DPA. |
| **Sentry** | Stack traces, logs de erro | Monitoramento | Legítimo interesse | Filtrar PII em logs (TODO). |
| **Vercel** | Hosting | Infra | Execução de contrato | DPA. |

**Proibição específica**: nenhum fornecedor pode usar dados da Vertho pra **treinar modelos próprios**. Cláusula obrigatória em contratos.

## 10. Transferência internacional

- Supabase (us-east-1), Vercel (global edge), Anthropic (us-west), OpenAI (us-east), Google (multi-região).
- Base legal: **cláusulas contratuais padrão** (SCC) equivalentes a GDPR, aceitas pela ANPD via Resolução CD/ANPD 4/2023.
- **TODO**: migrar DB principal pra `sa-east-1` (São Paulo) em 2027 pra reduzir superfície de transferência.

## 11. Incidentes

**Playbook** (a formalizar em documento separado):
1. **Detecção**: Sentry, logs Supabase, report externo.
2. **Contenção**: isolar tabela/endpoint, revogar tokens, ativar manutenção.
3. **Avaliação** de impacto: quantos titulares, quais categorias, risco.
4. **Notificação**:
   - ANPD: em até 72h (Art. 48 LGPD).
   - Titulares afetados: em até 5 dias úteis (se risco relevante).
   - Controladores (clientes): em até 24h.
5. **Mitigação e correção**: patch, rotação de secrets, auditoria.
6. **Postmortem** público (interno) em até 30 dias.

## 12. Menores de idade

A plataforma **não é destinada a menores de 18 anos**. Se o cliente controlador for escola/segmento educacional com colabs maiores de 16, tratamento depende de consentimento parental explícito obtido pelo próprio cliente (não pela Vertho).

## 13. Revisão e responsabilidade

- **Revisão**: semestral (abril/outubro) ou sempre que houver mudança material.
- **Responsável pela atualização**: DPO com aprovação da diretoria.
- **Registros de alteração**: commits em `docs/lgpd-politica.md`.

## 14. TODOs críticos pré go-live

1. [ ] Designar DPO formalmente + contato ativo.
2. [ ] DPA (Data Processing Agreement) template com clientes.
3. [ ] Audit log de acesso admin (`admin_access_log`).
4. [ ] Masking PII em painéis Vertho.
5. [ ] Playbook de incidente formal.
6. [ ] MFA obrigatório admins.
7. [ ] Rotação de secrets documentada.
8. [ ] Validar zero-retention contratual com Anthropic/OpenAI/Google.
9. [ ] Filtrar PII nos logs Sentry.
10. [ ] Avaliar migração pra `sa-east-1` Supabase.

---

**Contato**: `dpo@vertho.ai` · **Última atualização**: 2026-04-16
