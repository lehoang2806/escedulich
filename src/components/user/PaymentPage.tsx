import React, { useState, useEffect, type ChangeEvent } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import axiosInstance from '~/utils/axiosInstance'
import Header from '~/components/user/Header'
import Button from '~/components/user/ui/Button'
import { Card, CardContent } from '~/components/user/ui/Card'
import LoadingSpinner from '~/components/user/LoadingSpinner'
import ComplementaryServices from '~/components/user/ComplementaryServices'
import { ArrowLeftIcon, CheckCircleIcon, AlertCircleIcon, CreditCardIcon } from '~/components/user/icons'
import { formatPrice } from '~/lib/utils'
import { API_ENDPOINTS } from '~/config/api'
import * as couponService from '~/services/couponService'
import type { MembershipTier } from '~/types/membership'
import './PaymentPage.css'

interface BookingData {
  Id?: number
  id?: number
  BookingNumber?: string
  bookingNumber?: string
  TotalAmount?: number
  totalAmount?: number
  UnitPrice?: number
  unitPrice?: number
  Status?: string
  status?: string
  StartDate?: string
  startDate?: string
  EndDate?: string
  endDate?: string
  BookingDate?: string
  bookingDate?: string
  Quantity?: number
  quantity?: number
  Notes?: string
  notes?: string
  ItemType?: string
  itemType?: string
  ServiceComboId?: number
  serviceComboId?: number
  ServiceCombo?: {
    Id?: number
    id?: number
    Name?: string
    name?: string
    Address?: string
    address?: string
    Description?: string
    description?: string
    Price?: number
    price?: number
    Image?: string
    image?: string
  }
  serviceCombo?: {
    Id?: number
    id?: number
    Name?: string
    name?: string
    Address?: string
    address?: string
    Description?: string
    description?: string
    Price?: number
    price?: number
    Image?: string
    image?: string
  }
  Service?: {
    Id?: number
    id?: number
    Name?: string
    name?: string
    Description?: string
    description?: string
    Price?: number
    price?: number
    Images?: string
    images?: string
  }
  service?: {
    Id?: number
    id?: number
    Name?: string
    name?: string
    Description?: string
    description?: string
    Price?: number
    price?: number
    Images?: string
    images?: string
  }
  User?: {
    Role?: {
      Name?: string
      name?: string
    }
    role?: {
      Name?: string
      name?: string
    }
  }
  user?: {
    Role?: {
      Name?: string
      name?: string
    }
    role?: {
      Name?: string
      name?: string
    }
  }
  BookingCoupons?: Array<{
    Coupon?: CouponData
    coupon?: CouponData
  }>
  bookingCoupons?: Array<{
    Coupon?: CouponData
    coupon?: CouponData
  }>
  [key: string]: unknown
}

interface CouponData {
  Code?: string
  code?: string
  Description?: string
  description?: string
  [key: string]: unknown
}

interface PaymentStatus {
  Status?: string
  status?: string
  Amount?: number
  amount?: number
  [key: string]: unknown
}

