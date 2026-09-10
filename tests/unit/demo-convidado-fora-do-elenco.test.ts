import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guard: contagem de ELENCO se faz por PERTENCIMENTO.
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
 * ⚠️ ESTE GUARD MUDOU DE RÉGUA EM 10/09/2026, e o motivo é ele mesmo.
 *
 * A primeira versão exigia que a contagem EXCLUÍSSE `convidado.`. Isso descreve
 * a correção de 09/09, não a invariante — e, quando as duas asserções passaram
 * a contar por pertencimento (`ehDoElencoAcme`), este guard acusou violação numa
 * mudança que fechava o buraco de vez. Guard que codifica a forma da solução
 * trava a solução melhor.
 *
 * A invariante é: **a lista comparada com `ACME_DEMO_TEAM_SIZE` só pode conter
 * quem está declarado no elenco.** "Todo mundo menos as exceções" é uma lista
 * aberta que cresce a cada ator novo (convidado, conta de verificação do E2E,
 * integração, suporte) e sempre depois do incidente; "quem pertence ao conjunto
 * declarado" é fechada. Por isso o guard agora exige `ehDoElencoAcme` e RECUSA
 * a volta ao filtro por prefixo.
 *
 * A verificação é ESTÁTICA porque o alvo é o call-site. Testar o efeito exigiria
 * um tenant com prospect ativo, que é justamente o estado que ninguém reproduz
 * de propósito. O comportamento da régua tem prova própria em
 * `tests/unit/demo-elenco-pertencimento.test.ts`.
 */
describe('guard: contagem de elenco por pertencimento', () => {
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

  it('🔴 toda contagem comparada com ACME_DEMO_TEAM_SIZE é recortada por `ehDoElencoAcme`', () => {
    const violacoes: string[] = [];

    for (const arquivo of arquivos) {
      const linhas = readFileSync(arquivo, 'utf8').split('\n');
      linhas.forEach((linha, i) => {
        // A comparação com o tamanho do elenco é o momento em que o denominador
        // importa. Comentário não conta.
        const ehComparacao = linha.includes('!== ACME_DEMO_TEAM_SIZE')
          || linha.includes('=== ACME_DEMO_TEAM_SIZE');
        if (!ehComparacao || linha.trim().startsWith('//') || linha.trim().startsWith('*')) return;

        // A lista comparada precisa ter passado por `ehDoElencoAcme` em algum
        // ponto acima — a montagem fica logo antes da asserção.
        //
        // 🔴 COMENTÁRIO NÃO CONTA COMO CHAMADA. A primeira versão desta janela
        // fazia `slice(...).join('\n')` sobre as linhas cruas, e o comentário
        // que EXPLICA a régua cita o nome da função: removi o filtro real do
        // `acme-organization-reports.ts` para testar o guard e ele continuou
        // VERDE, satisfeito pela própria explicação. É a mesma classe do guard
        // de uso que aceitava a citação num catálogo.
        const acima = linhas
          .slice(Math.max(0, i - 25), i)
          .filter((l) => {
            const t = l.trim();
            return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
          })
          .join('\n');
        if (!acima.includes('ehDoElencoAcme')) {
          violacoes.push(`${arquivo}:${i + 1} — compara com ACME_DEMO_TEAM_SIZE sem recortar pelo elenco declarado`);
        }
      });
    }

    expect(
      violacoes,
      'Contagem de elenco somando quem não é elenco — o reset aborta depois do wipe '
      + 'e deixa o ambiente sem os relatórios:\n' + violacoes.join('\n'),
    ).toEqual([]);
  });

  it('🔴 e NÃO volta a excluir por prefixo — lista de exceção só cresce', () => {
    // A régua antiga (`startsWith('convidado.')`) resolvia o caso de 09/09 e
    // deixava a classe de pé: o ator seguinte não tem esse prefixo. Se ela
    // reaparecer numa contagem de elenco, é regressão de desenho, não estilo.
    for (const arquivo of arquivos) {
      const src = readFileSync(arquivo, 'utf8');
      const linhasDeCodigo = src.split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
      expect(
        linhasDeCodigo.join('\n'),
        `${arquivo} voltou a recortar elenco por prefixo de e-mail; use ehDoElencoAcme`,
      ).not.toContain("startsWith('convidado.')");
    }
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
