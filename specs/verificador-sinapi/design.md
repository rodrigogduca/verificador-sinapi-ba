# Design — Verificador de Orçamentos SINAPI-BA

> Fase 2 de 3 da spec. Referência: `requirements.md` (v2).
> Status: **REVISADO v3** — inclui autenticação e banco de dados (Supabase), §12–§14.

## 1. Visão geral da arquitetura

**Site estático + backend gerenciado (Supabase).** O site (HTML/JS/WASM) é servido pelo
GitHub Pages. Login, banco de dados e regras de permissão ficam no **Supabase** (PostgreSQL +
Auth), plano gratuito. A **leitura e a correção dos documentos rodam no navegador**: o arquivo
do orçamento nunca sai do computador do analista; só o *resultado* da verificação é gravado.

```
 ┌──────────────────────────── Navegador do analista ────────────────────────────┐
 │  UI (React) ── login ──────────────────────────────────────────┐              │
 │   ├─ Verificar: arquivo ─► extract ─► Grid ─► Orçamento        │              │
 │   │            Orçamento + Tabela SINAPI ─► verify ─► Resultado│              │
 │   │            Resultado ─► output ─► arquivos corrigidos      │              │
 │   ├─ Tabelas SINAPI (admin) ─► importer                        │              │
 │   ├─ Histórico                                                 │              │
 │   └─ Usuários (admin)                                          │              │
 └────────────┬───────────────────────────────────────────────────┼──────────────┘
              │ HTTPS (arquivos estáticos)                        │ HTTPS + JWT (supabase-js)
 ┌────────────┴────────┐                         ┌────────────────┴───────────────┐
 │    GitHub Pages     │                         │ Supabase (gratuito)            │
 │  (site estático)    │                         │  Auth: e-mail/senha, convite   │
 └─────────────────────┘                         │  Postgres + RLS:               │
          ▲                                      │   perfis, sinapi_tabelas,      │
          │ GitHub Actions: testes, auditoria,   │   sinapi_itens, verificacoes   │
          │ build, migrações, deploy             └────────────────────────────────┘
```

**Por que assim:** grátis (GitHub Pages + Supabase free), seguro (autenticação, permissões
garantidas no banco via RLS, documentos não trafegam), e dá para rodar **tudo localmente**
para testes (Supabase CLI + Docker).

## 2. Tecnologias

| Necessidade | Escolha | Motivo |
|---|---|---|
| Linguagem / build | TypeScript + Vite | tipagem, build estático rápido |
| Interface | React | componentes, estado da tela de conferência |
| Ler/escrever `.xlsx` com cores, comentários e fórmulas | ExcelJS | preserva estilos e fórmulas; escreve notas |
| Ler `.xls` antigo | SheetJS (build oficial do CDN da SheetJS, 0.20.x) | converte `.xls` → `.xlsx`; a versão do npm é antiga e vulnerável |
| Ler PDF com texto (com posições) e renderizar páginas | pdfjs-dist | padrão de mercado, roda em Web Worker |
| Anotar PDF | pdf-lib | desenha marcações e anotações com comentário |
| OCR | tesseract.js + dados `por` | OCR em português, WASM no navegador |
| Ler/escrever `.docx` | JSZip + @xmldom/xmldom | edição direta do XML: preserva o layout |
| Relatório em PDF | jsPDF + jspdf-autotable | tabelas com quebra de página |
| Autenticação e banco | Supabase (Auth + PostgreSQL + RLS) via `@supabase/supabase-js` | gratuito, permissões no banco, roda local com Docker |
| Testes | Vitest (unidade) + Playwright (ponta a ponta, Chromium) | |
| Hospedagem | GitHub Pages + GitHub Actions | gratuito, HTTPS |

Todos os arquivos de worker/WASM/idioma (pdf.js worker, tesseract worker/core, `por.traineddata`)
são **copiados para dentro do site** no build: o site não depende de CDN externo em tempo de execução.

## 3. Modelo de dados (domínio)

