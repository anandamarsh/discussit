export function readTrimmedEnv(value: string | undefined) {
  return value?.trim() ?? "";
}
