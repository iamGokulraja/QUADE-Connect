# QUADE Connect — what changed in this version

## 1. Code reduction (shared foundation)
| Before | After |
|---|---|
| 6 layout files, ~1,470 lines, copy-pasted sidebar/profile/logout logic | `layouts/AppLayout.jsx` (105 lines) + `config/nav.js` (all menus in one place) |
| `ProtectedRoute` 174 lines, each layout and dashboard re-fetched the profile | `ProtectedRoute` 43 lines + one cached `useMe()` hook |
| 3 stub HR pages, `Button.jsx` (unused), empty dashboards | Removed. HR lists use `HRPeopleManagement` directly from `App.jsx` |
| Every page wrapped itself in a layout | Layout is a route wrapper (`<Outlet/>`); pages only contain content |
| Status/priority colours and date helpers repeated per page | `lib/constants.js`, `lib/utils.js`, `components/ui.jsx` |

Existing pages (Admin, HR, Client, PM projects, team assignment modal, Create User, Login, Landing) keep their code and styling. Only the layout wrapper was removed from them.

## 2. New features (real database data only, empty states everywhere)
- **Task system**: kanban + table views, task modal with assign, priority, due date, estimate, status, progress, **sub-tasks**, **comments**, **time logs**.
- **Project workspace** `/…/projects/:id`, one page for three roles: PM sees all teams, per-team progress and workload; Team Lead creates and assigns tasks to own team; Employee sees own tasks.
- **Dashboards** for PM, Team Lead, Employee (stats, projects with progress, overdue/due-soon list, workload).
- **Team Lead**: Projects & Tasks, My Team (live workload).
- **Employee**: My Tasks, My Projects.
- **Attendance** (check-in / check-out, late detection at 09:30, monthly hours) and **Time-Off** requests for Employee, Team Lead, Project Manager.
- **HR / Admin "Attendance & Leave"**: approve/reject leave, today's attendance for all staff.
- PM "My Projects" now shows progress and an Open button.

## 3. Database: how to apply
1. Open Supabase → SQL Editor. Run `supabase/sql/00_inspect_before_migration.sql`. **Read the output.**
   It lists the columns, policies and check constraints that already exist on `tasks`, `attendance`, `leave_requests`, `profiles`.
2. Run `supabase/migrations/20261114000000_work_management.sql`. It is idempotent and additive (nothing dropped; new objects are prefixed `qc_`).
3. If step 1 showed something unexpected (see "Assumptions"), send me that output before continuing.

### Assumptions I could not verify (your existing tables were not in the zip)
- `tasks`, `attendance`, `leave_requests` may already exist with other column names (for example `user_id` instead of `employee_id`, or `name` instead of `title`). The migration adds the columns the app uses. If the old columns are required (`NOT NULL`) inserts will fail. The inspect query shows this.
- An old check constraint on `tasks.status` that does not allow `review`, or an old broad RLS policy (for example "all authenticated users can read tasks"), would need removing. Policies OR together, so a broad old policy defeats the new ones.
- `teams`, `team_members`, `projects` and `project_team_assignments` RLS must already let Team Leads, Employees and PMs read their own rows (your master prompt says they do).
- `profiles.role` and `profiles.is_active` exist (they do per your prompt).

## 4. Test checklist (use real accounts, Rule 3 step 7)
Mark each module complete only after it passes.
1. **PM (Maha Rajan)**: My Projects → Assign Teams → Team Alpha → Save. Open the project: Team Alpha, Hari, Karnesh, Marees show.
2. **Team Lead (Hari)**: Projects & Tasks shows the project. Create 3 tasks (Karnesh, Marees, Karnesh). Try assigning to someone outside the team: must fail.
3. **Employee (Karnesh)**: My Tasks shows only Karnesh's tasks. Change status, progress, add sub-task, log hours. Editing title/assignee must be refused (database trigger).
4. **PM**: board shows all tasks, progress updates, workload per person. PM cannot edit tasks but can comment.
5. **Isolation**: Raja (QC Check) must NOT see Maha's project or tasks. Marees must NOT see Karnesh's tasks.
6. **Attendance**: employee checks in and out, second check-out and editing check-in are refused.
7. **Leave**: employee requests, HR approves, status updates for the employee. Employee cannot approve own request.
8. Quick SQL proof for any role: in the SQL editor use `set role authenticated; select set_config('request.jwt.claims', '{"sub":"<user-uuid>"}', true); select * from tasks;`

