import AppLayout from "@/nav/AppLayout.js";

export default function ProtectedLayout({ children }) {
  return <AppLayout>{children}</AppLayout>;
}
