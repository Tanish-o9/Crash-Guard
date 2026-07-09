package expo.modules.nativetts

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

/**
 * NativeTts — speaks text through Android's TextToSpeech engine ON THE VOICE-CALL
 * audio stream (STREAM_VOICE_CALL).
 *
 * WHY: during an active phone call, Android suppresses app audio on the media/music
 * stream (which expo-speech uses), so a TTS message played that way is inaudible
 * until the call ends. Routing TTS to the voice-call stream makes it emit through
 * the in-call audio path — with speakerphone on, that means the loudspeaker — so
 * the phone's own mic picks it up and transmits it to the remote party. This is the
 * "acoustic bridge" that lets a dispatcher/relative hear the generated message.
 */
class NativeTtsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var tts: TextToSpeech? = null
  private var ready = false
  private val onReady = mutableListOf<() -> Unit>()

  // The utterance currently being spoken and the promise awaiting its completion.
  private var currentUtterance: String? = null
  private var currentPromise: Promise? = null

  private val audioManager: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private fun ensureEngine(then: () -> Unit) {
    if (ready) {
      then()
      return
    }
    onReady.add(then)
    if (tts != null) return
    tts = TextToSpeech(context.applicationContext) { status ->
      ready = status == TextToSpeech.SUCCESS
      if (ready) {
        tts?.setAudioAttributes(
          AudioAttributes.Builder()
            .setLegacyStreamType(AudioManager.STREAM_VOICE_CALL)
            .build(),
        )
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String?) {}
          override fun onDone(utteranceId: String?) = finish(utteranceId, true)
          @Deprecated("Deprecated in Java")
          override fun onError(utteranceId: String?) = finish(utteranceId, false)
          override fun onError(utteranceId: String?, errorCode: Int) = finish(utteranceId, false)
        })
      }
      val callbacks = onReady.toList()
      onReady.clear()
      callbacks.forEach { it() }
    }
  }

  private fun finish(utteranceId: String?, success: Boolean) {
    if (utteranceId != null && utteranceId == currentUtterance) {
      currentPromise?.resolve(success)
      currentPromise = null
      currentUtterance = null
    }
  }

  private fun resolveLocale(language: String): Locale {
    // Accept "hi", "hi-IN", "en-IN", etc.
    val parts = language.replace('_', '-').split("-")
    return if (parts.size >= 2) Locale(parts[0], parts[1]) else Locale(parts[0])
  }

  override fun definition() = ModuleDefinition {
    Name("NativeTts")

    /** Speak `text` in `language` on the voice-call stream; resolves when done. */
    AsyncFunction("speakInCall") { text: String, language: String, promise: Promise ->
      ensureEngine {
        val engine = tts
        if (engine == null || !ready) {
          promise.resolve(false)
          return@ensureEngine
        }

        engine.language = resolveLocale(language)
        engine.setSpeechRate(0.95f)

        // Max out the in-call volume so the acoustic bridge is as loud as possible.
        try {
          val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL)
          audioManager.setStreamVolume(AudioManager.STREAM_VOICE_CALL, max, 0)
        } catch (_: Exception) {
        }

        val utteranceId = "cg-${System.nanoTime()}"
        currentUtterance = utteranceId
        currentPromise = promise

        val params = Bundle().apply {
          putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_VOICE_CALL)
          putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
        }
        val result = engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
        if (result != TextToSpeech.SUCCESS) {
          currentPromise = null
          currentUtterance = null
          promise.resolve(false)
        }
      }
    }

    /** Stop any in-progress speech. */
    Function("stop") {
      tts?.stop()
      currentPromise?.resolve(false)
      currentPromise = null
      currentUtterance = null
    }

    OnDestroy {
      tts?.stop()
      tts?.shutdown()
      tts = null
      ready = false
    }
  }
}
