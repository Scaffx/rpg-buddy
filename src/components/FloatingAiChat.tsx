import { useState, useRef, useEffect } from 'react';
import { Brain, X, Send, Loader2, Sparkles, Plus, MessageSquare, Trash2, Menu } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type Msg = { role: 'user' | 'assistant'; content: string };
type Conversation = { id: string; title: string; updated_at: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

const WELCOME: Msg = {
  role: 'assistant',
  content: '⚔️ Saudações, aventureiro! Sou o **Mestre RPG**. Posso consultar seu status, criar e concluir missões para você. Tente: *"como estou hoje?"* ou *"cria uma missão de leitura à noite, atributo Sabedoria"*.',
};

export default function FloatingAiChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Carrega lista de conversas ao abrir
  useEffect(() => {
    if (!open || !user) return;
    loadConversations();
  }, [open, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function loadConversations() {
    const { data } = await supabase
      .from('ai_conversations')
      .select('id,title,updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);
    setConversations((data as any) ?? []);
  }

  async function loadConversation(id: string) {
    setActiveId(id);
    setShowSidebar(false);
    const { data } = await supabase
      .from('ai_messages')
      .select('role,content')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    const msgs = (data ?? [])
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({ role: m.role, content: m.content })) as Msg[];
    setMessages(msgs.length ? msgs : [WELCOME]);
  }

  function startNewChat() {
    setActiveId(null);
    setMessages([WELCOME]);
    setShowSidebar(false);
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Apagar esta conversa?')) return;
    await supabase.from('ai_conversations').delete().eq('id', id);
    if (activeId === id) startNewChat();
    loadConversations();
  }

  async function ensureConversation(firstUserMsg: string): Promise<string | null> {
    if (activeId) return activeId;
    if (!user) return null;
    const title = firstUserMsg.slice(0, 60);
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: user.id, title } as any)
      .select('id')
      .single();
    if (error || !data) return null;
    setActiveId(data.id);
    loadConversations();
    return data.id;
  }

  async function persistMessage(convId: string, role: 'user' | 'assistant', content: string) {
    if (!user) return;
    await supabase.from('ai_messages').insert({
      conversation_id: convId, user_id: user.id, role, content,
    } as any);
    await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() } as any).eq('id', convId);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || !user) return;
    setInput('');
    const userMsg: Msg = { role: 'user', content: text };
    const newHistory = [...messages.filter(m => m !== WELCOME || messages.length > 1), userMsg];
    setMessages(newHistory);
    setLoading(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Sessão expirada');

      const convId = await ensureConversation(text);
      if (convId) await persistMessage(convId, 'user', text);

      // Envia somente as mensagens reais (sem WELCOME) para a IA
      const apiMessages = newHistory
        .filter(m => !(m.role === 'assistant' && m.content === WELCOME.content))
        .map(m => ({ role: m.role, content: m.content }));

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (resp.status === 429) {
        toast({ title: 'Devagar, herói!', description: 'Aguarde alguns segundos.', variant: 'destructive' });
        return;
      }
      if (resp.status === 402) {
        toast({ title: 'Créditos esgotados', description: 'Avise o administrador.', variant: 'destructive' });
        return;
      }
      if (!resp.ok) throw new Error('Falha ao conectar com a IA');

      const data = await resp.json();
      const assistantText = data.content || '...';
      setMessages(prev => [...prev, { role: 'assistant', content: assistantText }]);
      if (convId) await persistMessage(convId, 'assistant', assistantText);
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Erro no chat', description: e?.message ?? 'Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir Chat IA"
          className="fixed bottom-6 right-6 z-50 group"
        >
          <div className="absolute inset-0 rounded-full bg-primary/40 blur-xl group-hover:bg-primary/60 transition-all" />
          <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg border-2 border-primary/50 hover:scale-110 transition-transform">
            <Brain className="w-7 h-7 text-primary-foreground" />
            <Sparkles className="w-3 h-3 text-yellow-300 absolute top-1 right-1 animate-pulse" />
          </div>
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[min(420px,calc(100vw-2rem))] h-[min(620px,calc(100vh-3rem))] bg-card border border-primary/40 rounded-xl shadow-2xl flex overflow-hidden">
          {/* Sidebar de conversas */}
          {showSidebar && (
            <div className="w-44 border-r border-border bg-background/40 flex flex-col">
              <button
                onClick={startNewChat}
                className="m-2 flex items-center gap-2 px-2 py-1.5 text-xs rounded bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
              >
                <Plus className="w-3 h-3" /> Nova
              </button>
              <div className="flex-1 overflow-y-auto scrollbar-none px-1 pb-2 space-y-1">
                {conversations.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center mt-4 px-2">Nenhuma conversa ainda.</p>
                )}
                {conversations.map(c => (
                  <button
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    className={`group w-full text-left px-2 py-1.5 rounded text-[11px] flex items-center gap-1.5 transition-colors ${
                      activeId === c.id ? 'bg-primary/20 text-primary' : 'hover:bg-muted/40 text-foreground/80'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 flex-shrink-0 opacity-60" />
                    <span className="truncate flex-1">{c.title}</span>
                    <Trash2
                      onClick={(e) => deleteConversation(c.id, e)}
                      className="w-3 h-3 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive flex-shrink-0"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat principal */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-primary/20 to-transparent border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setShowSidebar(s => !s)}
                  aria-label="Histórico"
                  className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                >
                  <Menu className="w-4 h-4" />
                </button>
                <Brain className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-display font-bold text-primary truncate">Mestre RPG</h3>
                  <p className="text-[10px] text-muted-foreground">Conselheiro IA</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={startNewChat}
                  aria-label="Nova conversa"
                  className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                  title="Nova conversa"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Fechar"
                  className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-none">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] px-3 py-2 rounded-lg text-sm ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-foreground border border-border prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-strong:text-primary'
                    }`}
                  >
                    {m.role === 'assistant'
                      ? <ReactMarkdown>{m.content}</ReactMarkdown>
                      : m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted/50 border border-border px-3 py-2 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-2.5 border-t border-border bg-background/50">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder="Pergunte ou peça uma ação..."
                  disabled={loading || !user}
                  className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 outline-none disabled:opacity-50"
                />
                <button
                  onClick={send}
                  disabled={loading || !input.trim() || !user}
                  aria-label="Enviar"
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
