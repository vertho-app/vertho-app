import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RadarHeader, RadarFooter } from '../_components/radar-header';

export const metadata: Metadata = {
  title: 'Metodologia',
  description:
    'Como o Radar Vertho consolida Saeb, Ideb, ICA, SARESP, Censo Escolar, FUNDEB e PDDE em uma leitura única por escola e município, quais fontes usa, como compara e quais limites a análise tem.',
  alternates: { canonical: 'https://radar.vertho.ai/metodologia' },
};

export default function MetodologiaPage() {
  return (
    <main className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 500px at 88% -5%, rgba(52,197,204,.07), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(154,226,230,.06), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}>
      <RadarHeader />

      <article className="max-w-[760px] mx-auto px-6 pb-16">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-6">
          <ArrowLeft size={12} /> Voltar ao início
        </Link>

        <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3" style={{ color: '#34c5cc' }}>
          Metodologia
        </p>
        <h1 className="text-white mb-6"
          style={{
            fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
            fontSize: 'clamp(32px, 5vw, 48px)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}>
          Como o Radar funciona
        </h1>

        <div className="prose prose-invert text-white/75 leading-relaxed space-y-6 text-[15px]">
          <p>
            O Radar Vertho é uma plataforma <strong>pública e gratuita</strong> que reúne, em
            uma única ficha por escola e município, os principais indicadores oficiais de
            <strong> aprendizagem, infraestrutura e financiamento</strong> da educação básica
            brasileira. Toda informação tem fonte e ano citados na própria página.
          </p>
          <p>
            O objetivo é encurtar o caminho entre dado público e decisão pedagógica/gestora —
            de pesquisador, jornalista, conselheiro ou diretor escolar — sem exigir cadastro
            para navegar e sem mediação proprietária dos números.
          </p>

          <Section titulo="Fontes de dados">
            <p className="mb-3">
              Todos os dados vêm de bases públicas oficiais. Nenhum número é estimado ou imputado
              pelo Radar — quando uma fonte não tem o dado, a página exibe "dado não disponível".
            </p>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong>Saeb (INEP):</strong> distribuição de proficiência por nível em Língua
                Portuguesa e Matemática no 5º ano EF, 9º ano EF e 3º ano EM. Bienal (anos ímpares),
                cobertura nacional, por escola.
              </li>
              <li>
                <strong>Ideb (INEP):</strong> índice síntese que combina aprendizado (Saeb) com
                fluxo escolar (taxas de rendimento). Mostramos a série histórica por escola e a
                meta INEP correspondente quando disponíveis.
              </li>
              <li>
                <strong>ICA — Indicador Criança Alfabetizada (INEP):</strong> percentual de
                crianças avaliadas no 2º ano EF que demonstram domínio das habilidades esperadas.
                Anual, por município e rede administrativa.
              </li>
              <li>
                <strong>SARESP (SEDUC-SP):</strong> microdados oficiais do Sistema de Avaliação de
                Rendimento Escolar de SP. Disponível por escola, ano, série e disciplina nas
                edições <strong>2023, 2024 e 2025</strong>. Como o SARESP usa código próprio da
                rede, o cruzamento com o cadastro INEP é feito por similaridade de nome+município
                (heurística Jaccard) — escolas onde o casamento não atinge confiança mínima são
                omitidas.
              </li>
              <li>
                <strong>Censo Escolar (INEP):</strong> cadastro nacional anual com 213 indicadores
                de infraestrutura física (dependências, equipamentos, acessibilidade) e
                quantitativos de matrícula. Usado para situar a estrutura do prédio e os recursos
                disponíveis em cada escola.
              </li>
              <li>
                <strong>FUNDEB (Tesouro Nacional / FNDE):</strong> repasses mensais agregados
                anualmente por município, incluindo a parcela de complementação da União.
                Relevante para entender a capacidade de financiamento da rede municipal.
              </li>
              <li>
                <strong>PDDE (FNDE):</strong> Programa Dinheiro Direto na Escola — repasses
                discricionários por escola (ou agregados por município, conforme disponibilidade
                da fonte), saldos e status da prestação de contas.
              </li>
            </ul>
          </Section>

          <Section titulo="Cobertura geográfica e temporal">
            <p>
              O Radar começou com cobertura piloto restrita à microrregião de Irecê (BA) e hoje
              opera em <strong>cobertura nacional</strong> para Saeb, Ideb, ICA, Censo Escolar,
              FUNDEB e PDDE. SARESP é específico do estado de São Paulo, com séries de 2023 a
              2025. Onde uma fonte não cobre uma escola/município (por exemplo, SARESP fora de
              SP, ou Saeb de uma escola que não foi avaliada na edição), a seção correspondente
              não aparece — em vez de inventar.
            </p>
          </Section>

          <Section titulo="Comparações">
            <p>
              Os percentuais por nível são apresentados ao lado de quatro benchmarks oficiais:
            </p>
            <ul className="space-y-2 list-disc pl-5 mt-3">
              <li>
                <strong>Escolas similares</strong> — agrupamento INEP por microrregião + zona
                (urbana/rural) + INSE próximo. <em>É a comparação mais justa</em>: controla por
                contexto socioeconômico e geográfico.
              </li>
              <li><strong>Município</strong> — média de todas as escolas do município.</li>
              <li><strong>Estado (UF)</strong> — média estadual.</li>
              <li><strong>Brasil</strong> — média nacional.</li>
            </ul>
            <p className="mt-3">
              Quando uma escola está significativamente abaixo de escolas similares, isso sinaliza
              um problema gerencial/pedagógico — não contextual. Ao contrário, escolas acima do
              padrão de pares comparáveis indicam boas práticas que merecem documentação.
            </p>
          </Section>

          <Section titulo="Escala de níveis (cumulativa)">
            <p>
              Cada disciplina e etapa tem uma escala numérica dividida em níveis. <strong>A escala
              é cumulativa:</strong> um estudante classificado no nível N domina também as
              habilidades dos níveis 0 a N−1. Os níveis variam:
            </p>
            <ul className="space-y-1 list-disc pl-5 mt-3 text-sm">
              <li>LP 5º EF: 0–9 (10 níveis)</li>
              <li>LP 9º EF: 0–8 (9 níveis)</li>
              <li>Mat 5º EF: 0–10 (11 níveis)</li>
              <li>Mat 9º EF: 0–9 (10 níveis)</li>
              <li>LP/Mat 3º EM: variam conforme edição</li>
            </ul>
            <p className="mt-3">
              <strong>Nível 0</strong> indica desempenho insuficiente — percentuais altos no nível 0
              são o indicador mais imediato de problema de aprendizagem.
            </p>
          </Section>

          <Section titulo="INSE — Indicador de Nível Socioeconômico">
            <p>
              Calculado pelo INEP a partir da escolaridade dos pais e posse de bens/serviços das
              famílias. Vai do <strong>Grupo 1</strong> (NSE mais alto) ao <strong>Grupo 6</strong>{' '}
              (NSE mais baixo). A escala é <em>invertida</em> em relação à intuição usual.
            </p>
          </Section>

          <Section titulo="Análise por IA — limites e salvaguardas">
            <p>
              Cada página tem uma leitura institucional gerada por IA <strong>a partir
              exclusivamente dos dados estruturados</strong> mostrados na página. Regras rígidas:
            </p>
            <ul className="space-y-2 list-disc pl-5 mt-3">
              <li>A IA não inventa números. Todo dado citado tem ano e fonte declarados.</li>
              <li>Quando um dado não está disponível, a IA escreve "dado não disponível" — não preenche lacunas com estimativa.</li>
              <li>A análise é cacheada por hash SHA-256 do conteúdo de entrada. Se os números não mudaram, o texto não muda — garantindo reprodutibilidade.</li>
              <li>O modelo recebe instruções para não emitir juízo sobre indivíduos (professores, gestores, alunos). Toda observação é dirigida ao agregado escola/município.</li>
              <li>Disclaimer fixo: "Análise gerada a partir de dados públicos. Valores oficiais devem ser consultados nos portais governamentais."</li>
            </ul>
          </Section>

          <Section titulo="Atualização dos dados">
            <p>
              Os dados são reimportados sempre que cada fonte publica nova edição:
            </p>
            <ul className="space-y-1 list-disc pl-5 mt-3">
              <li>Saeb: bienal (2019, 2021, 2023, 2025…)</li>
              <li>Ideb: divulgado pelo INEP no ano seguinte ao Saeb</li>
              <li>ICA: anual</li>
              <li>SARESP: anual (SP)</li>
              <li>Censo Escolar: anual</li>
              <li>FUNDEB e PDDE: atualização mensal/trimestral, consolidados ao fim de cada exercício</li>
            </ul>
            <p className="mt-3">
              <strong>Observação sobre 2021:</strong> a edição do Saeb 2021 foi aplicada durante a
              pandemia de Covid-19. Quedas observadas entre 2019 e 2021 refletem efeito sistêmico
              nacional, não deterioração isolada de uma escola específica.
            </p>
          </Section>

          <Section titulo="Como citar o Radar">
            <p>
              Para uso em pesquisas, reportagens e relatórios institucionais, citar como:
            </p>
            <p className="mt-3 px-4 py-3 rounded-lg border border-white/[0.08] text-sm font-mono text-white/80"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              VERTHO MENTOR IA. Radar Vertho — diagnóstico público da educação. Disponível em:
              radar.vertho.ai. Acesso em: [data].
            </p>
            <p className="mt-3">
              Para uso de tabelas e gráficos, agradecemos a referência à fonte primária (INEP, FNDE
              ou Tesouro Nacional, conforme o caso) e o link para a página correspondente do Radar.
              Cada página tem botão "Citar" que copia a referência completa para a área de
              transferência.
            </p>
          </Section>

          <Section titulo="Limites conhecidos">
            <p>
              Transparência sobre o que o Radar <em>ainda não faz</em>:
            </p>
            <ul className="space-y-1 list-disc pl-5 mt-3">
              <li>Avaliações estaduais fora de SP (SAEPE-PE, SPAECE-CE, SAERS-RS, Paraná Avaliação etc.) — em estudo para próximas edições.</li>
              <li>Microdados de aluno (raça/cor, gênero, NEE) — fora de escopo por LGPD.</li>
              <li>Pareamento perfeito SARESP↔INEP em 100% dos casos — a heurística cobre a maioria, mas não tudo.</li>
              <li>Ranking público de escolas — explicitamente não publicamos. Comparações são por pares similares, não classificatórias.</li>
            </ul>
          </Section>

          <Section titulo="Privacidade e LGPD">
            <p>
              Os dados exibidos no Radar são <strong>públicos</strong>, publicados pelo INEP. O
              Radar não armazena dados pessoais de estudantes, professores ou famílias.
            </p>
            <p className="mt-3">
              Quando você solicita um diagnóstico em PDF, coletamos nome, e-mail, cargo e
              organização para fins de relacionamento comercial. Você pode solicitar exclusão a
              qualquer momento via <a href="mailto:dpo@vertho.ai" className="text-cyan-400 hover:underline">dpo@vertho.ai</a>.
            </p>
          </Section>

          <Section titulo="Equipe e contato">
            <p>
              O Radar é desenvolvido pela <a href="https://vertho.ai" className="text-cyan-400 hover:underline">Vertho Mentor IA</a>{' '}
              como funil autoral de diagnóstico público. Sugestões, correções e parcerias são
              bem-vindas: <a href="mailto:radar@vertho.ai" className="text-cyan-400 hover:underline">radar@vertho.ai</a>.
            </p>
          </Section>
        </div>
      </article>

      <RadarFooter />
    </main>
  );
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="pt-2">
      <h2 className="text-white text-xl font-bold mb-3 mt-8">{titulo}</h2>
      {children}
    </section>
  );
}
