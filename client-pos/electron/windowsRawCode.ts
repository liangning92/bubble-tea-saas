export const windowsRawCode = String.raw`
using System;
using System.IO;
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
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendFile(string szPrinter, string szFile) {
        if (!File.Exists(szFile)) return false;
        byte[] bytes = File.ReadAllBytes(szFile);
        if (bytes.Length == 0) return false;

        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOW di = new DOCINFOW();
        di.pDocName = "POS_RAW_JOB";
        di.pDataType = "RAW";

        if (!OpenPrinter(szPrinter, out hPrinter, IntPtr.Zero)) {
            return false;
        }

        bool ok = false;
        if (StartDocPrinter(hPrinter, 1, di)) {
            IntPtr pBuf = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, pBuf, bytes.Length);
            Int32 written = 0;
            bool pageStarted = StartPagePrinter(hPrinter);
            ok = WritePrinter(hPrinter, pBuf, bytes.Length, out written) && written == bytes.Length;
            if (pageStarted) {
                EndPagePrinter(hPrinter);
            }
            Marshal.FreeCoTaskMem(pBuf);
            EndDocPrinter(hPrinter);
        }
        ClosePrinter(hPrinter);
        return ok;
    }
}`
