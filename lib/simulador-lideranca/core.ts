import { CONTEXTO, EPISODIOS } from './episodios';
import {
  LiderancaError,
  MAX_TURNOS,
  MIN_TURNOS,
  type Estado,
  type Episodio,
  type Consequencia,
  type Comando,
  type Gerar,
} from './schema';
import type { LinhaMatriz } from '@/lib/simuladores/lideranca/matriz-global';
import { diagnosticarAvaliacao, gravarAvaliacao, linhasDoEncontro } from './avaliacao';

export function validarConsequencia(c: Consequencia, e: Episodio) {
  for (const a of c.acordos) {
    if (
      !e.mensagens.some(
        (m) =>
          m.autor === 'lider' &&
          m.turno === a.turno &&
          m.texto.includes(a.trecho),
      )
    )
      throw new Error('Acordo sem fala que o sustente');
  }
}
/**
 * Código da competência NA MATRIZ DA JORNADA. As duas variantes têm os mesmos
 * nomes e códigos diferentes (LD0x para quem lidera, FL0x para futuro líder),
 * então o encontro se casa pelo nome. Até 18/09 o casamento era por `LD0x`, e o
 * futuro líder (a maior parte do público) recebia "0 de 0" nas cinco.
 */
export function codigoCompetencia(matriz: LinhaMatriz[], nome: string) {
  return matriz.find((d) => d.nome === nome)?.cod_comp ?? null;
}
// Devolutiva, validação e síntese vivem no núcleo puro de avaliação.
export {
  resumoAvaliacao,
  diagnosticarAvaliacao,
  gravarAvaliacao,
  sinteseDaJornada,
  linhasDoEncontro,
  competenciasDoEncontro,
} from './avaliacao';
export function episodioPublico(e: Episodio) {
  return {
    id: e.id,
    indice: e.indice,
    repeticao: e.repeticao,
    iniciadoEm: e.iniciadoEm,
    encerradoEm: e.encerradoEm,
    contexto: e.contexto,
    plano: e.plano,
    mensagens: e.mensagens,
    reflexao: e.reflexao,
    consequencia: e.consequencia,
    avaliacao: e.avaliacao,
  };
}
export function visaoPublica(s: Estado) {
  return {
    ativo: s.ativo ? episodioPublico(s.ativo) : null,
    concluidos: s.concluidos.map(episodioPublico),
    matriz: s.matriz,
    concluida: s.concluidos.length === EPISODIOS.length,
  };
}
export type JornadaPublica = ReturnType<typeof visaoPublica> & {
  revisao: number;
  processandoAte: string | null;
};

