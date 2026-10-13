# Tarefas — Verificador de Orçamentos SINAPI-BA

> Fase 3 de 3 da spec. Cada etapa segue o ciclo **planejar → revisar → executar → testar → publicar**.
> Legenda: `[ ]` pendente · `[x]` concluída. Entre parênteses, os requisitos atendidos.

## Etapa 0 — Fundação
- [x] 0.1 Projeto Vite + React + TypeScript, Vitest, Playwright, ESLint mínimo
- [x] 0.2 Cópia de workers/WASM/dados de idioma para `public/` no build (RNF7)
- [x] 0.3 CSP + proteção contra iframe no `index.html` (RNF7)
- [x] 0.4 Repositório Git + GitHub + workflow (testes, `npm audit`, build, deploy no Pages) (RNF6)
- [x] 0.5 Supabase: esquema + RLS (migração), config de Auth (sem cadastro público, senha forte) (R10, R11)
- [x] 0.6 Testes de integração das regras RLS no Supabase local (RNF8)
- [x] 0.7 Login, definir senha (convite/recuperação), logout; aba Usuários; histórico (R10–R12)
- [x] 0.8 Projeto Supabase de produção + migrações + variáveis no GitHub Actions

## Etapa 1 — MVP: SINAPI + Excel + verificação + Excel corrigido
- [x] 1.1 Domínio: tipos, números BR, centavos, unidades, similaridade de texto
- [x] 1.2 Importador SINAPI (formato antigo e novo), mesclagem; gravação no banco (R1)
- [x] 1.3 Extração Excel (`.xlsx` + `.xls`) → Grid (R2, R3)
- [x] 1.4 Detecção de tabela, classificação de linhas, metadados (R3)
- [x] 1.5 Motor de verificação: código, descrição, unidade, preço, total, somatórios, BDI (R4–R7)
- [x] 1.6 Writer Excel corrigido (cores, notas, fórmulas, aba de resumo) (R9)
- [x] 1.7 Interface: abas, importação, upload, conferência/mapeamento, resultado, downloads (R1–R3, R8)
- [x] 1.8 Fixtures sintéticas + testes de unidade + E2E Excel
- [ ] 1.9 Publicar e testar em produção

## Etapa 2 — PDF com texto + BDI + relatórios
- [x] 2.1 Extração PDF (pdf.js): linhas, células, atribuição por coluna, continuação de descrição (R2, R3)
- [x] 2.2 PDF anotado (pdf-lib) + Excel corrigido a partir de tabela extraída (R9)
- [x] 2.3 Avisos de BDI: inconsistência e faixa TCU; tipo de obra na tela (R7)
- [x] 2.4 Exportar relatório em Excel e PDF (R8)
- [x] 2.5 Testes de unidade + E2E PDF

## Etapa 3 — Word
- [x] 3.1 Extração DOCX → Grid (tabelas, gridSpan, texto fora de tabela) (R2, R3)
- [x] 3.2 Writer DOCX: troca de texto, sombreamento, comentários, tabela de resumo (R9)
- [x] 3.3 Testes de unidade + E2E DOCX; publicar

## Etapa 4 — OCR (PDF escaneado / imagem)
- [x] 4.1 Detecção de página sem texto; renderização; tesseract `por` self-hosted (R2)
- [x] 4.2 Palavras OCR → Grid (com confiança); imagens JPG/PNG (R2, R3)
- [x] 4.3 Regra de baixa confiança → revisão manual; aviso de OCR no relatório (R2.3, R9.5)
- [x] 4.4 Testes E2E com documento escaneado; publicar
