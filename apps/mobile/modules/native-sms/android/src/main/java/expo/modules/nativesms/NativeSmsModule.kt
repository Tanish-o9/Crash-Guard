package expo.modules.nativesms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * NativeSms — sends SMS silently in the background using Android's SmsManager.
 * No user interaction, works offline over the SIM's cellular network.
 * JS interface: apps/mobile/modules/native-sms/index.ts
 */
class NativeSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun hasSmsPermission(): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) ==
      PackageManager.PERMISSION_GRANTED

  private fun getSmsManager(): SmsManager =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(SmsManager::class.java)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getDefault()
    }

  override fun definition() = ModuleDefinition {
    Name("NativeSms")

    Function("hasPermission") {
      hasSmsPermission()
    }

    AsyncFunction("sendSilentSms") { phone: String, message: String ->
      if (!hasSmsPermission()) {
        throw Exception("SEND_SMS permission not granted")
      }
      val smsManager = getSmsManager()
      // Split long messages so bodies over the 160-char limit still send.
      val parts = smsManager.divideMessage(message)
      if (parts.size > 1) {
        smsManager.sendMultipartTextMessage(phone, null, parts, null, null)
      } else {
        smsManager.sendTextMessage(phone, null, message, null, null)
      }
      true
    }
  }
}
