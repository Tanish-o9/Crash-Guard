package expo.modules.nativecall

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * NativeCall — places a phone call in the background via ACTION_CALL.
 * The call is dialled immediately without the user touching the phone.
 * JS interface: apps/mobile/modules/native-call/index.ts
 */
class NativeCallModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun hasCallPermission(): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) ==
      PackageManager.PERMISSION_GRANTED

  private val audioManager: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  /**
   * Route call audio to the loudspeaker so that TTS played through the speaker is
   * picked up by the phone's own microphone and transmitted into the live call —
   * the "acoustic bridge" that lets the dispatcher hear the generated message.
   *
   * Uses setCommunicationDevice on API 31+ (setSpeakerphoneOn is deprecated there)
   * and falls back to setSpeakerphoneOn on older devices.
   */
  private fun routeToSpeaker(enable: Boolean) {
    val am = audioManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (enable) {
        val speaker = am.availableCommunicationDevices.firstOrNull {
          it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        }
        if (speaker != null) am.setCommunicationDevice(speaker)
      } else {
        am.clearCommunicationDevice()
      }
    } else {
      @Suppress("DEPRECATION")
      am.isSpeakerphoneOn = enable
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NativeCall")

    Function("hasPermission") {
      hasCallPermission()
    }

    /** Force the active call onto (or off) the loudspeaker for the acoustic bridge. */
    AsyncFunction("setSpeakerphone") { enable: Boolean ->
      routeToSpeaker(enable)
      true
    }

    AsyncFunction("placeCall") { phone: String ->
      if (!hasCallPermission()) {
        throw Exception("CALL_PHONE permission not granted")
      }
      val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$phone")).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      // Prefer the current activity; fall back to app context for background dispatch.
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent)
      }
      true
    }
  }
}
