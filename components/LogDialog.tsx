"use client";
import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { hl } from "@/lib/time";
import { hasLogged, newId, type Entry, type Item, type Tag, type TagIndex } from "@/lib/tags";
import ClockLoader from "./ClockLoader";
import { TagChip, TagPicker } from "./TagUI";
import ActionsPanel, { type ActionsApi } from "./ActionsPanel";
import ActionPicker from "./ActionPicker";
import type { Reminder } from "@/lib/reminders";

type Props = {
  day: string;
  dayLabel: string;
  hour: number;
  entry?: Entry;
  prevHas: boolean;
  idx: TagIndex;
  tags: Tag[];
  pending: Set<string>;
  failed: Set<string>;
  aiMode: "ai" | "fallback" | null;
  saving: boolean;
  onItems: (items: Item[], slow?: boolean) => void;
  onTag: (ids: string[]) => void;
  onCreateTag: (path: string[]) => Promise<string | null>;
  onSame: () => void;
  onNav: (delta: number) => void;
  onClose: () => void;
  actionsApi: ActionsApi;
  allActions: Reminder[];
  onToggleAction: (r: Reminder) => void;
  onCreateAction: (title: string) => Promise<string | null>;
};

function Grow({ inputRef, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; inputRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  }, [props.value]);
  return <textarea ref={(el) => { ref.current = el; if (inputRef) inputRef.current = el; }} rows={1} {...props} />;
}

