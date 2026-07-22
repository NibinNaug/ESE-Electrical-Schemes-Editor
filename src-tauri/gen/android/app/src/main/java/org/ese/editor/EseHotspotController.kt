package org.ese.editor

import android.Manifest
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.File
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.Collections

class EseHotspotController(private val activity: MainActivity) {
  private data class InterfaceIpv4(val name: String, val address: String)

  private val handler = Handler(Looper.getMainLooper())
  private val wifiManager = activity.applicationContext.getSystemService(WifiManager::class.java)
  private var reservation: WifiManager.LocalOnlyHotspotReservation? = null
  private var pendingRequestId: String? = null
  private var starting = false
  private var baselineAddresses = emptySet<String>()
  private var baselineArp = emptySet<String>()
  private var activeInterface = ""
  private var activeAddress = ""
  private var activeSsid = ""
  private var activePassphrase = ""

  fun capabilities(): String = JSONObject()
    .put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    .put("apiLevel", Build.VERSION.SDK_INT)
    .put("permissionGranted", hasRequiredPermission())
    .toString()

  fun start(requestId: String) {
    if (requestId.isBlank()) return
    activity.runOnUiThread {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        emit(requestId, "unsupported", "Le point d’accès local exige Android 8 ou plus récent.")
        return@runOnUiThread
      }
      if (reservation != null) {
        emitReady(requestId)
        return@runOnUiThread
      }
      if (starting) {
        emit(requestId, "failed", "La création du point d’accès est déjà en cours.")
        return@runOnUiThread
      }
      if (!hasRequiredPermission()) {
        pendingRequestId = requestId
        activity.requestHotspotPermission(requiredPermission())
        return@runOnUiThread
      }
      begin(requestId)
    }
  }

  fun onPermissionResult(granted: Boolean) {
    val requestId = pendingRequestId ?: return
    pendingRequestId = null
    if (granted) begin(requestId)
    else emit(requestId, "permissionDenied", "Autorisation Wi-Fi refusée : utilise la connexion manuelle.")
  }

  fun stopOwned() {
    activity.runOnUiThread {
      pendingRequestId = null
      starting = false
      reservation?.close()
      reservation = null
      clearActiveNetwork()
    }
  }

  fun preferredIpv4(): String = preferredEntry()?.address.orEmpty()

  fun connectedClientCount(): Int {
    if (reservation == null || activeInterface.isBlank()) return 0
    val entries = readArpEntries(activeInterface) ?: return -1
    return entries.minus(baselineArp).size
  }

  private fun begin(requestId: String) {
    starting = true
    pendingRequestId = requestId
    baselineAddresses = ipv4Interfaces().mapTo(mutableSetOf()) { it.address }
    baselineArp = readArpEntries() ?: emptySet()
    emit(requestId, "starting", "Création du point d’accès local ESE…")

    try {
      wifiManager.startLocalOnlyHotspot(object : WifiManager.LocalOnlyHotspotCallback() {
        override fun onStarted(value: WifiManager.LocalOnlyHotspotReservation) {
          reservation = value
          starting = false
          val credentials = credentials(value)
          activeSsid = credentials.first
          activePassphrase = credentials.second
          resolveInterface(requestId, 0)
        }

        override fun onFailed(reason: Int) {
          starting = false
          pendingRequestId = null
          clearActiveNetwork()
          val message = when (reason) {
            ERROR_INCOMPATIBLE_MODE -> "Un autre point d’accès est déjà actif. ESE le laisse intact et passe en connexion manuelle."
            ERROR_NO_CHANNEL -> "Aucun canal Wi-Fi n’est disponible pour le point d’accès local."
            ERROR_TETHERING_DISALLOWED -> "Android ou l’administrateur interdit la création du point d’accès local."
            else -> "Android n’a pas pu créer le point d’accès local."
          }
          emit(requestId, if (reason == ERROR_INCOMPATIBLE_MODE) "incompatibleMode" else "failed", message)
        }

        override fun onStopped() {
          reservation = null
          starting = false
          clearActiveNetwork()
          emit(requestId, "stopped", "Le point d’accès local ESE a été arrêté par Android.")
        }
      }, handler)
    } catch (error: SecurityException) {
      starting = false
      pendingRequestId = null
      emit(requestId, "permissionDenied", "Android refuse l’accès Wi-Fi : ${error.message.orEmpty()}")
    } catch (error: RuntimeException) {
      starting = false
      pendingRequestId = null
      emit(requestId, "failed", "Création du point d’accès impossible : ${error.message.orEmpty()}")
    }
  }

  private fun resolveInterface(requestId: String, attempt: Int) {
    val candidate = ipv4Interfaces()
      .filter { it.address !in baselineAddresses }
      .minByOrNull { interfacePriority(it.name) }
    if (candidate != null) {
      activeInterface = candidate.name
      activeAddress = candidate.address
      pendingRequestId = null
      emitReady(requestId)
      return
    }

    if (attempt < 12 && reservation != null) {
      handler.postDelayed({ resolveInterface(requestId, attempt + 1) }, 250)
      return
    }

    val fallback = preferredEntry()
    activeInterface = fallback?.name.orEmpty()
    activeAddress = fallback?.address.orEmpty()
    pendingRequestId = null
    if (activeAddress.isBlank()) {
      reservation?.close()
      reservation = null
      emit(requestId, "failed", "Le point d’accès existe, mais son adresse locale reste introuvable.")
    } else {
      emitReady(requestId)
    }
  }

  private fun emitReady(requestId: String) {
    val detail = JSONObject()
      .put("requestId", requestId)
      .put("state", "ready")
      .put("owned", true)
      .put("ssid", activeSsid)
      .put("passphrase", activePassphrase)
      .put("security", if (activePassphrase.isBlank()) "nopass" else "WPA")
      .put("address", activeAddress)
      .put("interfaceName", activeInterface)
    activity.dispatchHotspotEvent(detail)
  }

  private fun emit(requestId: String, state: String, message: String) {
    activity.dispatchHotspotEvent(
      JSONObject()
        .put("requestId", requestId)
        .put("state", state)
        .put("owned", false)
        .put("message", message)
    )
  }

  private fun credentials(value: WifiManager.LocalOnlyHotspotReservation): Pair<String, String> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val configuration = value.softApConfiguration
      Pair(configuration.ssid.orEmpty(), configuration.passphrase.orEmpty())
    } else {
      @Suppress("DEPRECATION")
      val configuration = value.wifiConfiguration
      Pair(
        configuration?.SSID.orEmpty().trim('"'),
        configuration?.preSharedKey.orEmpty().trim('"')
      )
    }
  }

  private fun requiredPermission(): String = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    Manifest.permission.NEARBY_WIFI_DEVICES
  } else {
    Manifest.permission.ACCESS_FINE_LOCATION
  }

  private fun hasRequiredPermission(): Boolean = ContextCompat.checkSelfPermission(
    activity,
    requiredPermission()
  ) == PackageManager.PERMISSION_GRANTED

  private fun preferredEntry(): InterfaceIpv4? = ipv4Interfaces()
    .filterNot { isCellularInterface(it.name) }
    .minByOrNull { interfacePriority(it.name) }

  private fun ipv4Interfaces(): List<InterfaceIpv4> {
    return try {
      Collections.list(NetworkInterface.getNetworkInterfaces()).flatMap { network ->
        if (!network.isUp || network.isLoopback) emptyList()
        else Collections.list(network.inetAddresses)
          .filterIsInstance<Inet4Address>()
          .filterNot { it.isLoopbackAddress || it.isAnyLocalAddress || it.isLinkLocalAddress || it.isMulticastAddress }
          .map { InterfaceIpv4(network.name, it.hostAddress.orEmpty()) }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun interfacePriority(name: String): Int {
    val value = name.lowercase()
    return when {
      value.startsWith("ap") || value.startsWith("swlan") -> 0
      value.startsWith("wlan") || value.startsWith("wifi") -> 1
      value.startsWith("eth") -> 2
      value.startsWith("rndis") || value.startsWith("usb") -> 3
      else -> 4
    }
  }

  private fun isCellularInterface(name: String): Boolean {
    val value = name.lowercase()
    return value.startsWith("rmnet") || value.startsWith("ccmni") || value.startsWith("pdp") || value.startsWith("v4-rmnet")
  }

  private fun readArpEntries(interfaceName: String? = null): Set<String>? {
    return try {
      File("/proc/net/arp").useLines { lines ->
        lines.drop(1).mapNotNull { line ->
          val columns = line.trim().split(Regex("\\s+"))
          if (columns.size < 6 || columns[2] == "0x0" || columns[3] == "00:00:00:00:00:00") null
          else if (interfaceName != null && columns[5] != interfaceName) null
          else "${columns[5]}|${columns[0]}|${columns[3]}"
        }.toSet()
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun clearActiveNetwork() {
    activeInterface = ""
    activeAddress = ""
    activeSsid = ""
    activePassphrase = ""
    baselineAddresses = emptySet()
    baselineArp = emptySet()
  }
}
