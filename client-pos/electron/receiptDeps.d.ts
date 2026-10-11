declare module 'jsbarcode' {
  const encode: (target: {encodings?: {data:string;text:string;options:Record<string,any>}[]}, text:string, options:Record<string,any>)=>void
  export default encode
}
