import { TriangleAlert } from "../icons/lucide.js";
import { AdminPanel } from "../components/admin/index.js";

export default function AdminPage({ user, onBack }) {
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  if (!isAdmin) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-900">
        <TriangleAlert size={36} className="text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Access denied</p>
      </div>
    );
  }

  return <AdminPanel user={user} onBack={onBack} />;
}
