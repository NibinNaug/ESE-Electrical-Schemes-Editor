package org.ese.editor

import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.Keep
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject

@Keep
class EseAndroidBridge(private val activity: MainActivity) {
  @JavascriptInterface
  fun setImmersive(enabled: Boolean) {
    activity.runOnUiThread { activity.setEseImmersive(enabled) }
  }

  @JavascriptInterface
  fun getHotspotCapabilities(): String = activity.hotspotController.capabilities()

  @JavascriptInterface
  fun startLocalHotspot(requestId: String) {
    activity.hotspotController.start(requestId)
  }

  @JavascriptInterface
  fun stopLocalHotspot() {
    activity.hotspotController.stopOwned()
  }

  @JavascriptInterface
  fun getPreferredIpv4(): String = activity.hotspotController.preferredIpv4()

  @JavascriptInterface
  fun getHotspotClientCount(): Int = activity.hotspotController.connectedClientCount()

  @JavascriptInterface
  fun cleanupCameraCaptures() {
    activity.cleanupEseCameraCaptures()
  }

  @JavascriptInterface
  fun downloadAndInstallUpdate(requestId: String, url: String, sha256: String) {
    activity.updater.downloadAndInstall(requestId, url, sha256)
  }
}

class MainActivity : TauriActivity() {
  private var immersive = false
  private var eseWebView: WebView? = null
  internal val hotspotController by lazy { EseHotspotController(this) }
  internal val updater by lazy { EseUpdater(this) }
  private val hotspotPermissionLauncher = registerForActivityResult(
    ActivityResultContracts.RequestPermission()
  ) { granted ->
    hotspotController.onPermissionResult(granted)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      if (immersive) {
        view.setPadding(0, 0, 0, 0)
      } else {
        val safeArea = insets.getInsets(
          WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
        )
        view.setPadding(safeArea.left, safeArea.top, safeArea.right, safeArea.bottom)
      }
      insets
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    eseWebView = webView
    webView.addJavascriptInterface(EseAndroidBridge(this), "ESEAndroid")
  }

  internal fun requestHotspotPermission(permission: String) {
    hotspotPermissionLauncher.launch(permission)
  }

  internal fun dispatchHotspotEvent(detail: JSONObject) {
    val script = "window.dispatchEvent(new CustomEvent('ese-hotspot', { detail: ${detail} }));"
    eseWebView?.post { eseWebView?.evaluateJavascript(script, null) }
  }

  internal fun dispatchUpdateEvent(detail: JSONObject) {
    val script = "window.dispatchEvent(new CustomEvent('ese-update', { detail: ${detail} }));"
    eseWebView?.post { eseWebView?.evaluateJavascript(script, null) }
  }

  internal fun cleanupEseCameraCaptures() {
    val pictures = getExternalFilesDir(Environment.DIRECTORY_PICTURES) ?: return
    pictures.listFiles()?.forEach { file ->
      if (file.isFile && file.name.startsWith("JPEG_") && file.extension.equals("jpg", ignoreCase = true)) {
        file.delete()
      }
    }
  }

  fun setEseImmersive(enabled: Boolean) {
    immersive = enabled
    val controller = ViewCompat.getWindowInsetsController(window.decorView) ?: return
    controller.systemBarsBehavior =
      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    if (enabled) controller.hide(WindowInsetsCompat.Type.systemBars())
    else controller.show(WindowInsetsCompat.Type.systemBars())
    ViewCompat.requestApplyInsets(findViewById(android.R.id.content))
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus && immersive) setEseImmersive(true)
  }

  override fun onResume() {
    super.onResume()
    updater.onResume()
  }

  override fun onDestroy() {
    hotspotController.stopOwned()
    updater.close()
    eseWebView = null
    super.onDestroy()
  }
}
