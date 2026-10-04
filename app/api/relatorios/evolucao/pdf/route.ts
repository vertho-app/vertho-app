import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { tenantDb } from '@/lib/tenant-db';
import RelatorioEvolucaoPDF from '@/components/pdf/RelatorioEvolucao';
import { carregarEvolucaoRH } from '@/lib/relatorios/evolucao-center';
import { resolverRecorteDeTurma } from '@/lib/relatorios/recorte-turma';
import { resolverMarcaPdf, marcaVertho, nomeArquivoMarca } from '@/lib/pdf-marca';
import { requireRole } from '@/lib/auth/request-context';
import { resolverEmpresaDoRelatorio } from '@/lib/auth/empresa-do-relatorio';
import { contentDispositionHeader } from '@/lib/http/content-disposition';
import { idiomaDoLeitor } from '@/lib/pdf-locale';

/**
 * PDF executivo de evolução — o agregado do fim de jornada, pelo recorte que o
 * RH está vendo na central.
 *
 * TRÊS COISAS QUE ESTA ROTA FAZ DIFERENTE DA `relatorios/pdf` VIZINHA:
 *
 * 1. **Não existe registro em `relatorios` para ler.** Este documento é derivado
 *    ao vivo de `trilhas.evolution_report`, pela mesma função que alimenta a aba
 *    Evolução (`carregarEvolucaoRH`). É de propósito: gravar uma cópia criaria um
 *    PDF que envelhece em silêncio enquanto mais gente fecha a jornada — e a
 *    pergunta que este documento responde ("quem evoluiu?") muda toda semana.
 *
 * 2. **O tenant vem da SESSÃO, nunca do browser** — com UMA exceção, e ela é
 *    gatada: a rota é nominal por natureza (nomes, cargos, notas), então
 *    `empresaId` vindo do cliente seria uma leitura cross-tenant de PII a um
 *    parâmetro de distância. Para o RH continua sendo assim: o parâmetro é
 *    ignorado. Só `isPlatformAdmin` pode pedir outra empresa, porque é o
 *    alcance que ele já tem em toda a área /admin (onde a empresa vem da rota e
 *    o gate é o papel), e é de lá que o botão desta tela sai.
 *
 * 3. **Não há cache no Storage.** O agregado muda a cada fechamento; servir um
 *    PDF salvo faria o RH baixar um retrato antigo achando que é o de hoje. A
 *    renderização é CPU-bound, daí o `maxDuration`.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    // Agregado nominal da EMPRESA INTEIRA (nome, cargo, nível de partida e de
    // chegada de cada pessoa): documento do RH e da plataforma, não do gestor.
    // O gestor estava na lista até 03/10/2026 (R-09) e baixava pela URL o PDF
    // de todo o tenant, sem recorte pela equipe; nenhuma tela dele aponta para
    // cá (o botão vive só em /dashboard/relatorios, que exige `rh`, e em
    // /admin/evolucao). A evolução do liderado sai pelo PDF individual.
    // O gate é `requireRole` (a régua do projeto), não um `if` de roles escrito
    // aqui — dois lugares decidindo acesso divergem no primeiro papel novo.
    const auth = await requireRole(request, ['rh', 'admin']);
    if (auth instanceof Response) return auth;

    const { searchParams } = new URL(request.url);
    const turmaId = searchParams.get('turma');
    const contentDisposition = searchParams.get('view') === 'inline' ? 'inline' : 'attachment';

    // `?empresa=` só vale para a plataforma (ver item 2 do cabeçalho); para
    // o RH o parâmetro é descartado. A guarda vem DEPOIS e mede o valor
    // RESOLVIDO: o platform admin desta base tem `empresaId` nulo na sessão, e
    // exigir a empresa da sessão antes de ler o parâmetro respondia
    // "sessão sem empresa" para o botão que informa a empresa na URL.
    const empresaId = resolverEmpresaDoRelatorio(auth, searchParams.get('empresa'));
    if (!empresaId) {
      return NextResponse.json({ error: 'nenhuma empresa para este relatório' }, { status: 403 });
    }

    const tdb = tenantDb(empresaId);
    const empresaResult = await tdb.raw.from('empresas').select('nome, default_locale').eq('id', empresaId).maybeSingle();
    if (empresaResult.error) {
      // O supabase-js RETORNA `{ error }`. Sem checar, a falha viraria um PDF com
      // o nome da empresa em branco — e o documento circula assim.
      console.error('[pdf-evolucao] empresa:', empresaResult.error.message);
      return NextResponse.json({ error: 'não foi possível ler a empresa' }, { status: 500 });
    }
    const empresaNome = empresaResult.data?.nome || '';
    // O papel sai no idioma de quem baixa (colaboradores.locale, senão o da empresa, senão pt-BR).
    const locale = await idiomaDoLeitor(auth, empresaId, { localeDaEmpresa: (empresaResult.data as any)?.default_locale ?? null });

    // Mesma régua de recorte da tela: turma de outro tenant ou encerrada cai
    // para a empresa inteira, e o PDF diz qual recorte saiu.
    const recorte = await resolverRecorteDeTurma(tdb.raw, empresaId, turmaId);
    const data = await carregarEvolucaoRH(empresaId, { colaboradorIds: recorte.colaboradorIds });

    // Leitura falhou: o documento sai dizendo isso, em vez de sair mostrando
    // zero evolução — que pareceria resultado do programa, não avaria nossa.
    if (data.indisponivel) {
      console.error('[pdf-evolucao] agregado indisponível para', empresaId);
    }

    // Baixado pela PLATAFORMA sai com a marca Vertho (decisão do dono,
    // 14/09/2026); baixado pelo CLIENTE segue a flag `pdf_sem_marca` do tenant.
    const marca = auth.isPlatformAdmin ? marcaVertho() : await resolverMarcaPdf(empresaId);
    const sufixo = (recorte.turma?.nome || empresaNome || 'evolucao').replace(/\s+/g, '-').toLowerCase();
    const filename = `${nomeArquivoMarca('vertho-evolucao', marca)}-${sufixo}.pdf`;

    const buffer = await renderToBuffer(
      React.createElement(RelatorioEvolucaoPDF, {
        data,
        empresaNome,
        logoBase64: marca.logoBase64 || undefined,
        mostrarVertho: marca.mostrarVertho,
        recorte: recorte.turma?.nome || null,
        locale,
      }) as any,
    );

    // R-129 (03/10/2026): o nome ia cru no cabeçalho. Nome de turma ou de
    // empresa com caractere fora do Latin-1 (o travessão das três turmas de
    // Macaé, do Grupo Sinal) faz o `Headers` lançar "Cannot convert argument
    // to a ByteString", e o RH recebia essa frase em JSON no lugar do PDF.
    // `contentDispositionHeader` é a régua que a rota vizinha já usa.
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDispositionHeader(filename, contentDisposition),
        'X-Evolucao-Medidos': String(data.cobertura.medidos),
      },
    });
  } catch (err: any) {
    // O detalhe fica no log; a resposta não leva mensagem interna para a tela.
    console.error('[pdf-evolucao]', err);
    return NextResponse.json({ error: 'falha ao gerar o PDF' }, { status: 500 });
  }
}
