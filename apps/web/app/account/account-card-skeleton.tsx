import { Card, CardDescription, CardHeader } from "@/components/ui/card/card";

export function AccountCardSkeleton() {
  return (
    <Card className="max-w-md shadow-xl shadow-foreground/5">
      <CardHeader>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <CardDescription role="status">Checking your session…</CardDescription>
      </CardHeader>
    </Card>
  );
}
