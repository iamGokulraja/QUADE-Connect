import { supabase } from "./supabaseClient";
import { taskOwnerIds } from "./board";

// Change the owners of a task. The first id becomes the main owner (tasks.assigned_to).
// Every id must be an owner of the board; the database refuses anyone else.
export async function saveTaskOwners(task, ids) {
  if (!ids.length) throw new Error("A task needs at least one owner.");
  const current = taskOwnerIds(task);
  const primary = ids.includes(task.assigned_to) ? task.assigned_to : ids[0];
  if (primary !== task.assigned_to) {
    const { error } = await supabase.from("tasks").update({ assigned_to: primary }).eq("id", task.id);
    if (error) throw error;
  }
  const add = ids.filter((id) => !current.includes(id));
  if (add.length) {
    const { error } = await supabase.from("task_assignees").insert(add.map((user_id) => ({ task_id: task.id, user_id })));
    if (error) throw error;
  }
  const remove = current.filter((id) => !ids.includes(id));
  if (remove.length) {
    const { error } = await supabase.from("task_assignees").delete().eq("task_id", task.id).in("user_id", remove);
    if (error) throw error;
  }
}
