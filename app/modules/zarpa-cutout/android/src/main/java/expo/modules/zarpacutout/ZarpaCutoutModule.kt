package expo.modules.zarpacutout

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.Subject
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin

/*
 * Pegatina troquelada a partir de la foto del avistamiento.
 *
 * 1. ML Kit separa los sujetos del fondo (sin clases: vale igual para un
 *    escarabajo que para un ciervo).
 * 2. Se elige el sujeto que contiene el punto donde estaba la retícula; si
 *    ninguno lo contiene, el más cercano. Así, si en la foto hay un perro y su
 *    dueño, la pegatina es del perro que se estaba enfocando.
 * 3. Se le añade el borde blanco del troquel dibujando la silueta en blanco
 *    desplazada en círculo y el sujeto encima.
 *
 * Si algo falla se devuelve null y la app usa la foto recortada en cuadrado.
 */
class ZarpaCutoutModule : Module() {
  private var segmenter: SubjectSegmenter? = null

  private fun client(): SubjectSegmenter {
    segmenter?.let { return it }
    val options = SubjectSegmenterOptions.Builder()
      .enableMultipleSubjects(
        SubjectSegmenterOptions.SubjectResultOptions.Builder().enableSubjectBitmap().build()
      )
      .build()
    return SubjectSegmentation.getClient(options).also { segmenter = it }
  }

  override fun definition() = ModuleDefinition {
    Name("ZarpaCutout")

    // Pide el modelo a Play services con una imagen mínima. El resultado da
    // igual; lo que importa es que la descarga empiece antes del primer fichaje.
    AsyncFunction("prepare") { promise: Promise ->
      try {
        val tiny = Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888)
        client().process(InputImage.fromBitmap(tiny, 0))
          .addOnSuccessListener { promise.resolve(true) }
          .addOnFailureListener { promise.resolve(false) }
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    AsyncFunction("makeSticker") { inputUri: String, outputPath: String, focusX: Double, focusY: Double, outline: Double, promise: Promise ->
      try {
        val context = appContext.reactContext ?: run {
          promise.resolve(null)
          return@AsyncFunction
        }
        val image = InputImage.fromFilePath(context, Uri.parse(inputUri))
        client().process(image)
          .addOnSuccessListener { result ->
            try {
              val subject = pick(result.subjects, focusX * image.width, focusY * image.height)
              val bitmap = subject?.bitmap
              if (bitmap == null) {
                promise.resolve(null)
                return@addOnSuccessListener
              }
              val radius = max(4, (outline * max(bitmap.width, bitmap.height)).roundToInt())
              val sticker = withOutline(bitmap, radius)
              val file = File(outputPath)
              file.parentFile?.mkdirs()
              FileOutputStream(file).use { sticker.compress(Bitmap.CompressFormat.PNG, 100, it) }
              promise.resolve(
                mapOf("uri" to Uri.fromFile(file).toString(), "width" to sticker.width, "height" to sticker.height)
              )
            } catch (e: Exception) {
              promise.resolve(null)
            }
          }
          .addOnFailureListener { promise.resolve(null) }
      } catch (e: Exception) {
        promise.resolve(null)
      }
    }
  }

  private fun pick(subjects: List<Subject>, fx: Double, fy: Double): Subject? {
    if (subjects.isEmpty()) return null
    subjects.firstOrNull {
      fx >= it.startX && fx <= it.startX + it.width && fy >= it.startY && fy <= it.startY + it.height
    }?.let { return it }
    return subjects.minByOrNull {
      hypot(it.startX + it.width / 2.0 - fx, it.startY + it.height / 2.0 - fy)
    }
  }

  private fun withOutline(src: Bitmap, radius: Int): Bitmap {
    val pad = radius + 2
    val out = Bitmap.createBitmap(src.width + pad * 2, src.height + pad * 2, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val white = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
      colorFilter = PorterDuffColorFilter(Color.WHITE, PorterDuff.Mode.SRC_IN)
    }
    // Dos anillos (radio completo y medio) para que no queden huecos entre las
    // copias desplazadas en las curvas cerradas de la silueta.
    for (ring in listOf(1.0, 0.5)) {
      val steps = 40
      for (i in 0 until steps) {
        val a = 2 * PI * i / steps
        canvas.drawBitmap(
          src,
          (pad + radius * ring * cos(a)).toFloat(),
          (pad + radius * ring * sin(a)).toFloat(),
          white
        )
      }
    }
    canvas.drawBitmap(src, pad.toFloat(), pad.toFloat(), null)
    return out
  }
}
