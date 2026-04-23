# Checklist de Validação — Vertho Mentor IA

> Baseado no PASSO-A-PASSO-VERTHO.md
> Para cada passo, verifique os itens antes de seguir para o próximo.
> ✅ = ok | ⚠️ = parcial | ❌ = bloqueado

---

## Fase 0 — Setup da Empresa e Colaboradores

### Passo 1 — Criar empresa
- [ ] Empresa aparece em `/admin/dashboard`
- [ ] Nome, slug e segmento estão preenchidos
- [ ] Logo foi uploaded (se aplicável)
- [ ] Subdomínio `{slug}.vertho.com.br` resolve corretamente

### Passo 2 — Cadastrar colaboradores
- [ ] Colaboradores aparecem na lista em `/admin/empresas/{id}`
- [ ] Cada colab tem: nome, email, cargo, área/depto, role
- [ ] Import de planilha processou sem erro (se usado)
- [ ] Roles estão corretos (colaborador/gestor/rh)
- [ ] Gestor tem `gestor_email` preenchido para vincular equipe

### Passo 3 — Cadastrar cargos e competências
- [ ] CSV importou sem erro em `/admin/competencias`
- [ ] Cada competência tem descritores com régua n1-n4
- [ ] Verificar amostra: abrir 1 competência e confirmar que os 4 níveis estão preenchidos
- [ ] Quantidade de competências por cargo faz sentido (mínimo 5)

### Passo 3.5 — Base de Conhecimento (RAG)
- [ ] Tela `/admin/vertho/knowledge-base` abre sem erro
- [ ] Dropdown de empresas funciona (fundo escuro, texto legível)
- [ ] "Popular base inicial" cria 6 docs seed
- [ ] Upload de PDF/DOCX funciona (até 4MB)
- [ ] Preview de busca retorna resultados relevantes

### Passo 4 — Preferências de aprendizagem
- [ ] Colab consegue acessar `/dashboard/perfil`
- [ ] Ranking de formatos salva corretamente

---

## Fase 1 — Diagnóstico (Fit v2)

### Passo 5 — IA1 — Top 10
- [ ] Botão "IA1 — Top 10" roda sem erro
- [ ] Top 10 aparece por cargo em `/admin/cargos`
- [ ] Competências fazem sentido para o cargo (revisão humana)
- [ ] Dados salvos em `top10_cargos`

### Passo 6 — Validar Top 5
- [ ] Admin revisou e editou o Top 5 de cada cargo
- [ ] Top 5 está salvo (verificar em `/admin/cargos`)
- [ ] Nenhum cargo ficou sem Top 5

### Passo 7 — IA2 — Gabarito
- [ ] Botão "IA2 — Gabarito" rodou sem erro
- [ ] Cada competência do Top 5 tem descrição enriquecida
- [ ] Verificar amostra: abrir 1 gabarito e revisar qualidade

### Passo 8 — IA3 — Cenários + Check
- [ ] Cenários gerados (5 por cargo × competência)
- [ ] Check dual-IA rodou (nota ≥ 80 na maioria)
- [ ] Cenários com nota < 70 foram regenerados ou revisados
- [ ] Cada cenário tem 4 perguntas (p1-p4) no campo `alternativas`

### Passo 9 — Fit v2 + Envios
- [ ] Fit v2 calculou para todos os colabs
- [ ] Links de WhatsApp/email foram disparados
- [ ] Colaborador consegue acessar link recebido

### Passo 10 — Colaborador responde
- [ ] Colab consegue fazer login via link
- [ ] Tela de assessment carrega cenários
- [ ] Chat funciona (enviar resposta, receber feedback)
- [ ] Mapeamento DISC funciona em `/dashboard/perfil-comportamental/mapeamento`
- [ ] Perfil DISC aparece após conclusão

---

## Fase 2 — Avaliação e Trilhas

### Passo 11 — IA4 avalia
- [ ] Botão "IA4 — Avaliar" rodou sem erro
- [ ] Cada resposta tem `nivel_ia4` entre 1 e 4
- [ ] Check dual-IA rodou (nota ≥ 80 na maioria)
- [ ] Verificar amostra: nota faz sentido vs resposta do colab

