// Núcleos puros da caixa de entrada: de quem é o telefone, o que a lista mostra
// e os dois mecanismos que impedem a tela de trocar as bolas.
//
// Por que estas regras estão testadas aqui e não por um E2E: as três já
// falharam (ou falhariam) em silêncio. Nenhuma delas produz erro na tela — a
// atribuição errada de tenant, a lista truncada e o rascunho vazado aparecem
// como comportamento normal. Teste é o único lugar onde elas fazem barulho.
import { describe, expect, it } from 'vitest';
import { decidirDono, filtroDeTelefone, variantesDoTelefone, semDono } from '@/lib/whatsapp/resolver-dono';
import { montarConversas, montarCaixaGlobal, resumoDaCaixa, rotuloDoTipo, type LinhaConversa } from '@/lib/inbox/caixa';
import {
  chaveDaConversa, lerRascunho, gravarRascunho, criarControleDePedidos,
} from '@/lib/inbox/rascunhos';
import { classificarMidia, MIMES_ACEITOS, TETOS_POR_TIPO, mensagemDeFalhaDeEnvio } from '@/lib/inbox/anexos';

describe('de quem é o telefone — a decisão sobre TODAS as linhas', () => {
  it('uma pessoa, uma empresa: resolve limpo', () => {
    const d = decidirDono([{ id: 'c1', empresa_id: 'e1' }]);
    expect(d).toEqual({ empresaId: 'e1', colaboradorId: 'c1', ambiguidade: null });
    expect(semDono(d)).toBe(false);
  });

  it('nenhuma linha: telefone desconhecido, sem dono', () => {
    const d = decidirDono([]);
    expect(d.ambiguidade).toBe('telefone-desconhecido');
    expect(semDono(d)).toBe(true);
  });

  it('🔴 o caso que o `.limit(5)` escondia: 7 linhas em 6 empresas NÃO resolve', () => {
    // Medido no cadastro em 15/08/2026. Com o limite antigo, a conclusão era
    // tirada de cinco linhas quaisquer — sem ORDER BY, portanto sem garantia de
    // que a sexta empresa aparecesse. Cinco da mesma empresa ⇒ mensagem
    // carimbada com o tenant ERRADO.
    const linhas = [
      { id: 'c1', empresa_id: 'e1' }, { id: 'c2', empresa_id: 'e1' },
      { id: 'c3', empresa_id: 'e1' }, { id: 'c4', empresa_id: 'e1' },
      { id: 'c5', empresa_id: 'e1' }, { id: 'c6', empresa_id: 'e2' },
      { id: 'c7', empresa_id: 'e3' },
    ];
    const d = decidirDono(linhas);
    expect(d.empresaId).toBeNull();
    expect(d.ambiguidade).toBe('telefone-em-multiplas-empresas');

    // E a prova de que o limite era o bug: decidir sobre a AMOSTRA daria e1.
    const sobreAmostra = decidirDono(linhas.slice(0, 5));
    expect(sobreAmostra.empresaId).toBe('e1');
  });

  it('duas pessoas na MESMA empresa: tenant resolvido, pessoa não', () => {
    // O tenant é inequívoco — a conversa pode aparecer na caixa daquele cliente.
    // Escolher entre as duas pessoas seria sortear, e o sorteio vira histórico.
    const d = decidirDono([{ id: 'c1', empresa_id: 'e1' }, { id: 'c2', empresa_id: 'e1' }]);
    expect(d.empresaId).toBe('e1');
    expect(d.colaboradorId).toBeNull();
    expect(d.ambiguidade).toBe('telefone-em-multiplas-pessoas');
  });

  it('variantes cobrem com e sem "+", e o filtro cobre as duas colunas', () => {
    expect(variantesDoTelefone('5511999998888')).toContain('5511999998888');
    expect(variantesDoTelefone('+55 (11) 99999-8888')).toContain('+5511999998888');

    const f = filtroDeTelefone('5511999998888');
    expect(f).toContain('whatsapp.eq.5511999998888');
    expect(f).toContain('telefone.eq.5511999998888');
    expect(f).toContain('whatsapp.eq.+5511999998888');
  });

  /**
   * 🔴 O caso que a caixa não reconhecia — medido em 17/08/2026.
   *
   * A pílula saiu às 11:00:28 para `5574999225966` (o cadastro), a professora
   * respondeu às 11:00:40 de `557499225966` (o `wa_id`, sem o nono dígito), e o
   * app gravou `telefone-desconhecido`: não reconheceu o próprio destinatário
   * doze segundos depois de entregar. Valia para as 50 pessoas de Ibipeba com
   * DDD ≥ 31, ou seja, para a turma inteira.
   */
  it('🔴 o wa_id SEM o nono dígito casa com o cadastro que TEM', () => {
    const v = variantesDoTelefone('557499225966');
    expect(v).toContain('5574999225966');
    expect(v).toContain('557499225966');

    const f = filtroDeTelefone('557499225966');
    expect(f).toContain('telefone.eq.5574999225966');
    expect(f).toContain('whatsapp.eq.5574999225966');
  });

  it('e o espelho: cadastro na forma antiga casa com o wa_id que tem o nono', () => {
    // 4 telefones do cadastro estão gravados com 12 dígitos. Nos DDDs ≤ 30 o
    // wa_id vem com 13 — sem as duas direções, esse par também nunca casaria.
    expect(variantesDoTelefone('5511999998888')).toContain('551199998888');
  });

  it('nono dígito NÃO é inventado para fixo — 3021-4455 continua um fixo', () => {
    // Fixo brasileiro começa em 2–5. Criar "9 3021-4455" produziria um celular
    // que não existe, e casamento de identidade com quem não é a pessoa.
    expect(variantesDoTelefone('551130214455')).toEqual(['551130214455', '+551130214455']);
  });

  it('número estrangeiro não ganha variante (Portugal não perde dígito)', () => {
    expect(variantesDoTelefone('351926360862')).toEqual(['351926360862', '+351926360862']);
  });

  it('🔴 telefone sem dígitos devolve filtro VAZIO — um `.or("")` traria a tabela toda', () => {
    expect(variantesDoTelefone('')).toEqual([]);
    expect(filtroDeTelefone('abc')).toBe('');
  });
});

