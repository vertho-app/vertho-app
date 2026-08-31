import { describe, it, expect } from 'vitest';
import {
  checarFormatoPrometido, checarCoberturaKit, checarDesafioPlaceholder,
  checarContatos, checarCoreAusente, checarCanalZerado, checarEntregaIncompleta,
  regrasPreflight, checarHorizonteKits, checarDestinoDoAlerta, checarMbForaDaRegua, checarCelulaVideoEmError,
  checarDegradacoes, DEGRADACAO_VOLUME_CRITICO, checarCanalEntradaWhatsapp,
  type CelulaVideoSemDeck, type EntregaPrevista, type EnvioObservado, type LacunaKitHorizonte, type DegradacaoRegistro,
  type SaudeCanalEntrada,
} from '@/lib/pipeline-health/regras';
import { severidadeGlobal, achado } from '@/lib/pipeline-health/types';

/**
 * Cada regra aqui nasceu de uma falha REAL de produção. O teste guarda a invariante
 * nos DOIS sentidos: dispara quando o problema existe E fica calado quando não existe
 * — um check que sempre acusa vira ruído e é desligado; um que nunca acusa é enfeite.
 */

const base: EntregaPrevista = {
  colaboradorId: 'c1', nome: 'Fulana', cargo: 'Gestão Escolar', disc: 'S',
  semana: 3, pilula: 1, descritor: 'Gestão de riscos',
  temKit: true, formatoAnunciado: 'texto', formatosDisponiveis: ['texto', 'audio', 'case'],
  coreId: 'mc1', desafioPlaceholder: false, telefoneValido: true, temEmail: true,
};
const com = (over: Partial<EntregaPrevista>): EntregaPrevista => ({ ...base, ...over });

describe('R1 · pílula promete formato que não existe', () => {
  it('acusa quando o formato anunciado não está entre os disponíveis', () => {
    // Caso real 27/07: 17 entregas anunciavam vídeo numa semana sem vídeo.
    const a = checarFormatoPrometido([com({ formatoAnunciado: 'video', formatosDisponiveis: ['texto', 'audio'] })]);
    expect(a?.id).toBe('formato-prometido-ausente');
    expect(a?.severidade).toBe('critico');
    expect(a?.contagem).toBe(1);
  });

  it('fica calado quando o formato prometido existe', () => {
    expect(checarFormatoPrometido([com({ formatoAnunciado: 'video', formatosDisponiveis: ['texto', 'video'] })])).toBeNull();
  });

  it('conta só as entregas quebradas, não a coorte inteira', () => {
    const a = checarFormatoPrometido([
      com({ formatoAnunciado: 'video', formatosDisponiveis: ['texto'] }),
      com({ nome: 'Beltrana', formatoAnunciado: 'texto', formatosDisponiveis: ['texto'] }),
    ]);
    expect(a?.contagem).toBe(1);
    expect(a?.amostra?.[0]).toContain('Fulana');
  });

  it('semana sem formato NENHUM também é promessa quebrada', () => {
    expect(checarFormatoPrometido([com({ formatosDisponiveis: [] })])?.contagem).toBe(1);
  });
});

describe('R2/R3 · kit ausente vs kit presente com desafio placeholder', () => {
  it('sem kit → cobertura acusa, placeholder NÃO (a causa é outra)', () => {
    const e = [com({ temKit: false, desafioPlaceholder: true })];
    expect(checarCoberturaKit(e)?.contagem).toBe(1);
    expect(checarDesafioPlaceholder(e)).toBeNull();
  });

  it('com kit e placeholder → é overlay não aplicado (F-C4), severidade crítica', () => {
    const e = [com({ temKit: true, desafioPlaceholder: true })];
    expect(checarCoberturaKit(e)).toBeNull();
    const a = checarDesafioPlaceholder(e);
    expect(a?.severidade).toBe('critico');
    expect(a?.id).toBe('desafio-placeholder-com-kit');
  });

  it('tudo certo → os dois calados', () => {
    expect(checarCoberturaKit([base])).toBeNull();
    expect(checarDesafioPlaceholder([base])).toBeNull();
  });
});

