import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import InfoIcon from '@mui/icons-material/Info'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import type {
  CertificateType,
  AgencyCertificate,
  HostCertificate
} from '~/api/instances/RoleUpgradeApi'
import {
  approveCertificate,
  getAgencyCertificates,
  getHostCertificates,
  rejectCertificate
} from '~/api/instances/RoleUpgradeApi'
import { getUserAvatar } from '~/api/instances/ChatApi'

type CertificateStatus = 'Pending' | 'Approved' | 'Rejected' | 'Review' | string | null | undefined

type AdminRequest = {
  certificateId: number
  userId: number
  type: CertificateType
  applicantName: string
  applicantEmail: string
  applicantAvatar?: string | null
  phone: string
  businessName: string
  licenseFile: string
  status?: CertificateStatus
  createdAt?: string
  rejectComment?: string | null
}

const statusMeta: Record<
  string,
  { label: string; color: 'info' | 'warning' | 'success' | 'error'; bg: string }
> = {
  Pending: { label: 'Đang chờ duyệt', color: 'warning', bg: 'rgba(255,193,7,0.12)' },
  Approved: { label: 'Đã phê duyệt', color: 'success', bg: 'rgba(76,175,80,0.12)' },
  Rejected: { label: 'Đã từ chối', color: 'error', bg: 'rgba(244,67,54,0.12)' },
  Review: { label: 'Yêu cầu bổ sung', color: 'info', bg: 'rgba(3,169,244,0.12)' }
}

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Chưa cập nhật'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN')
}

const toAdminRequest = (
  certificate: AgencyCertificate | HostCertificate,
  type: CertificateType
): AdminRequest => ({
  certificateId:
    type === 'Agency'
      ? (certificate as AgencyCertificate).agencyId
      : (certificate as HostCertificate).certificateId,

  userId:
    type === 'Agency'
      ? (certificate as AgencyCertificate).accountId
      : (certificate as HostCertificate).hostId,

  type,

  applicantName:
    type === 'Agency'
      ? ((certificate as AgencyCertificate).userName ?? '')
      : ((certificate as HostCertificate).hostName ?? ''),

  applicantEmail:
    type === 'Agency'
      ? ((certificate as AgencyCertificate).userEmail ?? '')
      : ((certificate as HostCertificate).hostEmail ?? ''),

  applicantAvatar: null, // Sẽ được load sau từ API

  phone: certificate.phone,
  businessName:
    type === 'Agency'
      ? (certificate as AgencyCertificate).companyName
      : (certificate as HostCertificate).businessName,

  licenseFile:
    type === 'Agency'
      ? (certificate as AgencyCertificate).licenseFile
      : (certificate as HostCertificate).businessLicenseFile,

  status: certificate.status,
  createdAt: certificate.createdAt,
  rejectComment: certificate.rejectComment
})

