export function displayMediaKey(file: {url:string;productId?:string;specId?:string}): string {
  return file.productId ? `product:${file.productId}:${file.specId || ''}` : file.url
}

export function customerDisplayMedia<T extends { url: string; productId?: string; specId?: string }>(files: T[], mode: string | undefined, fixedUrl: string | undefined, index: number): T | undefined {
  if (!files.length) return undefined
  if (mode === 'single') return files.find(file => file.url === fixedUrl || displayMediaKey(file) === fixedUrl) || files[0]
  return files[index % files.length]
}
