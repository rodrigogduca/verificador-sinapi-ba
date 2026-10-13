# Requisitos — Verificador de Orçamentos SINAPI-BA

> Fase 1 de 3 da spec (Requisitos → Design → Tarefas).
> Status: **APROVADO (v3, 2026-10-12)** — v3: sistema em produção na web com autenticação e banco de dados (R10–R12, RNF1/RNF8).

## 1. Contexto e objetivo

Hoje a conferência de orçamentos de obra contra a tabela SINAPI da Bahia é feita
manualmente, item por item. O objetivo do sistema é **ler o documento do orçamento,
comparar cada item com o SINAPI-BA da data-base informada e listar todas as
divergências**, para que a pessoa revise só o que está errado.

O sistema também **gera uma versão corrigida do documento**, com os valores do SINAPI-BA
no lugar dos errados, e **marca cada correção** de forma visível, mostrando o valor
original. O arquivo original nunca é alterado: a versão corrigida é sempre um arquivo novo.

## 2. Glossário

| Termo | Significado |
|---|---|
| SINAPI | Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil (Caixa/IBGE), publicado mensalmente por estado |
| Data-base | Mês/ano da tabela SINAPI usada no orçamento (ex.: 08/2026) |
| Desonerado / Não desonerado | As duas versões de preço que o SINAPI publica, conforme o regime de contribuição previdenciária |
| Composição | Serviço com código SINAPI, formado por insumos e mão de obra |
| Insumo | Material, equipamento ou mão de obra com código SINAPI |
| BDI | Benefícios e Despesas Indiretas, percentual aplicado sobre o custo direto |
| Item | Uma linha do orçamento (código, descrição, unidade, quantidade, preço unitário, total) |
| Divergência | Qualquer diferença encontrada entre o item e a referência |

## 3. Usuários

- **Analista** (usuário principal): recebe orçamentos, roda a verificação, lê o relatório.
  Não é programador. Usa o sistema pelo navegador, acessando um endereço na internet, com login.
- **Administrador**: além de verificar, importa as tabelas SINAPI-BA (que ficam disponíveis para
  todos) e gerencia os usuários (papel e ativação).

## 4. Histórias de usuário e critérios de aceite

Os critérios usam o formato EARS (*QUANDO / SE / ENQUANTO … O SISTEMA DEVE …*).

### R1 — Gerenciar tabelas de referência SINAPI-BA

**Como** administrador, **quero** carregar as tabelas SINAPI-BA mensais no sistema,
**para que** todos os analistas usem a referência oficial do mês certo.

0. As tabelas importadas ficam no **banco de dados** e são compartilhadas por todos os usuários.
1. QUANDO o administrador importar o arquivo oficial SINAPI-BA de um mês, O SISTEMA DEVE
   armazenar código, descrição, unidade e preço (desonerado e não desonerado) de
   composições e insumos, associados à data-base.
2. O SISTEMA DEVE listar as data-bases já importadas.
3. SE o analista importar uma data-base que já existe, O SISTEMA DEVE pedir confirmação
   antes de substituir.
4. SE o arquivo importado não estiver no formato esperado, O SISTEMA DEVE recusar a
   importação e explicar o motivo.

### R2 — Enviar documento para verificação

**Como** analista, **quero** arrastar o documento do orçamento para a página,
**para** iniciar a verificação sem passos técnicos.

1. O SISTEMA DEVE aceitar arquivos `.xlsx`, `.xls`, `.pdf` (com texto ou escaneado) e `.docx`.
2. SE o formato não for suportado, O SISTEMA DEVE informar quais formatos são aceitos.
3. QUANDO o PDF não tiver texto selecionável, O SISTEMA DEVE aplicar OCR e
   **avisar no relatório** que o documento foi lido por OCR e pode conter erros de leitura.

### R3 — Extrair itens do documento

**Como** analista, **quero** que o sistema identifique os itens do orçamento,
**para** não precisar digitá-los.

1. O SISTEMA DEVE extrair de cada item: código SINAPI, descrição, unidade, quantidade,
   preço unitário e preço total, quando presentes.
2. O SISTEMA DEVE extrair do documento a data-base SINAPI, o regime
   (desonerado/não desonerado) e o percentual de BDI, quando presentes.
3. QUANDO a extração terminar, O SISTEMA DEVE mostrar os itens extraídos em uma tabela
   para conferência **antes** de verificar, permitindo corrigir valores lidos errado.