### Passo 12 — Competências Foco
- [ ] Cada colab tem `competencia_foco` definida
- [ ] A escolha faz sentido (menor fit × maior gap)
- [ ] Trilhas foram criadas em `trilhas`

### Passo 13 — Assessment de descritores
- [ ] Grid colab × descritor acessível em `/admin/assessment-descritores`
- [ ] Admin/RH preencheu notas (ou deixou vazio para default 1.5)
- [ ] Notas fazem sentido como baseline (1-4, granularidade 0.1)

### Passo 14 — PDI individual (opcional)
- [ ] PDI gera sem erro
- [ ] PDF abre corretamente
- [ ] Conteúdo do PDI faz sentido (acolhimento, perfil, competências, plano 30 dias)
- [ ] Plano de 30 dias tem ações concretas por semana

---

## Fase 3 — Motor de Temporadas

### Passo 15 — Micro-conteúdos
- [ ] Banco tem conteúdos suficientes para as competências foco
- [ ] Mix de formatos (vídeo, texto, áudio, case) presente
- [ ] Tags de competência/descritor/nível estão preenchidas
- [ ] Vídeos Bunny importados e com thumbnail

### Passo 16 — Gerar temporadas
- [ ] Botão "Gerar Temporadas" rodou sem erro para todos os colabs
- [ ] Cada colab tem plano de 14 semanas em `trilhas.temporada_plano`
- [ ] Verificar amostra: semanas de conteúdo têm `desafio_texto` preenchido
- [ ] Verificar amostra: semanas de prática (4/8/12) têm missão + cenário
- [ ] `data_inicio` definida para cada trilha

### Passo 17 — Revisar temporadas
- [ ] Tela `/admin/temporadas` lista todas as trilhas
- [ ] Modal de detalhe mostra semanas corretamente
- [ ] Simulador (botão SIM) funciona sem erro

---

## Fase 4 — Jornada do Colaborador

### Passo 18 — Acesso à temporada
- [ ] Colab vê timeline com 14 cards em `/dashboard/temporada`
- [ ] Semana 1 está liberada (se dentro do gate calendário)
- [ ] Semanas futuras estão bloqueadas
- [ ] Gate calendário funciona (semana N libera no dia correto)

### Passo 19 — Semanas de Conteúdo (sem 1-3, 5-7, 9-11)
- [ ] Conteúdo carrega (vídeo embed / áudio player / markdown renderizado)
- [ ] "Marcar como realizado" funciona
- [ ] Desafio da semana aparece com campos estruturados (ação observável, critério)
- [ ] Tira-Dúvidas responde dentro do escopo do descritor
- [ ] Tira-Dúvidas bloqueia se conteúdo não consumido
- [ ] Evidências (chat socrático) inicia corretamente
- [ ] Chat socrático: 6 turnos, fechamento com Desafio/Insight/Compromisso
- [ ] Input por voz funciona (botão microfone)
- [ ] Ao concluir, próxima semana libera

### Passo 20 — Semanas de Prática (sem 4, 8, 12)
- [ ] Missão prática aparece com texto estruturado
- [ ] Colab consegue aceitar missão e declarar compromisso
- [ ] Ao retornar: opção "Sim, executei" abre chat de relato (missão feedback)
- [ ] Chat de feedback: 10 turnos, fechamento com 3 bullets
- [ ] Opção "Não consegui" cai para cenário escrito (analytic)
- [ ] Analytic: 10 turnos, fechamento com 3 bullets
- [ ] Dados extraídos aparecem no admin (avaliação por descritor)

### Passo 21 — Semana 13
- [ ] Conversa qualitativa inicia com mensagem de abertura
- [ ] 12 turnos com progressão (abertura → retrospectiva → evidências → microcaso → integração → fechamento)
- [ ] Microcaso é apresentado no turno 6
- [ ] Fechamento não faz pergunta, dá síntese
- [ ] Extração qualitativa gera JSON com `evolucao_percebida` por descritor
- [ ] Avaliação acumulada dispara automaticamente ao concluir

