package expo.modules.zarpacrash

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File

/*
 * Registro de cierres de la app, para saber qué falló sin conectar el móvil.
 *
 * 1. Cualquier excepción sin atrapar (de la cámara, de ML Kit, del puente de
 *    React Native…) se guarda en `files/ultimo-cierre-nativo.json` justo antes
 *    de que Android cierre la app. Después se le pasa al manejador de siempre.
 * 2. Android 11+ guarda por qué terminó el proceso anterior: fallo nativo (C++),
 *    «no responde», memoria… `lastExit()` lo devuelve con el volcado del fallo
 *    nativo reducido a texto legible.
 *
 * La app lo lee al arrancar (src/lib/crashLog.ts) y lo enseña con un botón
 * para compartirlo.
 */
class ZarpaCrashModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZarpaCrash")

    OnCreate {
      appContext.reactContext?.applicationContext?.let { install(it) }
    }

    // La llamada desde JS asegura que el módulo (y su manejador) existen desde el arranque.
    Function("install") {
      appContext.reactContext?.applicationContext?.let { install(it) }
      true
    }

    Function("lastExit") {
      val context = appContext.reactContext?.applicationContext ?: return@Function null
      lastExit(context)
    }
  }

  private fun lastExit(context: Context): Map<String, Any>? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    return try {
      val am = context.getSystemService(ActivityManager::class.java) ?: return null
      val info = am.getHistoricalProcessExitReasons(null, 0, 1).firstOrNull() ?: return null
      val trace =
        if (info.reason == ApplicationExitInfo.REASON_CRASH_NATIVE || info.reason == ApplicationExitInfo.REASON_ANR) {
          readableTrace(info)
        } else {
          ""
        }
      mapOf(
        "reason" to info.reason,
        "description" to (info.description ?: ""),
        "at" to info.timestamp.toDouble(),
        "importance" to info.importance,
        "trace" to trace,
      )
    } catch (e: Throwable) {
      null
    }
  }

  /**
   * El volcado de un fallo nativo es binario (protobuf). Las cadenas legibles
   * que lleva (señal, mensaje de aborto, bibliotecas y funciones de la pila)
   * bastan para saber qué componente falló.
   */
  private fun readableTrace(info: ApplicationExitInfo): String {
    val bytes = info.traceInputStream?.use { it.readNBytesCompat(256 * 1024) } ?: return ""
    val out = LinkedHashSet<String>()
    val run = StringBuilder()
    fun flush() {
      if (run.length >= 5) out.add(run.toString())
      run.setLength(0)
    }
    for (b in bytes) {
      val c = b.toInt() and 0xFF
      if (c in 0x20..0x7E) run.append(c.toChar()) else flush()
      if (out.size >= 80) break
    }
    flush()
    return out.joinToString("\n").take(5000)
  }

  private fun java.io.InputStream.readNBytesCompat(max: Int): ByteArray {
    val buffer = java.io.ByteArrayOutputStream()
    val chunk = ByteArray(16 * 1024)
    while (buffer.size() < max) {
      val n = read(chunk, 0, minOf(chunk.size, max - buffer.size()))
      if (n <= 0) break
      buffer.write(chunk, 0, n)
    }
    return buffer.toByteArray()
  }

  companion object {
    const val FILE = "ultimo-cierre-nativo.json"

    @Volatile private var installed = false

    @Synchronized
    fun install(context: Context) {
      if (installed) return
      installed = true
      val file = File(context.filesDir, FILE)
      val previous = Thread.getDefaultUncaughtExceptionHandler()
      Thread.setDefaultUncaughtExceptionHandler { thread, error ->
        try {
          val json = JSONObject()
            .put("kind", "native")
            .put("thread", thread.name)
            .put("message", "${error.javaClass.name}: ${error.message ?: ""}")
            .put("stack", Log.getStackTraceString(error).take(8000))
            .put("at", System.currentTimeMillis())
          file.writeText(json.toString())
        } catch (_: Throwable) {
          // Si ni siquiera se puede escribir, se cierra como siempre.
        }
        previous?.uncaughtException(thread, error)
      }
    }
  }
}