```ts
type Regime = 'nao_desonerado' | 'desonerado';
type TipoRef = 'composicao' | 'insumo';

interface SinapiEntry { codigo: string; tipo: TipoRef; descricao: string; unidade: string;
                        preco: Partial<Record<Regime, number>>; }
interface SinapiTable { dataBase: string /* 'AAAA-MM' */; uf: 'BA';
                        entries: Record<string /* `${tipo}:${codigo}` */, SinapiEntry>;
                        importadoEm: string; arquivos: string[]; }

// Representação intermediária comum a TODOS os formatos de entrada
interface Cell { text: string; num?: number; loc: Loc; confidence?: number /* OCR 0-100 */;
                 formula?: string; }
type Loc =
  | { kind: 'xlsx'; sheet: string; address: string; row: number; col: number }
  | { kind: 'pdf'; page: number; bbox: [x0, y0, x1, y1] /* pontos PDF */ }
  | { kind: 'docx'; table: number; row: number; cell: number };
interface Grid { rows: Cell[][]; source: 'xlsx'|'pdf'|'ocr'|'docx'; fullText: string;
                 sheet?: string; }

type Campo = 'item' | 'codigo' | 'fonte' | 'descricao' | 'unidade' | 'quantidade'
           | 'precoUnit' | 'precoUnitBdi' | 'total';
interface Mapeamento { headerRow: number; colunas: Partial<Record<Campo, number>>; }

type TipoLinha = 'item' | 'titulo' | 'subtotal' | 'total' | 'ignorar' | 'nao_reconhecida';
interface Linha { idx: number; tipo: TipoLinha; cells: Partial<Record<Campo, Cell>>;
                  valores: { codigo?; fonte?; descricao?; unidade?; quantidade?;
                             precoUnit?; precoUnitBdi?; total?; itemNum? }; }

interface Metadados { dataBase?: string; regime?: Regime; bdi?: number /* 0.25 = 25% */;
                      encargos?: number; }

interface Orcamento { grid: Grid; mapeamento: Mapeamento; linhas: Linha[]; meta: Metadados;
                      ocr: boolean; }
```

### Resultado da verificação

```ts
type Marca = 'corrigido' | 'recalculado' | 'revisao' | 'aviso';
type TipoDiv = 'codigo_inexistente' | 'sem_referencia' | 'unidade_divergente'
  | 'descricao_divergente' | 'possivel_codigo_errado' | 'preco_divergente'
  | 'total_linha_incorreto' | 'somatorio_incorreto' | 'bdi_incorreto'
  | 'bdi_inconsistente' | 'bdi_fora_faixa' | 'linha_nao_reconhecida' | 'ocr_baixa_confianca';

interface Correcao { linha: number; campo: Campo; original: string|number|undefined;
                     corrigido: string|number; marca: Marca; motivo: string;
                     tipo: TipoDiv; loc?: Loc; }

interface ResultadoLinha { linha: Linha; status: 'ok'|'corrigido'|'revisao'|'sem_referencia';
                           ref?: SinapiEntry; correcoes: Correcao[]; }

interface Resultado { linhas: ResultadoLinha[]; correcoes: Correcao[] /* inclui avisos */;
                      resumo: { itens; ok; corrigidos; revisao; semRef; naoReconhecidas;
                                totalOriginal; totalCorrigido; porTipo: Record<TipoDiv, number> };
                      contexto: { arquivo; dataBase; regime; bdi?; verificadoEm; ocr }; }
```

## 4. Importação SINAPI (`sinapi/importer.ts`)

A Caixa já publicou dois formatos; o importador aceita os dois e detecta tudo por
conteúdo, sem depender de posições fixas:

1. Para cada aba da planilha, procura nas 30 primeiras linhas a **linha de cabeçalho**:
   contém células que casam `/c[óo]d/`, `/descri/` e `/unid/`.
2. **Coluna de preço:**
   - formato novo (todas as UFs): uma célula de cabeçalho igual a `BA` (na linha de
     cabeçalho ou em até 2 linhas acima) → essa coluna;
   - formato antigo (por estado): cabeçalho que casa `/pre[çc]o|custo/`
     (prioriza "custo total" / "preço mediano").
3. **Tipo** (insumo/composição): nome da aba (`I..`/`C..`, "insumo", "composi") ou
   texto do cabeçalho ("código da composição").
4. **Regime:** nome da aba (`ISD`/`CSD` = não desonerado, `ICD`/`CCD` = desonerado,
   `ISE`/`CSE` = ignorada), senão texto das primeiras linhas, senão nome do arquivo
   (`NaoDesonerado`, `Desonerado`). Indeterminado → o analista escolhe na tela.
5. **Data-base:** nome do arquivo (`2025_01`, `202501`, `012025`) ou texto das primeiras
   linhas (`MM/AAAA`). Sempre editável na tela antes de salvar.
