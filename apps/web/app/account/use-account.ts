import { useState, type FormEvent } from "react";
import { useSessionContext } from "@/components/app/session-provider";

export function useAccount() {
  const session = useSessionContext();
  const [register, setRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const fields = new FormData(form);

    session.beginAuthChange();
    setSubmitting(true);
    session.setMessage("");

    try {
      const response = await fetch(
        `/api/auth/${register ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: fields.get("email"),
            password: fields.get("password"),
          }),
        },
      );
      const data = await response.json();

      if (response.ok) {
        session.setUser(data.user);
        form.reset();
      } else {
        session.setMessage(
          data.message ?? "Unable to sign in. Please try again.",
        );
      }
    } catch {
      session.setMessage(
        "The service is unavailable. Your form is still here; please try again.",
      );
    } finally {
      session.beginAuthChange();
      setSubmitting(false);
    }
  }

  function toggleRegistration() {
    setRegister(!register);
    session.setMessage("");
  }

  return {
    user: session.user,
    register,
    loading: session.loading,
    busy: submitting || session.signingOut,
    message: session.message,
    submitCredentials,
    logout: session.logout,
    toggleRegistration,
  };
}
