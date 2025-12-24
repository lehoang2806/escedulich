import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import LoadingSpinner from '../LoadingSpinner';
import { CalendarIcon, UserIcon } from '../icons/index';
import BookingConfirmationModal from './BookingConfirmationModal';
import { formatPrice, getImageUrl } from '~/lib/utils';
import axiosInstance from '~/utils/axiosInstance';
import { API_ENDPOINTS } from '~/config/api';
import { useNotification } from '~/contexts/NotificationContext';
import './BookingManagement.css';

interface BookingManagementProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

// Interface cho parsed booking info từ Notes
interface ParsedBookingInfo {
  additionalServices: { id: number; quantity: number; name?: string }[];
  couponCode: string | null;
  complementaryServices: { ids: number[]; names: string[] };
  startTime: string | null;
  startDate: string | null; // Ngày đi
  endDate: string | null; // Ngày kết thúc (nếu đi nhiều ngày)
  cleanNotes: string;
  // Thông tin hủy booking
  cancelReasonCustomer: string | null; // Lý do hủy từ khách hàng
  cancelReasonHost: string | null; // Lý do từ chối từ host
  cancelBy: string | null; // Người hủy
  cancelTime: string | null; // Thời gian hủy
  // Thành tiền (số tiền thực tế sau khi áp dụng coupon và Agency discount)
  finalAmount: number | null;
}

// Helper function để parse Notes và lấy thông tin chi tiết
const parseBookingNotes = (notes: string | null | undefined): ParsedBookingInfo => {
  const result: ParsedBookingInfo = {
    additionalServices: [],
    couponCode: null,
    complementaryServices: { ids: [], names: [] },
    startTime: null,
    startDate: null,
    endDate: null,
    cleanNotes: '',
    cancelReasonCustomer: null,
    cancelReasonHost: null,
    cancelBy: null,
    cancelTime: null,
    finalAmount: null
  };

  if (!notes) return result;

  let cleanNotes = notes;

  // Parse [ADDITIONAL_SERVICES:id:qty,id:qty,...]
  const additionalMatch = notes.match(/\[ADDITIONAL_SERVICES:([^\]]+)\]/);
  if (additionalMatch) {
    const servicesStr = additionalMatch[1];
    servicesStr.split(',').forEach(item => {
      const [idStr, qtyStr] = item.split(':');
      const id = parseInt(idStr);
      const quantity = parseInt(qtyStr) || 1;
      if (!isNaN(id) && id > 0) {
        result.additionalServices.push({ id, quantity });
      }
    });
    cleanNotes = cleanNotes.replace(/\[ADDITIONAL_SERVICES:[^\]]+\]/, '');
  }

  // Parse [COUPON_CODE:xxx]
  const couponMatch = notes.match(/\[COUPON_CODE:([^\]]+)\]/);
  if (couponMatch) {
    result.couponCode = couponMatch[1];
    cleanNotes = cleanNotes.replace(/\[COUPON_CODE:[^\]]+\]/, '');
  }

  // Parse [COMPLEMENTARY_SERVICES_IDS:id,id,...]
  const compMatch = notes.match(/\[COMPLEMENTARY_SERVICES_IDS:([^\]]+)\]/);
  if (compMatch) {
    result.complementaryServices.ids = compMatch[1].split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
    cleanNotes = cleanNotes.replace(/\[COMPLEMENTARY_SERVICES_IDS:[^\]]+\]/, '');
  }

  // Parse complementary service names from text
  const compNamesMatch = notes.match(/🎁 Đơn đặt dịch vụ này sẽ được tặng kèm các dịch vụ: ([^\n]+)/);
  if (compNamesMatch) {
    result.complementaryServices.names = compNamesMatch[1].split(', ').map(n => n.trim()).filter(n => n);
    cleanNotes = cleanNotes.replace(/🎁 Đơn đặt dịch vụ này sẽ được tặng kèm các dịch vụ: [^\n]+/, '');
  }

  // Parse additional service names from text
  const additionalNamesMatch = notes.match(/Dịch vụ thêm đã chọn: ([^\n\[]+)/);
  if (additionalNamesMatch && result.additionalServices.length > 0) {
    const names = additionalNamesMatch[1].split(', ').map(n => n.trim()).filter(n => n);
    names.forEach((name, idx) => {
      if (result.additionalServices[idx]) {
        result.additionalServices[idx].name = name;
      }
    });
    cleanNotes = cleanNotes.replace(/Dịch vụ thêm đã chọn: [^\n\[]+/, '');
  }

  // Parse start time
  const timeMatch = notes.match(/Thời gian bắt đầu: (\d{1,2}:\d{2})/);
  if (timeMatch) {
    result.startTime = timeMatch[1];
    cleanNotes = cleanNotes.replace(/Thời gian bắt đầu: \d{1,2}:\d{2}/, '');
  }

  // Parse start date [START_DATE:YYYY-MM-DD]
  const startDateMatch = notes.match(/\[START_DATE:([^\]]+)\]/);
  if (startDateMatch) {
    result.startDate = startDateMatch[1];
    cleanNotes = cleanNotes.replace(/\[START_DATE:[^\]]+\]/, '');
  }

  // Parse end date [END_DATE:YYYY-MM-DD]
  const endDateMatch = notes.match(/\[END_DATE:([^\]]+)\]/);
  if (endDateMatch) {
    result.endDate = endDateMatch[1];
    cleanNotes = cleanNotes.replace(/\[END_DATE:[^\]]+\]/, '');
  }

  // Parse cancel reason from customer [CANCEL_REASON_CUSTOMER:...]
  const cancelCustomerMatch = notes.match(/\[CANCEL_REASON_CUSTOMER:([^\]]+)\]/);
  if (cancelCustomerMatch) {
    result.cancelReasonCustomer = cancelCustomerMatch[1];
    cleanNotes = cleanNotes.replace(/\[CANCEL_REASON_CUSTOMER:[^\]]+\]/, '');
  }

  // Parse cancel reason from host [CANCEL_REASON_HOST:...]
  const cancelHostMatch = notes.match(/\[CANCEL_REASON_HOST:([^\]]+)\]/);
  if (cancelHostMatch) {
    result.cancelReasonHost = cancelHostMatch[1];
    cleanNotes = cleanNotes.replace(/\[CANCEL_REASON_HOST:[^\]]+\]/, '');
  }

  // Parse cancel by [CANCEL_BY:...]
  const cancelByMatch = notes.match(/\[CANCEL_BY:([^\]]+)\]/);
  if (cancelByMatch) {
    result.cancelBy = cancelByMatch[1];
    cleanNotes = cleanNotes.replace(/\[CANCEL_BY:[^\]]+\]/, '');
  }

  // Parse cancel time [CANCEL_TIME:...]
  const cancelTimeMatch = notes.match(/\[CANCEL_TIME:([^\]]+)\]/);
  if (cancelTimeMatch) {
    result.cancelTime = cancelTimeMatch[1];
    cleanNotes = cleanNotes.replace(/\[CANCEL_TIME:[^\]]+\]/, '');
  }

  // Parse final amount [FINAL_AMOUNT:xxx] - thành tiền thực tế
  const finalAmountMatch = notes.match(/\[FINAL_AMOUNT:(\d+)\]/);
  if (finalAmountMatch) {
    result.finalAmount = parseInt(finalAmountMatch[1]);
    cleanNotes = cleanNotes.replace(/\[FINAL_AMOUNT:\d+\]/, '');
  }

  // Clean up extra newlines and whitespace
  result.cleanNotes = cleanNotes.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

