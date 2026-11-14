export interface StreamDelivery {
  enabled(): boolean;
  open(): {
    send(
      connectionId: string,
      snapshot: unknown,
      signal?: AbortSignal,
    ): Promise<void>;
    close(): void;
  };
}
