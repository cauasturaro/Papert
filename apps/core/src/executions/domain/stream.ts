export type StreamPrincipal = {
  user: { id: string };
  session: { id: string; tokenId: string };
};
export type StreamConnection = {
  connectionId: string;
  executionId: string;
  userId: string;
  authSessionId: string;
  tokenId: string;
  sessionId: string;
  expires: number;
};
export type StreamGrant = {
  executionId: string;
  authSessionId: string;
  tokenId: string;
};

export class StreamConnectionClosed extends Error {}

export type StreamSettings = {
  enabled: boolean;
};
