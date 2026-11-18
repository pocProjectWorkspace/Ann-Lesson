import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { navFor } from "@/components/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("SUPER_ADMIN");
  return (
    <AppShell session={session} nav={navFor("SUPER_ADMIN")}>
      {children}
    </AppShell>
  );
}
