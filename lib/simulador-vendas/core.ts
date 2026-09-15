import type { Comando, Estado, Etapa, Saidas } from './schema';
import { VENDAS_SESSAO } from '@/lib/status';
import { MAX_TURNOS, FASES, usaGerenteBruto } from './schema';
import {
  pontuarRelatorio,
  validarFalaCliente,
  validarModeracao,
  violacoesRegistradas,
} from './avaliacao';
import {
  notasDaMatriz,
  planejamentoPendente,
  usaMatrizPace,
  validarMatriz,
} from './matriz-avaliacao';
import { usaFontesDocumentais } from './fontes';
import { recomendacaoDocumentalSchema } from './schema';

export class SimuladorError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SimuladorError';
  }
}
export type Gerar = <K extends Etapa>(
  etapa: K,
  valores: Record<string, unknown>,
  validar?: (saida: Saidas[K]) => void,
) => Promise<Saidas[K]>;
export function assinatura(cmd: Comando): string {
  // Revisão não entra: retry após recuperar o estado deve reconhecer o mesmo comando.
  if (cmd.acao === 'iniciar') return JSON.stringify([cmd.acao, cmd.nivel]);
  if (cmd.acao === 'responder') return JSON.stringify([cmd.acao, cmd.mensagem]);
  if (cmd.acao === 'planejar') return JSON.stringify([cmd.acao, cmd.planejamento]);
  if (cmd.acao === 'feedback') return JSON.stringify([cmd.acao, cmd.feedback]);
  return cmd.acao;
}
export function recebido(s: Estado, cmd: Comando): boolean {
  const recibo = s.recibos.find((r) => r.requestId === cmd.requestId);
  if (!recibo) return false;
  if (recibo.assinatura !== assinatura(cmd))
    throw new SimuladorError(409, 'Este envio já foi usado para outra ação. Atualize o treino.');
  return true;
}
export function visaoPublica(s: Estado) {
  // Allowlist: briefing, gabarito, prompts e classificações reservadas nunca vão ao navegador.
  return {
    id: s.id,
    revisao: s.revisao,
    status: s.status,
    nivel: s.nivel,
    fase: s.fase,
    criadoEm: s.criadoEm,
    encerradoEm: s.encerradoEm,
    cenario: s.cenario
      ? {
          contexto: s.cenario.contexto_vendedor,
          nome: s.cenario.personagem.nome,
          cargo: s.cenario.personagem.cargo,
          empresa: s.cenario.personagem.empresa,
          cidade: s.cenario.personagem.cidade,
        }
      : null,
    mensagens: s.mensagens,
    planejamento: s.planejamento || null,
    planejamentoPendente: planejamentoPendente(s),
    // A devolutiva é preparada no encerramento, mas só é entregue ao
    // participante depois da avaliação da experiência. O gate vive no servidor:
    // ocultar apenas no componente permitiria contorná-lo chamando a API.
    relatorio: s.feedback ? s.relatorio : null,
    avaliacaoPendente: !!s.relatorio && !s.feedback,
    feedback: s.feedback,
    aviso:
      s.moderacoes.filter((m) => m.violacao && m.acao_sugerida !== 'registrar_e_seguir').at(-1)
        ?.motivo || null,
    sugerirEncerramento: s.intencao?.intencao_encerrar === true && s.intencao.confianca !== 'baixa',
    versaoRegua: s.versaoRegua || 'pace-1',
    dadosMascarados: s.dadosMascarados === true,
    turnosRestantes: Math.max(
      0,
      MAX_TURNOS - s.mensagens.filter((m) => m.autor === 'vendedor').length,
    ),
  };
}
export type SessaoPublica = ReturnType<typeof visaoPublica> & {
  processando: boolean;
  processandoAte?: string | null;
};

