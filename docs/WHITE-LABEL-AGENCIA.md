# White label do simulador de recepção via agência

Plano de produto e engenharia para vender o treino de recepção médica (`docs/recepcao-medica.md`) e a jornada de 7 semanas no formato white label: uma agência revende para consultórios, opera tudo (cadastro de clínicas, secretárias, convites, liberação) e a Vertho cobra da agência por pessoa. Escrito em 09/09/2026 a partir do que existe na base; cada afirmação sobre o estado atual está marcada como medida ou suposta.

## 1. Resposta curta

É possível e a arquitetura ajuda: a plataforma já é multi-tenant por empresa, com branding por tenant, PDF sem marca por empresa, subdomínio por tenant e um modo de 7 semanas pronto no motor. O que não existe é o **nível do meio**: hoje há "plataforma" (opera tudo) e "empresa" (consome). A agência é um terceiro nível, que opera N empresas sem ser a plataforma. Isso toca autorização, onboarding e marca; não toca o motor de trilha nem o núcleo do simulador.

Estimativa: 7 a 10 semanas de engenharia mais conteúdo, sem WhatsApp white label (que soma 2 a 3 semanas e depende da Meta). Antes de qualquer fase, um piloto interno com uma clínica real: em 09/09 havia 0 clínicas habilitadas e a aba de equipe do simulador nunca tinha aberto (coluna fantasma, corrigida em `94862a2e`).

## 2. O que já existe (medido em 09/09/2026)

| Capacidade | Onde | Estado |
| --- | --- | --- |
| Tenant por empresa | `empresas` (id, nome, slug, segmento, ui_config, sys_config, default_locale, is_demo); 10 empresas reais | Sem coluna de grupo ou agência |
| Resolução por host | `proxy.js::extractTenantSlug`: primeiro rótulo de `*.vertho.ai`; `*.vercel.app` ignorado | Sem domínio próprio |
| Branding por tenant | `ui_config`: logo_url, primary_color, primary_color_end, accent_color, bg_gradient_start/end, font_color, font_color_secondary, login_subtitle, hidden_elements, labels (`lib/ui-resolver.ts`, `docs/ARQUITETURA.md` §3.4) | `hidden_elements` está vazio em todas as 12 empresas |
| PDF sem marca | `sys_config.pdf_sem_marca` (`lib/pdf-marca.ts`) | 1 empresa usa |
| Remetente de e-mail | `lib/domain.ts`: `noreply@{slug}.vertho.ai` por tenant | Sempre no domínio vertho.ai |
| Papéis | `lib/permissions.ts`: platform_admin e socio (plataforma); rh, gestor, tutor, colaborador (por empresa, em `colaboradores.role`) | Não há papel entre plataforma e empresa |
| Criar empresa e importar pessoas | `actions/onboarding.ts::criarNovaEmpresa` (`companies.manage`), `importarColaboradoresLote`; `app/admin/empresas/gerenciar/actions.ts` | Só platform admin |
| Habilitar o simulador | `/api/recepcao/config` (`requireAdmin` + `settings.company.manage`) | Só platform admin |
| Modo de 7 semanas | `lib/season-engine/programa-config.ts`: `programa_modo='jornada'` = `PROGRAMA_JORNADA` (6 semanas de conteúdo + avaliação) | Pronto no motor |
| Simulador | catálogo global (1.2/2.2/3.2), cópias por clínica, biblioteca de competências N1–N4 (só plataforma edita) | Calibrado; 0 clínicas habilitadas |
| Custo de IA por empresa | `ia_usage_log` + relatório semanal | Cobre o que passa pelo wrapper |
| Precificação | `lib/orcamento/precificacao.ts` (pessoa × ciclo) | Ferramenta de proposta, não cobrança |

