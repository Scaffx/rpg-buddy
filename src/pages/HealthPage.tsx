import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, FileText, BarChart3, Heart, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';

export default function HealthPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [medicalRecords, setMedicalRecords] = useState<any[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Upload do arquivo de exame médico
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      // 1. Upload do arquivo para Supabase Storage
      const timestamp = Date.now();
      const fileName = `${user.id}/${timestamp}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('medical-records')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // 2. Obter URL pública do arquivo
      const { data: urlData } = supabase.storage
        .from('medical-records')
        .getPublicUrl(fileName);

      // 3. Salvar referência no banco de dados
      const { error: dbError } = await supabase
        .from('medical_records')
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          uploaded_at: new Date().toISOString(),
        });

      if (dbError) throw dbError;

      toast.success('📄 Exame enviado com sucesso!');
      
      // Recarregar lista de exames
      await loadMedicalRecords();
      
      // Limpar input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      toast.error('Erro ao enviar exame: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  // Carregar exames do usuário
  const loadMedicalRecords = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('medical_records')
        .select('*')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setMedicalRecords(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar exames:', error);
    }
  };

  // Analisar exame com IA
  const analyzeWithAI = useMutation({
    mutationFn: async (recordId: string) => {
      // Aqui você integraria com uma API de IA
      // Por enquanto, simulamos uma análise
      
      // Simular delay de processamento
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Dados fictícios de análise
      return {
        bloodPressure: '120/80',
        cholesterol: 'Normal',
        glucose: '95 mg/dL',
        healthScore: 85,
        recommendations: [
          'Mantenha a ingestão de água adequada',
          'Pratique exercícios regularmente',
          'Reduza o consumo de sal',
        ],
      };
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast.success('✨ Análise concluída!');
    },
    onError: () => {
      toast.error('Erro ao analisar o documento');
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Title */}
        <div className="flex items-center gap-2">
          <Heart className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">Saúde</h1>
        </div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rpg-card border-blue-500/30 flex items-start gap-3 p-4"
        >
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">💡 Dica:</p>
            <p>O acompanhamento regular de sua saúde é importante! Marque suas refeições e hidratação em <strong>"Meu Perfil"</strong> para ganhar XP.</p>
          </div>
        </motion.div>

        {/* Upload Seção */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rpg-card-glow border-emerald-500/30 space-y-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-emerald-400" />
            <h3 className="font-display font-bold text-foreground">📋 Exames Médicos</h3>
          </div>

          {/* Upload Button */}
          <div 
            className="border-2 border-dashed border-emerald-500/30 rounded-xl p-8 text-center space-y-3 hover:border-emerald-500/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            <div className="flex justify-center">
              {uploading ? (
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-emerald-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {uploading ? 'Enviando...' : 'Clique para carregar exame médico'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, Imagem ou Documento (máx. 10MB)
              </p>
            </div>
          </div>

          {/* Lista de Exames */}
          {medicalRecords.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground">Exames Enviados:</p>
              {medicalRecords.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{record.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(record.uploaded_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => analyzeWithAI.mutate(record.id)}
                    disabled={analyzeWithAI.isPending}
                    size="sm"
                    className="text-xs"
                  >
                    {analyzeWithAI.isPending ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      <>
                        <BarChart3 className="w-3 h-3 mr-1" />
                        Analisar
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Resultado da Análise */}
        {analysisResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rpg-card-glow bg-gradient-to-br from-primary/10 to-emerald-500/10 border-emerald-500/30 space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <h3 className="font-display font-bold text-foreground">📊 Resultado da Análise</h3>
            </div>

            {/* Health Score */}
            <div className="text-center p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
              <p className="text-sm text-muted-foreground mb-2">Pontuação de Saúde</p>
              <div className="text-4xl font-bold text-emerald-400 mb-2">{analysisResult.healthScore}%</div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                  style={{ width: `${analysisResult.healthScore}%` }}
                />
              </div>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-muted/30 rounded-lg border border-border/50 text-center">
                <p className="text-xs text-muted-foreground mb-1">Pressão Arterial</p>
                <p className="text-lg font-bold text-blue-400">{analysisResult.bloodPressure}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border border-border/50 text-center">
                <p className="text-xs text-muted-foreground mb-1">Colesterol</p>
                <p className="text-lg font-bold text-yellow-400">{analysisResult.cholesterol}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border border-border/50 text-center">
                <p className="text-xs text-muted-foreground mb-1">Glicose</p>
                <p className="text-lg font-bold text-orange-400">{analysisResult.glucose}</p>
              </div>
            </div>

            {/* Recomendações */}
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground">💡 Recomendações:</p>
              <ul className="space-y-1">
                {analysisResult.recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}

        {/* Tips */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rpg-card space-y-2"
        >
          <h3 className="font-bold text-foreground">💡 Dicas de Saúde</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Beba cerca de 2 litros de água por dia</li>
            <li>Faça 3 refeições principais</li>
            <li>Mantenha uma rotina regular</li>
            <li>Consulte um médico regularmente</li>
            <li>Carregar exames aqui para acompanhar sua saúde</li>
          </ul>
        </motion.div>
      </div>
    </AppLayout>
  );
}