export default function LogDialog(p: Props) {
  const items = p.entry?.items ?? [];
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const [aPicker, setAPicker] = useState<string | null>(null);
  const actionById = new Map(p.allActions.map((a) => [a.id, a]));
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add("noscroll");
    return () => document.body.classList.remove("noscroll");
  }, []);
  // moving to another hour starts a fresh draft (state is reset during render, not in an effect)
  const hourKey = `${p.day}-${p.hour}`;
  const [shownKey, setShownKey] = useState(hourKey);
  if (shownKey !== hourKey) { setShownKey(hourKey); setDraft(""); setPicker(null); setAPicker(null); }
  useEffect(() => { const t = setTimeout(() => draftRef.current?.focus(), 60); return () => clearTimeout(t); }, [hourKey]);

  const commitDraft = () => {
    const text = draft.trim();
    if (!text) return items;
    const it: Item = { id: newId(), text, tags: [] };
    const next = [...items, it];
    p.onItems(next);
    p.onTag([it.id]);
    setDraft("");
    setTimeout(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }); draftRef.current?.focus(); }, 30);
    return next;
  };

  const close = () => { if (draft.trim()) commitDraft(); p.onClose(); };
  const patch = (id: string, fn: (i: Item) => Item, slow?: boolean) => p.onItems(items.map((i) => (i.id === id ? fn(i) : i)), slow);

  const pickTag = (id: string, tagId: string) => { patch(id, (i) => ({ ...i, tags: i.tags.includes(tagId) ? i.tags : [...i.tags, tagId], manual: true })); setPicker(null); };
  const link = (id: string, actionId: string) => { patch(id, (i) => ({ ...i, actions: (i.actions ?? []).includes(actionId) ? i.actions : [...(i.actions ?? []), actionId] })); setAPicker(null); };
  const createAction = async (id: string, title: string) => { const a = await p.onCreateAction(title); if (a) link(id, a); };
  const createTag = async (id: string, path: string[]) => { const t = await p.onCreateTag(path); if (t) pickTag(id, t); };

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={`Log ${hl(p.hour)} to ${hl(p.hour + 1)}`}>
        <header className="dhead">
          <button className="dnav" onClick={() => { if (draft.trim()) commitDraft(); p.onNav(-1); }} aria-label="Previous hour">‹</button>
          <div className="dtitle">
            <span className="eyebrow">{p.dayLabel}</span>
            <h2>{hl(p.hour)} <span>to</span> {hl(p.hour + 1)}</h2>
          </div>
          <button className="dnav" onClick={() => { if (draft.trim()) commitDraft(); p.onNav(1); }} aria-label="Next hour">›</button>
          <button className="dnav x" onClick={close} aria-label="Close">✕</button>
        </header>

        <div className="dbody" ref={bodyRef}>
          {items.length === 0 && (
            <p className="dhint">Jot down what you did. Short or long, one pointer at a time. Tags are added for you.</p>
          )}
          {items.map((it) => (
            <div className="ptr" key={it.id}>
              <Grow
                value={it.text}
                aria-label="Pointer"
                maxLength={1500}
                onChange={(e) => patch(it.id, (i) => ({ ...i, text: e.target.value }), true)}
                onBlur={() => {
                  const t = it.text.trim();
                  if (!t) p.onItems(items.filter((i) => i.id !== it.id));
                  else if (!it.manual && t !== it.tt) p.onTag([it.id]);
                }}
              />
              <div className="ptags">
                {p.pending.has(it.id) && <span className="tagging"><ClockLoader size={16} inline label="Tagging" /></span>}
                {!p.pending.has(it.id) && it.tags.map((t) => (
                  <TagChip key={t} idx={p.idx} id={t} onRemove={() => patch(it.id, (i) => ({ ...i, tags: i.tags.filter((x) => x !== t), manual: true }))} />
                ))}
                {!p.pending.has(it.id) && p.failed.has(it.id) && <button className="tlink" onClick={() => p.onTag([it.id])}>Could not tag. Retry</button>}
                {!p.pending.has(it.id) && (
                  <button className="tadd" onClick={() => setPicker(picker === it.id ? null : it.id)} aria-label="Add a tag">+ tag</button>
                )}
                {(it.actions ?? []).map((aid) => {
                  const a = actionById.get(aid);
                  if (!a) return null;
                  return (
                    <span key={aid} className={`achip${a.done ? " done" : ""}`} title="Action this was for">
                      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 14V2.5M4 3h8l-1.6 2.7L12 8.5H4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span className="atxt">{a.title}</span>
                      <button className="adone" onClick={() => p.onToggleAction(a)}>{a.done ? "Undo" : "Mark done"}</button>
                      <button aria-label="Unlink action" onClick={() => patch(it.id, (i) => ({ ...i, actions: (i.actions ?? []).filter((x) => x !== aid) }))}>×</button>
                    </span>
                  );
                })}
                {!p.pending.has(it.id) && (
                  <button className="tadd" onClick={() => setAPicker(aPicker === it.id ? null : it.id)} aria-label="Link an action">+ action</button>
                )}
                {!p.pending.has(it.id) && it.manual && (
                  <button className="tlink" onClick={() => { patch(it.id, (i) => ({ ...i, manual: false, tags: [] })); p.onTag([it.id]); }}>Re-tag with AI</button>
                )}
                <button className="tdel" onClick={() => p.onItems(items.filter((i) => i.id !== it.id))} aria-label="Delete pointer">Delete</button>
              </div>
              {aPicker === it.id && (
                <ActionPicker actions={p.allActions} exclude={it.actions ?? []} onPick={(a) => link(it.id, a)} onCreate={(t) => createAction(it.id, t)} onClose={() => setAPicker(null)} />
              )}
              {picker === it.id && (
                <TagPicker idx={p.idx} tags={p.tags} exclude={it.tags} onPick={(t) => pickTag(it.id, t)} onCreate={(path) => createTag(it.id, path)} onClose={() => setPicker(null)} />
              )}
            </div>
          ))}

          <div className="newptr">
            <Grow
              inputRef={draftRef}
              value={draft}
              placeholder={items.length ? "Add another pointer" : "What did you do? e.g. Reviewed 3 PRs on the payments service"}
              aria-label="New pointer"
              maxLength={1500}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); commitDraft(); } }}
            />
            <button className="btn ink" onClick={commitDraft} disabled={!draft.trim()}>Add</button>
          </div>
          <p className="dkeys">Enter adds the pointer. Shift + Enter starts a new line.</p>
          <ActionsPanel key={`${p.day}-${p.hour}`} api={p.actionsApi} texts={items.map((i) => i.text).filter((t) => t.trim())} />
        </div>

        <footer className="dfoot">
          <div className="dleft">
            {p.prevHas && !hasLogged(p.entry) && <button className="btn" onClick={p.onSame}>Same as last hour</button>}
            <span className="dstatus">
              {p.saving ? "Saving…" : items.length ? "Saved" : ""}
              {p.aiMode === "fallback" && " · Basic tagging"}
            </span>
          </div>
          <button className="btn ink" onClick={close}>Done</button>
        </footer>
      </div>
    </div>
  );
}
