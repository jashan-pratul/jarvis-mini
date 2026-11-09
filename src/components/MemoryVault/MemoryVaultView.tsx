import { useCallback, useEffect, useState } from 'react';
import { Brain, Check, Edit3, KeyRound, Lock, Plus, StickyNote, Terminal, Trash2, Unlock } from 'lucide-react';
import { useJarvisStore } from '../../hooks/useJarvisStore';
import { ApiError, memoryApi, type SecretCommandItem, type StoredItem } from '../../services/api';
import { sfx } from '../../utils/sfx';

type VaultTab = 'memories' | 'notes' | 'secrets';

const BUILTIN_SECRETS = [
  { trigger: "JARVIS, who's the boss?", reply: 'That would be Aadarsh, obviously. I simply handle the intelligence around here.' },
  { trigger: 'JARVIS, surprise me.', reply: 'Shares a surprising space/computing fact or brain teaser.' },
  { trigger: 'JARVIS, tell everyone a joke.', reply: 'Delivers a clean computer-science or science joke aloud.' },
  { trigger: 'JARVIS, give me a mind-blowing fact.', reply: 'Shares a verified neutron-star, cosmology, or relativity fact.' },
  { trigger: 'JARVIS, explain something unbelievable.', reply: 'Explains time dilation, entanglement, or biological immortality.' },
  { trigger: 'JARVIS, challenge my friends.', reply: 'Opens the Friends Challenge Arena immediately.' },
  { trigger: 'JARVIS, quiz everyone.', reply: 'Opens the Friends Challenge Arena for group play.' },
];

