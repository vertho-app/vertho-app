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
import { classificarMidia, MIMES_ACEITOS, TETO_ANEXO_BYTES, mensagemDeFalhaDeEnvio } from '@/lib/inbox/anexos';

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
    expect(variantesDoTelefone('5511999998888')).toEqual(['5511999998888', '+5511999998888']);
    expect(variantesDoTelefone('+55 (11) 99999-8888')).toEqual(['5511999998888', '+5511999998888']);

    const f = filtroDeTelefone('5511999998888');
    expect(f).toContain('whatsapp.eq.5511999998888');
    expect(f).toContain('telefone.eq.5511999998888');
    expect(f).toContain('whatsapp.eq.+5511999998888');
  });

  it('🔴 telefone sem dígitos devolve filtro VAZIO — um `.or("")` traria a tabela toda', () => {
    expect(variantesDoTelefone('')).toEqual([]);
    expect(filtroDeTelefone('abc')).toBe('');
  });
});

const AGORA = Date.UTC(2026, 7, 15, 12, 0, 0); // meio-dia UTC: longe das duas bordas da janela
const H = 3600_000;

function linha(over: Partial<LinhaConversa> = {}): LinhaConversa {
  return {
    empresa_id: 'e1',
    from_phone: '5511999998888',
    ultima_em: new Date(AGORA - H).toISOString(),
    total: 3,
    nao_lidas: 1,
    ultimo_texto: 'oi',
    ultimo_tipo: 'text',
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
    const [c] = montarConversas([linha({ ultima_em: new Date(AGORA - 25 * H).toISOString() })], new Map(), AGORA);
    expect(c.janela.estado).toBe('fechada');
    expect(c.janela.podeTextoLivre).toBe(false);
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
      linha({ from_phone: '551100000002', nao_lidas: 0, ultima_em: new Date(AGORA - 30 * H).toISOString() }),
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

  it('🔴 o teto é 4 MB e a recusa explica que é da HOSPEDAGEM, não do WhatsApp', () => {
    // Um PDF de 8 MB seria aceito pela Meta (limite 100 MB) e morre no corpo da
    // request. Culpar o WhatsApp aqui mandaria alguém procurar no lugar errado.
    const c = classificarMidia('application/pdf', 8 * MB);
    expect(c.ok).toBe(false);
    expect(c.motivo).toContain('8.0 MB');
    expect(c.motivo).toMatch(/hospedagem/i);
    expect(c.motivo).not.toMatch(/limite do WhatsApp/i);
  });

  it('a fronteira do teto: exatamente 4 MB passa, um byte a mais não', () => {
    expect(classificarMidia('application/pdf', TETO_ANEXO_BYTES).ok).toBe(true);
    expect(classificarMidia('application/pdf', TETO_ANEXO_BYTES + 1).ok).toBe(false);
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
