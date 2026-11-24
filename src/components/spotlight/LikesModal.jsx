import { Heart } from "lucide-react";
import { Modal, Loading } from "../ui";
import { roleLabel, timeAgo, useLikers } from "../../hooks/spotlight";
import Avatar from "./Avatar";

// "Who liked this post" list (opened by clicking the like count).
export default function LikesModal({ post, authors, me, onClose }) {
  const { data = [], isLoading } = useLikers(post.id, true);
  const byId = Object.fromEntries(authors.map((a) => [a.id, a]));
  return (
    <Modal title="Likes" subtitle={`${post.like_count} ${post.like_count === 1 ? "person likes" : "people like"} this post`} onClose={onClose}>
      {isLoading ? <Loading /> : data.length === 0 ? <p className="text-sm text-slate-400">No likes yet.</p> : (
        <ul className="-my-1 max-h-[55vh] divide-y divide-slate-700/50 overflow-y-auto">
          {data.map((l) => {
            const a = byId[l.user_id];
            return (
              <li key={l.user_id} className="flex items-center gap-3 py-3">
                <Avatar name={a?.full_name} path={a?.avatar_path} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{a?.full_name || "Former member"}{l.user_id === me.id && <span className="ml-1 font-normal text-slate-400">(you)</span>}</p>
                  <p className="truncate text-xs text-slate-400">{a ? `${a.designation || roleLabel(a.role)} · ` : ""}{timeAgo(l.created_at)}</p>
                </div>
                <Heart size={16} className="shrink-0 fill-pink-500 text-pink-500" />
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
