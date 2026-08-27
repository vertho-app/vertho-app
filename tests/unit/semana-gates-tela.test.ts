import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { turnosIaNecessarios } from '@/lib/season-engine/week-gating';
import ptBR from '@/messages/pt-BR.json';

/**
 * A tela da semana travava a pessoa em três gates ENCADEADOS, e os dois
 * primeiros eram defeito, não desenho:
 *
 *   abrir conteúdo → "Marcar como realizado" → "Iniciar Evidências" → 6 turnos
 *        ↑                     ↑
 *   useState(false)     era pré-requisito
 *   (perdia no F5)      da conversa
 *
 * Medido em 25/08/2026, nas 61 pessoas travadas de Ibipeba e Macaé:
 *   · 24 tinham evento de ABERTURA na semana em que estavam paradas e mesmo
 *     assim o botão "Marcar como realizado" estava cinza (estado de React que
 *     não sobrevive a recarregar a página);
 *   · 7 podiam clicar em Evidências e não clicaram;
 *   · 13 começaram a conversa e pararam — 6 delas no turno 1, sem nenhum
 *     indicador de quantos faltavam; 2 estavam a UM turno de destravar.
 *
 * Estas asserções são estáticas (mesmo padrão de `ppp-rede-guard`): montar a
 * página inteira exigiria Supabase, next-intl e rotas de chat, e o que precisa
 * ser travado aqui é o CONTRATO entre a tela e as réguas — não a renderização.
 * Validado por mutação: desfazer qualquer um dos quatro pontos deixa vermelho.
 */

const TELA = readFileSync(
  join(process.cwd(), 'app/dashboard/temporada/semana/[week]/page.tsx'),
  'utf-8',
);

describe('item 1 — abriuConteudo sobrevive à sessão', () => {
  it('a tela hidrata o estado do histórico, não só do clique de agora', () => {
    expect(TELA).toContain('jaAbriuConteudoDaSemana(semanaNum)');
  });

  it('a consulta não recebe escopo do CLIENTE — colaborador e tenant vêm da sessão', () => {
    // A 1ª versão passava `trilhaId` e a action lia `trilhas` com service-role
    // para conferir o dono. Sem parâmetro de escopo não há o que forjar, e o
    // guard de service-role deixou de contar mais uma chamada.
    expect(TELA).not.toContain('jaAbriuConteudoDaSemana(trilhaId');
  });

  it('a hidratação só LIGA — um `false` da rede não apaga o clique desta sessão', () => {
    // `if (r?.abriu) setAbriuConteudo(true)` e nunca `setAbriuConteudo(r.abriu)`:
    // a segunda forma reintroduz o botão cinza quando a leitura falha.
    expect(TELA).toContain('if (vivo && r?.abriu) setAbriuConteudo(true)');
    expect(TELA).not.toContain('setAbriuConteudo(r.abriu)');
    expect(TELA).not.toContain('setAbriuConteudo(!!r');
  });
});

