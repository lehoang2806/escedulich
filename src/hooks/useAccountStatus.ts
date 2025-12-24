import { useEffect, useCallback } from 'react'
import { checkAccountStatus, resetCheckTime } from '~/utils/accountStatus'

// Khoảng thời gian kiểm tra định kỳ (1 phút)
const CHECK_INTERVAL = 60000

/**
 * Hook để kiểm tra trạng thái tài khoản định kỳ
 * Nếu tài khoản bị khóa, sẽ tự động đăng xuất và hiển thị thông báo
 */
export const useAccountStatus = () => {
  const checkStatus = useCallback(async () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    if (!token) {
      return // Không có user đăng nhập
    }

    await checkAccountStatus()
  }, [])

  useEffect(() => {
    // Kiểm tra ngay khi mount
    checkStatus()

    // Kiểm tra định kỳ
    const interval = setInterval(checkStatus, CHECK_INTERVAL)

    // Kiểm tra khi user focus lại tab
    const handleFocus = () => {
      resetCheckTime() // Reset để force check ngay
      checkStatus()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [checkStatus])
}

export default useAccountStatus
