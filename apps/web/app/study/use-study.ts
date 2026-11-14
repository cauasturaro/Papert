import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { errorKind, toLearnerMessage } from "@/lib/api/learner-error";
import { studyRequest, type Workspace } from "./study-api";
import { studyKeys } from "./study-keys";

/** Address of the study IDE for a workspace. */
export function workspaceHref(workspaceId: string) {
  return `/study/${encodeURIComponent(workspaceId)}`;
}

/**
 * Starts or resumes a roadmap from the study home or a draft page, then opens the
 * workspace's own address so reload, Back and links keep working.
 */
export function useStudy() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Resumes the learner's existing workspace, including a generated roadmap's draft workspace.
  const startMutation = useMutation({
    mutationFn: async (roadmapId: string) =>
      studyRequest<Workspace>(`roadmaps/${roadmapId}/start`, "POST", {}),
    onSuccess: (workspace) => {
      // The workspace page reads this cache entry instead of loading it again.
      queryClient.setQueryData(studyKeys.workspace(workspace.id), workspace);

      router.push(workspaceHref(workspace.id));
    },
  });

  const error = startMutation.error;
  const signedOut = error !== null && errorKind(error) === "session_expired";

  return {
    busy: startMutation.isPending,
    message: error ? toLearnerMessage(error) : "",
    signedOut,
    start: (roadmapId: string) => startMutation.mutate(roadmapId),
    open: (workspaceId: string) => router.push(workspaceHref(workspaceId)),
  };
}