### Passo 22 — Avaliação Acumulada
- [ ] Rodou automaticamente (verificar em `/admin/vertho/avaliacao-acumulada`)
- [ ] 1ª IA gerou notas por descritor
- [ ] 2ª IA auditou (status: aprovado / com_ajustes / revisar)
- [ ] Se "revisar": regerar com feedback e verificar melhora

### Passo 23 — Semana 14
- [ ] Cenário B carrega (do `banco_cenarios`)
- [ ] 4 perguntas aparecem em sequência (wizard)
- [ ] Scorer triangula e gera 4 notas por descritor
- [ ] Check por 2ª IA rodou
- [ ] `resumo_avaliacao` é objeto (com `mensagem_geral`, `principal_avanco`)
- [ ] Evolution Report gera automaticamente

### Passo 24 — Temporada Concluída
- [ ] Tela `/dashboard/temporada/concluida` carrega
- [ ] 5 blocos presentes (hero, comparativo, insights, missões, avaliação)
- [ ] PDF individual gera via botão de download
- [ ] Delta por descritor faz sentido
- [ ] Classificações coerentes (evoluiu/manteve/regrediu)

---

## Fase 5 — Consolidação

### Passo 25 — Dashboard Gestor
- [ ] Gestor vê lista de liderados em `/dashboard/gestor/equipe-evolucao`
- [ ] Delta e status por descritor aparecem
- [ ] Modal de detalhe funciona
- [ ] Gestor não vê colabs de outra área/empresa

### Passo 26 — Plenária PDF
- [ ] PDF consolida dados do time
- [ ] Conteúdo faz sentido (avanços, gaps, padrões)

### Passo 27 — Evolution Report empresa
- [ ] KPIs agregados aparecem em `/admin/evolucao`
- [ ] Expansão por competência funciona
- [ ] Lista de colabs com resumo

### Passo 28 — Painéis Admin Vertho
- [ ] `/admin/vertho/evidencias` — transcripts carregam
- [ ] `/admin/vertho/avaliacao-acumulada` — notas e auditoria visíveis
- [ ] `/admin/vertho/auditoria-sem14` — 4 notas + regerar funciona
- [ ] `/admin/vertho/simulador-custo` — calculadora responde
- [ ] `/admin/vertho/knowledge-base` — CRUD funciona

### Passo 29 — Próxima temporada
- [ ] Temporadas concluídas podem ser arquivadas
- [ ] Nova competência foco pode ser definida
- [ ] Novo ciclo pode ser iniciado sem conflito

---

## Verificações Transversais

### Auth e Segurança
- [ ] Login funciona (email + senha)
- [ ] Redirect para `/login` quando não autenticado
- [ ] Colaborador não acessa dados de outra empresa
- [ ] Gestor só vê liderados da própria área
- [ ] Admin actions exigem platform admin
- [ ] Nenhuma action de dashboard aceita `email` do client

### Visual e UX
- [ ] Cores da marca estão corretas (navy `#0F2B54`, cyan `#34C5CC`)
- [ ] Avatar do usuário aparece na sidebar/header
- [ ] Tokens de fase mudam cor ao navegar (F1-F5)
- [ ] Thumbnails de conteúdo mostram glifos tipográficos
- [ ] Dropdowns têm fundo escuro (legíveis)
- [ ] Favicon aparece (V cyan sobre navy)

### Infraestrutura
- [ ] Variáveis de ambiente configuradas (ver `docs/GO-LIVE-CHECKLIST.md`)
- [ ] Migrations aplicadas (022-051)
- [ ] Storage buckets criados (avatars, relatorios-pdf, conteudos, backups)
- [ ] SMTP configurado no Supabase
- [ ] Cron job ativo (`/api/cron`)

### Dados e Persistência
- [ ] Relatórios salvam em `relatorios` com upsert correto (incluindo NULL)
- [ ] `capacitacao` existe e aceita inserts
- [ ] `knowledge_base` tem docs indexados
- [ ] `temporada_semana_progresso` persiste reflexao/feedback/tira_duvidas

---

> Referência: `PASSO-A-PASSO-VERTHO.md` para detalhes de cada passo.
> Infraestrutura: `docs/GO-LIVE-CHECKLIST.md` para env vars e troubleshooting.
> Schema: `docs/SCHEMA-PROCESS.md` para processo de alteração de banco.
