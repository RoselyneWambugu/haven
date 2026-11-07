import { WebView } from 'react-native-webview'

/** The call itself, on a phone: Daily's page in a web view that may use the camera and microphone. */
export function CallFrame({ url }: { url: string }) {
  return (
    <WebView
      testID="call-frame"
      source={{ uri: url }}
      style={{ flex: 1, minHeight: 360, borderRadius: 16, backgroundColor: '#102F27' }}
      javaScriptEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      allowsFullscreenVideo
      setSupportMultipleWindows={false}
      originWhitelist={['https://*']}
    />
  )
}
