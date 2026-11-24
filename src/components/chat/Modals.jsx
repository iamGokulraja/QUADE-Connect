import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Search, Users } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { ROLE_LABEL } from "../../lib/constants";
import { convTitle } from "../../lib/chat";
import toast from "../../lib/toast";
import { Field, Modal, btnGhost, btnPrimary, inputCls } from "../ui";
import { rpc, useDirectory, useProjectOptions } from "../../hooks/chat";
import ChatAvatar from "./ChatAvatar";

const sub = (p) => [p.designation, ROLE_LABEL[p.role]].filter(Boolean).join(" · ");

// Searchable list of people. `multi` shows check marks; otherwise a click picks one person.
export function PeoplePicker({ people, selected = [], onToggle, multi = true, online, empty = "No one found." }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter((p) => !s || `${p.full_name} ${p.designation || ""} ${ROLE_LABEL[p.role] || ""}`.toLowerCase().includes(s));
  }, [people, q]);
  return (
    <div>
      <div className="relative mb-2">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input className={`${inputCls} pl-9`} placeholder="Search by name or designation" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <ul className="max-h-64 overflow-y-auto rounded-xl border border-slate-700/70">
        {list.length === 0 && <li className="p-4 text-center text-xs text-slate-500">{empty}</li>}
        {list.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onToggle(p)}
                className={`flex w-full items-center gap-3 border-b border-slate-800 px-3 py-2.5 text-left last:border-0 hover:bg-slate-800/60 ${on ? "bg-blue-500/10" : ""}`}>
                <ChatAvatar name={p.full_name} path={p.avatar_path} size={36} online={online ? online.has(p.id) : null} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{p.full_name}</span>
                  <span className="block truncate text-xs text-slate-400">{sub(p) || "—"}</span></span>
                {multi && <span className={`grid h-5 w-5 place-items-center rounded-md border ${on ? "border-blue-500 bg-blue-600 text-white" : "border-slate-600"}`}>{on && <Check size={13} />}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NewMessageModal({ me, online, onClose, onPick }) {
  const { people } = useDirectory();
  return (
    <Modal title="New message" subtitle="Choose a colleague to start a private conversation." onClose={onClose}>
      <PeoplePicker multi={false} online={online} people={people.filter((p) => p.id !== me.id)} onToggle={(p) => onPick(p.id)} />
    </Modal>
  );
}

async function uploadGroupPicture(meId, file) {
  const path = `avatars/${meId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase.storage.from("chat-files").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}
const okImage = (f) => /^image\/(png|jpe?g|webp)$/.test(f.type) && f.size <= 5 * 1048576;

export function CreateGroupModal({ me, online, onClose, onCreated }) {
  const client = useQueryClient();
  const { people } = useDirectory();
  const canProject = ["admin", "project_manager", "team_lead"].includes(me.role);
  const { data: projects = [] } = useProjectOptions(canProject);
  const [kind, setKind] = useState("custom");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [participants, setParticipants] = useState(null);   // ids allowed in the selected project's group
  const [picked, setPicked] = useState([]);
  const [picture, setPicture] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    setPicked([]); setParticipants(null);
    if (kind !== "project" || !projectId) return;
    rpc("chat_project_participants", { p: projectId }).then(setParticipants).catch((e) => setError(e.message));
  }, [kind, projectId]);

  const candidates = people.filter((p) => p.id !== me.id && (kind === "custom" || (participants || []).includes(p.id)));
  const toggle = (p) => setPicked((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]));

  const create = async () => {
    setError("");
    if (!name.trim()) return setError("Enter a group name.");
    if (kind === "project" && !projectId) return setError("Select a project.");
    setBusy(true);
    try {
      const avatar = picture ? await uploadGroupPicture(me.id, picture) : null;
      const id = await rpc("chat_create_group", {
        p_name: name, p_description: description || null, p_avatar_path: avatar, p_member_ids: picked,
        p_group_type: kind, p_project_id: kind === "project" ? projectId : null,
      });
      client.invalidateQueries({ queryKey: ["chat-conversations"] });
      toast.success("Group created.");
      onCreated(id);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal wide title="Create group" subtitle="Add people and start chatting right away." onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} onClick={create} disabled={busy}>{busy ? "Creating..." : `Create group${picked.length ? ` (${picked.length + 1} people)` : ""}`}</button></>}>
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {canProject && (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#0D172A] p-1">
          {[["custom", "Custom group"], ["project", "Project group"]].map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-lg py-2 text-sm font-semibold ${kind === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>{l}</button>
          ))}
        </div>
      )}
      {kind === "project" && (
        <Field label="Project">
          <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{projects.length ? "Select one of your projects" : "No projects available to you"}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Only people working on the project can be added. Nobody is added automatically.</p>
        </Field>
      )}
      <div className="flex items-end gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} title="Group picture (optional)"
          className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-dashed border-slate-600 bg-[#0D172A] text-slate-400 hover:border-blue-500">
          {picture ? <img src={URL.createObjectURL(picture)} alt="" className="h-full w-full object-cover" /> : <Users size={22} />}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files[0]; if (f && !okImage(f)) toast.error("Use a PNG, JPG or WEBP picture up to 5 MB."); else if (f) setPicture(f); e.target.value = ""; }} />
        <div className="flex-1"><Field label="Group name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={kind === "project" ? "e.g. Tower B coordination" : "e.g. CAD Team Discussion"} /></Field></div>
      </div>
      <Field label="Description (optional)"><textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} /></Field>
      <Field label={`Add people${picked.length ? ` · ${picked.length} selected` : ""}`}>
        <PeoplePicker people={candidates} selected={picked} onToggle={toggle} online={online}
          empty={kind === "project" && !projectId ? "Select a project first." : "No eligible people found."} />
      </Field>
    </Modal>
  );
}

export function AddMembersModal({ conv, me, online, onClose }) {
  const client = useQueryClient();
  const { people } = useDirectory();
  const [participants, setParticipants] = useState(conv.group_type === "project" ? null : undefined);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const existing = conv.members.map((m) => m.user_id);

  useEffect(() => {
    if (conv.group_type === "project") rpc("chat_project_participants", { p: conv.project_id }).then(setParticipants).catch(() => setParticipants([]));
  }, [conv.group_type, conv.project_id]);

  const candidates = people.filter((p) => !existing.includes(p.id) && p.id !== me.id && (participants === undefined || (participants || []).includes(p.id)));
  const add = async () => {
    setBusy(true);
    try {
      await rpc("chat_add_members", { p_conv: conv.id, p_user_ids: picked });
      client.invalidateQueries({ queryKey: ["chat-conversations"] });
      client.invalidateQueries({ queryKey: ["chat-messages", conv.id] });
      onClose();
    } catch (e) { toast.error(e.message); setBusy(false); }
  };
  return (
    <Modal title="Add members" subtitle={conv.group_type === "project" ? "Only people working on this project can be added." : conv.name} onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!picked.length || busy} onClick={add}>{busy ? "Adding..." : `Add ${picked.length || ""}`}</button></>}>
      <PeoplePicker people={candidates} online={online} selected={picked} onToggle={(p) => setPicked((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]))}
        empty={participants === null ? "Loading..." : "No one else can be added."} />
    </Modal>
  );
}

export function EditGroupModal({ conv, onClose }) {
  const client = useQueryClient();
  const [name, setName] = useState(conv.name || "");
  const [description, setDescription] = useState(conv.description || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return toast.error("Enter a group name.");
    setBusy(true);
    try {
      await rpc("chat_update_group", { p_conv: conv.id, p_patch: { name, description } });
      client.invalidateQueries({ queryKey: ["chat-conversations"] });
      onClose();
    } catch (e) { toast.error(e.message); setBusy(false); }
  };
  return (
    <Modal title="Edit group" onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</button></>}>
      <Field label="Group name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <Field label="Description"><textarea className={inputCls} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} /></Field>
    </Modal>
  );
}

// Forward one message to any conversation I belong to.
export function ForwardModal({ conversations, me, map, onClose, onForward }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const list = conversations.filter((c) => convTitle(c, me.id, map).toLowerCase().includes(q.toLowerCase()));
  const go = async () => { setBusy(true); try { await onForward(picked); } finally { setBusy(false); } };
  return (
    <Modal title="Forward message" subtitle="Choose one or more conversations." onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!picked.length || busy} onClick={go}>{busy ? "Forwarding..." : "Forward"}</button></>}>
      <input className={inputCls} placeholder="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="max-h-64 overflow-y-auto rounded-xl border border-slate-700/70">
        {list.map((c) => {
          const on = picked.includes(c.id);
          const other = c.conversation_type === "direct" ? map[(c.members.find((m) => m.user_id !== me.id) || {}).user_id] : null;
          return (
            <li key={c.id}><button onClick={() => setPicked((l) => (on ? l.filter((x) => x !== c.id) : [...l, c.id]))}
              className={`flex w-full items-center gap-3 border-b border-slate-800 px-3 py-2.5 text-left last:border-0 hover:bg-slate-800/60 ${on ? "bg-blue-500/10" : ""}`}>
              <ChatAvatar name={convTitle(c, me.id, map)} path={other?.avatar_path || c.avatar_path} group={c.conversation_type === "group"} size={34} />
              <span className="flex-1 truncate text-sm text-white">{convTitle(c, me.id, map)}</span>
              <span className={`grid h-5 w-5 place-items-center rounded-md border ${on ? "border-blue-500 bg-blue-600 text-white" : "border-slate-600"}`}>{on && <Check size={13} />}</span>
            </button></li>
          );
        })}
        {!list.length && <li className="p-4 text-center text-xs text-slate-500">No conversations.</li>}
      </ul>
    </Modal>
  );
}
