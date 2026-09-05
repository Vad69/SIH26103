import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

const links = [
  { to: "/", label: "Command center", end: true },
  { to: "/decisions", label: "Decision board" },
  { to: "/projects", label: "Projects" },
  { to: "/reports", label: "Reports" },
  { to: "/briefing", label: "Monthly brief" },
  { to: "/flash", label: "Flash report" },
  { to: "/qpisr", label: "QPISR" },
  { to: "/alerts", label: "Alerts" },
];

function roleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "project_manager") return "Project manager";
  return "Member";
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-paper">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col bg-ink text-paper md:flex">
          <div className="border-b border-white/10 px-5 py-6">
            <p className="text-[11px] tracking-[0.22em] text-sand/70 uppercase">MoSPI · SIH26103</p>
            <h1 className="font-serif mt-1 text-2xl text-white">Pragati</h1>
            <p className="mt-1 text-sm text-sand/80">Decision support</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-3">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm ${
                    isActive ? "bg-white/10 text-white" : "text-sand/80 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            {user.role === "admin" ? (
              <>
              <NavLink
                to="/import"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm ${
                    isActive ? "bg-white/10 text-white" : "text-sand/80 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                Import
              </NavLink>
              <NavLink
                to="/users"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm ${
                    isActive ? "bg-white/10 text-white" : "text-sand/80 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                Users
              </NavLink>
              </>
            ) : null}
          </nav>
          <div className="border-t border-white/10 p-4 text-sm">
            <p className="font-medium text-white">{user.name}</p>
            <p className="text-sand/70">{roleLabel(user.role)}</p>
            <button
              className="mt-3 text-xs tracking-wide text-sand/70 uppercase hover:text-white"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-sand bg-white/70 px-4 py-3 md:hidden">
            <span className="font-serif text-lg">Pragati</span>
            <button className="text-sm" onClick={() => { logout(); navigate("/login"); }}>
              Sign out
            </button>
          </header>
          <div className="flex gap-2 overflow-x-auto border-b border-sand px-4 py-2 md:hidden">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-1 text-sm ${isActive ? "bg-navy text-white" : "bg-white"}`
                }
              >
                {l.label}
              </NavLink>
            ))}
            {user.role === "admin" ? (
              <NavLink
                to="/users"
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-1 text-sm ${isActive ? "bg-navy text-white" : "bg-white"}`
                }
              >
                Users
              </NavLink>
            ) : null}
          </div>
          <main className="flex-1 p-4 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
