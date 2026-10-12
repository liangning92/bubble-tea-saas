package com.youme.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;

public class MainActivity extends Activity {

    private static final String PREF_NAME = "youme_tv_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String KEY_SCREEN_CODE = "screen_code";
    public static final String DEFAULT_CLOUD_SERVER = "https://api.aicube.online";

    private WebView mWebView;
    private SharedPreferences mPrefs;
    private long mLastBackPressTime = 0;
    private Handler mHandler = new Handler(Looper.getMainLooper());
    private boolean mIsLoadingError = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. 硬件保活：屏幕常亮不息屏
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        mPrefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);

        // 2. 沉浸式 100% 全屏模式 (隐藏所有系统栏和导航栏)
        hideSystemUI();

        // 3. 构建 WebView 容器
        mWebView = new WebView(this);
        mWebView.setBackgroundColor(Color.parseColor("#0b0c10"));
        setContentView(mWebView);

        setupWebView();
        loadDisplayPage();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUI();
        if (mWebView != null) {
            mWebView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mWebView != null) {
            mWebView.onPause();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    /**
     * 沉浸式粘性全屏，隐藏系统栏、工具栏、虚拟按键
     */
    private void hideSystemUI() {
        View decorView = getWindow().getDecorView();
        int uiOptions = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;

        decorView.setSystemUiVisibility(uiOptions);
    }

    /**
     * 配置商业级极速 WebView
     */
    private void setupWebView() {
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setDisplayZoomControls(false);

        // 允许混合内容加载与多媒体自动播放 (无需用户点击直接自动播放视频)
        settings.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // 离线缓存优化：断网时优先从本地加载
        if (isNetworkAvailable()) {
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        } else {
            settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        }

        mWebView.setWebChromeClient(new WebChromeClient());
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                mIsLoadingError = false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    mIsLoadingError = true;
                    // 网络不可用时，5 秒后尝试自动重连
                    mHandler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (!isFinishing()) {
                                loadDisplayPage();
                            }
                        }
                    }, 5000);
                }
            }
        });
    }

    /**
     * 加载当前绑定的大屏页面：
     * - 支持用户随时更改 SaaS 云端域名或私有服务器地址
     * - 默认连接 SaaS 云端服务，未配对时自动进入 6 位随机 PIN 码激活模式
     */
    private void loadDisplayPage() {
        String serverUrl = mPrefs.getString(KEY_SERVER_URL, DEFAULT_CLOUD_SERVER);
        if (serverUrl.isEmpty()) {
            serverUrl = DEFAULT_CLOUD_SERVER;
        }

        // 规范化 URL (自动补齐协议)
        if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
            serverUrl = "http://" + serverUrl;
        }
        if (serverUrl.endsWith("/")) {
            serverUrl = serverUrl.substring(0, serverUrl.length() - 1);
        }

        String screenCode = mPrefs.getString(KEY_SCREEN_CODE, "");
        String fullUrl = serverUrl + (screenCode.isEmpty() ? "/tv" : "/tv?code=" + screenCode);
        mWebView.loadUrl(fullUrl);
    }

    /**
     * 呼出电视遥控器设置对话框 (允许商户自行更改服务器与屏幕代号)
     */
    private void showSettingsDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("📺 电视大屏终端连接设置");

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(50, 40, 50, 20);

        TextView labelServer = new TextView(this);
        labelServer.setText("服务器地址 (支持 SaaS 云端域名或私有服务器):");
        layout.addView(labelServer);

        final EditText inputServer = new EditText(this);
        inputServer.setHint("例如 https://api.aicube.online");
        inputServer.setText(mPrefs.getString(KEY_SERVER_URL, DEFAULT_CLOUD_SERVER));
        layout.addView(inputServer);

        // 快捷测试连接按钮
        Button btnTest = new Button(this);
        btnTest.setText("🔍 测试连接此服务器");
        btnTest.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                testServerConnection(inputServer.getText().toString().trim());
            }
        });
        layout.addView(btnTest);

        TextView labelCode = new TextView(this);
        labelCode.setText("屏幕代号 (留空自动生成 6 位激活码与后台配对):");
        labelCode.setPadding(0, 30, 0, 0);
        layout.addView(labelCode);

        final EditText inputCode = new EditText(this);
        inputCode.setHint("例如 TV-01 (留空使用激活码绑定)");
        inputCode.setText(mPrefs.getString(KEY_SCREEN_CODE, ""));
        layout.addView(inputCode);

        // 快捷恢复默认云端按钮
        Button btnResetCloud = new Button(this);
        btnResetCloud.setText("☁️ 填入默认 SaaS 云端地址");
        btnResetCloud.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                inputServer.setText(DEFAULT_CLOUD_SERVER);
            }
        });
        layout.addView(btnResetCloud);

        builder.setView(layout);

        builder.setPositiveButton("保存并刷新", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                String newServer = inputServer.getText().toString().trim();
                String newCode = inputCode.getText().toString().trim().toUpperCase();

                if (!newServer.isEmpty() && !newServer.startsWith("http://") && !newServer.startsWith("https://")) {
                    newServer = "http://" + newServer;
                }

                mPrefs.edit()
                        .putString(KEY_SERVER_URL, newServer)
                        .putString(KEY_SCREEN_CODE, newCode)
                        .apply();

                loadDisplayPage();
                hideSystemUI();
            }
        });

        builder.setNegativeButton("取消", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                dialog.dismiss();
                hideSystemUI();
            }
        });

        AlertDialog dialog = builder.create();
        dialog.show();
    }

    /**
     * 测试目标服务器连通性
     */
    private void testServerConnection(final String testUrl) {
        if (testUrl.isEmpty()) {
            Toast.makeText(this, "请输入要测试的服务器地址", Toast.LENGTH_SHORT).show();
            return;
        }

        Toast.makeText(this, "正在测试连通性...", Toast.LENGTH_SHORT).show();

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String norm = testUrl.trim();
                    if (!norm.startsWith("http://") && !norm.startsWith("https://")) {
                        norm = "http://" + norm;
                    }
                    if (norm.endsWith("/")) {
                        norm = norm.substring(0, norm.length() - 1);
                    }

                    long start = System.currentTimeMillis();
                    URL url = new URL(norm + "/health");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(4000);
                    conn.setReadTimeout(4000);
                    conn.setRequestMethod("GET");
                    final int code = conn.getResponseCode();
                    final long latency = System.currentTimeMillis() - start;

                    mHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (code >= 200 && code < 400) {
                                Toast.makeText(MainActivity.this, "✅ 连接成功！服务器响应正常 (" + latency + "ms)", Toast.LENGTH_SHORT).show();
                            } else {
                                Toast.makeText(MainActivity.this, "⚠️ 服务器已响应，状态码: HTTP " + code, Toast.LENGTH_SHORT).show();
                            }
                        }
                    });
                } catch (Exception e) {
                    mHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(MainActivity.this, "❌ 无法连接到此服务器，请检查地址或网络", Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        }).start();
    }

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo info = cm.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Exception e) {
            return false;
        }
    }
}