const AGORA = Date.UTC(2026, 7, 15, 12, 0, 0); // meio-dia UTC: longe das duas bordas da janela
const H = 3600_000;

function linha(over: Partial<LinhaConversa> = {}): LinhaConversa {
  const em = new Date(AGORA - H).toISOString();
  return {
    empresa_id: 'e1',
    from_phone: '5511999998888',
    ultima_em: em,
    // Desde a mig 220 a view separa as duas datas: `ultima_em` é dos dois lados,
    // `ultima_recebida_em` é o que abre a janela de 24h.
    ultima_recebida_em: em,
    total: 3,
    enviadas: 0,
    nao_lidas: 1,
    ultimo_texto: 'oi',
    ultimo_tipo: 'text',
    ultimo_lado: 'pessoa',
    colaborador_id: 'c1',
    ambiguidade: null,
    ...over,
  };
}

describe('a lista da caixa — o que a view entrega vira o que a tela mostra', () => {
  it('resolve o nome e calcula a janela a partir da ÚLTIMA recebida', () => {
    const [c] = montarConversas([linha()], new Map([['c1', 'Ana']]), AGORA);
    expect(c.nome).toBe('Ana');
    expect(c.naoLidas).toBe(1);
    expect(c.janela.estado).toBe('aberta');
    expect(c.janela.podeTextoLivre).toBe(true);
  });

  it('conversa parada há mais de 24h vem com a janela fechada', () => {
    const velha = new Date(AGORA - 25 * H).toISOString();
    const [c] = montarConversas([linha({ ultima_em: velha, ultima_recebida_em: velha })], new Map(), AGORA);
    expect(c.janela.estado).toBe('fechada');
    expect(c.janela.podeTextoLivre).toBe(false);
  });

  /**
   * 🔴 A conversa que só existe porque NÓS mandamos (mig 220).
   *
   * A pílula de hoje saiu para 36 pessoas; nenhuma delas tem `ultima_recebida_em`.
   * Se a janela fosse calculada sobre `ultima_em` — que aqui é a data do NOSSO
   * envio —, a tela ofereceria o campo de resposta livre para quem nunca
   * escreveu: a Meta recusa com 131047 e, para quem clicou, a mensagem
   * simplesmente não chegou.
   */
  it('🔴 conversa sem resposta: a janela é NUNCA-ESCREVEU, não "aberta há 1h"', () => {
    const [c] = montarConversas([linha({
      ultima_em: new Date(AGORA - H).toISOString(),
      ultima_recebida_em: null,
      total: 0, enviadas: 3, nao_lidas: 0, ultimo_lado: 'equipe',
      ultimo_texto: 'conteudo_semana',
    })], new Map(), AGORA);

    expect(c.janela.estado).toBe('nunca-escreveu');
    expect(c.janela.podeTextoLivre).toBe(false);
    expect(c.recebidas).toBe(0);
    expect(c.enviadas).toBe(3);
    expect(c.ultimoLado).toBe('equipe');
  });

  it('ordena por recência, não pela ordem que o banco devolveu', () => {
    const conversas = montarConversas([
      linha({ from_phone: '551100000001', ultima_em: new Date(AGORA - 5 * H).toISOString() }),
      linha({ from_phone: '551100000002', ultima_em: new Date(AGORA - 1 * H).toISOString() }),
    ], new Map(), AGORA);
    expect(conversas.map((c) => c.telefone)).toEqual(['551100000002', '551100000001']);
  });

  it('sem colaborador não inventa nome, e mídia sem texto ganha rótulo do TIPO', () => {
    const [c] = montarConversas([linha({ colaborador_id: null, ultimo_texto: null, ultimo_tipo: 'audio' })], new Map(), AGORA);
    expect(c.nome).toBeNull();
    expect(rotuloDoTipo(c.ultimoTipo)).toBe('(áudio)');
    expect(rotuloDoTipo('document')).toBe('(documento)');
    expect(rotuloDoTipo(null)).toBe('(sem texto)');
  });

  it('🔴 a caixa global inclui quem NÃO tem empresa — é o caso que precisa de gente', () => {
    const conversas = montarCaixaGlobal(
      [
        linha({ from_phone: '551100000001' }),
        linha({ empresa_id: null, colaborador_id: null, from_phone: '551100000009', ambiguidade: 'telefone-em-multiplas-empresas' }),
      ],
      new Map([['c1', 'Ana']]),
      new Map([['e1', 'Escola Alfa']]),
      AGORA,
    );
    expect(conversas).toHaveLength(2);
    const semCliente = conversas.find((c) => !c.empresaId);
    expect(semCliente?.empresa).toBeNull();
    expect(semCliente?.ambiguidade).toBe('telefone-em-multiplas-empresas');
    expect(conversas.find((c) => c.empresaId)?.empresa).toBe('Escola Alfa');
  });

  it('resumo separa CONVERSAS não lidas de MENSAGENS não lidas', () => {
    // 12 mensagens de uma pessoa só não é o mesmo trabalho que 12 pessoas
    // esperando — um painel que funde os dois passa a mentir sem avisar.
    const r = resumoDaCaixa(montarCaixaGlobal([
      linha({ from_phone: '551100000001', nao_lidas: 12 }),
      linha({
        from_phone: '551100000002', nao_lidas: 0,
        ultima_em: new Date(AGORA - 30 * H).toISOString(),
        ultima_recebida_em: new Date(AGORA - 30 * H).toISOString(),
      }),
      linha({ from_phone: '551100000009', nao_lidas: 1, empresa_id: null }),
    ], new Map(), new Map(), AGORA));

    expect(r.conversas).toBe(3);
    expect(r.conversasNaoLidas).toBe(2);
    expect(r.naoLidas).toBe(13);
    expect(r.janelasAbertas).toBe(2);
    expect(r.naoIdentificadas).toBe(1);
  });
});

