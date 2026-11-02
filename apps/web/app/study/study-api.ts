type Challenge = {
  instructions: string;
  criteria: { id: string; description: string }[];
};

type Roadmap = {
  id: string;
  authorName: string;
  definition: {
    title: string;
    description: string;
    steps: {
      id: string;
      title: string;
      content: string;
      challenge: Challenge;
    }[];
  };
};

export type Workspace = {
  id: string;
  roadmap: Roadmap;
  currentStep: number;
  revision: number;
  notes: string;
  files: Record<string, string>;
  session: { id: string };
  attempts: {
    id: string;
    stepId: string;
    revision: number;
    files: Record<string, string>;
    challenge: Challenge;
    result: { status: string };
    createdAt: string;
  }[];
};

export class StudyRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function studyRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/study/${path}`, {
    method,
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new StudyRequestError(
      response.status,
      response.status === 401
        ? "Please sign in to start or resume your study."
        : (data.message ?? "Unable to load your study. Please try again."),
    );
  }

  return data;
}

export type { Roadmap };
