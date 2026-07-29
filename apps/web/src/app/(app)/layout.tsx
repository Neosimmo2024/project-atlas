import { AppShell } from "@/components/app-shell";
import { getSessionAccountSummary } from "@/repositories/session-account";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const account = await getSessionAccountSummary();

  return <AppShell account={account}>{children}</AppShell>;
}