describe('item 2 — o degrau manual deixou de ser catraca', () => {
  it('Evidências e Tira-Dúvidas passam pelo MESMO predicado', () => {
    expect(TELA).toContain('const podeConversar = conteudoConsumido || abriuConteudo || nadaParaAbrir;');
    // Os dois gates antigos, que exigiam a marcação manual, não voltam.
    expect(TELA).not.toContain('disabled={(!conteudoConsumido && !isAplicacao && !isAvaliacao)');
    expect(TELA).not.toContain('disabled={!conteudoConsumido}');
  });

  it('🔴 TODO formato com fonte conta como abertura, não só texto/case', () => {
    // O bug que sobrou da 1ª rodada: só o ramo texto/case (um `<a>` que sai da
    // página) chamava `onAbrirConteudo`. Quem preferia ÁUDIO clicava, ouvia o
    // conteúdo inteiro e os botões seguiam cinza; no vídeo a abertura dependia
    // de o player emitir `play` por postMessage.
    const chipInline = 'onClick={() => { if (tem) { setFormatoAtivo(f); onAbrirConteudo?.(); logFormato(f); } }}';
    expect(TELA).toContain(chipInline);
    // A forma antiga (sem a abertura) não volta.
    expect(TELA).not.toContain('onClick={() => { if (tem) { setFormatoAtivo(f); logFormato(f); } }}');
  });

  it('abrir o conteúdo MARCA — o botão manual deixou de ser um passo', () => {
    expect(TELA).toContain('if (!conteudoConsumido) handleConsumido();');
  });

  it('o botão manual saiu — ele já não destravava nada (27/08)', () => {
    // ⚠️ ESTA ASSERÇÃO ERA O CONTRÁRIO ATÉ 27/08, e o motivo de ter virado
    // está registrado aqui para não parecer que alguém afrouxou um guard.
    //
    // A versão anterior exigia `{!conteudoConsumido && nadaParaAbrir && (`,
    // com a justificativa "removê-lo tornaria a pílula sem fonte abrível
    // inalcançável: a semana ficaria sem caminho". Essa premissa deixou de
    // valer no MESMO commit que a escreveu (`b76eb17b`), por três razões que
    // se somam e que estão no código, não em opinião:
    //
    //   1. `podeConversar` passou a incluir `nadaParaAbrir` (asserção acima),
    //      então a conversa já está liberada sem clique nenhum;
    //   2. `startChat` grava `marcarConteudoConsumido` ao entrar na conversa,
    //      então a métrica é alimentada sem o botão;
    //   3. `handleConsumido` fazia exatamente isso e nada mais.
    //
    // E ele não segurava o gate sequencial: quem libera a semana N+1 é
    // `anterior.status === CONCLUIDO`, gravado pela CONVERSA — o campo
    // `conteudo_consumido` não participa dessa decisão.
    //
    // O que sobrava era um botão verde pedindo "marcar como realizado" a três
    // linhas de um resumo que já dizia "Conteúdo · feito", numa semana em que
    // não havia o que marcar. O resumo agora diz "sem conteúdo esta semana"
    // (ver `tests/unit/semana-passo-conteudo.test.ts`).
    expect(TELA).not.toContain('{!conteudoConsumido && nadaParaAbrir && (');
    expect(TELA).not.toContain("t('content.markDone')");
    // E a abertura automática continua marcando — remover o botão não pode
    // remover o registro de quem ABRE um formato.
    expect(TELA).toContain('onAutoConsumido');
  });

  it('🔴 a instrução e os botões falam do MESMO estado', () => {
    // Achado no screenshot da captura do tutorial: a instrução olhava
    // `conteudoConsumido` (que só atualiza no reload) enquanto os botões já
    // olhavam `podeConversar`. Depois do clique, a tela dizia "Conteúdo · feito"
    // na barra E "abra um dos formatos" logo abaixo, com os botões ativos.
    expect(TELA).toContain('{!podeConversar && (');
    expect(TELA).not.toContain('{!conteudoConsumido && !nadaParaAbrir && (');
  });

  it('a instrução não promete um botão que saiu do caminho', () => {
    // `openBeforeComplete` dizia "abra antes de MARCAR COMO REALIZADO".
    expect(TELA).toContain("t('content.openToUnlock')");
    expect(TELA).not.toContain("t('content.openBeforeComplete')");
  });

  it('a métrica continua sendo alimentada — entrar na conversa grava o consumo', () => {
    // Sem isto, tirar o gate faria `conteudo_consumido` parar de ser preenchido
    // e o painel de engajamento passaria a subnotificar em silêncio.
    expect(TELA).toContain('marcarConteudoConsumido(data.trilha.id, semanaNum)');
  });

  it('o pré-requisito da ROTA do tira-dúvidas continua satisfeito antes de abrir', () => {
    // A rota responde 403 sem consumo. Liberar o botão sem gravar trocaria um
    // botão cinza por um erro mudo.
    //
    // `setTdOpen(true)` aparece duas vezes (a outra reabre a caixa ao carregar
    // um transcript existente, que não precisa marcar nada). A que interessa é
    // a do onClick do botão — a ÚLTIMA, dentro do JSX.
    const iBotao = TELA.lastIndexOf('setTdOpen(true);');
    const vizinhanca = TELA.slice(Math.max(iBotao - 500, 0), iBotao);
    expect(vizinhanca).toContain('marcarConteudoConsumido(data.trilha.id, semanaNum)');
  });
});

