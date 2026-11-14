export interface ExecutionQueue {
  publish(id: string): Promise<void>;
}
