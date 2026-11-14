import { PageShell } from "@/components/app/page-shell";

export default function CommunityLayout({
  children,
}: LayoutProps<"/community">) {
  return <PageShell>{children}</PageShell>;
}
