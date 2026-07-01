import { getTranslations } from "next-intl/server";
import { TopNav } from "./TopNav";
import { getSuperAdmin } from "@/lib/admin/guard";
import { listStudents } from "@/lib/students/queries";

// Authenticated app shell: top navigation bar + full-width content (bento-friendly).
// The top bar hosts global quick-create actions (lesson/payment), so it needs the active roster.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [sa, allStudents, d, b] = await Promise.all([
    getSuperAdmin(),
    listStudents(true),
    getTranslations("Dashboard"),
    getTranslations("Billing"),
  ]);
  const students = allStudents.filter((s) => s.archived_at == null).map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <TopNav
        isSuperAdmin={!!sa}
        students={students}
        headerLabels={{ addLesson: d("addLesson"), addPayment: d("addPayment") }}
        paymentLabels={{
          title: b("recordPayment"), student: b("student"), amount: b("amount"), note: b("note"),
          save: b("save"), cancel: b("cancel"), saved: b("saved"), error: b("saveError"),
          pickStudent: d("pickStudent"),
        }}
      />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
