import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { tenantDb } from '@/lib/tenant-db';
import RelatorioEvolucaoPDF from '@/components/pdf/RelatorioEvolucao';
import { carregarEvolucaoRH } from '@/lib/relatorios/evolucao-center';
import { resolverRecorteDeTurma } from '@/lib/relatorios/recorte-turma';
import { resolverMarcaPdf, nomeArquivoMarca } from '@/lib/pdf-marca';
import { requireRole } from '@/lib/auth/request-context';

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
 * 2. **O tenant vem da SESSÃO, nunca do browser.** Não há parâmetro de empresa.
 *    A rota é nominal por natureza (nomes, cargos, notas), então `empresaId` do
 *    cliente seria uma leitura cross-tenant de PII a um parâmetro de distância.
 *
 * 3. **Não há cache no Storage.** O agregado muda a cada fechamento; servir um
 *    PDF salvo faria o RH baixar um retrato antigo achando que é o de hoje. A
 *    renderização é CPU-bound, daí o `maxDuration`.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    // Agregado nominal do tenant: é documento de RH/gestor, não de participante.
    // O gate é `requireRole` (a régua do projeto), não um `if` de roles escrito
    // aqui — dois lugares decidindo acesso divergem no primeiro papel novo.
    const auth = await requireRole(request, ['gestor', 'rh', 'admin']);
    if (auth instanceof Response) return auth;

    if (!auth.empresaId) {
      return NextResponse.json({ error: 'sessão sem empresa' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const turmaId = searchParams.get('turma');
    const contentDisposition = searchParams.get('view') === 'inline' ? 'inline' : 'attachment';

    const tdb = tenantDb(auth.empresaId);
    const empresaResult = await tdb.raw.from('empresas').select('nome').eq('id', auth.empresaId).maybeSingle();
    if (empresaResult.error) {
      // O supabase-js RETORNA `{ error }`. Sem checar, a falha viraria um PDF com
      // o nome da empresa em branco — e o documento circula assim.
      console.error('[pdf-evolucao] empresa:', empresaResult.error.message);
      return NextResponse.json({ error: 'não foi possível ler a empresa' }, { status: 500 });
    }
    const empresaNome = empresaResult.data?.nome || '';

    // Mesma régua de recorte da tela: turma de outro tenant ou encerrada cai
    // para a empresa inteira, e o PDF diz qual recorte saiu.
    const recorte = await resolverRecorteDeTurma(tdb.raw, auth.empresaId, turmaId);
    const data = await carregarEvolucaoRH(auth.empresaId, { colaboradorIds: recorte.colaboradorIds });

    // Leitura falhou: o documento sai dizendo isso, em vez de sair mostrando
    // zero evolução — que pareceria resultado do programa, não avaria nossa.
    if (data.indisponivel) {
      console.error('[pdf-evolucao] agregado indisponível para', auth.empresaId);
    }

    const marca = await resolverMarcaPdf(auth.empresaId);
    const sufixo = (recorte.turma?.nome || empresaNome || 'evolucao').replace(/\s+/g, '-').toLowerCase();
    const filename = `${nomeArquivoMarca('vertho-evolucao', marca)}-${sufixo}.pdf`;

    const buffer = await renderToBuffer(
      React.createElement(RelatorioEvolucaoPDF, {
        data,
        empresaNome,
        logoBase64: marca.logoBase64 || undefined,
        mostrarVertho: marca.mostrarVertho,
        recorte: recorte.turma?.nome || null,
      }) as any,
    );

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${contentDisposition}; filename="${filename}"`,
        'X-Evolucao-Medidos': String(data.cobertura.medidos),
      },
    });
  } catch (err: any) {
    console.error('[pdf-evolucao]', err);
    return NextResponse.json({ error: err?.message || 'falha ao gerar o PDF' }, { status: 500 });
  }
}