describe('R4 · contatos', () => {
  it('sem telefone válido e sem e-mail → crítico', () => {
    const as = checarContatos([com({ telefoneValido: false, temEmail: false })]);
    const critico = as.find((a) => a.id === 'sem-canal-nenhum');
    expect(critico?.severidade).toBe('critico');
  });

  it('telefone inválido mas com e-mail → aviso (recebe, mas só por um canal)', () => {
    // Caso real: DDI 597 (Suriname) em vez de 55 — 3 falhas no provedor e carimbo gravado.
    const as = checarContatos([com({ telefoneValido: false, temEmail: true })]);
    expect(as.find((a) => a.id === 'telefone-invalido')?.severidade).toBe('aviso');
    expect(as.find((a) => a.id === 'sem-canal-nenhum')).toBeUndefined();
  });

  it('conta PESSOAS, não entregas — quem tem 2 pílulas não conta em dobro', () => {
    const as = checarContatos([
      com({ pilula: 1, telefoneValido: false, temEmail: true }),
      com({ pilula: 2, telefoneValido: false, temEmail: true }),
    ]);
    expect(as.find((a) => a.id === 'telefone-invalido')?.contagem).toBe(1);
  });

  it('contatos ok → nenhum achado', () => {
    expect(checarContatos([base])).toHaveLength(0);
  });
});

describe('R5 · semana sem conteúdo resolvível', () => {
  it('sem core e sem formatos → crítico', () => {
    expect(checarCoreAusente([com({ coreId: null, formatosDisponiveis: [] })])?.severidade).toBe('critico');
  });
  it('sem core mas COM formatos → não é ausência (o overlay resolveu)', () => {
    expect(checarCoreAusente([com({ coreId: null, formatosDisponiveis: ['texto'] })])).toBeNull();
  });
});

describe('R6/R7 · pós-voo', () => {
  // `temPush`/`carimboPush` são OBRIGATÓRIOS no tipo de propósito: opcionais
  // deixariam um coletor futuro desligar a regra de push por omissão, sem erro.
  // O default aqui é "sem push", que é o estado da maioria das pessoas hoje.
  const envio = (over: Partial<EnvioObservado>): EnvioObservado => ({
    colaboradorId: 'c1', nome: 'Fulana', temTelefone: true, temEmail: true, temPush: false,
    carimboWhatsapp: '2026-07-27T11:00:00Z', carimboEmail: '2026-07-27T11:00:00Z',
    carimboPush: null, ...over,
  });

  it('canal inteiro zerado → crítico (caso real 20/07: 36 carimbos, 0 WhatsApp)', () => {
    const envios = [1, 2, 3, 4].map((i) => envio({ colaboradorId: `c${i}`, carimboWhatsapp: null }));
    expect(checarCanalZerado(envios).find((a) => a.id === 'canal-whatsapp-zerado')?.severidade).toBe('critico');
  });

  it('não acusa canal zerado com amostra pequena (1-2 pessoas não provam provedor fora)', () => {
    expect(checarCanalZerado([envio({ carimboWhatsapp: null })])).toHaveLength(0);
  });

  it('canal parcialmente entregue não é "zerado" — é falha individual', () => {
    const envios = [envio({ colaboradorId: 'a' }), envio({ colaboradorId: 'b', carimboWhatsapp: null }), envio({ colaboradorId: 'c' })];
    expect(checarCanalZerado(envios).find((a) => a.id === 'canal-whatsapp-zerado')).toBeUndefined();
  });

  it('pessoa sem carimbo em canal nenhum → crítico', () => {
    const a = checarEntregaIncompleta([envio({ carimboWhatsapp: null, carimboEmail: null })]);
    expect(a?.severidade).toBe('critico');
    expect(a?.amostra).toContain('Fulana');
  });

  it('quem não tem contato nenhum não conta como entrega falha', () => {
    expect(checarEntregaIncompleta([envio({ temTelefone: false, temEmail: false, carimboWhatsapp: null, carimboEmail: null })])).toBeNull();
  });

  // ── PUSH como canal de primeira classe no pós-voo ─────────────────────────
  it('push zerado entre quem tem inscrição → crítico', () => {
    // Pane total de push (VAPID ausente, endpoints ilegíveis) precisa gritar.
    // Sem esta regra o sintoma é ZERO entregas, indistinguível de "ninguém
    // aderiu" — a confusão que já custou duas investigações neste projeto.
    const envios = [1, 2, 3, 4].map((i) =>
      envio({ colaboradorId: `c${i}`, temPush: true, carimboPush: null }));
    expect(checarCanalZerado(envios).find((a) => a.id === 'canal-push-zerado')?.severidade).toBe('critico');
  });

  it('não acusa push zerado para quem NÃO tem inscrição', () => {
    // Canal inaplicável não pende — mesma régua de telefone/e-mail. Sem isso,
    // toda empresa sem push viraria crítico permanente: alarme crônico.
    const envios = [1, 2, 3, 4].map((i) =>
      envio({ colaboradorId: `c${i}`, temPush: false, carimboPush: null }));
    expect(checarCanalZerado(envios).find((a) => a.id === 'canal-push-zerado')).toBeUndefined();
  });

  it('só push saiu: a pessoa NÃO conta como entrega falha', () => {
    const a = checarEntregaIncompleta([
      envio({ temPush: true, carimboWhatsapp: null, carimboEmail: null, carimboPush: '2026-07-27T11:00:00Z' }),
    ]);
    expect(a).toBeNull();
  });

  it('elegível só por push e sem carimbo nenhum → entrega falha', () => {
    const a = checarEntregaIncompleta([
      envio({ temTelefone: false, temEmail: false, temPush: true, carimboWhatsapp: null, carimboEmail: null, carimboPush: null }),
    ]);
    expect(a?.contagem).toBe(1);
  });
});