const PaymentPage = () => {
  const { bookingId } = useParams<{ bookingId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [booking, setBooking] = useState<BookingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null)

  // Coupon state (giữ lại để tương thích với backend hiện tại)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<CouponData | null>(null)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [originalTotal, setOriginalTotal] = useState(0)
  const [validatingCoupon, setValidatingCoupon] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [additionalServices, setAdditionalServices] = useState<Array<{ Name?: string; Description?: string; Price?: number; id?: number; quantity?: number }>>([])
  const [additionalServicesTotal, setAdditionalServicesTotal] = useState(0)
  
  // Complementary Services state
  const [userTier, setUserTier] = useState<MembershipTier>('none')
  const [selectedComplementaryServices, setSelectedComplementaryServices] = useState<number[]>([])

  // Lấy userTier từ user info
  useEffect(() => {
    try {
      const userInfoStr = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo');
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        // Lấy membership tier từ user info
        const tier = (userInfo.MembershipTier || userInfo.membershipTier || userInfo.tier) as MembershipTier;
        if (tier && ['silver', 'gold', 'diamond', 'none'].includes(tier)) {
          setUserTier(tier);
        } else {
          // Nếu không có tier trong userInfo, mặc định là 'none' (level 0)
          setUserTier('none');
        }
      } else {
        setUserTier('none');
      }
    } catch (error) {
      console.error('Error getting user tier:', error);
      setUserTier('none');
    }
  }, []);

  const estimateBaseAmount = (bookingData: BookingData | null): number => {
    if (!bookingData) return 0

    const serviceCombo = bookingData.ServiceCombo || bookingData.serviceCombo
    const rawPrice = serviceCombo?.Price ?? serviceCombo?.price
    const unitPrice = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice)) || 0

    const rawQuantity = bookingData.Quantity ?? bookingData.quantity ?? 0
    const quantity = typeof rawQuantity === 'number' ? rawQuantity : parseInt(String(rawQuantity), 10) || 0

    let baseAmount = unitPrice * quantity

    const roleName =
      (bookingData?.User?.Role?.Name ||
        bookingData?.User?.Role?.name ||
        bookingData?.user?.role?.Name ||
        bookingData?.user?.role?.name ||
        '') as string

    if (typeof roleName === 'string' && roleName.toLowerCase() === 'agency') {
      baseAmount *= 0.97
    }

    if (!baseAmount) {
      return (bookingData.TotalAmount || bookingData.totalAmount || 0) as number
    }

    return baseAmount
  }

  // Lấy returnUrl và returnTab từ location.state
  // Mặc định quay về trang booking của service combo đang xem
  const serviceComboId = booking?.ServiceComboId || booking?.serviceComboId
  const defaultReturnUrl = serviceComboId ? `/booking/${serviceComboId}` : '/services'
  const returnUrl = (location.state as { returnUrl?: string })?.returnUrl || defaultReturnUrl
  const returnTab = (location.state as { returnTab?: string })?.returnTab || null

  // Fetch booking data
  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingId || isNaN(parseInt(bookingId))) {
        setError('ID đặt dịch vụ không hợp lệ')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const response = await axiosInstance.get<BookingData>(`${API_ENDPOINTS.BOOKING}/${bookingId}`)
        console.log(' PaymentPage: Nhận được dữ liệu booking:', response.data)

        let bookingData = response.data
        if (!bookingData) {
          setError('Không tìm thấy thông tin đặt dịch vụ')
          return
        }

        // Fallback: Nếu không có ServiceCombo/Service trong response, fetch thêm
        const serviceComboId = bookingData.ServiceComboId || bookingData.serviceComboId
        const serviceId = bookingData.ServiceId || bookingData.serviceId
        
        if (!bookingData.ServiceCombo && !bookingData.serviceCombo && !bookingData.Service && !bookingData.service) {
          if (serviceComboId) {
            try {
              console.log(' PaymentPage: Fetch ServiceCombo vì không có trong response')
              const serviceComboResponse = await axiosInstance.get(`${API_ENDPOINTS.SERVICE_COMBO}/${serviceComboId}`)
              bookingData = {
                ...bookingData,
                ServiceCombo: serviceComboResponse.data
              }
            } catch (err) {
              console.warn(' PaymentPage: Không thể fetch ServiceCombo:', err)
            }
          } else if (serviceId) {
            try {
              console.log(' PaymentPage: Fetch Service vì không có trong response')
              const serviceResponse = await axiosInstance.get(`${API_ENDPOINTS.SERVICE}/${serviceId}`)
              bookingData = {
                ...bookingData,
                Service: serviceResponse.data
              }
            } catch (err) {
              console.warn(' PaymentPage: Không thể fetch Service:', err)
            }
          }
        }

        setBooking(bookingData)

        // Nếu vẫn không có ServiceCombo/Service sau khi fetch, thử fetch lại trong useEffect riêng
        // (để đảm bảo luôn có dữ liệu)

        // Parse Notes để lấy ghi chú và dịch vụ thêm
        // Format từ BookingPage: [ADDITIONAL_SERVICES:id:qty,id:qty,...]
        const notes = (bookingData.Notes || bookingData.notes || '') as string
        console.log(' PaymentPage: Notes raw:', notes)
        
        const additionalServicesMatch = notes.match(/\[ADDITIONAL_SERVICES:([^\]]+)\]/)
        console.log(' PaymentPage: additionalServicesMatch:', additionalServicesMatch)
        
        if (additionalServicesMatch) {
          // Parse format: id:qty,id:qty,...
          const serviceEntries = additionalServicesMatch[1].split(',').map(entry => {
            const [idStr, qtyStr] = entry.split(':')
            return {
              id: parseInt(idStr.trim()),
              quantity: parseInt(qtyStr?.trim() || '1')
            }
          }).filter(entry => !isNaN(entry.id) && entry.quantity > 0)
          
          console.log(' PaymentPage: serviceEntries:', serviceEntries)
          
          if (serviceEntries.length > 0) {
            try {
              // Fetch thông tin dịch vụ thêm
              const serviceComboId = bookingData.ServiceComboId || bookingData.serviceComboId
              console.log(' PaymentPage: Fetching services for combo:', serviceComboId)
              
              if (serviceComboId) {
                const comboDetailResponse = await axiosInstance.get(`${API_ENDPOINTS.SERVICE_COMBO_DETAIL}/combo/${serviceComboId}`)
                const comboDetails = comboDetailResponse.data || []
                console.log(' PaymentPage: comboDetails:', comboDetails)
                
                // Lọc các dịch vụ theo ID và lấy cả Price, kèm quantity từ notes
                const serviceIds = serviceEntries.map(e => e.id)
                console.log(' PaymentPage: Looking for serviceIds:', serviceIds)
                
                const services = comboDetails
                  .map((detail: any) => detail.Service || detail.service)
                  .filter((service: any) => {
                    if (!service) return false
                    const svcId = service.Id || service.id
                    const found = serviceIds.includes(svcId)
                    console.log(' PaymentPage: Checking service:', svcId, 'found:', found)
                    return found
                  })
                  .map((service: any) => {
                    const svcId = service.Id || service.id
                    const entry = serviceEntries.find(e => e.id === svcId)
                    return {
                      id: svcId,
                      Name: service.Name || service.name,
                      Description: service.Description || service.description,
                      Price: service.Price || service.price || 0,
                      quantity: entry?.quantity || 1
                    }
                  })
                
                console.log(' PaymentPage: Filtered services:', services)
                setAdditionalServices(services)
                
                // Tính tổng tiền dịch vụ thêm (dùng quantity riêng của mỗi service)
                const servicesTotal = services.reduce((sum: number, s: any) => sum + (s.Price || 0) * (s.quantity || 1), 0)
                console.log(' PaymentPage: servicesTotal:', servicesTotal)
                setAdditionalServicesTotal(servicesTotal)
              }
            } catch (err) {
              console.warn('Không thể lấy thông tin dịch vụ thêm:', err)
              setAdditionalServices([])
              setAdditionalServicesTotal(0)
            }
          } else {
            setAdditionalServices([])
            setAdditionalServicesTotal(0)
          }
        } else {
          setAdditionalServices([])
          setAdditionalServicesTotal(0)
        }
        
        // Tính giá gốc từ ServiceCombo.Price
        const serviceCombo = bookingData.ServiceCombo || bookingData.serviceCombo
        let rawPrice = serviceCombo?.Price ?? serviceCombo?.price
        let unitPrice = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice)) || 0
        const rawQuantity = bookingData.Quantity ?? bookingData.quantity ?? 0
        const quantity = typeof rawQuantity === 'number' ? rawQuantity : parseInt(String(rawQuantity), 10) || 0
        
        // Nếu không có giá từ ServiceCombo, fetch lại
        if (unitPrice === 0 && (bookingData.ServiceComboId || bookingData.serviceComboId)) {
          try {
            const comboId = bookingData.ServiceComboId || bookingData.serviceComboId
            const comboResponse = await axiosInstance.get(`${API_ENDPOINTS.SERVICE_COMBO}/${comboId}`)
            const comboData = comboResponse.data
            rawPrice = comboData?.Price ?? comboData?.price
            unitPrice = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice)) || 0
            console.log(' PaymentPage: Fetch ServiceCombo price:', unitPrice)
          } catch (err) {
            console.warn(' PaymentPage: Không thể fetch ServiceCombo price:', err)
          }
        }
        
        const originalPriceBeforeDiscount = unitPrice * quantity
        const bookingTotal = (bookingData.TotalAmount || bookingData.totalAmount || 0) as number
        
        // Parse coupon code từ Notes và tự tính discount ở frontend
        // Format từ BookingPage: [COUPON_CODE:xxx]
        const couponCodeMatch = notes.match(/\[COUPON_CODE:([^\]]+)\]/)
        let couponDiscountCalculated = 0
        
        // Luôn set originalTotal trước, dù có coupon hay không
        // Nếu có giá gốc từ ServiceCombo, dùng nó; nếu không, dùng bookingTotal
        const baseOriginalTotal = originalPriceBeforeDiscount > 0 ? originalPriceBeforeDiscount : bookingTotal
        setOriginalTotal(baseOriginalTotal)
        
        if (couponCodeMatch && couponCodeMatch[1]) {
          const savedCouponCode = couponCodeMatch[1].trim()
          setCouponCode(savedCouponCode)
          console.log(' PaymentPage: Tìm thấy coupon code trong Notes:', savedCouponCode)
          
          // Fetch coupon info để tính discount
          try {
            const couponResponse = await axiosInstance.post(`${API_ENDPOINTS.COUPON}/calculate-discount`, {
              Code: savedCouponCode,
              OriginalAmount: baseOriginalTotal
            })
            couponDiscountCalculated = couponResponse.data?.Discount || couponResponse.data?.discount || 0
            
            if (couponDiscountCalculated > 0) {
              setDiscountAmount(couponDiscountCalculated)
              setAppliedCoupon({ Code: savedCouponCode, code: savedCouponCode })
              console.log(' PaymentPage: Tính discount từ API:', {
                originalPrice: baseOriginalTotal,
                discount: couponDiscountCalculated
              })
            }
          } catch (couponErr) {
            console.warn(' PaymentPage: Không thể tính discount từ coupon:', couponErr)
            // Fallback: so sánh giá gốc với TotalAmount
            if (baseOriginalTotal > bookingTotal && bookingTotal > 0) {
              couponDiscountCalculated = baseOriginalTotal - bookingTotal
              setDiscountAmount(couponDiscountCalculated)
              setAppliedCoupon({ Code: savedCouponCode, code: savedCouponCode })
              console.log(' PaymentPage: Fallback discount:', couponDiscountCalculated)
            }
          }
        }
        
        // Debug log
        console.log(' PaymentPage: Tính toán giá:', {
          bookingTotal,
          serviceComboPrice: rawPrice,
          unitPrice,
          quantity,
          originalPriceBeforeDiscount,
          hasServiceCombo: !!serviceCombo,
          notes: notes.substring(0, 100)
        })

        const bookingCoupons = bookingData.BookingCoupons || bookingData.bookingCoupons || []
        
        // Kiểm tra xem đã có coupon từ Notes chưa (đã parse ở trên)
        const hasCouponFromNotes = notes.match(/\[COUPON_CODE:([^\]]+)\]/) !== null
        
        console.log(' PaymentPage: Coupon info:', {
          bookingCouponsLength: bookingCoupons.length,
          hasCouponFromNotes,
          couponCodeMatch: notes.match(/\[COUPON_CODE:([^\]]+)\]/)
        })
        
        if (bookingCoupons.length > 0) {
          const couponWrapper = bookingCoupons[0]
          const coupon = couponWrapper?.Coupon || couponWrapper?.coupon
          if (coupon) {
            setAppliedCoupon(coupon)
            setCouponCode((coupon.Code || coupon.code || '') as string)

            // Khi có coupon: originalTotal = giá gốc, discountAmount = giá gốc - giá đã giảm
            if (originalPriceBeforeDiscount > bookingTotal) {
              setOriginalTotal(originalPriceBeforeDiscount)
              setDiscountAmount(Math.max(0, originalPriceBeforeDiscount - bookingTotal))
              console.log(' PaymentPage: Set discount từ BookingCoupons:', originalPriceBeforeDiscount - bookingTotal)
            } else {
              const estimatedBaseTotal = estimateBaseAmount(bookingData)
              setOriginalTotal(estimatedBaseTotal)
              setDiscountAmount(Math.max(0, estimatedBaseTotal - bookingTotal))
              console.log(' PaymentPage: Set discount từ estimatedBaseTotal:', estimatedBaseTotal - bookingTotal)
            }
          }
        } else if (hasCouponFromNotes) {
          // Đã xử lý coupon từ Notes ở trên, không cần làm gì thêm
          console.log(' PaymentPage: Sử dụng coupon từ Notes')
        } else {
          // Không có coupon từ BookingCoupons hoặc Notes
          const roleName =
            (bookingData?.User?.Role?.Name ||
              bookingData?.User?.Role?.name ||
              bookingData?.user?.role?.Name ||
              bookingData?.user?.role?.name ||
              '') as string

          if (typeof roleName === 'string' && roleName.toLowerCase() === 'agency') {
            // Agency được giảm 3%, nên giá gốc = bookingTotal / 0.97
            const agencyDiscountRate = 0.97
            const originalPriceWithAgencyDiscount = bookingTotal / agencyDiscountRate
            setOriginalTotal(originalPriceWithAgencyDiscount)
            setDiscountAmount(Math.max(0, originalPriceWithAgencyDiscount - bookingTotal))
            console.log(' PaymentPage: Set discount cho Agency')
          } else {
            // Không có giảm giá
            setOriginalTotal(bookingTotal)
            setDiscountAmount(0)
          }
        }

        // Kiểm tra trạng thái thanh toán hiện tại (nếu có)
        // Không hiển thị lỗi nếu chưa có payment - đây là trường hợp bình thường
        try {
          console.log(` PaymentPage: Đang kiểm tra payment status cho bookingId=${bookingId}`)
          const paymentStatusResponse = await axiosInstance.get<PaymentStatus>(
            `${API_ENDPOINTS.PAYMENT}/status/${bookingId}`
          )
          console.log(' PaymentPage: Nhận được payment status:', paymentStatusResponse.data)
          if (paymentStatusResponse.data) {
            setPaymentStatus(paymentStatusResponse.data)
          }
        } catch (err: unknown) {
          const axiosError = err as { response?: { status?: number; data?: PaymentStatus } }
          // 200 với Status="pending" hoặc 404 là bình thường - chưa có payment nào
          // Chỉ log nếu không phải 200 hoặc 404
          if (axiosError.response?.status === 200 && axiosError.response?.data?.Status === 'pending') {
            // Backend trả về 200 với Status="pending" khi chưa có payment
            console.log('PaymentPage: Chưa có payment, status pending')
            if (axiosError.response.data) {
              setPaymentStatus(axiosError.response.data)
            }
          } else if (axiosError.response?.status !== 404 && axiosError.response?.status !== 200) {
            console.warn(' PaymentPage: Không thể kiểm tra trạng thái thanh toán:', {
              status: axiosError.response?.status,
              message: (axiosError.response?.data as { message?: string })?.message || (err as Error).message,
            })
          }
          // Không set error vì đây là trường hợp bình thường khi chưa thanh toán
        }
      } catch (err: unknown) {
        console.error(' Lỗi khi tải thông tin booking:', err)
        const axiosError = err as { response?: { status?: number } }
        if (axiosError.response?.status === 404) {
          setError('Không tìm thấy thông tin đặt dịch vụ')
        } else if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
          setError('Bạn không có quyền xem thông tin này. Vui lòng đăng nhập lại.')
          // Redirect ngay lập tức
          navigate('/login', { state: { returnUrl: `/payment/${bookingId}` }, replace: true })
        } else {
          setError('Không thể tải thông tin đặt dịch vụ. Vui lòng thử lại sau.')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchBooking()
  }, [bookingId, navigate])

  // Fetch ServiceCombo nếu booking đã có nhưng thiếu ServiceCombo/Service
  useEffect(() => {
    const fetchServiceComboIfNeeded = async () => {
      if (!booking) return

      const hasServiceCombo = !!(booking.ServiceCombo || booking.serviceCombo || booking.Service || booking.service)
      if (hasServiceCombo) return

      const serviceComboId = booking.ServiceComboId || booking.serviceComboId
      const serviceId = booking.ServiceId || booking.serviceId

      if (serviceComboId) {
        try {
          console.log(' PaymentPage: Fetch ServiceCombo trong useEffect vì thiếu trong booking')
          const serviceComboResponse = await axiosInstance.get(`${API_ENDPOINTS.SERVICE_COMBO}/${serviceComboId}`)
          setBooking(prev => ({
            ...prev!,
            ServiceCombo: serviceComboResponse.data
          }))
        } catch (err) {
          console.warn(' PaymentPage: Không thể fetch ServiceCombo trong useEffect:', err)
        }
      } else if (serviceId) {
        try {
          console.log(' PaymentPage: Fetch Service trong useEffect vì thiếu trong booking')
          const serviceResponse = await axiosInstance.get(`${API_ENDPOINTS.SERVICE}/${serviceId}`)
          setBooking(prev => ({
            ...prev!,
            Service: serviceResponse.data
          }))
        } catch (err) {
          console.warn(' PaymentPage: Không thể fetch Service trong useEffect:', err)
        }
      }
    }

    fetchServiceComboIfNeeded()
  }, [booking])

  // Coupon handlers
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('Vui lòng nhập mã giảm giá')
      return
    }

    if (!booking) {
      setCouponError('Chưa tải được thông tin booking')
      return
    }

    setValidatingCoupon(true)
    setCouponError('')

    try {
      const serviceComboId = (booking.ServiceComboId || booking.serviceComboId) as number | undefined
      if (!serviceComboId) {
        setCouponError('Không tìm thấy thông tin dịch vụ')
        return
      }

      // Validate coupon
      const validateResponse = await couponService.validateCoupon(couponCode.trim(), serviceComboId)

      if (!validateResponse.IsValid) {
        setCouponError('Mã giảm giá không hợp lệ')
        return
      }

      // Calculate discount với original total
      const currentTotal = (booking.TotalAmount || booking.totalAmount || 0) as number
      const discountResponse = await couponService.calculateDiscount(couponCode.trim(), currentTotal)
      const discount = discountResponse.Discount || 0

      if (discount <= 0) {
        setCouponError('Mã giảm giá không áp dụng được cho đơn hàng này')
        return
      }

      // Apply coupon
      const bookingIdValue = (booking.Id || booking.id) as number
      await couponService.applyCoupon(bookingIdValue, couponCode.trim())

      // Reload booking để lấy TotalAmount mới
      const updatedBookingResponse = await axiosInstance.get<BookingData>(
        `${API_ENDPOINTS.BOOKING}/${bookingIdValue}`
      )
      const updatedBooking = updatedBookingResponse.data
      const updatedTotal = (updatedBooking.TotalAmount || updatedBooking.totalAmount || 0) as number
      const previousTotal = currentTotal

      const bookingCoupons = updatedBooking.BookingCoupons || updatedBooking.bookingCoupons || []
      const latestCoupon =
        bookingCoupons.length > 0
          ? ((bookingCoupons[0].Coupon || bookingCoupons[0].coupon) as CouponData)
          : null

      setBooking(updatedBooking)
      setAppliedCoupon(latestCoupon)

      if (previousTotal > updatedTotal) {
        setOriginalTotal(previousTotal)
        setDiscountAmount(Math.max(0, previousTotal - updatedTotal))
      } else {
        setOriginalTotal(updatedTotal)
        setDiscountAmount(0)
      }
      setCouponError('')
    } catch (err: unknown) {
      console.error(' Error applying coupon:', err)
      const axiosError = err as {
        response?: { status?: number; data?: { message?: string } }
        message?: string
      }

      if (axiosError.response?.status === 404) {
        setCouponError('Mã giảm giá không tồn tại')
      } else if (axiosError.response?.status === 400) {
        const errorMessage = axiosError.response?.data?.message || 'Mã giảm giá không hợp lệ'
        setCouponError(errorMessage)
      } else if (axiosError.response?.data?.message) {
        setCouponError(axiosError.response.data.message)
      } else {
        setCouponError('Không thể áp dụng mã giảm giá. Vui lòng thử lại.')
      }
    } finally {
      setValidatingCoupon(false)
    }
  }

  const handleRemoveCoupon = async () => {
    if (!appliedCoupon || !booking) {
      return
    }

    try {
      const bookingIdValue = (booking.Id || booking.id) as number
      const couponCodeValue = (appliedCoupon.Code || appliedCoupon.code || '') as string
      await couponService.removeCoupon(bookingIdValue, couponCodeValue)

      // Reload booking để lấy TotalAmount gốc
      const updatedBookingResponse = await axiosInstance.get<BookingData>(
        `${API_ENDPOINTS.BOOKING}/${bookingIdValue}`
      )
      const updatedBooking = updatedBookingResponse.data
      setBooking(updatedBooking)

      setCouponCode('')
      setAppliedCoupon(null)
      setDiscountAmount(0)
      setOriginalTotal((updatedBooking.TotalAmount || updatedBooking.totalAmount || 0) as number)
      setCouponError('')
    } catch (err) {
      console.error(' Error removing coupon:', err)
      setCouponError('Không thể gỡ mã giảm giá. Vui lòng thử lại.')
    }
  }

  const handlePayment = async () => {
    if (!booking) {
      console.error(' PaymentPage.handlePayment: Booking không tồn tại')
      setError('Không tìm thấy thông tin đặt dịch vụ')
      return
    }

    setProcessing(true)
    setError(null)

    try {
      // Tạo payment intent
      const bookingIdValue = (booking.Id || booking.id) as number
      const totalAmount = (booking.TotalAmount || booking.totalAmount || 0) as number

      if (!bookingIdValue || totalAmount <= 0) {
        throw new Error('Thông tin đặt dịch vụ không hợp lệ')
      }

      // Tính số tiền thanh toán thực tế (đã trừ giảm giá + dịch vụ thêm)
      // Nếu có discount từ frontend, dùng: originalTotal - discountAmount + additionalServicesTotal
      // Nếu không, dùng: totalAmount + additionalServicesTotal
      const hasDiscountApplied = discountAmount > 0 && originalTotal > 0
      const paymentAmount = hasDiscountApplied 
        ? (originalTotal - discountAmount + additionalServicesTotal)
        : (totalAmount + additionalServicesTotal)
      
      console.log(' PaymentPage.handlePayment: Tính số tiền thanh toán:', {
        totalAmount,
        originalTotal,
        discountAmount,
        additionalServicesTotal,
        hasDiscountApplied,
        paymentAmount
      })
      
      if (paymentAmount <= 0) {
        throw new Error('Số tiền thanh toán phải lớn hơn 0')
      }

      // PayOS chỉ cho phép description tối đa 25 ký tự
      const description = 'Goi dich vu ESCE'
      
      const paymentRequest = {
        BookingId: bookingIdValue,
        Amount: paymentAmount,
        Description: description,
      }

      console.log(' PaymentPage.handlePayment: Tạo payment intent:', paymentRequest)
      console.log(`   Endpoint: ${API_ENDPOINTS.PAYMENT}/create-intent`)

      const response = await axiosInstance.post<{
        CheckoutUrl?: string
        checkoutUrl?: string
        data?: {
          checkoutUrl?: string
          CheckoutUrl?: string
        }
      }>(`${API_ENDPOINTS.PAYMENT}/create-intent`, paymentRequest)

      console.log(' PaymentPage.handlePayment: Payment intent tạo thành công:', response.data)

      // Thử nhiều cách để lấy checkoutUrl
      const checkoutUrl =
        response.data?.CheckoutUrl ||
        response.data?.checkoutUrl ||
        response.data?.data?.checkoutUrl ||
        response.data?.data?.CheckoutUrl

      if (!checkoutUrl) {
        console.error(' PaymentPage.handlePayment: Không tìm thấy checkoutUrl trong response:', response.data)
        throw new Error('Không nhận được URL thanh toán từ server. Vui lòng thử lại sau.')
      }

      console.log(` PaymentPage.handlePayment: Redirecting to checkout URL: ${checkoutUrl}`)
      // Chuyển hướng đến PayOS checkout
      window.location.href = checkoutUrl
    } catch (err: unknown) {
      console.error(' PaymentPage.handlePayment: Lỗi khi tạo payment intent:', err)
      const axiosError = err as {
        response?: {
          status?: number
          data?: {
            message?: string
            error?: string
            innerException?: string
          }
        }
        code?: string
        message?: string
      }

      // Xử lý các loại lỗi khác nhau
      if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
        const errorMsg = 'Bạn không có quyền thực hiện thanh toán. Vui lòng đăng nhập lại.'
        setError(errorMsg)
        console.log(' PaymentPage.handlePayment: Redirecting to login')
        // Redirect ngay lập tức
        navigate('/login', { state: { returnUrl: `/payment/${bookingId}` }, replace: true })
        return // Không set processing = false vì đang redirect
      } else if (axiosError.response?.status === 404) {
        setError('Không tìm thấy thông tin đặt dịch vụ. Vui lòng kiểm tra lại.')
      } else if (axiosError.response?.status === 500) {
        // Lỗi từ server - hiển thị message từ backend
        const errorData = axiosError.response?.data || {}
        let errorMessage =
          errorData.message ||
          errorData.error ||
          errorData.innerException ||
          'Đã xảy ra lỗi từ server. Vui lòng thử lại sau.'

        // Nếu là lỗi DNS, hiển thị thông báo chi tiết hơn
        if (
          errorData.error &&
          (errorData.error.includes('name is valid, but no data') ||
            errorData.error.includes('DNS') ||
            errorData.error.includes('resolve') ||
            errorData.error.includes('No such host'))
        ) {
          errorMessage =
            'Không thể kết nối đến PayOS do lỗi DNS. Vui lòng kiểm tra:\n\n' +
            '1. Kết nối internet\n' +
            '2. DNS server (thử đổi DNS sang 8.8.8.8 hoặc 1.1.1.1)\n' +
            '3. Firewall/Antivirus có chặn kết nối không\n' +
            '4. Proxy/VPN có ảnh hưởng không\n\n' +
            'Nếu vẫn không được, vui lòng liên hệ bộ phận hỗ trợ.'
        } else if (errorData.message && (errorData.message.includes('DNS') || errorData.message.includes('kết nối đến PayOS'))) {
          // Sử dụng message từ backend nếu có
          errorMessage = errorData.message
        }

        setError(errorMessage)
        console.error('   Server error details:', JSON.stringify(errorData, null, 2))
      } else if (axiosError.response?.status === 400) {
        // Bad request - validation error
        const errorMessage = axiosError.response?.data?.message || 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.'
        setError(errorMessage)
      } else if (
        axiosError.code === 'ERR_NETWORK' ||
        axiosError.message?.includes('Network Error') ||
        axiosError.code === 'ERR_CONNECTION_REFUSED'
      ) {
        setError(
          'Không thể kết nối đến server. Vui lòng:\n\n' +
            '1. Kiểm tra backend có đang chạy không (https://localhost:7267)\n' +
            '2. Kiểm tra kết nối mạng\n' +
            '3. Thử refresh trang và thử lại'
        )
      } else if (axiosError.message) {
        // Lỗi từ throw Error hoặc các lỗi khác
        setError(axiosError.message)
      } else {
        const errorMessage =
          axiosError.response?.data?.message ||
          axiosError.response?.data?.error ||
          'Không thể tạo thanh toán. Vui lòng thử lại sau.'
        setError(errorMessage)
      }
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="pay-payment-page">
        <Header />
        <main className="pay-payment-main">
          <LoadingSpinner message="Đang tải thông tin thanh toán..." />
        </main>
      </div>
    )
  }

  if (error || !booking) {
    return (
      <div className="pay-payment-page">
        <Header />
        <main className="pay-payment-main">
          <div className="pay-payment-container">
            <div className="pay-error-container" role="pay-alert">
              <h2 className="pay-error-title">Không thể tải thông tin thanh toán</h2>
              <p className="pay-error-message">{error || 'Thông tin đặt dịch vụ không tồn tại'}</p>
              <Button variant="default" onClick={() => navigate('/services')}>
                <ArrowLeftIcon className="pay-button-icon" />
                Quay lại danh sách dịch vụ
              </Button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const bookingIdValue = (booking.Id || booking.id) as number
  const totalAmount = (booking.TotalAmount || booking.totalAmount || 0) as number
  const bookingStatus = (booking.Status || booking.status || 'pending') as string
  const bookingStatusLower = bookingStatus.toLowerCase()
  const isPaid =
    paymentStatus?.Status === 'completed' ||
    paymentStatus?.Status === 'paid' ||
    paymentStatus?.status === 'completed' ||
    paymentStatus?.status === 'paid'
  const isPending = paymentStatus?.Status === 'pending' || paymentStatus?.status === 'pending' || !paymentStatus

  // Kiểm tra xem có thể thanh toán không
  // Không cho thanh toán nếu booking đã bị hủy, đã xác nhận, hoặc đã hoàn thành
  const canPay =
    !isPaid &&
    bookingStatusLower !== 'cancelled' &&
    bookingStatusLower !== 'confirmed' &&
    bookingStatusLower !== 'completed'

  // Tổng tiền hiển thị
  // Nếu có discount từ frontend (coupon trong Notes), tính: originalTotal - discountAmount + additionalServicesTotal
  // Nếu không, dùng totalAmount từ backend + additionalServicesTotal
  const hasDiscount = discountAmount > 0 && originalTotal > 0
  const finalTotal = hasDiscount 
    ? (originalTotal - discountAmount + additionalServicesTotal)
    : (totalAmount + additionalServicesTotal)

  return (
    <div className="pay-payment-page">
      <Header />

      <main className="pay-payment-main">
        <div className="pay-payment-container">
          {/* Header */}
          <div className="pay-payment-header">
            <Button
              variant="outline"
              onClick={() => {
                // Nếu có returnTab, navigate đến profile với tab đó
                if (returnTab) {
                  navigate(returnUrl, { state: { activeTab: returnTab } })
                } else {
                  // Nếu có returnUrl, quay về đó, không thì quay về trang trước
                  navigate(returnUrl as string || '/')
                }
              }}
              className="pay-back-button"
            >
              <ArrowLeftIcon className="pay-button-icon" />
              Quay lại
            </Button>
            <h1 className="pay-payment-page-title">Thanh toán</h1>
          </div>

          <div className="pay-payment-content">
            {/* Left Column - Payment Info */}
            <div className="payment-left">
              <Card className="pay-payment-info-card">
                <CardContent>
                  <h2 className="pay-card-title">Thông tin đặt dịch vụ</h2>

                  <div className="pay-payment-info">
                    {/* 1. Dịch vụ (Tên) */}
                    {(() => {
                      const serviceCombo = booking.ServiceCombo || booking.serviceCombo
                      const service = booking.Service || booking.service
                      const item = serviceCombo || service
                      const itemName = item?.Name || item?.name || ''
                      
                      // Debug log chi tiết
                      if (import.meta.env.DEV) {
                        console.log('🔍 [PaymentPage] Render - Service/Combo info:', {
                          hasServiceCombo: !!serviceCombo,
                          hasService: !!service,
                          itemName,
                          itemNameLength: itemName?.length || 0,
                          serviceComboRaw: serviceCombo,
                          serviceRaw: service,
                          serviceComboId: booking.ServiceComboId || booking.serviceComboId,
                          serviceId: booking.ServiceId || booking.serviceId
                        })
                      }
                      
                      // Luôn hiển thị "Dịch vụ" row, nếu không có tên thì hiển thị placeholder
                      const serviceComboId = booking.ServiceComboId || booking.serviceComboId
                      const serviceId = booking.ServiceId || booking.serviceId
                      
                      if (!itemName && (serviceComboId || serviceId)) {
                        // Đang fetch hoặc chưa có dữ liệu
                        return (
                          <div className="pay-info-row">
                            <span className="pay-info-label">Dịch vụ</span>
                            <span className="pay-info-value">Đang tải thông tin...</span>
                          </div>
                        )
                      }
                      
                      if (!itemName) {
                        // Không có ServiceComboId/ServiceId, không hiển thị
                        return null
                      }
                      
                      // Có tên dịch vụ, hiển thị
                      return (
                        <div className="pay-info-row">
                          <span className="pay-info-label">Dịch vụ</span>
                          <span className="pay-info-value" style={{ fontWeight: '600', fontSize: '1.05rem' }}>
                            {itemName}
                          </span>
                        </div>
                      )
                    })()}

                    {/* 2. Mô tả */}
                    {(() => {
                      const serviceCombo = booking.ServiceCombo || booking.serviceCombo
                      const service = booking.Service || booking.service
                      const item = serviceCombo || service
                      const itemDescription = item?.Description || item?.description || ''
                      
                      if (!itemDescription) return null
                      
                      return (
                        <div className="pay-info-row">
                          <span className="pay-info-label">Mô tả</span>
                          <div className="pay-info-value" style={{ whiteSpace: 'pre-line', lineHeight: '1.6', color: '#6b7280' }}>
                            {itemDescription}
                          </div>
                        </div>
                      )
                    })()}

                    {/* 3. Địa chỉ */}
                    {(() => {
                      const serviceCombo = booking.ServiceCombo || booking.serviceCombo
                      const itemAddress = serviceCombo?.Address || serviceCombo?.address || ''
                      
                      if (!itemAddress) return null
                      
                      return (
                        <div className="pay-info-row">
                          <span className="pay-info-label">Địa chỉ</span>
                          <span className="pay-info-value">{itemAddress}</span>
                        </div>
                      )
                    })()}

                    {/* 4. Trạng thái */}
                    <div className="pay-info-row">
                      <span className="pay-info-label">Trạng thái</span>
                      <span className={`pay-info-value pay-status-badge status-${bookingStatus.toLowerCase()}`}>
                        {bookingStatus === 'pending'
                          ? 'Chờ xác nhận'
                          : bookingStatus === 'confirmed'
                            ? 'Đã xác nhận'
                            : bookingStatus === 'processing'
                              ? 'Đang xử lý'
                              : bookingStatus === 'completed'
                                ? 'Hoàn thành'
                                : bookingStatus === 'cancelled'
                                  ? 'Đã hủy'
                                  : bookingStatus}
                      </span>
                    </div>

                    {/* 5. Ngày đặt */}
                    {booking.BookingDate && (
                      <div className="pay-info-row">
                        <span className="pay-info-label">Ngày đặt</span>
                        <span className="pay-info-value">
                          {new Date((booking.BookingDate || booking.bookingDate) as string).toLocaleDateString('vi-VN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    )}

                    {/* 6. Số lượng */}
                    <div className="pay-info-row">
                      <span className="pay-info-label">Số lượng</span>
                      <span className="pay-info-value">
                        {(booking.Quantity || booking.quantity || 1) as number} người
                      </span>
                    </div>

                    {/* 7. Ghi chú */}
                    {booking.Notes && (() => {
                      const notes = (booking.Notes || booking.notes || '') as string
                      // Tách phần ghi chú thực sự (bỏ phần ADDITIONAL_SERVICES và COUPON_CODE)
                      const notesWithoutIds = notes
                        .replace(/\n?\[ADDITIONAL_SERVICES:[^\]]+\]/g, '')
                        .replace(/\n?\[COUPON_CODE:[^\]]+\]/g, '')
                        .trim()
                      
                      if (!notesWithoutIds) return null
                      
                      return (
                        <div className="pay-info-row">
                          <span className="pay-info-label">Ghi chú</span>
                          <div className="pay-info-value" style={{ whiteSpace: 'pre-line', lineHeight: '1.6', color: '#6b7280' }}>
                            {notesWithoutIds}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Complementary Services Section */}
                  {canPay && (
                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
                      <ComplementaryServices
                        userTier={userTier}
                        selectedServices={selectedComplementaryServices}
                        onSelectionChange={setSelectedComplementaryServices}
                        disabled={processing}
                        hostId={(booking?.ServiceCombo as any)?.HostId || (booking?.ServiceCombo as any)?.hostId || (booking?.serviceCombo as any)?.HostId || (booking?.serviceCombo as any)?.hostId}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Payment Summary */}
            <div className="payment-right">
              <Card className="pay-payment-summary-card">
                <CardContent>
                  <h2 className="pay-card-title">Tóm tắt thanh toán</h2>

                  <div className="pay-payment-summary-content">
                    <div className="pay-summary-row">
                      <span className="pay-summary-label">Giá dịch vụ</span>
                      <span className="pay-summary-value">{formatPrice(hasDiscount ? originalTotal : totalAmount)}</span>
                    </div>

                    {additionalServicesTotal > 0 && (
                      <>
                        <div className="pay-summary-divider"></div>
                        <div className="pay-summary-row">
                          <span className="pay-summary-label">Dịch vụ thêm</span>
                          <span className="pay-summary-value">+{formatPrice(additionalServicesTotal)}</span>
                        </div>
                        {/* Chi tiết từng dịch vụ thêm */}
                        {additionalServices.map((svc, idx) => (
                          <div key={idx} className="pay-summary-row" style={{ fontSize: '0.85rem', color: '#6b7280', paddingLeft: '12px' }}>
                            <span className="pay-summary-label">• {svc.Name} x{svc.quantity || 1}</span>
                            <span className="pay-summary-value">{formatPrice((svc.Price || 0) * (svc.quantity || 1))}</span>
                          </div>
                        ))}
                      </>
                    )}

                    {hasDiscount && (
                      <>
                        <div className="pay-summary-divider"></div>
                        <div className="pay-summary-row" style={{ color: '#22c55e' }}>
                          <span className="pay-summary-label">Giảm giá</span>
                          <span className="pay-summary-value" style={{ color: '#22c55e', fontWeight: '600' }}>
                            -{formatPrice(discountAmount)}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="pay-summary-divider"></div>
                    <div className="pay-summary-row summary-row-total">
                      <span className="pay-summary-label">Thành tiền</span>
                      <span className="pay-summary-value pay-summary-total">{formatPrice(finalTotal)}</span>
                    </div>

                    {paymentStatus && (paymentStatus.Amount || paymentStatus.amount || 0) > 0 && (
                      <>
                        <div className="pay-summary-divider"></div>
                        <div className="pay-summary-row">
                          <span className="pay-summary-label">Số tiền cọc (10%)</span>
                          <span className="pay-summary-value">
                            {formatPrice(Math.round(finalTotal * 0.1))}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {error && (
                    <div className="pay-alert pay-alert-error">
                      <AlertCircleIcon className="pay-alert-icon" />
                      <div className="pay-alert-content">
                        <strong>Lỗi</strong>
                        <p style={{ whiteSpace: 'pre-line' }}>{error}</p>
                      </div>
                    </div>
                  )}

                  {isPaid || bookingStatusLower === 'confirmed' || bookingStatusLower === 'completed' ? (
                    <div className="pay-payment-success-box">
                      <CheckCircleIcon className="pay-success-icon" />
                      <div className="pay-success-content">
                        <strong>Thanh toán thành công!</strong>
                        <p>Đơn đặt dịch vụ của bạn đã được thanh toán thành công.</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column', width: '100%' }}>
                        <Button 
                          variant="default" 
                          onClick={() => navigate(`/payment/success/${bookingIdValue}`)} 
                          className="pay-success-button"
                        >
                          Xem chi tiết thanh toán
                        </Button>
                        <Button variant="outline" onClick={() => navigate('/')} className="pay-success-button">
                          Về trang chủ
                        </Button>
                      </div>
                    </div>
                  ) : bookingStatusLower === 'cancelled' ? (
                    <div className="pay-payment-cancelled-box">
                      <AlertCircleIcon className="pay-cancelled-icon" />
                      <div className="pay-cancelled-content">
                        <strong>Đơn đặt dịch vụ đã bị hủy</strong>
                        <p>Đơn đặt dịch vụ này đã bị hủy và không thể thanh toán.</p>
                      </div>
                      <Button variant="default" onClick={() => navigate('/services')} className="pay-cancelled-button">
                        Xem dịch vụ khác
                      </Button>
                    </div>
                  ) : (
                    <div className="pay-payment-actions">
                      {/* Cảnh báo về chính sách hủy */}
                      <div style={{
                        backgroundColor: '#fef3c7',
                        border: '2px solid #f59e0b',
                        borderRadius: '12px',
                        padding: '16px',
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px'
                      }}>
                        <span style={{ fontSize: '24px', flexShrink: 0 }}>⚠️</span>
                        <div>
                          <p style={{ 
                            margin: 0, 
                            fontSize: '14px', 
                            fontWeight: '600', 
                            color: '#92400e',
                            lineHeight: '1.5'
                          }}>
                            Hãy kiểm tra kỹ trước khi thanh toán vì nếu hủy đặt gói dịch vụ bạn sẽ không được hoàn lại tiền đặt cọc
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="default"
                        size="lg"
                        className="pay-button"
                        onClick={handlePayment}
                        disabled={processing || !canPay}
                      >
                        {processing ? (
                          'Đang xử lý...'
                        ) : (
                          <>
                            <CreditCardIcon className="pay-button-icon" />
                            Thanh toán ngay
                          </>
                        )}
                      </Button>

                      <p className="pay-payment-hint">
                        Bạn sẽ được chuyển đến trang thanh toán PayOS để hoàn tất giao dịch
                      </p>
                    </div>
                  )}

                  <div className="pay-payment-info-box">
                    <div className="pay-info-box-content">
                      <strong>Thông tin quan trọng</strong>
                      <ul>
                        <li>Thanh toán được xử lý an toàn qua PayOS</li>
                        <li>Bạn sẽ nhận được email xác nhận sau khi thanh toán thành công</li>
                        <li>Nếu có vấn đề, vui lòng liên hệ bộ phận hỗ trợ</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default PaymentPage







