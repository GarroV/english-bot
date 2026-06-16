import { redirect } from "@/i18n/navigation";

// Students are merged into the schedule screen (right column). This standalone route
// now just redirects there so old links/bookmarks don't 404.
export default async function StudentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/schedule", locale });
}