6. Linhas cujo código não é numérico são descartadas (rodapés/títulos). Códigos são
   normalizados sem zeros à esquerda.
7. Vários arquivos do mesmo mês (ex.: insumos + composições, desonerado + não
   desonerado) são **mesclados** na mesma `SinapiTable`.
8. A tabela mesclada é gravada no banco (`sinapi_tabelas` + `sinapi_itens`, lotes de 1.000
   linhas). Somente administradores (RLS). Leitura paginada e mantida em memória na sessão.

## 5. Extração (`extract/`)

Cada formato produz um `Grid`; a partir daí o tratamento é o mesmo.

| Formato | Como vira `Grid` |
|---|---|
| `.xlsx` | ExcelJS: cada linha da planilha → linha do grid; células mescladas: só a principal tem texto; fórmulas guardam `formula` + resultado. Escolhe a aba com mais linhas que parecem itens (o analista pode trocar). |
| `.xls` | SheetJS converte para `.xlsx` em memória → mesmo caminho acima. |
| PDF com texto | pdf.js: fragmentos de texto com posição → agrupados em **linhas** (mesmo y, tolerância ½ altura da fonte) → linha quebrada em **células** por espaçamento horizontal. Depois que o cabeçalho é achado, as células de cada linha são **atribuídas à coluna** do cabeçalho mais próxima por x. |
| PDF escaneado / imagem | pdf.js renderiza a página a 300 dpi (imagem: usada direto) → tesseract (`por`) devolve palavras com caixa e confiança → mesmo agrupamento do PDF com texto. Página "sem texto" = menos de 20 caracteres extraídos pelo pdf.js. |
| `.docx` | JSZip + xmldom: cada `w:tbl` → linhas do grid (respeita `gridSpan`); parágrafos fora de tabela entram em `fullText`. Escolhe a tabela com mais itens. |

### 5.1 Detecção de tabela (`extract/table.ts`)

- **Cabeçalho:** linha (entre as primeiras 60) com maior pontuação de palavras-chave:
  `item`; `código|cód|codigo sinapi`; `fonte|banco|base`; `descrição|discriminação|serviço`;
  `unid|und|un`; `quant|qtd|qtde`; `preço unit|valor unit|custo unit|p.unit` (com
  `c/ bdi|com bdi` → `precoUnitBdi`); `total|preço total|valor total`.
  Cabeçalhos em 2 linhas são combinados.
- **Classificação das linhas abaixo do cabeçalho:**
  - `item`: tem quantidade numérica e (preço unitário ou total);
  - `titulo`: tem texto, sem quantidade (ex.: "1 SERVIÇOS PRELIMINARES"); pode ter total da etapa;
  - `subtotal` / `total`: texto contém `subtotal|total da etapa|total` (`total geral|valor total|total do orçamento` → `total`);
  - linha vazia → `ignorar`; resto com conteúdo → `nao_reconhecida`.
  - PDF/OCR: linha só com texto na coluna de descrição, logo após um item → continuação
    da descrição (é concatenada); cabeçalho repetido em outra página → `ignorar`.
- **Números brasileiros:** `1.234,56`, `R$ 1.234,56`, `1234.56`, `(1.234,56)`; `%` tratado à parte.
- **Fonte:** se existir coluna "fonte/banco" e o valor não contiver `SINAPI` → item `sem_referencia`.

### 5.2 Metadados (`extract/metadata.ts`)

Busca no texto completo do documento (e nas linhas acima do cabeçalho):
- data-base: `SINAPI[^\d]{0,30}(MM)/(AAAA)`, `data[- ]base[^\d]{0,15}(MM)/(AAAA)`,
  nomes de mês (`agosto/2026`, `ago/26`);
- regime: `não desonerad|sem desoneração` → não desonerado; `desonerad|com desoneração` → desonerado;
- BDI: `BDI[^\d%]{0,25}(\d{1,2}[,.]\d{1,4})\s*%`;
- encargos: `encargos sociais[^\d%]{0,30}(\d{2,3}[,.]\d+)\s*%`.

## 6. Motor de verificação (`verify/engine.ts`)

Função pura `verificar(orcamento, tabela, config) → Resultado`. Para cada linha `item`:

1. **Referência:** se não tem código ou fonte ≠ SINAPI → `sem_referencia` (só listado).
   Busca `composicao:cod`, depois `insumo:cod` (se a fonte/tipo indicar insumo, inverte
   a ordem). Não encontrado → `codigo_inexistente` (revisão).