4. SE uma linha não puder ser interpretada, O SISTEMA DEVE listá-la como
   "não reconhecida" em vez de descartá-la silenciosamente.
5. SE a data-base ou o regime não forem encontrados, O SISTEMA DEVE pedir ao analista
   que os informe.

### R4 — Verificar código, descrição e unidade

1. SE o código do item não existir no SINAPI-BA da data-base, O SISTEMA DEVE apontar
   "código inexistente".
2. SE a unidade do item for diferente da unidade SINAPI, O SISTEMA DEVE apontar
   "unidade divergente", mostrando as duas.
3. SE a descrição do item for diferente da descrição SINAPI, O SISTEMA DEVE apontar
   "descrição divergente", mostrando as duas e o grau de semelhança.
4. QUANDO o item não tiver código SINAPI (composição própria/cotação), O SISTEMA DEVE
   classificá-lo como "sem referência SINAPI" e não acusar erro de preço.

### R5 — Verificar preço unitário

1. SE o preço unitário (sem BDI) for diferente do preço SINAPI-BA da data-base e regime,
   O SISTEMA DEVE apontar "preço divergente", mostrando valor do documento, valor de
   referência, diferença em R$ e em %.
2. O SISTEMA DEVE tolerar diferenças de arredondamento até um limite configurável
   (padrão: R$ 0,01).
3. QUANDO o documento apresentar preço já com BDI, O SISTEMA DEVE retirar o BDI
   informado antes de comparar com o SINAPI.

### R6 — Verificar cálculos

1. SE `quantidade × preço unitário` diferir do total da linha (além da tolerância),
   O SISTEMA DEVE apontar "total da linha incorreto".
2. SE a soma dos itens diferir do subtotal/total declarado de uma etapa ou do orçamento,
   O SISTEMA DEVE apontar "somatório incorreto".

### R7 — Verificar BDI e encargos

1. SE o preço com BDI de um item for diferente de `preço sem BDI × (1 + BDI)`,
   O SISTEMA DEVE apontar "BDI aplicado incorretamente".
2. SE o BDI não for o mesmo em todos os itens onde deveria ser, O SISTEMA DEVE apontar
   a inconsistência.
3. *(ver questão em aberto Q3 sobre faixas de BDI e encargos sociais)*

### R8 — Relatório de divergências

**Como** analista, **quero** um relatório claro dos erros, **para** devolver ao
responsável pelo orçamento.

1. O SISTEMA DEVE exibir um resumo: total de itens, itens OK, itens com divergência por
   tipo, e itens sem referência.
2. O SISTEMA DEVE listar cada divergência com: localização no documento (linha/página),
   item, tipo de erro, valor encontrado, valor esperado.
3. O SISTEMA DEVE permitir filtrar por tipo de divergência.
4. O SISTEMA DEVE permitir exportar o relatório em Excel e PDF.
5. Para cada divergência, O SISTEMA DEVE indicar se ela foi **corrigida
   automaticamente** ou se **exige revisão manual** (ver R9).

### R9 — Gerar documento corrigido

**Como** analista, **quero** receber o documento já corrigido, com as correções
marcadas, **para** não precisar refazer os valores à mão e ainda saber o que mudou.

1. QUANDO a verificação terminar, O SISTEMA DEVE gerar um **novo arquivo** com as
   correções aplicadas, sem alterar o arquivo original.
2. O SISTEMA DEVE corrigir automaticamente:
   - preço unitário divergente → preço SINAPI-BA da data-base e regime;
   - unidade divergente → unidade SINAPI;
   - descrição divergente → descrição SINAPI *(conforme resposta da Q2)*;
   - total da linha → `quantidade × preço unitário corrigido`;
   - preço com BDI → `preço sem BDI corrigido × (1 + BDI)`;
   - subtotais e total geral → recalculados a partir dos itens corrigidos.
3. O SISTEMA DEVE **marcar visualmente** cada valor corrigido (ex.: célula/trecho
   destacado em cor) e registrar junto dele o **valor original** e o motivo
   (ex.: *"Original: R$ 45,90 — corrigido conforme SINAPI-BA 08/2026 não desonerado"*).
4. O SISTEMA DEVE usar uma marcação **diferente** para valores que mudaram só por
   consequência de outra correção (ex.: total recalculado porque o preço mudou),
   para distinguir erro do orçamentista de recálculo.
