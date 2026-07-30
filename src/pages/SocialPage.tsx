import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "@/components/AppLayout";
import TranslatedGuidedTour from '@/components/TranslatedGuidedTour';
import {
  useFriends,
  usePendingRequests,
  useSentRequests,
  useCancelSentRequest,
  useSearchProfile,
  useSendFriendRequest,
  useRespondFriendRequest,
  useRemoveFriend,
  useCoOpMissions,
  useCreateCoOpMission,
  useCompleteCoOpMission,
  type CoOpMission,
} from "@/hooks/useFriends";
import { useAuth } from "@/hooks/useAuth";
import { isOnline } from "@/hooks/usePresence";
import { useUnreadCounts } from "@/hooks/useDirectMessages";
import DirectChatModal from "@/components/DirectChatModal";
import { toast } from "sonner";
import {
  Users, UserPlus, UserCheck, UserX, Search, Swords,
  CheckCircle, Clock, Star, X, Plus, Trash2, Send, Ban, MessageSquare,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────
// Modal: Criar Missão em Conjunto
// ────────────────────────────────────────────────────────────────
function CoOpMissionModal({
  onClose,
  preselectedFriendId,
}: {
  onClose: () => void;
  preselectedFriendId?: string;
}) {
  const { t } = useTranslation();
  const { data: friends = [] } = useFriends();
  const createMission = useCreateCoOpMission();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    preselectedFriendId ? [preselectedFriendId] : []
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const handleCreate = () => {
    if (!title.trim()) return toast.error(t('app.social.toast_title_required'));
    if (selectedIds.length === 0) return toast.error(t('app.social.toast_select_friend'));
    createMission.mutate(
      { title: title.trim(), description: description.trim(), memberIds: selectedIds },
      {
        onSuccess: () => {
          toast.success(t('app.social.toast_mission_created'));
          onClose();
        },
        onError: (e: any) => toast.error(e.message || t('app.social.toast_mission_error')),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-card border border-border rounded-2xl p-5 space-y-4"
      >
        {/* Header */}
        <div data-tour="social-header" className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">{t('app.social.coop_mission')}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          {t('app.social.invite_desc')} <strong className="text-primary">{t('app.social.invite_xp')}</strong>.
        </p>

        {/* Título */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t('app.social.mission_title_label')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder={t('app.social.mission_title_placeholder')}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary/60"
          />
        </div>

        {/* Descrição */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t('app.social.mission_desc_label')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder={t('app.social.mission_desc_placeholder')}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary/60 resize-none"
          />
        </div>

        {/* Selecionar amigos */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">
            {t('app.social.invite_friends', { count: selectedIds.length })}
          </label>
          {friends.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">{t('app.social.no_friends_yet')}</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {friends.map((f) => {
                const profile = f.other_profile;
                if (!profile) return null;
                const selected = selectedIds.includes(profile.user_id);
                return (
                  <button
                    key={profile.user_id}
                    onClick={() => toggle(profile.user_id)}
                    disabled={!selected && selectedIds.length >= 4}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
                      selected
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border bg-muted/30 text-foreground hover:bg-muted/60 disabled:opacity-40"
                    }`}
                  >
                    <span className="font-medium truncate">{profile.display_name || t('app.social.hero')}</span>
                    <span className="text-xs text-muted-foreground">{t('app.social.level_short', { level: profile.level })}</span>
                    {selected && <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={handleCreate}
          disabled={createMission.isPending}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {createMission.isPending ? t('app.social.creating') : t('app.social.create_coop_mission')}
        </button>
      </motion.div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Card: Missão em Conjunto
// ────────────────────────────────────────────────────────────────
function CoOpMissionCard({ mission, currentUserId }: { mission: CoOpMission; currentUserId: string }) {
  const { t } = useTranslation();
  const completeMission = useCompleteCoOpMission();
  const myMember = mission.members?.find((m) => m.user_id === currentUserId);
  const allDone = mission.members?.every((m) => m.completed) ?? false;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-foreground">{mission.title}</h4>
          {mission.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{mission.description}</p>
          )}
        </div>
        <span className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 bg-primary/15 text-primary rounded-full text-xs font-bold">
          <Star className="w-3 h-3" /> {mission.xp_per_player} XP
        </span>
      </div>

      {/* Membros */}
      <div className="flex flex-wrap gap-1.5">
        {mission.members?.map((m) => (
          <div
            key={m.user_id}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${
              m.completed
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                : "border-border bg-muted/30 text-muted-foreground"
            }`}
          >
            {m.completed ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            <span>{m.profile?.display_name || t('app.social.hero')}</span>
          </div>
        ))}
      </div>

      {/* Ação */}
      {myMember && !myMember.completed ? (
        <button
          onClick={() =>
            completeMission.mutate(mission.id, {
              onSuccess: () => toast.success(t('app.social.toast_xp_claimed', { xp: mission.xp_per_player })),
              onError: (e: any) => toast.error(e.message),
            })
          }
          disabled={completeMission.isPending}
          className="w-full py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-semibold hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
        >
          {completeMission.isPending ? t('app.social.completing') : t('app.social.mark_completed')}
        </button>
      ) : myMember?.completed ? (
        <p className="text-xs text-center text-emerald-400 font-medium py-1">
          {t('app.social.you_completed')} {allDone ? t('app.social.mission_closed') : t('app.social.waiting_others')}
        </p>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Página Principal
// ────────────────────────────────────────────────────────────────
export default function SocialPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<"friends" | "missions">("friends");
  const [friendSearch, setFriendSearch] = useState("");
  const [showCoOpModal, setShowCoOpModal] = useState(false);
  const [preselectedFriend, setPreselectedFriend] = useState<string | undefined>();

  const { data: friends = [] } = useFriends();
  const { data: pendingRequests = [] } = usePendingRequests();
  const { data: sentRequests = [] } = useSentRequests();
  const { data: searchResults = [], isFetching: isSearching } = useSearchProfile(friendSearch);
  const { data: coOpMissions = [] } = useCoOpMissions();
  const { data: unreadCounts = {} } = useUnreadCounts();
  const [chatFriendId, setChatFriendId] = useState<string | null>(null);

  const sendFriendRequest = useSendFriendRequest();
  const respondFriendRequest = useRespondFriendRequest();
  const cancelSentRequest = useCancelSentRequest();
  const removeFriend = useRemoveFriend();

  // Solicitações enviadas que ainda estão pending — separadas das já respondidas
  // para destaque visual diferente.
  const sentPending = sentRequests.filter((r) => r.status === 'pending');
  const sentResolved = sentRequests.filter((r) => r.status !== 'pending');

  const openCoOpModal = (friendId?: string) => {
    setPreselectedFriend(friendId);
    setShowCoOpModal(true);
  };

  return (
    <AppLayout>
      <AnimatePresence>
        {showCoOpModal && (
          <CoOpMissionModal
            onClose={() => setShowCoOpModal(false)}
            preselectedFriendId={preselectedFriend}
          />
        )}
        {chatFriendId && (() => {
          const friendRow = friends.find((f) => f.other_profile?.user_id === chatFriendId);
          const friendProfile = friendRow?.other_profile;
          if (!friendProfile) return null;
          return (
            <DirectChatModal
              friend={{
                user_id: friendProfile.user_id,
                display_name: friendProfile.display_name,
                level: friendProfile.level,
                starter_class: friendProfile.starter_class,
                current_class_name: friendProfile.current_class_name,
                last_seen_at: friendProfile.last_seen_at,
              }}
              onClose={() => setChatFriendId(null)}
            />
          );
        })()}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> {t('app.social.title')}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('app.social.friends_count', { count: friends.length })}
              {pendingRequests.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full text-xs font-bold">
                  {t('app.social.pending_count', { count: pendingRequests.length })}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => openCoOpModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-bold hover:bg-primary/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t('app.social.new_mission')}
          </button>
        </div>

        {/* Tabs */}
        <div data-tour="social-tabs" className="flex gap-2 bg-muted/30 rounded-xl p-1">
          {(["friends", "missions"] as const).map((tabId) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === tabId
                  ? "bg-card text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabId === "friends" ? t('app.social.tab_friends') : t('app.social.tab_missions')}
            </button>
          ))}
        </div>

        <div data-tour="social-content">
        {/* ── TAB: AMIGOS ── */}
        {tab === "friends" && (
          <div className="space-y-4">
            {/* Solicitações pendentes */}
            {pendingRequests.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-amber-400">
                  {t('app.social.requests_pending_count', { count: pendingRequests.length })}
                </p>
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-card border border-border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {req.other_profile?.display_name || t('app.social.adventurer')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('app.social.level_class', { level: req.other_profile?.level || "?", class: req.other_profile?.starter_class || t('app.social.beginner') })}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() =>
                          respondFriendRequest.mutate(
                            { requestId: req.id, accept: true },
                            {
                              onSuccess: () => toast.success(t('app.social.toast_friend_added')),
                              onError: (e: any) => toast.error(e.message),
                            }
                          )
                        }
                        className="p-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          respondFriendRequest.mutate(
                            { requestId: req.id, accept: false },
                            { onError: (e: any) => toast.error(e.message) }
                          )
                        }
                        className="p-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Solicitações enviadas */}
            {(sentPending.length > 0 || sentResolved.length > 0) && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">
                    {t('app.social.sent_requests')}
                  </h3>
                  {sentPending.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-bold">
                      {t('app.social.waiting_count', { count: sentPending.length })}
                    </span>
                  )}
                </div>

                {sentPending.length > 0 && (
                  <div className="space-y-1.5">
                    {sentPending.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {req.other_profile?.display_name || t('app.social.adventurer')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t('app.social.level_class', { level: req.other_profile?.level || "?", class: req.other_profile?.starter_class || t('app.social.beginner') })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full font-medium">
                            {t('app.social.status_pending')}
                          </span>
                          <button
                            onClick={() =>
                              cancelSentRequest.mutate(req.id, {
                                onSuccess: () => toast.success(t('app.social.toast_request_cancelled')),
                                onError: (e: any) => toast.error(e.message || t('app.social.toast_cancel_error')),
                              })
                            }
                            title={t('app.social.cancel_request')}
                            className="p-1.5 bg-muted/50 text-muted-foreground border border-border rounded-lg hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {sentResolved.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {sentResolved.map((req) => {
                      const accepted = req.status === 'accepted';
                      return (
                        <div
                          key={req.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {req.other_profile?.display_name || t('app.social.adventurer')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('app.social.level_class', { level: req.other_profile?.level || "?", class: req.other_profile?.starter_class || t('app.social.beginner') })}
                            </p>
                          </div>
                          {accepted ? (
                            <span className="text-xs px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> {t('app.social.status_accepted')}
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border border-border rounded-full font-medium">
                              {t('app.social.status_declined')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Buscar amigo */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">{t('app.social.add_friend')}</h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder={t('app.social.search_placeholder')}
                  className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:border-primary/50 outline-none"
                />
                {isSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-1.5">
                  {searchResults.map((profile) => {
                    const alreadyFriend = friends.some(
                      (f) => f.other_profile?.user_id === profile.user_id
                    );
                    return (
                      <div
                        key={profile.user_id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {profile.display_name || t('app.social.adventurer')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t('app.social.level_class', { level: profile.level, class: profile.starter_class || t('app.social.beginner') })}
                          </p>
                        </div>
                        {alreadyFriend ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" /> {t('app.social.friends_label')}
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              sendFriendRequest.mutate(profile.user_id, {
                                onSuccess: () => {
                                  toast.success(t('app.social.toast_request_sent', { name: profile.display_name }));
                                  setFriendSearch("");
                                },
                                onError: (e: any) => toast.error(e.message || t('app.social.toast_send_error')),
                              })
                            }
                            disabled={sendFriendRequest.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium hover:bg-primary/30 transition-colors disabled:opacity-50"
                          >
                            <UserPlus className="w-3 h-3" /> {t('app.social.add')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {friendSearch.length >= 2 && !isSearching && searchResults.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">{t('app.social.no_hero_found')}</p>
              )}
            </div>

            {/* Lista de amigos */}
            <div className="space-y-2">
              {friends.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center space-y-2">
                  <Users className="w-8 h-8 text-muted-foreground mx-auto opacity-40" />
                  <p className="text-sm text-muted-foreground">{t('app.social.no_friends_search')}</p>
                </div>
              ) : (
                friends.map((f) => {
                  const profile = f.other_profile;
                  if (!profile) return null;
                  const online = isOnline(profile.last_seen_at);
                  const className = profile.current_class_name ?? profile.starter_class ?? t('app.social.beginner');
                  const unread = unreadCounts[profile.user_id] ?? 0;
                  return (
                    <motion.div
                      key={f.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-base">
                            {profile.display_name?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                              online ? "bg-emerald-500" : "bg-muted-foreground"
                            }`}
                            title={online ? t('app.social.online') : t('app.social.offline')}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {profile.display_name || t('app.social.hero')}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {t('app.social.level_class_status', { level: profile.level, class: className, status: online ? t('app.social.online') : t('app.social.offline') })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => setChatFriendId(profile.user_id)}
                          title={t('app.social.send_message')}
                          className="relative flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-500/25 transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" />
                          {unread > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                              {unread > 9 ? "9+" : unread}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => openCoOpModal(profile.user_id)}
                          title={t('app.social.invite_coop')}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-primary/15 text-primary border border-primary/30 rounded-lg text-xs font-medium hover:bg-primary/25 transition-colors"
                        >
                          <Swords className="w-3 h-3" /> {t('app.social.mission')}
                        </button>
                        <button
                          onClick={() =>
                            removeFriend.mutate(f.id, {
                              onSuccess: () => toast.success(t('app.social.toast_friend_removed')),
                              onError: (e: any) => toast.error(e.message),
                            })
                          }
                          title={t('app.social.remove_friend')}
                          className="p-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── TAB: MISSÕES EM CONJUNTO ── */}
        {tab === "missions" && (
          <div className="space-y-3">
            {coOpMissions.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
                <Swords className="w-8 h-8 text-muted-foreground mx-auto opacity-40" />
                <p className="text-sm text-muted-foreground">
                  {t('app.social.no_active_missions')}
                </p>
                <button
                  onClick={() => openCoOpModal()}
                  className="mx-auto flex items-center gap-1.5 px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-sm font-bold hover:bg-primary/30 transition-colors"
                >
                  <Plus className="w-4 h-4" /> {t('app.social.create_mission')}
                </button>
              </div>
            ) : (
              <>
                {coOpMissions.map((m) => (
                  <CoOpMissionCard key={m.id} mission={m} currentUserId={user?.id ?? ""} />
                ))}
                <button
                  onClick={() => openCoOpModal()}
                  className="w-full py-2.5 border border-dashed border-primary/30 text-primary/70 rounded-xl text-sm font-medium hover:border-primary/60 hover:text-primary transition-colors"
                >
                  {t('app.social.create_new_mission')}
                </button>
              </>
            )}
          </div>
        )}
        </div>
      </div>
      <TranslatedGuidedTour
        tourKey="social"
        targets={[
          { target: 'social-header', key: 'overview' },
          { target: 'social-tabs', key: 'tabs' },
          { target: 'social-content', key: 'content' },
        ]}
      />
    </AppLayout>
  );
}