export function MemoryVaultView() {
  const backend = useJarvisStore((s) => s.backend);
  const ownerKey = useJarvisStore((s) => s.ownerKey);
  const setOwnerKey = useJarvisStore((s) => s.setOwnerKey);
  const clearMessages = useJarvisStore((s) => s.clearMessages);
  const toast = useJarvisStore((s) => s.toast);

  const [tab, setTab] = useState<VaultTab>('memories');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [memoriesList, setMemoriesList] = useState<StoredItem[]>([]);
  const [notesList, setNotesList] = useState<StoredItem[]>([]);
  const [secretsList, setSecretsList] = useState<SecretCommandItem[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);

  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const [newTrigger, setNewTrigger] = useState('');
  const [newResponse, setNewResponse] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const secretsRes = await memoryApi.listSecretCommands();
      setSecretsList(secretsRes.items);

      if (backend?.ownerProtected && !ownerKey) {
        setLocked(true);
        return;
      }

      const [memRes, noteRes] = await Promise.all([
        memoryApi.listMemories(ownerKey),
        memoryApi.listNotes(ownerKey),
      ]);
      setMemoriesList(memRes.items);
      setNotesList(noteRes.items);
      setLocked(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLocked(true);
      } else {
        toast(err instanceof Error ? err.message : 'Could not load Vault.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [backend?.ownerProtected, ownerKey, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcodeInput.trim()) return;
    setVerifying(true);
    try {
      await memoryApi.verifyPasscode(passcodeInput.trim());
      setOwnerKey(passcodeInput.trim());
      setPasscodeInput('');
      sfx.success();
      toast('Memory Vault unlocked', 'success');
    } catch (err) {
      sfx.error();
      toast(err instanceof Error ? err.message : 'Incorrect passcode', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newContent.trim();
    if (!content) return;
    try {
      if (tab === 'memories') {
        const res = await memoryApi.addMemory(content, ownerKey);
        setMemoriesList((prev) => [res.item, ...prev]);
      } else if (tab === 'notes') {
        const res = await memoryApi.addNote(content, ownerKey);
        setNotesList((prev) => [res.item, ...prev]);
      }
      setNewContent('');
      sfx.success();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save item.', 'error');
    }
  };

  const handleSaveEdit = async (id: number) => {
    const content = editingText.trim();
    if (!content) return;
    try {
      if (tab === 'memories') {
        const res = await memoryApi.updateMemory(id, content, ownerKey);
        setMemoriesList((prev) => prev.map((x) => (x.id === id ? res.item : x)));
      } else {
        const res = await memoryApi.updateNote(id, content, ownerKey);
        setNotesList((prev) => prev.map((x) => (x.id === id ? res.item : x)));
      }
      setEditingId(null);
      sfx.tap();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  };

  const handleDeleteItem = async (id: number) => {
    try {
      if (tab === 'memories') {
        await memoryApi.deleteMemory(id, ownerKey);
        setMemoriesList((prev) => prev.filter((x) => x.id !== id));
      } else if (tab === 'notes') {
        await memoryApi.deleteNote(id, ownerKey);
        setNotesList((prev) => prev.filter((x) => x.id !== id));
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const handleAddSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrigger.trim() || !newResponse.trim()) return;
    try {
      const res = await memoryApi.addSecretCommand(newTrigger.trim(), newResponse.trim(), ownerKey);
      setSecretsList((prev) => [...prev, res.item]);
      setNewTrigger('');
      setNewResponse('');
      sfx.success();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save secret command.', 'error');
    }
  };

  const handleDeleteSecret = async (id: number) => {
    try {
      await memoryApi.deleteSecretCommand(id, ownerKey);
      setSecretsList((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete secret command.', 'error');
    }
  };

  const activeItems = tab === 'memories' ? memoriesList : notesList;

  return (
    <section className="scroll-area mx-auto h-full w-full max-w-3xl px-3 py-3" aria-label="Memory Vault">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="hud-label text-[10px] text-cyan">Persistent SQLite Storage</p>
          <h2 className="font-display text-lg font-bold text-white">Memory Vault & Secrets</h2>
        </div>
        {backend?.ownerProtected && ownerKey && (
          <button
            type="button"
            onClick={() => {
              setOwnerKey(null);
              setLocked(true);
            }}
            className="btn-hud h-11 px-3 text-xs"
          >
            <Lock size={14} /> Lock
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          { id: 'memories' as VaultTab, label: 'Memories', icon: Brain },
          { id: 'notes' as VaultTab, label: 'Notes', icon: StickyNote },
          { id: 'secrets' as VaultTab, label: 'Secrets', icon: Terminal },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setEditingId(null);
            }}
            className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition ${
              tab === id ? 'border-cyan bg-cyan/15 text-cyan' : 'glass text-steel hover:text-white'
            }`}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Owner Passcode Gate when protected */}
      {locked && tab !== 'secrets' ? (
        <form onSubmit={handleUnlock} className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-amber">
            <KeyRound size={18} />
            <h3 className="font-display text-sm font-bold text-white">Owner Passcode Required</h3>
          </div>
          <p className="mt-1.5 text-xs text-steel">
            Memories and personal notes are protected by `OWNER_PASSCODE` so friends can try JARVIS without reading private items.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              placeholder="Enter owner passcode"
              className="field flex-1 text-sm"
            />
            <button type="submit" disabled={verifying} className="btn-hud btn-primary px-4 text-sm">
              <Unlock size={15} /> Unlock
            </button>
          </div>
        </form>
      ) : tab !== 'secrets' ? (
        <div className="space-y-3 pb-6">
          {/* Consent notice + Add form */}
          <form onSubmit={handleAddItem} className="glass rounded-2xl p-3.5">
            <p className="hud-label text-[10px]">
              {tab === 'memories' ? 'Add Personal Memory (with your consent)' : 'Create Quick Note'}
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder={
                  tab === 'memories'
                    ? 'e.g., My favourite physics topic is general relativity'
                    : 'e.g., Finish science fair slides by Friday'
                }
                className="field flex-1 text-sm"
              />
              <button type="submit" disabled={!newContent.trim()} className="btn-hud btn-primary px-4">
                <Plus size={18} />
              </button>
            </div>
          </form>

          {loading ? (
            <p className="py-6 text-center text-xs text-steel">Loading…</p>
          ) : activeItems.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center text-sm text-steel">
              Nothing stored here yet. You can also tell JARVIS: "Remember that…" or "Create a note…".
            </div>
          ) : (
            <ul className="space-y-2">
              {activeItems.map((item) => (
                <li key={item.id} className="glass rounded-2xl p-3.5">
                  {editingId === item.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="field flex-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit(item.id)}
                        className="btn-hud btn-primary px-3"
                        aria-label="Save edit"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white break-words">{item.content}</p>
                        <p className="mt-1 font-mono text-[10px] text-steel">{item.updated_at} UTC</p>
                      </div>
                      <div className="flex shrink-0 items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditingText(item.content);
                          }}
                          className="icon-btn text-steel hover:text-cyan"
                          aria-label="Edit item"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteItem(item.id)}
                          className="icon-btn text-steel hover:text-danger"
                          aria-label="Delete item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Clear local device conversation history */}
          <div className="glass flex items-center justify-between rounded-2xl p-3.5">
            <div>
              <p className="text-xs font-semibold text-white">Device Chat History</p>
              <p className="text-[11px] text-steel">Stored only in this browser's localStorage.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearMessages();
                toast('Conversation history cleared', 'success');
              }}
              className="btn-hud border-danger/40 text-danger px-3 text-xs"
            >
              Clear Chat
            </button>
          </div>
        </div>
      ) : (
        /* Secret Commands Tab */
        <div className="space-y-3 pb-6">
          <div className="glass rounded-2xl p-3.5">
            <p className="hud-label text-[10px] text-cyan">Built-in Secret & Personality Commands</p>
            <ul className="mt-2.5 space-y-2">
              {BUILTIN_SECRETS.map((s) => (
                <li key={s.trigger} className="rounded-xl border border-cyan/15 bg-abyss/60 px-3 py-2 text-xs">
                  <p className="font-mono font-semibold text-cyan-soft">"{s.trigger}"</p>
                  <p className="mt-0.5 text-steel">{s.reply}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass rounded-2xl p-3.5">
            <p className="hud-label text-[10px]">Custom Secret Commands</p>
            {locked ? (
              <p className="mt-2 text-xs text-steel">Unlock the Vault in the Memories tab to add or delete custom commands.</p>
            ) : (
              <form onSubmit={handleAddSecret} className="mt-2 space-y-2">
                <input
                  type="text"
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  placeholder='Trigger phrase (e.g., "execute party protocol")'
                  className="field text-sm"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newResponse}
                    onChange={(e) => setNewResponse(e.target.value)}
                    placeholder="JARVIS reply…"
                    className="field flex-1 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!newTrigger.trim() || !newResponse.trim()}
                    className="btn-hud btn-primary px-4"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </form>
            )}

            {secretsList.length > 0 && (
              <ul className="mt-3 space-y-2">
                {secretsList.map((sc) => (
                  <li
                    key={sc.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-cyan/20 bg-navy/50 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-cyan-soft">"{sc.trigger}"</p>
                      <p className="text-steel">{sc.response}</p>
                    </div>
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteSecret(sc.id)}
                        className="icon-btn text-steel hover:text-danger"
                        aria-label="Delete secret command"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
