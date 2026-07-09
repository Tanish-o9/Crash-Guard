package expo.modules.nativewidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * Home-screen SOS widget. Tapping it deep-links into the app's Good Samaritan
 * flow (crashguard://samaritan?from=widget), where the bystander confirms and
 * the AI-assisted emergency cascade runs.
 *
 * The widget deliberately does NOT place a call on its own — it opens the
 * consent screen first, per the product rule that a human deliberately confirms
 * before anything is shared with emergency services.
 */
class SosWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    for (id in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.widget_sos)

      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("crashguard://samaritan?from=widget"))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      val pending = PendingIntent.getActivity(context, 0, intent, flags)

      views.setOnClickPendingIntent(R.id.widget_sos_button, pending)
      appWidgetManager.updateAppWidget(id, views)
    }
  }
}
