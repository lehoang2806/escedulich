import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import axiosInstance from '~/utils/axiosInstance';
import { API_ENDPOINTS } from '~/config/api';
import './RevenueManagement.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface RevenueManagementProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const RevenueManagement: React.FC<RevenueManagementProps> = ({ onSuccess, onError }) => {
  // Revenue states
  const [bookings, setBookings] = useState<any[]>([]);
  const [userRoles, setUserRoles] = useState<{ [userId: number]: number }>({});
  const [chartViewBy, setChartViewBy] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return String(now.getMonth() + 1);
  });
  const [selectedMonthYear, setSelectedMonthYear] = useState(() => {
    const now = new Date();
    return now.getFullYear().toString();
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    return new Date().getFullYear().toString();
  });

  // Get user ID helper
  const getUserId = useCallback(() => {
    try {
      const userInfoStr = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo');
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        const userId = userInfo.Id || userInfo.id;
        if (userId) {
          const parsedId = parseInt(userId);
          if (!isNaN(parsedId) && parsedId > 0) {
            return parsedId;
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting user ID:', error);
      return null;
    }
  }, []);

  // Load completed bookings and user roles from API
  useEffect(() => {
    const loadCompletedBookings = async () => {
      try {
        const userId = getUserId();
        if (!userId) {
          setBookings([]);
          return;
        }

        // Get host's service combos
        const serviceCombosResponse = await axiosInstance.get(`${API_ENDPOINTS.SERVICE_COMBO}/host/${userId}`);
        const serviceCombos = serviceCombosResponse.data || [];
        const comboIds = serviceCombos.map((c: any) => c.Id || c.id).filter((id: any) => id);
        
        // Get bookings for each service combo
        const allCompletedBookings: any[] = [];
        const userIdsToFetch = new Set<number>();
        
        for (const comboId of comboIds) {
          try {
            const bookingsResponse = await axiosInstance.get(`${API_ENDPOINTS.BOOKING}/combo/${comboId}`);
            const comboBookings = bookingsResponse.data || [];
            const completedBookings = comboBookings.filter((b: any) => {
              const status = (b.Status || b.status || '').toLowerCase();
              return status === 'completed';
            });
            completedBookings.forEach((b: any) => {
              const bookingUserId = b.UserId || b.userId || b.User?.Id || b.User?.id;
              if (bookingUserId) userIdsToFetch.add(bookingUserId);
            });
            allCompletedBookings.push(...completedBookings);
          } catch (err) {
            if ((err as any)?.response?.status !== 404) {
              console.error(`Error loading bookings for combo ${comboId}:`, err);
            }
          }
        }

        // Fetch user roles for all unique users
        const rolesMap: { [userId: number]: number } = {};
        for (const uid of userIdsToFetch) {
          try {
            const userResponse = await axiosInstance.get(`${API_ENDPOINTS.USER}/${uid}`);
            const userData = userResponse.data;
            rolesMap[uid] = userData.RoleId || userData.roleId || 1;
          } catch {
            rolesMap[uid] = 1; // Default to Tourist if can't fetch
          }
        }

        setUserRoles(rolesMap);
        setBookings(allCompletedBookings);
      } catch (err) {
        console.error('Error loading completed bookings:', err);
        setBookings([]);
      }
    };

    loadCompletedBookings();
  }, [getUserId]);


  // Helper to get user role from booking
  const getUserRoleFromBooking = useCallback((booking: any): number => {
    const bookingUserId = booking.UserId || booking.userId || booking.User?.Id || booking.User?.id;
    if (bookingUserId && userRoles[bookingUserId]) {
      return userRoles[bookingUserId];
    }
    return 1; // Default Tourist
  }, [userRoles]);

  // Revenue chart calculations - phân biệt Tourist và Agency
  const revenueChartData = useMemo(() => {
    let filteredBookings: any[] = [];
    let chartLabels: string[] = [];
    let touristData: number[] = [];
    let agencyData: number[] = [];
    
    if (chartViewBy === 'month') {
      const year = Number(selectedMonthYear);
      const month = Number(selectedMonth);
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      
      filteredBookings = bookings.filter(booking => {
        const date = booking.CompletedDate || booking.completedDate || booking.BookingDate || booking.bookingDate;
        if (!date) return false;
        const bookingDate = new Date(date);
        return bookingDate >= startOfMonth && bookingDate <= endOfMonth;
      });
      
      const daysInMonth = endOfMonth.getDate();
      const touristByDay: { [key: string]: number } = {};
      const agencyByDay: { [key: string]: number } = {};
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        touristByDay[dateKey] = 0;
        agencyByDay[dateKey] = 0;
      }
      
      filteredBookings.forEach(booking => {
        const date = booking.CompletedDate || booking.completedDate || booking.BookingDate || booking.bookingDate;
        if (!date) return;
        const bookingDate = new Date(date);
        const dateKey = bookingDate.toISOString().split('T')[0];
        
        if (touristByDay[dateKey] !== undefined) {
          const amount = booking.TotalAmount || booking.totalAmount || 0;
          const userRoleId = getUserRoleFromBooking(booking);
          
          if (userRoleId === 3) {
            agencyByDay[dateKey] += Number(amount);
          } else {
            touristByDay[dateKey] += Number(amount);
          }
        }
      });
      
      chartLabels = Object.keys(touristByDay).map(dateKey => {
        const d = new Date(dateKey);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      });
      
      touristData = Object.values(touristByDay);
      agencyData = Object.values(agencyByDay);
      
    } else {
      const year = Number(selectedYear);
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59);
      
      filteredBookings = bookings.filter(booking => {
        const date = booking.CompletedDate || booking.completedDate || booking.BookingDate || booking.bookingDate;
        if (!date) return false;
        const bookingDate = new Date(date);
        return bookingDate >= startOfYear && bookingDate <= endOfYear;
      });
      
      const touristByMonth: { [key: number]: number } = {};
      const agencyByMonth: { [key: number]: number } = {};
      
      for (let month = 0; month < 12; month++) {
        touristByMonth[month] = 0;
        agencyByMonth[month] = 0;
      }
      
      filteredBookings.forEach(booking => {
        const date = booking.CompletedDate || booking.completedDate || booking.BookingDate || booking.bookingDate;
        if (!date) return;
        const bookingDate = new Date(date);
        const month = bookingDate.getMonth();
        
        const amount = booking.TotalAmount || booking.totalAmount || 0;
        const userRoleId = getUserRoleFromBooking(booking);
        
        if (userRoleId === 3) {
          agencyByMonth[month] += Number(amount);
        } else {
          touristByMonth[month] += Number(amount);
        }
      });
      
      const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 
                          'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
      chartLabels = monthNames;
      touristData = Object.values(touristByMonth);
      agencyData = Object.values(agencyByMonth);
    }

    const totalTourist = touristData.reduce((sum, val) => sum + val, 0);
    const totalAgency = agencyData.reduce((sum, val) => sum + val, 0);
    const totalRevenue = totalTourist + totalAgency;

    return { chartLabels, touristData, agencyData, totalTourist, totalAgency, totalRevenue };
  }, [bookings, userRoles, chartViewBy, selectedMonth, selectedMonthYear, selectedYear, getUserRoleFromBooking]);

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };


  // Chart configuration với 2 đường: Tourist và Agency
  const chartConfig = useMemo(() => ({
    labels: revenueChartData.chartLabels,
    datasets: [
      {
        label: 'Doanh thu từ Tourist',
        data: revenueChartData.touristData,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      },
      {
        label: 'Doanh thu từ Agency',
        data: revenueChartData.agencyData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  }), [revenueChartData]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          font: { size: 12, weight: '600' as const },
          color: '#1e293b',
          padding: 15,
          usePointStyle: true
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: ${formatPrice(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: true, color: 'rgba(0, 0, 0, 0.05)' },
        ticks: { font: { size: 11 }, color: '#64748b', maxRotation: 45 }
      },
      y: {
        beginAtZero: true,
        grid: { display: true, color: 'rgba(0, 0, 0, 0.05)' },
        ticks: {
          font: { size: 11 },
          color: '#64748b',
          callback: function(value: any) {
            return new Intl.NumberFormat('vi-VN', { 
              style: 'currency', currency: 'VND', notation: 'compact', maximumFractionDigits: 1
            }).format(value);
          }
        }
      }
    },
    interaction: { intersect: false, mode: 'index' as const }
  }), []);

  return (
    <div className="revenue-mgr-revenue-management">
      <div className="revenue-mgr-revenue-content">
        {/* Revenue Summary Cards */}
        <div className="revenue-mgr-summary-cards">
          <div className="revenue-mgr-summary-card total">
            <h4>Tổng doanh thu</h4>
            <p className="revenue-mgr-amount">{formatPrice(revenueChartData.totalRevenue)}</p>
            <span className="revenue-mgr-note">
              {chartViewBy === 'month' ? `Tháng ${selectedMonth}/${selectedMonthYear}` : `Năm ${selectedYear}`}
            </span>
          </div>
          <div className="revenue-mgr-summary-card tourist">
            <h4>Từ Tourist</h4>
            <p className="revenue-mgr-amount">{formatPrice(revenueChartData.totalTourist)}</p>
            <span className="revenue-mgr-note">
              {revenueChartData.totalRevenue > 0 
                ? `${((revenueChartData.totalTourist / revenueChartData.totalRevenue) * 100).toFixed(1)}%` : '0%'}
            </span>
          </div>
          <div className="revenue-mgr-summary-card agency">
            <h4>Từ Agency</h4>
            <p className="revenue-mgr-amount">{formatPrice(revenueChartData.totalAgency)}</p>
            <span className="revenue-mgr-note">
              {revenueChartData.totalRevenue > 0 
                ? `${((revenueChartData.totalAgency / revenueChartData.totalRevenue) * 100).toFixed(1)}%` : '0%'}
            </span>
          </div>
        </div>

        {/* Revenue Chart Section */}
        <div className="revenue-mgr-revenue-chart-section">
          <div className="revenue-mgr-revenue-chart-container">
            <div className="revenue-mgr-revenue-date-filter">
              <div className="revenue-mgr-revenue-date-filter-group">
                <label className="revenue-mgr-revenue-filter-label">Xem theo</label>
                <select
                  className="revenue-mgr-revenue-filter-select"
                  value={chartViewBy}
                  onChange={(e) => {
                    setChartViewBy(e.target.value);
                    if (e.target.value === 'month') {
                      const now = new Date();
                      setSelectedMonth(String(now.getMonth() + 1));
                      setSelectedMonthYear(now.getFullYear().toString());
                    } else {
                      setSelectedYear(new Date().getFullYear().toString());
                    }
                  }}
                >
                  <option value="month">Theo tháng</option>
                  <option value="year">Theo năm</option>
                </select>
              </div>
              {chartViewBy === 'month' ? (
                <>
                  <div className="revenue-mgr-revenue-date-filter-group">
                    <label className="revenue-mgr-revenue-filter-label">Tháng</label>
                    <select
                      className="revenue-mgr-revenue-filter-select"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                    >
                      {[...Array(12)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>
                      ))}
                    </select>
                  </div>
                  <div className="revenue-mgr-revenue-date-filter-group">
                    <label className="revenue-mgr-revenue-filter-label">Năm</label>
                    <input
                      type="number"
                      className="revenue-mgr-revenue-filter-date"
                      min="2020"
                      max={new Date().getFullYear()}
                      value={selectedMonthYear}
                      onChange={(e) => setSelectedMonthYear(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="revenue-mgr-revenue-date-filter-group">
                  <label className="revenue-mgr-revenue-filter-label">Chọn năm</label>
                  <input
                    type="number"
                    className="revenue-mgr-revenue-filter-date"
                    min="2020"
                    max={new Date().getFullYear()}
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="revenue-mgr-revenue-chart-wrapper">
              <Line 
                key={`chart-${chartViewBy}-${chartViewBy === 'month' ? `${selectedMonthYear}-${selectedMonth}` : selectedYear}`}
                data={chartConfig} 
                options={chartOptions} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RevenueManagement;
