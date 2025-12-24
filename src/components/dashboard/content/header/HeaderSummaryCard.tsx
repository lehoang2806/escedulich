import { useEffect, useState } from 'react'
import SummaryCard from '~/components/common/SummaryCard'
import { fetchDashboardData } from '~/api/instances/DashboardApi'
import type { DashboardDto } from '~/api/instances/DashboardApi'
import ArticleIcon from '@mui/icons-material/Article'
import NewspaperIcon from '@mui/icons-material/Newspaper'
import MiscellaneousServicesIcon from '@mui/icons-material/MiscellaneousServices'
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline'
import Box from '@mui/material/Box'
import type { SummaryCardProps } from '~/types/common'

export default function HeaderDashBoardContent() {
  const [dashboardData, setDashboardData] = useState<DashboardDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchDashboardData()
        console.log('Dashboard data loaded:', data)
        setDashboardData(data)
      } catch (error) {
        console.error('Error loading dashboard:', error)
        setError(error instanceof Error ? error.message : 'Không thể tải dữ liệu')
        // Set fallback data
        setDashboardData({
          totalUsers: 0,
          userGrowth: 'Đang tải...',
          totalPosts: 0,
          postGrowth: 'Đang tải...',
          totalServiceCombos: 0,
          serviceComboGrowth: '',
          totalNews: 0,
          newsGrowth: '',
          totalRevenue: 0,
          revenueGrowth: '',
          totalBookings: 0,
          bookingGrowth: '',
          pendingSupports: 0,
          totalViews: 0,
          todayComments: 0,
          todayReactions: 0,
          todayChatMessages: 0,
          unreadNotifications: 0,
          activeTours: 0,
          todayBookings: 0,
          recentActivities: [],
          urgentSupports: 0,
          pendingUpgradeRequests: 0,
          unreadMessages: 0,
          popularPosts: []
        })
      } finally {
        setLoading(false)
      }
    }
    loadDashboard()
  }, [])

  if (loading) {
    return (
      <Box className={'grid grid-cols-4 gap-[2.4rem]'}>
        {[1, 2, 3, 4].map((i) => (
          <Box key={i} sx={{ height: '120px', bgcolor: 'grey.200', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ color: 'grey.400' }}>Đang tải...</Box>
          </Box>
        ))}
      </Box>
    )
  }

  if (!dashboardData) {
    return (
      <Box className={'grid grid-cols-4 gap-[2.4rem]'}>
        {[1, 2, 3, 4].map((i) => (
          <Box key={i} sx={{ height: '120px', bgcolor: 'error.light', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'error.main' }}>
            {error || 'Không có dữ liệu'}
          </Box>
        ))}
      </Box>
    )
  }

  const headerDashboardConfig: SummaryCardProps[] = [
    {
      title: 'Tổng User',
      value: dashboardData.totalUsers.toLocaleString('vi-VN'),
      subtitle: 'Người dùng hệ thống',
      bgColor: 'bg-linear-to-br from-blue-50 to-blue-100',
      textColor: 'text-blue-800',
      icon: <PeopleOutlineIcon sx={{ fontSize: '2rem' }} />
    },
    {
      title: 'Bài viết',
      value: dashboardData.totalPosts.toLocaleString('vi-VN'),
      subtitle: 'Tổng bài viết',
      icon: <ArticleIcon sx={{ fontSize: '2rem' }} />,
      bgColor: 'bg-linear-to-br from-green-50 to-green-100',
      textColor: 'text-green-600'
    },
    {
      title: 'Số lượng dịch vụ',
      value: dashboardData.totalServiceCombos.toLocaleString('vi-VN'),
      subtitle: 'Tổng dịch vụ',
      icon: <MiscellaneousServicesIcon sx={{ fontSize: '2rem' }} />,
      bgColor: 'bg-linear-to-br from-purple-50 to-purple-100',
      textColor: 'text-purple-600'
    },
    {
      title: 'Tin tức',
      value: dashboardData.totalNews.toLocaleString('vi-VN'),
      subtitle: 'Tổng tin tức',
      icon: <NewspaperIcon sx={{ fontSize: '2rem' }} />,
      bgColor: 'bg-linear-to-br from-orange-50 to-orange-100',
      textColor: 'text-orange-600'
    }
  ]

  return (
    <Box className={'grid grid-cols-4 gap-[2.4rem]'}>
      {headerDashboardConfig.map((card, index) => (
        <SummaryCard key={index} {...card} />
      ))}
    </Box>
  )
}
