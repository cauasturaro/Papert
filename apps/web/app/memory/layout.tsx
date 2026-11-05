import { PageShell } from "@/components/app/page-shell";

export default function MemoryLayout({ children }: LayoutProps<"/memory">) {
  return <PageShell>{children}</PageShell>;
}
