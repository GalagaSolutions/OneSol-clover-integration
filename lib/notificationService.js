import { Redis } from "@upstash/redis";
import axios from "axios";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

/**
 * Notify about failed invoice updates while payment was successful
 */
export async function notifyFailedInvoiceUpdate(locationId, details) {
  const { invoiceId, paymentId, amount, error } = details;
  
  try {
    // Store the notification in Redis for dashboard display
    const notificationKey = `invoice_update_notification_${paymentId}`;
    await redis.set(notificationKey, JSON.stringify({
      type: "PAYMENT_SUCCESS_INVOICE_FAILED",
      status: "pending",
      locationId,
      invoiceId,
      paymentId,
      amount,
      error,
      timestamp: new Date().toISOString(),
      resolved: false
    }), { ex: 604800 }); // Store for 7 days

    // Add to the location's notification list
    const locationNotificationsKey = `location_notifications_${locationId}`;
    await redis.sadd(locationNotificationsKey, paymentId);

    // If webhook URL is configured, send notification
    const configKey = `location_config_${locationId}`;
    const config = await redis.get(configKey);
    
    if (config) {
      const { webhookUrl } = JSON.parse(config);
      if (webhookUrl) {
        await axios.post(webhookUrl, {
          event: "payment.invoice.update.failed",
          data: {
            message: "Payment processed successfully but invoice update failed",
            invoiceId,
            paymentId,
            amount,
            error,
            timestamp: new Date().toISOString()
          }
        });
      }
    }

    return true;
  } catch (error) {
    console.error("Failed to send notification:", error);
    return false;
  }
}

/**
 * Get pending notifications for a location
 */
export async function getPendingNotifications(locationId) {
  const notificationsKey = `location_notifications_${locationId}`;
  const paymentIds = await redis.smembers(notificationsKey);
  
  const notifications = [];
  for (const paymentId of paymentIds) {
    const notificationKey = `invoice_update_notification_${paymentId}`;
    const notification = await redis.get(notificationKey);
    if (notification) {
      notifications.push(JSON.parse(notification));
    }
  }
  
  return notifications;
}

/**
 * Mark a notification as resolved
 */
export async function resolveNotification(locationId, paymentId) {
  const notificationKey = `invoice_update_notification_${paymentId}`;
  const notification = await redis.get(notificationKey);
  
  if (notification) {
    const data = JSON.parse(notification);
    data.resolved = true;
    data.resolvedAt = new Date().toISOString();
    await redis.set(notificationKey, JSON.stringify(data));
    
    // Remove from pending list
    const locationNotificationsKey = `location_notifications_${locationId}`;
    await redis.srem(locationNotificationsKey, paymentId);
  }
}