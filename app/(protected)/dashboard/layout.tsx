import { DashboardLayoutClient } from "@/components/dashboard/dashboard-layout-client";
import { RealtimeNotifications } from "@/components/dashboard/realtime-notifications";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <RealtimeNotifications />
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </>
  );
}
