export const windowsRawCode = String.raw`
using System;
using System.IO;
using System.ComponentModel;
using System.Threading;
using System.Runtime.InteropServices;

public class WinSpoolRaw {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOW {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern UInt32 StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    [StructLayout(LayoutKind.Sequential)]
    public struct SYSTEMTIME { public ushort Year, Month, DayOfWeek, Day, Hour, Minute, Second, Milliseconds; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct JOBINFO1 {
        public uint JobId; public IntPtr Printer, Machine, User, Document, Datatype, StatusText;
        public uint Status, Priority, Position, TotalPages, PagesPrinted; public SYSTEMTIME Submitted;
    }
    [DllImport("winspool.drv", EntryPoint="GetJobW", SetLastError=true)]
    public static extern bool GetJob(IntPtr printer, uint id, uint level, IntPtr buffer, uint size, out uint needed);
    [DllImport("winspool.drv", EntryPoint="EnumJobsW", SetLastError=true)]
    public static extern bool EnumJobs(IntPtr printer, uint first, uint count, uint level, IntPtr buffer, uint size, out uint needed, out uint returned);

    public class Submission {
        public bool Success; public uint JobId; public int BytesSubmitted; public uint Status;
        public string DeliveryStatus = "not-sent"; public string Error; public int Win32Error;
    }
    // Native JOB_STATUS values. Retained (8192) alone is not a device error.
    public static bool IsCompleted(uint status) {
        return (status & (128u | 4096u)) != 0 ||
            ((status & 8192u) != 0 && (status & (8u | 16u)) == 0 && !HasProblem(status));
    }
    public static bool HasProblem(uint status) { return (status & (1u | 2u | 4u | 32u | 64u | 256u | 512u | 1024u)) != 0; }
    public static bool IsStalled(uint status, double ageSeconds) { return !IsCompleted(status) && (HasProblem(status) || ageSeconds >= 30); }

    static double Age(SYSTEMTIME s) {
        try { return (DateTime.UtcNow - new DateTime(s.Year,s.Month,s.Day,s.Hour,s.Minute,s.Second,DateTimeKind.Utc)).TotalSeconds; }
        catch { return 0; }
    }
    static string QueueProblem(IntPtr printer) {
        uint needed, count;
        bool first = EnumJobs(printer,0,1024,1,IntPtr.Zero,0,out needed,out count);
        int error = Marshal.GetLastWin32Error();
        if (first && needed == 0) return null;
        if (needed == 0 || (!first && error != 122)) throw new Win32Exception(error,"PRINT_QUEUE_READ_FAILED");
        IntPtr memory = Marshal.AllocHGlobal((int)needed);
        try {
            if (!EnumJobs(printer,0,1024,1,memory,needed,out needed,out count)) throw new Win32Exception(Marshal.GetLastWin32Error(),"PRINT_QUEUE_READ_FAILED");
            int size = Marshal.SizeOf(typeof(JOBINFO1));
            for (uint i=0;i<count;i++) {
                JOBINFO1 job = (JOBINFO1)Marshal.PtrToStructure(IntPtr.Add(memory,(int)i*size),typeof(JOBINFO1));
                if (IsStalled(job.Status,Age(job.Submitted))) return "PRINT_QUEUE_BLOCKED job="+job.JobId+" status="+job.Status;
            }
            return null;
        } finally { Marshal.FreeHGlobal(memory); }
    }
    public static string InspectQueue(string printer) {
        IntPtr handle;
        Check(OpenPrinter(printer,out handle,IntPtr.Zero),"PRINT_OPEN_FAILED");
        try {return QueueProblem(handle);} finally {ClosePrinter(handle);}
    }
    static uint? JobStatus(IntPtr printer, uint id) {
        uint needed;
        GetJob(printer,id,1,IntPtr.Zero,0,out needed);
        int error=Marshal.GetLastWin32Error();
        if (needed==0 && (error==87 || error==2)) return null;
        if (needed==0) throw new Win32Exception(error,"PRINT_JOB_READ_FAILED");
        IntPtr memory=Marshal.AllocHGlobal((int)needed);
        try {
            if (!GetJob(printer,id,1,memory,needed,out needed)) {
                error=Marshal.GetLastWin32Error();
                if(error==87 || error==2)return null;
                throw new Win32Exception(error,"PRINT_JOB_READ_FAILED");
            }
            return ((JOBINFO1)Marshal.PtrToStructure(memory,typeof(JOBINFO1))).Status;
        } finally {Marshal.FreeHGlobal(memory);}
    }
    static void Check(bool ok, string operation) { if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error(),operation); }

    public static Submission SubmitFile(string printer, string file, string document) {
        Submission result=new Submission();
        IntPtr handle=IntPtr.Zero, memory=IntPtr.Zero;
        bool page=false, documentOpen=false;
        try {
            byte[] bytes=File.ReadAllBytes(file);
            if(bytes.Length==0)throw new IOException("PRINT_DATA_EMPTY");
            Check(OpenPrinter(printer,out handle,IntPtr.Zero),"PRINT_OPEN_FAILED");
            string blocked=QueueProblem(handle);
            if(blocked!=null){result.Error=blocked;return result;}
            DOCINFOW info=new DOCINFOW();info.pDocName=document;info.pDataType="RAW";
            result.JobId=StartDocPrinter(handle,1,info);
            if(result.JobId==0)throw new Win32Exception(Marshal.GetLastWin32Error(),"PRINT_START_DOC_FAILED");
            result.DeliveryStatus="unconfirmed";documentOpen=true;
            Check(StartPagePrinter(handle),"PRINT_START_PAGE_FAILED");page=true;
            memory=Marshal.AllocCoTaskMem(bytes.Length);Marshal.Copy(bytes,0,memory,bytes.Length);
            int written;
            bool wrote=WritePrinter(handle,memory,bytes.Length,out written);
            result.BytesSubmitted=written;
            Check(wrote,"PRINT_WRITE_FAILED");
            if(written!=bytes.Length)throw new IOException("PRINT_WRITE_PARTIAL");
            bool ended=EndPagePrinter(handle);page=false;Check(ended,"PRINT_END_PAGE_FAILED");
            ended=EndDocPrinter(handle);documentOpen=false;Check(ended,"PRINT_END_DOC_FAILED");
            // A successful write only means acceptance by the spooler. Observe this
            // exact job; never resend it when its device delivery is uncertain.
            DateTime deadline=DateTime.UtcNow.AddSeconds(10);
            do {
                uint? status=JobStatus(handle,result.JobId);
                if(!status.HasValue || IsCompleted(status.Value)) {
                    result.Success=true;result.DeliveryStatus="spool-completed";return result;
                }
                result.Status=status.Value;
                if(HasProblem(status.Value)){result.Error="PRINT_JOB_BLOCKED";return result;}
                Thread.Sleep(150);
            } while(DateTime.UtcNow<deadline);
            result.Error="PRINT_JOB_STILL_QUEUED";
            return result;
        } catch(Exception error) {
            result.Error=error.Message;
            Win32Exception win=error as Win32Exception;if(win!=null)result.Win32Error=win.NativeErrorCode;
            return result;
        } finally {
            if(memory!=IntPtr.Zero)Marshal.FreeCoTaskMem(memory);
            if(handle!=IntPtr.Zero){if(page)EndPagePrinter(handle);if(documentOpen)EndDocPrinter(handle);ClosePrinter(handle);}
        }
    }
}`
