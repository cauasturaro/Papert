import { CommunityShell } from "./community-shell";

export default function CommunityLayout({
  children,
}: LayoutProps<"/community">) {
  return <CommunityShell>{children}</CommunityShell>;
}
