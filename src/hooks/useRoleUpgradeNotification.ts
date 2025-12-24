import { useEffect, useRef, useCallback } from 'react'
import { useNotification } from '~/contexts/NotificationContext'
import axiosInstance from '~/utils/axiosInstance'
import { API_ENDPOINTS } from '~/config/api'

// Import CSS
import '~/styles/roleUpgradeDialog.css'

// Khoảng thời gian kiểm tra role backup (5 giây - giảm từ 30 giây)
const CHECK_INTERVAL = 5000

/**
 * Hook để kiểm tra và xử lý khi role của user được nâng cấp
 * Khi Admin duyệt yêu cầu upgrade, sẽ hiển thị dialog thông báo và reload trang
 */
export const useRoleUpgradeNotification = () => {
  const { notifications } = useNotification()
  const lastRoleRef = useRef<number | null>(null)
  const hasShownDialogRef = useRef(false)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastNotificationCountRef = useRef<number>(0)

  // Lấy thông tin user từ storage
  const getUserInfo = useCallback(() => {
    try {
      const userInfoStr = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
      if (userInfoStr) {
        return JSON.parse(userInfoStr)
      }
      return null
    } catch {
      return null
    }
  }, [])

  // Lấy role name từ roleId
  const getRoleName = useCallback((roleId: number): string => {
    switch (roleId) {
      case 1:
        return 'Admin'
      case 2:
        return 'Host'
      case 3:
        return 'Agency'
      case 4:
        return 'Tourist'
      default:
        return 'Người dùng'
    }
  }, [])

  // Hiển thị dialog thông báo nâng cấp role
  const showUpgradeDialog = useCallback((newRoleName: string) => {
    if (hasShownDialogRef.current) return
    hasShownDialogRef.current = true

    // Tạo overlay
    const overlay = document.createElement('div')
    overlay.id = 'role-upgrade-overlay'
    overlay.className = 'role-upgrade-overlay'

    // Tạo dialog
    const dialog = document.createElement('div')
    dialog.className = 'role-upgrade-dialog'

    dialog.innerHTML = `
      <div class="role-upgrade-icon">🎉</div>
      <h2 class="role-upgrade-title">Chúc mừng!</h2>
      <p class="role-upgrade-message">
        Tài khoản của bạn đã được nâng cấp thành
        <strong class="role-upgrade-role-name">${newRoleName}</strong>
      </p>
      <p class="role-upgrade-subtitle">
        Bấm OK để tải lại trang và sử dụng các tính năng mới.
      </p>
      <button id="role-upgrade-ok-btn" class="role-upgrade-btn">OK</button>
    `

    overlay.appendChild(dialog)
    document.body.appendChild(overlay)

    // Thêm event listener cho button
    const okBtn = document.getElementById('role-upgrade-ok-btn')
    if (okBtn) {
      okBtn.addEventListener('click', () => {
        // Reload trang để cập nhật role mới
        window.location.reload()
      })
    }
  }, [])

  // Kiểm tra role từ API
  const checkRoleFromAPI = useCallback(async () => {
    if (hasShownDialogRef.current) return // Đã hiển thị dialog rồi, không cần check nữa
    
    const userInfo = getUserInfo()
    if (!userInfo?.Id && !userInfo?.id) return

    const userId = userInfo.Id || userInfo.id

    try {
      const response = await axiosInstance.get(`${API_ENDPOINTS.USER}/${userId}`)
      const userData = response.data

      const currentStoredRole = userInfo.RoleId || userInfo.roleId
      const newRole = userData.RoleId || userData.roleId

      // Khởi tạo lastRoleRef nếu chưa có
      if (lastRoleRef.current === null) {
        lastRoleRef.current = currentStoredRole
      }

      // Kiểm tra nếu role đã thay đổi (được nâng cấp)
      if (newRole && currentStoredRole && newRole !== currentStoredRole) {
        // Chỉ hiển thị dialog nếu được nâng cấp (roleId giảm = quyền cao hơn)
        // RoleId: 1=Admin, 2=Host, 3=Agency, 4=Tourist
        if (newRole < currentStoredRole) {
          const newRoleName = getRoleName(newRole)
          
          // Cập nhật userInfo trong storage trước khi hiển thị dialog
          const updatedUserInfo = {
            ...userInfo,
            RoleId: newRole,
            roleId: newRole,
            RoleName: userData.RoleName || newRoleName,
            roleName: userData.RoleName || newRoleName
          }
          
          if (localStorage.getItem('userInfo')) {
            localStorage.setItem('userInfo', JSON.stringify(updatedUserInfo))
          }
          if (sessionStorage.getItem('userInfo')) {
            sessionStorage.setItem('userInfo', JSON.stringify(updatedUserInfo))
          }

          // Hiển thị dialog
          showUpgradeDialog(newRoleName)
        }
      }

      lastRoleRef.current = newRole
    } catch (error) {
      // Ignore errors - không làm gì nếu không lấy được thông tin
      if (import.meta.env.DEV) {
        console.warn('[useRoleUpgradeNotification] Error checking role:', error)
      }
    }
  }, [getUserInfo, getRoleName, showUpgradeDialog])

  // Kiểm tra notification về upgrade - REAL-TIME khi có notification mới
  useEffect(() => {
    if (!notifications || notifications.length === 0) return
    if (hasShownDialogRef.current) return // Đã hiển thị dialog rồi

    // Chỉ xử lý khi có notification MỚI (so sánh với count trước đó)
    if (notifications.length <= lastNotificationCountRef.current) {
      lastNotificationCountRef.current = notifications.length
      return
    }
    
    // Cập nhật count
    const newNotificationsCount = notifications.length - lastNotificationCountRef.current
    lastNotificationCountRef.current = notifications.length

    // Lấy các notification mới nhất
    const newNotifications = notifications.slice(0, newNotificationsCount)

    // Tìm notification về upgrade được duyệt trong các notification mới
    const upgradeNotification = newNotifications.find((n) => {
      const message = (n.Message || n.message || '').toLowerCase()
      const title = (n.Title || n.title || '').toLowerCase()
      
      // Kiểm tra các pattern message từ backend
      const isUpgradeApproved = 
        // Pattern từ backend: "Yêu cầu nâng cấp Host/Agency của bạn đã được duyệt thành công."
        (message.includes('nâng cấp') && message.includes('duyệt')) ||
        (message.includes('nâng cấp') && message.includes('phê duyệt')) ||
        (message.includes('upgrade') && message.includes('approved')) ||
        // Pattern title
        (title.includes('đã được duyệt') && message.includes('nâng cấp')) ||
        (title.includes('yêu cầu nâng cấp') && title.includes('duyệt')) ||
        // Các pattern khác
        message.includes('đã được nâng cấp') ||
        message.includes('nâng cấp thành công')
      
      return isUpgradeApproved
    })

    if (upgradeNotification) {
      console.log('🎉 [useRoleUpgradeNotification] Detected upgrade notification, checking role immediately...')
      // Khi nhận được notification về upgrade, kiểm tra role NGAY LẬP TỨC
      checkRoleFromAPI()
    }
  }, [notifications, checkRoleFromAPI])

  // Kiểm tra role định kỳ (backup mechanism)
  useEffect(() => {
    const userInfo = getUserInfo()
    if (!userInfo) return

    // Khởi tạo notification count
    lastNotificationCountRef.current = notifications?.length || 0

    // Kiểm tra ngay khi mount
    checkRoleFromAPI()

    // Thiết lập interval kiểm tra định kỳ (5 giây)
    checkIntervalRef.current = setInterval(() => {
      if (!hasShownDialogRef.current) {
        checkRoleFromAPI()
      }
    }, CHECK_INTERVAL)

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [getUserInfo, checkRoleFromAPI])

  return null
}

export default useRoleUpgradeNotification
