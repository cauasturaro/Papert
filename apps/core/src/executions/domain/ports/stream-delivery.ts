export interface StreamDelivery {
  enabled(): boolean;
  open(): {
    send(connectionId: string, snapshot: unknown): Promise<void>;
    close(): void;
  };
}
