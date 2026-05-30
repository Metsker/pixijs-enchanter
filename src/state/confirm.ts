import { get, writable } from 'svelte/store';

// A single in-flight confirmation request. Irrecoverable actions route their
// commit through here: the modal captures input until the player commits or
// cancels. Copy is pre-rendered by the caller so this module stays
// i18n-agnostic.
export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  // Tone the confirm button - 'danger' for destructive actions.
  tone?: 'danger' | 'default';
  onConfirm: () => void;
}

export const confirmRequest = writable<ConfirmRequest | null>(null);

export function requestConfirm(req: ConfirmRequest): void {
  confirmRequest.set(req);
}

export function resolveConfirm(): void {
  const req = get(confirmRequest);
  confirmRequest.set(null);
  req?.onConfirm();
}

export function cancelConfirm(): void {
  confirmRequest.set(null);
}