describe('rascunho e corrida — os dois jeitos de a tela mandar a coisa errada', () => {
  const A = { empresaId: 'e1', telefone: '5511999990001' };
  const B = { empresaId: 'e1', telefone: '5511999990002' };

  it('🔴 escrever para A e abrir B NÃO leva o texto de A para B', () => {
    let r = gravarRascunho({}, A, 'combinado para segunda');
    expect(lerRascunho(r, B)).toBe('');
    r = gravarRascunho(r, B, 'outro assunto');
    expect(lerRascunho(r, A)).toBe('combinado para segunda');
    expect(lerRascunho(r, B)).toBe('outro assunto');
  });

  it('🔴 o mesmo telefone em DOIS clientes são conversas diferentes', () => {
    const mesmoFoneOutraEmpresa = { empresaId: 'e2', telefone: A.telefone };
    expect(chaveDaConversa(A)).not.toBe(chaveDaConversa(mesmoFoneOutraEmpresa));
    const r = gravarRascunho({}, A, 'texto do cliente 1');
    expect(lerRascunho(r, mesmoFoneOutraEmpresa)).toBe('');
  });

  it('limpar o rascunho de uma conversa preserva o das outras', () => {
    let r = gravarRascunho(gravarRascunho({}, A, 'oi A'), B, 'oi B');
    r = gravarRascunho(r, A, '');
    expect(lerRascunho(r, A)).toBe('');
    expect(lerRascunho(r, B)).toBe('oi B');
  });

  it('sem conversa aberta, o rascunho é vazio (e não explode)', () => {
    expect(lerRascunho({ 'e1:x': 'algo' }, null)).toBe('');
  });

  it('🔴 resposta que chega depois de um pedido mais novo é descartada', () => {
    const p = criarControleDePedidos();
    const primeiro = p.novo();   // clique na conversa A
    const segundo = p.novo();    // clique na conversa B, antes de A voltar
    expect(p.aindaVale(primeiro)).toBe(false); // A volta atrasada: vira lixo
    expect(p.aindaVale(segundo)).toBe(true);
  });

  it('o pedido mais recente continua valendo enquanto não houver outro', () => {
    const p = criarControleDePedidos();
    const n = p.novo();
    expect(p.aindaVale(n)).toBe(true);
    p.novo();
    expect(p.aindaVale(n)).toBe(false);
  });
});