5. SE a divergência não puder ser corrigida com segurança, O SISTEMA DEVE **apenas
   marcar** o item como "revisão manual necessária", sem alterar o valor. Isso vale para:
   - código inexistente no SINAPI;
   - item sem referência SINAPI (composição própria/cotação);
   - linha não reconhecida na extração;
   - valores lidos por OCR com baixa confiança.
6. O SISTEMA DEVE incluir no documento corrigido (ou junto dele) um **resumo das
   correções**: quantos itens foram corrigidos, quantos exigem revisão manual, e o
   valor total do orçamento antes e depois.
7. O SISTEMA DEVE gerar o documento corrigido no formato:
   | Documento de origem | Documento corrigido |
   |---|---|
   | Excel | Excel, mesmo layout, células corrigidas destacadas e com comentário |
   | Word | Word, mesmo layout, alterações marcadas (realce + comentário) |
   | PDF (texto ou escaneado) | Planilha Excel corrigida + PDF original com anotações nos pontos errados *(ver Q7)* |
8. O SISTEMA DEVE manter fórmulas existentes na planilha de origem sempre que possível,
   corrigindo os valores de entrada em vez de sobrescrever fórmulas por números.

### R10 — Autenticação

**Como** responsável pelo sistema, **quero** que só pessoas autorizadas acessem,
**para** proteger as tabelas, o histórico e os orçamentos verificados.

1. O SISTEMA DEVE exigir login (e-mail e senha) para qualquer funcionalidade.
2. O SISTEMA NÃO DEVE permitir cadastro público: novos usuários entram **somente por convite**
   do administrador (e-mail com link para definir a senha).
3. O SISTEMA DEVE oferecer "esqueci minha senha" com link enviado por e-mail.
4. A senha DEVE ter no mínimo 10 caracteres, com letras maiúsculas, minúsculas e números.
5. QUANDO um usuário for desativado, O SISTEMA DEVE negar o acesso aos dados imediatamente,
   mesmo que a sessão ainda esteja aberta.
6. O SISTEMA DEVE permitir sair (logout) e encerrar a sessão automaticamente quando expirar.

### R11 — Papéis e permissões

1. Papéis: **administrador** e **analista**. O primeiro usuário criado é administrador.
2. Somente administradores DEVEM importar/excluir tabelas SINAPI e alterar papéis/ativação de usuários.
3. Um administrador NÃO DEVE conseguir rebaixar ou desativar a si mesmo (evita ficar sem administrador).
4. As permissões DEVEM ser garantidas **no banco de dados** (regras por linha), não só na tela.

### R12 — Histórico de verificações

1. QUANDO uma verificação terminar, O SISTEMA DEVE registrar: usuário, data/hora, nome do arquivo,
   data-base, regime, BDI, resumo e lista de correções.
2. O analista DEVE ver o seu próprio histórico; o administrador DEVE ver o de todos.
3. O histórico NÃO DEVE poder ser alterado; só o administrador pode excluir registros.
4. O conteúdo dos documentos **não** é armazenado (só o resultado da verificação).

## 5. Requisitos não funcionais

- **RNF1 — Na web, com dados protegidos:** o sistema fica publicado na internet (HTTPS), com
  login e banco de dados em produção. A **leitura e correção dos documentos acontece no navegador**
  do analista: o arquivo do orçamento não é enviado ao servidor. O banco guarda usuários, tabelas
  SINAPI e o histórico de verificações.
- **RNF2 — Simplicidade:** basta abrir o endereço no navegador; sem instalação.
- **RNF6 — Custo zero:** hospedagem e publicação gratuitas.
- **RNF7 — Segurança:** HTTPS obrigatório; autenticação (R10); permissões no banco (R11);
  política de segurança de conteúdo (CSP) que só permite falar com o próprio site e com o
  banco de dados; todas as bibliotecas empacotadas no próprio site; dependências auditadas
  a cada publicação; nenhuma chave secreta no código do site.
- **RNF8 — Ambiente de testes local:** todo o sistema (site + banco + autenticação) DEVE
  rodar localmente para testes, sem afetar a produção.
- **RNF3 — Desempenho:** orçamento de até 2.000 itens (Excel/PDF com texto) verificado
  em menos de 30 s. OCR pode levar mais, com indicador de progresso.
- **RNF4 — Rastreabilidade:** o relatório registra o arquivo verificado, a data-base,
  o regime e a data/hora da verificação.
- **RNF5 — Confiabilidade:** nenhum item é ignorado sem aparecer no relatório
  (OK, divergente, sem referência ou não reconhecido).