const BookingManagement: React.FC<BookingManagementProps> = ({ onSuccess, onError }) => {
  // SignalR connection để lắng nghe notification real-time
  const { connection, isConnected } = useNotification();
  
  // Bookings state
  const [bookings, setBookings] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingStatusFilter, setBookingStatusFilter] = useState('all');
  const [bookingServiceNameFilter, setBookingServiceNameFilter] = useState('');
  const [bookingUserNameFilter, setBookingUserNameFilter] = useState('');
  const [bookingSortOrder, setBookingSortOrder] = useState('newest');
  const [bookingCurrentPage, setBookingCurrentPage] = useState(1);
  const [bookingPageInput, setBookingPageInput] = useState('');
  const [bookingItemsPerPage] = useState(5);
  
  // Booking Modal states
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingModalData, setBookingModalData] = useState({ bookingId: null, action: '', notes: '' });
  
  // Booking Detail Modal states
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [selectedBookingPayment, setSelectedBookingPayment] = useState<any>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  
  // User Card Popup states
  const [showUserCard, setShowUserCard] = useState(false);
  const [selectedUserForCard, setSelectedUserForCard] = useState<any>(null);
  const [userCardPosition, setUserCardPosition] = useState({ x: 0, y: 0 });
  
  // Payment info cache for all bookings (bookingId -> payment)
  const [bookingPayments, setBookingPayments] = useState<Record<number, any>>({});
  
  // User roles cache (userId -> roleName)
  const [userRoles, setUserRoles] = useState<Record<number, string>>({});

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

  // Load bookings from API
  useEffect(() => {
    const loadBookings = async () => {
      console.log('🚀 loadBookings started');
      const userId = getUserId();
      console.log('🚀 userId:', userId);
      if (!userId) {
        setLoadingBookings(false);
        setBookings([]);
        return;
      }

      try {
        setLoadingBookings(true);
        // Get bookings for host's service combos
        // First get all service combos for this host, then get bookings for those combos
        const serviceCombosResponse = await axiosInstance.get(`${API_ENDPOINTS.SERVICE_COMBO}/host/${userId}`);
        const serviceCombos = serviceCombosResponse.data || [];
        console.log('🚀 serviceCombos:', serviceCombos.length);
        const comboIds = serviceCombos.map((c: any) => c.Id || c.id).filter((id: any) => id);
        
        // Get bookings for each service combo
        const allBookings: any[] = [];
        for (const comboId of comboIds) {
          try {
            const bookingsResponse = await axiosInstance.get(`${API_ENDPOINTS.BOOKING}/combo/${comboId}`);
            const comboBookings = bookingsResponse.data || [];
            allBookings.push(...comboBookings);
          } catch (err) {
            // Ignore 404 for combos without bookings
            if ((err as any)?.response?.status !== 404) {
              console.error(`Error loading bookings for combo ${comboId}:`, err);
            }
          }
        }
        
        setBookings(allBookings);
        
        // Load payment info for all bookings
        const paymentsMap: Record<number, any> = {};
        await Promise.all(
          allBookings.map(async (booking: any) => {
            const bId = booking.Id || booking.id;
            if (bId) {
              try {
                const paymentRes = await axiosInstance.get(`${API_ENDPOINTS.PAYMENT}/status/${bId}`);
                if (paymentRes.data) {
                  paymentsMap[bId] = paymentRes.data;
                }
              } catch {
                // No payment found, ignore
              }
            }
          })
        );
        setBookingPayments(paymentsMap);
        
        // Load user roles for all unique users
        const uniqueUserIds = [...new Set(allBookings.map((b: any) => b.UserId || b.userId).filter((id: any) => id))];
        const rolesMap: Record<number, string> = {};
        await Promise.all(
          uniqueUserIds.map(async (userId: number) => {
            try {
              const userRes = await axiosInstance.get(`${API_ENDPOINTS.USER}/${userId}`);
              if (userRes.data) {
                const role = userRes.data.Role?.Name || userRes.data.role?.name || userRes.data.RoleName || userRes.data.roleName || '';
                rolesMap[userId] = role;
              }
            } catch {
              // User not found, ignore
            }
          })
        );
        setUserRoles(rolesMap);
      } catch (err) {
        console.error('Error loading bookings:', err);
        if (onError) {
          onError('Không thể tải danh sách booking. Vui lòng thử lại.');
        }
        setBookings([]);
      } finally {
        setLoadingBookings(false);
      }
    };

    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getUserId]); // Loại bỏ onError khỏi dependencies để tránh reload khi parent re-render

  // Auto-refresh bookings mỗi 30 giây để cập nhật đơn đặt hàng mới
  useEffect(() => {
    const silentRefresh = async () => {
      const userId = getUserId();
      if (!userId) return;

      try {
        // Get bookings for host's service combos
        const serviceCombosResponse = await axiosInstance.get(`${API_ENDPOINTS.SERVICE_COMBO}/host/${userId}`);
        const serviceCombos = serviceCombosResponse.data || [];
        const comboIds = serviceCombos.map((c: any) => c.Id || c.id).filter((id: any) => id);
        
        // Get bookings for each service combo
        const allBookings: any[] = [];
        for (const comboId of comboIds) {
          try {
            const bookingsResponse = await axiosInstance.get(`${API_ENDPOINTS.BOOKING}/combo/${comboId}`);
            const comboBookings = bookingsResponse.data || [];
            allBookings.push(...comboBookings);
          } catch (err) {
            // Ignore 404 for combos without bookings
            if ((err as any)?.response?.status !== 404) {
              console.error(`Error loading bookings for combo ${comboId}:`, err);
            }
          }
        }
        
        // Chỉ update nếu có thay đổi (so sánh số lượng booking)
        if (allBookings.length !== bookings.length || 
            JSON.stringify(allBookings.map(b => b.Id || b.id).sort()) !== JSON.stringify(bookings.map((b: any) => b.Id || b.id).sort())) {
          setBookings(allBookings);
          
          // Load payment info for new bookings
          const existingPaymentIds = Object.keys(bookingPayments).map(Number);
          const newBookingIds = allBookings
            .map((b: any) => b.Id || b.id)
            .filter((id: number) => id && !existingPaymentIds.includes(id));
          
          if (newBookingIds.length > 0) {
            const newPaymentsMap: Record<number, any> = { ...bookingPayments };
            await Promise.all(
              newBookingIds.map(async (bId: number) => {
                try {
                  const paymentRes = await axiosInstance.get(`${API_ENDPOINTS.PAYMENT}/status/${bId}`);
                  if (paymentRes.data) {
                    newPaymentsMap[bId] = paymentRes.data;
                  }
                } catch {
                  // No payment found, ignore
                }
              })
            );
            setBookingPayments(newPaymentsMap);
          }
        }
      } catch (err) {
        console.error('Silent refresh bookings failed:', err);
      }
    };

    const intervalId = setInterval(silentRefresh, 10000); // 10 giây - refresh nhanh hơn để cập nhật đơn mới

    return () => clearInterval(intervalId);
  }, [getUserId, bookings, bookingPayments]);

  // Lắng nghe notification từ SignalR để refresh ngay khi có đơn đặt hàng mới
  useEffect(() => {
    if (!connection || !isConnected) return;

    const refreshBookingsData = async () => {
      const userId = getUserId();
      if (!userId) return;

      try {
        console.log('[BookingManagement] Refreshing bookings data...');
        const serviceCombosResponse = await axiosInstance.get(`${API_ENDPOINTS.SERVICE_COMBO}/host/${userId}`);
        const serviceCombos = serviceCombosResponse.data || [];
        const comboIds = serviceCombos.map((c: any) => c.Id || c.id).filter((id: any) => id);
        
        const allBookings: any[] = [];
        for (const comboId of comboIds) {
          try {
            const bookingsResponse = await axiosInstance.get(`${API_ENDPOINTS.BOOKING}/combo/${comboId}`);
            const comboBookings = bookingsResponse.data || [];
            allBookings.push(...comboBookings);
          } catch (err) {
            if ((err as any)?.response?.status !== 404) {
              console.error(`Error loading bookings for combo ${comboId}:`, err);
            }
          }
        }
        
        setBookings(allBookings);
        
        // Load payment info for new bookings
        const existingPaymentIds = Object.keys(bookingPayments).map(Number);
        const newBookingIds = allBookings
          .map((b: any) => b.Id || b.id)
          .filter((id: number) => id && !existingPaymentIds.includes(id));
        
        if (newBookingIds.length > 0) {
          const newPaymentsMap: Record<number, any> = { ...bookingPayments };
          await Promise.all(
            newBookingIds.map(async (bId: number) => {
              try {
                const paymentRes = await axiosInstance.get(`${API_ENDPOINTS.PAYMENT}/status/${bId}`);
                if (paymentRes.data) {
                  newPaymentsMap[bId] = paymentRes.data;
                }
              } catch {
                // No payment found, ignore
              }
            })
          );
          setBookingPayments(newPaymentsMap);
        }
        
        // Load user roles for new users
        const existingUserIds = Object.keys(userRoles).map(Number);
        const newUserIds = [...new Set(allBookings.map((b: any) => b.UserId || b.userId).filter((id: any) => id && !existingUserIds.includes(id)))];
        if (newUserIds.length > 0) {
          const newRolesMap: Record<number, string> = { ...userRoles };
          await Promise.all(
            newUserIds.map(async (uId: number) => {
              try {
                const userRes = await axiosInstance.get(`${API_ENDPOINTS.USER}/${uId}`);
                if (userRes.data) {
                  const role = userRes.data.Role?.Name || userRes.data.role?.name || userRes.data.RoleName || userRes.data.roleName || '';
                  newRolesMap[uId] = role;
                }
              } catch {
                // User not found, ignore
              }
            })
          );
          setUserRoles(newRolesMap);
        }
        
        console.log('[BookingManagement] Bookings refreshed, total:', allBookings.length);
      } catch (err) {
        console.error('Error refreshing bookings from notification:', err);
      }
    };

    const handleReceiveNotification = (notification: { Title?: string; Message?: string; Type?: string }) => {
      console.log('[BookingManagement] Received notification:', notification);
      // Kiểm tra nếu là notification về đơn đặt hàng mới - mở rộng điều kiện
      const title = (notification.Title || '').toLowerCase();
      const message = (notification.Message || '').toLowerCase();
      const type = (notification.Type || '').toLowerCase();
      
      const isBookingNotification = 
        title.includes('đặt dịch vụ') || 
        title.includes('booking') ||
        title.includes('đơn hàng') ||
        title.includes('đơn đặt') ||
        message.includes('đặt dịch vụ') ||
        message.includes('đơn đặt') ||
        message.includes('đơn hàng mới') ||
        type.includes('booking') ||
        type.includes('new_booking') ||
        type === 'booking_created';
        
      if (isBookingNotification) {
        console.log('[BookingManagement] Detected booking notification, refreshing...');
        refreshBookingsData();
      }
    };

    // Lắng nghe event NewBooking trực tiếp (nếu backend gửi)
    const handleNewBooking = (bookingData: any) => {
      console.log('[BookingManagement] Received NewBooking event:', bookingData);
      refreshBookingsData();
    };

    // Đăng ký listeners
    connection.on('ReceiveNotification', handleReceiveNotification);
    connection.on('NewBooking', handleNewBooking);
    connection.on('BookingCreated', handleNewBooking);

    // Cleanup khi unmount
    return () => {
      connection.off('ReceiveNotification', handleReceiveNotification);
      connection.off('NewBooking', handleNewBooking);
      connection.off('BookingCreated', handleNewBooking);
    };
  }, [connection, isConnected, getUserId, bookingPayments]);

  // Filter and sort bookings
  useEffect(() => {
    let filtered = [...bookings];

    // Filter by status
    if (bookingStatusFilter && bookingStatusFilter !== 'all') {
      filtered = filtered.filter(booking => {
        const status = (booking.Status || booking.status || '').toLowerCase();
        return status === bookingStatusFilter.toLowerCase();
      });
    }

    // Filter by service name
    if (bookingServiceNameFilter && bookingServiceNameFilter.trim() !== '') {
      filtered = filtered.filter(booking => {
        const serviceCombo = booking.ServiceCombo || booking.serviceCombo;
        const serviceName = serviceCombo?.Name || serviceCombo?.name || '';
        return serviceName.toLowerCase().includes(bookingServiceNameFilter.toLowerCase().trim());
      });
    }

    // Filter by user name
    if (bookingUserNameFilter && bookingUserNameFilter.trim() !== '') {
      filtered = filtered.filter(booking => {
        const user = booking.User || booking.user || {};
        const userName = user.Name || user.name || '';
        return userName.toLowerCase().includes(bookingUserNameFilter.toLowerCase().trim());
      });
    }

    // Sort by date
    filtered.sort((a, b) => {
      const dateA = new Date(a.BookingDate || a.bookingDate || 0);
      const dateB = new Date(b.BookingDate || b.bookingDate || 0);
      
      if (bookingSortOrder === 'newest') {
        return dateB.getTime() - dateA.getTime();
      } else {
        return dateA.getTime() - dateB.getTime();
      }
    });

    setFilteredBookings(filtered);
    setBookingCurrentPage(1);
    setBookingPageInput('');
  }, [bookings, bookingStatusFilter, bookingServiceNameFilter, bookingUserNameFilter, bookingSortOrder]);

  // Paginated bookings
  const paginatedBookings = useMemo(() => {
    const totalPages = Math.ceil(filteredBookings.length / bookingItemsPerPage);
    const startIndex = (bookingCurrentPage - 1) * bookingItemsPerPage;
    const endIndex = startIndex + bookingItemsPerPage;
    return filteredBookings.slice(startIndex, endIndex);
  }, [filteredBookings, bookingCurrentPage, bookingItemsPerPage]);

  const bookingTotalPages = Math.ceil(filteredBookings.length / bookingItemsPerPage);

  // Load payment info for selected booking
  const loadPaymentInfo = useCallback(async (bookingId: number) => {
    try {
      setLoadingPayment(true);
      // Gọi API để lấy payment status theo booking
      const response = await axiosInstance.get(`${API_ENDPOINTS.PAYMENT}/status/${bookingId}`);
      const payment = response.data;
      setSelectedBookingPayment(payment || null);
    } catch (err) {
      console.log('No payment found for booking:', bookingId);
      setSelectedBookingPayment(null);
    } finally {
      setLoadingPayment(false);
    }
  }, []);

  // Helper functions
  const formatBookingDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('vi-VN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount) => {
    if (amount == null) return '0 VNĐ';
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  // Get booking status display (Host view)
  const getBookingStatusDisplay = (status) => {
    const statusLower = (status || '').toLowerCase();
    switch (statusLower) {
      case 'pending':
        return { text: 'Đã xử lý', className: 'booking-mgr-status-pending' };
      case 'confirmed':
        return { text: 'Đã xác nhận', className: 'booking-mgr-status-confirmed' };
      case 'completed':
        return { text: 'Đã hoàn thành', className: 'booking-mgr-status-completed' };
      case 'cancelled':
        return { text: 'Đã hủy', className: 'booking-mgr-status-cancelled' };
      default:
        return { text: 'Đã xử lý', className: 'booking-mgr-status-pending' };
    }
  };

  // Booking handlers
  const handleAcceptBooking = (bookingId, currentNotes) => {
    setBookingModalData({
      bookingId: bookingId,
      action: 'accept',
      notes: currentNotes || ''
    });
    setShowBookingModal(true);
  };

  const handleRejectBooking = (bookingId, currentNotes) => {
    setBookingModalData({
      bookingId: bookingId,
      action: 'reject',
      notes: currentNotes || ''
    });
    setShowBookingModal(true);
  };

  const handleCompleteBooking = (bookingId, currentNotes) => {
    setBookingModalData({
      bookingId: bookingId,
      action: 'complete',
      notes: currentNotes || ''
    });
    setShowBookingModal(true);
  };

  const handleCloseBookingModal = () => {
    setShowBookingModal(false);
    setBookingModalData({ bookingId: null, action: '', notes: '' });
  };

  const handleConfirmBookingAction = async () => {
    const { bookingId, action, notes } = bookingModalData;
    
    let newStatus;
    let actionText;
    if (action === 'accept') {
      newStatus = 'confirmed';
      actionText = 'chấp nhận';
    } else if (action === 'reject') {
      newStatus = 'cancelled';
      actionText = 'từ chối';
      // Validate lý do từ chối
      if (!notes || notes.trim().length < 10) {
        if (onError) {
          onError('Vui lòng nhập lý do từ chối (ít nhất 10 ký tự)');
        }
        return;
      }
    } else if (action === 'complete') {
      newStatus = 'completed';
      actionText = 'hoàn thành';
    } else {
      if (onError) {
        onError('Hành động không hợp lệ');
      }
      return;
    }
    
    try {
      // Lấy thông tin booking hiện tại để cập nhật notes
      const currentBooking = bookings.find((b: any) => (b.Id || b.id) === bookingId);
      let updatedNotes = currentBooking?.Notes || currentBooking?.notes || '';
      
      // Nếu là reject, thêm lý do từ chối vào notes
      if (action === 'reject' && notes) {
        const hostName = (() => {
          try {
            const userInfoStr = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo');
            if (userInfoStr) {
              const userInfo = JSON.parse(userInfoStr);
              return userInfo.Name || userInfo.name || 'Host';
            }
          } catch { }
          return 'Host';
        })();
        const cancelTime = new Date().toLocaleString('vi-VN');
        const cancelNote = `[CANCEL_REASON_HOST:${notes.trim()}][CANCEL_BY:${hostName}][CANCEL_TIME:${cancelTime}]`;
        updatedNotes = updatedNotes ? `${updatedNotes}\n${cancelNote}` : cancelNote;
      }
      
      // Update booking status via API - dùng endpoint /status riêng
      await axiosInstance.put(`${API_ENDPOINTS.BOOKING}/${bookingId}/status`, newStatus, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // Lưu ý: Không thể cập nhật Notes trực tiếp vì backend không hỗ trợ PUT /api/Booking/{id}
      // Lý do từ chối sẽ được hiển thị trong thông báo
      
      // Gửi thông báo cho khách hàng nếu là reject
      if (action === 'reject' && currentBooking) {
        try {
          const customerId = currentBooking.UserId || currentBooking.userId;
          const serviceCombo = currentBooking.ServiceCombo || currentBooking.serviceCombo;
          const serviceName = serviceCombo?.Name || serviceCombo?.name || 'Dịch vụ';
          const bookingNumber = currentBooking.BookingNumber || currentBooking.bookingNumber || bookingId;
          const hostName = (() => {
            try {
              const userInfoStr = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo');
              if (userInfoStr) {
                const userInfo = JSON.parse(userInfoStr);
                return userInfo.Name || userInfo.name || 'Host';
              }
            } catch { }
            return 'Host';
          })();
          
          if (customerId) {
            await axiosInstance.post(`${API_ENDPOINTS.NOTIFICATION}`, {
              UserId: customerId,
              Title: 'Booking đã bị từ chối',
              Message: `Host ${hostName} đã từ chối đơn đặt dịch vụ "${serviceName}" (Mã booking: ${bookingNumber}). Lý do: ${notes.trim()}`,
              Type: 'booking_rejected',
              IsRead: false
            });
            console.log('✅ Đã gửi thông báo từ chối booking cho khách hàng:', customerId);
          }
        } catch (notifErr) {
          console.warn('Không thể gửi thông báo cho khách hàng:', notifErr);
        }
      }
      
      // Update local state
      setBookings(prevBookings => 
        prevBookings.map(booking => {
          const id = booking.Id || booking.id;
          if (id === bookingId) {
            return {
              ...booking,
              Status: newStatus,
              status: newStatus,
              Notes: updatedNotes || booking.Notes || booking.notes || '',
              notes: updatedNotes || booking.Notes || booking.notes || ''
            };
          }
          return booking;
        })
      );
      
      if (onSuccess) {
        onSuccess(`Đã ${actionText} booking thành công!`);
      }
      handleCloseBookingModal();
    } catch (err) {
      console.error('Error updating booking:', err);
      if (onError) {
        onError(`Có lỗi xảy ra khi ${actionText} booking. Vui lòng thử lại.`);
      }
    }
  };

  return (
    <div className="booking-mgr-booking-management">
      {loadingBookings ? (
        <LoadingSpinner message="Đang tải danh sách booking..." />
      ) : (
        <>
          {/* Filters */}
          <div className="booking-mgr-booking-filter-container">
            <div className="booking-mgr-filter-row">
              <div className="booking-mgr-filter-group">
                <label htmlFor="booking-status-filter" className="booking-mgr-filter-label">Trạng thái</label>
                <select 
                  id="booking-status-filter"
                  className="booking-mgr-filter-select"
                  value={bookingStatusFilter}
                  onChange={(e) => {
                    setBookingStatusFilter(e.target.value);
                    setBookingCurrentPage(1);
                    setBookingPageInput('');
                  }}
                >
                  <option value="all">Tất cả</option>
                  <option value="pending">Đã xử lý</option>
                  <option value="confirmed">Đã xác nhận</option>
                  <option value="completed">Đã hoàn thành</option>
                  <option value="cancelled">Đã hủy</option>
                </select>
              </div>

              <div className="booking-mgr-filter-group">
                <label htmlFor="booking-service-name-filter" className="booking-mgr-filter-label">Tên dịch vụ</label>
                <input
                  type="text"
                  id="booking-service-name-filter"
                  className="booking-mgr-filter-select"
                  value={bookingServiceNameFilter}
                  onChange={(e) => {
                    setBookingServiceNameFilter(e.target.value);
                    setBookingCurrentPage(1);
                    setBookingPageInput('');
                  }}
                  placeholder="Tìm theo tên dịch vụ..."
                  style={{ minWidth: '200px' }}
                />
              </div>

              <div className="booking-mgr-filter-group">
                <label htmlFor="booking-user-name-filter" className="booking-mgr-filter-label">Tên người dùng</label>
                <input
                  type="text"
                  id="booking-user-name-filter"
                  className="booking-mgr-filter-select"
                  value={bookingUserNameFilter}
                  onChange={(e) => {
                    setBookingUserNameFilter(e.target.value);
                    setBookingCurrentPage(1);
                    setBookingPageInput('');
                  }}
                  placeholder="Tìm theo tên người dùng..."
                  style={{ minWidth: '200px' }}
                />
              </div>

              <div className="booking-mgr-filter-group">
                <label htmlFor="booking-sort-order" className="booking-mgr-filter-label">Sắp xếp</label>
                <select 
                  id="booking-sort-order"
                  className="booking-mgr-filter-select"
                  value={bookingSortOrder}
                  onChange={(e) => {
                    setBookingSortOrder(e.target.value);
                    setBookingCurrentPage(1);
                    setBookingPageInput('');
                  }}
                >
                  <option value="newest">Mới nhất</option>
                  <option value="oldest">Cũ nhất</option>
                </select>
              </div>
            </div>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="booking-mgr-empty-state">
              <CalendarIcon className="booking-mgr-empty-state-icon" />
              <h3>Không có booking nào</h3>
              <p>Bạn chưa có booking nào.</p>
            </div>
          ) : (
            <div className="booking-mgr-bookings-list">
              {paginatedBookings.map((booking) => {
                const statusDisplay = getBookingStatusDisplay(booking.Status || booking.status);
                const bookingId = booking.Id || booking.id;
                const serviceCombo = booking.ServiceCombo || booking.serviceCombo;
                const serviceName = serviceCombo?.Name || serviceCombo?.name || 'Dịch vụ';
                // Xử lý trường hợp có nhiều ảnh phân cách bởi dấu phẩy - lấy ảnh đầu tiên
                let imagePath = serviceCombo?.Image || serviceCombo?.image || '';
                if (imagePath && typeof imagePath === 'string' && imagePath.includes(',')) {
                  imagePath = imagePath.split(',')[0].trim();
                }
                const serviceImage = getImageUrl(imagePath, '/img/banahills.jpg');
                const bookingDate = booking.BookingDate || booking.bookingDate;
                const quantity = booking.Quantity || booking.quantity || 0;
                const totalAmount = booking.TotalAmount || booking.totalAmount || 0;
                const rawNotes = booking.Notes || booking.notes || '';
                // Parse notes để lấy cleanNotes (không có các tag) và ngày đi
                const parsedNotes = parseBookingNotes(rawNotes);
                const displayNotes = parsedNotes.cleanNotes || 'Không có ghi chú';
                const startDate = parsedNotes.startDate;
                const endDate = parsedNotes.endDate;
                const status = (booking.Status || booking.status || '').toLowerCase();
                const user = booking.User || booking.user || {};
                const userName = user.FullName || user.fullName || user.Name || user.name || 'N/A';
                const isPending = status === 'pending';
                const isConfirmed = status === 'confirmed';
                
                // Lấy Payment.Amount - số tiền thực tế (thành tiền)
                const paymentInfo = bookingPayments[bookingId] || bookingPayments[String(bookingId)];
                // Ưu tiên: 1. Payment.Amount (nếu đã thanh toán), 2. finalAmount từ Notes, 3. totalAmount (fallback)
                const displayAmount = paymentInfo?.Amount ?? paymentInfo?.amount ?? parsedNotes.finalAmount ?? totalAmount;
                
                return (
                  <div key={bookingId} className="booking-mgr-booking-card ui-card">
                    <div className="booking-mgr-booking-card-content">
                      {/* Part 1: Main Info */}
                      <div className="booking-mgr-booking-card-main">
                        <div className="booking-mgr-booking-card-header">
                          <div className="booking-mgr-booking-card-left">
                            <div className="booking-mgr-booking-image">
                              <img
                                src={serviceImage}
                                alt={serviceName}
                                className="booking-mgr-booking-image-img"
                                onError={(e) => {
                                  e.currentTarget.src = '/img/banahills.jpg';
                                }}
                              />
                            </div>
                            <div className="booking-mgr-booking-info">
                              <div className="booking-mgr-booking-title-row">
                                <h3 className="booking-mgr-booking-service-name">{serviceName}</h3>
                                <Badge className={`booking-mgr-status-badge ${statusDisplay.className}`}>
                                  {statusDisplay.text}
                                </Badge>
                              </div>
                              <div className="booking-mgr-booking-details">
                                <div className="booking-mgr-booking-detail-item">
                                  <span className="booking-mgr-booking-info-label">Người đặt:</span>
                                  <span 
                                    className="booking-mgr-booking-info-value booking-mgr-user-name-clickable"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setUserCardPosition({ x: rect.left, y: rect.bottom + 8 });
                                      setSelectedUserForCard(user);
                                      setShowUserCard(true);
                                    }}
                                    title="Click để xem thông tin người đặt"
                                  >
                                    {userName}
                                  </span>
                                </div>
                                {bookingDate && (
                                  <div className="booking-mgr-booking-detail-item">
                                    <CalendarIcon className="booking-mgr-detail-icon" />
                                    <span>Ngày đặt: {formatBookingDate(bookingDate)}</span>
                                  </div>
                                )}
                                {startDate && (
                                  <div className="booking-mgr-booking-detail-item">
                                    <CalendarIcon className="booking-mgr-detail-icon" />
                                    <span style={{ color: '#059669', fontWeight: 500 }}>
                                      Ngày đi: {formatBookingDate(startDate)}
                                      {endDate && endDate !== startDate && ` - ${formatBookingDate(endDate)}`}
                                    </span>
                                  </div>
                                )}
                                {quantity > 0 && (
                                  <div className="booking-mgr-booking-detail-item">
                                    <UserIcon className="booking-mgr-detail-icon" />
                                    <span>Số người: {quantity}</span>
                                  </div>
                                )}
                                {displayAmount > 0 && (
                                  <div className="booking-mgr-booking-detail-item">
                                    <span className="booking-mgr-booking-price">
                                      Tổng tiền: {formatCurrency(displayAmount)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="booking-mgr-booking-card-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              className="btn-view-detail"
                              onClick={() => {
                                setSelectedBooking(booking);
                                setSelectedBookingPayment(null);
                                setShowDetailModal(true);
                                // Load payment info
                                loadPaymentInfo(bookingId);
                              }}
                            >
                              Xem chi tiết
                            </Button>
                            {isPending && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="btn-edit-service"
                                  onClick={() => handleAcceptBooking(bookingId, displayNotes)}
                                >
                                  Chấp nhận
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="cancel-booking-btn"
                                  onClick={() => handleRejectBooking(bookingId, displayNotes)}
                                >
                                  Từ chối
                                </Button>
                              </>
                            )}
                            {isConfirmed && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="btn-edit-service"
                                onClick={() => handleCompleteBooking(bookingId, displayNotes)}
                              >
                                Hoàn thành
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Part 2: Notes */}
                      <div className="booking-mgr-booking-card-notes">
                        <div className="booking-mgr-booking-notes">
                          <span className="booking-mgr-booking-info-label">Ghi chú:</span>
                          <span className="booking-mgr-booking-info-value">{displayNotes}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Pagination */}
              {bookingTotalPages > 1 && (
                <div className="booking-mgr-pagination">
                  <button
                    type="button"
                    className="booking-mgr-pagination-btn"
                    onClick={() => {
                      const newPage = Math.max(1, bookingCurrentPage - 1);
                      setBookingCurrentPage(newPage);
                      setBookingPageInput('');
                    }}
                    disabled={bookingCurrentPage === 1}
                  >
                    <span>←</span> Trước
                  </button>
                  
                  <div className="booking-mgr-pagination-controls">
                    <div className="booking-mgr-pagination-numbers">
                      {Array.from({ length: bookingTotalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          type="button"
                          className={`booking-mgr-pagination-number ${bookingCurrentPage === page ? 'booking-mgr-active' : ''}`}
                          onClick={() => {
                            setBookingCurrentPage(page);
                            setBookingPageInput('');
                          }}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Đến trang:</span>
                    <input
                      type="text"
                      value={bookingPageInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d+$/.test(value)) {
                          setBookingPageInput(value);
                          const pageNum = parseInt(value);
                          if (value !== '' && pageNum >= 1 && pageNum <= bookingTotalPages) {
                            setBookingCurrentPage(pageNum);
                            setBookingPageInput('');
                          }
                        }
                      }}
                      placeholder={bookingCurrentPage.toString()}
                      style={{
                        width: '60px',
                        padding: '0.375rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        textAlign: 'center'
                      }}
                      inputMode="numeric"
                    />
                  </div>
                  
                  <button
                    type="button"
                    className="booking-mgr-pagination-btn"
                    onClick={() => {
                      const newPage = Math.min(bookingTotalPages, bookingCurrentPage + 1);
                      setBookingCurrentPage(newPage);
                      setBookingPageInput('');
                    }}
                    disabled={bookingCurrentPage === bookingTotalPages}
                  >
                    Sau <span>→</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Booking Confirmation Modal */}
      <BookingConfirmationModal
        isOpen={showBookingModal}
        onClose={handleCloseBookingModal}
        modalData={bookingModalData}
        onConfirm={handleConfirmBookingAction}
        onModalDataChange={setBookingModalData}
      />

      {/* Booking Detail Modal */}
      {showDetailModal && selectedBooking && (() => {
        // Parse notes để lấy thông tin chi tiết
        const parsedInfo = parseBookingNotes(selectedBooking.Notes || selectedBooking.notes);
        const baseAmount = selectedBooking.TotalAmount || selectedBooking.totalAmount || 0;
        // Payment.Amount = thành tiền thực tế (sau khi áp coupon, giảm giá Agency)
        const paidAmount = selectedBookingPayment?.Amount ?? selectedBookingPayment?.amount ?? null;
        // Số tiền hiển thị: ưu tiên Payment.Amount, sau đó finalAmount từ Notes, cuối cùng là baseAmount
        const finalAmount = paidAmount ?? parsedInfo.finalAmount ?? baseAmount;
        
        // Kiểm tra nếu người đặt là Agency
        const selectedUserId = selectedBooking.UserId || selectedBooking.userId;
        const selectedUserRoleFromCache = selectedUserId ? userRoles[selectedUserId] : '';
        const selectedUserRoleFromBooking = selectedBooking.User?.Role?.Name || selectedBooking.User?.Role?.name || 
                                            selectedBooking.user?.role?.Name || selectedBooking.user?.role?.name || '';
        const selectedUserRole = selectedUserRoleFromCache || selectedUserRoleFromBooking;
        const isSelectedAgency = selectedUserRole.toLowerCase() === 'agency';
        
        return (
          <div className="booking-detail-modal-overlay" onClick={() => setShowDetailModal(false)}>
            <div className="booking-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="booking-detail-modal-header">
                <h2>Chi tiết đơn đặt hàng</h2>
                <button 
                  className="booking-detail-modal-close"
                  onClick={() => setShowDetailModal(false)}
                >
                  ×
                </button>
              </div>
              <div className="booking-detail-modal-content">
                {/* Service Info */}
                <div className="booking-detail-section">
                  <h3>Thông tin dịch vụ</h3>
                  <div className="booking-detail-service">
                    <img 
                      src={getImageUrl(
                        (selectedBooking.ServiceCombo?.Image || selectedBooking.serviceCombo?.image || '').split(',')[0]?.trim(),
                        '/img/banahills.jpg'
                      )}
                      alt="Service"
                      className="booking-detail-service-image"
                    />
                    <div className="booking-detail-service-info">
                      <h4>{selectedBooking.ServiceCombo?.Name || selectedBooking.serviceCombo?.name || 'Dịch vụ'}</h4>
                      <p>{selectedBooking.ServiceCombo?.Address || selectedBooking.serviceCombo?.address || ''}</p>
                    </div>
                  </div>
                </div>

                {/* Customer Info */}
                <div className="booking-detail-section">
                  <h3>Thông tin người đặt</h3>
                  <div className="booking-detail-grid">
                    <div className="booking-detail-item">
                      <span className="booking-detail-label">Họ tên:</span>
                      <span className="booking-detail-value">
                        {selectedBooking.User?.Name || selectedBooking.user?.name || selectedBooking.User?.FullName || selectedBooking.user?.fullName || 'N/A'}
                      </span>
                    </div>
                    <div className="booking-detail-item">
                      <span className="booking-detail-label">Email:</span>
                      <span className="booking-detail-value">
                        {selectedBooking.User?.Email || selectedBooking.user?.email || 'N/A'}
                      </span>
                    </div>
                    <div className="booking-detail-item">
                      <span className="booking-detail-label">Số điện thoại:</span>
                      <span className="booking-detail-value">
                        {selectedBooking.User?.Phone || selectedBooking.user?.phone || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Booking Info */}
                <div className="booking-detail-section">
                  <h3>Thông tin đặt hàng</h3>
                  <div className="booking-detail-grid">
                    <div className="booking-detail-item">
                      <span className="booking-detail-label">Mã đơn:</span>
                      <span className="booking-detail-value">
                        {selectedBooking.BookingNumber || selectedBooking.bookingNumber || `#${selectedBooking.Id || selectedBooking.id}`}
                      </span>
                    </div>
                    <div className="booking-detail-item">
                      <span className="booking-detail-label">Ngày đặt:</span>
                      <span className="booking-detail-value">
                        {formatBookingDate(selectedBooking.BookingDate || selectedBooking.bookingDate)}
                      </span>
                    </div>
                    {parsedInfo.startDate && (
                      <div className="booking-detail-item">
                        <span className="booking-detail-label">Ngày đi:</span>
                        <span className="booking-detail-value" style={{ color: '#059669', fontWeight: 600 }}>
                          {formatBookingDate(parsedInfo.startDate)}
                          {parsedInfo.endDate && parsedInfo.endDate !== parsedInfo.startDate && (
                            <> - {formatBookingDate(parsedInfo.endDate)}</>
                          )}
                        </span>
                      </div>
                    )}
                    {parsedInfo.startTime && (
                      <div className="booking-detail-item">
                        <span className="booking-detail-label">Thời gian bắt đầu:</span>
                        <span className="booking-detail-value">{parsedInfo.startTime}</span>
                      </div>
                    )}
                    <div className="booking-detail-item">
                      <span className="booking-detail-label">Số người:</span>
                      <span className="booking-detail-value">
                        {selectedBooking.Quantity || selectedBooking.quantity || 0}
                      </span>
                    </div>
                    <div className="booking-detail-item">
                      <span className="booking-detail-label">Trạng thái:</span>
                      <Badge className={`booking-mgr-status-badge ${getBookingStatusDisplay(selectedBooking.Status || selectedBooking.status).className}`}>
                        {getBookingStatusDisplay(selectedBooking.Status || selectedBooking.status).text}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Additional Services - Dịch vụ thêm */}
                {parsedInfo.additionalServices.length > 0 && (
                  <div className="booking-detail-section">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>🛒</span> Dịch vụ thêm đã chọn
                    </h3>
                    <div className="booking-detail-extras-list">
                      {parsedInfo.additionalServices.map((svc, idx) => (
                        <div key={idx} className="booking-detail-extra-item">
                          <span className="booking-detail-extra-name">
                            {svc.name || `Dịch vụ #${svc.id}`}
                          </span>
                          <span className="booking-detail-extra-qty">x{svc.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Complementary Services - Dịch vụ tặng kèm */}
                {parsedInfo.complementaryServices.names.length > 0 && (
                  <div className="booking-detail-section">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>🎁</span> Dịch vụ tặng kèm
                    </h3>
                    <div className="booking-detail-extras-list">
                      {parsedInfo.complementaryServices.names.map((name, idx) => (
                        <div key={idx} className="booking-detail-extra-item booking-detail-gift">
                          <span className="booking-detail-extra-name">{name}</span>
                          <Badge className="booking-detail-gift-badge">Miễn phí</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Coupon - Mã giảm giá */}
                {parsedInfo.couponCode && (
                  <div className="booking-detail-section">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>🏷️</span> Mã giảm giá
                    </h3>
                    <div className="booking-detail-coupon">
                      <Badge className="booking-detail-coupon-badge">{parsedInfo.couponCode}</Badge>
                    </div>
                  </div>
                )}

                {/* Payment Summary - Tóm tắt thanh toán */}
                <div className="booking-detail-section booking-detail-payment-section">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>💳</span> Tóm tắt thanh toán
                  </h3>
                  {loadingPayment ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>
                      Đang tải thông tin thanh toán...
                    </div>
                  ) : (() => {
                    // Giá gói dịch vụ
                    const unitPrice = selectedBooking.UnitPrice || selectedBooking.unitPrice || 0;
                    
                    // Tính số tiền giảm giá từ coupon (nếu có)
                    const couponDiscount = parsedInfo.couponCode && paidAmount !== null && paidAmount < baseAmount
                      ? baseAmount - paidAmount
                      : 0;
                    
                    return (
                      <div className="booking-detail-payment-summary">
                        <div className="booking-detail-payment-row">
                          <span>Giá gói dịch vụ:</span>
                          <span>{formatCurrency(unitPrice)}</span>
                        </div>
                        <div className="booking-detail-payment-row">
                          <span>Số lượng:</span>
                          <span>x{selectedBooking.Quantity || selectedBooking.quantity || 1}</span>
                        </div>
                        {isSelectedAgency && (
                          <div className="booking-detail-payment-row" style={{ color: '#059669' }}>
                            <span>Ưu đãi Agency (-3%):</span>
                            <span>Đã áp dụng</span>
                          </div>
                        )}
                        {parsedInfo.couponCode && couponDiscount > 0 && (
                          <div className="booking-detail-payment-row booking-detail-discount">
                            <span>Giảm giá ({parsedInfo.couponCode}):</span>
                            <span style={{ color: '#dc2626' }}>-{formatCurrency(couponDiscount)}</span>
                          </div>
                        )}
                        {parsedInfo.couponCode && couponDiscount === 0 && (
                          <div className="booking-detail-payment-row booking-detail-discount">
                            <span>Mã giảm giá ({parsedInfo.couponCode}):</span>
                            <span style={{ color: '#dc2626' }}>Đã áp dụng</span>
                          </div>
                        )}
                        <div className="booking-detail-payment-row booking-detail-payment-total">
                          <span>Tổng thanh toán:</span>
                          <span className="booking-detail-total-amount">
                            {formatCurrency(finalAmount)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Notes - Ghi chú */}
                {parsedInfo.cleanNotes && (
                  <div className="booking-detail-section">
                    <h3>Ghi chú từ khách hàng</h3>
                    <p className="booking-detail-notes">
                      {parsedInfo.cleanNotes}
                    </p>
                  </div>
                )}
              </div>
              <div className="booking-detail-modal-footer">
                <Button variant="outline" onClick={() => setShowDetailModal(false)}>
                  Đóng
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* User Card Popup - Hiển thị thông tin người đặt */}
      {showUserCard && selectedUserForCard && (
        <div 
          className="user-card-overlay"
          onClick={() => setShowUserCard(false)}
        >
          <div 
            className="user-card-popup"
            style={{
              position: 'fixed',
              left: Math.min(userCardPosition.x, window.innerWidth - 320),
              top: Math.min(userCardPosition.y, window.innerHeight - 300),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="user-card-header">
              <div className="user-card-avatar">
                <img 
                  src={getImageUrl(
                    selectedUserForCard.Avatar || selectedUserForCard.avatar,
                    '/img/default-avatar.png'
                  )}
                  alt="Avatar"
                  onError={(e) => {
                    e.currentTarget.src = '/img/default-avatar.png';
                  }}
                />
              </div>
              <div className="user-card-name-section">
                <h3 className="user-card-name">
                  {selectedUserForCard.FullName || selectedUserForCard.fullName || selectedUserForCard.Name || selectedUserForCard.name || 'N/A'}
                </h3>
              </div>
              <button 
                className="user-card-close"
                onClick={() => setShowUserCard(false)}
              >
                ×
              </button>
            </div>
            <div className="user-card-body">
              <div className="user-card-info-row">
                <span className="user-card-icon">📧</span>
                <span className="user-card-label">Email:</span>
                <span className="user-card-value">
                  {selectedUserForCard.Email || selectedUserForCard.email || 'Chưa cập nhật'}
                </span>
              </div>
              <div className="user-card-info-row">
                <span className="user-card-icon">📱</span>
                <span className="user-card-label">SĐT:</span>
                <span className="user-card-value">
                  {selectedUserForCard.PhoneNumber || selectedUserForCard.phoneNumber || selectedUserForCard.Phone || selectedUserForCard.phone || 'Chưa cập nhật'}
                </span>
              </div>
              {(selectedUserForCard.Role?.Name || selectedUserForCard.role?.name) && (
                <div className="user-card-info-row">
                  <span className="user-card-icon">👤</span>
                  <span className="user-card-label">Vai trò:</span>
                  <span className="user-card-value user-card-role">
                    {selectedUserForCard.Role?.Name || selectedUserForCard.role?.name}
                  </span>
                </div>
              )}
              {/* Nút gửi tin nhắn */}
              <button
                className="user-card-chat-btn"
                onClick={() => {
                  const userId = selectedUserForCard.Id || selectedUserForCard.id;
                  if (userId) {
                    setShowUserCard(false);
                    // Dispatch event để mở chat popup với user
                    const event = new CustomEvent('openChatWithUser', {
                      detail: { userId }
                    });
                    window.dispatchEvent(event);
                  }
                }}
              >
                <span className="user-card-chat-icon">💬</span>
                Gửi tin nhắn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingManagement;





