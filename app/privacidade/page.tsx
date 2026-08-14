import type { Metadata } from 'next';

/**
 * Termos de Uso e Política de Privacidade — página pública.
 *
 * Vive no app (`app.vertho.ai/privacidade`) e não no site institucional porque
 * `vertho.ai` é servido pelo Gamma, fora deste repositório. A vantagem de estar
 * aqui é ficar versionada junto do código que ela descreve: quando um
 * subprocessador entra ou sai, a mudança aparece no mesmo diff.
 *
 * O conteúdo foi conferido contra o levantamento técnico em
 * `docs/FLUXO-DE-DADOS-PESSOAIS.md` (14/08/2026) — em particular os
 * subprocessadores e o fato de que nome e avaliação de desempenho trafegam para
 * provedores de IA.
 *
 * ⚠️ ATUALIZAR AQUI QUANDO MUDAR O CÓDIGO: a seção 6 lista fornecedores reais.
 * Trocar de provedor de IA, de e-mail ou de WhatsApp sem atualizar esta lista
 * faz a página descrever um sistema que não existe mais.
 */

/** Identificação legal do controlador/operador. */
const EMPRESA = {
  razaoSocial: 'VERTHO.AI GESTÃO DA APRENDIZAGEM LTDA',
  cnpj: '62.058.419/0001-51',
  endereco: 'R. Luzia Latorre de Oliveira Lima, 243 — Jundiaí/SP',
  emailPrivacidade: 'contato@vertho.ai',
  encarregado: 'Rodrigo Naves',
  emailEncarregado: 'contato@vertho.ai',
};

const ATUALIZACAO = '14 de agosto de 2026';

export const metadata: Metadata = {
  title: 'Termos de Uso e Política de Privacidade | Vertho',
  description:
    'Condições de uso da plataforma Vertho e informações sobre coleta, uso, armazenamento e compartilhamento de dados pessoais.',
};

