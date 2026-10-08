export function customerDisplayMedia<T extends { url: string }>(files: T[], mode: string | undefined, fixedUrl: string | undefined, index: number): T | undefined {
  if (!files.length) return undefined
  if (mode === 'single') return files.find(file => file.url === fixedUrl) || files[0]
  return files[index % files.length]
}