describe('itens 3 e 4 — a régua passou a ser dita', () => {
  it('usa a régua REAL de turnos, não um número escrito na tela', () => {
    expect(TELA).toContain('turnosIaNecessarios(semanaNum, semana?.tipo, progressoSemana?.feedback?.modo)');
    // Um literal aqui seria a 2ª cópia da régua — a origem da divergência que
    // este trabalho inteiro existe para não repetir.
    expect(TELA).not.toMatch(/turnosNecessarios\s*=\s*\d+/);
  });

  it('conta turno de IA (assistant), que é o que as rotas contam', () => {
    expect(TELA).toContain("chatHistory.filter((m) => m?.role === 'assistant').length");
  });

  it('a barra NÃO some ao concluir — ela vira o estado de conclusão', () => {
    // 🔴 CORRIGIDO EM 25/08 (dono, olhando a tela). A 1ª versão fazia a barra
    // sumir com `{!chatFinished && ...}`, no argumento de que aviso resolvido
    // vira ruído. Errado neste caso: o que sobrava era um texto verde de 11px
    // no rodapé do card, então o indicador que a pessoa vinha acompanhando
    // desaparecia exatamente quando ela venceu. Some o que COBRA; o que CELEBRA
    // fica. A régua correta é: aviso de PENDÊNCIA some ao ser resolvido, marco
    // de CONCLUSÃO aparece.
    expect(TELA).toContain('{!isAvaliacao && (');
    expect(TELA).toContain('chatFinished ? (');
    expect(TELA).toContain("t('progress.weekDone', { week: semanaNum })");
    expect(TELA).not.toContain('{!chatFinished && !isAvaliacao && (');
  });

  it('a regra de conclusão tem peso visual, não é legenda', () => {
    // Era um `<p>` de 11px em amber/80 — do tamanho de uma nota de rodapé, para
    // a frase que desfaz a crença que trava essas pessoas. Agora tem faixa
    // própria, borda, ícone e 13px.
    expect(TELA).toContain('border-amber-400/30 bg-amber-400/10');
    expect(TELA).not.toContain('<p className="mt-2 text-[11px] text-amber-300/80">{t(\'progress.closesHere\')}</p>');
  });

  it('🔴 a conclusão tem TRÊS estados — atrasado não recebe data no passado', () => {
    // "A semana seguinte libera seg 01/09" é uma data JÁ PASSADA para quem
    // concluiu uma semana atrasada — e atrasado é a maioria de quem vê esta
    // faixa (as 61 travadas de 25/08 concluem semanas cujo sucessor liberou há
    // tempo). Mandava esperar por algo que já aconteceu.
    expect(TELA).toContain('semanaLiberadaPorData(data.trilha.data_inicio, proxima)');
    expect(TELA).toContain("t('progress.nextAlreadyOpen', { week: proxima })");
    expect(TELA).toContain("t('progress.seasonDone')");
    expect(TELA).toContain("t('progress.nextOpens'");
  });

  it('quando a próxima já está aberta, a tela LEVA — não só avisa', () => {
    // Mesma decisão do botão do WhatsApp: quem está atrasado precisa de um
    // caminho, não de um aviso.
    expect(TELA).toContain("router.push(`/dashboard/temporada/semana/${proxima}`)");
    expect(TELA).toContain("t('progress.goToNext', { week: proxima })");
  });

  it('a decisão usa a régua do gate, não uma comparação de datas própria', () => {
    // Uma `new Date() > ...` aqui seria a 2ª régua temporal do produto.
    const bloco = TELA.slice(TELA.indexOf('const proxima = semanaNum + 1;'), TELA.indexOf("t('progress.goToNext'"));
    expect(bloco).not.toMatch(/new Date\(\)\s*[<>]/);
  });

  it('o "✓ Conteúdo realizado" saiu do rodapé do card', () => {
    // Duplicava o "Conteúdo · feito" da barra, dando a um passo CUMPRIDO o
    // mesmo peso do que ainda falta.
    expect(TELA).not.toContain("<Check size={14} /> {t('content.done')}");
  });

  it('o contador só aparece depois do 1º turno', () => {
    expect(TELA).toContain('{turnosFeitos > 0 && turnosFaltando > 0 && (');
  });
});

