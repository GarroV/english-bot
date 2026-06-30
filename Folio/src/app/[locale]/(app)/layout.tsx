import { TopNav } from "./TopNav";
import { getSuperAdmin } from "@/lib/admin/guard";

// Authenticated app shell: top navigation bar + full-width content (bento-friendly).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sa = await getSuperAdmin();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <TopNav isSuperAdmin={!!sa} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
