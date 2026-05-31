package com.example

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.example.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {
    private var gameWebView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Fullscreen edge to edge viewport configuration
        enableEdgeToEdge()
        hideSystemUI()
        
        // Handle physical Back Button pressed actions
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                gameWebView?.let { webView ->
                    webView.evaluateJavascript(
                        "if (window.handleAndroidBack) { window.handleAndroidBack(); } else { AndroidBridge.exitApp(); }",
                        null
                    )
                } ?: run {
                    finish()
                }
            }
        })

        setContent {
            MyApplicationTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF0A0B0E) // Fits seamlessly with index background
                ) {
                    BlockBlastWebView(
                        onWebViewCreated = { webView ->
                            gameWebView = webView
                        }
                    )
                }
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUI()
        }
    }

    private fun hideSystemUI() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
        windowInsetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
    }
}

class WebAppInterface(private val activity: ComponentActivity) {
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vibratorManager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    @JavascriptInterface
    fun vibrate(type: Int) {
        vibrator?.let {
            if (!it.hasVibrator()) return
            try {
                when (type) {
                    1 -> { // Soft Tap (Block placing)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            it.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
                        } else {
                            @Suppress("DEPRECATION")
                            it.vibrate(30)
                        }
                    }
                    2 -> { // Medium Blast (Single line clears)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            it.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK))
                        } else {
                            @Suppress("DEPRECATION")
                            it.vibrate(75)
                        }
                    }
                    3 -> { // Heavy Explosion (Bombs / Multi Line Clears)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            it.vibrate(VibrationEffect.createOneShot(180, VibrationEffect.DEFAULT_AMPLITUDE))
                        } else {
                            @Suppress("DEPRECATION")
                            it.vibrate(180)
                        }
                    }
                    4 -> { // Rainbow Sweep or special effect (Wave sequence pulses)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            val pattern = longArrayOf(0, 50, 40, 50, 40, 80)
                            val amplitudes = intArrayOf(0, 100, 0, 150, 0, 255)
                            it.vibrate(VibrationEffect.createWaveform(pattern, amplitudes, -1))
                        } else {
                            @Suppress("DEPRECATION")
                            it.vibrate(longArrayOf(0, 50, 40, 50, 40, 80), -1)
                        }
                    }
                    else -> {
                        @Suppress("DEPRECATION")
                        it.vibrate(40)
                    }
                }
            } catch (e: Exception) {
                Log.e("WebAppInterface", "Error triggering haptic design vibration: ", e)
            }
        }
    }

    @JavascriptInterface
    fun exitApp() {
        activity.runOnUiThread {
            activity.finish()
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun BlockBlastWebView(onWebViewCreated: (WebView) -> Unit) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                // Force hardware acceleration for smooth Web Audio & CSS 3D visuals
                setLayerType(WebView.LAYER_TYPE_HARDWARE, null)
                
                webViewClient = WebViewClient()
                
                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                        consoleMessage?.let {
                            Log.d("BlockBlastJS", "${it.message()} -- From line ${it.lineNumber()} of ${it.sourceId()}")
                        }
                        return true
                    }
                }
                
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    allowFileAccess = true
                    allowContentAccess = true
                    mediaPlaybackRequiresUserGesture = false
                    
                    useWideViewPort = true
                    loadWithOverviewMode = true
                    setSupportZoom(false)
                    builtInZoomControls = false
                    displayZoomControls = false
                }
                
                // Expose our awesome native bridge to JavaScript
                addJavascriptInterface(WebAppInterface(context as ComponentActivity), "AndroidBridge")
                
                onWebViewCreated(this)
                loadUrl("file:///android_asset/www/index.html")
            }
        }
    )
}
