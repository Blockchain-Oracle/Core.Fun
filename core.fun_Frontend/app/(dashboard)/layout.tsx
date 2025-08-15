import DashboardLayout from "@/components/layout/dashboard-layout"
import { ProtectedRoutes } from "@/components/auth/ProtectedRoutes"

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoutes>
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </ProtectedRoutes>
  )
}