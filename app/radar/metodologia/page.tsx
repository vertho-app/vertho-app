import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RadarHeader, RadarFooter } from '../_components/radar-header';

export const metadata: Metadata = {
  title: 'Metodologia',
  description:
    'Como o Radar Vertho consolida indicadores oficiais do INEP, quais fontes usa, como compara escolas e quais limites a análise tem.',
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
            O Radar Vertho é uma plataforma <strong>pública e gratuita</strong> que organiza
            indicadores educacionais oficiais do INEP por escola e município, com leitura
            contextualizada e fontes citadas em cada página.
          </p>

          <Section titulo="Fontes de dados">
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong>Saeb (INEP):</strong> distribuição de proficiência por nível em Língua
                Portuguesa e Matemática, no 5º ano EF, 9º ano EF e 3º ano EM. Bienal (anos ímpares).
              </li>
              <li>
                <strong>ICA — Indicador Criança Alfabetizada (INEP):</strong> percentual de crianças
                avaliadas que demonstram domínio das habilidades esperadas para o 2º ano do EF.
                Anual, por município e rede administrativa.
              </li>
              <li>
                <strong>Ideb (INEP):</strong> índice síntese que combina aprendizado (Saeb) com
                fluxo escolar (taxas de rendimento). Quando os dados de origem são confiáveis e
                cruzam com a escola correspondente, o Ideb é exibido. Caso contrário, omitido.
              </li>
            </ul>
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

          <Section titulo="Análise por IA — limites">
            <p>
              Cada página tem uma leitura institucional gerada por IA <strong>a partir
              exclusivamente dos dados estruturados</strong> mostrados na página. Regras rígidas:
            </p>
            <ul className="space-y-2 list-disc pl-5 mt-3">
              <li>A IA não inventa números. Todo dado citado precisa de ano e fonte.</li>
              <li>Quando um dado não está disponível, a IA escreve "dado não disponível" — não preenche lacunas.</li>
              <li>A análise é cacheada por SHA-256 dos dados. Se os números não mudaram, o texto também não muda.</li>
              <li>Disclaimer fixo: "Análise gerada a partir de dados públicos do INEP. Valores oficiais devem ser consultados em portais governamentais."</li>
            </ul>
          </Section>

          <Section titulo="Atualização dos dados">
            <p>
              Os dados são importados a partir das publicações oficiais do INEP. O Saeb é bienal
              (2019, 2021, 2023, 2025), o ICA é anual e o Censo Escolar é anual. Cada conjunto é
              atualizado quando o INEP publica nova edição.
            </p>
            <p className="mt-3">
              <strong>Observação sobre 2021:</strong> a edição do Saeb 2021 foi aplicada durante a
              pandemia de Covid-19. Quedas observadas entre 2019 e 2021 refletem efeito sistêmico
              nacional, não deterioração isolada da escola.
            </p>
          </Section>

          <Section titulo="O que NÃO está aqui (ainda)">
            <p>
              A versão V1 do Radar prioriza profundidade sobre amplitude. Estão fora desta versão:
            </p>
            <ul className="space-y-1 list-disc pl-5 mt-3">
              <li>Censo Escolar completo (302 colunas de infraestrutura) — V2.</li>
              <li>Comparativo lado a lado entre escolas/municípios — V2.</li>
              <li>Cobertura nacional — V1.5+ (V1 cobre microrregião de Irecê/BA).</li>
              <li>Backlinks acadêmicos e ranking estadual — V1.5+.</li>
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
