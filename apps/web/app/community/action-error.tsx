import { Alert, AlertDescription } from "@/components/ui/alert/alert";

/** A failed vote, save or start, shown where the community cards are. */
export function ActionError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Alert variant="destructive" size="sm" role="alert">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