/**
 * Anexos: o que pode ir, e por que o teto não é o da Meta.
 *
 * A Meta aceita 100 MB de documento. O corpo de uma request na Vercel para em
 * 4,5 MB — e o `next.config.mjs` declara `bodySizeLimit: '15mb'`, que a
 * plataforma não cumpre: funciona em dev e vira 413 opaco em produção. Por isso
 * o teto é NOSSO, a recusa acontece antes do upload, e a mensagem diz o número
 * verdadeiro. Config declarada não é config aplicada.
 */
describe('anexos — classificação antes de gastar upload', () => {
  const MB = 1024 * 1024;

  it('mapeia cada MIME para o tipo que a Cloud API espera', () => {
    expect(classificarMidia('image/jpeg', 1024).tipo).toBe('image');
    expect(classificarMidia('audio/ogg', 1024).tipo).toBe('audio');
    expect(classificarMidia('video/mp4', 1024).tipo).toBe('video');
    expect(classificarMidia('application/pdf', 1024).tipo).toBe('document');
    expect(classificarMidia('text/plain', 1024).tipo).toBe('document');
  });

  it('MIME em caixa alta ainda casa — o navegador não promete minúsculas', () => {
    expect(classificarMidia('IMAGE/PNG', 1024).ok).toBe(true);
  });

  it('tipo não suportado é recusado com frase, não com código', () => {
    const c = classificarMidia('application/x-msdownload', 1024);
    expect(c.ok).toBe(false);
    expect(c.motivo).toMatch(/não aceita este tipo/i);
  });

  it('🔴 o teto é POR TIPO — o da Meta, agora que o arquivo não passa pela função', () => {
    // Antes o teto era 4 MB para tudo (corpo da request na Vercel). Com upload
    // direto para o Storage, vale o limite de cada tipo — e a mensagem diz qual,
    // senão a pessoa não entende por que 20 MB passa num PDF e não num vídeo.
    const video = classificarMidia('video/mp4', 20 * MB);
    expect(video.ok).toBe(false);
    expect(video.motivo).toMatch(/20 MB/);
    expect(video.motivo).toMatch(/até 16 MB para vídeo/);

    const imagem = classificarMidia('image/png', 8 * MB);
    expect(imagem.motivo).toMatch(/5 MB para imagem/);

    // O mesmo tamanho que reprova em vídeo passa em documento.
    expect(classificarMidia('application/pdf', 20 * MB).ok).toBe(true);
  });

  it('🔴 PDF de 40 MB passa — era exatamente o que o teto antigo barrava', () => {
    expect(classificarMidia('application/pdf', 40 * MB).ok).toBe(true);
    expect(classificarMidia('application/pdf', 101 * MB).ok).toBe(false);
  });

  it('a fronteira de cada tipo: no teto passa, um byte acima não', () => {
    for (const [mime, teto] of [
      ['image/png', TETOS_POR_TIPO.image],
      ['audio/ogg', TETOS_POR_TIPO.audio],
      ['video/mp4', TETOS_POR_TIPO.video],
      ['application/pdf', TETOS_POR_TIPO.document],
    ] as const) {
      expect(classificarMidia(mime, teto).ok, `${mime} no teto`).toBe(true);
      expect(classificarMidia(mime, teto + 1).ok, `${mime} acima`).toBe(false);
    }
  });

  it('arquivo vazio é recusado (o navegador entrega File de 0 byte em alguns casos)', () => {
    expect(classificarMidia('image/png', 0).ok).toBe(false);
  });

  it('a lista do `accept` cobre os mesmos MIMEs que o servidor aceita', () => {
    // Se as duas divergirem, a pessoa escolhe um arquivo que o servidor recusa —
    // ou pior, não consegue escolher um que passaria.
    expect(MIMES_ACEITOS.length).toBeGreaterThan(0);
    for (const mime of MIMES_ACEITOS) expect(classificarMidia(mime, 1024).ok).toBe(true);
  });
});

