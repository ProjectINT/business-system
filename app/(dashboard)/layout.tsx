import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <DashboardHeader />
      {children}
    </div>
  );
}
