# Verificador SINAPI-BA

Sistema web que lê orçamentos de obra (Excel, PDF, Word ou documento escaneado), compara cada item
com a tabela **SINAPI da Bahia** da data-base informada, aponta as divergências e gera uma **versão
corrigida** do documento com cada correção marcada (valor original registrado).

- Especificação (desenvolvimento por specs): [`specs/verificador-sinapi/`](specs/verificador-sinapi/)
  — [requisitos](specs/verificador-sinapi/requirements.md) · [design](specs/verificador-sinapi/design.md) · [tarefas](specs/verificador-sinapi/tasks.md)
- Site estático (GitHub Pages) + Supabase (login, PostgreSQL com RLS). O arquivo do orçamento é
  processado no navegador e **não** é enviado ao servidor.

## Rodar localmente (testes)

Pré-requisitos: Node 24+, Docker Desktop.

```bash
npm install
npm run db:start        # Supabase local (Docker) + migrações
npm run env:local       # cria .env.local apontando para o Supabase local
npm run dev             # http://localhost:5173/verificador-sinapi-ba/
```

Usuários locais: crie pelo Studio local (http://127.0.0.1:54323 → Authentication → Add user).
O primeiro usuário vira administrador. E-mails locais (convites, senha) aparecem em http://127.0.0.1:54324.

## Testes

```bash
npm test                 # unidade
npm run test:integration # regras de segurança (RLS) no Supabase local
npm run build && npm run test:e2e   # ponta a ponta (Playwright) no build de produção
```

## Produção

O GitHub Actions roda todos os testes e, na branch `main`, publica no GitHub Pages (e aplica as
migrações no Supabase de produção, se os segredos opcionais estiverem configurados). Configuração do repositório:

| Tipo | Nome | Valor |
|---|---|---|
| Variable | `SUPABASE_PROJECT_REF` | referência do projeto Supabase |
| Variable | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| Variable | `VITE_SUPABASE_ANON_KEY` | chave pública (anon) |
| Secret (opcional) | `SUPABASE_ACCESS_TOKEN` | só se quiser que o CI aplique as migrações |
| Secret (opcional) | `SUPABASE_DB_PASSWORD` | idem |

Sem os segredos, aplique as migrações manualmente: `npx supabase link --project-ref <ref>` e `npx supabase db push`.

Convidar usuários: painel do Supabase → Authentication → Users → *Invite user*.
