import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A COBRANÇA DE QUINTA NÃO ALCANÇA QUEM JÁ CONCLUIU — e o CALENDÁRIO continua
 * andando para essa pessoa.
 *
 * 🔴 O DEFEITO (medido em Ibipeba). `primeiraSemanaAcessivel` desce até a
 * primeira semana que a pessoa consegue ABRIR, e uma semana concluída continua
 * aberta. Então quem está em dia recebia, toda quinta, a cobrança da semana que
 * acabara de fechar: *"o desafio da semana 7 ainda não foi registrado"* para
 * quem registrou. Saiu assim para **33 pessoas em 27/08**, e de novo em 03/09
 * para as **8** que haviam concluído as sete semanas.
 *
 * É a mensagem que mais corrói confiança: a pessoa sabe que fez, e o sistema
 * afirma que não.
 *
 * 🔑 AS DUAS METADES SÃO IGUALMENTE IMPORTANTES, e é por isso que este arquivo
 * existe em vez de um comentário. O avanço de `semana_atual` mora no FIM do
 * mesmo `if` da cobrança. A correção óbvia — um `continue` no topo do bloco —
 * calaria a cobrança E congelaria o calendário de quem está em dia: a pessoa
 * mais adiantada seria a única a nunca chegar ao fim do programa. O calendário
 * anda sozinho; só o ENVIO espera.
 *
 * ⚠️ Teste ESTÁTICO: ele prova que os gates estão escritos, não que a mensagem
 * deixou de sair. A prova de comportamento é o `cobrancasPuladas` no resumo do
 * cron — se ele cair a zero numa quinta com gente em dia, a régua regrediu.
 */

const FONTE = readFileSync(
  join(__dirname, '..', '..', 'lib', 'fase4', 'trigger-diario-empresa.ts'),
  'utf8',
);

describe('quinta não cobra quem já concluiu a semana acessível', () => {
  it('os TRÊS canais respeitam o skip — nenhum fica para trás', () => {
    // WhatsApp, e-mail e push. Em 13/08 a Z-API caiu e 30 de 36 ficaram sem
    // nada porque a quinta era um canal só; desde então são três, e uma regra
    // nova que esqueça um deles reintroduz a divergência por outro caminho.
    expect(FONTE).toContain('const vagaEv = !concluiuSemanaAcessivel && telefone');
    expect(FONTE).toContain('if (!concluiuSemanaAcessivel && email && !ehDemo');
    expect(FONTE).toContain('if (!concluiuSemanaAcessivel && pushLigado');
  });

  it('a régua compara a semana ACESSÍVEL com o status CONCLUÍDO', () => {
    expect(FONTE).toMatch(/concluiuSemanaAcessivel\s*=\s*progressoConfiavel/);
    expect(FONTE).toMatch(/Number\(p\?\.semana\)\s*===\s*Number\(semana\)/);
    expect(FONTE).toMatch(/p\?\.status\s*===\s*PROGRESSO\.CONCLUIDO/);
  });

  it('🔴 o AVANÇO do calendário NÃO depende do skip', () => {
    // A linha do avanço não pode estar sob a condição do skip. Se estiver, quem
    // está em dia para de avançar e nunca alcança o fim do programa.
    const idxAvanco = FONTE.indexOf('semana_atual: semanaCalendario + 1');
    expect(idxAvanco).toBeGreaterThan(0);
    const trechoDoAvanco = FONTE.slice(Math.max(0, idxAvanco - 700), idxAvanco);
    expect(trechoDoAvanco).not.toContain('concluiuSemanaAcessivel');
  });

  it('fail-safe: leitura de progresso que falha volta a cobrar, não cala tudo', () => {
    // `progressoConfiavel` como PRIMEIRO operando é o que garante isso — sem
    // ele, um mapa vazio por erro de query seria lido como "ninguém concluiu"
    // ... ou, pior, dependendo da forma, como "todo mundo concluiu" e a quinta
    // inteira ficaria muda. Silêncio por falha de leitura é o pior desfecho.
    expect(FONTE).toMatch(/concluiuSemanaAcessivel\s*=\s*progressoConfiavel\s*&&/);
  });

  it('o skip é CONTADO e sai no resumo — silêncio novo tem que ser observável', () => {
    expect(FONTE).toContain('if (concluiuSemanaAcessivel) cobrancasPuladas++;');
    expect(FONTE).toMatch(/cobrancasPuladas:\s*number/);
    // Nos três pontos de retorno, senão o número some conforme o caminho.
    const retornos = FONTE.match(/return \{ pilulas, emails, evidencias, nudges, erros, adiadosPorTeto, cobrancasPuladas \}/g) || [];
    expect(retornos.length).toBe(3);
  });
});
