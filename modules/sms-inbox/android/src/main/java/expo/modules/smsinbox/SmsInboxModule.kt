package expo.modules.smsinbox

import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 문자함(SMS + MMS/LMS)에서 카드 결제 문자만 골라 JS로 넘겨주는 모듈.
 * 한국 카드 문자는 길면 LMS(안드로이드에서는 MMS)로 와서 SMS 수신 브로드캐스트로는 못 받으므로,
 * 앱이 열릴 때 문자함을 직접 읽는다. 앱이 켜져 있는 동안은 문자함이 바뀌면 onChange 이벤트를 보낸다.
 */
class SmsInboxModule : Module() {
  private var observer: ContentObserver? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SmsInbox")

    Events("onChange")

    OnStartObserving {
      val ctx = appContext.reactContext ?: return@OnStartObserving
      val obs = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) {
          sendEvent("onChange", emptyMap<String, Any>())
        }
      }
      try {
        ctx.contentResolver.registerContentObserver(Uri.parse("content://mms-sms/"), true, obs)
        observer = obs
      } catch (e: SecurityException) {
        // 권한이 없으면 감시하지 않는다 (앱을 열 때 확인하는 것으로 충분)
      }
    }

    OnStopObserving {
      observer?.let { appContext.reactContext?.contentResolver?.unregisterContentObserver(it) }
      observer = null
    }

    /** since(ms) 이후에 받은 카드 결제 문자 목록: [{ body, date(ms) }] */
    AsyncFunction("getCardMessagesSince") { since: Double ->
      val from = since.toLong()
      readSms(context, from) + readMms(context, from)
    }
  }

  /** 카드 결제 문자로 보이는지 (개인 문자는 JS로 넘기지 않는다) */
  private fun looksLikeCard(body: String): Boolean =
    (body.contains("승인") || body.contains("취소")) &&
      listOf("신한", "삼성", "현대", "농협", "NH").any { body.contains(it) }

  /** 일반 문자(SMS). date 열은 ms 단위. */
  private fun readSms(ctx: Context, since: Long): List<Map<String, Any>> {
    val out = mutableListOf<Map<String, Any>>()
    ctx.contentResolver.query(
      Uri.parse("content://sms/inbox"),
      arrayOf("body", "date"),
      "date >= ?",
      arrayOf(since.toString()),
      "date ASC"
    )?.use { c ->
      val bodyIndex = c.getColumnIndexOrThrow("body")
      val dateIndex = c.getColumnIndexOrThrow("date")
      while (c.moveToNext()) {
        val body = c.getString(bodyIndex) ?: continue
        if (looksLikeCard(body)) out.add(mapOf("body" to body, "date" to c.getLong(dateIndex).toDouble()))
      }
    }
    return out
  }

  /** 장문 문자(LMS/MMS). date 열은 초 단위. */
  private fun readMms(ctx: Context, since: Long): List<Map<String, Any>> {
    val out = mutableListOf<Map<String, Any>>()
    ctx.contentResolver.query(
      Uri.parse("content://mms/inbox"),
      arrayOf("_id", "date"),
      "date >= ?",
      arrayOf((since / 1000).toString()),
      "date ASC"
    )?.use { c ->
      while (c.moveToNext()) {
        val id = c.getLong(0)
        val body = mmsText(ctx, id) ?: continue
        if (looksLikeCard(body)) out.add(mapOf("body" to body, "date" to (c.getLong(1) * 1000).toDouble()))
      }
    }
    return out
  }

  /** MMS 한 건의 글자 부분을 이어 붙인다. */
  private fun mmsText(ctx: Context, mmsId: Long): String? {
    val sb = StringBuilder()
    ctx.contentResolver.query(
      Uri.parse("content://mms/part"),
      arrayOf("_id", "ct", "text"),
      "mid = ?",
      arrayOf(mmsId.toString()),
      null
    )?.use { c ->
      while (c.moveToNext()) {
        if (c.getString(1) != "text/plain") continue
        val text = c.getString(2) ?: readPart(ctx, c.getLong(0))
        if (text != null) sb.append(text)
      }
    }
    return sb.toString().ifEmpty { null }
  }

  /** 글자가 파일로 따로 저장된 MMS 부분을 읽는다. */
  private fun readPart(ctx: Context, partId: Long): String? =
    try {
      ctx.contentResolver.openInputStream(Uri.parse("content://mms/part/$partId"))?.use {
        it.readBytes().toString(Charsets.UTF_8)
      }
    } catch (e: Exception) {
      null
    }
}
