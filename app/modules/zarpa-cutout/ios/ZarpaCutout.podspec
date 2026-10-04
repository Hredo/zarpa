Pod::Spec.new do |s|
  s.name           = 'ZarpaCutout'
  s.version        = '1.0.0'
  s.summary        = 'Recorte del sujeto para las pegatinas de Zarpa'
  s.description    = 'Separa al animal del fondo con Vision y le añade el borde blanco del troquel.'
  s.license        = 'UNLICENSED'
  s.author         = 'Hugo Redondo'
  s.homepage       = 'https://github.com/Hredo'
  # VNGenerateForegroundInstanceMaskRequest es de iOS 17; la app ya exige 17
  # por ExecuTorch.
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
