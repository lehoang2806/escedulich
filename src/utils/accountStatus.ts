import axiosInstance from './axiosInstance'
import { API_ENDPOINTS } from '~/config/api'
import { showBannedModal } from './bannedModal'

// Flag để tránh gọi API kiểm tra nhiều lần cùng lúc
let isCheckingAccountStatus = false
// Thời gian kiểm tra lần cuối
let lastCheckTime = 0
// Khoảng thời gian tối thiểu giữa các lần kiểm tra (30 giây)
const CHECK_INTERVAL = 30000

/**
 * Đăng xuất user và hiển thị thông báo tài khoản bị khóa
 */
export const logoutBannedUser = () => {
  // Xóa token và userInfo
  localStorage.removeItem('token')
  localStorage.removeItem('userInfo')
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('userInfo')

  // Hiển thị modal thông báo đẹp thay vì alert
  showBannedModal(() => {
    // Redirect về trang login sau khi đóng modal
    window.location.href = '/login'
  })
}

/**
 * Lấy userId từ localStorage/sessionStorage
 */
const getUserId = (): number | null => {
  try {
    const userInfoStr =
      localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
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

/**
 * Kiểm tra trạng thái tài khoản của user hiện tại
 * Nếu bị khóa (IS_BANNED = true hoặc IsActive = false), sẽ đăng xuất
 */
export const checkAccountStatus = async (): Promise<boolean> => {
  const userId = getUserId()
  if (!userId) {
    return true // Không có user đăng nhập, không cần kiểm tra
  }

  // Kiểm tra thời gian từ lần check cuối
  const now = Date.now()
  if (now - lastCheckTime < CHECK_INTERVAL) {
    return true // Chưa đến thời gian kiểm tra tiếp
  }

  // Tránh gọi nhiều lần cùng lúc
  if (isCheckingAccountStatus) {
    return true
  }

  try {
    isCheckingAccountStatus = true
    lastCheckTime = now

    const response = await axiosInstance.get(`${API_ENDPOINTS.USER}/${userId}`)
    const userData = response.data

    // Kiểm tra nếu tài khoản bị khóa (chỉ kiểm tra IS_BANNED)
    // Không kiểm tra IsActive vì tài khoản mới tạo có thể có IsActive = false (chưa verify OTP)
    if (userData.IS_BANNED === true) {
      if (import.meta.env.DEV) {
        console.warn('🚫 [AccountStatus] Tài khoản bị khóa, đăng xuất user')
      }
      logoutBannedUser()
      return false
    }

    return true
  } catch (error) {
    // Nếu không lấy được thông tin user, không làm gì
    if (import.meta.env.DEV) {
      console.warn('⚠️ [AccountStatus] Không thể kiểm tra trạng thái tài khoản:', error)
    }
    return true
  } finally {
    isCheckingAccountStatus = false
  }
}

/**
 * Reset thời gian check để force check ngay lập tức
 */
export const resetCheckTime = () => {
  lastCheckTime = 0
}
