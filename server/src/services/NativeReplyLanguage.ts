/** Reply locale is message context, never an account permission or role. */
export type NativeReplyLanguage = 'zh' | 'en' | 'id'
export function nativeReplyLanguage(source:{text?:string;language?:string}):NativeReplyLanguage {
 if(/[\u3400-\u9fff]/u.test(source.text||''))return 'zh'
 return source.language==='en'?'en':source.language==='zh'?'zh':'id'
}
export function nativeReplyText(source:{text?:string;language?:string},zh:string,en:string,id:string){
 return {zh,en,id}[nativeReplyLanguage(source)]
}
