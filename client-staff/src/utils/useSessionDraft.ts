import { useState } from "react";
import { memoryDrafts } from "./draftMemory";
import { useAuthStore } from "../stores/auth";
export function useSessionDraft<T>(name: string, initial: T) {
  const key = `employee-draft.${useAuthStore.getState().user?.staffId}.${name}`;
  const read = () => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null") ?? initial;
    } catch {
      return initial;
    }
  };
  const [state, setState] = useState<{ key: string; value: T }>(() => ({
    key,
    value: read(),
  }));
  const value: T = state.key === key ? state.value : read();
  const setValue = (next: T | ((previous: T) => T)) =>
    setState((previous) => {
      const before: T = previous.key === key ? previous.value : read();
      const resolved =
        typeof next === "function" ? (next as (v: T) => T)(before) : next;
      sessionStorage.setItem(key, JSON.stringify(resolved));
      return { key, value: resolved };
    });
  return [
    value,
    setValue,
    () => {
      sessionStorage.removeItem(key);
      setState({ key, value: initial });
    },
  ] as const;
}

export function useMemoryDraft<T>(name: string, initial: T) {
  const key = `${useAuthStore.getState().user?.staffId}.${name}`;
  const [value, setState] = useState<T>(() => memoryDrafts.get(key) ?? initial);
  const setValue = (next: T | ((previous: T) => T)) =>
    setState((previous) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: T) => T)(previous)
          : next;
      memoryDrafts.set(key, resolved);
      return resolved;
    });
  return [value, setValue] as const;
}
