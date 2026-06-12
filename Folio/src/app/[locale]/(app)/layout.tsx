import { AppSidebar } from "./AppSidebar";

// Authenticated app shell: soft sidebar + content area. Wraps dashboard, students, etc.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <AppSidebar />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
