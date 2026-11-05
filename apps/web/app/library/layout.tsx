import { CommunityShell } from "../community/community-shell";

export default function LibraryLayout({ children }: LayoutProps<"/library">) {
  return <CommunityShell>{children}</CommunityShell>;
}