/**
 * 🔴 A mensagem que o usuário lê quando o envio falha ANTES de chegar ao servidor.
 *
 * Medido em produção em 15/08/2026, no primeiro envio real de anexo: o arquivo
 * passou do limite da plataforma, a Vercel devolveu 413 na borda (nenhum POST da
 * action nos logs), o Next rejeitou com "An unexpected response was received
 * from the server" e o error boundary derrubou a seção inteira — a pessoa leu
 * "Algo deu errado nesta seção".
 *
 * A lição que estes testes guardam: a validação do servidor era INALCANÇÁVEL
 * para exatamente o caso que ela existia para explicar.
 */
describe('falha de envio antes do servidor', () => {
  it('resposta inesperada do Next vira instrução, não jargão', () => {
    const m = mensagemDeFalhaDeEnvio(new Error('An unexpected response was received from the server.'));
    expect(m).toMatch(/4 MB/);
    expect(m).toMatch(/recarregue a página/i);
    expect(m).not.toMatch(/unexpected response/i);
  });

  it('413 e falha de rede caem na mesma explicação', () => {
    expect(mensagemDeFalhaDeEnvio(new Error('413 Payload Too Large'))).toMatch(/4 MB/);
    expect(mensagemDeFalhaDeEnvio(new Error('Failed to fetch'))).toMatch(/4 MB/);
  });

  it('sessão expirada tem mensagem própria — a ação é outra', () => {
    expect(mensagemDeFalhaDeEnvio(new Error('Acesso restrito à plataforma'))).toMatch(/sessão expirou/i);
  });

  it('erro desconhecido não vira silêncio nem texto vazio', () => {
    expect(mensagemDeFalhaDeEnvio(new Error('boom'))).toBe('Falha ao enviar: boom');
    expect(mensagemDeFalhaDeEnvio(null)).toBe('Falha ao enviar.');
  });
});
