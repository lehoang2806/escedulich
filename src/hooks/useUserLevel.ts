import { useState, useEffect } from 'react'
import axiosInstance from '~/utils/axiosInstance'
import { API_ENDPOINTS } from '~/config/api'
import { getLevelInfo, calculateProgress, calculateLevel, type UserLevel } from '~/utils/levelUtils'

interface UserLevelData {
  totalSpent: number
  level: UserLevel
  levelInfo: ReturnType<typeof getLevelInfo>
  progress: number
  nextLevelAmount: number | null
  loading: boolean
  error: string | null
}

export const useUserLevel = (userId: number | null): UserLevelData => {
  const [totalSpent, setTotalSpent] = useState(0)
  const [level, setLevel] = useState<UserLevel>('default')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUserLevel = async () => {
      if (!userId) {
        setTotalSpent(0)
        setLevel('default')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // Lấy tất cả booking của user
        const bookingsResponse = await axiosInstance.get(`${API_ENDPOINTS.BOOKING}/user/${userId}`)
        const bookings = bookingsResponse.data || []
        
        // Lọc booking đã hoàn thành và cộng tổng tiền
        // Giá TotalAmount đã là giá cuối cùng (đã bao gồm giảm giá Agency nếu có)
        const completedBookings = bookings.filter((b: any) => 
          (b.Status || b.status || '').toLowerCase() === 'completed'
        )
        
        // Log chi tiết từng booking đã hoàn thành
        console.log(`📋 [useUserLevel] UserId=${userId}, Total bookings=${bookings.length}, Completed=${completedBookings.length}`)
        completedBookings.forEach((b: any, index: number) => {
          const bookingId = b.Id || b.id
          const amount = b.TotalAmount || b.totalAmount || 0
          const serviceName = b.ServiceCombo?.Name || b.serviceCombo?.name || b.Service?.Name || b.service?.name || 'Unknown'
          console.log(`  ${index + 1}. Booking #${bookingId}: ${serviceName} - ${amount.toLocaleString()}đ`)
        })
        
        const calculatedTotalSpent = completedBookings.reduce((sum: number, b: any) => {
          const amount = b.TotalAmount || b.totalAmount || 0
          return sum + amount
        }, 0)
        
        console.log(`✅ [useUserLevel] TotalSpent = ${calculatedTotalSpent.toLocaleString()}đ`)

        const spent = Math.round(calculatedTotalSpent)
        const calculatedLevel = calculateLevel(spent)

        setTotalSpent(spent)
        setLevel(calculatedLevel)

        // Cập nhật localStorage
        const userInfoStr = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo')
        if (userInfoStr) {
          try {
            const userInfo = JSON.parse(userInfoStr)
            const updatedUserInfo = { ...userInfo, TotalSpent: spent, totalSpent: spent }
            if (localStorage.getItem('userInfo')) {
              localStorage.setItem('userInfo', JSON.stringify(updatedUserInfo))
            }
            if (sessionStorage.getItem('userInfo')) {
              sessionStorage.setItem('userInfo', JSON.stringify(updatedUserInfo))
            }
            window.dispatchEvent(new Event('userStorageChange'))
          } catch (parseErr) {
            console.warn('⚠️ [useUserLevel] Could not update localStorage:', parseErr)
          }
        }
      } catch (err: any) {
        console.error('❌ [useUserLevel] Error:', err)
        setError('Không thể tải thông tin level')
        setTotalSpent(0)
        setLevel('default')
      } finally {
        setLoading(false)
      }
    }

    fetchUserLevel()
  }, [userId])

  // Tính toán level info
  const levelInfo = getLevelInfo(level)
  const progress = calculateProgress(totalSpent, level)

  // Tính nextLevelAmount dựa trên level hiện tại
  const getNextLevelAmount = (): number | null => {
    switch (level) {
      case 'default':
        return 1 // Cần chi tiêu > 0 để lên Đồng
      case 'bronze':
        return 1000000 // Cần 1 triệu để lên Bạc
      case 'silver':
        return 3000000 // Cần 3 triệu để lên Vàng
      case 'gold':
        return null
      default:
        return 1
    }
  }

  return {
    totalSpent,
    level,
    levelInfo,
    progress,
    nextLevelAmount: getNextLevelAmount(),
    loading,
    error
  }
}
