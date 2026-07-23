package org.ese.editor

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

internal class EseUpdater(private val activity: MainActivity) {
  private data class PendingInstall(val requestId: String, val file: File)

  private val executor = Executors.newSingleThreadExecutor()
  private val busy = AtomicBoolean(false)
  @Volatile private var pendingInstall: PendingInstall? = null
  @Volatile private var awaitingInstallPermission = false

  fun downloadAndInstall(requestId: String, sourceUrl: String, expectedSha256: String) {
    if (!busy.compareAndSet(false, true)) {
      dispatch(requestId, "error", "Une mise à jour est déjà en cours.")
      return
    }

    executor.execute {
      try {
        val url = validateSource(sourceUrl)
        val digest = expectedSha256.lowercase()
        require(digest.matches(Regex("^[a-f0-9]{64}$"))) { "Empreinte SHA-256 invalide." }
        val file = download(requestId, url, digest)
        pendingInstall = PendingInstall(requestId, file)
        activity.runOnUiThread { openInstallerOrPermission(pendingInstall ?: return@runOnUiThread) }
      } catch (error: Exception) {
        dispatch(requestId, "error", error.message ?: "Mise à jour Android impossible.")
      } finally {
        busy.set(false)
      }
    }
  }

  fun onResume() {
    if (!awaitingInstallPermission) return
    awaitingInstallPermission = false
    val pending = pendingInstall ?: return
    if (canInstallPackages()) {
      openInstaller(pending)
    } else {
      pendingInstall = null
      dispatch(pending.requestId, "error", "L’autorisation d’installer la mise à jour n’a pas été accordée.")
    }
  }

  fun close() {
    executor.shutdownNow()
  }

  private fun validateSource(value: String): URL {
    val uri = Uri.parse(value)
    val trusted = uri.scheme == "https"
      && uri.host == "github.com"
      && uri.path?.startsWith("/NibinNaug/ESE-Electrical-Schematics-Enlightener/releases/download/") == true
      && uri.lastPathSegment == "ESE-Android-Universal.apk"
      && uri.query == null
      && uri.fragment == null
    require(trusted) { "L’APK ne provient pas du dépôt GitHub officiel d’ESE." }
    return URL(value)
  }

  private fun download(requestId: String, url: URL, expectedSha256: String): File {
    val updateDirectory = File(activity.cacheDir, "updates").apply { mkdirs() }
    val partial = File(updateDirectory, "ESE-Android-Universal.apk.part")
    val destination = File(updateDirectory, "ESE-Android-Universal.apk")
    partial.delete()
    destination.delete()

    val connection = (url.openConnection() as HttpURLConnection).apply {
      instanceFollowRedirects = true
      connectTimeout = 20_000
      readTimeout = 60_000
      requestMethod = "GET"
      setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream")
      setRequestProperty("User-Agent", "ESE-Android-Updater")
    }

    try {
      val status = connection.responseCode
      require(status in 200..299) { "GitHub a répondu $status pendant le téléchargement." }
      val total = connection.contentLengthLong.takeIf { it > 0 }
      require(total == null || total <= MAX_APK_BYTES) { "L’APK annoncé dépasse la taille maximale autorisée." }
      dispatch(requestId, "download-started", "Téléchargement de la mise à jour…", 0, total)

      val sha256 = MessageDigest.getInstance("SHA-256")
      var downloaded = 0L
      var lastProgress = 0L
      connection.inputStream.use { input ->
        partial.outputStream().buffered().use { output ->
          val buffer = ByteArray(DEFAULT_BUFFER_SIZE * 4)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            if (Thread.currentThread().isInterrupted) throw InterruptedException("Téléchargement interrompu.")
            downloaded += read
            require(downloaded <= MAX_APK_BYTES) { "L’APK téléchargé dépasse la taille maximale autorisée." }
            output.write(buffer, 0, read)
            sha256.update(buffer, 0, read)
            if (downloaded - lastProgress >= 256 * 1024 || downloaded == total) {
              lastProgress = downloaded
              dispatch(requestId, "download-progress", "Téléchargement de la mise à jour…", downloaded, total)
            }
          }
        }
      }
      require(downloaded > 0) { "GitHub a renvoyé un APK vide." }
      require(total == null || downloaded == total) { "Le téléchargement de l’APK est incomplet." }
      dispatch(requestId, "download-finished", "Téléchargement terminé.", downloaded, total)
      dispatch(requestId, "verifying", "Vérification de l’empreinte SHA-256…", downloaded, total)

      val actualSha256 = sha256.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
      require(actualSha256 == expectedSha256) { "L’empreinte de l’APK ne correspond pas à celle publiée par GitHub." }
      if (!partial.renameTo(destination)) {
        partial.copyTo(destination, overwrite = true)
        partial.delete()
      }
      return destination
    } finally {
      connection.disconnect()
      if (!destination.exists()) partial.delete()
    }
  }

  private fun openInstallerOrPermission(pending: PendingInstall) {
    if (!canInstallPackages()) {
      awaitingInstallPermission = true
      dispatch(
        pending.requestId,
        "permission-required",
        "Autorise ESE à installer cette mise à jour, puis reviens dans l’application."
      )
      val settings = Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${activity.packageName}")
      )
      activity.startActivity(settings)
      return
    }
    openInstaller(pending)
  }

  private fun canInstallPackages(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.packageManager.canRequestPackageInstalls()

  private fun openInstaller(pending: PendingInstall) {
    val contentUri = FileProvider.getUriForFile(
      activity,
      "${activity.packageName}.fileprovider",
      pending.file
    )
    val installer = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(contentUri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    pendingInstall = null
    activity.startActivity(installer)
    dispatch(pending.requestId, "installer-opened", "Programme d’installation Android ouvert.")
  }

  private fun dispatch(
    requestId: String,
    state: String,
    message: String,
    downloaded: Long? = null,
    total: Long? = null
  ) {
    val detail = JSONObject()
      .put("requestId", requestId)
      .put("state", state)
      .put("message", message)
    if (downloaded != null) detail.put("downloaded", downloaded)
    if (total != null) detail.put("total", total)
    activity.dispatchUpdateEvent(detail)
  }

  private companion object {
    const val MAX_APK_BYTES = 250L * 1024L * 1024L
  }
}
