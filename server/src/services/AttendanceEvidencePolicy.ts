// QR proof is written only after online/offline POS-signature verification.
// GPS coordinates or a caller-supplied word "QR" are not sufficient evidence.
export function isQrAttendance(record: {status?:string;gpsLocation?:string|null;note?:string|null}) {
 if(record.status==='absence'||!record.gpsLocation?.startsWith('POS:'))return false
 const pos=record.gpsLocation.slice(4)
 return !!pos && (record.note===`QR Check-in at POS ${pos}` || record.note===`QR Check-out at POS ${pos}` || /^Offline employee QR check_(in|out); original /.test(record.note||''))
}
export function attendanceEvidence<T extends {status:string;gpsLocation?:string|null;note?:string|null}>(record:T) {
 return isQrAttendance(record)?{...record,qrVerified:true}:{...record,originalStatus:record.status,status:'absence',qrVerified:false,attendanceIssue:'QR_ATTENDANCE_REQUIRED'}
}