export function validarCenario(c: Saidas['criador'], s: Pick<Estado, 'nomeVendedor' | 'nivel'>) {
  if (c.personagem.negociacao.nome_vendedor !== s.nomeVendedor)
    throw new Error('Nome do vendedor divergente');
  if (c.personagem.negociacao.objecoes.length !== s.nivel)
    throw new Error('Quantidade de objeções divergente do nível');
  if (c.personagem.personalidade_nivel.nivel !== ['Junior', 'Pleno', 'Senior'][s.nivel - 1])
    throw new Error('Nível divergente');
  if (s.nivel === 3 && c.personagem.personalidade_nivel.cenarios_validos.length !== 2)
    throw new Error('Sênior exige dois cenários válidos');
  const n = c.personagem.negociacao;
  if (
    new Set(n.beneficios_ocultos.map((b) => b.nome)).size !== n.beneficios_ocultos.length ||
    new Set(n.objecoes_profundas.map((o) => o.descricao)).size !== n.objecoes_profundas.length
  )
    throw new Error('Identificadores de descoberta repetidos');
  if (!!n.preco.ideal.trim() !== !!n.preco.minimo_aceitavel.trim())
    throw new Error('Preços devem ser preenchidos em conjunto ou ambos não aplicáveis');
}
export function validarRelatorio(r: Saidas['gerente'], s: Estado) {
  if (usaMatrizPace(s.versaoRegua)) validarMatriz(r.Matriz, s);
  if (usaFontesDocumentais(s.versaoRegua)) {
    if (r.Recomendacoes.length < 3 || r.Recomendacoes.length > 5)
      throw new Error('Devolutiva documental exige 3 a 5 recomendações');
    r.Recomendacoes.forEach((item, i) => {
      recomendacaoDocumentalSchema.parse(item);
      if (item.prioritaria !== (i === 0))
        throw new Error('Prioridade da recomendação inconsistente');
    });
    if (
      r.Beneficios_ocultos_descobertos.length ||
      r.Objecoes_profundas_descobertas.length ||
      r.Resultado === 'fechou_ideal'
    )
      throw new Error('Critério de gabarito fora das fontes documentais');
  }
  for (const descoberta of [
    ...r.Beneficios_ocultos_descobertos,
    ...r.Objecoes_profundas_descobertas,
  ]) {
    const fala = s.mensagens.find((m) => m.autor === 'vendedor' && m.turno === descoberta.turno);
    if (!fala || !fala.texto.includes(descoberta.citacao_vendedor))
      throw new Error('Citação sem evidência literal do vendedor');
  }
  for (const d of r.Beneficios_ocultos_descobertos) {
    if (!s.cenario?.personagem.negociacao.beneficios_ocultos.some((b) => b.nome === d.nome))
      throw new Error('Benefício fora do gabarito');
  }
  for (const d of r.Objecoes_profundas_descobertas) {
    if (!s.cenario?.personagem.negociacao.objecoes_profundas.some((o) => o.descricao === d.nome))
      throw new Error('Objeção profunda fora do gabarito');
  }
  for (const itens of [r.Beneficios_ocultos_descobertos, r.Objecoes_profundas_descobertas]) {
    if (new Set(itens.map((d) => d.nome)).size !== itens.length)
      throw new Error('Descoberta duplicada');
  }
  if (
    // Só pace-1 recebe violações declaradas pelo gerente. Da pace-2 em diante elas são
    // derivadas exclusivamente do registro do moderador, em pontuarRelatorio.
    !usaGerenteBruto(s.versaoRegua) &&
    r.Violacoes.some(
      (v) =>
        !violacoesRegistradas(s).some(
          (m) =>
            m.turno === v.turno &&
            m.fase === v.fase &&
            m.categoria === v.categoria &&
            m.severidade === v.severidade,
        ),
    )
  ) {
    throw new Error('Violação sem registro do moderador');
  }
  // Compatibilidade com a validação legada. A régua v2 só publica a média
  // depois de aplicar as penalidades, em pontuarRelatorio.
  if (!usaGerenteBruto(s.versaoRegua))
    r.Media = Math.max(0.5, Math.round(((r.P + r.A + r.C + r.E) / 4) * 2) / 2);
}

