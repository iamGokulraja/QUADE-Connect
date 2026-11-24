import { useMemo } from "react";
import { taskOwnerIds } from "../lib/board";

// Works out which projects / tasks / teams belong to the signed-in user's role.
//  project_manager : projects they own, all tasks of those projects
//  team_lead       : projects assigned to the teams they lead, tasks of those teams
//  employee        : projects of the teams they belong to; tasks on their own boards and on boards shared by the Team Lead
export function useScope(me, d) {
  const { projects, teams, assignments, members, tasks, history = [] } = d;

  return useMemo(() => {
    const ledIds = teams.filter((t) => t.team_lead_id === me.id).map((t) => t.id);
    const memberIds = members.filter((m) => m.employee_id === me.id).map((m) => m.team_id);

    let myProjects;
    const legacyIds = new Set();      // projects I keep seeing from a previous team
    const historyTeamIds = new Set(); // teams I used to work in (their boards / tasks that are still mine stay visible)
    if (me.role === "admin") {
      myProjects = projects;
    } else if (me.role === "project_manager") {
      myProjects = projects.filter((p) => p.project_manager_id === me.id);
    } else {
      const mine = me.role === "team_lead" ? ledIds : memberIds;
      const ids = new Set(assignments.filter((a) => mine.includes(a.team_id)).map((a) => a.project_id));
      history.filter((h) => h.user_id === me.id).forEach((h) => {
        if (h.team_id) historyTeamIds.add(h.team_id);
        if (!ids.has(h.project_id)) legacyIds.add(h.project_id);
      });
      myProjects = projects.filter((p) => ids.has(p.id) || legacyIds.has(p.id));
    }

    const projectIds = new Set(myProjects.map((p) => p.id));
    let myTasks = tasks.filter((t) => projectIds.has(t.project_id));
    if (me.role === "team_lead") myTasks = myTasks.filter((t) => ledIds.includes(t.team_id) || historyTeamIds.has(t.team_id));
    // Employees also see every task on the boards their Team Lead shares with the team (the database decides what is visible).
    // `own` = tasks that are theirs, used for personal counts.
    const own = me.role === "employee" ? myTasks.filter((t) => taskOwnerIds(t).includes(me.id) || t.created_by === me.id) : myTasks;

    return { projects: myProjects, tasks: myTasks, own, ledIds, memberIds, legacyIds, historyTeamIds };
  }, [me, projects, teams, assignments, members, tasks, history]);
}
