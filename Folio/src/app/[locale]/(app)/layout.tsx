import { AppSidebar } from "./AppSidebar";
import { getSuperAdmin } from "@/lib/admin/guard";

// Authenticated app shell: soft sidebar + content area. Wraps dashboard, students, etc.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sa = await getSuperAdmin();
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <AppSidebar isSuperAdmin={!!sa} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