2. **Descrição:** normaliza (minúsculas, sem acentos, sem pontuação, espaços únicos).
   Similaridade = max(Dice de bigramas, fração das palavras do item contidas na descrição SINAPI).
   - ≥ 0,98 → OK
   - ≥ 0,50 → `descricao_divergente` → corrige para a descrição SINAPI (se a opção estiver ativa)
   - < 0,50 → `possivel_codigo_errado` → **revisão**; a linha não recebe correção de preço.
3. **Unidade:** normaliza (`m²`=`m2`, `und|unid|unidade|u`=`un`, `hr|hora`=`h`, `mês`=`mes`…).
   Diferente → `unidade_divergente` → corrige.
4. **Preço unitário:** referência = `preco[regime]` (falta o regime na tabela → revisão).
   - Coluna sem BDI presente: compara direto.
   - Só coluna com BDI: compara `precoUnitBdi / (1+BDI)` com a referência.
   - Só uma coluna de preço sem indicação: se bate com `ref` → sem BDI; se bate com
     `ref × (1+BDI)` → com BDI; senão assume sem BDI.
   - |diferença| > tolerância → `preco_divergente` → corrige (o preço com BDI também é
     ajustado: `round2(ref × (1+BDI))`).
5. **BDI:** se existem as duas colunas e `precoUnitBdi ≠ round2(precoUnit × (1+BDI))` → `bdi_incorreto` → corrige.
   BDI implícito por linha (`precoUnitBdi/precoUnit − 1`) diferente entre itens → `bdi_inconsistente` (aviso).
   BDI fora da faixa TCU do tipo de obra → `bdi_fora_faixa` (aviso).
6. **Total da linha:** base = coluna que multiplicada pela quantidade reproduz o total
   original (com BDI ou sem); se nenhuma reproduz, usa a coluna com BDI quando existir.
   - Total original ≠ `round2(qtd × preço original)` → `total_linha_incorreto` (**corrigido**, vermelho).
   - Total original estava certo mas o preço foi corrigido → **recalculado** (amarelo).
7. **OCR:** qualquer número com confiança < 70 que geraria correção → em vez disso
   `ocr_baixa_confianca` (revisão), sem alterar.

Depois dos itens:

8. **Somatórios:** com coluna "item" hierárquica (`1`, `1.1`, `1.1.2`), o total de um
   título/subtotal = soma dos itens descendentes; sem numeração, subtotal = soma dos
   itens desde o subtotal/título anterior; `total` geral = soma de todos os itens
   (se não bater, tenta `× (1+BDI)`).
   - Original ≠ soma original → `somatorio_incorreto` (corrigido, vermelho).
   - Original = soma original, mas itens mudaram → recalculado (amarelo).
9. **RNF5:** toda linha `nao_reconhecida` vira `linha_nao_reconhecida` (revisão).

Arredondamento: meio-para-cima com 2 casas, sempre sobre centavos inteiros (evita erro de ponto flutuante).

Faixas de BDI (Acórdão TCU 2622/2013 — 1º quartil a 3º quartil):

| Tipo de obra | Mín. | Máx. |
|---|---|---|
| Construção de edifícios | 20,34% | 25,00% |
| Rodovias e ferrovias | 19,60% | 24,23% |
| Redes de água, esgoto e correlatas | 20,76% | 26,44% |
| Portuárias, marítimas e fluviais | 24,00% | 27,86% |
| Fornecimento de materiais e equipamentos | 11,10% | 16,80% |

## 7. Geração dos arquivos de saída (`output/`)

Cores: vermelho `#F8B4B4` = corrigido · amarelo `#FFF3A3` = recalculado ·
laranja `#FFC98B` = revisão manual. Texto do comentário:
`"[SINAPI-BA 08/2026 – não desonerado] Preço divergente. Original: R$ 45,90 → corrigido: R$ 47,12."`

