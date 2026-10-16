package com.youme.tv;

import java.net.URI;
import java.io.*;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Arrays;

/** Release metadata and archive identity checks shared by download and install. */
final class UpdatePolicy {
    static final long MAX_APK_BYTES = 25L * 1024 * 1024;
    static final String CHANNEL = "https://github.com/liangning92/bubble-tea-saas/releases/download/tv-updates/manifest.json";
    static final String DOWNLOADS = "https://github.com/liangning92/bubble-tea-saas/releases/download/";

    static int version(String tag) {
        if (tag == null || !tag.matches("tv-v2\\.0\\.[1-9][0-9]{0,8}")) return -1;
        try { return Integer.parseInt(tag.substring(8)); } catch (NumberFormatException e) { return -1; }
    }
    static void metadata(String tag, int code, String name, String sha, long size, String source, String url) {
        if (version(tag) != code || !("2.0." + code).equals(name)
                || sha == null || !sha.matches("[a-f0-9]{64}")
                || source == null || !source.matches("[a-f0-9]{40}")
                || size <= 0 || size > MAX_APK_BYTES
                || !(DOWNLOADS + tag + "/Store-TV.apk").equals(url)) {
            throw new IllegalArgumentException("INVALID_RELEASE");
        }
    }
    static boolean allowedUrl(String value) {
        try {
            URI uri = new URI(value);
            if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getFragment() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443)) return false;
            // GitHub release assets redirect to these CDN hosts. Never send device credentials.
            return Arrays.asList("api.github.com", "github.com", "release-assets.githubusercontent.com",
                    "objects.githubusercontent.com").contains(uri.getHost());
        } catch (Exception e) { return false; }
    }
    static void verifyFile(File file, long size, String expectedDigest) throws Exception {
        if (size <= 0 || size > MAX_APK_BYTES || file.length() != size) throw new IOException("APK_SIZE_MISMATCH");
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(InputStream in=new FileInputStream(file)){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1)digest.update(b,0,n);}
        StringBuilder hex=new StringBuilder();for(byte b:digest.digest())hex.append(String.format(Locale.US,"%02x",b&255));
        if(!hex.toString().equals(expectedDigest))throw new IOException("APK_CHECKSUM_MISMATCH");
    }
    static void archive(String expectedPackage, String actualPackage, long current, long offered, long archive,
                        String[] installedSigners, String[] archiveSigners) {
        if (!expectedPackage.equals(actualPackage) || offered <= current || archive != offered
                || installedSigners == null || archiveSigners == null || installedSigners.length == 0) {
            throw new IllegalArgumentException("INVALID_APK");
        }
        String[] a = installedSigners.clone(), b = archiveSigners.clone();
        Arrays.sort(a); Arrays.sort(b);
        if (!Arrays.equals(a, b)) throw new IllegalArgumentException("SIGNATURE_MISMATCH");
    }
}