## 5. Not built yet (roadmap, shown as disabled "soon" items in the sidebar)
Team chat, document management with AWS S3, Gantt/milestones/calendar view, notifications, KPI, project costs, AI QC, client progress/approval workflow, leave balance. Per your rule "one module at a time", these come after the checklist above passes.

Note: `Admin → Documents` still posts to a FastAPI server on `http://127.0.0.1:8000`. The backend code was not in the zip, so I left it unchanged.

## 6. Security notes
- `.env` was not included in this package. Copy your own `.env` back (see `.env.example`). The publishable key is designed to be public; never put the service-role key in the frontend.
- Employee column restrictions, assignment-to-team rule, attendance immutability and leave approval are enforced in the database (triggers + RLS), not only in the UI.
- I could not run `npm install` or the Supabase database here, so the app was verified by syntax/import checking only, not run. Please run it and report any error text.


---
# Update 2: updated master prompt applied

**Reporting hierarchy (Admin → PM → Team Lead → Employee), separate from HR teams**
- New page *Reporting Hierarchy* (HR and Admin): choose which Team Leads report to each Project Manager. Table `project_manager_team_leads`; it never changes HR teams or project-team assignments. One Team Lead can report to one Project Manager only.
- New PM page *My Team Leads*: your Team Leads, their team size, open and delayed tasks, progress on your projects.
- Team Leads still see only their own team's employees and tasks.

**Admin monitoring** (`/admin/portfolio`): total, active, completed, delayed projects, overall progress, all projects with PM, progress and risk (high = past due date; medium = overdue tasks or due within 14 days with progress under 50%), Project Manager performance, team progress, upcoming deadlines, projects by status. Click a project for its full read-only execution board.

**Other changes**: task statuses are labelled To Do / In Progress / Under Review / On Hold / Completed. Project board and dashboards show Total, Completed, In progress, Pending and Delayed tasks. The app now shows a clear "Supabase is not configured" message instead of a blank page when `.env` is missing.

**Run order in Supabase SQL editor**: `00_inspect_before_migration.sql` (read it, section 4 is new), then `20261114000000_work_management.sql`, then `20261114010000_reporting_hierarchy.sql`.

**Assumptions to confirm**: `project_manager_team_leads` has columns `project_manager_id` and `team_lead_id`. Admin keeps write access to tasks in the database as "emergency access" (matrix footnote) but the interface is read-only for Admin. HR (not PM) edits the reporting hierarchy; tell me if you want a different owner.

**Not changed / still pending**: client document upload and request accept/reject, S3, chat, Gantt, notifications, KPI, costs, AI QC.

**Update 3**: the PM "Assign Teams" list now shows only teams led by Team Leads who report to that PM (plus teams already on the project, so they can be removed). The database enforces the same rule (restrictive policy `qc_pta_pm_only_own_leads`). The list stays empty until HR links Team Leads to the PM on the Reporting Hierarchy page and the reporting migration is applied.

---
# Update 4: Leave Management System
One **Leave** page for every role (`/…/leave`; HR and Admin keep `/hr/leave` and `/admin/leave`). Tabs: My Leave, Pending Approvals, Leave Calendar, and for HR/Admin Monitoring, Today's Attendance, Policies & Rules. Approval routing is automatic and configurable (Employee → Team Lead, Team Lead → Project Manager, Project Manager / HR Employee → HR Manager, HR Manager / Admin → Admin). Approvals run only through secure database functions. The SQL is in `supabase/migrations/20261114020000_leave_management.sql`. It replaces the leave section of the first migration, which was removed from that file.

