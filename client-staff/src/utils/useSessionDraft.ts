import { useEffect, useState } from "react";
import { memoryDrafts } from "./draftMemory";
import { useAuthStore } from "../stores/auth";
export function useSessionDraft<T>(name: string, initial: T) {
  const id = useAuthStore.getState().user?.staffId,
    key = `employee-draft.${id}.${name}`;
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null") ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [
    value,
    setValue,
    () => {
      sessionStorage.removeItem(key);
      setValue(initial);
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