describe('agregação', () => {
  it('severidade global = pior achado', () => {
    expect(severidadeGlobal([])).toBe('ok');
    expect(severidadeGlobal([achado('x', 'aviso', 't', 1, 'd')!])).toBe('aviso');
    expect(severidadeGlobal([achado('x', 'aviso', 't', 1, 'd')!, achado('y', 'critico', 't', 1, 'd')!])).toBe('critico');
  });

  it('contagem 0 nunca vira achado (não gerar ruído)', () => {
    expect(achado('x', 'critico', 't', 0, 'd')).toBeNull();
  });

  it('coorte saudável não gera achado nenhum no pré-voo', () => {
    expect(regrasPreflight([base, com({ colaboradorId: 'c2', nome: 'Beltrana' })])).toEqual([]);
  });

  it('coorte com os 3 problemas de 27/07 gera os 3 achados', () => {
    const achados = regrasPreflight([
      com({ formatoAnunciado: 'video', formatosDisponiveis: ['texto'] }),
      com({ colaboradorId: 'c2', nome: 'B', temKit: false }),
      com({ colaboradorId: 'c3', nome: 'C', telefoneValido: false, temEmail: true }),
    ]);
    const ids = achados.map((a) => a.id).sort();
    expect(ids).toContain('formato-prometido-ausente');
    expect(ids).toContain('entrega-sem-kit');
    expect(ids).toContain('telefone-invalido');
  });
});

/**
 * R15 · HORIZONTE (era R7 até 31/08/2026 — o 7 é do pós-voo). Nasceu do caso medido em 27/07 no Ibipeba: a trilha troca de BLOCO
 * DE COMPETÊNCIAS na semana 5, os 3 pares (competência × cargo) que entram ali eram
 * 100% novos, nenhum tinha kit, e o piloto já estava na semana 3. O pré-voo teria
 * acusado 25h antes — tempo de reenviar um e-mail, não de produzir 41 kits.
 */
