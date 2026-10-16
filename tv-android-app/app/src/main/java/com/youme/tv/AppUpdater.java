package com.youme.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-confirmed self-update. Playback and pairing are independent of this directory. */
final class AppUpdater {
    static final int INSTALL_REQUEST = 402;
    private final Activity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final File apk, partial;
    private volatile boolean closed;
    private boolean busy, ready, permissionRequested;
    private JSONObject offer;
    private AlertDialog dialog;
    private String status;

    AppUpdater(Activity activity) {
        this.activity = activity;
        File dir = new File(activity.getCacheDir(), "app-update"); dir.mkdirs();
        apk = new File(dir, "Store-TV.apk"); partial = new File(dir, "download.part");
        // Revalidate on each download; never trust bytes left by an interrupted attempt.
        apk.delete(); partial.delete();
        status = text("点击检查更新。", "Check for a new version.", "Periksa versi baru.");
        handler.postDelayed(new Runnable(){public void run(){check();}}, 15000);
    }
    String text(String zh, String en, String id) {
        String language = Locale.getDefault().getLanguage();
        return "zh".equals(language) ? zh : "en".equals(language) ? en : id;
    }
    String menuLabel() {
        return text("程序升级", "App update", "Pembaruan aplikasi")
                + (offer == null ? "" : " · " + offer.optString("versionName"));
    }
    void show() {
        if (closed || (dialog != null && dialog.isShowing())) return;
        dialog = new AlertDialog.Builder(activity)
                .setTitle(text("电视程序升级", "TV app update", "Pembaruan aplikasi TV"))
                .setMessage(message())
                .setPositiveButton(text("检查更新", "Check for updates", "Periksa pembaruan"), null)
                .setNeutralButton(text("下载更新", "Download update", "Unduh pembaruan"), null)
                .setNegativeButton(text("关闭", "Close", "Tutup"), (d, w) -> {})
                .create();
        dialog.setOnShowListener(d -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> check());
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> { if (ready) install(); else download(); });
            render();
        });
        dialog.show();
    }
    private String message() {
        return text("当前版本：", "Current version: ", "Versi saat ini: ") + BuildConfig.VERSION_NAME + "\n\n" + status
                + "\n\n" + text("升级保留配对和缓存。安装需要遥控器确认；取消后可重试。",
                "Pairing and cache are kept. Confirm installation with the remote; you can retry after cancelling.",
                "Koneksi dan cache tetap tersimpan. Konfirmasi instalasi dengan remote; dapat dicoba lagi jika dibatalkan.");
    }
    private void render() {
        if (closed || dialog == null || !dialog.isShowing()) return;
        dialog.setMessage(message());
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(!busy);
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setEnabled(!busy && offer != null);
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setText(ready
                ? text("安装更新", "Install update", "Instal pembaruan")
                : text("下载更新", "Download update", "Unduh pembaruan"));
    }
    private void report(String value) { status = value; render(); }
    private void fail(Exception e) {
        report(text("更新未完成，请检查网络后重试。", "Update not completed. Check the connection and retry.",
                "Pembaruan belum selesai. Periksa koneksi lalu coba lagi.") + "\n" + e.getClass().getSimpleName() + ": " + e.getMessage());
    }
    private void check() {
        if (closed || busy) return;
        busy = true;
        report(text("正在检查更新…", "Checking for updates…", "Memeriksa pembaruan…"));
        worker.execute(() -> {
            try {
                JSONObject latest = new JSONObject(read(UpdatePolicy.CHANNEL, 32*1024));
                validate(latest, "tv-v" + latest.getString("versionName"));
                JSONObject found = latest.getInt("versionCode") > BuildConfig.VERSION_CODE ? latest : null;
                final JSONObject result = found;
                handler.post(() -> {
                    if (closed) return;
                    busy=false;
                    // Keep a verified download only when checking the same immutable digest.
                    if (offer == null || result == null || !offer.optString("sha256").equals(result.optString("sha256"))) ready=false;
                    offer=result;
                    report(result == null ? text("已是当前正式版本。", "You have the current stable version.", "Versi stabil sudah terbaru.")
                            : text("发现新版本：", "New version: ", "Versi baru: ") + result.optString("versionName")
                            + " · " + ((result.optLong("size")+1023)/1024) + " KB");
                });
            } catch (Exception e) { handler.post(() -> { if(!closed){busy=false; fail(e);} }); }
        });
    }
    private void validate(JSONObject data, String tag) throws Exception {
        if (data.getInt("schemaVersion") != 1) throw new IOException("UNSUPPORTED_MANIFEST");
        UpdatePolicy.metadata(tag, data.getInt("versionCode"), data.getString("versionName"), data.getString("sha256"),
                data.getLong("size"), data.getString("sourceSha"), data.getString("url"));
        if (data.getInt("minSdk") > Build.VERSION.SDK_INT) throw new IOException("ANDROID_VERSION_UNSUPPORTED");
    }
    private void download() {
        if (closed || busy || offer == null) return;
        final JSONObject target = offer;
        busy=true; ready=false;
        report(text("正在下载更新…", "Downloading update…", "Mengunduh pembaruan…"));
        worker.execute(() -> {
            try {
                long size=target.getLong("size");
                if (activity.getCacheDir().getUsableSpace() < size*2 + 1024*1024) throw new IOException("INSUFFICIENT_SPACE");
                HttpURLConnection conn = connect(target.getString("url"));
                try (InputStream in=conn.getInputStream(); FileOutputStream out=new FileOutputStream(partial)) {
                    byte[] buffer=new byte[16384]; int n, last=-1; long written=0;
                    while ((n=in.read(buffer)) != -1) {
                        if (closed || Thread.currentThread().isInterrupted()) throw new IOException("CANCELLED");
                        written+=n; if(written>size)throw new IOException("APK_SIZE_MISMATCH");
                        out.write(buffer,0,n);
                        int progress=(int)(written*100/size);
                        if(progress/5!=last){last=progress/5; handler.post(() -> {if(!closed)report(text("下载中 ","Downloading ","Mengunduh ")+progress+"%");});}
                    }
                    out.getFD().sync();
                } finally { conn.disconnect(); }
                verify(partial, target);
                if(apk.exists()&&!apk.delete())throw new IOException("APK_REPLACE_FAILED");
                if(!partial.renameTo(apk))throw new IOException("APK_COMMIT_FAILED");
                handler.post(() -> {if(!closed){busy=false;ready=true;report(text("下载和签名校验完成，点击安装更新。", "Download and signature verified. Select Install update.", "Unduhan dan tanda tangan terverifikasi. Pilih Instal pembaruan."));}});
            } catch(Exception e) { partial.delete(); handler.post(() -> {if(!closed){busy=false;ready=false;fail(e);}}); }
        });
    }
    private static long code(PackageInfo p) { return Build.VERSION.SDK_INT>=28?p.getLongVersionCode():p.versionCode; }
    private String[] signers(PackageInfo p) throws Exception {
        Signature[] signatures=p.signatures;
        if(signatures==null)throw new IOException("APK_SIGNATURE_MISSING");
        String[] result=new String[signatures.length];
        for(int i=0;i<result.length;i++)result[i]=hex(MessageDigest.getInstance("SHA-256").digest(signatures[i].toByteArray()));
        return result;
    }
    private void verify(File file, JSONObject target) throws Exception {
        UpdatePolicy.verifyFile(file,target.getLong("size"),target.getString("sha256"));
        PackageManager pm=activity.getPackageManager();
        PackageInfo installed=pm.getPackageInfo(activity.getPackageName(),PackageManager.GET_SIGNATURES);
        PackageInfo archive=pm.getPackageArchiveInfo(file.getAbsolutePath(),PackageManager.GET_SIGNATURES);
        if(archive==null)throw new IOException("INVALID_APK");
        UpdatePolicy.archive(installed.packageName,archive.packageName,code(installed),target.getLong("versionCode"),code(archive),signers(installed),signers(archive));
    }
    private static String hex(byte[] bytes){StringBuilder value=new StringBuilder();for(byte b:bytes)value.append(String.format(Locale.US,"%02x",b&255));return value.toString();}
    private void install() {
        if (closed || busy || !ready || offer==null) return;
        if(Build.VERSION.SDK_INT>=26&&!activity.getPackageManager().canRequestPackageInstalls()){
            try {
                permissionRequested=true;
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));
                report(text("请允许此应用安装更新，返回后继续。", "Allow this app to install updates, then return.", "Izinkan aplikasi memasang pembaruan, lalu kembali."));
            }catch(Exception e){permissionRequested=false;fail(e);}
            return;
        }
        busy=true; render();
        worker.execute(() -> {
            try {
                verify(apk,offer); // Recheck before granting installer access.
                handler.post(() -> {
                    if(closed)return;
                    busy=false;
                    try {
                        Uri uri=Uri.parse("content://"+activity.getPackageName()+".updates/Store-TV.apk");
                        Intent intent=new Intent(Intent.ACTION_INSTALL_PACKAGE);
                        intent.setDataAndType(uri,"application/vnd.android.package-archive");
                        intent.setClipData(ClipData.newRawUri("Store-TV update",uri));
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        intent.putExtra(Intent.EXTRA_RETURN_RESULT,true);
                        activity.startActivityForResult(intent,INSTALL_REQUEST);
                        report(text("请在系统安装界面确认安装。", "Confirm installation in the system installer.", "Konfirmasi instalasi di layar sistem."));
                    }catch(Exception e){fail(e);}
                });
            }catch(Exception e){handler.post(() -> {if(!closed){busy=false;ready=false;fail(e);}});}
        });
    }
    void resumed() {
        if(permissionRequested){permissionRequested=false;
            if(Build.VERSION.SDK_INT<26||activity.getPackageManager().canRequestPackageInstalls())install();
            else report(text("安装权限未开启，可稍后重试。", "Installation permission not granted. You can retry.", "Izin instalasi belum diberikan. Silakan coba lagi."));
        }
    }
    void installationReturned(int result) {
        // A successful self replacement restarts/kills this process; do not claim success here.
        report(text("安装界面已关闭。若版本未变，可点击安装更新重试。", "Installer closed. If the version is unchanged, select Install update to retry.", "Layar instalasi ditutup. Jika versi belum berubah, pilih Instal pembaruan lagi."));
    }
    private HttpURLConnection connect(String start) throws Exception {
        String url=start;
        for(int redirects=0;redirects<6;redirects++){
            if(closed||!UpdatePolicy.allowedUrl(url))throw new IOException("DOWNLOAD_URL_DENIED");
            HttpURLConnection conn=(HttpURLConnection)new URL(url).openConnection();
            conn.setConnectTimeout(10000);conn.setReadTimeout(30000);conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("User-Agent","Store-TV/"+BuildConfig.VERSION_NAME);
            int status=conn.getResponseCode();
            if(status>=300&&status<400){String next=conn.getHeaderField("Location");conn.disconnect();if(next==null)throw new IOException("REDIRECT_MISSING");url=new URL(new URL(url),next).toString();continue;}
            if(status!=200){conn.disconnect();throw new IOException("HTTP_"+status);}
            return conn;
        }
        throw new IOException("TOO_MANY_REDIRECTS");
    }
    private String read(String url,int limit) throws Exception {
        HttpURLConnection conn=connect(url);
        try(InputStream in=conn.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(closed||out.size()+n>limit)throw new IOException("METADATA_SIZE");out.write(b,0,n);}return out.toString("UTF-8");
        }finally{conn.disconnect();}
    }
    void close(){closed=true;handler.removeCallbacksAndMessages(null);worker.shutdownNow();if(dialog!=null)dialog.dismiss();}
}
