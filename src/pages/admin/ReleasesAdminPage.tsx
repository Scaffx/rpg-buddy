import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Package, ExternalLink, Loader2, ShieldAlert, Github, Copy, Check, Database, Download } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";

type Release = {
  id: string;
  version: string;
  version_code: number;
  apk_url: string;
  changelog: string | null;
  is_mandatory: boolean;
  released_at: string;
  created_at: string;
};

export default function ReleasesAdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const { data: releases, isLoading } = useQuery({
    queryKey: ["app_releases_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_releases")
        .select("*")
        .order("version_code", { ascending: false });
      if (error) throw error;
      return data as Release[];
    },
    enabled: true,
  });

  const nextVersionCode = useMemo(
    () => (releases?.[0]?.version_code ?? 0) + 1,
    [releases],
  );

  const [version, setVersion] = useState("");
  const [versionCode, setVersionCode] = useState<number>(1);
  const [apkUrl, setApkUrl] = useState("");
  const [changelog, setChangelog] = useState("");
  const [isMandatory, setIsMandatory] = useState(false);

  useEffect(() => {
    setVersionCode(nextVersionCode);
  }, [nextVersionCode]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!version.trim()) throw new Error("Versão é obrigatória (ex: 1.2.0)");
      if (!apkUrl.trim().startsWith("http")) throw new Error("URL do APK inválida");
      const { error } = await supabase.from("app_releases").insert({
        version: version.trim(),
        version_code: versionCode,
        apk_url: apkUrl.trim(),
        changelog: changelog.trim() || null,
        is_mandatory: isMandatory,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nova versão publicada! 🚀");
      setVersion("");
      setApkUrl("");
      setChangelog("");
      setIsMandatory(false);
      qc.invalidateQueries({ queryKey: ["app_releases_admin"] });
      qc.invalidateQueries({ queryKey: ["app-update"] });
      qc.invalidateQueries({ queryKey: ["latest-release"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("app_releases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Release removida");
      qc.invalidateQueries({ queryKey: ["app_releases_admin"] });
      qc.invalidateQueries({ queryKey: ["app-update"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<{ tables: string; rows: string; sizeKb: number } | null>(null);

  const handleExportDatabase = async () => {
    setExporting(true);
    const toastId = toast.loading("Gerando snapshot do banco... pode levar até 30s");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-export-database`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Falha no export (${res.status}): ${text}`);
      }

      const tables = res.headers.get("X-Export-Tables") ?? "?";
      const rows = res.headers.get("X-Export-Rows") ?? "?";
      const blob = await res.blob();

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `rpgbuddy-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      setLastExport({ tables, rows, sizeKb: Math.round(blob.size / 1024) });
      toast.success(`Snapshot baixado: ${tables} tabelas, ${rows} linhas`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado", { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="container max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
            <h1 className="font-display text-2xl md:text-3xl text-primary flex items-center gap-2">
              <Package className="w-6 h-6" /> Painel de Releases (APK)
            </h1>
            <p className="text-sm text-muted-foreground">
              Publique novas versões do app Android. Os usuários verão a atualização automaticamente.
            </p>
          </div>
        </div>

        {/* Tutorial GitHub Releases */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Github className="w-5 h-5" /> Como subir um novo APK pelo GitHub
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Gere o APK no Android Studio: <code className="text-primary">Build → Generate Signed Bundle / APK</code>.</li>
              <li>No GitHub, vá no seu repo → <strong>Releases</strong> → <strong>Draft a new release</strong>.</li>
              <li>Crie uma nova tag (ex: <code className="text-primary">v1.1.0</code>) e arraste o arquivo <code className="text-primary">.apk</code> em "Attach binaries".</li>
              <li>Publique a release. Clique com o botão direito no APK e <strong>Copiar link</strong>.</li>
              <li>Cole o link no campo <strong>URL do APK</strong> abaixo e publique.</li>
            </ol>
          </CardContent>
        </Card>

        {/* Form nova release */}
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Publicar nova versão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="version">Versão (semver)</Label>
                <Input
                  id="version"
                  placeholder="1.2.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">Ex: 1.2.0, 1.2.1-beta</p>
              </div>
              <div>
                <Label htmlFor="vcode">Version code (auto)</Label>
                <Input
                  id="vcode"
                  type="number"
                  value={versionCode}
                  onChange={(e) => setVersionCode(parseInt(e.target.value) || 1)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Sempre maior que o anterior ({(releases?.[0]?.version_code ?? 0)})
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="apk">URL do APK</Label>
              <Input
                id="apk"
                placeholder="https://github.com/seu-usuario/seu-repo/releases/download/v1.2.0/app.apk"
                value={apkUrl}
                onChange={(e) => setApkUrl(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="changelog">Changelog (Markdown)</Label>
              <Textarea
                id="changelog"
                placeholder="- Correção de bugs no XP&#10;- Nova animação de level up&#10;- Performance melhorada"
                rows={5}
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={isMandatory} onCheckedChange={setIsMandatory} id="mandatory" />
              <Label htmlFor="mandatory" className="cursor-pointer">
                Atualização obrigatória (bloqueia uso até atualizar)
              </Label>
            </div>

            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="w-full md:w-auto bg-primary hover:bg-primary/90"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Publicar versão
            </Button>
          </CardContent>
        </Card>

        {/* Backup & Migração */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="w-5 h-5" /> Backup & Migração do Banco
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              Baixe um snapshot completo de todos os dados do banco em um único arquivo <strong>.zip</strong>.
              Cada tabela é exportada em <strong>JSON</strong> (sem perda de tipos) e <strong>CSV</strong> (Excel).
            </p>
            <p className="text-xs">
              Use isso para migrar para um Supabase próprio: rode <code className="text-primary">supabase db push</code> no novo projeto
              (recria o schema a partir das migrations) e importe os arquivos do ZIP.
              <br />
              <span className="text-amber-400">Não inclui: arquivos do Storage, secrets, e usuários do Auth.</span>
            </p>
            <Button
              onClick={handleExportDatabase}
              disabled={exporting}
              variant="outline"
              className="border-primary/40"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Baixar snapshot completo (.zip)
            </Button>
            {lastExport && (
              <p className="text-xs text-emerald-400">
                Último export: {lastExport.tables} tabelas, {lastExport.rows} linhas, {lastExport.sizeKb} KB.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Lista de releases */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de releases ({releases?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
            {!isLoading && (releases?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma release publicada ainda.</p>
            )}
            {releases?.map((r, idx) => (
              <ReleaseRow
                key={r.id}
                release={r}
                isLatest={idx === 0}
                onDelete={() => {
                  if (confirm(`Remover a versão ${r.version}?`)) deleteMutation.mutate(r.id);
                }}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function ReleaseRow({
  release,
  isLatest,
  onDelete,
}: {
  release: Release;
  isLatest: boolean;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(release.apk_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="border border-border/60 rounded-lg p-3 hover:border-primary/40 transition-colors">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Badge className="bg-primary/20 text-primary border-primary/40 font-mono">
          v{release.version}
        </Badge>
        <Badge variant="outline" className="font-mono text-xs">
          code {release.version_code}
        </Badge>
        {isLatest && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">ATUAL</Badge>}
        {release.is_mandatory && <Badge variant="destructive">obrigatória</Badge>}
        <span className="text-xs text-muted-foreground ml-auto">
          {new Date(release.released_at).toLocaleString("pt-BR")}
        </span>
      </div>
      {release.changelog && (
        <pre className="text-xs text-muted-foreground bg-background/40 rounded p-2 whitespace-pre-wrap font-sans mb-2">
          {release.changelog}
        </pre>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
          {copied ? "Copiado" : "Copiar URL"}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={release.apk_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-3 h-3 mr-1" /> Abrir APK
          </a>
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="w-3 h-3 mr-1" /> Remover
        </Button>
      </div>
    </div>
  );
}
