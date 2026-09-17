import { nivelDaNota } from "@/lib/nivel-regua";
import { CONTEXTO, EPISODIOS } from "./episodios";
import {
  LiderancaError,
  MAX_TURNOS,
  MIN_TURNOS,
  type Estado,
  type Episodio,
  type Avaliacao,
  type Consequencia,
  type Comando,
  type Gerar,
} from "./schema";
import type { LinhaMatriz } from "@/lib/simuladores/lideranca/matriz-global";

export function validarAvaliacao(
  a: Avaliacao,
  e: Episodio,
  matriz: LinhaMatriz[],
) {
  const codigos = new Set(matriz.map((d) => d.cod_desc));
  if (a.descritores.length !== codigos.size)
    throw new Error("Cobertura inválida");
  for (const d of a.descritores) {
    if (!codigos.delete(d.codigo))
      throw new Error("Código repetido ou desconhecido");
    if ((d.nivel === null) !== (d.evidencias.length === 0))
      throw new Error("Nota sem evidência ou evidência sem nota");
    for (const prova of d.evidencias) {
      const fonte =
        prova.fonte === "fala"
          ? e.mensagens.find(
              (m) => m.autor === "lider" && m.turno === prova.turno,
            )?.texto
          : prova.turno !== 0
            ? null
            : prova.fonte === "planejamento"
              ? e.plano
              : e.reflexao;
      if (!fonte || !fonte.includes(prova.trecho))
        throw new Error("Citação não encontrada na fonte");
    }
  }
}
export function validarConsequencia(c: Consequencia, e: Episodio) {
  for (const a of c.acordos) {
    if (
      !e.mensagens.some(
        (m) =>
          m.autor === "lider" &&
          m.turno === a.turno &&
          m.texto.includes(a.trecho),
      )
    )
      throw new Error("Acordo sem fala que o sustente");
  }
}
export function resumoAvaliacao(a: Avaliacao, matriz: LinhaMatriz[]) {
  return EPISODIOS.map((c) => {
    const codigos = matriz
      .filter((d) => d.cod_comp === c.competencia)
      .map((d) => d.cod_desc);
    const observados = a.descritores.filter(
      (d) => codigos.includes(d.codigo) && d.nivel !== null,
    );
    const nota = observados.length
      ? observados.reduce((s, d) => s + d.nivel!, 0) / observados.length
      : null;
    return {
      codigo: c.competencia,
      nome: c.nome,
      nota,
      nivel: nota === null ? null : nivelDaNota(nota),
      observados: observados.length,
      total: codigos.length,
    };
  });
}
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
    cmd.acao === "iniciar" ||
    cmd.acao === "avancar" ||
    cmd.acao === "repetir"
  ) {
    if (ativo)
      throw new LiderancaError(
        409,
        "Conclua o encontro aberto antes de iniciar outro.",
      );
    const indice = cmd.acao === "repetir" ? cmd.episodio : s.concluidos.length;
    if (indice >= EPISODIOS.length)
      throw new LiderancaError(
        409,
        "Jornada concluída. Escolha um encontro para repetir.",
      );
    if (cmd.acao === "iniciar" && s.concluidos.length)
      throw new LiderancaError(
        409,
        "Sua jornada já começou. Continue do próximo encontro.",
      );
    if (cmd.acao === "repetir" && !s.concluidos[indice])
      throw new LiderancaError(
        409,
        "Você só pode repetir encontros já concluídos.",
      );
    const antecedentes = s.concluidos
      .slice(0, indice)
      .map((e) => e.consequencia!);
    const abertura = await gerar("abertura", {
      contexto: CONTEXTO,
      encontro: EPISODIOS[indice],
      dossie: dossies[indice],
      antecedentes,
    });
    s.ativo = {
      id: cmd.requestId,
      indice,
      repeticao: cmd.acao === "repetir",
      iniciadoEm: new Date().toISOString(),
      encerradoEm: null,
      contexto: abertura.contexto,
      plano: null,
      mensagens: [{ turno: 0, autor: "personagem", texto: abertura.fala }],
      reflexao: null,
      antecedentes,
      consequencia: null,
      avaliacao: null,
    };
  } else {
    if (!ativo)
      throw new LiderancaError(409, "Abra um encontro para continuar.");
    const turnos = ativo.mensagens.filter((m) => m.autor === "lider").length;
    if (cmd.acao === "planejar") {
      if (ativo.plano !== null)
        throw new LiderancaError(409, "A preparação já foi registrada.");
      ativo.plano = cmd.texto;
    } else {
      if (!ativo.plano)
        throw new LiderancaError(
          409,
          "Registre sua preparação antes de conversar.",
        );
      if (cmd.acao === "responder") {
        if (turnos >= MAX_TURNOS)
          throw new LiderancaError(
            409,
            "Conclua sua reflexão para receber a devolutiva deste encontro.",
          );
        ativo.mensagens.push({
          turno: turnos + 1,
          autor: "lider",
          texto: cmd.texto,
        });
        const resposta = await gerar("personagem", {
          contexto: CONTEXTO,
          encontro: EPISODIOS[ativo.indice],
          dossie: dossies[ativo.indice],
          briefing: ativo.contexto,
          antecedentes: ativo.antecedentes,
          mensagens: ativo.mensagens,
        });
        ativo.mensagens.push({
          turno: turnos + 1,
          autor: "personagem",
          texto: resposta.fala,
        });
      } else {
        if (turnos < MIN_TURNOS)
          throw new LiderancaError(
            409,
            "Converse por pelo menos três rodadas antes de concluir.",
          );
        ativo.reflexao = cmd.texto;
        // Avaliador não recebe dossiê, consequência gerada nem dados dos outros encontros.
        ativo.avaliacao = await gerar(
          "avaliador",
          {
            competenciaFoco: EPISODIOS[ativo.indice].competencia,
            matriz: s.matriz,
            planejamento: ativo.plano,
            mensagens: ativo.mensagens,
            reflexao: ativo.reflexao,
          },
          (a) => validarAvaliacao(a, ativo, s.matriz),
        );
        ativo.consequencia = await gerar(
          "consequencia",
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