## Update 5: QUADE Spotlight (internal social feed)
- Run `supabase/migrations/20261114030000_quade_spotlight.sql` once in the Supabase SQL Editor (safe to re-run).
- New: `src/pages/spotlight/`, `src/components/spotlight/`, `src/hooks/spotlight.js`, `src/lib/toast.js`, `src/components/ToastHost.jsx`.
- Changed: `src/config/nav.js` (menu item for 5 internal roles, not Client), `src/App.jsx` (routes), `src/components/NotificationBell.jsx` (also shows Spotlight notifications).

## Update 6: Projects, boards, personal boards, timers, alerts
- Run `supabase/migrations/20261115000000_boards_progress_alerts.sql` once in the Supabase SQL Editor (safe to re-run).
- Project Manager sidebar: "My Projects" and "My Team Leads" are merged into **Projects & Tasks** (Team Leads is a tab on that page).
- Team Lead: **Create Project Board** (boards, groups, tasks, sub-tasks) on each project. Employee and Team Lead: new **My Board** (personal board).
- Task statuses are now Not Started, Working on It, Stuck, Under Review, Completed.
- Timers (start / pause / resume / stop), attachments, deadline alerts in the bell (red), and an organisation roll-up for Admin on the Project Portfolio page.
- Deadline alerts are generated by the database (pg_cron, hourly). If pg_cron is not enabled, enable it in Database > Extensions and re-run the SQL file.

## Update 7: Project boards (Monday-style), merged employee workspace
- Run `supabase/migrations/20261115010000_project_boards_v2.sql` once after the Update 6 script (safe to re-run).
- Every board belongs to a project; every task on it, including tasks employees create for themselves, counts toward the project's progress.
- Employee: My Tasks, My Projects and My Board are merged into **My Work** (`/employee/work`). Open a project, create a board, add tasks.
- New project workspace with Table, Kanban, Gantt and Dashboard views (`src/pages/shared/ProjectWorkspace.jsx`, `src/components/board/`).
- Team Lead and Project Manager see all boards of a project (read-only for employee boards). Team Lead's **My Team** lists each employee's boards.
- Status labels open a coloured menu like Monday.com: Not Started, Working on It, Stuck, Under Review, Completed.

## Update 8: Shared project board, no progress percentages
- Run `supabase/migrations/20261115020000_board_columns_activity_realtime.sql` once after the Update 7 script (safe to re-run).
- Every progress bar and percentage is removed (employee, Team Lead, Project Manager and Admin screens). Task statuses stay: Not Started, Working on It, Blocked, Ready for Review, Done. Priorities: Low, Normal, High, Urgent.
- New boards start with the default columns and groups (New Tasks, In Progress, Under Review, Completed). Columns can be shown, hidden, renamed, reordered, and custom columns added (`src/components/board/ColumnsModal.jsx`).
- Boards have an optional type, a creator and a created date. Edit board changes name, description and type.
- Task detail shows an activity history. Boards, tasks, sub-tasks, statuses and comments update live through Supabase Realtime (`src/hooks/realtime.js`).
- Client project list no longer shows the project Status column.

## Update 9: Board sharing, discussion chat, HR and client changes
- Run `supabase/migrations/20261115030000_board_sharing_chat_client_projects.sql` once after the Update 8 script (safe to re-run).
- Board columns: only Task Name, Owner, Status, Priority and Due Date show by default. Timeline, Time Tracking, Attachments, Created By, Created Date and Last Updated can be switched on with the eye icon in Customize columns. Description is no longer a board column.
- (Replaced in Update 10: boards are no longer shared with the whole team.)
- Each board has a Discussion tab. Other people on the board get a notification for every message.
- HR: Active/Inactive boxes, filter and column removed; HR has My Attendance (check in / check out).
- Client: edit and delete own projects. Edits update the internal project; delete removes it with its assignments, boards and tasks. Admin can delete a project on the Project Portfolio page, which removes the hierarchy under it.

