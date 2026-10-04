import CoreImage
import ExpoModulesCore
import UIKit
import Vision

/*
 * Pegatina troquelada a partir de la foto del avistamiento (iOS 17+).
 *
 * Vision separa los sujetos del fondo sin clases (igual que «Seleccionar
 * sujeto» de Fotos). Se elige el que está bajo la retícula, se recorta a su
 * contorno y se le añade el borde blanco dilatando su canal alfa. Si algo
 * falla se devuelve nil y la app usa la foto recortada en cuadrado.
 */
public class ZarpaCutoutModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZarpaCutout")

    AsyncFunction("prepare") { () -> Bool in
      return true
    }

    AsyncFunction("makeSticker") { (inputUri: String, outputPath: String, focusX: Double, focusY: Double, outline: Double) -> [String: Any]? in
      guard #available(iOS 17.0, *) else { return nil }
      guard let url = URL(string: inputUri), let input = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
        return nil
      }
      let handler = VNImageRequestHandler(ciImage: input)
      let request = VNGenerateForegroundInstanceMaskRequest()
      do {
        try handler.perform([request])
      } catch {
        return nil
      }
      guard let observation = request.results?.first, !observation.allInstances.isEmpty else { return nil }

      let label = Self.instance(at: focusX, focusY, in: observation.instanceMask)
      let instances = label > 0 && observation.allInstances.contains(label) ? IndexSet(integer: label) : observation.allInstances
      guard let masked = try? observation.generateMaskedImage(ofInstances: instances, from: handler, croppedToInstancesExtent: true) else {
        return nil
      }
      let subject = CIImage(cvPixelBuffer: masked)
      let radius = max(4.0, outline * Double(max(subject.extent.width, subject.extent.height)))
      let sticker = Self.withOutline(subject, radius: radius)

      let context = CIContext()
      guard let cg = context.createCGImage(sticker, from: sticker.extent), let data = UIImage(cgImage: cg).pngData() else {
        return nil
      }
      let fileURL = URL(fileURLWithPath: outputPath)
      try? FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      do {
        try data.write(to: fileURL)
      } catch {
        return nil
      }
      return ["uri": fileURL.absoluteString, "width": cg.width, "height": cg.height]
    }
  }

  /// Etiqueta de la instancia bajo el punto (0 = fondo). La máscara de Vision
  /// tiene un byte por píxel y el origen arriba a la izquierda.
  private static func instance(at fx: Double, _ fy: Double, in mask: CVPixelBuffer) -> Int {
    CVPixelBufferLockBaseAddress(mask, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(mask, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(mask) else { return 0 }
    let width = CVPixelBufferGetWidth(mask)
    let height = CVPixelBufferGetHeight(mask)
    let stride = CVPixelBufferGetBytesPerRow(mask)
    let x = min(width - 1, max(0, Int(fx * Double(width))))
    let y = min(height - 1, max(0, Int(fy * Double(height))))
    return Int(base.assumingMemoryBound(to: UInt8.self)[y * stride + x])
  }

  /// Borde blanco: se dilata el alfa del sujeto, se rellena de blanco y se
  /// compone el sujeto encima. Se amplía antes el lienzo para que el borde no
  /// se corte en los lados que tocaban el recorte.
  private static func withOutline(_ subject: CIImage, radius: Double) -> CIImage {
    let padded = subject.composited(over: CIImage(color: .clear).cropped(to: subject.extent.insetBy(dx: -radius * 1.5, dy: -radius * 1.5)))
    let dilated = padded.applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: radius])
    let white = CIImage(color: .white).cropped(to: padded.extent)
    let shape = white.applyingFilter("CIBlendWithAlphaMask", parameters: [
      kCIInputBackgroundImageKey: CIImage(color: .clear).cropped(to: padded.extent),
      kCIInputMaskImageKey: dilated,
    ])
    return subject.composited(over: shape).cropped(to: padded.extent)
  }
}
