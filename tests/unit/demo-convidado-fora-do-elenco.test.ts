import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guard: convidado de degustação não entra em contagem de ELENCO.
 *
 * 🔴 O DEFEITO QUE ELE CODIFICA, medido em 09/09/2026
 *
 * O reset do ACME abortava no meio e o tenant ficava com **3 relatórios de 35**
 * — a central do RH abria as abas Cargos e Prioridades em "Leitura analítica
 * ainda não disponível", porque o consolidado é um dos que não nasciam.
 *
 * A cadeia: desde 03/09 o convidado de degustação ATRAVESSA o reset (vencer
 * revoga o acesso, não apaga o que a pessoa fez — decisão certa). Ele fica em
 * `colaboradores`, e duas asserções de elenco passaram a contá-lo: a da central
 * do RH e a dos relatórios organizacionais. Com quatro prospects na base, 34 ≠
 * 30 e as duas LANÇAM — depois de `resetTenant` já ter apagado as tabelas.
 *
 * A asserção em si é boa (protege contra elenco incompleto, que é erro de seed
 * real). O que estava errado era o denominador.
 *
 * A verificação é ESTÁTICA porque o alvo é o call-site: uma contagem de elenco
 * que não filtra convidados. Testar o efeito exigiria um tenant com prospect
 * ativo, que é justamente o estado que ninguém reproduz de propósito.
 */
describe('guard: convidado de degustação fora da contagem de elenco', () => {
  const arquivos = [
    'lib/demo/reset-acme-demo.ts',
    'lib/demo/acme-organization-reports.ts',
  ];

  it('varre os arquivos que fazem contagem de elenco (denominador visível)', () => {
    for (const arquivo of arquivos) {
      const src = readFileSync(arquivo, 'utf8');
      expect(src.length, `${arquivo} vazio ou inacessível`).toBeGreaterThan(100);
      // Alvo morto reporta verde: se a asserção sumir do arquivo, este guard
      // deixa de provar qualquer coisa e é melhor saber.
      expect(src, `${arquivo} não tem mais asserção de ACME_DEMO_TEAM_SIZE`)
        .toContain('ACME_DEMO_TEAM_SIZE');
    }
  });

  it('🔴 toda contagem comparada com ACME_DEMO_TEAM_SIZE exclui `convidado.`', () => {
    const violacoes: string[] = [];

    for (const arquivo of arquivos) {
      const linhas = readFileSync(arquivo, 'utf8').split('\n');
      linhas.forEach((linha, i) => {
        // A comparação com o tamanho do elenco é o momento em que o denominador
        // importa. Comentário não conta.
        const ehComparacao = linha.includes('!== ACME_DEMO_TEAM_SIZE')
          || linha.includes('=== ACME_DEMO_TEAM_SIZE');
        if (!ehComparacao || linha.trim().startsWith('//') || linha.trim().startsWith('*')) return;

        // A lista comparada precisa ter sido filtrada por `convidado.` em algum
        // ponto acima — a montagem fica logo antes da asserção.
        const acima = linhas.slice(Math.max(0, i - 25), i).join('\n');
        if (!acima.includes("startsWith('convidado.')") && !acima.includes('ehConvidadoDeDegustacao')) {
          violacoes.push(`${arquivo}:${i + 1} — compara com ACME_DEMO_TEAM_SIZE sem excluir convidados`);
        }
      });
    }

    expect(
      violacoes,
      'Contagem de elenco incluindo convidado de degustação — o reset aborta no meio '
      + 'e deixa o tenant pela metade:\n' + violacoes.join('\n'),
    ).toEqual([]);
  });

  it('o CLI de reset NÃO adia por passaporte ativo (o cron não adia desde 03/09)', () => {
    // Gêmeo divergente: a decisão de não adiar entrou no cron e não no CLI, que
    // seguiu imprimindo "ADIADO" e saindo com `exit 0` — quem roda
    // `npm run reset:demo` lia SUCESSO com o reset não tendo acontecido.
    const cli = readFileSync('scripts/seed-acme-demo.ts', 'utf8');
    expect(cli, 'o CLI voltou a adiar o reset por convidado ativo').not.toContain('RESET ACME DEMO ADIADO');
    expect(cli, 'o CLI precisa chamar o reset, não desviar dele').toContain('await resetAcmeDemo()');
  });
});
