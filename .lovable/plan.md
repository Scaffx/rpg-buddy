# Plano: Export completo do banco em um clique

Criar uma ferramenta de export para você (admin) baixar um snapshot completo de todos os dados do projeto, pronto para importar em um Supabase próprio.

## O que será criado

### 1. Edge function `admin-export-database`
- Protegida por `is_system_admin()` (apenas seu usuário com `app_metadata.role = 'admin'`)
- Usa a `SUPABASE_SERVICE_ROLE_KEY` (já configurada) para ler todas as 41 tabelas do schema `public`, ignorando RLS
- Para cada tabela: lê em lotes de 1000 linhas (contornando o limite do Supabase) até esgotar
- Gera um ZIP em memória contendo:
  - `data/<tabela>.json` — uma entrada por tabela (JSON é mais seguro que CSV para tipos como `jsonb`, arrays, timestamps)
  - `data/<tabela>.csv` — versão CSV opcional para abrir em Excel
  - `manifest.json` — lista de tabelas, contagem de linhas, timestamp do export, versão do schema
  - `README.md` — instruções de como importar no novo Supabase
- Retorna o ZIP como download (`Content-Type: application/zip`)

### 2. Botão na página `/admin/releases`
Adicionar um card novo "Backup & Migração" com:
- Botão **"Baixar snapshot completo (.zip)"** — chama a edge function e dispara download
- Mostra tamanho aproximado e número de tabelas após gerar
- Texto explicativo curto: "Use este arquivo para migrar para um Supabase próprio. As migrations SQL no repo recriam o schema; este ZIP traz os dados."

### 3. O que o export NÃO inclui (e por quê)
- **Schema/RLS/functions/triggers**: já estão versionados em `supabase/migrations/` no seu repo — `supabase db push` recria tudo
- **Edge functions**: código já está em `supabase/functions/` no repo
- **Storage (`body-photos`)**: arquivos binários de usuários — fora do escopo deste export. Se quiser, em uma segunda iteração crio um script separado que lista e baixa via service role
- **Secrets**: por segurança nunca devem sair do ambiente; você reconfigura manualmente

## Detalhes técnicos

- Lib de ZIP: `jsr:@zip-js/zip-js` (funciona em Deno edge runtime, sem dependências nativas)
- Paginação: `range(offset, offset+999)` em loop até receber menos de 1000
- Tabelas excluídas: nenhuma — exporta todas as 41 tabelas do `public`
- Tempo estimado: <30s para um banco do tamanho atual; resposta é streamada como blob
- CORS habilitado (chamada feita do app web)
- Validação dupla: edge function valida JWT + checa `is_system_admin()` via RPC antes de qualquer leitura

## Como você vai usar

1. Acessa `/admin/releases` (já protegido por admin)
2. Clica em "Baixar snapshot completo"
3. Recebe `rpgbuddy-export-2026-04-30.zip`
4. No projeto Supabase próprio:
   - `supabase db push` (roda suas migrations → recria schema/RLS/functions)
   - Importa cada `data/<tabela>.json` via UI do Supabase ou script `psql`/`\copy`
   - Reconfigura buckets e secrets manualmente

## Arquivos

- **Criar**: `supabase/functions/admin-export-database/index.ts`
- **Editar**: `src/pages/admin/ReleasesAdminPage.tsx` (adicionar card de backup)

Sem migrations SQL — não precisa mexer em schema. Sem novas dependências no front (usa `supabase.functions.invoke` que já existe).