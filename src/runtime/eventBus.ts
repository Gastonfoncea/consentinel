import type { RuntimePermissionEvent } from "./types";

type Listener = (event: RuntimePermissionEvent) => void;

export class RuntimeEventBus {
  private readonly listeners = new Set<Listener>();

  emit(event: RuntimePermissionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
