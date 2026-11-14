import { readErrorBody } from "../api/request-error.ts";

export type User = { id: string; email: string };

type AuthResult = { user: User };

type Credentials = {
  email: FormDataEntryValue | null;
  password: FormDataEntryValue | null;
};

export class AuthRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);

    this.status = status;
  }
}

export async function submitCredentials(
  register: boolean,
  credentials: Credentials,
): Promise<AuthResult> {
  const response = await fetch(`/api/auth/${register ? "register" : "login"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) {
    const data = await readErrorBody(response);
    throw new AuthRequestError(
      response.status,
      typeof data?.message === "string"
        ? data.message
        : "Unable to sign in. Please try again.",
    );
  }

  return response.json();
}

export async function checkSession(refresh = false): Promise<AuthResult> {
  const response = await fetch(`/api/auth/${refresh ? "refresh" : "me"}`, {
    method: refresh ? "POST" : "GET",
    cache: "no-store",
    headers: refresh ? { "Content-Type": "application/json" } : {},
    body: refresh ? "{}" : undefined,
  });
  if (!response.ok) {
    await readErrorBody(response);
    throw new AuthRequestError(
      response.status,
      response.status === 401
        ? "Please sign in to continue. If your session expired, sign in again to return here."
        : "We could not check your session. Please try again.",
    );
  }

  return response.json();
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  if (!response.ok && response.status !== 401) {
    throw new AuthRequestError(
      response.status,
      "We could not sign you out. Please try again.",
    );
  }
}