export async function executarCore(s: Estado, cmd: Comando, gerar: Gerar): Promise<Estado> {
  if (recebido(s, cmd)) return s;
  if (cmd.acao !== 'iniciar' && cmd.revisao !== s.revisao)
    throw new SimuladorError(409, 'O treino mudou em outra aba. Atualize a conversa.');
  const next = structuredClone(s);
  if (cmd.acao === 'iniciar') {
    if (s.status !== VENDAS_SESSAO.PREPARANDO || cmd.nivel !== s.nivel)
      throw new SimuladorError(409, 'Este início já pertence a outro treino.');
    next.cenario = await gerar(
      'criador',
      {
        briefing: s.briefing,
        username: s.nomeVendedor,
        userlevel: String(s.nivel),
        seed_diversidade: s.diversidade?.seed || '',
        tracos_anteriores: JSON.stringify(s.diversidade?.anteriores || []),
      },
      (c) => validarCenario(c, s),
    );
    next.status = VENDAS_SESSAO.EM_ANDAMENTO;
  } else if (cmd.acao === 'planejar') {
    if (
      !usaMatrizPace(s.versaoRegua) ||
      s.status !== VENDAS_SESSAO.EM_ANDAMENTO ||
      !s.cenario ||
      s.mensagens.length ||
      s.planejamento
    )
      throw new SimuladorError(
        409,
        'O planejamento deve ser registrado uma vez, antes da conversa.',
      );
    next.planejamento = cmd.planejamento;
  } else if (cmd.acao === 'responder') {
    if (s.status !== VENDAS_SESSAO.EM_ANDAMENTO)
      throw new SimuladorError(409, 'Este treino não está aberto para respostas.');
    if (planejamentoPendente(s))
      throw new SimuladorError(409, 'Registre seu planejamento antes de conversar com o cliente.');
    const turno = s.mensagens.filter((m) => m.autor === 'vendedor').length + 1;
    if (turno > MAX_TURNOS)
      throw new SimuladorError(
        400,
        'O limite de mensagens foi alcançado. Gere o relatório para concluir.',
      );
    next.mensagens.push({
      id: `${cmd.requestId}:v`,
      turno,
      autor: 'vendedor',
      texto: cmd.mensagem,
      fase: s.fase,
    });
    const moderador = await gerar('moderador', { input_vendedor: cmd.mensagem }, validarModeracao);
    if (moderador.violacao) next.moderacoes.push({ ...moderador, turno, fase: s.fase });
    if (
      moderador.violacao &&
      moderador.acao_sugerida === 'encerrar_sessao' &&
      moderador.confianca === 'alta'
    ) {
      next.status = VENDAS_SESSAO.INTERROMPIDA;
      next.encerradoEm = new Date().toISOString();
      next.intencao = null;
    } else {
      const cliente = await gerar(
        'cliente',
        {
          bloco_dinamico: JSON.stringify(s.cenario, null, 2),
          historico: usaGerenteBruto(s.versaoRegua)
            ? next.mensagens.map(({ turno, autor, fase, texto }) => ({
                turno,
                autor,
                fase,
                texto,
              }))
            : next.mensagens
                .map((m) => `**${m.autor === 'vendedor' ? 'Vendedor' : 'Cliente'}:** ${m.texto}`)
                .join('\n'),
          input_vendedor: cmd.mensagem,
          fase_atual: s.fase,
          sinal_moderador: moderador.violacao ? JSON.stringify(moderador) : '',
        },
        (c) => {
          const salto = FASES.indexOf(c.fase) - FASES.indexOf(s.fase);
          if (salto < 0 || salto > 1) throw new Error('Transição PACE inválida');
          if (c.fase_mudou !== (salto === 1))
            throw new Error('Sinal de transição PACE inconsistente');
          validarFalaCliente(c.fala);
        },
      );
      next.fase = cliente.fase;
      next.mensagens.push({
        id: `${cmd.requestId}:c`,
        turno,
        autor: 'cliente',
        texto: cliente.fala,
        fase: cliente.fase,
      });
      next.intencao = await gerar('intencao', {
        input_vendedor: cmd.mensagem,
        resposta_cliente: cliente.fala,
      });
    }
  } else if (cmd.acao === 'encerrar') {
    if (s.status === VENDAS_SESSAO.CONCLUIDA) return s;
    if (s.status !== VENDAS_SESSAO.EM_ANDAMENTO || !s.mensagens.some((m) => m.autor === 'vendedor'))
      throw new SimuladorError(409, 'Converse com o cliente antes de gerar o relatório.');
    // Estado inconsistente não se corrige regenerando uma resposta paga.
    // Verificar ANTES do gerente também evita reutilizar um checkpoint envenenado.
    try {
      violacoesRegistradas(s);
    } catch {
      throw new SimuladorError(
        409,
        'O registro deste treino precisa de revisão pelo suporte. Nenhuma nova avaliação foi cobrada. Entre em contato com o suporte para liberar um novo treino; a conversa foi preservada no histórico.',
      );
    }
    const bruto = await gerar(
      'gerente',
      {
        thread_completa: usaGerenteBruto(s.versaoRegua)
          ? s.mensagens.map(({ turno, autor, fase, texto }) => ({
              turno,
              autor,
              fase,
              texto,
            }))
          : s.mensagens
              .map(
                (m) =>
                  `[Turno ${m.turno}] **${m.autor === 'vendedor' ? 'Vendedor' : 'Cliente'}:** ${m.texto}`,
              )
              .join('\n'),
        ...(!usaFontesDocumentais(s.versaoRegua)
          ? {
              personagem_json: JSON.stringify(s.cenario, null, 2),
              violacoes_moderador: JSON.stringify(s.moderacoes),
            }
          : {}),
        ...(usaMatrizPace(s.versaoRegua) ? { planejamento: s.planejamento || '' } : {}),
      },
      (r) => validarRelatorio(r, s),
    );
    next.notasBrutas =
      usaMatrizPace(s.versaoRegua) && bruto.Matriz
        ? notasDaMatriz(bruto.Matriz)
        : { P: bruto.P, A: bruto.A, C: bruto.C, E: bruto.E };
    next.relatorio = pontuarRelatorio(bruto, s);
    next.status = VENDAS_SESSAO.CONCLUIDA;
    next.encerradoEm = new Date().toISOString();
  } else if (cmd.acao === 'abandonar') {
    if (
      ![VENDAS_SESSAO.PREPARANDO, VENDAS_SESSAO.EM_ANDAMENTO].some((status) => status === s.status)
    )
      throw new SimuladorError(409, 'Este treino já foi encerrado.');
    next.status = VENDAS_SESSAO.ABANDONADA;
    next.encerradoEm = new Date().toISOString();
  } else {
    if (
      ![VENDAS_SESSAO.CONCLUIDA, VENDAS_SESSAO.INTERROMPIDA].some((status) => status === s.status)
    )
      throw new SimuladorError(409, 'Conclua o treino antes de avaliar a experiência.');
    if (s.feedback)
      throw new SimuladorError(409, 'A avaliação desta experiência já foi registrada.');
    next.feedback = cmd.feedback;
  }
  next.revisao++;
  next.recibos.push({ requestId: cmd.requestId, assinatura: assinatura(cmd) });
  return next;
}