O que a base **não tem**: agência como entidade; operador que lê várias empresas sem ser platform admin; onboarding self-service que crie conta (import não cria `auth.users`: `docs/ARQUITETURA.md` §3.1.2, caso Macaé com 156 importados e 0 contas); domínio próprio; remetente fora de vertho.ai; WhatsApp em outra marca; motor de cobrança; cargo "Recepção" com conteúdo para a jornada.

## 3. Decisões que precedem o código (fase 0)

1. **Quem opera.** Em 24/08 ficou registrado "a Vertho opera, o cliente consome" (`docs/ARQUITETURA.md` §26). No white label a agência opera: cria clínica, importa e convida pessoas, habilita o simulador, escolhe o modo. Registrar a inversão no §26 antes da fase 1.
2. **O que é "pessoa cobrável".** Cadastrada, ativa no mês (entrou) ou que treinou. Recomendação: cadastrada com convite aceito (tem `auth.users`), contada no último dia do mês; treino e jornada entram como uso, não como preço.
3. **WhatsApp.** Número e templates aprovados na Meta são da Vertho (`docs/TEMPLATES-WHATSAPP.md`). Ou a agência aceita mensagens assinadas Vertho, ou traz número e portfólio próprios (o que hoje é variável de ambiente global vira configuração por agência). Recomendação para a v1: e-mail e push em white label; WhatsApp opcional, com marca Vertho declarada no contrato.
4. **Domínio.** `simulador.agencia.com.br` exige domínio na Vercel e tabela host → tenant no proxy. Alternativa v1: `agencia.vertho.ai` com branding da agência.
5. **O que a agência edita.** Cenários da clínica sim (já existe: "Copiar para a clínica"); biblioteca de competências e catálogo Vertho continuam da plataforma; pesos por caso sim.
6. **Teto por contrato.** Pessoas contratadas por agência e por clínica, com bloqueio de novo cadastro acima do teto (hoje só há rate limit por usuário e `allow_open_signup` em `sys_config`).

## 4. Fases

### Fase 1 · Agência como entidade e operador (2 a 3 semanas)

- Migration: `agencias` (id, nome, slug, ui_config, sys_config, teto_pessoas, created_at), `empresas.agencia_id` (nullable; FK), `agencia_operadores` (agencia_id, email, role, created_at) com RLS e grants no padrão do módulo (sem policy que finja proteger: a defesa é código + guard).
- Contexto: `lib/authz::getUserContext` passa a resolver `agencia` e `isAgencyOperator`; `lib/permissions::can()` ganha o papel `agencia_operador` com as permissões de operação restritas às empresas da agência (`empresasDaAgencia(auth)` como fonte única).
- Gates: `requireAdminSupabase('companies.manage')`, `importarColaboradoresLote`, `/api/recepcao/config` e `lib/recepcao/access.ts::empresaDaSessao` aceitam o operador quando a empresa alvo pertence à agência dele.
- Tela `/agencia`: clínicas da agência (criar, editar branding herdado, habilitar simulador, escolher `programa_modo`), pessoas por clínica com estado (cadastrada, convidada, entrou, treinou) e reenvio de convite, uso (treinos, notas, jornadas), sem nada de outras agências nem da operação Vertho. Reaproveita `app/admin-v2/clientes/CarteiraOperacional.tsx` como referência de layout.
- Guard de CI novo: `tests/unit/security/agencia-isolamento-guard.test.ts`: operador da agência A não lê nem escreve empresa da agência B; platform admin continua vendo tudo; usuário de empresa não vê a agência.
- Onboarding: o convite cria a conta (`createUser` + magic link, ou telefone com `login_por_whatsapp`), e o estado por pessoa é lido de `auth.users` e `auth.sessions`, não inferido do import (`docs/CHECKLISTS.md` §3 "Acesso da turma importada").

### Fase 2 · Marca (1 a 2 semanas)

