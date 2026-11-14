import { PageShell } from "@/components/app/page-shell";

export default function LibraryLayout({ children }: LayoutProps<"/library">) {
  return <PageShell>{children}</PageShell>;
}
