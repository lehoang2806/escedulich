import axiosInstance from '~/utils/axiosInstance'
import { API_ENDPOINTS } from '~/config/api'

// Notification types
export type NotificationType =
  | 'booking_created'
  | 'booking_confirmed'
  | 'booking_completed'
  | 'booking_cancelled'
  | 'payment_success'
  | 'review_received'
  | 'review_reply'
  | 'level_up'
  | 'upgrade_approved'
  | 'upgrade_rejected'
  | 'post_approved'
  | 'post_rejected'
  | 'service_approved'
  | 'service_rejected'

interface NotificationData {
  userId: number
  title: string
  message: string
  type?: NotificationType
}

// Helper function to get user ID from storage
const getUserId = (): number | null => {
  try {
    const userInfoStr = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr)
      const userId = userInfo.Id || userInfo.id
      if (userId) {
        const parsedId = parseInt(userId)
        if (!isNaN(parsedId) && parsedId > 0) {
          return parsedId
        }
      }
    }
    return null
  } catch {
    return null
  }
}

// Helper function to get username from storage
const getUsername = (): string => {
  try {
    const userInfoStr = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr)
      return userInfo.Username || userInfo.username || userInfo.Name || userInfo.name || 'Người dùng'
    }
    return 'Người dùng'
  } catch {
    return 'Người dùng'
  }
}

// Format price helper
const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)
}

// Create notification via API (if endpoint exists)
// Note: This requires backend to have POST /api/notification endpoint
export const createNotification = async (data: NotificationData): Promise<boolean> => {
  try {
    await axiosInstance.post(`${API_ENDPOINTS.NOTIFICATION}/create`, {
      UserId: data.userId,
      Title: data.title,
      Message: data.message
    })
    return true
  } catch (error) {
    console.warn('Could not create notification via API:', error)
    return false
  }
}

// Send notification via SignalR (real-time only, not persisted)
export const sendNotificationViaSignalR = async (
  connection: any,
  userId: number,
  title: string,
  message: string
): Promise<boolean> => {
  if (!connection) {
    console.warn('SignalR connection not available')
    return false
  }

  try {
    await connection.invoke('SendToUser', userId.toString(), {
      Id: Date.now(), // Temporary ID
      UserId: userId,
      Title: title,
      Message: message,
      IsRead: false,
      CreatedAt: new Date().toISOString()
    })
    return true
  } catch (error) {
    console.warn('Could not send notification via SignalR:', error)
    return false
  }
}

// ============================================
// BOOKING NOTIFICATIONS
// ============================================

