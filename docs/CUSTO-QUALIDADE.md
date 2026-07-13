# Custo & Qualidade de IA — plano de 7 sprints + log de decisões

> Documento vivo. Registra o plano, **as decisões tomadas e o porquê** de cada
> uma. Regra do dono (12/07/2026): reduzir custo **sem perder qualidade** —
> sempre a decisão melhor, não a mais fácil.

## Dois princípios

1. **Medir → eliminar desperdício → só então rotear modelo.**
2. **Nunca regenerar/re-renderizar o que já existe para a mesma identidade.**

## Modelo de custo

`Custo(N) = FIXO_empresa + $3,07 × N`. Hoje: fixo custom $198 · variável $3,07/usuário
(chat = 61%: socrático $0,87 + tira-dúvidas $0,67 + missão $0,46). Metas sempre
a **preço GA** (Sonnet 4.6 $3/$15) e nos dois eixos.

---

## Decisão-mãe: honrar os gates ao "rodar todas as sprints"

Ao receber "rode todas as sprints", a decisão **melhor (não fácil)** foi NÃO
empurrar tudo pra produção de uma vez. Motivo: o plano tem gates de qualidade
que existem exatamente para o "sem perder qualidade":

- **S2 (medição) é tempo-dependente** — precisa de ~7 dias de tráfego real. Não
  se fabrica numa sessão. O que se faz: instalar o ledger (feito, S1) e deixar
  acumular; as projeções só se fixam com dado medido.
- **S5 (compactação, cascata) muda o que o modelo vê** → risco pedagógico. Só
  vai a prod **atrás do eval harness (S4)** aprovando. Construído OFF, por flag.
- **S6 (biblioteca canônica) é iniciativa de CONTEÚDO** + aprovação humana por
  competência. O *código* (media-hash, FK, resolver) é construído; a autoria das
  24 competências é trabalho de conteúdo, não de código.

Logo: **constrói-se toda a maquinaria; liga-se em prod o que é seguro (saída
byte-idêntica: caching, idempotência, ledger, retries); gateiam-se por
flag/harness os que mudam comportamento.** Isso é "rodar todas as sprints" com
disciplina.

---

## Log de decisões por sprint

### S1 · Fundação — fazer o número ficar verdadeiro

**S1.1 (commit 042396eb prévio + f1d1c6aa) — ENTREGUE em prod.**
- **Ledger central `ia_usage_log`** (mig 177): usage REAL gravado DENTRO do
  wrapper `callAI`/`callAIChat`, todos os provedores + streaming Claude.
  - *Decisão:* log no wrapper, não nos call-sites. *Porquê:* cobertura por
    construção — um call-site esquecido não vaza do baseline. Falha de log em
    try/catch (telemetria nunca derruba a chamada de produto).
- **`PINNED_TASKS`** (`lib/ai-tasks.ts`): auditorias críticas imunes ao
  `modelo_padrao` genérico do tenant.
  - *Decisão:* pin em `modulo_base_auditor`/`acumulada_check`/`sem14_check`.
    *Porquê:* o `resolveTaskModel` deixava o genérico do tenant rebaixar
    silenciosamente a 2ª IA — bug de segurança de qualidade. Override explícito
    por task ainda vence (reversibilidade da Onda 0). Validado por mutação.
- **Preços corrigidos:** GPT-5.4 $10/$30 → **$2,50/$15** (doc oficial); Luna
  adicionado; defaultModel dos checks alinhado ao runtime real.
  - *Porquê:* o simulador superestimava os checks ~6× → decisão sobre número
    errado. Consequência honesta: a Onda 0 (Luna) rendeu ~$10/100, não ~$33.