describe('as chaves de i18n que a tela passou a usar existem', () => {
  const sw = (ptBR as any).SeasonWeek;

  it('o bloco de progresso está completo em pt-BR', () => {
    for (const k of ['title', 'stepContent', 'stepEvidence', 'stepDone', 'contentDone',
      'contentPending', 'evidenceProgress', 'evidenceNotStarted', 'closesHere',
      'weekDone', 'nextOpens', 'nextAlreadyOpen', 'goToNext', 'seasonDone']) {
      expect(sw.progress?.[k], `SeasonWeek.progress.${k}`).toBeTruthy();
    }
    expect(sw.evidence?.remaining).toBeTruthy();
    expect(sw.evidence?.remainingOne).toBeTruthy();
  });

  it('a copy nomeia a conversa de evidências — o vocabulário do botão, não "Mentora"', () => {
    // Mesma decisão da copy do WhatsApp (23/08): "Mentora" não é palavra do
    // produto e apontaria para o Beto, que não conclui semana nenhuma.
    expect(sw.progress.closesHere).toContain('evidências');
    expect(sw.progress.closesHere.toLowerCase()).not.toContain('mentora');
  });
});

describe('a régua de turnos, que a tela agora exibe', () => {
  it('semana de conteúdo fecha em 6 turnos de IA', () => {
    expect(turnosIaNecessarios(1, 'conteudo')).toBe(6);
  });

  it('semana de aplicação pede mais — exibir 6 nela seria promessa falsa', () => {
    expect(turnosIaNecessarios(4, 'aplicacao')).toBe(10);
    expect(turnosIaNecessarios(4, 'aplicacao', 'pratica')).toBe(10);
  });
});

/**
 * A LISTA de semanas (`/dashboard/temporada`) é onde a pessoa ESCOLHE para onde
 * ir — e era onde a semana começada e não terminada se distinguia das outras
 * apenas por uma borda colorida. Cor sozinha lê-se como "você está aqui", não
 * como "falta terminar".
 */
describe('lista de semanas — a incompleta passou a se anunciar', () => {
  const LISTA = readFileSync(
    join(process.cwd(), 'app/dashboard/temporada/page.tsx'),
    'utf-8',
  );

  it('usa a MESMA régua da tela da semana e das rotas', () => {
    expect(LISTA).toContain('turnosIaNecessarios(s.semana, s.tipo, p?.feedback?.modo)');
    expect(LISTA).toContain('contarTurnosIa(p, s.semana, s.tipo)');
    // Um número escrito aqui seria a 3ª cópia da régua.
    expect(LISTA).not.toMatch(/faltam\s*=\s*\d+/);
  });

  it('diz quantas faltam, e distingue "não começou" de "parou no meio"', () => {
    expect(LISTA).toContain("t('week.notStarted')");
    expect(LISTA).toContain("t('week.incompleteOne')");
    expect(LISTA).toContain("t('week.incomplete', { count: faltam })");
  });

  it('só na semana EM ANDAMENTO — concluída e bloqueada não ganham o aviso', () => {
    expect(LISTA).toContain('{emAndamento && faltam > 0 && (');
  });

  it('as chaves existem em pt-BR', () => {
    const season = (ptBR as any).Season;
    for (const k of ['incomplete', 'incompleteOne', 'notStarted']) {
      expect(season.week?.[k], `Season.week.${k}`).toBeTruthy();
    }
  });
});