// Notify user when booking is created successfully
export const notifyBookingCreated = async (
  connection: any,
  userId: number,
  serviceName: string,
  bookingNumber: string
): Promise<void> => {
  const title = '🎉 Đặt dịch vụ thành công'
  const message = `Bạn đã đặt thành công dịch vụ "${serviceName}". Mã đơn: ${bookingNumber}. Vui lòng thanh toán để xác nhận đơn hàng.`

  // Try API first, fallback to SignalR
  const apiSuccess = await createNotification({ userId, title, message, type: 'booking_created' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// Notify user when payment is successful
export const notifyPaymentSuccess = async (
  connection: any,
  userId: number,
  serviceName: string,
  amount: number
): Promise<void> => {
  const title = '✅ Thanh toán thành công'
  const message = `Bạn đã thanh toán thành công ${formatPrice(amount)} cho dịch vụ "${serviceName}". Đơn hàng của bạn đã được xác nhận.`

  const apiSuccess = await createNotification({ userId, title, message, type: 'payment_success' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// Notify user when booking is confirmed
export const notifyBookingConfirmed = async (
  connection: any,
  userId: number,
  serviceName: string,
  bookingNumber: string
): Promise<void> => {
  const title = '✅ Đơn hàng đã được xác nhận'
  const message = `Đơn hàng ${bookingNumber} cho dịch vụ "${serviceName}" đã được xác nhận. Chúc bạn có trải nghiệm tuyệt vời!`

  const apiSuccess = await createNotification({ userId, title, message, type: 'booking_confirmed' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// Notify user when booking is completed
export const notifyBookingCompleted = async (
  connection: any,
  userId: number,
  serviceName: string,
  bookingNumber: string
): Promise<void> => {
  const title = '🎊 Đơn hàng hoàn thành'
  const message = `Đơn hàng ${bookingNumber} cho dịch vụ "${serviceName}" đã hoàn thành. Hãy để lại đánh giá để giúp chúng tôi cải thiện dịch vụ nhé!`

  const apiSuccess = await createNotification({ userId, title, message, type: 'booking_completed' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// Notify user when booking is cancelled
export const notifyBookingCancelled = async (
  connection: any,
  userId: number,
  serviceName: string,
  bookingNumber: string,
  reason?: string
): Promise<void> => {
  const title = '❌ Đơn hàng đã bị hủy'
  const message = reason
    ? `Đơn hàng ${bookingNumber} cho dịch vụ "${serviceName}" đã bị hủy. Lý do: ${reason}`
    : `Đơn hàng ${bookingNumber} cho dịch vụ "${serviceName}" đã bị hủy.`

  const apiSuccess = await createNotification({ userId, title, message, type: 'booking_cancelled' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// ============================================
// REVIEW NOTIFICATIONS
// ============================================

// Notify Host when they receive a new review
export const notifyNewReview = async (
  connection: any,
  hostUserId: number,
  reviewerName: string,
  serviceName: string,
  rating: number
): Promise<void> => {
  const stars = '⭐'.repeat(rating)
  const title = '📝 Nhận được đánh giá mới'
  const message = `${reviewerName} đã đánh giá ${stars} cho dịch vụ "${serviceName}" của bạn.`

  const apiSuccess = await createNotification({ userId: hostUserId, title, message, type: 'review_received' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, hostUserId, title, message)
  }
}

// Notify user when Host replies to their review
export const notifyReviewReply = async (
  connection: any,
  userId: number,
  hostName: string,
  serviceName: string
): Promise<void> => {
  const title = '💬 Host đã phản hồi đánh giá của bạn'
  const message = `${hostName} đã phản hồi đánh giá của bạn về dịch vụ "${serviceName}".`

  const apiSuccess = await createNotification({ userId, title, message, type: 'review_reply' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// ============================================
// LEVEL UP NOTIFICATIONS
// ============================================

// Notify user when they level up
export const notifyLevelUp = async (
  connection: any,
  userId: number,
  newLevel: string,
  newTier: string
): Promise<void> => {
  const tierEmoji = {
    none: '🌱',
    silver: '🥈',
    gold: '🥇',
    diamond: '💎'
  }
  const emoji = tierEmoji[newTier.toLowerCase()] || '🎉'

  const title = `${emoji} Chúc mừng thăng hạng!`
  const message = `Bạn đã đạt ${newLevel} và thăng hạng lên ${newTier.toUpperCase()}! Hãy khám phá các ưu đãi mới dành cho bạn.`

  const apiSuccess = await createNotification({ userId, title, message, type: 'level_up' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// ============================================
// UPGRADE NOTIFICATIONS
// ============================================

// Notify user when upgrade request is approved
export const notifyUpgradeApproved = async (
  connection: any,
  userId: number,
  upgradeType: 'Host' | 'Agency'
): Promise<void> => {
  const title = '🎉 Yêu cầu nâng cấp được duyệt'
  const message = `Chúc mừng! Yêu cầu nâng cấp lên ${upgradeType} của bạn đã được phê duyệt. Bạn có thể bắt đầu sử dụng các tính năng mới ngay bây giờ.`

  const apiSuccess = await createNotification({ userId, title, message, type: 'upgrade_approved' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// Notify user when upgrade request is rejected
export const notifyUpgradeRejected = async (
  connection: any,
  userId: number,
  upgradeType: 'Host' | 'Agency',
  reason?: string
): Promise<void> => {
  const title = '❌ Yêu cầu nâng cấp bị từ chối'
  const message = reason
    ? `Yêu cầu nâng cấp lên ${upgradeType} của bạn đã bị từ chối. Lý do: ${reason}`
    : `Yêu cầu nâng cấp lên ${upgradeType} của bạn đã bị từ chối. Vui lòng liên hệ hỗ trợ để biết thêm chi tiết.`

  const apiSuccess = await createNotification({ userId, title, message, type: 'upgrade_rejected' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// ============================================
// POST/SERVICE APPROVAL NOTIFICATIONS
// ============================================

// Notify user when post is approved
export const notifyPostApproved = async (connection: any, userId: number, postTitle: string): Promise<void> => {
  const title = '✅ Bài viết đã được duyệt'
  const message = `Bài viết "${postTitle}" của bạn đã được phê duyệt và đã được đăng.`

  const apiSuccess = await createNotification({ userId, title, message, type: 'post_approved' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// Notify user when post is rejected
export const notifyPostRejected = async (
  connection: any,
  userId: number,
  postTitle: string,
  reason?: string
): Promise<void> => {
  const title = '❌ Bài viết bị từ chối'
  const message = reason
    ? `Bài viết "${postTitle}" của bạn đã bị từ chối. Lý do: ${reason}`
    : `Bài viết "${postTitle}" của bạn đã bị từ chối.`

  const apiSuccess = await createNotification({ userId, title, message, type: 'post_rejected' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// Notify user when service is approved
export const notifyServiceApproved = async (connection: any, userId: number, serviceName: string): Promise<void> => {
  const title = '✅ Dịch vụ đã được duyệt'
  const message = `Dịch vụ "${serviceName}" của bạn đã được phê duyệt và đã được đăng.`

  const apiSuccess = await createNotification({ userId, title, message, type: 'service_approved' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// Notify user when service is rejected
export const notifyServiceRejected = async (
  connection: any,
  userId: number,
  serviceName: string,
  reason?: string
): Promise<void> => {
  const title = '❌ Dịch vụ bị từ chối'
  const message = reason
    ? `Dịch vụ "${serviceName}" của bạn đã bị từ chối. Lý do: ${reason}`
    : `Dịch vụ "${serviceName}" của bạn đã bị từ chối.`

  const apiSuccess = await createNotification({ userId, title, message, type: 'service_rejected' })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}

// ============================================
// HELPER: Notify current user (self)
// ============================================

export const notifySelf = async (connection: any, title: string, message: string): Promise<void> => {
  const userId = getUserId()
  if (!userId) return

  const apiSuccess = await createNotification({ userId, title, message })
  if (!apiSuccess) {
    await sendNotificationViaSignalR(connection, userId, title, message)
  }
}
