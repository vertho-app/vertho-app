# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-crud.spec.js >> Admin Competencias CRUD >> SANDBOX: create, verify, and delete test competency
- Location: tests\admin-crud.spec.js:129:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=TESTE_PLAYWRIGHT_1775646670176')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=TESTE_PLAYWRIGHT_1775646670176')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - button [ref=e6]:
          - img [ref=e7]
        - generic [ref=e9]:
          - heading "Competencias" [level=1] [ref=e10]:
            - img [ref=e11]
            - text: Competencias
          - paragraph [ref=e14]: CRUD de competencias por empresa
      - generic [ref=e15]:
        - button "Ver Base" [ref=e16]:
          - img [ref=e17]
          - text: Ver Base
        - button "Nova" [ref=e20]:
          - img [ref=e21]
          - text: Nova
    - generic [ref=e23]:
      - combobox [ref=e24]:
        - option "Selecione uma empresa..."
        - option "Boehringer Ingelheim" [selected]
        - option "Empresa Padrão"
        - option "PLAYWRIGHT_TEST_mnpy5mjz"
        - option "R Naves"
        - option "teste"
        - option "teste2"
        - option "teste3"
      - img
    - table [ref=e27]:
      - rowgroup [ref=e28]:
        - row "Cod Nome Pilar Cargo Descricao Acoes" [ref=e29]:
          - columnheader "Cod" [ref=e30]
          - columnheader "Nome" [ref=e31]
          - columnheader "Pilar" [ref=e32]
          - columnheader "Cargo" [ref=e33]
          - columnheader "Descricao" [ref=e34]
          - columnheader "Acoes" [ref=e35]
      - rowgroup [ref=e36]:
        - row "CF03 Aprendizado Contínuo Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de aprender com feedback" [ref=e37]:
          - cell "CF03" [ref=e38]
          - cell "Aprendizado Contínuo" [ref=e39]
          - cell "Conhecimento e Desenvolvimento" [ref=e40]
          - cell "Consultor de Fibrose" [ref=e41]
          - cell "Capacidade de aprender com feedback" [ref=e42]
          - cell [ref=e43]:
            - generic [ref=e44]:
              - button [ref=e45]:
                - img [ref=e46]
              - button [ref=e49]:
                - img [ref=e50]
        - row "CF03 Aprendizado Contínuo Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de aprender com feedback" [ref=e53]:
          - cell "CF03" [ref=e54]
          - cell "Aprendizado Contínuo" [ref=e55]
          - cell "Conhecimento e Desenvolvimento" [ref=e56]
          - cell "Consultor de Fibrose" [ref=e57]
          - cell "Capacidade de aprender com feedback" [ref=e58]
          - cell [ref=e59]:
            - generic [ref=e60]:
              - button [ref=e61]:
                - img [ref=e62]
              - button [ref=e65]:
                - img [ref=e66]
        - row "CF03 Aprendizado Contínuo Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de aprender com feedback" [ref=e69]:
          - cell "CF03" [ref=e70]
          - cell "Aprendizado Contínuo" [ref=e71]
          - cell "Conhecimento e Desenvolvimento" [ref=e72]
          - cell "Consultor de Fibrose" [ref=e73]
          - cell "Capacidade de aprender com feedback" [ref=e74]
          - cell [ref=e75]:
            - generic [ref=e76]:
              - button [ref=e77]:
                - img [ref=e78]
              - button [ref=e81]:
                - img [ref=e82]
        - row "CF03 Aprendizado Contínuo Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de aprender com feedback" [ref=e85]:
          - cell "CF03" [ref=e86]
          - cell "Aprendizado Contínuo" [ref=e87]
          - cell "Conhecimento e Desenvolvimento" [ref=e88]
          - cell "Consultor de Fibrose" [ref=e89]
          - cell "Capacidade de aprender com feedback" [ref=e90]
          - cell [ref=e91]:
            - generic [ref=e92]:
              - button [ref=e93]:
                - img [ref=e94]
              - button [ref=e97]:
                - img [ref=e98]
        - row "CF03 Aprendizado Contínuo Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de aprender com feedback" [ref=e101]:
          - cell "CF03" [ref=e102]
          - cell "Aprendizado Contínuo" [ref=e103]
          - cell "Conhecimento e Desenvolvimento" [ref=e104]
          - cell "Consultor de Fibrose" [ref=e105]
          - cell "Capacidade de aprender com feedback" [ref=e106]
          - cell [ref=e107]:
            - generic [ref=e108]:
              - button [ref=e109]:
                - img [ref=e110]
              - button [ref=e113]:
                - img [ref=e114]
        - row "CF03 Aprendizado Contínuo Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de aprender com feedback" [ref=e117]:
          - cell "CF03" [ref=e118]
          - cell "Aprendizado Contínuo" [ref=e119]
          - cell "Conhecimento e Desenvolvimento" [ref=e120]
          - cell "Consultor de Fibrose" [ref=e121]
          - cell "Capacidade de aprender com feedback" [ref=e122]
          - cell [ref=e123]:
            - generic [ref=e124]:
              - button [ref=e125]:
                - img [ref=e126]
              - button [ref=e129]:
                - img [ref=e130]
        - row "CF04 Colaboração e Relacionamento Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e133]:
          - cell "CF04" [ref=e134]
          - cell "Colaboração e Relacionamento" [ref=e135]
          - cell "Conhecimento e Desenvolvimento" [ref=e136]
          - cell "Consultor de Fibrose" [ref=e137]
          - cell "Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e138]
          - cell [ref=e139]:
            - generic [ref=e140]:
              - button [ref=e141]:
                - img [ref=e142]
              - button [ref=e145]:
                - img [ref=e146]
        - row "CF04 Colaboração e Relacionamento Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e149]:
          - cell "CF04" [ref=e150]
          - cell "Colaboração e Relacionamento" [ref=e151]
          - cell "Conhecimento e Desenvolvimento" [ref=e152]
          - cell "Consultor de Fibrose" [ref=e153]
          - cell "Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e154]
          - cell [ref=e155]:
            - generic [ref=e156]:
              - button [ref=e157]:
                - img [ref=e158]
              - button [ref=e161]:
                - img [ref=e162]
        - row "CF04 Colaboração e Relacionamento Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e165]:
          - cell "CF04" [ref=e166]
          - cell "Colaboração e Relacionamento" [ref=e167]
          - cell "Conhecimento e Desenvolvimento" [ref=e168]
          - cell "Consultor de Fibrose" [ref=e169]
          - cell "Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e170]
          - cell [ref=e171]:
            - generic [ref=e172]:
              - button [ref=e173]:
                - img [ref=e174]
              - button [ref=e177]:
                - img [ref=e178]
        - row "CF04 Colaboração e Relacionamento Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e181]:
          - cell "CF04" [ref=e182]
          - cell "Colaboração e Relacionamento" [ref=e183]
          - cell "Conhecimento e Desenvolvimento" [ref=e184]
          - cell "Consultor de Fibrose" [ref=e185]
          - cell "Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e186]
          - cell [ref=e187]:
            - generic [ref=e188]:
              - button [ref=e189]:
                - img [ref=e190]
              - button [ref=e193]:
                - img [ref=e194]
        - row "CF04 Colaboração e Relacionamento Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e197]:
          - cell "CF04" [ref=e198]
          - cell "Colaboração e Relacionamento" [ref=e199]
          - cell "Conhecimento e Desenvolvimento" [ref=e200]
          - cell "Consultor de Fibrose" [ref=e201]
          - cell "Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e202]
          - cell [ref=e203]:
            - generic [ref=e204]:
              - button [ref=e205]:
                - img [ref=e206]
              - button [ref=e209]:
                - img [ref=e210]
        - row "CF04 Colaboração e Relacionamento Conhecimento e Desenvolvimento Consultor de Fibrose Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e213]:
          - cell "CF04" [ref=e214]
          - cell "Colaboração e Relacionamento" [ref=e215]
          - cell "Conhecimento e Desenvolvimento" [ref=e216]
          - cell "Consultor de Fibrose" [ref=e217]
          - cell "Capacidade de colaborar com áreas internas e manter relacionamentos produtivos" [ref=e218]
          - cell [ref=e219]:
            - generic [ref=e220]:
              - button [ref=e221]:
                - img [ref=e222]
              - button [ref=e225]:
                - img [ref=e226]
        - row "CF02 Execução com Excelência Estratégia e Inteligência Consultor de Fibrose Capacidade de executar com disciplina e qualidade" [ref=e229]:
          - cell "CF02" [ref=e230]
          - cell "Execução com Excelência" [ref=e231]
          - cell "Estratégia e Inteligência" [ref=e232]
          - cell "Consultor de Fibrose" [ref=e233]
          - cell "Capacidade de executar com disciplina e qualidade" [ref=e234]
          - cell [ref=e235]:
            - generic [ref=e236]:
              - button [ref=e237]:
                - img [ref=e238]
              - button [ref=e241]:
                - img [ref=e242]
        - row "CF02 Execução com Excelência Estratégia e Inteligência Consultor de Fibrose Capacidade de executar com disciplina e qualidade" [ref=e245]:
          - cell "CF02" [ref=e246]
          - cell "Execução com Excelência" [ref=e247]
          - cell "Estratégia e Inteligência" [ref=e248]
          - cell "Consultor de Fibrose" [ref=e249]
          - cell "Capacidade de executar com disciplina e qualidade" [ref=e250]
          - cell [ref=e251]:
            - generic [ref=e252]:
              - button [ref=e253]:
                - img [ref=e254]
              - button [ref=e257]:
                - img [ref=e258]
        - row "CF02 Execução com Excelência Estratégia e Inteligência Consultor de Fibrose Capacidade de executar com disciplina e qualidade" [ref=e261]:
          - cell "CF02" [ref=e262]
          - cell "Execução com Excelência" [ref=e263]
          - cell "Estratégia e Inteligência" [ref=e264]
          - cell "Consultor de Fibrose" [ref=e265]
          - cell "Capacidade de executar com disciplina e qualidade" [ref=e266]
          - cell [ref=e267]:
            - generic [ref=e268]:
              - button [ref=e269]:
                - img [ref=e270]
              - button [ref=e273]:
                - img [ref=e274]
        - row "CF02 Execução com Excelência Estratégia e Inteligência Consultor de Fibrose Capacidade de executar com disciplina e qualidade" [ref=e277]:
          - cell "CF02" [ref=e278]
          - cell "Execução com Excelência" [ref=e279]
          - cell "Estratégia e Inteligência" [ref=e280]
          - cell "Consultor de Fibrose" [ref=e281]
          - cell "Capacidade de executar com disciplina e qualidade" [ref=e282]
          - cell [ref=e283]:
            - generic [ref=e284]:
              - button [ref=e285]:
                - img [ref=e286]
              - button [ref=e289]:
                - img [ref=e290]
        - row "CF02 Execução com Excelência Estratégia e Inteligência Consultor de Fibrose Capacidade de executar com disciplina e qualidade" [ref=e293]:
          - cell "CF02" [ref=e294]
          - cell "Execução com Excelência" [ref=e295]
          - cell "Estratégia e Inteligência" [ref=e296]
          - cell "Consultor de Fibrose" [ref=e297]
          - cell "Capacidade de executar com disciplina e qualidade" [ref=e298]
          - cell [ref=e299]:
            - generic [ref=e300]:
              - button [ref=e301]:
                - img [ref=e302]
              - button [ref=e305]:
                - img [ref=e306]
        - row "CF02 Execução com Excelência Estratégia e Inteligência Consultor de Fibrose Capacidade de executar com disciplina e qualidade" [ref=e309]:
          - cell "CF02" [ref=e310]
          - cell "Execução com Excelência" [ref=e311]
          - cell "Estratégia e Inteligência" [ref=e312]
          - cell "Consultor de Fibrose" [ref=e313]
          - cell "Capacidade de executar com disciplina e qualidade" [ref=e314]
          - cell [ref=e315]:
            - generic [ref=e316]:
              - button [ref=e317]:
                - img [ref=e318]
              - button [ref=e321]:
                - img [ref=e322]
        - row "CF05 Foco no Paciente e Ecossistema Foco no Paciente e Influência Consultor de Fibrose Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e325]:
          - cell "CF05" [ref=e326]
          - cell "Foco no Paciente e Ecossistema" [ref=e327]
          - cell "Foco no Paciente e Influência" [ref=e328]
          - cell "Consultor de Fibrose" [ref=e329]
          - cell "Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e330]
          - cell [ref=e331]:
            - generic [ref=e332]:
              - button [ref=e333]:
                - img [ref=e334]
              - button [ref=e337]:
                - img [ref=e338]
        - row "CF05 Foco no Paciente e Ecossistema Foco no Paciente e Influência Consultor de Fibrose Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e341]:
          - cell "CF05" [ref=e342]
          - cell "Foco no Paciente e Ecossistema" [ref=e343]
          - cell "Foco no Paciente e Influência" [ref=e344]
          - cell "Consultor de Fibrose" [ref=e345]
          - cell "Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e346]
          - cell [ref=e347]:
            - generic [ref=e348]:
              - button [ref=e349]:
                - img [ref=e350]
              - button [ref=e353]:
                - img [ref=e354]
        - row "CF05 Foco no Paciente e Ecossistema Foco no Paciente e Influência Consultor de Fibrose Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e357]:
          - cell "CF05" [ref=e358]
          - cell "Foco no Paciente e Ecossistema" [ref=e359]
          - cell "Foco no Paciente e Influência" [ref=e360]
          - cell "Consultor de Fibrose" [ref=e361]
          - cell "Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e362]
          - cell [ref=e363]:
            - generic [ref=e364]:
              - button [ref=e365]:
                - img [ref=e366]
              - button [ref=e369]:
                - img [ref=e370]
        - row "CF05 Foco no Paciente e Ecossistema Foco no Paciente e Influência Consultor de Fibrose Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e373]:
          - cell "CF05" [ref=e374]
          - cell "Foco no Paciente e Ecossistema" [ref=e375]
          - cell "Foco no Paciente e Influência" [ref=e376]
          - cell "Consultor de Fibrose" [ref=e377]
          - cell "Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e378]
          - cell [ref=e379]:
            - generic [ref=e380]:
              - button [ref=e381]:
                - img [ref=e382]
              - button [ref=e385]:
                - img [ref=e386]
        - row "CF05 Foco no Paciente e Ecossistema Foco no Paciente e Influência Consultor de Fibrose Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e389]:
          - cell "CF05" [ref=e390]
          - cell "Foco no Paciente e Ecossistema" [ref=e391]
          - cell "Foco no Paciente e Influência" [ref=e392]
          - cell "Consultor de Fibrose" [ref=e393]
          - cell "Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e394]
          - cell [ref=e395]:
            - generic [ref=e396]:
              - button [ref=e397]:
                - img [ref=e398]
              - button [ref=e401]:
                - img [ref=e402]
        - row "CF05 Foco no Paciente e Ecossistema Foco no Paciente e Influência Consultor de Fibrose Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e405]:
          - cell "CF05" [ref=e406]
          - cell "Foco no Paciente e Ecossistema" [ref=e407]
          - cell "Foco no Paciente e Influência" [ref=e408]
          - cell "Consultor de Fibrose" [ref=e409]
          - cell "Capacidade de compreender a jornada do paciente e o ecossistema de saúde" [ref=e410]
          - cell [ref=e411]:
            - generic [ref=e412]:
              - button [ref=e413]:
                - img [ref=e414]
              - button [ref=e417]:
                - img [ref=e418]
        - row "CF06 Gestão de Relacionamentos com Stakeholders Foco no Paciente e Influência Consultor de Fibrose Capacidade de mapear influência" [ref=e421]:
          - cell "CF06" [ref=e422]
          - cell "Gestão de Relacionamentos com Stakeholders" [ref=e423]
          - cell "Foco no Paciente e Influência" [ref=e424]
          - cell "Consultor de Fibrose" [ref=e425]
          - cell "Capacidade de mapear influência" [ref=e426]
          - cell [ref=e427]:
            - generic [ref=e428]:
              - button [ref=e429]:
                - img [ref=e430]
              - button [ref=e433]:
                - img [ref=e434]
        - row "CF06 Gestão de Relacionamentos com Stakeholders Foco no Paciente e Influência Consultor de Fibrose Capacidade de mapear influência" [ref=e437]:
          - cell "CF06" [ref=e438]
          - cell "Gestão de Relacionamentos com Stakeholders" [ref=e439]
          - cell "Foco no Paciente e Influência" [ref=e440]
          - cell "Consultor de Fibrose" [ref=e441]
          - cell "Capacidade de mapear influência" [ref=e442]
          - cell [ref=e443]:
            - generic [ref=e444]:
              - button [ref=e445]:
                - img [ref=e446]
              - button [ref=e449]:
                - img [ref=e450]
        - row "CF06 Gestão de Relacionamentos com Stakeholders Foco no Paciente e Influência Consultor de Fibrose Capacidade de mapear influência" [ref=e453]:
          - cell "CF06" [ref=e454]
          - cell "Gestão de Relacionamentos com Stakeholders" [ref=e455]
          - cell "Foco no Paciente e Influência" [ref=e456]
          - cell "Consultor de Fibrose" [ref=e457]
          - cell "Capacidade de mapear influência" [ref=e458]
          - cell [ref=e459]:
            - generic [ref=e460]:
              - button [ref=e461]:
                - img [ref=e462]
              - button [ref=e465]:
                - img [ref=e466]
        - row "CF06 Gestão de Relacionamentos com Stakeholders Foco no Paciente e Influência Consultor de Fibrose Capacidade de mapear influência" [ref=e469]:
          - cell "CF06" [ref=e470]
          - cell "Gestão de Relacionamentos com Stakeholders" [ref=e471]
          - cell "Foco no Paciente e Influência" [ref=e472]
          - cell "Consultor de Fibrose" [ref=e473]
          - cell "Capacidade de mapear influência" [ref=e474]
          - cell [ref=e475]:
            - generic [ref=e476]:
              - button [ref=e477]:
                - img [ref=e478]
              - button [ref=e481]:
                - img [ref=e482]
        - row "CF06 Gestão de Relacionamentos com Stakeholders Foco no Paciente e Influência Consultor de Fibrose Capacidade de mapear influência" [ref=e485]:
          - cell "CF06" [ref=e486]
          - cell "Gestão de Relacionamentos com Stakeholders" [ref=e487]
          - cell "Foco no Paciente e Influência" [ref=e488]
          - cell "Consultor de Fibrose" [ref=e489]
          - cell "Capacidade de mapear influência" [ref=e490]
          - cell [ref=e491]:
            - generic [ref=e492]:
              - button [ref=e493]:
                - img [ref=e494]
              - button [ref=e497]:
                - img [ref=e498]
        - row "CF06 Gestão de Relacionamentos com Stakeholders Foco no Paciente e Influência Consultor de Fibrose Capacidade de mapear influência" [ref=e501]:
          - cell "CF06" [ref=e502]
          - cell "Gestão de Relacionamentos com Stakeholders" [ref=e503]
          - cell "Foco no Paciente e Influência" [ref=e504]
          - cell "Consultor de Fibrose" [ref=e505]
          - cell "Capacidade de mapear influência" [ref=e506]
          - cell [ref=e507]:
            - generic [ref=e508]:
              - button [ref=e509]:
                - img [ref=e510]
              - button [ref=e513]:
                - img [ref=e514]
        - row "CF01 Pensamento Estratégico Estratégia e Inteligência Consultor de Fibrose Capacidade de interpretar dados e cenários" [ref=e517]:
          - cell "CF01" [ref=e518]
          - cell "Pensamento Estratégico" [ref=e519]
          - cell "Estratégia e Inteligência" [ref=e520]
          - cell "Consultor de Fibrose" [ref=e521]
          - cell "Capacidade de interpretar dados e cenários" [ref=e522]
          - cell [ref=e523]:
            - generic [ref=e524]:
              - button [ref=e525]:
                - img [ref=e526]
              - button [ref=e529]:
                - img [ref=e530]
        - row "CF01 Pensamento Estratégico Estratégia e Inteligência Consultor de Fibrose Capacidade de interpretar dados e cenários" [ref=e533]:
          - cell "CF01" [ref=e534]
          - cell "Pensamento Estratégico" [ref=e535]
          - cell "Estratégia e Inteligência" [ref=e536]
          - cell "Consultor de Fibrose" [ref=e537]
          - cell "Capacidade de interpretar dados e cenários" [ref=e538]
          - cell [ref=e539]:
            - generic [ref=e540]:
              - button [ref=e541]:
                - img [ref=e542]
              - button [ref=e545]:
                - img [ref=e546]
        - row "CF01 Pensamento Estratégico Estratégia e Inteligência Consultor de Fibrose Capacidade de interpretar dados e cenários" [ref=e549]:
          - cell "CF01" [ref=e550]
          - cell "Pensamento Estratégico" [ref=e551]
          - cell "Estratégia e Inteligência" [ref=e552]
          - cell "Consultor de Fibrose" [ref=e553]
          - cell "Capacidade de interpretar dados e cenários" [ref=e554]
          - cell [ref=e555]:
            - generic [ref=e556]:
              - button [ref=e557]:
                - img [ref=e558]
              - button [ref=e561]:
                - img [ref=e562]
        - row "CF01 Pensamento Estratégico Estratégia e Inteligência Consultor de Fibrose Capacidade de interpretar dados e cenários" [ref=e565]:
          - cell "CF01" [ref=e566]
          - cell "Pensamento Estratégico" [ref=e567]
          - cell "Estratégia e Inteligência" [ref=e568]
          - cell "Consultor de Fibrose" [ref=e569]
          - cell "Capacidade de interpretar dados e cenários" [ref=e570]
          - cell [ref=e571]:
            - generic [ref=e572]:
              - button [ref=e573]:
                - img [ref=e574]
              - button [ref=e577]:
                - img [ref=e578]
        - row "CF01 Pensamento Estratégico Estratégia e Inteligência Consultor de Fibrose Capacidade de interpretar dados e cenários" [ref=e581]:
          - cell "CF01" [ref=e582]
          - cell "Pensamento Estratégico" [ref=e583]
          - cell "Estratégia e Inteligência" [ref=e584]
          - cell "Consultor de Fibrose" [ref=e585]
          - cell "Capacidade de interpretar dados e cenários" [ref=e586]
          - cell [ref=e587]:
            - generic [ref=e588]:
              - button [ref=e589]:
                - img [ref=e590]
              - button [ref=e593]:
                - img [ref=e594]
        - row "CF01 Pensamento Estratégico Estratégia e Inteligência Consultor de Fibrose Capacidade de interpretar dados e cenários" [ref=e597]:
          - cell "CF01" [ref=e598]
          - cell "Pensamento Estratégico" [ref=e599]
          - cell "Estratégia e Inteligência" [ref=e600]
          - cell "Consultor de Fibrose" [ref=e601]
          - cell "Capacidade de interpretar dados e cenários" [ref=e602]
          - cell [ref=e603]:
            - generic [ref=e604]:
              - button [ref=e605]:
                - img [ref=e606]
              - button [ref=e609]:
                - img [ref=e610]
    - generic [ref=e614]:
      - generic [ref=e615]:
        - heading "Nova Competencia" [level=2] [ref=e616]
        - button [ref=e617]:
          - img [ref=e618]
      - generic [ref=e621]:
        - generic [ref=e622]:
          - generic [ref=e623]: Nome
          - textbox "Nome da competencia" [ref=e624]: TESTE_PLAYWRIGHT_1775646670176
        - generic [ref=e625]:
          - generic [ref=e626]: Codigo
          - 'textbox "Ex: COMP-01" [ref=e627]': PW-TEST
        - generic [ref=e628]:
          - generic [ref=e629]: Pilar
          - 'textbox "Ex: Lideranca" [ref=e630]': Teste
        - generic [ref=e631]:
          - generic [ref=e632]: Cargo
          - 'textbox "Ex: Gerente" [ref=e633]': QA
        - generic [ref=e634]:
          - generic [ref=e635]: Descricao
          - textbox "Descricao da competencia..." [ref=e636]: Competencia criada pelo Playwright para teste E2E
      - generic [ref=e637]:
        - button "Cancelar" [ref=e638]
        - button "Salvar" [ref=e639]:
          - img [ref=e640]
          - text: Salvar
