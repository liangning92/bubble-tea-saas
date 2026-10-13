package com.youme.tv;

import android.app.Activity;
import android.content.SharedPreferences;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.os.Build;
import android.provider.Settings;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Local, bundled player. The bridge is only reachable from the app's local origin.
 * Device credentials never appear in navigation URLs or downloaded documents. */
public class MainActivity extends Activity {
    private static final String LOCAL = "https://appassets.androidplatform.net";
    private static final long LIMIT = 1024L * 1024L * 1024L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService requests = Executors.newFixedThreadPool(3);
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;
    private WebView web;
    private File cache;
    private volatile String downloading = "";
    private volatile int generation = 0;
    private boolean longPressed;
    private final BroadcastReceiver clockChanged = new BroadcastReceiver(){public void onReceive(Context c,Intent i){prefs.edit().putBoolean("clockTrusted",false).apply();js("window.TVClockInvalid && window.TVClockInvalid()");}};
    private final Runnable longPress = new Runnable() { public void run() { longPressed = true; openSettings(); } };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences("tv_signage_v2", MODE_PRIVATE);
        registerReceiver(clockChanged,new IntentFilter(Intent.ACTION_TIME_CHANGED));
        cache = new File(getFilesDir(), "tv-cache"); cache.mkdirs();
        web = new WebView(this); setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new Bridge(), "TVNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith(LOCAL + "/");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return !url.startsWith(LOCAL + "/"); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                android.net.Uri uri = request.getUrl();
                if (!LOCAL.equals(uri.getScheme()+"://"+uri.getAuthority())) return empty();
                try {
                    String name = uri.getPath();
                    if (name.startsWith("/cache/")) {
                        String digest = name.substring(7);
                        if (!digest.matches("[a-f0-9]{64}")) return empty();
                        File file = new File(cache, digest);
                        String mime = prefs.getString("mime." + digest, "application/octet-stream");
                        return new WebResourceResponse(mime, null, new FileInputStream(file));
                    }
                    if (!Arrays.asList("/tv/index.html", "/tv/player.js", "/tv/player.css", "/tv/build.js").contains(name)) return empty();
                    String mime = name.endsWith(".js") ? "application/javascript" : name.endsWith(".css") ? "text/css" : "text/html";
                    return new WebResourceResponse(mime, "UTF-8", getAssets().open(name.substring(1)));
                } catch (Exception e) { return empty(); }
            }
        });
        web.loadUrl(LOCAL + "/tv/index.html"); hideUI();
    }
    private WebResourceResponse empty() { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.<String,String>emptyMap(), new ByteArrayInputStream(new byte[0])); }
    private void hideUI() { getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN); }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if(focus)hideUI(); }
    @Override public void onResume() { super.onResume(); if(web!=null)web.onResume(); hideUI(); }
    @Override public void onPause() { super.onPause(); if(web!=null)web.onPause(); }
    @Override public void onDestroy() { unregisterReceiver(clockChanged); generation++; handler.removeCallbacksAndMessages(null); requests.shutdownNow(); downloads.shutdownNow(); if(web!=null){web.removeJavascriptInterface("TVNative");web.destroy();} super.onDestroy(); }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if(event.getKeyCode()==KeyEvent.KEYCODE_MENU || event.getKeyCode()==KeyEvent.KEYCODE_M) { if(event.getAction()==KeyEvent.ACTION_DOWN&&event.getRepeatCount()==0)openSettings(); return true; }
        if(event.getKeyCode()==KeyEvent.KEYCODE_DPAD_CENTER) {
            if(event.getAction()==KeyEvent.ACTION_DOWN&&event.getRepeatCount()==0){longPressed=false;handler.postDelayed(longPress,700);}
            if(event.getAction()==KeyEvent.ACTION_UP){handler.removeCallbacks(longPress);if(longPressed)return true;}
        }
        if(event.getKeyCode()==KeyEvent.KEYCODE_BACK){if(event.getAction()==KeyEvent.ACTION_UP)openSettings();return true;}
        return super.dispatchKeyEvent(event);
    }
    private void openSettings() { js("window.TVOpenSettings && window.TVOpenSettings()"); }
    private void js(final String source) { handler.post(new Runnable(){public void run(){if(!isFinishing()&&web!=null)web.evaluateJavascript(source,null);}}); }
    private String serverOrigin() { return prefs.getString("server",BuildConfig.DEFAULT_SERVER); }
    private boolean allowedServer(String value, boolean allowHttp) {
        try { URI u=new URI(value); if(u.getUserInfo()!=null||u.getFragment()!=null||u.getQuery()!=null||u.getHost()==null||!(u.getPath()==null||u.getPath().isEmpty()||u.getPath().equals("/")))return false;
            if("https".equals(u.getScheme()))return true;
            return allowHttp&&"http".equals(u.getScheme())&&privateHost(u.getHost());
        }catch(Exception e){return false;}
    }
    private boolean privateHost(String host){if("localhost".equals(host))return true;String[] parts=host.split("\\.");if(parts.length!=4)return false;int[] values=new int[4];try{for(int i=0;i<4;i++){if(!parts[i].matches("[0-9]+"))return false;values[i]=Integer.parseInt(parts[i]);if(values[i]<0||values[i]>255)return false;}}catch(Exception e){return false;}return values[0]==10||values[0]==127||(values[0]==192&&values[1]==168)||(values[0]==172&&values[1]>=16&&values[1]<=31);}
    private String read(InputStream stream, int limit) throws Exception { if(stream==null)return "";try(InputStream input=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=input.read(b))!=-1){if(out.size()+n>limit)throw new IOException("RESPONSE_LIMIT");out.write(b,0,n);}return out.toString("UTF-8");} }
    private String digest(File file) throws Exception { MessageDigest md=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)md.update(b,0,n);}StringBuilder s=new StringBuilder();for(byte v:md.digest())s.append(String.format(Locale.US,"%02x",v&255));return s.toString(); }
    private void atomic(File file,String value) throws Exception {File tmp=new File(file.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(value.getBytes("UTF-8"));out.getFD().sync();}if(!tmp.renameTo(file))throw new IOException("CACHE_COMMIT_FAILED");}
    private String cachedFile(String name) { try{return read(new FileInputStream(new File(cache,name)),10*1024*1024);}catch(Exception e){return "";} }
    private void reset() {generation++;prefs.edit().remove("identity").remove("pair").apply();File[] files=cache.listFiles();if(files!=null)for(File file:files)file.delete();downloading="";}
    private int bootCount(){return Build.VERSION.SDK_INT>=24?Settings.Global.getInt(getContentResolver(),Settings.Global.BOOT_COUNT,-1):-1;}
    private String verifiedCached(String name) throws Exception {
        String raw=cachedFile(name);if(raw.isEmpty())return raw;JSONObject data=new JSONObject(raw);JSONArray assets=data.getJSONArray("assets");
        for(int i=0;i<assets.length();i++){JSONObject a=assets.getJSONObject(i);String sha=a.getString("sha256");if(!sha.matches("[a-f0-9]{64}"))throw new IOException("CACHE_INVALID");File f=new File(cache,sha);if(!f.exists()||f.length()!=a.getLong("size")||!digest(f).equals(sha))throw new IOException("CACHE_CORRUPT");}
        long elapsed=SystemClock.elapsedRealtime()-data.optLong("verifiedElapsed",Long.MAX_VALUE);int boot=bootCount();boolean trusted=prefs.getBoolean("clockTrusted",false)&&boot>=0&&data.optInt("verifiedBoot",-2)==boot&&elapsed>=0;data.put("timeTrusted",trusted);if(trusted)data.put("checkedAt",System.currentTimeMillis()-elapsed);return data.toString();
    }
    private void cleanOrphans(){try{Set<String> keep=new HashSet<>();for(String name:Arrays.asList("active.json","previous.json")){String raw=cachedFile(name);if(!raw.isEmpty()){JSONArray assets=new JSONObject(raw).getJSONArray("assets");for(int i=0;i<assets.length();i++)keep.add(assets.getJSONObject(i).getString("sha256"));}}File[] files=cache.listFiles();if(files!=null)for(File f:files)if((f.getName().matches("[a-f0-9]{64}")&&!keep.contains(f.getName()))||f.getName().endsWith(".part"))f.delete();}catch(Exception ignored){}}
    public class Bridge {
        @JavascriptInterface public String state() {try{JSONObject result=new JSONObject();result.put("server",serverOrigin());result.put("identity",new JSONObject(prefs.getString("identity","{}")));result.put("appVersion",BuildConfig.VERSION_NAME);result.put("sourceSha",BuildConfig.SOURCE_SHA);result.put("language",Locale.getDefault().getLanguage());return result.toString();}catch(Exception e){return "{}";} }
        @JavascriptInterface public void identity(String value) {try{JSONObject obj=new JSONObject(value);if(!obj.getString("token").matches("[a-f0-9]{64}"))return;prefs.edit().putString("identity",obj.toString()).remove("pair").apply();}catch(Exception ignored){} }
        @JavascriptInterface public void pair(String value) {try{JSONObject obj=new JSONObject(value);if(obj.getString("secret").matches("[a-f0-9]{64}"))prefs.edit().putString("pair",value).apply();}catch(Exception ignored){} }
        @JavascriptInterface public void clear() { reset(); }
        @JavascriptInterface public void server(final String value,boolean allowHttp) {if(!allowedServer(value,allowHttp))return;reset();prefs.edit().putString("server",value).putBoolean("allowHttp",allowHttp).apply();handler.post(new Runnable(){public void run(){web.loadUrl(LOCAL+"/tv/index.html");}});}
        @JavascriptInterface public String cached() {for(String name:Arrays.asList("active.json","previous.json"))try{String value=verifiedCached(name);if(!value.isEmpty())return value;}catch(Exception ignored){}return "";}

        @JavascriptInterface public void request(final int id,final String method,final String route,final String body) {
            final int epoch=generation;
            requests.execute(new Runnable(){public void run(){int status=500;String response="{}";HttpURLConnection conn=null;try{
                if(!Arrays.asList("GET","POST").contains(method)||!route.startsWith("/api/tv/")||route.contains("..")||route.contains("?")||!allowedServer(serverOrigin(),prefs.getBoolean("allowHttp",false)))throw new IOException("REQUEST_DENIED");
                conn=(HttpURLConnection)new URL(serverOrigin()+route).openConnection();conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(8000);conn.setReadTimeout(20000);conn.setRequestMethod(method);
                JSONObject identity=new JSONObject(prefs.getString("identity","{}")),pair=new JSONObject(prefs.getString("pair","{}"));
                if(identity.has("token"))conn.setRequestProperty("X-TV-Device-Token",identity.getString("token"));if(pair.has("secret"))conn.setRequestProperty("X-TV-Pair-Secret",pair.getString("secret"));
                if("POST".equals(method)){conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");try(OutputStream out=conn.getOutputStream()){out.write((body.isEmpty()?"{}":body).getBytes("UTF-8"));}}
                status=conn.getResponseCode();response=read(status<400?conn.getInputStream():conn.getErrorStream(),10*1024*1024);
            }catch(Exception e){response="{\"success\":false}";}finally{if(conn!=null)conn.disconnect();}if(epoch==generation)js("window.TVNativeResponse("+id+","+status+","+JSONObject.quote(response)+")");}});
        }
        @JavascriptInterface public String test(final String value,boolean allowHttp) {if(!allowedServer(value,allowHttp))return "HTTPS_REQUIRED";requests.execute(new Runnable(){public void run(){HttpURLConnection conn=null;int code=500;try{conn=(HttpURLConnection)new URL(value+"/api/health").openConnection();conn.setConnectTimeout(4000);conn.setReadTimeout(4000);conn.setInstanceFollowRedirects(false);code=conn.getResponseCode();}catch(Exception ignored){}finally{if(conn!=null)conn.disconnect();}js("window.TVServerTest && window.TVServerTest("+code+")");}});return "…";}
        @JavascriptInterface public void commit(final String raw) {
            try {final JSONObject data=new JSONObject(raw);final String version=data.getString("version");if(!version.matches("[a-f0-9]{64}")||version.equals(downloading))return;downloading=version;final int epoch=generation;
                downloads.execute(new Runnable(){public void run(){try{
                    JSONArray assets=data.getJSONArray("assets");Set<String> needed=new HashSet<>();long total=0;
                    for(int i=0;i<assets.length();i++){JSONObject asset=assets.getJSONObject(i);String sha=asset.getString("sha256"),url=asset.getString("url");long size=asset.getLong("size");if(!sha.matches("[a-f0-9]{64}")||!url.startsWith("/uploads/")||url.contains("..")||size<0)throw new IOException("INVALID_MANIFEST");if(needed.add(sha))total+=size;}
                    File[] existing=cache.listFiles();long disk=0;if(existing!=null)for(File f:existing)disk+=f.length();long missing=0;for(int i=0;i<assets.length();i++){JSONObject a=assets.getJSONObject(i);if(!new File(cache,a.getString("sha256")).exists())missing+=a.getLong("size");}if(total>LIMIT||disk+missing>LIMIT)throw new IOException("CACHE_LIMIT");
                    for(int i=0;i<assets.length();i++){if(epoch!=generation)throw new IOException("CACHE_CANCELLED");JSONObject a=assets.getJSONObject(i);String sha=a.getString("sha256");File file=new File(cache,sha);if(file.length()!=a.getLong("size")||!file.exists()||!digest(file).equals(sha)){
                        HttpURLConnection conn=(HttpURLConnection)new URL(serverOrigin()+a.getString("url")).openConnection();conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(8000);conn.setReadTimeout(30000);File tmp=new File(cache,sha+".part");try{if(conn.getResponseCode()!=200)throw new IOException("ASSET_HTTP");try(InputStream in=conn.getInputStream();FileOutputStream out=new FileOutputStream(tmp)){byte[] buffer=new byte[65536];int n;long written=0;while((n=in.read(buffer))!=-1){written+=n;if(written>a.getLong("size")||epoch!=generation)throw new IOException("ASSET_SIZE");out.write(buffer,0,n);}out.getFD().sync();}if(tmp.length()!=a.getLong("size")||!digest(tmp).equals(sha))throw new IOException("ASSET_CHECKSUM");if(!tmp.renameTo(file))throw new IOException("ASSET_COMMIT");}finally{conn.disconnect();tmp.delete();}}
                        String url=a.getString("url").toLowerCase(Locale.US),mime=url.endsWith(".mp4")?"video/mp4":url.endsWith(".webm")?"video/webm":url.endsWith(".mp3")?"audio/mpeg":url.endsWith(".m4a")?"audio/mp4":url.endsWith(".wav")?"audio/wav":url.endsWith(".ogg")?"audio/ogg":url.endsWith(".png")?"image/png":url.endsWith(".webp")?"image/webp":url.endsWith(".gif")?"image/gif":"image/jpeg";prefs.edit().putString("mime."+sha,mime).apply();
                    }
                    if(epoch!=generation)throw new IOException("CACHE_CANCELLED");String old=cachedFile("active.json");JSONObject previous=old.isEmpty()?null:new JSONObject(old);if(previous!=null&&!previous.getString("version").equals(version))atomic(new File(cache,"previous.json"),old);
                    data.put("verifiedElapsed",SystemClock.elapsedRealtime());data.put("verifiedBoot",bootCount());data.put("timeTrusted",true);atomic(new File(cache,"active.json"),data.toString());prefs.edit().putLong("verifiedElapsed",SystemClock.elapsedRealtime()).putBoolean("clockTrusted",true).apply();String prev=cachedFile("previous.json");if(!prev.isEmpty()){JSONArray keep=new JSONObject(prev).getJSONArray("assets");for(int i=0;i<keep.length();i++)needed.add(keep.getJSONObject(i).getString("sha256"));}
                    existing=cache.listFiles();if(existing!=null)for(File f:existing)if(f.getName().matches("[a-f0-9]{64}")&&!needed.contains(f.getName()))f.delete();
                    final String orientation=data.getJSONObject("settings").getString("orientation");handler.post(new Runnable(){public void run(){setRequestedOrientation("portrait".equals(orientation)?ActivityInfo.SCREEN_ORIENTATION_PORTRAIT:ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);}});
                    if(epoch==generation)js("window.TVCacheReady("+JSONObject.quote(data.toString())+")");
                }catch(Exception e){if(epoch==generation)js("window.TVCacheFailed("+JSONObject.quote(e.getMessage())+")");}finally{if(epoch==generation)cleanOrphans();downloading="";}}});
            }catch(Exception e){js("window.TVCacheFailed('INVALID_CONTENT')");}
        }
    }
}