- Herança: `ui_config` da agência como default das clínicas dela (`lib/ui-resolver.ts` resolve clínica → agência → Vertho).
- Marca cravada: `app/dashboard/dashboard-shell.tsx` (3 ocorrências), `app/login/page.tsx` (2), `lib/internal-emails.ts` (2), capas de PDF (`PdfReportCover.tsx`, `PdfCover.tsx`) passam a ler o nome da marca do tenant; `pdf_sem_marca` vira herdado da agência.
- E-mail: identidade SES por agência (`noreply@agencia.com.br`) com verificação de domínio; `lib/domain.ts` resolve remetente por agência antes do por tenant.
- Domínio próprio: tabela `dominios(host, empresa_id | agencia_id)` consultada pelo proxy quando o host não termina em `vertho.ai`; domínio adicionado na Vercel. Se a decisão da fase 0 for `agencia.vertho.ai`, esta linha sai.

### Fase 3 · Programa Recepção de 7 semanas (2 a 3 semanas, conteúdo)

- Cargo "Recepção de consultório" com as 6 competências da biblioteca do simulador (`lib/recepcao/competencias-base.ts`, já com N1–N4) como competências e descritores do cargo.
- Módulos-base, kit semanal e vídeos para essas competências (`docs/KIT-SEMANAL.md`, `docs/MODULOS-BASE-CONTEUDO.md`); o simulador entra como atividade das semanas de conteúdo e a avaliação da semana 7 usa o caso de nível "Limite contestado".
- Validar `PROGRAMA_JORNADA` para esse cargo numa clínica piloto; medir o custo de IA por pessoa da jornada inteira (kit, cenários, vídeo personalizado, podcast) e do simulador (R$ 0,34 por treino em 06/09) para o preço por pessoa.

### Fase 4 · Cobrança e operação (1 semana)

- Relatório mensal por agência: pessoas cobráveis por clínica (pela definição da fase 0), treinos, jornadas, custo de IA (`ia_usage_log`) e margem; exportável. Fatura manual na v1.
- Teto por contrato aplicado no cadastro; alerta quando passar de 90%.
- Health: as regras do simulador (R16–R19 do `lib/pipeline-health/regras.ts`) e o relatório de custo passam a agrupar por agência.
- Doc e memória: este arquivo vira o canônico do assunto; `docs/ARQUITETURA.md` §3 ganha o terceiro nível.

## 5. Riscos, em ordem

1. **Isolamento entre agências.** Novo principal multi-tenant; hoje toda leitura cross-tenant é só platform admin. Guard e teste de mutação antes de qualquer tela.
2. **Onboarding de contas.** Sem fluxo que cria conta e mostra o estado por pessoa, a agência repete Macaé (importa, convida, ninguém entra).
3. **WhatsApp com marca Vertho.** É a única parte que não fica white label barato; decidir no contrato.
4. **Custo de IA por pessoa.** A jornada de 7 semanas tem custo por pessoa que precisa estar no preço; medir na fase 3 antes de fechar tabela.
5. **Piloto real ainda não aconteceu.** O simulador está calibrado (`docs/recepcao-medica.md`), mas 0 clínicas o usaram; a aba de equipe estava quebrada até 09/09. Rodar uma clínica de verdade antes da fase 1 revela o que o ensaio sintético não mostra.

## 6. Verificação por fase

- Fase 1: suíte inteira verde com o guard novo; mutação (abrir o filtro de agência derruba o guard); um operador de teste entra em `/agencia`, cria clínica, importa 3 pessoas, convida, e as 3 aparecem com conta em `auth.users`.
- Fase 2: screenshot da tela de login, do dashboard e de um PDF sem nenhuma ocorrência de "Vertho" no tenant white label; e-mail de convite chegando com o remetente da agência.
- Fase 3: uma clínica piloto conclui a jornada de 7 semanas; custo por pessoa medido no ledger.
- Fase 4: relatório do mês bate com a contagem por SQL; teto bloqueia o cadastro acima do contratado.