describe('R15 · horizonte de kits', () => {
  const lac = (over: Partial<LacunaKitHorizonte> = {}): LacunaKitHorizonte => ({
    competencia: 'Apoio técnico e monitoramento das unidades',
    descritor: 'Registro e devolutiva',
    cargo: 'Gestão Educacional',
    faltantes: ['D', 'I', 'S', 'C'],
    pessoas: 11,
    semana: 5,
    diasAte: 13,
    ...over,
  });

  it('semana dentro do prazo de produção é CRÍTICO, e conta DISC (não temas)', () => {
    const [a] = checarHorizonteKits([lac()]);
    expect(a.id).toBe('kit-horizonte-urgente');
    expect(a.severidade).toBe('critico');
    expect(a.contagem).toBe(4);            // 4 DISC faltando, não 1 tema
    expect(a.amostra?.[0]).toContain('sem5');
    expect(a.amostra?.[0]).toContain('Gestão Educacional');
  });

  it('semana distante é AVISO, não crítico (senão o alarme vira ruído)', () => {
    const achados = checarHorizonteKits([lac({ diasAte: 30, semana: 8 })]);
    expect(achados).toHaveLength(1);
    expect(achados[0].id).toBe('kit-horizonte-proximo');
    expect(achados[0].severidade).toBe('aviso');
  });

  it('separa urgente de futuro no mesmo run', () => {
    const achados = checarHorizonteKits([lac({ diasAte: 5 }), lac({ diasAte: 40, semana: 10, faltantes: ['D'] })]);
    expect(achados.map((a) => a.id)).toEqual(['kit-horizonte-urgente', 'kit-horizonte-proximo']);
    expect(achados[0].contagem).toBe(4);
    expect(achados[1].contagem).toBe(1);
  });

  it('tema já coberto não gera achado — o alarme tem que poder ficar calado', () => {
    expect(checarHorizonteKits([lac({ faltantes: [] })])).toEqual([]);
    expect(checarHorizonteKits([])).toEqual([]);
  });

  it('a amostra mostra o que vence PRIMEIRO (ela é cortada em 8)', () => {
    const muitos = Array.from({ length: 12 }, (_, i) =>
      lac({ diasAte: 12 - i, descritor: `D${i}`, faltantes: ['D'] }));
    const [a] = checarHorizonteKits(muitos);
    expect(a.contagem).toBe(12);
    expect(a.amostra).toHaveLength(8);
    expect(a.amostra?.[0]).toContain('(1d)');   // o mais urgente primeiro
  });

  it('o corte de severidade é por TEMPO, e o limiar é configurável', () => {
    // Mesmo tema, mesmo volume: só a distância decide.
    expect(checarHorizonteKits([lac({ diasAte: 14 })])[0].id).toBe('kit-horizonte-urgente');
    expect(checarHorizonteKits([lac({ diasAte: 15 })])[0].id).toBe('kit-horizonte-proximo');
    expect(checarHorizonteKits([lac({ diasAte: 20 })], 21)[0].id).toBe('kit-horizonte-urgente');
  });
});

/**
 * R8 · o alarme tem destinatário? Medido em 27/07: `ADMIN_EMAILS` não existia em
 * ambiente nenhum enquanto os 4 modos eram construídos — todo o alerta caía num
 * console.error. O achado entra no run estrutural, que é PERSISTIDO: mesmo sem
 * conseguir mandar e-mail, o problema fica visível na série e na tela.
 */
describe('R8 · destino do alerta', () => {
  it('acusa quando ADMIN_EMAILS está vazia, ausente ou só com lixo', () => {
    for (const v of [undefined, '', '   ', ',', ' , ,']) {
      const a = checarDestinoDoAlerta(v);
      expect(a?.id, `deveria acusar para ${JSON.stringify(v)}`).toBe('alerta-sem-destino');
      expect(a?.severidade).toBe('critico');
    }
  });

  it('fica calado quando há destinatário (inclusive com espaços)', () => {
    expect(checarDestinoDoAlerta('a@b.com')).toBeNull();
    expect(checarDestinoDoAlerta(' a@b.com , c@d.com ')).toBeNull();
  });
});

/**
 * R9 · MB publicado com descritor fora da régua. Medido em 28/07 (Ibipeba): 18 MBs de
 * "Autocuidado × Gestão Escolar" guardavam o TÍTULO editorial ("A Calma que se Constrói")
 * no campo que o resolver usa para casar — 6 descritores colapsaram em 2 módulos e 14 de
 * 18 conteúdos core nasceram ancorados no assunto vizinho, sem erro nenhum.
 */
describe('R9 · MB com descritor fora da régua', () => {
  const mb = (descritor: string) => ({
    id: 'mb1', competencia: 'Autocuidado e resiliência emocional',
    cargo: 'Gestão Escolar', descritor,
  });

  it('acusa como CRÍTICO e mostra cargo/competência/descritor na amostra', () => {
    const a = checarMbForaDaRegua([mb('A Calma que se Constrói'), mb('Ler os Próprios Sinais')]);
    expect(a?.id).toBe('mb-descritor-fora-da-regua');
    expect(a?.severidade).toBe('critico');
    expect(a?.contagem).toBe(2);
    expect(a?.amostra?.[0]).toContain('Gestão Escolar');
    expect(a?.amostra?.[0]).toContain('A Calma que se Constrói');
  });

  it('a ação lembra de recalcular o embedding — corrigir só o texto não basta', () => {
    // O vetor antigo tem precedência sobre tokens; sem recalcular, o bug continua.
    expect(checarMbForaDaRegua([mb('X')])?.acao).toMatch(/embedding/i);
  });

  it('acervo alinhado não gera achado', () => {
    expect(checarMbForaDaRegua([])).toBeNull();
  });
});

/**
 * R10 · telemetria de degradação (FMEA §3.3 — fallback pode existir, nunca invisível).
 * A tabela `degradacao_log` (mig 194) guarda o rastro; esta regra é quem reclama.
 * Dois sentidos, como sempre: dispara com degradação, calada sem.
 */