## Update 11: Multiple owners, PM boards, notifications, new board UI
- Fixed the blank page when opening a board (task permissions were evaluated before a task was opened).
- A board can have several owners (`board_owners`); a task can have several owners (`task_assignees`) and every task owner must be a board owner.
- Employees create boards for themselves only and can never assign anyone. Team Leads and Project Managers pick the owners (`create_board`, `set_board_owners`).
- Project Managers can create boards in their projects (workspace and Projects page).
- Notifications: made board owner, task assigned, project assigned (PM / Team Lead / employee), added to a team, board messages (all owners), new Spotlight post, task due / overdue (every task owner). The bell updates live and shows a toast.
- Board screen: "New task" button removed (tasks are added inline per group), board type removed, details moved to the three-dot menu, owner avatars beside Discussion, Attachments column opens your computer's file picker.
- Client dashboard redesigned (summary tiles, filters, project cards, create / edit window).
- New migration: `20261116000000_board_owners_notifications.sql`.

## Update 10: One board = one owner, cleaner project structure
- Run `supabase/migrations/20261115040000_board_owner_model.sql` once after the Update 9 script (safe to re-run).
- Every board has an owner chosen when it is created: an employee creates a board for themselves; a Team Lead creates one for themselves or for one employee of the team. The owner can be changed from the Owner button beside the Discussion tab.
- Every task on a board belongs to the board owner (the Owner column always shows the owner). Only the owner, the creator, the Team Lead, the Project Manager and Admin can see the board and its tasks. Teammates never see it.
- The creator manages the board (rename, columns, groups, delete) and can add tasks; the owner updates the status of their tasks and can add their own.
- Code clean-up: unused assets, empty folders and dead helpers removed; pages renamed by role (`pages/<role>/Dashboard.jsx`, `Projects.jsx`, ...); `supabase/sql` renamed `supabase/diagnostics`.

## Update 12 — QC (Quality Control) role
- New independent role `qc`: own login redirect (`/qc`), own menu (QC Dashboard, Documents, QC Grade, QUADE Spotlight). HR can create QC users (Create User → "QC") and list them (HR → QC Users).
- QC Dashboard: total projects, awaiting QC / under review / approved / rework, PM + Team Lead per project, filters, QC status update with remarks, recent uploaded files, project-wise upload counts, recent QC activity. All from real tables.
- QC Grade (QC assigns; HR + Admin read-only "QC Grade Reports"): grades A+/A/B/C per person **per project**, remarks, last updated, project-wise report, grading history, filters (person, role, project, department, grade).
- Database: `supabase/migrations/20261118000000_qc_quality_role.sql` (role constraint, read-only org visibility for QC, `qc_grades`, `qc_grade_history`, `qc_project_reviews`, `qc_activity`, triggers, RLS). Clients get no access.
- Edge function `create-user` now accepts role `qc` → redeploy it: `supabase functions deploy create-user`.


## Update 13 — Documents module (Projects / QUADE Library / SOP Discipline)
- New shared Documents page for Admin, HR, Project Manager, Team Lead, Employee and QC (never Clients): three boxes.
- **Projects:** every project automatically gets Initial, Review 1 and Review 2 sections; anyone can add more (Review 3...). Multiple files per section (PDF, images, Excel, Word, CAD...), preview, download, uploader + role + date + size. Project documents follow project visibility (QC/HR/Admin see all projects).
- **QUADE Library** and **SOP Discipline:** shared folders (nested), create folder, upload, preview, download.
- Files live in the private Supabase Storage bucket `documents`; metadata in `doc_folders` / `doc_files`. SQL: `supabase/migrations/20261119000000_documents_module.sql` (run after the QC migration).
- QC Dashboard now reads recent / per-project documents from this module.

