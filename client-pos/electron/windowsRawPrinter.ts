import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { windowsRawCode } from './windowsRawCode'

const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
${windowsRawCode}
'@ -Language CSharp
[Console]::Out.WriteLine('{"ready":true}')
while ($null -ne ($line = [Console]::ReadLine())) {
  $job = $null
  try {
    $job = ConvertFrom-Json -InputObject $line
    $success = [WinSpoolRaw]::SendFile($job.printer, $job.file)
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @{id=$job.id;success=$success}))
  } catch {
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @{id=$job.id;success=$false;error=$_.Exception.Message}))
  }
}
`

/** Serial jobs, one warm WinSpool bridge, and no resend after uncertain delivery. */
export class WindowsRawPrinter {
  private worker: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private sequence = 0
  private stopped = false
  private failCurrent: ((error:Error)=>void) | null = null
  private abortWorker: ((error:Error)=>void) | null = null
  private onReply: ((reply:any)=>void) | null = null

  constructor(private launch: typeof spawn = spawn, private timeoutMs = 15000) {}

  warm(): Promise<void> {
    if (this.stopped) return Promise.reject(Error('Printer worker stopped'))
    if (this.ready) return this.ready
    const startup = new Promise<void>((resolve,reject) => {
      const child = this.launch('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {shell:false,windowsHide:true}) as ChildProcessWithoutNullStreams
      this.worker = child
      let buffer = '', stderr = '', started = false
      const timer = setTimeout(()=>fail(Error('Printer worker startup timeout')),this.timeoutMs)
      const fail = (error:Error) => {
        if (this.worker !== child) return
        clearTimeout(timer)
        this.worker = null; this.ready = null
        this.onReply = null
        const rejectJob=this.failCurrent;this.failCurrent=null;this.abortWorker=null
        rejectJob?.(error)
        reject(error)
        child.kill()
      }
      this.abortWorker = fail
      child.stdout.on('data',chunk=>{
        buffer += chunk.toString('utf8')
        let end:number
        while((end=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1)
          let reply:any
          try {reply=JSON.parse(line)} catch {continue}
          if(reply.ready && !started){started=true;clearTimeout(timer);resolve()}
          else this.onReply?.(reply)
        }
      })
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-2000)})
      child.on('error',error=>fail(error))
      child.on('close',()=>fail(Error(stderr || 'Printer worker exited; delivery unconfirmed')))
      child.stdin.on('error',error=>fail(error))
    })
    this.ready=startup
    void startup.catch(()=>{if(this.ready===startup)this.ready=null})
    return startup
  }

  printFile(printer:string,file:string):Promise<void> {
    const result = this.queue.then(async()=>{
      await this.warm()
      const child=this.worker!
      return new Promise<void>((resolve,reject)=>{
        const id=++this.sequence
        const failWorker=this.abortWorker!
        const timer=setTimeout(()=>failWorker(Error('Print timeout; delivery unconfirmed')),this.timeoutMs)
        const finish=(error?:Error)=>{clearTimeout(timer);this.onReply=null;this.failCurrent=null;error?reject(error):resolve()}
        this.failCurrent=error=>finish(error)
        this.onReply=reply=>{if(reply.id===id)finish(reply.success===true?undefined:Error(reply.error || 'WinSpool write failed; delivery unconfirmed'))}
        child.stdin.write(JSON.stringify({id,printer,file})+'\n',error=>{if(error)failWorker(error)})
      })
    })
    this.queue=result.catch(()=>{})
    return result
  }

  dispose() {
    this.stopped=true
    this.abortWorker?.(Error('Printer worker stopped; delivery unconfirmed'))
    this.worker?.kill();this.worker=null;this.ready=null
  }
}
