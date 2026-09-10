/**
 * Quem É o elenco declarado do ACME Demo — por PERTENCIMENTO, não por exclusão.
 *
 * As duas asserções de sanidade do reset (`seedAcmeRhReportCenter` e
 * `buildAcmeOrganizationReportArtifacts`) precisam contar os participantes do
 * elenco e comparar com `ACME_DEMO_TEAM_SIZE`. Elas faziam isso contando **todo
 * mundo do tenant menos as exceções conhecidas** — e uma lista de exceções só
 * cresce, sempre depois do incidente.
 *
 * 🔴 `Medido: 09/09/2026` — foi exatamente assim que o reset quebrou. O
 * convidado de degustação passou a atravessar o reset (decisão certa, 03/09),
 * virou linha em `colaboradores`, e a conta deu **33 contra os 30 declarados**.
 * A asserção roda depois do wipe e do seed, então ela não impediu nada: apenas
 * abortou a geração dos relatórios, e o ambiente ficou com **3 de 35** — com a
 * central do RH abrindo "Leitura analítica ainda não disponível". A correção da
 * época adicionou o prefixo `convidado.` à lista de exceções; a classe
 * continuou de pé.
 *
 * 🔑 A pergunta certa não é "quem NÃO conta?" (aberta, e cada ator novo é uma
 * descoberta) e sim "quem É do elenco?" (fechada, e está declarada no código).
 * Ator novo — convidado, conta de verificação do E2E, usuário de integração,
 * suporte — simplesmente não pertence, e a asserção segue protegendo contra o
 * defeito real que ela existe para pegar: **elenco incompleto**, que é erro de
 * seed.
 *
 * O elenco vive em duas declarações, e por isso a união:
 * - `ACME_DEMO_REPORT_DIRECTORY` — o diretório que a central do RH descreve;
 * - `ROSTER_COMERCIAL` — as personas navegáveis e a administradora.
 * Medido na união: **31 e-mails** (os 30 participantes + a Helena, `rh`), que é
 * exatamente o que o tenant tem depois de um reset saudável.
 */
import { ACME_DEMO_REPORT_DIRECTORY } from '@/lib/demo/acme-rh-report-fixture';
import { ROSTER_COMERCIAL } from '@/lib/demo/rosters/comercial';

function normalizar(email: unknown): string {
  return String(email || '').trim().toLowerCase();
}

/**
 * Todos os e-mails declarados do ambiente, inclusive a administradora (`rh`).
 * Quem filtra papel é o call-site — as duas asserções contam participantes, e
 * cada uma já exclui `rh` do jeito dela (uma no `.filter`, outra no `.neq` da
 * query).
 */
export const ACME_DEMO_ELENCO_EMAILS: ReadonlySet<string> = new Set<string>([
  ...ACME_DEMO_REPORT_DIRECTORY.map((pessoa) => normalizar(pessoa.email)),
  ...ROSTER_COMERCIAL.personas.map((persona) => normalizar(persona.email)),
  normalizar(ROSTER_COMERCIAL.administradora.email),
].filter(Boolean));

/** A pessoa faz parte do elenco declarado do ACME Demo? */
export function ehDoElencoAcme(email: unknown): boolean {
  return ACME_DEMO_ELENCO_EMAILS.has(normalizar(email));
}
