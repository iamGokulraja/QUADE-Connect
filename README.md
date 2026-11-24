# QUADE Connect

React + Vite + Tailwind front end on Supabase (Postgres, Auth, Storage, Realtime).
Roles: Admin, HR, Project Manager, Team Lead, Employee, Client.

## Run
1. Create `.env` next to `package.json` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. `npm install` then `npm run dev`.
3. Run the files in `supabase/migrations` once, in file-name order, in the Supabase SQL Editor (each is safe to re-run).
   `supabase/diagnostics` holds a read-only check to run before the first migration; `supabase/functions` holds the create-user edge function.

## Source layout (`src/`)
| Folder | What lives there |
|---|---|
| `pages/<role>/` | Screens that belong to one role: `admin`, `hr`, `project-manager`, `client` |
| `pages/shared/` | Screens used by several roles: work dashboard, project list, project workspace, My Team, attendance, portfolio, reporting hierarchy |
| `pages/leave/`, `pages/spotlight/` | Leave management and the Spotlight feed (all roles) |
| `components/board/` | Board table, Kanban, Gantt, dashboard, discussion, owner, columns and task windows |
| `components/spotlight/` | Spotlight post pieces |
| `components/` | Shared widgets: ui kit, notification bell, protected route, toast host, admin roll-up |
| `hooks/` | Data hooks (React Query): work data, boards, leave, spotlight, realtime sync, scope per role |
| `lib/` | Supabase client, constants (labels), utils, board helpers and permissions |
| `config/nav.js` | Sidebar menu per role |
| `layouts/` | App shell (sidebar, header, bell) |

Update history: `CHANGELOG.md`.
