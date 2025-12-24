import { fetchWithFallback, extractErrorMessage, getAuthToken } from './httpClient'

type CertificateStatus = 'Pending' | 'Approved' | 'Rejected' | 'Review' | string | null | undefined

export type AgencyCertificate = {
  agencyId: number
  accountId: number
  companyName: string
  licenseFile: string
  phone: string
  email: string
  website?: string | null
  status?: CertificateStatus
  rejectComment?: string | null
  createdAt?: string
  updatedAt?: string
  userName?: string
  userEmail?: string
}

export type HostCertificate = {
  certificateId: number
  hostId: number
  businessLicenseFile: string
  businessName: string
  phone: string
  email: string
  status?: CertificateStatus
  rejectComment?: string | null
  createdAt?: string
  updatedAt?: string
  hostName?: string
  hostEmail?: string
}

export type CertificateType = 'Agency' | 'Host'

const ensureAuthHeaders = () => {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Vui lòng đăng nhập để tiếp tục.')
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }
}

const handleResponse = async <T>(response: Response, clonedResponse?: Response): Promise<T> => {
  // Sử dụng clonedResponse nếu có (khi đã đọc body để log)
  const res = clonedResponse || response
  
  if (!res.ok) {
    const fallbackMessage = `HTTP ${res.status}: ${res.statusText}`
    throw new Error(await extractErrorMessage(res, fallbackMessage))
  }

  if (res.status === 204) {
    return null as T
  }

  return res.json()
}

export const requestAgencyUpgrade = async (payload: {
  companyName: string
  licenseFile: string
  phone: string
  email: string
  website?: string
}) => {
  // Convert to PascalCase for C# backend
  const requestBody = {
    CompanyName: payload.companyName,
    LicenseFile: payload.licenseFile,
    Phone: payload.phone,
    Email: payload.email,
    Website: payload.website || ''
  }
  
  const token = getAuthToken()
  console.log('🚀 [requestAgencyUpgrade] Sending request:', {
    url: '/user/request-upgrade-to-agency',
    hasToken: !!token,
    body: { ...requestBody, LicenseFile: requestBody.LicenseFile?.substring(0, 50) + '...' }
  })
  
  const response = await fetchWithFallback('/user/request-upgrade-to-agency', {
    method: 'POST',
    headers: ensureAuthHeaders(),
    body: JSON.stringify(requestBody)
  })
  
  console.log('📥 [requestAgencyUpgrade] Response status:', response.status, response.statusText)
  
  // Clone response để có thể đọc body nhiều lần
  const clonedResponse = response.clone()
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [requestAgencyUpgrade] Error response:', errorText)
  }
  
  return await handleResponse(clonedResponse)
}

export const requestHostUpgrade = async (payload: {
  businessName: string
  businessLicenseFile: string
  phone: string
  email: string
}) => {
  // Convert to PascalCase for C# backend
  const requestBody = {
    BusinessName: payload.businessName,
    BusinessLicenseFile: payload.businessLicenseFile,
    Phone: payload.phone,
    Email: payload.email
  }
  
  const token = getAuthToken()
  console.log('🚀 [requestHostUpgrade] Sending request:', {
    url: '/user/request-upgrade-to-host',
    hasToken: !!token,
    body: { ...requestBody, BusinessLicenseFile: requestBody.BusinessLicenseFile?.substring(0, 50) + '...' }
  })
  
  const response = await fetchWithFallback('/user/request-upgrade-to-host', {
    method: 'POST',
    headers: ensureAuthHeaders(),
    body: JSON.stringify(requestBody)
  })
  
  console.log('📥 [requestHostUpgrade] Response status:', response.status, response.statusText)
  
  // Clone response để có thể đọc body nhiều lần
  const clonedResponse = response.clone()
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [requestHostUpgrade] Error response:', errorText)
  }
  
  return await handleResponse(clonedResponse)
}

export const requestAgencyUpgradeWithPayment = async (payload: {
  companyName: string
  licenseFile: string
  phone: string
  email: string
  website?: string
}) => {
  // Bước 1: Gửi yêu cầu nâng cấp
  const upgradeResponse = await requestAgencyUpgrade(payload)
  
  // Bước 2: Trả về thông tin để frontend xử lý thanh toán
  const responseData = upgradeResponse && typeof upgradeResponse === 'object' ? upgradeResponse : {}
  return {
    ...responseData,
    requiresPayment: true,
    amount: 1000000 // 1,000,000 VND
  }
}

// Kiểm tra xem user có đơn upgrade pending nào không (cả Host và Agency)
export const checkAnyPendingUpgradeRequest = async (userId: number): Promise<{ hasPending: boolean; type?: 'Host' | 'Agency' }> => {
  try {
    console.log('🔍 [checkAnyPendingUpgradeRequest] Checking for userId:', userId)
    
    // Gọi cả 2 API để lấy TẤT CẢ certificates (không filter status vì API có thể không hoạt động đúng)
    const [hostResponse, agencyResponse] = await Promise.all([
      fetchWithFallback('/user/host-certificates', {
        method: 'GET',
        headers: ensureAuthHeaders()
      }),
      fetchWithFallback('/user/agency-certificates', {
        method: 'GET',
        headers: ensureAuthHeaders()
      })
    ])

    let hostCerts: HostCertificate[] = []
    let agencyCerts: AgencyCertificate[] = []

    if (hostResponse.ok) {
      hostCerts = await hostResponse.json()
      console.log('📋 [checkAnyPendingUpgradeRequest] Host certificates:', hostCerts.length)
    }
    if (agencyResponse.ok) {
      agencyCerts = await agencyResponse.json()
      console.log('📋 [checkAnyPendingUpgradeRequest] Agency certificates:', agencyCerts.length)
    }

    // Kiểm tra xem user có certificate pending nào không (check cả lowercase và uppercase)
    const isPendingStatus = (status: string | null | undefined) => {
      if (!status) return false
      const s = status.toLowerCase()
      return s === 'pending' || s === 'review'
    }

    const userHostPending = hostCerts.find(c => c.hostId === userId && isPendingStatus(c.status))
    const userAgencyPending = agencyCerts.find(c => c.accountId === userId && isPendingStatus(c.status))

    console.log('🔍 [checkAnyPendingUpgradeRequest] User Host Pending:', userHostPending)
    console.log('🔍 [checkAnyPendingUpgradeRequest] User Agency Pending:', userAgencyPending)

    if (userHostPending) {
      return { hasPending: true, type: 'Host' }
    }
    if (userAgencyPending) {
      return { hasPending: true, type: 'Agency' }
    }

    return { hasPending: false }
  } catch (error) {
    console.error('❌ [checkAnyPendingUpgradeRequest] Error:', error)
    return { hasPending: false }
  }
}



