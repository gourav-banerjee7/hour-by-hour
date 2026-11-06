"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from "react";
import { INKS, INK_NAMES, newBlockId, nextY, phoneOrder, segments, type Block, type Ink } from "@/lib/plan";
import type { Reminder } from "@/lib/reminders";
import ActionsPanel, { type ActionsApi } from "./ActionsPanel";

type Props = {
  blocks: Block[];
  onChange: (b: Block[]) => void;
  actions: Reminder[];
  onToggleAction: (r: Reminder) => void;
  onMakeAction: (block: Block, snippet: string | null) => Promise<void>;
  planApi: ActionsApi;
  open: boolean;
  onOpen: (v: boolean) => void;
  focus: { id: string; n: number } | null;
};

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}

function Grow({ inputRef, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; inputRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, [props.value]);
  return <textarea ref={(el) => { ref.current = el; if (inputRef) inputRef.current = el; }} rows={1} {...props} />;
}

const Pen = () => <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 17l1-4L13.5 3.5a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3L7 16z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
const Spark = () => <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M10 2l1.7 5.1L17 9l-5.3 1.9L10 16l-1.7-5.1L3 9l5.3-1.9z" fill="currentColor" /></svg>;
const Chev = ({ up }: { up?: boolean }) => <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" style={{ transform: up ? "rotate(180deg)" : undefined }}><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export default function PlannerBoard({ blocks, onChange, actions, onToggleAction, onMakeAction, planApi, open, onOpen, focus }: Props) {
  const phone = useMedia("(max-width: 720px)");
  const [full, setFull] = useState(false);
  const [ink, setInk] = useState<Ink>("ink");
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [suggest, setSuggest] = useState(false);
  const [undo, setUndo] = useState<Block[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const sel = useRef({ id: "", s: 0, e: 0 });
  const suggestRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const linkedFor = (id: string) => actions.filter((a) => a.plan_block_id === id);
  const openLinked = actions.filter((a) => a.plan_block_id && !a.done && blocks.some((b) => b.id === a.plan_block_id)).length;
  const say = (t: string) => { setMsg(t); timers.current.push(setTimeout(() => setMsg(null), 2600)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const update = (id: string, patch: Partial<Block>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const remove = (id: string) => { onChange(blocks.filter((b) => b.id !== id)); setSelected(null); setEditing(null); };

  // jump here from an action ("In plan")
  useEffect(() => {
    if (!focus) return;
    setFlash(focus.id);
    const t = setTimeout(() => { document.getElementById("note-" + focus.id)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, 120);
    const t2 = setTimeout(() => setFlash(null), 2200);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [focus]);

  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !editing) setFull(false); };
    document.addEventListener("keydown", k);
    document.body.classList.add("noscroll");
    return () => { document.removeEventListener("keydown", k); document.body.classList.remove("noscroll"); };
  }, [full, editing]);
  useEffect(() => {
    if (!(phone && open)) return;
    document.body.classList.add("noscroll");
    return () => document.body.classList.remove("noscroll");
  }, [phone, open]);

  const addAt = (x: number, y: number) => {
    const b = { id: newBlockId(), text: "", x: Math.min(0.68, Math.max(0.01, x)), y: Math.max(8, y), c: ink };
    onChange([...blocks, b]);
    setEditing(b.id); setSelected(b.id);
  };
  const addPhone = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...blocks, { id: newBlockId(), text: t, x: 0.04, y: nextY(blocks), c: ink }]);
    setDraft("");
  };
  const addButton = () => addAt(0.04 + (blocks.length % 3) * 0.3, nextY(blocks) - 70);

  const move = (id: string, dir: -1 | 1) => {
    const list = phoneOrder(blocks);
    const i = list.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    onChange(blocks.map((x) => (x.id === a.id ? { ...x, x: b.x, y: b.y } : x.id === b.id ? { ...x, x: a.x, y: a.y } : x)));
  };

  const clear = () => {
    setUndo(blocks); onChange([]); setConfirmClear(false); setSelected(null); setEditing(null);
    timers.current.push(setTimeout(() => setUndo(null), 9000));
  };

  const makeAction = async (b: Block) => {
    // read the live selection from the text box, so it is right even if no select event fired
    const ta = document.querySelector<HTMLTextAreaElement>(`#note-${b.id} textarea`);
    const s = ta ? { s: ta.selectionStart, e: ta.selectionEnd } : sel.current.id === b.id ? sel.current : { s: 0, e: 0 };
    const snippet = s.e > s.s ? b.text.slice(s.s, s.e).trim() : "";
    await onMakeAction(b, snippet || null);
    say(snippet ? "Action added from your selection" : "Action added");
  };

  /* ---------- dragging (desktop and tablet) ---------- */
  const startDrag = (e: React.PointerEvent, b: Block) => {
    const noteEl = (e.currentTarget as HTMLElement).closest(".note") as HTMLElement;
    const nr = noteEl.getBoundingClientRect();
    dragRef.current = { id: b.id, dx: e.clientX - nr.left, dy: e.clientY - nr.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelected(b.id);
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current, c = canvasRef.current;
    if (!d || !c) return;
    const r = c.getBoundingClientRect();
    setDrag({ id: d.id, x: Math.min(0.76, Math.max(0, (e.clientX - d.dx - r.left) / r.width)), y: Math.max(0, e.clientY - d.dy - r.top) });
  };
  const endDrag = () => {
    if (drag) update(drag.id, { x: drag.x, y: drag.y });
    dragRef.current = null; setDrag(null);
  };

  /* ---------- one note ---------- */
  const note = (b: Block, mode: "canvas" | "phone", idx: number, total: number) => {
    const linked = linkedFor(b.id);
    const isEdit = editing === b.id;
    const isSel = selected === b.id;
    const pos = drag?.id === b.id ? drag : b;
    const segs = segments(b.text, linked.filter((a) => a.plan_text).map((a) => ({ id: a.id, text: a.plan_text!, done: a.done })));
    return (
      <div
        key={b.id} id={"note-" + b.id}
        className={`note ${mode}${isSel ? " sel" : ""}${flash === b.id ? " flash" : ""}${drag?.id === b.id ? " dragging" : ""}`}
        style={mode === "canvas" ? { left: `${pos.x * 100}%`, top: pos.y } : undefined}
        onClick={(e) => { e.stopPropagation(); setSelected(b.id); }}
      >
        {mode === "canvas" && (
          <span className="grip" onPointerDown={(e) => startDrag(e, b)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} aria-label="Drag to move" role="button" tabIndex={-1}>
            <svg viewBox="0 0 12 18" width="10" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="9" r="1.4" /><circle cx="9" cy="9" r="1.4" /><circle cx="3" cy="15" r="1.4" /><circle cx="9" cy="15" r="1.4" /></g></svg>
          </span>
        )}
        {isEdit ? (
          <Grow
            className="ntext hand" style={{ color: INKS[b.c] }} value={b.text} autoFocus maxLength={1200} aria-label="Note"
            onFocus={(e) => { const el = e.currentTarget; el.setSelectionRange(el.value.length, el.value.length); }}
            onChange={(e) => update(b.id, { text: e.target.value })}
            onSelect={(e) => { const t = e.currentTarget; sel.current = { id: b.id, s: t.selectionStart, e: t.selectionEnd }; }}
            onKeyDown={(e) => { if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) (e.target as HTMLTextAreaElement).blur(); }}
            onBlur={() => { setEditing(null); if (!b.text.trim()) remove(b.id); }}
          />
        ) : (
          <div className="ntext hand" style={{ color: INKS[b.c] }} onClick={() => { setEditing(b.id); setSelected(b.id); sel.current = { id: b.id, s: 0, e: 0 }; }}>
            {segs.map((s, i) => s.link ? <mark key={i} className={s.link.done ? "done" : ""}>{s.t}</mark> : <span key={i}>{s.t}</span>)}
          </div>
        )}
        {linked.length > 0 && (
          <div className="nlinks">
            {linked.map((a) => (
              <button key={a.id} className={`nlink${a.done ? " done" : ""}`} onClick={(e) => { e.stopPropagation(); onToggleAction(a); }} title={a.done ? "Mark as not done" : "Mark as done"}>
                <span className="box">{a.done ? "✓" : ""}</span><span className="lt">{a.title}</span>
              </button>
            ))}
          </div>
        )}
        {isSel && (
          <div className="ntools" onMouseDown={(e) => e.preventDefault()}>
            <span className="inks">
              {INK_NAMES.map((c) => <button key={c} className={b.c === c ? "on" : ""} style={{ background: INKS[c] }} onClick={() => update(b.id, { c })} aria-label={`Ink ${c}`} />)}
            </span>
            <button className="tb" onClick={() => makeAction(b)} disabled={!b.text.trim()}>Make action</button>
            {mode === "phone" && <button className="tb sq" onClick={() => move(b.id, -1)} disabled={idx === 0} aria-label="Move up">↑</button>}
            {mode === "phone" && <button className="tb sq" onClick={() => move(b.id, 1)} disabled={idx === total - 1} aria-label="Move down">↓</button>}
            <button className="tb del" onClick={() => remove(b.id)}>Delete</button>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => { if (suggest) setTimeout(() => suggestRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80); }, [suggest]);
  const suggestPanel = suggest && (
    <div className="bsuggest" ref={suggestRef}>
      <ActionsPanel api={planApi} texts={blocks.map((b) => b.text).filter((t) => t.trim())} label="Make actions from this plan" onClose={() => setSuggest(false)} />
    </div>
  );
  const status = (
    <>
      {msg && <div className="btoast" role="status">{msg}</div>}
      {undo && !msg && <div className="btoast">Board cleared <button onClick={() => { onChange(undo); setUndo(null); }}>Undo</button></div>}
    </>
  );

  /* ---------- collapsed strip ---------- */
  if (!open) {
    const preview = phoneOrder(blocks).slice(0, 3).map((b) => b.text.split("\n")[0]).filter(Boolean);
    return (
      <section className="card board collapsed">
        <button className="bstrip" onClick={() => onOpen(true)} aria-expanded="false">
          <span className="bico"><Pen /></span>
          <span className="bname">Planner board</span>
          <span className="bmeta">{blocks.length ? `${blocks.length} note${blocks.length > 1 ? "s" : ""}${openLinked ? ` · ${openLinked} open action${openLinked > 1 ? "s" : ""}` : ""}` : "Your whiteboard, kept until you clear it"}</span>
          {preview.length > 0 && <span className="bprev hand">{preview.join("  ·  ")}</span>}
          <span className="bexp">Open <Chev /></span>
        </button>
      </section>
    );
  }

  /* ---------- phone: notebook sheet ---------- */
  if (phone) {
    const list = phoneOrder(blocks);
    return (
      <div className="bsheet" role="dialog" aria-label="Planner board">
        <header className="bshead">
          <button className="bback" onClick={() => onOpen(false)} aria-label="Close board"><Chev up /> <span>Done</span></button>
          <h2>Planner board</h2>
          <button className="btn gen sm" onClick={() => setSuggest((v) => !v)} disabled={!blocks.length}><Spark /> Actions</button>
        </header>
        <div className="bslist" onClick={() => { setSelected(null); setEditing(null); }}>
          {list.length === 0 && <p className="bempty hand">Jot anything down. Ideas, plans, worries. It stays here until you clear it.</p>}
          {list.map((b, i) => note(b, "phone", i, list.length))}
          {suggestPanel}
          {blocks.length > 0 && (
            <div className="bclear">
              {confirmClear ? <><span>Clear the whole board?</span> <button className="btn warn" onClick={clear}>Clear</button> <button className="btn" onClick={() => setConfirmClear(false)}>Keep</button></>
                : <button className="tlink" onClick={() => setConfirmClear(true)}>Clear board</button>}
            </div>
          )}
        </div>
        {status}
        <form className="bcomposer" onSubmit={(e) => { e.preventDefault(); addPhone(); }}>
          <Grow value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Jot a thought…" aria-label="New note" maxLength={1200} className="hand" />
          <button className="btn ink" type="submit" disabled={!draft.trim()}>Add</button>
        </form>
      </div>
    );
  }

  /* ---------- desktop and tablet: free whiteboard ---------- */
  const maxBottom = blocks.length ? Math.max(...blocks.map((b) => b.y)) + 230 : 0;
  const board = (
    <section className={`card board open${full ? " full" : ""}`}>
      <div className="btool">
        <button className="bback" onClick={() => { setFull(false); onOpen(false); }} aria-label="Collapse board"><Chev up /></button>
        <h2><Pen /> Planner board</h2>
        <span className="bmeta">{blocks.length ? `${blocks.length} note${blocks.length > 1 ? "s" : ""}${openLinked ? ` · ${openLinked} open action${openLinked > 1 ? "s" : ""}` : ""}` : "Click anywhere to write"}</span>
        <span className="pens" title="Ink for new notes">
          {INK_NAMES.map((c) => <button key={c} className={ink === c ? "on" : ""} style={{ background: INKS[c] }} onClick={() => setInk(c)} aria-label={`Ink ${c}`} aria-pressed={ink === c} />)}
        </span>
        <button className="btn" onClick={addButton}>+ Note</button>
        <button className="btn gen sm" onClick={() => setSuggest((v) => !v)} disabled={!blocks.length}><Spark /> Make actions</button>
        {confirmClear ? <span className="bconfirm">Clear everything? <button className="btn warn" onClick={clear}>Clear</button> <button className="btn" onClick={() => setConfirmClear(false)}>Keep</button></span>
          : <button className="btn" onClick={() => setConfirmClear(true)} disabled={!blocks.length}>Clear</button>}
        <button className="btn" onClick={() => setFull((v) => !v)} aria-label={full ? "Exit full screen" : "Full screen"}>{full ? "Exit full screen" : "Full screen"}</button>
      </div>
      <div className="bscroll">
        <div
          ref={canvasRef} className="canvas" style={{ minHeight: Math.max(full ? 520 : 380, maxBottom) }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (selected || editing) { setSelected(null); setEditing(null); return; }
            const r = e.currentTarget.getBoundingClientRect();
            addAt((e.clientX - r.left) / r.width - 0.02, e.clientY - r.top - 12);
          }}
        >
          {blocks.length === 0 && <div className="bempty hand">Click anywhere and start writing. Drag notes by the dots. Nothing here is cleared until you clear it.</div>}
          {blocks.map((b, i) => note(b, "canvas", i, blocks.length))}
        </div>
      </div>
      {suggestPanel}
      {status}
    </section>
  );
  return full ? <><div className="bscrim" onClick={() => setFull(false)} />{board}</> : board;
}
