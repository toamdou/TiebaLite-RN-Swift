import ExpoModulesCore
import QuartzCore
import UIKit

public final class TiebaGradientBlurView: ExpoView {
  private let effectView = UIVisualEffectView()
  private let maskLayer = CAGradientLayer()

  var intensity: Double = 60 {
    didSet { updateEffect() }
  }

  var tint: String = "systemMaterialLight" {
    didSet { updateEffect() }
  }

  var fadeHeight: Double = 24 {
    didSet { setNeedsLayout() }
  }

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    effectView.isUserInteractionEnabled = false
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(effectView)

    maskLayer.colors = [UIColor.clear.cgColor, UIColor.black.cgColor]
    maskLayer.startPoint = CGPoint(x: 0.5, y: 0)
    maskLayer.endPoint = CGPoint(x: 0.5, y: 1)
    layer.mask = maskLayer
    updateEffect()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    effectView.frame = bounds
    maskLayer.frame = bounds
    let fade = min(max(fadeHeight, 0), bounds.height)
    if bounds.height > 0 {
      maskLayer.locations = [
        NSNumber(value: min(fade / bounds.height, 1)),
        NSNumber(value: 1),
      ]
    }
  }

  private func updateEffect() {
    effectView.effect = UIBlurEffect(style: Self.blurStyle(tint: tint, intensity: intensity))
  }

  private static func blurStyle(tint: String, intensity: Double) -> UIBlurEffect.Style {
    if tint.contains("ChromeMaterial") {
      if tint.contains("Light") { return .systemChromeMaterialLight }
      if tint.contains("Dark") { return .systemChromeMaterialDark }
      return .systemChromeMaterial
    }
    let light = tint.contains("Light")
    let dark = tint.contains("Dark")
    let material: UIBlurEffect.Style
    switch intensity {
    case 0..<25:
      material = .systemUltraThinMaterial
    case 25..<50:
      material = .systemThinMaterial
    case 50..<75:
      material = .systemMaterial
    default:
      material = .systemThickMaterial
    }
    if dark {
      switch material {
      case .systemUltraThinMaterial: return .systemUltraThinMaterialDark
      case .systemThinMaterial: return .systemThinMaterialDark
      case .systemMaterial: return .systemMaterialDark
      default: return .systemThickMaterialDark
      }
    }
    if light {
      switch material {
      case .systemUltraThinMaterial: return .systemUltraThinMaterialLight
      case .systemThinMaterial: return .systemThinMaterialLight
      case .systemMaterial: return .systemMaterialLight
      default: return .systemThickMaterialLight
      }
    }
    return material
  }
}
