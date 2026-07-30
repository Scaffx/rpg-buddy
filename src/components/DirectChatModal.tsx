import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Send, X, Loader2, MoreVertical, Ban, Flag, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ReportUserDialog from '@/components/ReportUserDialog';
import { useAuth } from '@/hooks/useAuth';
import {
  useDirectMessages,
  useSendDirectMessage,
  useMarkConversationRead,
} from '@/hooks/useDirectMessages';
import { useBlockUser, useUnblockUser, useIsBlocked } from '@/hooks/useModeration';
import { isOnline } from '@/hooks/usePresence';
import { starterClassDisplayName } from '@/hooks/useHeroClass';

type Friend = {
  user_id: string;
  display_name: string | null;
  level: number;
  starter_class: string | null;
  current_class_name?: string | null;
  last_seen_at?: string | null;
};

export default function DirectChatModal({
  friend,
  onClose,
}: {
  friend: Friend;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useDirectMessages(friend.user_id);
  const sendMessage = useSendDirectMessage();
  const markRead = useMarkConversationRead();

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const blocked = useIsBlocked(friend.user_id);
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Marca todas como lidas ao abrir o modal
  useEffect(() => {
    if (friend.user_id) {
      markRead.mutate(friend.user_id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friend.user_id]);

  // Auto-scroll quando chega mensagem nova
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!draft.trim()) return;
    sendMessage.mutate(
      { receiverId: friend.user_id, content: draft },
      {
        onSuccess: () => setDraft(''),
        onError: (e: any) => toast.error(e.message || 'Erro ao enviar mensagem'),
      },
    );
  };

  const handleBlock = () => {
    blockUser.mutate(friend.user_id, {
      onSuccess: () => {
        toast.success(`${friend.display_name || 'Aventureiro'} foi bloqueado`, {
          description: 'A conversa some para os dois lados e ninguém mais consegue escrever.',
        });
        setConfirmBlock(false);
      },
      onError: (e: any) => toast.error(e.message || 'Não foi possível bloquear'),
    });
  };

  const handleUnblock = () => {
    unblockUser.mutate(friend.user_id, {
      onSuccess: () => toast.success('Bloqueio desfeito'),
      onError: (e: any) => toast.error(e.message || 'Não foi possível desbloquear'),
    });
  };

  const online = isOnline(friend.last_seen_at);
  const displayClass = friend.current_class_name ?? starterClassDisplayName(friend.starter_class);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-2 sm:px-4">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.97 }}
        className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl flex flex-col h-[80vh] sm:h-[600px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg shrink-0">
                {friend.display_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                  online ? 'bg-emerald-500' : 'bg-muted-foreground'
                }`}
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">
                {friend.display_name || 'Aventureiro'}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                Nv {friend.level} · {displayClass} · {online ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Mais opções"
                  className="p-1.5 hover:bg-muted/40 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setReportOpen(true)}>
                  <Flag className="w-4 h-4 mr-2" />
                  Denunciar
                </DropdownMenuItem>
                {blocked ? (
                  <DropdownMenuItem onClick={handleUnblock} disabled={unblockUser.isPending}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Desbloquear
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => setConfirmBlock(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Ban className="w-4 h-4 mr-2" />
                    Bloquear
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={onClose}
              aria-label="Fechar conversa"
              className="p-1.5 hover:bg-muted/40 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mensagens */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-8">
              Nenhuma mensagem ainda. Diga oi! 👋
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p className={`text-[10px] mt-0.5 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {new Date(m.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {mine && m.read_at && ' · lida'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input — bloqueado troca o compositor por um aviso com saída */}
        {blocked ? (
          <div className="px-4 py-4 border-t border-border text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Você bloqueou {friend.display_name || 'este aventureiro'}. Ninguém consegue
              escrever enquanto o bloqueio existir.
            </p>
            <Button variant="outline" size="sm" onClick={handleUnblock} disabled={unblockUser.isPending}>
              {unblockUser.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Desbloquear'
              )}
            </Button>
          </div>
        ) : (
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Digite uma mensagem…"
              maxLength={1000}
              rows={1}
              className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary/60 resize-none max-h-32"
            />
            <Button
              onClick={handleSend}
              disabled={!draft.trim() || sendMessage.isPending}
              size="sm"
              className="shrink-0"
            >
              {sendMessage.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Enter envia · Shift+Enter quebra linha · {draft.length}/1000
          </p>
        </div>
        )}
      </motion.div>

      <AlertDialog open={confirmBlock} onOpenChange={setConfirmBlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Bloquear {friend.display_name || 'este aventureiro'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A conversa some para os dois lados e nenhum dos dois consegue mandar mensagem.
              A pessoa não é avisada do bloqueio. Você pode desfazer quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={blockUser.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBlock} disabled={blockUser.isPending}>
              {blockUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bloquear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReportUserDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        reportedUserId={friend.user_id}
        reportedName={friend.display_name || 'Aventureiro'}
      />
    </div>
  );
}