| Origem | Saída corrigida |
|---|---|
| `.xlsx`/`.xls` | Mesmo arquivo (cópia, `.xlsx`): valores corrigidos, cor de fundo, **nota** na célula com o valor original. Célula com fórmula cujo resultado continua válido → fórmula mantida (só cor + nota). Célula de entrada com fórmula (ex.: preço vindo de outra aba) → substituída pelo valor, nota registra a fórmula original. `fullCalcOnLoad` ativado. Nova aba **"Correções SINAPI"** com o resumo e a lista. |
| `.docx` | Cópia: texto da célula trocado (primeiro *run* recebe o texto, os demais são esvaziados, preservando a formatação do primeiro), sombreamento da célula (`w:shd`) e **comentário do Word** ancorado na célula. Tabela de resumo das correções ao final do documento. |
| PDF / imagem | (a) **PDF anotado**: retângulo colorido sobre o valor errado + anotação com o comentário (aparece ao passar o mouse) + número de referência; páginas finais com a lista de correções. (b) **Excel corrigido** com a tabela extraída, valores corrigidos, cores e notas. |
| Relatório | Excel (resumo + divergências) e PDF (jsPDF/autotable). |

O arquivo original nunca é modificado (o navegador trabalha sobre uma cópia em memória).
Nome do arquivo de saída: `<nome>_corrigido.xlsx|docx`, `<nome>_anotado.pdf`, `<nome>_relatorio.xlsx|pdf`.

## 8. Interface

Uma página com 3 abas:

0. **Login** — e-mail/senha; "esqueci minha senha"; tela para definir senha ao abrir o link
   de convite ou de recuperação. Sem cadastro público.
1. **Verificar** — (1) soltar arquivo → barra de progresso (OCR mostra página/porcentagem);
   (2) **Conferência**: data-base (lista das importadas), regime, BDI, tolerância, tipo de
   obra; aviso de OCR; seletor de aba/tabela; mapeamento de colunas (um seletor por
   coluna); tabela de linhas extraídas com tipo e valores **editáveis**; (3) **Resultado**:
   cartões de resumo, filtro por tipo, lista de divergências com cores, botões de download.
2. **Tabelas SINAPI** (importar/excluir só admin; todos veem a lista) — importar arquivo(s) (mostra o que foi detectado: abas, tipo,
   regime, nº de itens, data-base editável), listar, excluir.
3. **Histórico** — verificações anteriores (analista: as suas; admin: todas), com resumo e
   lista de correções; o relatório pode ser baixado novamente em Excel.
4. **Usuários** (só admin) — lista, papel (admin/analista), ativar/desativar; instrução de convite.
5. **Sobre e privacidade** — explica o que fica no banco e o que nunca sai do computador.

Configurações (tolerância, tipo de obra, corrigir descrições) ficam no `localStorage`.

## 9. Segurança

| Ameaça | Mitigação |
|---|---|
| Acesso não autorizado | Supabase Auth (e-mail/senha), **cadastro público desligado**, convite pelo admin; senha ≥ 10 com maiúsculas/minúsculas/números; JWT de 1 h com renovação. |
| Escalada de privilégio / chamadas diretas à API | **RLS em todas as tabelas**: `anon` sem acesso; leitura só para usuário **ativo**; escrita SINAPI e perfis só admin; admin não altera a si mesmo; histórico só inserção (exclusão só admin). O usuário só pode alterar as colunas `nome/papel/ativo` (e só se for admin). |
| Usuário desligado com sessão aberta | `eh_ativo()` checado em toda política: desativar corta o acesso na próxima requisição. |
| Vazamento de documentos | Documento processado só no navegador; o banco guarda apenas o resultado (sem arquivo). |
| Chaves | Só a chave **pública** (anon) vai para o site; a `service_role` nunca sai do servidor/CI. |
| Código de terceiros injetado | Nenhum script externo; tudo empacotado. CSP `script-src 'self' 'wasm-unsafe-eval'`; `connect-src 'self' <origem do Supabase>`. |
| XSS | React escapa todo texto; sem `dangerouslySetInnerHTML`; sessão protegida pela CSP restritiva. |
| Arquivo malicioso / gigante | Limite de 50 MB; erros tratados; nenhuma macro executada. |
| Dependências vulneráveis | `npm audit --audit-level=high` no CI bloqueia o deploy; Dependabot. |
| Clickjacking | GitHub Pages não envia `frame-ancestors`; a página se recusa a rodar dentro de iframe. |
| Abuso de login | Rate limit do Supabase Auth. |
| Pipeline | GitHub Actions com permissões mínimas; segredos (`SUPABASE_ACCESS_TOKEN`, senha do banco) só como *secrets*. |

CSP (meta tag, montada no build): `default-src 'self'; script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:; connect-src 'self' blob: data: <SUPABASE_URL>; img-src 'self' blob: data:;
style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`.

