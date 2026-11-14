import { PageShell } from "@/components/app/page-shell";

export default function ProfileLayout({ children }: LayoutProps<"/profile">) {
  return <PageShell>{children}</PageShell>;
}
