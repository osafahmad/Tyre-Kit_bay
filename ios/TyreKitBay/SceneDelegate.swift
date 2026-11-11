import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UIKit

class SceneDelegate: RCTDefaultReactNativeFactoryDelegate, UIWindowSceneDelegate {
  var window: UIWindow?
  var reactNativeFactory: RCTReactNativeFactory?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }

    dependencyProvider = RCTAppDependencyProvider()
    reactNativeFactory = RCTReactNativeFactory(delegate: self)
    window = UIWindow(windowScene: windowScene)
    
    #if DEBUG
    let devMenuConfiguration = RCTDevMenuConfiguration(
      devMenuEnabled: true,
      shakeGestureEnabled: true,
      keyboardShortcutsEnabled: true
    )
    reactNativeFactory?.devMenuConfiguration = devMenuConfiguration
    #endif
    
    reactNativeFactory?.startReactNative(
      withModuleName: "TyreKitBay",
      in: window,
      connectionOptions: connectionOptions
    )

   
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    RCTLinkingManager.scene(scene, openURLContexts: URLContexts)
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.scene(scene, continue: userActivity)
  }

  #if DEBUG
  // Something in the debug runtime asks the TurboModule manager for
  // "SampleTurboModule" (React Native's own sample spec, which no app ships).
  // The failed lookup calls RCTLogError, and that shows a native RedBox before JS
  // can filter it. Resolving that one name to an empty stub stops the RedBox.
  // Every other name still goes through React Native's normal lookup.
  //
  // Not `override`: the superclass implements this only in its .mm, and the
  // protocol is in a C++ header Swift can't import. RCTReactNativeFactory finds
  // it through the ObjC runtime (respondsToSelector:). Returning nil matches the
  // superclass, which returns nullptr, so the factory falls back to
  // RCTCoreModulesClassProvider.
  @objc(getModuleClassFromName:)
  func moduleClass(fromName name: UnsafePointer<CChar>?) -> AnyClass? {
    if let name, String(cString: name) == SampleTurboModuleStub.moduleName() {
      return SampleTurboModuleStub.self
    }
    return nil
  }
  #endif

  override func bundleURL() -> URL? {
    #if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
    #else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    #endif
  }
}

#if DEBUG
/// Empty, method-less legacy module returned only for the debug-only
/// "SampleTurboModule" lookup in `SceneDelegate.getModuleClass(fromName:)`.
/// It exports nothing, so JS can't call into it.
@objc(TKBSampleTurboModuleStub)
final class SampleTurboModuleStub: NSObject, RCTBridgeModule {
  static func moduleName() -> String! { "SampleTurboModule" }
  static func requiresMainQueueSetup() -> Bool { false }
}
#endif