describe('R10 · degradações das últimas 24h', () => {
  const reg = (over: Partial<DegradacaoRegistro>): DegradacaoRegistro => ({
    fluxo: 'build', tipo: 'duo-para-single', severidade: 'aviso', ocorrencias: 1, ...over,
  });

  it('calada sem nenhuma degradação', () => {
    expect(checarDegradacoes([])).toBeNull();
  });

  it('dispara como AVISO com degradação comum e agrupa por tipo na amostra', () => {
    const a = checarDegradacoes([
      reg({ tipo: 'kit-ausente-disc', ocorrencias: 7 }),
      reg({ tipo: 'kit-ausente-disc', ocorrencias: 3 }), // mesma chave de tipo, outra linha → soma
      reg({ tipo: 'duo-para-single', ocorrencias: 2 }),
    ]);
    expect(a?.id).toBe('degradacao-fallback-24h');
    expect(a?.severidade).toBe('aviso');
    expect(a?.contagem).toBe(12);
    expect(a?.amostra?.[0]).toBe('kit-ausente-disc · 10×'); // mais frequente primeiro
  });

  it('sobe para CRÍTICO quando algum tipo foi registrado com severidade crítica', () => {
    const a = checarDegradacoes([reg({ tipo: 'missao-placeholder', severidade: 'critico' })]);
    expect(a?.severidade).toBe('critico');
  });

  it('sobe para CRÍTICO quando o volume total passa do limiar, mesmo tudo aviso', () => {
    const a = checarDegradacoes([reg({ ocorrencias: DEGRADACAO_VOLUME_CRITICO + 1 })]);
    expect(a?.severidade).toBe('critico');
    expect(checarDegradacoes([reg({ ocorrencias: DEGRADACAO_VOLUME_CRITICO })])?.severidade).toBe('aviso');
  });
});

/**
 * R16 · célula de vídeo que falhou e segue sem deck (F-V3). Era R10 até 31/08/2026. Medido 28/07: num lote de 41,
 * 6 falharam por saturação de fornecedor (TTS/HeyGen) e a entrega as ignora em silêncio,
 * porque o resolver filtra `status<>'error'` e o `video-stale` só pega presos.
 *
 * O critério é "erro E nenhum deck": no mesmo dia, 35 células já tinham falhado alguma vez
 * e 33 estavam resolvidas por tentativa posterior. Contar `error` cru viraria ruído
 * permanente — e alarme ruidoso é alarme desligado.
 */
describe('R16 · célula de vídeo em error sem deck', () => {
  const cel = (over: Partial<CelulaVideoSemDeck> = {}): CelulaVideoSemDeck => ({
    empresaSlug: 'ibipeba', cargo: 'Gestão Educacional', disc: 'S',
    erros: 1, ultimoErro: 'TTS: resposta sem áudio após 4 tentativas', ...over,
  });

  it('acusa e mostra tenant/cargo/DISC e a causa na amostra', () => {
    const a = checarCelulaVideoEmError([cel(), cel({ disc: 'C', ultimoErro: 'HeyGen timeout aguardando video_id' })]);
    expect(a?.id).toBe('celula-video-em-error');
    expect(a?.severidade).toBe('aviso');
    expect(a?.contagem).toBe(2);
    expect(a?.amostra?.[0]).toContain('ibipeba');
    expect(a?.amostra?.[0]).toContain('TTS');
  });

  it('a ação lembra de re-disparar com concorrência menor (senão satura de novo)', () => {
    expect(checarCelulaVideoEmError([cel()])?.acao).toMatch(/concorr/i);
  });

  it('lista vazia não gera achado — célula recuperada não deve aparecer', () => {
    expect(checarCelulaVideoEmError([])).toBeNull();
  });
});

/**
 * R12 · O canal de ENTRADA do WhatsApp.
 *
 * As outras regras deste arquivo olham SAÍDA. Esta existe porque o inbound falha
 * de forma absolutamente silenciosa: a Meta desativa a inscrição do webhook e,
 * como o número da Cloud API não tem aplicativo, a mensagem não fica pendente em
 * lugar nenhum — some. Medido em 14/08/2026: `subscribed_apps` estava vazio e as
 * respostas dos colaboradores desapareciam sem rastro.
 *
 * 🔴 A invariante que estes testes guardam é a do DESENHO: a regra decide sobre o
 * que a Meta RESPONDEU, nunca sobre volume de mensagens. "Zero recebidas em 24h"
 * é o estado normal deste canal (1 mensagem no total até 15/08), então uma regra
 * por contagem ficaria muda para sempre — inclusive na queda.
 */