## 10. Testes

- **Unidade (Vitest):** números BR, unidades, similaridade, importador SINAPI (formato
  antigo e novo), detecção de tabela, metadados, motor de verificação (cada regra),
  writers (lê o arquivo gerado de volta e confere valores, cores e notas/comentários),
  extração de PDF com texto e de DOCX.
- **Ponta a ponta (Playwright/Chromium, sobre o build de produção com CSP):**
  importar SINAPI → enviar Excel / PDF / DOCX / imagem escaneada → conferir resumo →
  baixar arquivo corrigido e validar o conteúdo. Falha se houver violação de CSP ou erro no console.
- **Integração (Vitest + Supabase local):** regras RLS — anônimo não lê nada; analista lê
  SINAPI mas não grava; admin grava; analista só vê o próprio histórico; usuário desativado
  perde acesso; admin não se rebaixa; primeiro usuário vira admin.
- **Fixtures sintéticas** geradas por código (`tests/fixtures/generate.ts`): tabela
  SINAPI-BA fictícia nos dois formatos e orçamentos com erros conhecidos plantados.
  Nenhum dado real no repositório.

## 11. Revisão do design (checklist contra os requisitos)

| Requisito | Coberto por | Observação da revisão |
|---|---|---|
| R1 | §4 | Formato real da Caixa não confirmado → detecção por conteúdo + data-base/regime editáveis. **Risco principal**; mitigado. |
| R2 | §5, §8 | Imagens JPG/PNG incluídas (decisão Q7). |
| R3 | §5.1, §5.2, §8 | Mapeamento de colunas editável cobre modelos não previstos. |
| R4 | §6 (1–3) | Descrição muito diferente bloqueia correção de preço (evita "corrigir" com o código errado). |
| R5 | §6 (4) | Detecção automática de preço com/sem BDI. |
| R6 | §6 (6, 8) | |
| R7 | §6 (5) | Encargos só exibidos (Q3). |
| R8 | §7, §8 | |
| R9 | §6, §7 | Distinção vermelho/amarelo implementada no motor, não no writer. |
| RNF1/6/7 | §1, §9 | Sem servidor; CSP; tudo empacotado. |
| RNF3 | §5 | pdf.js e OCR em workers; 2.000 linhas é trivial para o motor. |
| RNF5 | §6 (9) | Toda linha aparece em alguma categoria. |

## 12. Banco de dados (Supabase)

Migração: `supabase/migrations/20261012000000_esquema_inicial.sql`.

| Tabela | Conteúdo | Quem lê | Quem escreve |
|---|---|---|---|
| `perfis` | id (= auth.users), e-mail, nome, papel, ativo | o próprio usuário; admin todos | trigger ao criar usuário; admin altera outros |
| `sinapi_tabelas` | data-base, arquivos de origem, importado em/por | usuários ativos | admin |
| `sinapi_itens` | data-base, tipo, código, descrição, unidade, preço ND, preço D | usuários ativos | admin |
| `verificacoes` | usuário, arquivo, data-base, regime, BDI, OCR, resumo (jsonb), correções (jsonb) | dono; admin todas | dono (inserção); admin exclui |

Funções `eh_ativo()` e `eh_admin()` (`security definer`, `search_path` vazio) usadas nas políticas.

## 13. Ambientes

| Ambiente | Site | Banco/Auth |
|---|---|---|
| Testes (local) | `vite` / `vite preview` em `localhost` | `supabase start` (Docker); e-mails capturados pelo Mailpit local |
| Produção | GitHub Pages (HTTPS) | Projeto Supabase gratuito; migrações aplicadas por `supabase db push` |

Configuração por variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (públicas por natureza).
Observação: projetos gratuitos do Supabase são pausados após 7 dias sem uso; reativa-se no painel.

## 14. Convite de usuários

O administrador convida pelo painel do Supabase (*Authentication → Users → Invite user*), assim a
chave de serviço nunca precisa estar no site. O convidado recebe um e-mail, abre o link, define
a senha na tela do sistema e entra como **analista**; o admin pode promovê-lo na aba Usuários.
O primeiro usuário do sistema é criado como administrador.

Riscos aceitos: (1) PDFs com layouts muito irregulares podem exigir ajuste manual de
colunas; (2) a ida e volta do ExcelJS pode perder gráficos/imagens da planilha original
(os dados e estilos das células são preservados); (3) OCR depende da qualidade do escaneamento.