/** Transições puras. Persistência, identidade e chamadas pagas ficam nas fronteiras. */
export async function executarCore(
  estado: Estado,
  cmd: Comando,
  gerar: Gerar,
  dossies: readonly string[],
) {
  const s = structuredClone(estado);
  let arquivo: Episodio | null = null;
  const ativo = s.ativo;
  if (
    cmd.acao === 'iniciar' ||
    cmd.acao === 'avancar' ||
    cmd.acao === 'repetir'
  ) {
    if (ativo)
      throw new LiderancaError(
        409,
        'Conclua o encontro aberto antes de iniciar outro.',
      );
    const indice = cmd.acao === 'repetir' ? cmd.episodio : s.concluidos.length;
    if (indice >= EPISODIOS.length)
      throw new LiderancaError(
        409,
        'Jornada concluída. Escolha um encontro para repetir.',
      );
    if (cmd.acao === 'iniciar' && s.concluidos.length)
      throw new LiderancaError(
        409,
        'Sua jornada já começou. Continue do próximo encontro.',
      );
    if (cmd.acao === 'repetir' && !s.concluidos[indice])
      throw new LiderancaError(
        409,
        'Você só pode repetir encontros já concluídos.',
      );
    const antecedentes = s.concluidos
      .slice(0, indice)
      .map((e) => e.consequencia!);
    const abertura = await gerar('abertura', {
      contexto: CONTEXTO,
      encontro: EPISODIOS[indice],
      dossie: dossies[indice],
      antecedentes,
    });
    s.ativo = {
      id: cmd.requestId,
      indice,
      repeticao: cmd.acao === 'repetir',
      iniciadoEm: new Date().toISOString(),
      encerradoEm: null,
      contexto: abertura.contexto,
      plano: null,
      mensagens: [{ turno: 0, autor: 'personagem', texto: abertura.fala }],
      reflexao: null,
      antecedentes,
      consequencia: null,
      avaliacao: null,
    };
  } else {
    if (!ativo)
      throw new LiderancaError(409, 'Abra um encontro para continuar.');
    const turnos = ativo.mensagens.filter((m) => m.autor === 'lider').length;
    if (cmd.acao === 'abandonar') {
      if (!ativo.repeticao)
        throw new LiderancaError(
          409,
          'Só é possível desistir de uma repetição. O encontro da jornada original segue aberto.',
        );
      // Sem arquivo e sem chamada paga: a repetição some e a jornada original fica intacta.
      s.ativo = null;
    } else if (cmd.acao === 'planejar') {
      if (ativo.plano !== null)
        throw new LiderancaError(409, 'A preparação já foi registrada.');
      ativo.plano = cmd.texto;
    } else {
      if (!ativo.plano)
        throw new LiderancaError(
          409,
          'Registre sua preparação antes de conversar.',
        );
      if (cmd.acao === 'responder') {
        if (turnos >= MAX_TURNOS)
          throw new LiderancaError(
            409,
            'Conclua sua reflexão para receber a devolutiva deste encontro.',
          );
        ativo.mensagens.push({
          turno: turnos + 1,
          autor: 'lider',
          texto: cmd.texto,
        });
        const resposta = await gerar('personagem', {
          contexto: CONTEXTO,
          encontro: EPISODIOS[ativo.indice],
          dossie: dossies[ativo.indice],
          briefing: ativo.contexto,
          antecedentes: ativo.antecedentes,
          mensagens: ativo.mensagens,
        });
        ativo.mensagens.push({
          turno: turnos + 1,
          autor: 'personagem',
          texto: resposta.fala,
        });
      } else {
        if (turnos < MIN_TURNOS)
          throw new LiderancaError(
            409,
            'Converse por pelo menos três rodadas antes de concluir.',
          );
        ativo.reflexao = cmd.texto;
        // O avaliador recebe só os descritores DESTE encontro (foco + 2
        // secundárias) e os acordos e pendências dos encontros anteriores, para
        // julgar a continuidade (que é o diferencial da jornada). Não recebe o
        // dossiê, a consequência gerada nem as avaliações anteriores.
        const linhas = linhasDoEncontro(s.matriz, ativo.indice);
        const encontro = EPISODIOS[ativo.indice];
        const avaliacao = await gerar(
          'avaliador',
          {
            competenciaFoco: encontro.nome,
            competenciasSecundarias: encontro.secundarias,
            matriz: linhas,
            antecedentes: ativo.antecedentes.map((c) => ({
              acordos: c.acordos.map((a) => a.descricao),
              pendencias: c.pendencias,
            })),
            planejamento: ativo.plano,
            mensagens: ativo.mensagens,
            reflexao: ativo.reflexao,
          },
          (a) => void diagnosticarAvaliacao(a, ativo, linhas),
        );
        // Citação inválida em poucos descritores rebaixa só esses; a regra de
        // cobertura fica registrada na avaliação gravada.
        ativo.avaliacao = gravarAvaliacao(avaliacao, ativo, linhas);
        ativo.consequencia = await gerar(
          'consequencia',
          {
            encontro: EPISODIOS[ativo.indice],
            antecedentes: ativo.antecedentes,
            briefing: ativo.contexto,
            mensagens: ativo.mensagens,
          },
          (c) => validarConsequencia(c, ativo),
        );
        ativo.encerradoEm = new Date().toISOString();
        if (!ativo.repeticao) s.concluidos.push(ativo);
        arquivo = ativo;
        s.ativo = null;
      }
    }
  }
  return { estado: s, arquivo };
}