export default function MainRoleUpgradeContent() {
  const [adminStatusFilter, setAdminStatusFilter] = useState<
    'All' | 'Pending' | 'Approved' | 'Rejected'
  >('Pending')
  const [agencyRequests, setAgencyRequests] = useState<AgencyCertificate[]>([])
  const [hostRequests, setHostRequests] = useState<HostCertificate[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null)
  const [adminSuccessType, setAdminSuccessType] = useState<'approve' | 'reject'>('approve')
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [userAvatars, setUserAvatars] = useState<Record<number, string>>({})
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean
    request: AdminRequest | null
    comment: string
    error: string
  }>({
    open: false,
    request: null,
    comment: '',
    error: ''
  })
  const [approveDialog, setApproveDialog] = useState<{
    open: boolean
    request: AdminRequest | null
  }>({
    open: false,
    request: null
  })
  const [licenseDialog, setLicenseDialog] = useState<{
    open: boolean
    imageUrl: string
    applicantName: string
    loading: boolean
  }>({
    open: false,
    imageUrl: '',
    applicantName: '',
    loading: false
  })

  const loadAdminRequests = async () => {
    setAdminLoading(true)
    setAdminError(null)
    try {
      const [agency, host] = await Promise.all([
        getAgencyCertificates(adminStatusFilter === 'All' ? undefined : adminStatusFilter),
        getHostCertificates(adminStatusFilter === 'All' ? undefined : adminStatusFilter)
      ])
      setAgencyRequests(agency)
      setHostRequests(host)

      // Load avatars cho tất cả users
      const userIds = [
        ...agency.map((a) => a.accountId),
        ...host.map((h) => h.hostId)
      ].filter((id) => id > 0)

      const uniqueUserIds = [...new Set(userIds)]
      const avatarPromises = uniqueUserIds.map(async (userId) => {
        try {
          const avatar = await getUserAvatar(String(userId))
          return { userId, avatar }
        } catch {
          return { userId, avatar: '' }
        }
      })

      const avatarResults = await Promise.all(avatarPromises)
      const avatarMap: Record<number, string> = {}
      avatarResults.forEach(({ userId, avatar }) => {
        avatarMap[userId] = avatar
      })
      setUserAvatars(avatarMap)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Không thể tải danh sách yêu cầu.')
    } finally {
      setAdminLoading(false)
    }
  }

  useEffect(() => {
    loadAdminRequests()
  }, [adminStatusFilter])

  // Auto-refresh mỗi 30 giây để cập nhật yêu cầu mới
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Silent refresh - không hiển thị loading
      const silentRefresh = async () => {
        try {
          const [agency, host] = await Promise.all([
            getAgencyCertificates(adminStatusFilter === 'All' ? undefined : adminStatusFilter),
            getHostCertificates(adminStatusFilter === 'All' ? undefined : adminStatusFilter)
          ])
          setAgencyRequests(agency)
          setHostRequests(host)

          // Load avatars cho users mới
          const userIds = [
            ...agency.map((a) => a.accountId),
            ...host.map((h) => h.hostId)
          ].filter((id) => id > 0)

          const uniqueUserIds = [...new Set(userIds)]
          const newUserIds = uniqueUserIds.filter((id) => !userAvatars[id])
          
          if (newUserIds.length > 0) {
            const avatarPromises = newUserIds.map(async (userId) => {
              try {
                const avatar = await getUserAvatar(String(userId))
                return { userId, avatar }
              } catch {
                return { userId, avatar: '' }
              }
            })

            const avatarResults = await Promise.all(avatarPromises)
            const newAvatarMap: Record<number, string> = { ...userAvatars }
            avatarResults.forEach(({ userId, avatar }) => {
              newAvatarMap[userId] = avatar
            })
            setUserAvatars(newAvatarMap)
          }
        } catch (error) {
          console.error('Silent refresh failed:', error)
        }
      }
      silentRefresh()
    }, 30000) // 30 giây

    return () => clearInterval(intervalId)
  }, [adminStatusFilter, userAvatars])

  const unifiedRequests: AdminRequest[] = useMemo(() => {
    const mappedAgency = agencyRequests.map((item) => toAdminRequest(item, 'Agency'))
    const mappedHost = hostRequests.map((item) => toAdminRequest(item, 'Host'))
    return [...mappedAgency, ...mappedHost].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return timeB - timeA
    })
  }, [agencyRequests, hostRequests])

  const handleApproveRequest = async () => {
    if (!approveDialog.request) return
    const request = approveDialog.request
    
    try {
      setProcessingId(request.certificateId)
      await approveCertificate({ certificateId: request.certificateId, type: request.type })
      setAdminError(null)
      setAdminSuccessType('approve')
      setAdminSuccess(`Đã phê duyệt yêu cầu nâng cấp ${request.type === 'Agency' ? 'Agency' : 'Host'} của ${request.applicantName} thành công!`)
      setApproveDialog({ open: false, request: null })
      await loadAdminRequests()
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Không thể phê duyệt yêu cầu.')
    } finally {
      setProcessingId(null)
    }
  }

  const handleRejectRequest = async () => {
    if (!rejectDialog.request) return
    if (!rejectDialog.comment.trim()) {
      setRejectDialog(prev => ({ ...prev, error: 'Vui lòng nhập lý do từ chối' }))
      return
    }
    
    const request = rejectDialog.request
    
    try {
      setProcessingId(request.certificateId)
      await rejectCertificate({
        certificateId: request.certificateId,
        type: request.type,
        comment: rejectDialog.comment.trim()
      })
      setRejectDialog({ open: false, request: null, comment: '', error: '' })
      setAdminError(null)
      setAdminSuccessType('reject')
      setAdminSuccess(`Đã từ chối yêu cầu nâng cấp ${request.type === 'Agency' ? 'Agency' : 'Host'} của ${request.applicantName}.`)
      await loadAdminRequests()
    } catch (error) {
      setRejectDialog(prev => ({ ...prev, error: error instanceof Error ? error.message : 'Không thể từ chối yêu cầu.' }))
    } finally {
      setProcessingId(null)
    }
  }

  const canModerate = (status?: CertificateStatus) =>
    status === null || status === undefined || status === 'Pending'

  return (
    <Stack spacing={3}>
      <Card
        sx={{
          borderRadius: '1.6rem',
          boxShadow: '0 18px 45px rgba(15, 118, 110, 0.12)',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(240,253,250,0.98))'
        }}
      >
        <CardHeader
          title={
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Danh sách yêu cầu nâng cấp vai trò
            </Typography>
          }
          subheader={
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Phê duyệt hoặc từ chối các yêu cầu chờ xử lý.
            </Typography>
          }
          action={
            <Stack direction="row" spacing={1}>
              {(['All', 'Pending', 'Approved', 'Rejected'] as const).map((status) => (
                <Chip
                  key={status}
                  label={status === 'All' ? 'Tất cả' : (statusMeta[status]?.label ?? status)}
                  color={adminStatusFilter === status ? 'primary' : 'default'}
                  variant={adminStatusFilter === status ? 'filled' : 'outlined'}
                  onClick={() => setAdminStatusFilter(status)}
                  sx={{
                    borderRadius: '999px',
                    fontWeight: adminStatusFilter === status ? 600 : 500,
                    px: 1.5
                  }}
                />
              ))}
            </Stack>
          }
        />
        <CardContent>
          {adminLoading ? (
            <Skeleton
              variant="rectangular"
              height={220}
              sx={{ borderRadius: '1.6rem', bgcolor: 'rgba(148,163,184,0.25)' }}
            />
          ) : adminError ? (
            <Alert 
              severity="error" 
              sx={{ borderRadius: '1.2rem' }}
              onClose={() => setAdminError(null)}
            >
              {adminError}
            </Alert>
          ) : unifiedRequests.length === 0 ? (
            <Alert severity="info" icon={<PendingActionsIcon />} sx={{ borderRadius: '1.2rem' }}>
              Không có yêu cầu nào trong bộ lọc hiện tại.
            </Alert>
          ) : (
            <Stack spacing={2.5}>
              {unifiedRequests.map((request) => {
                const meta = statusMeta[request.status ?? 'Pending'] ?? statusMeta.Pending
                return (
                  <Card
                    key={`${request.type}-${request.certificateId}`}
                    sx={{
                      borderRadius: '1.6rem',
                      border: '1px solid',
                      borderColor: 'rgba(148, 163, 184, 0.2)',
                      borderLeft: '5px solid',
                      borderLeftColor: request.type === 'Agency' ? '#1976d2' : '#9c27b0',
                      backgroundColor: '#fff',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
                      overflow: 'hidden',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
                        transform: 'translateY(-2px)',
                        borderColor: 'rgba(148, 163, 184, 0.3)',
                        borderLeftColor: request.type === 'Agency' ? '#1565c0' : '#7b1fa2'
                      }
                    }}
                  >
                    <CardContent sx={{ p: 3 }}>
                      <Grid container spacing={3}>
                        <Grid size={{ xs: 12, md: 8 }}>
                          <Stack spacing={1.5}>
                            {/* User info header */}
                            <Stack direction="row" spacing={2} alignItems="center">
                              <Avatar
                                src={userAvatars[request.userId] || undefined}
                                sx={{
                                  width: 56,
                                  height: 56,
                                  bgcolor:
                                    request.type === 'Agency'
                                      ? alpha('#1976d2', 0.15)
                                      : alpha('#9c27b0', 0.15),
                                  color:
                                    request.type === 'Agency' ? '#1976d2' : '#9c27b0',
                                  fontSize: '1.6rem',
                                  fontWeight: 700,
                                  border: '3px solid',
                                  borderColor: request.type === 'Agency' 
                                    ? 'rgba(25, 118, 210, 0.2)' 
                                    : 'rgba(156, 39, 176, 0.2)'
                                }}
                              >
                                {!userAvatars[request.userId] && request.applicantName.charAt(0).toUpperCase()}
                              </Avatar>
                              <Box sx={{ flex: 1 }}>
                                <Typography sx={{ fontWeight: 700, fontSize: '1.6rem', color: '#1e293b' }}>
                                  {request.applicantName}
                                </Typography>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                  <Chip
                                    label={request.type === 'Agency' ? 'Travel Agency' : 'Host'}
                                    size="small"
                                    sx={{
                                      bgcolor: request.type === 'Agency' 
                                        ? 'rgba(25, 118, 210, 0.1)' 
                                        : 'rgba(156, 39, 176, 0.1)',
                                      color: request.type === 'Agency' ? '#1976d2' : '#9c27b0',
                                      fontWeight: 600,
                                      fontSize: '1.1rem'
                                    }}
                                  />
                                </Stack>
                              </Box>
                              <Chip
                                label={meta.label}
                                color={meta.color}
                                size="small"
                                sx={{ 
                                  fontWeight: 600,
                                  px: 1,
                                  borderRadius: '0.8rem'
                                }}
                              />
                            </Stack>
                            
                            {/* Info grid */}
                            <Box sx={{ 
                              mt: 2, 
                              p: 2, 
                              bgcolor: 'rgba(248, 250, 252, 0.8)', 
                              borderRadius: '1rem',
                              border: '1px solid rgba(148, 163, 184, 0.15)'
                            }}>
                              <Grid container spacing={2}>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                  <Typography sx={{ fontSize: '1.2rem', color: '#64748b', mb: 0.3 }}>
                                    Doanh nghiệp
                                  </Typography>
                                  <Typography sx={{ fontWeight: 600, color: '#334155' }}>
                                    {request.businessName}
                                  </Typography>
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                  <Typography sx={{ fontSize: '1.2rem', color: '#64748b', mb: 0.3 }}>
                                    Email
                                  </Typography>
                                  <Typography sx={{ fontWeight: 500, color: '#334155' }}>
                                    {request.applicantEmail}
                                  </Typography>
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                  <Typography sx={{ fontSize: '1.2rem', color: '#64748b', mb: 0.3 }}>
                                    Số điện thoại
                                  </Typography>
                                  <Typography sx={{ fontWeight: 500, color: '#334155' }}>
                                    {request.phone || '---'}
                                  </Typography>
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                  <Typography sx={{ fontSize: '1.2rem', color: '#64748b', mb: 0.3 }}>
                                    Thời gian gửi
                                  </Typography>
                                  <Typography sx={{ fontWeight: 500, color: '#334155' }}>
                                    {formatDateTime(request.createdAt)}
                                  </Typography>
                                </Grid>
                              </Grid>
                            </Box>
                            
                            {request.rejectComment && (
                              <Alert 
                                severity="warning" 
                                sx={{ 
                                  mt: 1.5, 
                                  borderRadius: '1rem',
                                  '& .MuiAlert-message': { fontWeight: 500 }
                                }}
                              >
                                <strong>Ghi chú:</strong> {request.rejectComment}
                              </Alert>
                            )}
                          </Stack>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <Stack spacing={1.5} sx={{ height: '100%', justifyContent: 'center' }}>
                            <Button
                              variant="outlined"
                              onClick={() => setLicenseDialog({
                                open: true,
                                imageUrl: request.licenseFile || '',
                                applicantName: request.applicantName,
                                loading: false
                              })}
                              startIcon={<UploadFileIcon />}
                              disabled={!request.licenseFile}
                              sx={{
                                borderRadius: '1rem',
                                py: 1.2,
                                fontWeight: 600,
                                textTransform: 'none',
                                borderColor: 'rgba(148, 163, 184, 0.4)',
                                color: '#475569',
                                '&:hover': {
                                  borderColor: '#1976d2',
                                  bgcolor: 'rgba(25, 118, 210, 0.04)'
                                }
                              }}
                              fullWidth
                            >
                              Giấy phép / Hồ sơ
                            </Button>
                            <Tooltip title="Phê duyệt yêu cầu" arrow>
                              <span>
                                <Button
                                  variant="contained"
                                  color="success"
                                  startIcon={<CheckCircleIcon />}
                                  disabled={!canModerate(request.status) || processingId === request.certificateId}
                                  onClick={() => setApproveDialog({ open: true, request })}
                                  fullWidth
                                  sx={{
                                    borderRadius: '1rem',
                                    py: 1.2,
                                    fontWeight: 600,
                                    textTransform: 'none',
                                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                                    '&:hover': {
                                      boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)'
                                    }
                                  }}
                                >
                                  {processingId === request.certificateId ? 'Đang xử lý...' : 'Phê duyệt'}
                                </Button>
                              </span>
                            </Tooltip>
                            <Tooltip title="Từ chối yêu cầu" arrow>
                              <span>
                                <Button
                                  variant="outlined"
                                  color="error"
                                  startIcon={<CancelIcon />}
                                  disabled={!canModerate(request.status) || processingId === request.certificateId}
                                  onClick={() =>
                                    setRejectDialog({
                                      open: true,
                                      request,
                                      comment: request.rejectComment ?? '',
                                      error: ''
                                    })
                                  }
                                  fullWidth
                                  sx={{
                                    borderRadius: '1rem',
                                    py: 1.2,
                                    fontWeight: 600,
                                    textTransform: 'none'
                                  }}
                                >
                                  Từ chối
                                </Button>
                              </span>
                            </Tooltip>
                          </Stack>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                )
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Approve Confirmation Dialog */}
      <Dialog
        open={approveDialog.open}
        onClose={() => setApproveDialog({ open: false, request: null })}
        maxWidth="sm"
        fullWidth
        disableScrollLock
        PaperProps={{
          sx: {
            borderRadius: '1.6rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ 
          fontWeight: 700, 
          fontSize: '1.8rem',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: 'white',
          py: 2.5,
          px: 3
        }}>
          Xác nhận phê duyệt
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: 3 }}>
          {approveDialog.request && (
            <Box>
              <Typography sx={{ mb: 2, fontSize: '1.5rem', color: 'text.secondary' }}>
                Bạn có chắc chắn muốn phê duyệt yêu cầu nâng cấp này không?
              </Typography>
              <Box sx={{ 
                p: 2.5, 
                bgcolor: 'rgba(16, 185, 129, 0.08)', 
                borderRadius: '1.2rem', 
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <Typography sx={{ fontWeight: 700, fontSize: '1.6rem', mb: 1, color: '#059669' }}>
                  {approveDialog.request.applicantName}
                </Typography>
                <Stack spacing={0.8}>
                  <Typography sx={{ color: 'text.secondary', fontSize: '1.4rem' }}>
                    <strong>Email:</strong> {approveDialog.request.applicantEmail}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '1.4rem' }}>
                    <strong>Vai trò:</strong> {approveDialog.request.type === 'Agency' ? 'Travel Agency' : 'Host'}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '1.4rem' }}>
                    <strong>Doanh nghiệp:</strong> {approveDialog.request.businessName}
                  </Typography>
                </Stack>
              </Box>
              <Alert 
                severity="info" 
                sx={{ 
                  mt: 2.5, 
                  borderRadius: '1rem',
                  '& .MuiAlert-icon': { alignItems: 'center' }
                }}
              >
                Sau khi phê duyệt, tài khoản sẽ được nâng cấp vai trò tự động.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 0, gap: 1.5 }}>
          <Button 
            onClick={() => setApproveDialog({ open: false, request: null })}
            sx={{ 
              borderRadius: '1rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1.4rem'
            }}
          >
            Hủy
          </Button>
          <Button 
            variant="contained" 
            color="success" 
            onClick={handleApproveRequest}
            disabled={processingId !== null}
            sx={{ 
              borderRadius: '1rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1.4rem',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
              '&:hover': {
                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.5)'
              }
            }}
          >
            {processingId !== null ? 'Đang xử lý...' : 'Xác nhận phê duyệt'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={rejectDialog.open}
        onClose={() => setRejectDialog({ open: false, request: null, comment: '', error: '' })}
        fullWidth
        maxWidth="sm"
        disableScrollLock
        PaperProps={{
          sx: {
            borderRadius: '1.6rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ 
          fontWeight: 700, 
          fontSize: '1.8rem',
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: 'white',
          py: 2.5,
          px: 3
        }}>
          Từ chối yêu cầu nâng cấp
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: 3 }}>
          {rejectDialog.request && (
            <Box sx={{ 
              mb: 2.5, 
              p: 2, 
              bgcolor: 'rgba(239, 68, 68, 0.06)', 
              borderRadius: '1rem',
              border: '1px solid rgba(239, 68, 68, 0.15)'
            }}>
              <Typography sx={{ fontWeight: 700, fontSize: '1.5rem', color: '#dc2626' }}>
                {rejectDialog.request.applicantName}
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '1.4rem', mt: 0.5 }}>
                Vai trò: {rejectDialog.request.type === 'Agency' ? 'Travel Agency' : 'Host'}
              </Typography>
            </Box>
          )}
          <TextField
            label="Lý do từ chối"
            multiline
            minRows={4}
            value={rejectDialog.comment}
            onChange={(event) =>
              setRejectDialog((prev) => ({
                ...prev,
                comment: event.target.value,
                error: ''
              }))
            }
            fullWidth
            placeholder="Nhập lý do để người dùng biết cần bổ sung gì..."
            error={!!rejectDialog.error}
            helperText={rejectDialog.error}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '1rem',
                '&:hover fieldset': {
                  borderColor: '#ef4444'
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#ef4444'
                }
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: '#ef4444'
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 0, gap: 1.5 }}>
          <Button 
            onClick={() => setRejectDialog({ open: false, request: null, comment: '', error: '' })}
            sx={{ 
              borderRadius: '1rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1.4rem'
            }}
          >
            Hủy
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={handleRejectRequest}
            disabled={processingId !== null}
            sx={{ 
              borderRadius: '1rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1.4rem',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
              '&:hover': {
                boxShadow: '0 6px 20px rgba(239, 68, 68, 0.5)'
              }
            }}
          >
            {processingId !== null ? 'Đang xử lý...' : 'Từ chối'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* License Image Dialog */}
      <Dialog
        open={licenseDialog.open}
        onClose={() => setLicenseDialog({ open: false, imageUrl: '', applicantName: '', loading: false })}
        maxWidth="md"
        fullWidth
        disableScrollLock
        PaperProps={{
          sx: {
            borderRadius: '1.6rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ 
          fontWeight: 700,
          fontSize: '1.8rem',
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          color: 'white',
          py: 2.5,
          px: 3
        }}>
          Giấy phép / Hồ sơ - {licenseDialog.applicantName}
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {licenseDialog.imageUrl ? (
            <Box sx={{ textAlign: 'center' }}>
              {licenseDialog.loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Box
                  component="img"
                  src={licenseDialog.imageUrl}
                  alt="Giấy phép"
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    console.error('Error loading license image:', licenseDialog.imageUrl)
                    e.currentTarget.style.display = 'none'
                  }}
                  sx={{
                    maxWidth: '100%',
                    maxHeight: '70vh',
                    borderRadius: '1rem',
                    objectFit: 'contain',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
                  }}
                />
              )}
            </Box>
          ) : (
            <Alert severity="warning" sx={{ borderRadius: '1rem' }}>
              Không có hình ảnh giấy phép.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 0 }}>
          <Button 
            onClick={() => setLicenseDialog({ open: false, imageUrl: '', applicantName: '', loading: false })}
            variant="outlined"
            sx={{ 
              borderRadius: '1rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1.4rem'
            }}
          >
            Đóng
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success/Reject Snackbar - góc phải màn hình */}
      <Snackbar
        open={!!adminSuccess}
        autoHideDuration={4000}
        onClose={() => setAdminSuccess(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 8 }}
      >
        <Alert
          onClose={() => setAdminSuccess(null)}
          severity={adminSuccessType === 'approve' ? 'success' : 'error'}
          sx={{
            borderRadius: '1.2rem',
            boxShadow: adminSuccessType === 'approve' 
              ? '0 8px 32px rgba(16, 185, 129, 0.3)' 
              : '0 8px 32px rgba(239, 68, 68, 0.3)',
            fontWeight: 500,
            fontSize: '1.4rem',
            minWidth: '320px',
            bgcolor: adminSuccessType === 'approve' ? '#f0fdf4' : '#fef2f2',
            color: adminSuccessType === 'approve' ? '#166534' : '#991b1b',
            '& .MuiAlert-icon': {
              fontSize: '2.2rem',
              color: adminSuccessType === 'approve' ? '#22c55e' : '#ef4444'
            },
            '& .MuiAlert-action': {
              color: adminSuccessType === 'approve' ? '#166534' : '#991b1b'
            }
          }}
        >
          {adminSuccess}
        </Alert>
      </Snackbar>

      <Alert
        severity="info"
        icon={<InfoIcon />}
        sx={{
          borderRadius: '1.2rem',
          background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
          border: '1px solid #7dd3fc',
          '& .MuiAlert-icon': {
            color: '#0284c7'
          }
        }}
      >
        <Typography sx={{ fontWeight: 700, mb: 0.5, color: '#0369a1' }}>Lưu ý</Typography>
        <Typography sx={{ fontSize: '1.3rem', color: '#0c4a6e' }}>
          - Người dùng cần chuẩn bị giấy phép hợp lệ dưới dạng ảnh/pdf và chia sẻ đường dẫn. <br />
          - Chỉ Admin mới có quyền phê duyệt/từ chối yêu cầu nâng cấp vai trò. <br />- Sau khi phê
          duyệt, hệ thống tự động cập nhật vai trò tài khoản.
        </Typography>
      </Alert>
    </Stack>
  )
}