```

# Test source

```ts
  49  | 
  50  |     // Modal should appear
  51  |     await expect(page.locator('text=Nova Competencia').first().or(page.locator('h2:has-text("Nova")').first())).toBeVisible({ timeout: 5000 });
  52  |   });
  53  | 
  54  |   test('modal has fields: cod_comp, nome, pilar, cargo, descricao', async ({ page }) => {
  55  |     const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
  56  |     if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
  57  |     await selector.selectOption({ index: 1 });
  58  |     await page.waitForTimeout(1000);
  59  |     await page.locator('button:has-text("Nova")').first().click();
  60  | 
  61  |     await expect(page.locator('label:has-text("Nome")').first()).toBeVisible({ timeout: 5000 });
  62  |     await expect(page.locator('label:has-text("Codigo")').first()).toBeVisible();
  63  |     await expect(page.locator('label:has-text("Pilar")').first()).toBeVisible();
  64  |     await expect(page.locator('label:has-text("Cargo")').first()).toBeVisible();
  65  |     await expect(page.locator('label:has-text("Descricao")').first()).toBeVisible();
  66  |   });
  67  | 
  68  |   test('can fill modal fields', async ({ page }) => {
  69  |     const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
  70  |     if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
  71  |     await selector.selectOption({ index: 1 });
  72  |     await page.waitForTimeout(1000);
  73  |     await page.locator('button:has-text("Nova")').first().click();
  74  |     await page.waitForTimeout(500);
  75  | 
  76  |     await page.locator('input[placeholder="Nome da competencia"]').fill('Test Competency');
  77  |     await page.locator('input[placeholder*="COMP"]').fill('TEST-99');
  78  |     await page.locator('input[placeholder*="Lideranca"]').fill('Testing');
  79  |     await page.locator('input[placeholder*="Gerente"]').fill('QA');
  80  |     await page.locator('textarea').first().fill('A test competency description');
  81  | 
  82  |     await expect(page.locator('input[placeholder="Nome da competencia"]')).toHaveValue('Test Competency');
  83  |   });
  84  | 
  85  |   test('Cancelar closes modal without saving', async ({ page }) => {
  86  |     const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
  87  |     if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
  88  |     await selector.selectOption({ index: 1 });
  89  |     await page.waitForTimeout(1000);
  90  |     await page.locator('button:has-text("Nova")').first().click();
  91  |     await page.waitForTimeout(500);
  92  | 
  93  |     await expect(page.locator('text=Nova Competencia').first().or(page.locator('h2:has-text("Nova")').first())).toBeVisible({ timeout: 3000 });
  94  |     await page.locator('button:has-text("Cancelar")').click();
  95  |     await expect(page.locator('text=Nova Competencia').first()).not.toBeVisible({ timeout: 3000 });
  96  |   });
  97  | 
  98  |   test('Ver Base toggle shows base competencies', async ({ page }) => {
  99  |     const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
  100 |     if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
  101 |     await selector.selectOption({ index: 1 });
  102 |     await page.waitForTimeout(1000);
  103 | 
  104 |     const verBaseBtn = page.locator('button:has-text("Ver Base")');
  105 |     await expect(verBaseBtn).toBeVisible({ timeout: 5000 });
  106 |     await verBaseBtn.click();
  107 |     // Should show base competencies list with Copiar buttons
  108 |     await expect(page.locator('text=Competencias Base').first()).toBeVisible({ timeout: 5000 });
  109 |   });
  110 | 
  111 |   test('base competencies have Copiar button', async ({ page }) => {
  112 |     const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
  113 |     if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
  114 |     await selector.selectOption({ index: 1 });
  115 |     await page.waitForTimeout(1000);
  116 | 
  117 |     await page.locator('button:has-text("Ver Base")').click();
  118 |     await page.waitForTimeout(1000);
  119 | 
  120 |     const copiarBtns = page.locator('button:has-text("Copiar")');
  121 |     const count = await copiarBtns.count();
  122 |     if (count === 0) {
  123 |       // No base competencies available for this segment — still a valid state
  124 |       return;
  125 |     }
  126 |     await expect(copiarBtns.first()).toBeVisible();
  127 |   });
  128 | 
  129 |   test('SANDBOX: create, verify, and delete test competency', async ({ page }) => {
  130 |     const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
  131 |     if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
  132 |     await selector.selectOption({ index: 1 });
  133 |     await page.waitForTimeout(1500);
  134 | 
  135 |     const testName = `TESTE_PLAYWRIGHT_${Date.now()}`;
  136 | 
  137 |     // Create
  138 |     await page.locator('button:has-text("Nova")').first().click();
  139 |     await page.waitForTimeout(500);
  140 |     await page.locator('input[placeholder="Nome da competencia"]').fill(testName);
  141 |     await page.locator('input[placeholder*="COMP"]').fill('PW-TEST');
  142 |     await page.locator('input[placeholder*="Lideranca"]').fill('Teste');
  143 |     await page.locator('input[placeholder*="Gerente"]').fill('QA');
  144 |     await page.locator('textarea').first().fill('Competencia criada pelo Playwright para teste E2E');
  145 |     await page.locator('button:has-text("Salvar")').click();
  146 |     await page.waitForTimeout(2000);
  147 | 
  148 |     // Verify it appears in the table
> 149 |     await expect(page.locator(`text=${testName}`)).toBeVisible({ timeout: 10000 });
      |                                                    ^ Error: expect(locator).toBeVisible() failed
  150 | 
  151 |     // Delete it — find the row with our test name and click its trash button
  152 |     const row = page.locator('tr').filter({ hasText: testName });
  153 |     await expect(row).toBeVisible({ timeout: 5000 });
  154 | 
  155 |     // Accept the confirm dialog
  156 |     page.on('dialog', dialog => dialog.accept());
  157 |     const trashBtn = row.locator('button').filter({ has: page.locator('svg') }).last();
  158 |     await trashBtn.click();
  159 |     await page.waitForTimeout(2000);
  160 | 
  161 |     // Verify it is gone
  162 |     await expect(page.locator(`text=${testName}`)).not.toBeVisible({ timeout: 5000 });
  163 |   });
  164 | });
  165 | 
```