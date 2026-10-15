// No real printer submission: compile the exact native bridge and test its policy.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
if(process.platform!=='win32')throw Error('Native WinSpool validation requires Windows');
const arg=process.argv.indexOf('--resources');
const entry=arg>=0?path.resolve(process.argv[arg+1],'app.asar.unpacked/client-pos/dist-electron/electron/windowsRawCode.js'):path.resolve('client-pos/dist-electron/electron/windowsRawCode.js');
const {windowsRawCode}=require(entry);
const script=`$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
${windowsRawCode}
'@ -Language CSharp
if([WinSpoolRaw]::HasProblem(8208)){throw 'Printing+Retained is not UserIntervention'}
if([WinSpoolRaw]::IsStalled(8208,1)){throw 'Recent printing job was marked stalled'}
if(![WinSpoolRaw]::IsStalled(8208,31)){throw 'Observed stalled retained-printing job must block new submissions'}
if(![WinSpoolRaw]::HasProblem(1024)){throw 'Native UserIntervention bit not detected'}
if(![WinSpoolRaw]::IsStalled(1024,1)){throw 'Device error must block immediately'}
if([WinSpoolRaw]::IsStalled(8320,900)){throw 'Completed retained job must not block printing'}
if([WinSpoolRaw]::IsStalled(8192,900)){throw 'An inactive retained job must not block printing'}
$dir=Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($dir)|Out-Null
try {
 $file=Join-Path $dir 'test.bin';[IO.File]::WriteAllBytes($file,[byte[]]@(27,64))
 $missing='BTPS-NONEXISTENT-'+[guid]::NewGuid().ToString('N')
 $r=[WinSpoolRaw]::SubmitFile($missing,$file,'NO_REAL_PRINTER_TEST')
 if($r.Success -or $r.JobId -ne 0 -or $r.BytesSubmitted -ne 0 -or $r.DeliveryStatus -ne 'not-sent' -or $r.Win32Error -eq 0){throw 'Open failure must retain native error and never claim submission'}
} finally {[IO.Directory]::Delete($dir,$true)}
Write-Output 'PASS native WinSpool compile, observed queue flags, stale queue protection, pre-submission failure'
`;
const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:30000,windowsHide:true});
if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
fs.writeFileSync('windows-spool-validation.json',JSON.stringify({passed:true,sourceSha:process.env.GITHUB_SHA,entry,physicalPrinting:false,realPrinterSubmission:false,nativeStatusChecks:true,queueProtectionChecks:true,missingPrinterChecks:true},null,2));
