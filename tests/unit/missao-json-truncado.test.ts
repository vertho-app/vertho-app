import { describe, it, expect } from 'vitest';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';

/**
 * INVARIANTE: a missão NUNCA chega à tela como JSON.
 *
 * `app/dashboard/temporada/semana/[week]/page.tsx` renderiza `semana.missao.texto`
 * com `<ReactMarkdown>`. Se o texto for o payload cru do modelo, a pessoa vê um
 * bloco de código no lugar da missão da semana.
 *
 * Era o estado de produção em 29/07: `parseMissaoResponse` faz `JSON.parse` do
 * payload inteiro e devolve null quando a geração cortou no meio (maxTokens);
 * `normalizeMissao` é fail-safe e repassa o texto cru. O CENÁRIO já tinha
 * `salvageCenarioStructured` para exatamente isso — a missão não tinha. Medido:
 * 34 das 37 trilhas do ibipeba (piloto REAL) na semana 4; 37/37 nas semanas 8 e 12.
 *
 * O fixture abaixo é o payload REAL do banco (bruna.demo, semana 4), truncado no
 * mesmo ponto — inclusive com o último par de descritores cortado no meio.
 */

const TRUNCADO = `\`\`\`json
{
  "missao_texto": "Identifique um cliente em negociação parada há mais de uma semana e conduza uma conversa onde você apresenta uma razão concreta para decidir agora, responde ao principal ponto de resistência dele e propõe um próximo passo que leve ao fechamento.",
  "acao_principal": "Conduzir uma conversa de reativação com um cliente em negociação estagnada",
  "contexto_de_aplicacao": "Qualquer negociação ativa no funil que esteja sem resposta há mais de sete dias",
  "criterio_de_execucao": "A conversa aconteceu e a negociação saiu do estado de espera",
  "integracao_descritores": [
    {
      "descritor": "Criação de senso de urgência",
      "como_aparece": "O representante apresenta uma razão real e específica para decidir agora"
    },
    {
      "descritor": "Tratamento de objeções",
      "como_aparece": "O representante identifica o principal ponto de resistência e responde de forma direta"
    }
  ],
  "por_que_cabe_na_semana": "Todo representante comercial ativo tem`;

const plano = (missao: any) => [{ semana: 4, tipo: 'aplicacao', missao }];

describe('missão vinda de JSON truncado', () => {
  it('vira markdown legível em vez de ir crua para a tela', () => {
    const [sem] = normalizeTemporadaPlano(plano({ texto: TRUNCADO }));

    expect(sem.missao.texto).not.toContain('```');
    expect(sem.missao.texto).not.toContain('"missao_texto"');
    expect(sem.missao.texto).toContain('**Sua missão:**');
    expect(sem.missao.texto).toContain('Identifique um cliente em negociação parada');
  });

  it('recupera os pares de descritores que sobreviveram ao corte', () => {
    const [sem] = normalizeTemporadaPlano(plano({ texto: TRUNCADO }));

    expect(sem.missao.texto).toContain('**Criação de senso de urgência**');
    expect(sem.missao.texto).toContain('**Tratamento de objeções**');
    expect(sem.missao.integracao_descritores).toHaveLength(2);
  });

  it('não deixa cabeçalho órfão quando o corte veio antes dos descritores', () => {
    const semPares = TRUNCADO.split('"integracao_descritores"')[0];
    const [sem] = normalizeTemporadaPlano(plano({ texto: semPares }));

    expect(sem.missao.texto).toContain('**Sua missão:**');
    expect(sem.missao.texto).not.toContain('Descritores a integrar');
  });

  it('não mexe no que já está correto (JSON completo segue pelo parse estrito)', () => {
    const completo = JSON.stringify({
      missao_texto: 'Faça a coisa certa esta semana.',
      acao_principal: 'Conduzir a conversa',
      contexto_de_aplicacao: 'Na rotina da escola',
      criterio_de_execucao: 'A conversa aconteceu e ficou registrada',
      integracao_descritores: [{ descritor: 'Escuta ativa', como_aparece: 'Ouvir antes de responder' }],
      por_que_cabe_na_semana: 'Cabe porque a rotina já oferece a situação',
    });
    const [sem] = normalizeTemporadaPlano(plano({ texto: completo }));

    expect(sem.missao.texto).toContain('**Sua missão:** Faça a coisa certa esta semana.');
    expect(sem.missao.texto).toContain('- **Escuta ativa**: Ouvir antes de responder');
  });

  it('missão já em markdown passa intacta — normalizar não pode reescrever o certo', () => {
    const md = '**Sua missão:** Já estava certo aqui.';
    const [sem] = normalizeTemporadaPlano(plano({ texto: md }));

    expect(sem.missao.texto).toBe(md);
  });
});
