import { personName } from "../../hooks/queries";
import { avatarColor } from "./chatUtils";

// Round initial for one person.
export function Avatar({ id, people, size = 28 }) {
  const name = personName(people, id);
  return (
    <span title={name} style={{ background: avatarColor(id), width: size, height: size, fontSize: size * 0.42 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-[#111C32]">
      {name[0]?.toUpperCase() || "?"}
    </span>
  );
}

// Overlapping avatars for the owners of a board or a task ("+2" when there are more than `max`).
export function AvatarStack({ ids = [], people, max = 3, size = 26 }) {
  if (!ids.length) return <span className="text-slate-500">—</span>;
  const shown = ids.slice(0, max);
  return (
    <span className="inline-flex items-center" title={ids.map((id) => personName(people, id)).join(", ")}>
      {shown.map((id, i) => (
        <span key={id} style={{ marginLeft: i ? -size * 0.3 : 0 }}><Avatar id={id} people={people} size={size} /></span>
      ))}
      {ids.length > max && (
        <span style={{ marginLeft: -size * 0.3, width: size, height: size, fontSize: size * 0.38 }}
          className="inline-flex items-center justify-center rounded-full bg-slate-600 font-semibold text-white ring-2 ring-[#111C32]">+{ids.length - max}</span>
      )}
    </span>
  );
}
