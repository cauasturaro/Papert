"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert/alert";

export function StartError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" size="sm" role="alert">
      <AlertTitle>Your workspace did not open</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
