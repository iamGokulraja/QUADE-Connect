import { Navigate } from "react-router-dom";
import { ROLE_HOME } from "../lib/constants";
import { signOut } from "../lib/auth";
import { useMe } from "../hooks/queries";

const Screen = ({ children }) => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0B1120] p-8 text-white">
    {children}
  </div>
);

// Wraps a group of routes. Redirects to /login, or to the user's own home when the role is wrong.
// The database (RLS) is the real security layer; this only keeps the UI tidy.
export default function ProtectedRoute({ roles, children }) {
  const { data: me, isLoading, error } = useMe();

  if (isLoading) return <Screen>Checking account...</Screen>;

  if (error || (me && !me.is_active)) {
    return (
      <Screen>
        <p className="text-red-400">{error?.message || "Your account is inactive."}</p>
        <button
          className="rounded-lg bg-blue-600 px-5 py-3 hover:bg-blue-500"
          onClick={async () => {
            await signOut();
            window.location.href = "/login";
          }}
        >
          Sign Out
        </button>
      </Screen>
    );
  }

  if (!me) return <Navigate to="/login" replace />;

  if (!roles.includes(me.role)) {
    return <Navigate to={ROLE_HOME[me.role] || "/login"} replace />;
  }

  return children;
}