## 6. Fora do escopo (versão 1)

- Corrigir itens sem código SINAPI ou com código inexistente (esses são só marcados).
- Reescrever o PDF original preservando o layout (PDF não é editável de forma confiável;
  a correção sai em Excel + PDF anotado).
- Outras tabelas além do SINAPI (ORSE, SEINFRA, SICRO etc.).
- Outros estados além da Bahia.
- Verificar a composição analítica (insumos e coeficientes dentro de cada composição).
- Armazenar os arquivos dos orçamentos (originais ou corrigidos) no servidor.
- Login com Google/Microsoft e autenticação em dois fatores (podem vir numa versão futura).

## 7. Proposta de entregas em etapas

Como a leitura de formatos variados é a parte mais difícil, sugiro entregar em fases:

| Etapa | Entrega |
|---|---|
| MVP | Importação SINAPI-BA + **Excel** + verificações R4–R6 + relatório na tela + **Excel corrigido e marcado** |
| 2 | **PDF com texto** + BDI (R7) + exportação do relatório + Excel corrigido e PDF anotado |
| 3 | **Word** + Word corrigido e marcado |
| 4 | **PDF escaneado (OCR)** |

## 8. Decisões assumidas (respostas padrão às questões em aberto)

Como não houve resposta às questões abaixo, a implementação segue estes padrões, todos
**configuráveis na tela** quando fizer sentido. Podem ser revistos a qualquer momento.

| # | Decisão |
|---|---|
| Q1 | Formato livre: o sistema detecta o cabeçalho da tabela por palavras-chave e permite ao analista **ajustar o mapeamento de colunas** na tela de conferência. |
| Q2 | Descrição: diferenças só de maiúsculas/acentos/espaços são ignoradas. Descrição parecida mas diferente é **corrigida** para a do SINAPI. Descrição muito diferente indica **código possivelmente errado** → revisão manual, sem corrigir preço. |
| Q3 | BDI: verifica a aplicação correta e a consistência; percentual fora da faixa do Acórdão TCU 2622/2013 (tipo de obra escolhido, padrão "edificações") gera **aviso**, não correção. Encargos sociais: apenas exibidos, sem verificação (v1). |
| Q4 | Tolerância padrão R$ 0,01, configurável. |
| Q5 | Preço acima **e** abaixo do SINAPI são divergência. |
| Q6 | O analista importa a planilha oficial SINAPI baixada do site da Caixa (formato antigo por estado ou formato novo com todas as UFs). |
| Q7 | PDF → Excel corrigido + PDF original anotado. Imagens (JPG/PNG) seguem o mesmo fluxo do PDF escaneado. |
| Q8 | Vermelho = corrigido; amarelo = recalculado por consequência; laranja = revisão manual. |

### Questões originais

- **Q1 — Modelo dos documentos:** os orçamentos seguem sempre o mesmo modelo de
  planilha ou cada empresa manda de um jeito? *Preciso de 2 ou 3 exemplos reais
  (podem ter os nomes apagados) para desenhar a extração.*
- **Q2 — Descrição:** a descrição precisa ser idêntica ao SINAPI, ou é aceitável
  resumida/abreviada desde que código e unidade batam?
- **Q3 — BDI e encargos:** além de checar se o BDI foi aplicado corretamente, é preciso
  verificar se o percentual está dentro de alguma faixa de referência (ex.: Acórdão
  TCU 2622/2013)? E os encargos sociais devem ser comparados com os percentuais
  SINAPI-BA?
- **Q4 — Tolerância de preço:** a diferença deve ser zero (centavo exato) ou existe
  alguma margem aceita?
- **Q5 — Preço acima x abaixo:** preço *abaixo* do SINAPI também é erro, ou só acima?
- **Q6 — Fonte do SINAPI:** você baixa as planilhas mensais do site da Caixa? Pode
  me enviar o arquivo de um mês para eu ver o formato?
- **Q7 — Saída para PDF:** quando o orçamento chega em PDF, serve receber de volta uma
  **planilha Excel corrigida** + o **PDF original anotado** com os erros? Ou é obrigatório
  devolver um PDF corrigido com o mesmo visual?
- **Q8 — Marcação:** existe um padrão de marcação que vocês já usam (ex.: vermelho =
  erro, amarelo = atenção)? Se não, proponho: **vermelho** = valor corrigido,
  **amarelo** = recalculado por consequência, **laranja** = revisão manual.