## Update 14 — QUADE Team Chat (messaging only; audio/video comes later)
- New page **QUADE Team Chat** in the sidebar of Admin, HR, Project Manager, Team Lead, Employee and QC (not Clients), with an unread badge.
- Three-panel layout: conversations (Groups / Direct / Files, search for people, groups and messages) · active chat · collapsible details panel. One pane at a time on phones.
- **Custom groups** (anyone): name, description, picture, members; add/remove members, make/remove admin, rename, change picture, mute, pin, leave, delete (creator only).
- **Project groups** (Admin, the project's PM, Team Lead of an assigned team): created manually, linked to the project, only people working on the project can be added. Deleting the chat never touches the project.
- **Direct messages**: one private conversation per pair (no duplicates). Admin cannot read other people's chats.
- Messages: real-time (Supabase Realtime, only for the open chat), optimistic send without duplicates, older-message paging (40 at a time), replies, reactions, edit/delete own, pin (group admins), forward, @mentions, emoji, typing indicator, online status, last seen (can be hidden), read receipts, unread counts, in-chat search.
- Files and images: JPG/PNG/WEBP/PDF/Word/Excel/PowerPoint/TXT/CSV/ZIP/DWG/DXF up to 25 MB, upload progress, private bucket `chat-files` with signed URLs, Shared Files tab per chat and overall.
- Notifications in the existing bell (messages, mentions, replies, group invites/removals), no self-notifications, one row per chat for plain messages.
- SQL: `supabase/migrations/20261120000000_team_chat.sql` (tables, RLS, storage policies, chat_* functions). All changes to groups/members go through server functions that re-check permissions.
- Toasts are now mounted once in `AppLayout` (removed from the Spotlight page).

## Update 15 — QC grades are now MONTHLY
- QC gives each Employee and Team Lead one grade (A+, A, B, C) per calendar month instead of one per project. A month selector (last 12 months) sits at the top of **QC Grade**; QC can grade the current or any earlier month, never a future one.
- Tabs: **Grades** (chosen month, with the projects each person works on shown for context), **Monthly report** (grade counts per month; click a row to open it), **Grading history** (every change with its month).
- HR and Admin see the same page read-only as "QC Grade Reports".
- SQL: `supabase/migrations/20261122000000_qc_monthly_grades.sql`. Existing project-wise grades are converted: for each person and month the latest grade is kept (older duplicates are removed from the grades table; every change remains in the history table).
- Month is calculated in Indian time (Asia/Kolkata). This also prepares the data for the upcoming KPI score.

## Update 16 — HR Reports (CSV downloads, HR only)
- New page **HR Reports** (HR → Operations). Choose This month so far, Last month, 2 or 3 months ago, or the last 3 months + this month, then download:
  - **Attendance CSV** – every employee, every day: date, day, check-in, check-out, hours inside, status.
  - **QC grades CSV** – monthly grade, remarks, graded by/on for every active Employee and Team Lead ("Not graded" where QC has not graded).
  - **Leave takers CSV** – leave type, from/to, days in the period, total days, status, reason, applied on, approver (approved only, or all requests).
- Times are in Indian time. Files open correctly in Excel (UTF-8) and cannot run formulas from typed text.
- SQL: `supabase/migrations/20261122010000_hr_csv_reports.sql` — three functions that work for the HR role only (Admin and everyone else are refused by the database).

### Update 16 (addition) — Individual attendance sheets
- HR Reports → **Individual attendance sheets**: pick This month so far / Last month / 2 or 3 months ago, then download **all employees as one ZIP (one CSV per person)** or a single person's sheet.
- Each sheet lists every calendar day: check-in, check-out, hours inside, status (Present, Late, Absent, Leave, Weekly off) and remarks (approved leave type and reason, missing check-out), with totals at the bottom. Days after today are not listed.
- SQL: `supabase/migrations/20261122020000_hr_attendance_sheets.sql` (HR only).

## Update 17 — Fix: Team Chat group creation error
- Fixed `column "call_id" of relation "chat_notifications" does not exist` when creating a group or adding people. SQL: `supabase/migrations/20261122030000_chat_fix_notify.sql`.

## Update 18 — Attendance reset (one-time SQL)
- `supabase/migrations/20261122040000_reset_attendance.sql` deletes all check-in / check-out records (a backup table is kept first). No app code or settings change.

## Update 19 — Attendance location
- Check in / Check out now read the person's current location (browser GPS) and save the place name + coordinates. If the place-name lookup fails, the coordinates are saved instead.
- Shown in My Attendance history, Today's Attendance (Leave Management) and the new HR Dashboard attendance table (click a place to open the map).
- HR downloads (attendance CSV, individual sheets) include Check-in / Check-out location columns; the attendance CSV also has map links.
- `REQUIRE_LOCATION` in `src/lib/constants.js`: true = a check-in needs location permission; false = it is saved without a place if blocked.
- SQL: `supabase/migrations/20261122050000_attendance_location.sql` (new columns, guard so places cannot be edited later, updated HR report functions).

### Update 19 (change) — City name + red pin
- Attendance now shows and saves the city / town / village name (for example "Surandai"); the exact point is kept in the coordinates and opens on the map when the name is clicked. HR CSV files carry the city name plus the map link. The pin is a red badge. No SQL change.

## Update 20 — QUADE Spotlight redesign + "who liked"
- Click the like count under a post to see everyone who liked it (name, designation, when). The count reads "You and 3 others" like social feeds.
- Right column: Company highlights / Recent celebrations / Recent achievements removed; **Categories** list is there instead (chips above the feed on small screens). The Categories dropdown on the left was removed.
- Feed look: "What's on your mind?" composer bar with Photos / Write a post (opens a centered window), profile card with banner, Like / Comment buttons, coloured category badges, search with a collapsible Filters panel.
- No SQL needed (likes were already readable by all company members).

### Update 20 (fix) — names in the likes list
- SQL `20261122060000_spotlight_authors_names.sql`: the Spotlight people list now includes QC users and deactivated accounts, so every name shows in likes and comments. Unknown people show as "Former member". The post window no longer closes when you click outside it (no lost drafts).

## Update 21 — My Profile (+ Dark / Light theme)
- Click your name at the bottom of the left menu to open **My Profile**: photo, name, role, city, date of birth, phone, email, about me, and work details (joined date, employee code, role, department, designation).
- You can edit name, date of birth, phone, city, about me and your photo. Email (sign-in), joined date, role, department, designation and employee code are read-only.
- **Appearance**: Dark or Light. Saved to your profile, so it follows you to other devices.
- SQL: `supabase/migrations/20261123000000_my_profile.sql` (new profile columns + three functions: my_profile, update_my_profile, set_my_theme, each limited to your own row with input checks).
- Light theme is applied with a colour-inversion layer (`src/App.css`), so the whole app switches at once; photos stay natural.

## Update 22 — Feed access fix, QC attendance, 8:30 rule, profile tweaks
- Spotlight (and other lists) were empty for an account whose `is_active` was left empty. Empty now counts as active; only an explicit "inactive" blocks. New employees see the full old feed. SQL: `20261123010000_feed_access_qc_attendance.sql`.
- QC users now have **My Attendance** (menu + page) and appear in HR's Today's Attendance and individual sheets.
- Late rule: check in at or before **08:30 (Indian time)** = Present, after 08:30 = Late (`LATE_AFTER` in `lib/constants.js`). Applies to new check-ins only; old records are unchanged. The time used is the moment of the click.
- My Profile: no sample text in the fields; the Dark / Light buttons now sit inside **Edit profile** (preview instantly, saved with Save changes, Cancel puts it back); the separate Appearance card is gone.

### Update 22 (fix 2) — Spotlight visible to everyone except clients
- SQL `20261123020000_spotlight_everyone_except_client.sql`: the feed and the people list read author details through a safe function (name, role, designation, photo only), so a new employee who is not yet linked to the author still sees every post and every name. Clients still see nothing.

## Update 23 — My Moments database
- The My Moments page (menu item for Admin, HR, PM, Team Lead, Employee, QC) now has its database: SQL `20261123030000_my_moments.sql` creates `moments`, `moment_media`, the private `my-moments` file bucket and the `moments_stats` numbers. Fixes "Could not find the table 'public.moments'".
- Private to the owner: no other person, HR or Admin included, can see a moment or its files. Clients cannot use it. 10 files per moment, images up to 10 MB and videos up to 50 MB (checked in the app), dates cannot be in the future.

## Update 24 — Team Chat audio calls (LiveKit)
- Phone button next to Search in every chat header: starts an audio call. Direct chat: the other person's screen rings; group chat: every member rings. Members can also join a running call from the green "Audio call in progress" bar.
- Call window like Teams: mute / unmute, device picker, minimize to a small draggable window (the call keeps going while you use other pages), leave, and "End for everyone" in groups. Call history lines ("Audio call · 05:12", "Missed audio call") appear in the chat, and missed calls go to the notification bell.
- Setup: see `LIVEKIT_SETUP.md`. SQL: `20261123040000_team_chat_audio_calls.sql`. New Edge Function: `supabase/functions/livekit-token`. New package: `livekit-client` (run `npm install`).

### Update 24 (fix) — clear error when the calling service is not deployed
- The app checks the `livekit-token` function before ringing anybody, so a missing deployment or missing keys shows a clear message instead of a "Cancelled" call. The function is now a single file (easier to paste into the Supabase dashboard).

## Update 25 — Team Chat video calls (same LiveKit keys)
- A **Video** button now sits next to the Phone button in every chat header. Direct chat: the other person's screen rings with an "Incoming video call" popup; group chat: every member rings. A running call is joined as the type it was started with (audio stays audio, video stays video).
- Video window like Teams: camera on/off, microphone, screen share, device picker (camera / microphone / speaker), picture-in-picture, minimize to a small draggable window that shows the active speaker's video. One-to-one calls show the other person full screen with your own camera in a small corner tile; groups show a tile grid. If camera permission is denied you stay in the call with your initials shown.
- Chat history lines and "Call again" now remember the type ("Video call · 05:12", "Missed video call").
- **No new keys, no Edge Function change, no new package.** SQL: `20261123050000_team_chat_video_calls.sql` (one function). Also added `vercel.json` (single-page-app rewrite) at the project root so refreshing any page on Vercel no longer gives 404.

## Update 26 — Hierarchy tree, People page, HR Reports fix, new sidebar
- **Reporting Hierarchy is now a tree**: Admin at the top, then HR, QC and every Project Manager, then their Team Leads, their teams and the employees. HR and Admin can **drag an employee onto another team** or **drag a Team Lead onto another Project Manager**; a button on every card does the same on phones, and a button on each team changes its Team Lead. Every change is confirmed first. People without a place appear in a "needs placing" strip above the tree. Search highlights a person.
- **Nothing is lost when someone moves.** Existing boards and tasks stay as they are; the old team's projects stay visible (with the same project owner) marked "Previous team"; the new team's projects, including ones assigned later, appear. A replaced Team Lead keeps seeing the team's current projects. Moving a Team Lead to another Project Manager changes only the reporting line, projects keep their owner. SQL: `20261124000000_hierarchy_tree_people.sql`.
- **People** (HR and Admin): Employees, Project Managers and Team Leads merged into one menu item with tabs, search, a "working on project" filter and the names of each person's current projects (not boards). Old links still work.
- **HR Reports**: cleaner layout (month chips, three report cards, one ZIP card, one person card). Fixed: the employees ZIP no longer downloads by itself when you open the employee list or change the month; files download only when you click a download button.
- **Sidebar**: more space between items, muted icons that light up (glowing tile and accent bar) on the page you are in; works on narrow screens too.
- **QUADE Team Chat is now called Team Connect** everywhere in the app.