describe('R12 · canal de entrada do WhatsApp', () => {
  const saude = (over: Partial<SaudeCanalEntrada> = {}): SaudeCanalEntrada => ({
    configurada: true,
    inscrito: true,
    appsInscritos: ['Vertho'],
    numeroOk: true,
    qualidade: 'GREEN',
    nomeVerificado: 'Vertho.ai',
    motivo: null,
    ...over,
  });

  it('canal saudável não gera achado nenhum', () => {
    expect(checarCanalEntradaWhatsapp(saude())).toEqual([]);
  });

  it('🔴 inscrição caída é CRÍTICA e diz que a mensagem some, não que "atrasa"', () => {
    const [a] = checarCanalEntradaWhatsapp(saude({ inscrito: false, appsInscritos: [] }));
    expect(a.id).toBe('whatsapp-webhook-sem-inscricao');
    expect(a.severidade).toBe('critico');
    expect(a.detalhe).toMatch(/some sem rastro/i);
    expect(a.acao).toMatch(/subscribed_apps/);
  });

  it('🔴 não saber vira ACHADO próprio — ignorância não é "ok"', () => {
    const achados = checarCanalEntradaWhatsapp(saude({ inscrito: null, motivo: 'WABA_ID ausente' }));
    const cego = achados.find((a) => a.id === 'whatsapp-webhook-check-cego');
    expect(cego?.severidade).toBe('aviso');
    expect(cego?.detalhe).toContain('WABA_ID ausente');
  });

  it('Cloud API desligada NÃO alarma — é decisão, e o canal legado assume', () => {
    expect(checarCanalEntradaWhatsapp(saude({ configurada: false, inscrito: null, numeroOk: null }))).toEqual([]);
  });

  it('🔴 metade cega também é cegueira: token presente e número não verificável', () => {
    // Ambiente com credencial e sem PHONE_NUMBER_ID responde a inscrição e não o
    // número. Tratar isso como 'ok' seria a mesma falha que a regra combate.
    const achados = checarCanalEntradaWhatsapp(saude({ numeroOk: null, qualidade: null, motivo: 'PHONE_NUMBER_ID ausente' }));
    const cego = achados.find((a) => a.id === 'whatsapp-webhook-check-cego');
    expect(cego?.severidade).toBe('aviso');
    expect(cego?.detalhe).toContain('PHONE_NUMBER_ID ausente');
  });

  it('número inacessível é crítico e lembra que derruba o OTP junto', () => {
    const a = checarCanalEntradaWhatsapp(saude({ numeroOk: false })).find((x) => x.id === 'whatsapp-numero-inacessivel');
    expect(a?.severidade).toBe('critico');
    expect(a?.detalhe).toMatch(/OTP/);
  });

  it('qualidade YELLOW avisa (janela para agir) e RED é crítico', () => {
    const amarelo = checarCanalEntradaWhatsapp(saude({ qualidade: 'YELLOW' }));
    expect(amarelo[0].id).toBe('whatsapp-qualidade-yellow');
    expect(amarelo[0].severidade).toBe('aviso');
    expect(amarelo[0].detalhe).toMatch(/PRÉVIO/i);

    const vermelho = checarCanalEntradaWhatsapp(saude({ qualidade: 'RED' }));
    expect(vermelho[0].severidade).toBe('critico');
    expect(vermelho[0].detalhe).toMatch(/todos os tenants/i);
  });

  it('GREEN e UNKNOWN não viram alarme — só os dois estados que pedem ação', () => {
    expect(checarCanalEntradaWhatsapp(saude({ qualidade: 'GREEN' }))).toEqual([]);
    expect(checarCanalEntradaWhatsapp(saude({ qualidade: 'UNKNOWN' }))).toEqual([]);
  });

  it('problemas simultâneos viram achados SEPARADOS — cada um tem ação diferente', () => {
    const achados = checarCanalEntradaWhatsapp(saude({ inscrito: false, numeroOk: false, qualidade: 'RED' }));
    expect(achados.map((a) => a.id).sort()).toEqual([
      'whatsapp-numero-inacessivel', 'whatsapp-qualidade-red', 'whatsapp-webhook-sem-inscricao',
    ]);
  });
});
