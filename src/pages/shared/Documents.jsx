import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Download, Eye, FileText, Folder, FolderPlus, ShieldCheck, Trash2, Upload, FolderKanban } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import toast from "../../lib/toast";
import { fmtDate } from "../../lib/utils";
import { personName, useMe, useWorkData } from "../../hooks/queries";
import { Card, Empty, ErrorBox, Field, Loading, Modal, Page, btnGhost, btnPrimary, inputCls } from "../../components/ui";

const BUCKET = "documents";
const MAX_MB = 100;
const th = "px-5 py-3";
const head = "bg-[#17243D]/70 text-xs uppercase tracking-wider text-slate-400";
const fmtSize = (n) => (n == null ? "—" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const kind = (f) => {
  const n = (f.file_name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "PDF";
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return "Image";
  if (/\.(xlsx?|csv)$/.test(n)) return "Excel";
  if (/\.(docx?|rtf|txt)$/.test(n)) return "Word / Text";
  if (/\.(dwg|dxf)$/.test(n)) return "CAD";
  return (n.split(".").pop() || "File").toUpperCase();
};
const safe = (n) => n.replace(/[^\w.\-]+/g, "_");

const SECTIONS = [
  { key: "project", title: "Projects", text: "A folder for every project, with Initial, Review 1 and Review 2 sections.", icon: FolderKanban },
  { key: "library", title: "QUADE Library", text: "Shared company folders. Create folders and attach documents.", icon: BookOpen },
  { key: "sop", title: "SOP Discipline", text: "Standard operating procedures and discipline documents.", icon: ShieldCheck },
];

function useFolders() {
  return useQuery({ queryKey: ["doc-folders"], queryFn: async () => {
    const { data, error } = await supabase.from("doc_folders").select("*").order("created_at");
    if (error) throw error; return data || []; } });
}
function useFiles() {
  return useQuery({ queryKey: ["doc-files"], queryFn: async () => {
    const { data, error } = await supabase.from("doc_files").select("*").order("created_at", { ascending: false });
    if (error) throw error; return data || []; } });
}

export default function Documents() {
  const { data: me } = useMe();
  const d = useWorkData();
  const foldersQ = useFolders();
  const filesQ = useFiles();
  const client = useQueryClient();
  const fileInput = useRef(null);

  const [scope, setScope] = useState(null);        // null | project | library | sop
  const [projectId, setProjectId] = useState(null);
  const [path, setPath] = useState([]);            // folder ids (library/sop nesting) or [sectionId] for projects
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState(false);

  const folders = foldersQ.data || [];
  const files = filesQ.data || [];
  const current = path.length ? folders.find((f) => f.id === path[path.length - 1]) : null;
  const countIn = (id) => files.filter((f) => f.folder_id === id).length;
  const refresh = () => ["doc-folders", "doc-files", "qc-docs"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
  const projectName = useMemo(() => Object.fromEntries(d.projects.map((p) => [p.id, p.name])), [d.projects]);
  const sectionTitle = SECTIONS.find((s) => s.key === scope)?.title;

  const back = (to) => { // to: 'root' | 'scope' | folder index
    if (to === "root") { setScope(null); setProjectId(null); setPath([]); }
    else if (to === "scope") { setProjectId(null); setPath([]); }
    else setPath(path.slice(0, to + 1));
  };

  const childFolders = scope === "project"
    ? (projectId && !path.length ? folders.filter((f) => f.scope === "project" && f.project_id === projectId) : [])
    : folders.filter((f) => f.scope === scope && (f.parent_id || null) === (current?.id || null));

  const canUploadHere = !!current;
  const canMakeFolder = scope === "project" ? !!projectId && !path.length : !!scope;

  const createFolder = async () => {
    const name = folderName.trim(); if (!name) return;
    setBusy(true);
    const row = scope === "project" ? { scope, project_id: projectId, name } : { scope, parent_id: current?.id || null, name };
    const { error } = await supabase.from("doc_folders").insert(row);
    setBusy(false);
    if (error) return toast.error(/duplicate/i.test(error.message) ? "A folder with that name already exists here." : error.message);
    toast.success(`Created "${name}".`); setNewFolder(false); setFolderName(""); refresh();
  };

  const upload = async (list) => {
    const picked = Array.from(list || []); if (!picked.length || !current) return;
    setBusy(true); let ok = 0;
    for (const f of picked) {
      if (f.size > MAX_MB * 1048576) { toast.error(`${f.name} is larger than ${MAX_MB} MB.`); continue; }
      const file_path = `${scope}/${current.id}/${crypto.randomUUID()}-${safe(f.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(file_path, f, { contentType: f.type || undefined });
      if (up.error) { toast.error(`${f.name}: ${up.error.message}`); continue; }
      const { error } = await supabase.from("doc_files").insert({ folder_id: current.id, file_name: f.name, file_path, mime_type: f.type || null, size_bytes: f.size });
      if (error) { await supabase.storage.from(BUCKET).remove([file_path]); toast.error(`${f.name}: ${error.message}`); continue; }
      ok++;
    }
    setBusy(false); if (fileInput.current) fileInput.current.value = "";
    if (ok) { toast.success(`${ok} file${ok > 1 ? "s" : ""} uploaded.`); refresh(); }
  };

  const open = async (f, download) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.file_path, 300, download ? { download: f.file_name } : undefined);
    if (error) return toast.error(error.message);
    if (download) { const a = document.createElement("a"); a.href = data.signedUrl; a.download = f.file_name; a.click(); }
    else window.open(data.signedUrl, "_blank", "noopener");
  };

  const remove = async (f) => {
    if (!window.confirm(`Delete "${f.file_name}"?`)) return;
    const { error } = await supabase.from("doc_files").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    await supabase.storage.from(BUCKET).remove([f.file_path]); toast.success("File deleted."); refresh();
  };
  const removeFolder = async (f) => {
    if (!window.confirm(`Delete folder "${f.name}" and every file inside it?`)) return;
    const inside = files.filter((x) => x.folder_id === f.id).map((x) => x.file_path);
    const { error } = await supabase.from("doc_folders").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    if (inside.length) await supabase.storage.from(BUCKET).remove(inside);
    toast.success("Folder deleted."); refresh();
  };

  const loading = foldersQ.isLoading || filesQ.isLoading || d.isLoading;
  const crumbs = [
    { t: "Documents", on: () => back("root") },
    ...(scope ? [{ t: sectionTitle, on: () => back("scope") }] : []),
    ...(scope === "project" && projectId ? [{ t: projectName[projectId] || "Project", on: () => setPath([]) }] : []),
    ...path.map((id, i) => ({ t: folders.find((f) => f.id === id)?.name || "Folder", on: () => back(i) })),
  ];
  const canDeleteFolder = (f) => !f.is_default && (f.created_by === me?.id || me?.role === "admin");

  const folderCard = (f, onOpen, sub) => (
    <div key={f.id} className="group relative rounded-2xl border border-slate-700/70 bg-[#111C32] p-5 transition hover:border-blue-500/50">
      <button onClick={onOpen} className="flex w-full items-center gap-4 text-left">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-400"><Folder size={22} /></span>
        <span className="min-w-0"><span className="block truncate font-semibold text-white">{f.name}</span><span className="block text-xs text-slate-400">{sub}</span></span>
        <ChevronRight size={18} className="ml-auto text-slate-500" />
      </button>
      {canDeleteFolder(f) && <button onClick={() => removeFolder(f)} aria-label="Delete folder" className="absolute right-2 top-2 hidden rounded p-1 text-slate-500 hover:text-red-400 group-hover:block"><Trash2 size={14} /></button>}
    </div>
  );

  return (
    <Page eyebrow="Workspace" title="Documents" subtitle="Project deliverables, the QUADE Library and SOP Discipline — internal team only.">
      <ErrorBox error={foldersQ.error || filesQ.error || d.error} />
      <nav className="mb-5 flex flex-wrap items-center gap-1 text-sm text-slate-400">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} />}
            <button onClick={c.on} className={i === crumbs.length - 1 ? "font-semibold text-white" : "hover:text-blue-300"}>{c.t}</button>
          </span>
        ))}
      </nav>

      {loading ? <Loading /> : !scope ? (
        <div className="grid gap-5 md:grid-cols-3">
          {SECTIONS.map(({ key, title, text, icon: Icon }) => (
            <button key={key} onClick={() => setScope(key)} className="rounded-2xl border border-slate-700/70 bg-[#111C32] p-6 text-left transition hover:-translate-y-0.5 hover:border-blue-500/60">
              <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/10 text-blue-400"><Icon size={26} /></span>
              <h3 className="text-lg font-bold text-white">{title}</h3>
              <p className="mt-1 text-sm text-slate-400">{text}</p>
              <p className="mt-3 text-xs text-slate-500">
                {key === "project" ? `${d.projects.length} project${d.projects.length === 1 ? "" : "s"}` : `${folders.filter((f) => f.scope === key && !f.parent_id).length} folder(s)`}
              </p>
            </button>
          ))}
        </div>
      ) : scope === "project" && !projectId ? (
        d.projects.length === 0 ? <Empty title="No projects yet" text="A project folder is created automatically when a project is created and assigned." /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {d.projects.map((p) => (
              <button key={p.id} onClick={() => setProjectId(p.id)} className="flex items-center gap-4 rounded-2xl border border-slate-700/70 bg-[#111C32] p-5 text-left transition hover:border-blue-500/50">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-500/10 text-blue-400"><Folder size={22} /></span>
                <span className="min-w-0"><span className="block truncate font-semibold text-white">{p.name}</span>
                  <span className="text-xs text-slate-400">{files.filter((f) => f.project_id === p.id).length} document(s)</span></span>
                <ChevronRight size={18} className="ml-auto text-slate-500" />
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">{current?.name || (scope === "project" ? projectName[projectId] : sectionTitle)}</h2>
            <div className="flex gap-2">
              {canMakeFolder && <button className={btnGhost} onClick={() => setNewFolder(true)}><FolderPlus size={16} className="mr-1.5 inline" />{scope === "project" ? "New section" : "New folder"}</button>}
              {canUploadHere && <>
                <input ref={fileInput} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
                <button className={btnPrimary} disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={16} className="mr-1.5 inline" />{busy ? "Uploading..." : "Upload documents"}</button>
              </>}
            </div>
          </div>

          {childFolders.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {childFolders.map((f) => folderCard(f, () => setPath([...path, f.id]), `${countIn(f.id)} document(s)${f.is_default ? " · default" : ""}`))}
            </div>
          )}
          {!current && childFolders.length === 0 && <Empty title={scope === "project" ? "No sections" : "No folders yet"} text={scope === "project" ? "Use New section to add one." : "Use New folder to create the first one."} />}

          {current && (
            <Card title="Documents" subtitle="PDF, images, Excel, Word and other files. Upload as many as you need.">
              {files.filter((f) => f.folder_id === current.id).length === 0 ? <Empty title="No documents here yet" text="Click Upload documents to attach files." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead><tr className={head}><th className={th}>Name</th><th className={th}>Type</th><th className={th}>Size</th><th className={th}>Uploaded by</th><th className={th}>Uploaded</th><th className={th}></th></tr></thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {files.filter((f) => f.folder_id === current.id).map((f) => (
                        <tr key={f.id} className="hover:bg-blue-500/[0.05]">
                          <td className="px-5 py-3"><span className="flex items-center gap-2 font-semibold text-white"><FileText size={16} className="text-blue-400" />{f.file_name}</span></td>
                          <td className="px-5 py-3 text-slate-300">{kind(f)}</td>
                          <td className="px-5 py-3 text-slate-400">{fmtSize(f.size_bytes)}</td>
                          <td className="px-5 py-3 text-slate-300">{personName(d.people, f.uploaded_by)}<span className="block text-xs capitalize text-slate-500">{(d.people[f.uploaded_by]?.role || "").replace(/_/g, " ")}</span></td>
                          <td className="px-5 py-3 text-slate-400">{fmtDate(f.created_at)}</td>
                          <td className="px-5 py-3"><div className="flex justify-end gap-3 text-slate-400">
                            <button title="Preview" onClick={() => open(f, false)} className="hover:text-blue-300"><Eye size={16} /></button>
                            <button title="Download" onClick={() => open(f, true)} className="hover:text-blue-300"><Download size={16} /></button>
                            {(f.uploaded_by === me?.id || me?.role === "admin") && <button title="Delete" onClick={() => remove(f)} className="hover:text-red-400"><Trash2 size={16} /></button>}
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {newFolder && (
        <Modal title={scope === "project" ? "New section" : "New folder"} subtitle={scope === "project" ? `In ${projectName[projectId]} — e.g. Review 3` : current ? `Inside ${current.name}` : sectionTitle} onClose={() => setNewFolder(false)}
          footer={<><button className={btnGhost} onClick={() => setNewFolder(false)}>Cancel</button><button className={btnPrimary} disabled={busy || !folderName.trim()} onClick={createFolder}>Create</button></>}>
          <Field label="Name"><input autoFocus className={inputCls} value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createFolder()} placeholder={scope === "project" ? "Review 3" : "Folder name"} /></Field>
        </Modal>
      )}
    </Page>
  );
}