function Secao({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-10" id={`secao-${n}`}>
      <h2 className="text-lg font-semibold text-slate-900 mb-3">
        {n}. {titulo}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {itens.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export default function PoliticaPrivacidadePage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <header className="border-b border-slate-200 pb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Termos de Uso e Política de Privacidade
          </h1>
          <p className="mt-2 text-sm text-slate-500">Última atualização: {ATUALIZACAO}</p>
        </header>

        <div className="mt-8 space-y-3 text-[15px] leading-relaxed text-slate-700">
          <p>
            A <strong>Vertho</strong> valoriza a privacidade, a transparência e a proteção dos dados
            pessoais tratados em sua plataforma e em seus canais digitais.
          </p>
          <p>
            Este documento explica as condições de utilização da plataforma Vertho e como os dados
            pessoais podem ser coletados, utilizados, armazenados e compartilhados durante a
            utilização de nossos serviços.
          </p>
          <p>
            Ao acessar ou utilizar a plataforma, o usuário declara estar ciente destes Termos e desta
            Política de Privacidade.
          </p>
        </div>

        <Secao n={1} titulo="Sobre a Vertho">
          <p>
            A Vertho é uma plataforma voltada ao desenvolvimento humano e profissional, que utiliza
            recursos digitais e inteligência artificial para apoiar processos como mapeamento
            comportamental, avaliação de competências, desenvolvimento individual, trilhas de
            aprendizagem, interação com mentores virtuais e acompanhamento da evolução profissional.
          </p>
          <p>
            A plataforma pode ser disponibilizada diretamente pela Vertho ou por organizações
            contratantes, como empresas, instituições de ensino, órgãos públicos e outras
            organizações.
          </p>
        </Secao>

        <Secao n={2} titulo="Quem é responsável pelos dados pessoais">
          <p>A responsabilidade pelo tratamento dos dados depende da relação existente com o titular.</p>
          <p>
            Quando uma empresa, instituição de ensino, órgão público ou outra organização contrata a
            Vertho e cadastra seus colaboradores, profissionais ou participantes na plataforma, essa
            organização normalmente define as finalidades do tratamento e atua como{' '}
            <strong>Controladora dos Dados Pessoais</strong>, enquanto a Vertho realiza o tratamento
            necessário à prestação dos serviços na condição de <strong>Operadora</strong>.
          </p>
          <p>
            Em determinadas atividades próprias da Vertho, como relacionamento comercial, atendimento,
            segurança da plataforma e administração de seus próprios canais digitais, a Vertho poderá
            atuar como <strong>Controladora</strong>.
          </p>
          <p>
            Os direitos e responsabilidades de cada parte também poderão ser detalhados nos contratos
            celebrados entre a Vertho e seus clientes.
          </p>
        </Secao>

        <Secao n={3} titulo="Dados pessoais que podem ser tratados">
          <h3 className="font-semibold text-slate-900 pt-2">3.1. Dados cadastrais e profissionais</h3>
          <Lista
            itens={[
              'nome completo;',
              'e-mail;',
              'telefone e WhatsApp;',
              'fotografia ou imagem de perfil;',
              'cargo ou função;',
              'nome e dados de contato do gestor;',
              'empresa, instituição ou organização à qual o usuário está vinculado.',
            ]}
          />
          <p>
            Em muitos casos, esses dados são fornecidos diretamente pela organização contratante e não
            pelo próprio titular.
          </p>

          <h3 className="font-semibold text-slate-900 pt-2">
            3.2. Dados relacionados ao desenvolvimento profissional
          </h3>
          <p>
            A plataforma poderá tratar informações produzidas durante processos de avaliação e
            desenvolvimento, incluindo:
          </p>
          <Lista
            itens={[
              'respostas a questionários e situações simuladas;',
              'avaliações de competências;',
              'notas, níveis e indicadores de desenvolvimento;',
              'perfil ou tendências comportamentais;',
              'planos individuais de desenvolvimento;',
              'trilhas de aprendizagem;',
              'histórico de evolução;',
              'conteúdos e respostas fornecidos durante interações com a plataforma;',
              'conversas mantidas com recursos de mentoria baseados em inteligência artificial.',
            ]}
          />
          <p>
            Essas informações podem estar relacionadas ao desempenho, desenvolvimento ou comportamento
            profissional do usuário e, por isso, são tratadas de acordo com as finalidades
            estabelecidas para cada projeto.
          </p>

          <h3 className="font-semibold text-slate-900 pt-2">3.3. Dados de comunicação e acesso</h3>
          <Lista
            itens={[
              'histórico de mensagens e notificações;',
              'canal utilizado para comunicação;',
              'registros de envio, entrega e leitura;',
              'respostas enviadas por WhatsApp ou outros canais integrados;',
              'telefone utilizado para autenticação;',
              'registros relacionados a códigos de acesso;',
              'informações técnicas necessárias ao envio de notificações para dispositivos e navegadores.',
            ]}
          />

          <h3 className="font-semibold text-slate-900 pt-2">3.4. Dados comerciais</h3>
          <p>
            Nos canais comerciais da Vertho poderão ser tratados dados profissionais de representantes
            de empresas e instituições, como nome, cargo, empresa, e-mail profissional, telefone e
            informações relacionadas ao relacionamento comercial.
          </p>
        </Secao>

        <Secao n={4} titulo="Para que utilizamos os dados">
          <p>Os dados pessoais poderão ser tratados, conforme o contexto, para:</p>
          <Lista
            itens={[
              'identificar e autenticar usuários;',
              'disponibilizar o acesso à plataforma;',
              'executar serviços contratados pela organização responsável pelo usuário;',
              'realizar avaliações de competências e mapeamentos comportamentais;',
              'gerar relatórios e indicadores de desenvolvimento;',
              'elaborar planos e trilhas individuais de desenvolvimento;',
              'personalizar experiências de aprendizagem;',
              'permitir interações com recursos de inteligência artificial;',
              'enviar notificações, conteúdos, códigos de acesso e comunicações operacionais;',
              'produzir conteúdos e materiais relacionados ao desenvolvimento profissional;',
              'acompanhar a utilização e o funcionamento da plataforma;',
              'prestar suporte aos usuários e às organizações contratantes;',
              'prevenir fraudes, acessos indevidos e outros usos não autorizados;',
              'manter a segurança e a integridade dos sistemas;',
              'administrar contratos e relacionamentos comerciais;',
              'atender obrigações legais, regulatórias ou determinações de autoridades competentes.',
            ]}
          />
          <p>
            A base legal aplicável ao tratamento dependerá da finalidade, da relação entre o titular e
            a organização contratante e das demais circunstâncias de cada operação.
          </p>
        </Secao>

        <Secao n={5} titulo="Uso de Inteligência Artificial">
          <p>A inteligência artificial faz parte de determinadas funcionalidades da Vertho.</p>
          <p>
            Para gerar análises, relatórios, recomendações, conteúdos ou outros recursos da
            plataforma, algumas informações poderão ser encaminhadas a provedores especializados de
            tecnologia e inteligência artificial.
          </p>
          <p>
            Dependendo da funcionalidade utilizada, essas informações podem incluir, entre outros
            dados:
          </p>
          <Lista
            itens={[
              'nome do usuário;',
              'empresa ou instituição;',
              'cargo ou função;',
              'respostas fornecidas à plataforma;',
              'avaliações de competências;',
              'informações necessárias à geração de relatórios;',
              'conteúdos das interações mantidas com recursos de inteligência artificial.',
            ]}
          />
          <p>
            Atualmente, a infraestrutura tecnológica da plataforma pode utilizar serviços de
            fornecedores especializados, incluindo provedores de modelos de inteligência artificial,
            processamento de linguagem, geração de conteúdo e busca semântica. Entre esses
            fornecedores podem estar <strong>Anthropic, OpenAI, Google e Voyage</strong>, além de
            outros que venham a ser utilizados tecnicamente para finalidades equivalentes.
          </p>
          <p>
            A Vertho procura limitar o envio de informações ao necessário para a execução da
            funcionalidade correspondente.
          </p>
          <p>
            Os resultados produzidos por inteligência artificial são instrumentos de apoio ao processo
            de desenvolvimento e devem ser interpretados dentro do contexto da metodologia e das
            informações disponíveis.
          </p>
          <p>
            Quando aplicável, o titular poderá solicitar informações sobre tratamentos automatizados e
            exercer os direitos assegurados pela legislação de proteção de dados.
          </p>
        </Secao>

        <Secao n={6} titulo="Compartilhamento de dados com fornecedores">
          <p>Para operar a plataforma, a Vertho utiliza prestadores de serviços especializados.</p>
          <p>
            Dependendo da funcionalidade utilizada, dados pessoais poderão ser processados por
            fornecedores responsáveis por:
          </p>

          <h3 className="font-semibold text-slate-900 pt-2">Infraestrutura e armazenamento</h3>
          <Lista itens={['Supabase;', 'Vercel.']} />

          <h3 className="font-semibold text-slate-900 pt-2">
            Inteligência artificial e processamento de conteúdo
          </h3>
          <Lista itens={['Anthropic;', 'OpenAI;', 'Google;', 'Voyage.']} />

          <h3 className="font-semibold text-slate-900 pt-2">Comunicação</h3>
          <Lista
            itens={[
              'Meta, por meio da infraestrutura do WhatsApp;',
              'Z-API, enquanto aplicável às integrações existentes;',
              'Resend, para envio de e-mails;',
              'Twilio, para serviços de comunicação e autenticação por SMS;',
              'serviços de Web Push utilizados pelos navegadores.',
            ]}
          />

          <h3 className="font-semibold text-slate-900 pt-2">Vídeo e conteúdo audiovisual</h3>
          <Lista itens={['Bunny Stream;', 'HeyGen.']} />

          <p>
            Esses fornecedores recebem apenas os dados relacionados às funcionalidades que executam e
            atuam de acordo com suas respectivas atribuições e condições contratuais.
          </p>
          <p>
            A relação de fornecedores poderá ser atualizada sempre que necessário para a evolução,
            segurança ou funcionamento da plataforma.
          </p>
          <p>
            <strong>A Vertho não comercializa dados pessoais de usuários.</strong>
          </p>
        </Secao>

        <Secao n={7} titulo="Transferência internacional de dados">
          <p>
            Alguns dos fornecedores tecnológicos utilizados pela Vertho possuem infraestrutura ou
            operações internacionais. Por essa razão, determinadas operações poderão envolver
            armazenamento, processamento ou transferência de dados pessoais para outros países.
          </p>
          <p>
            Quando houver transferência internacional de dados, deverão ser observadas as exigências
            estabelecidas pela Lei Geral de Proteção de Dados e pela regulamentação aplicável.
          </p>
          <p>
            Informações adicionais sobre os mecanismos utilizados em determinada operação poderão ser
            solicitadas por meio do canal de privacidade indicado nesta Política.
          </p>
        </Secao>

        <Secao n={8} titulo="Armazenamento e retenção">
          <p>
            Os dados pessoais poderão permanecer armazenados pelo período necessário para a execução
            dos serviços, cumprimento das instruções do Controlador, atendimento de obrigações legais
            ou exercício regular de direitos.
          </p>
          <p>Algumas categorias possuem regras técnicas específicas de retenção. Atualmente:</p>
          <Lista
            itens={[
              'mensagens de sessões de chat abandonadas podem ser eliminadas após aproximadamente 48 horas de inatividade;',
              'cópias técnicas de backup possuem ciclo de rotação de aproximadamente 7 dias.',
            ]}
          />
          <p>
            Para outras categorias de informações, os períodos de retenção podem variar de acordo com
            a finalidade do tratamento, o contrato celebrado com a organização responsável e as
            necessidades legais ou operacionais aplicáveis.
          </p>
          <p>
            A Vertho poderá manter determinados registros quando sua conservação for necessária para
            cumprimento de obrigação legal, exercício regular de direitos, segurança da plataforma ou
            outra hipótese permitida pela legislação.
          </p>
        </Secao>

        <Secao n={9} titulo="Segurança das informações">
          <p>
            A Vertho adota medidas técnicas e administrativas destinadas a proteger os dados pessoais
            contra acessos não autorizados e situações acidentais ou ilícitas de perda, alteração,
            destruição, comunicação ou utilização inadequada.
          </p>
          <p>
            Nenhum ambiente tecnológico, entretanto, pode ser considerado absolutamente imune a
            incidentes.
          </p>
          <p>
            Caso seja identificado incidente de segurança envolvendo dados pessoais, serão adotadas as
            providências aplicáveis de investigação, contenção, correção e comunicação, de acordo com
            as responsabilidades de cada agente de tratamento e a legislação aplicável.
          </p>
        </Secao>

        <Secao n={10} titulo="Direitos dos titulares">
          <p>Nos termos da legislação aplicável, o titular poderá solicitar, entre outros direitos:</p>
          <Lista
            itens={[
              'confirmação da existência de tratamento de seus dados;',
              'acesso aos dados pessoais tratados;',
              'correção de dados incompletos, inexatos ou desatualizados;',
              'informações sobre compartilhamento de dados;',
              'anonimização, bloqueio ou eliminação de dados nas hipóteses legalmente aplicáveis;',
              'portabilidade, quando cabível;',
              'revogação do consentimento, quando essa for a base utilizada para o tratamento;',
              'oposição ao tratamento nas hipóteses previstas em lei;',
              'informações sobre decisões tomadas exclusivamente por tratamento automatizado;',
              'revisão de decisões automatizadas que afetem seus interesses, quando aplicável.',
            ]}
          />
          <p>
            Quando a Vertho atuar como <strong>Operadora</strong>, determinadas solicitações deverão
            ser analisadas pela organização que atua como <strong>Controladora dos dados</strong>.
            Nessas situações, a Vertho poderá encaminhar ou auxiliar no atendimento da solicitação, de
            acordo com as instruções recebidas do Controlador.
          </p>
          <p>
            Para proteger os próprios titulares, poderá ser necessário confirmar a identidade do
            solicitante antes do atendimento de determinados pedidos.
          </p>
        </Secao>

        <Secao n={11} titulo="Dados fornecidos pela organização contratante">
          <p>
            Quando o acesso à Vertho for disponibilizado por uma empresa, instituição de ensino, órgão
            público ou outra organização, os dados iniciais do usuário poderão ter sido fornecidos
            diretamente por essa organização.
          </p>
          <p>
            Nesses casos, dúvidas relacionadas às razões do cadastramento, às finalidades
            institucionais do tratamento ou à permanência do usuário no programa poderão também ser
            direcionadas à organização responsável.
          </p>
          <p>
            A Vertho tratará esses dados dentro dos limites necessários à execução dos serviços
            contratados e das instruções recebidas do respectivo Controlador.
          </p>
        </Secao>

        <Secao n={12} titulo="Comunicações">
          <p>
            A plataforma poderá utilizar diferentes canais para comunicações relacionadas à
            experiência do usuário, incluindo e-mail, WhatsApp, SMS, notificações no navegador ou
            dispositivo e comunicações dentro da própria plataforma.
          </p>
          <p>
            Essas mensagens poderão envolver autenticação, lembretes, conteúdos de desenvolvimento,
            notificações sobre atividades, suporte ou outras comunicações relacionadas ao serviço.
          </p>
        </Secao>

        <Secao n={13} titulo="Condições de utilização da plataforma">
          <p>
            O acesso à Vertho é pessoal e, quando aplicável, vinculado ao usuário autorizado pela
            organização contratante. O usuário compromete-se a:
          </p>
          <Lista
            itens={[
              'fornecer informações verdadeiras quando solicitado;',
              'manter seus meios de acesso protegidos;',
              'não compartilhar códigos de autenticação;',
              'não tentar acessar informações pertencentes a outros usuários ou organizações;',
              'não utilizar a plataforma para práticas ilícitas;',
              'não tentar comprometer, testar indevidamente ou contornar mecanismos de segurança;',
              'respeitar direitos autorais, propriedade intelectual e demais direitos relacionados aos conteúdos disponibilizados.',
            ]}
          />
          <p>
            A Vertho poderá restringir ou suspender acessos quando identificar uso indevido, risco de
            segurança, violação destes Termos ou determinação da organização responsável pelo usuário.
          </p>
        </Secao>

        <Secao n={14} titulo="Conteúdo, avaliações e inteligência artificial">
          <p>
            Avaliações, indicadores, perfis, planos de desenvolvimento e conteúdos produzidos pela
            plataforma têm finalidade de apoiar processos de desenvolvimento humano e profissional.
          </p>
          <p>
            Essas informações devem ser interpretadas considerando seu contexto, metodologia,
            finalidade e eventuais limitações técnicas.
          </p>
          <p>
            Funcionalidades que utilizam inteligência artificial podem produzir respostas
            probabilísticas ou apresentar imprecisões. Por essa razão, informações geradas
            automaticamente não devem ser consideradas isoladamente como garantia de desempenho futuro
            ou verdade absoluta sobre características pessoais ou profissionais de um indivíduo.
          </p>
        </Secao>

        <Secao n={15} titulo="Propriedade intelectual">
          <p>
            A plataforma Vertho, sua tecnologia, identidade visual, metodologias, softwares,
            materiais, textos, estruturas, relatórios, elementos gráficos e demais conteúdos próprios
            são protegidos pela legislação aplicável.
          </p>
          <p>
            O acesso à plataforma não transfere ao usuário direitos de propriedade intelectual sobre
            esses elementos.
          </p>
          <p>
            Conteúdos poderão ser utilizados pelos usuários e organizações contratantes apenas nos
            limites previstos no respectivo contrato ou expressamente autorizados pela Vertho.
          </p>
        </Secao>

        <Secao n={16} titulo="Disponibilidade e alterações na plataforma">
          <p>
            A Vertho busca manter seus serviços disponíveis e em funcionamento adequado, mas poderá
            realizar atualizações, manutenções, correções e alterações técnicas sempre que necessário.
          </p>
          <p>
            Funcionalidades poderão ser modificadas ao longo do tempo em razão da evolução do produto,
            requisitos técnicos, segurança, legislação ou necessidades dos clientes.
          </p>
        </Secao>

        <Secao n={17} titulo="Alterações destes Termos e desta Política">
          <p>Este documento poderá ser atualizado para refletir mudanças:</p>
          <Lista
            itens={[
              'na legislação;',
              'nas orientações de autoridades competentes;',
              'nas funcionalidades da plataforma;',
              'nos fornecedores tecnológicos;',
              'nas práticas de tratamento de dados;',
              'na estrutura dos serviços da Vertho.',
            ]}
          />
          <p>A data da versão mais recente será indicada no início deste documento.</p>
          <p>
            Quando uma alteração for relevante para os direitos dos titulares, poderão ser adotadas
            medidas adicionais de comunicação.
          </p>
        </Secao>

        <Secao n={18} titulo="Contato e exercício de direitos">
          <p>
            Para dúvidas relacionadas à privacidade, proteção de dados ou exercício dos direitos
            previstos nesta Política, entre em contato:
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-900">Vertho</p>
            <p>
              <span className="text-slate-500">Razão social:</span> {EMPRESA.razaoSocial}
            </p>
            <p>
              <span className="text-slate-500">CNPJ:</span> {EMPRESA.cnpj}
            </p>
            <p>
              <span className="text-slate-500">Endereço:</span> {EMPRESA.endereco}
            </p>
            <p className="mt-3">
              <span className="text-slate-500">Canal de Privacidade:</span>{' '}
              <a className="text-indigo-700 underline" href={`mailto:${EMPRESA.emailPrivacidade}`}>
                {EMPRESA.emailPrivacidade}
              </a>
            </p>
            <p className="mt-3">
              <span className="text-slate-500">Encarregado pelo Tratamento de Dados / DPO:</span>{' '}
              {EMPRESA.encarregado}
            </p>
            <p>
              <a className="text-indigo-700 underline" href={`mailto:${EMPRESA.emailEncarregado}`}>
                {EMPRESA.emailEncarregado}
              </a>
            </p>
          </div>
          <p>
            Quando a Vertho estiver atuando como Operadora, poderá ser necessário encaminhar a
            solicitação à organização responsável pelo tratamento dos dados.
          </p>
        </Secao>

        <Secao n={19} titulo="Legislação aplicável">
          <p>
            Estes Termos e esta Política deverão ser interpretados de acordo com a legislação
            brasileira aplicável, especialmente as normas relacionadas à proteção de dados pessoais,
            privacidade e utilização de serviços digitais.
          </p>
        </Secao>

        <footer className="mt-14 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <p>Vertho — Termos de Uso e Política de Privacidade · {ATUALIZACAO}</p>
        </footer>
      </div>
    </main>
  );
}
