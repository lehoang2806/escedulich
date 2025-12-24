import { useState, useEffect, useMemo } from 'react'
import {
  Box, Card, CardContent, CardHeader, Typography, Chip, Button,
  Stack, Alert, Skeleton, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, FormControl, InputLabel, Select, MenuItem, Grid, Avatar, TextField, InputAdornment,
  Snackbar
} from '@mui/material'
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  LocationOn as LocationIcon,
  Person as PersonIcon,
  AttachMoney as MoneyIcon,
  EventAvailable as SlotIcon,
  PendingActions as PendingActionsIcon,
  Policy as PolicyIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Email as EmailIcon,
  AccessTime as TimeIcon,
  Image as ImageIcon,
  Close as CloseIcon
} from '@mui/icons-material'
import {
  getAllServiceCombosForAdmin, approveServiceCombo, rejectServiceCombo,
  type ServiceComboForApproval, type ServiceStatus
} from '~/api/instances/ServiceApprovalApi'
import { getUserAvatar } from '~/api/instances/ChatApi'

const statusMeta: Record<string, { label: string; color: 'warning' | 'success' | 'error' | 'info' | 'default'; bg: string }> = {
  pending: { label: 'Chờ duyệt', color: 'warning', bg: 'rgba(255,193,7,0.12)' },
  approved: { label: 'Đã duyệt', color: 'success', bg: 'rgba(76,175,80,0.12)' },
  rejected: { label: 'Đã từ chối', color: 'error', bg: 'rgba(244,67,54,0.12)' },
  open: { label: 'Đang mở', color: 'info', bg: 'rgba(3,169,244,0.12)' },
  closed: { label: 'Đã đóng', color: 'default', bg: 'rgba(158,158,158,0.12)' }
}

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Chưa cập nhật'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN')
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)
}

export default function ServiceApprovalsContent() {
  const [services, setServices] = useState<ServiceComboForApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ message: string; type: 'approve' | 'reject' } | null>(null)
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [hostAvatars, setHostAvatars] = useState<Record<number, string>>({})
  
  const [confirmDialog, setConfirmDialog] = useState<{ 
    open: boolean; 
    service: ServiceComboForApproval | null; 
    action: 'approve' | 'reject' | null;
    rejectComment: string;
    error: string;
  }>({
    open: false, service: null, action: null, rejectComment: '', error: ''
  })

  const [imageDialog, setImageDialog] = useState<{
    open: boolean;
    imageUrl: string;
    serviceName: string;
  }>({
    open: false, imageUrl: '', serviceName: ''
  })

  // Silent refresh - không hiển thị loading khi auto-refresh
  const silentRefresh = async () => {
    try {
      const data = await getAllServiceCombosForAdmin()
      
      // Chỉ update nếu có thay đổi
      if (JSON.stringify(data.map(s => s.id)) !== JSON.stringify(services.map(s => s.id))) {
        setServices(data)
        
        // Fetch avatars cho host mới
        const existingHostIds = Object.keys(hostAvatars).map(Number)
        const newHostIds = [...new Set(data.map(s => s.hostId).filter(id => id > 0 && !existingHostIds.includes(id)))]
        
        if (newHostIds.length > 0) {
          const avatarPromises = newHostIds.map(async (hostId) => {
            try {
              const avatar = await getUserAvatar(String(hostId))
              return { hostId, avatar }
            } catch {
              return { hostId, avatar: '' }
            }
          })
          const avatarResults = await Promise.all(avatarPromises)
          const newAvatarMap: Record<number, string> = { ...hostAvatars }
          avatarResults.forEach(({ hostId, avatar }) => {
            if (avatar) newAvatarMap[hostId] = avatar
          })
          setHostAvatars(newAvatarMap)
        }
      }
    } catch (err) {
      console.error('Silent refresh failed:', err)
    }
  }

  const loadServices = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getAllServiceCombosForAdmin()
      setServices(data)
      
      // Fetch avatars for all hosts
      const uniqueHostIds = [...new Set(data.map(s => s.hostId).filter(id => id > 0))]
      const avatarPromises = uniqueHostIds.map(async (hostId) => {
        try {
          const avatar = await getUserAvatar(String(hostId))
          return { hostId, avatar }
        } catch {
          return { hostId, avatar: '' }
        }
      })
      const avatarResults = await Promise.all(avatarPromises)
      const avatarMap: Record<number, string> = {}
      avatarResults.forEach(({ hostId, avatar }) => {
        if (avatar) avatarMap[hostId] = avatar
      })
      setHostAvatars(avatarMap)
    } catch (err: any) {
      setError(err?.message || 'Không thể tải danh sách dịch vụ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServices()
  }, [])

  // Auto-refresh mỗi 30 giây để cập nhật yêu cầu mới
  useEffect(() => {
    const intervalId = setInterval(() => {
      silentRefresh()
    }, 30000) // 30 giây

    return () => clearInterval(intervalId)
  }, [services, hostAvatars])

  // Filter by status first, then by search query, then sort by newest first
  const filteredServices = useMemo(() => {
    let result = services
    
    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(s => s.status?.toLowerCase() === statusFilter.toLowerCase())
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(s =>
        s.name?.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query) ||
        s.address?.toLowerCase().includes(query) ||
        s.hostName?.toLowerCase().includes(query) ||
        s.id?.toString().includes(query)
      )
    }
    
    // Sort by createdAt descending (newest first)
    result = [...result].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return dateB - dateA
    })
    
    return result
  }, [services, statusFilter, searchQuery])

  const handleApprove = async () => {
    if (!confirmDialog.service) return
    try {
      setProcessingId(confirmDialog.service.id)
      await approveServiceCombo(confirmDialog.service.id)
      setSuccess({ message: `Đã phê duyệt dịch vụ "${confirmDialog.service.name}"`, type: 'approve' })
      setConfirmDialog({ open: false, service: null, action: null, rejectComment: '', error: '' })
      await loadServices()
    } catch (err: any) {
      setError(err?.message || 'Không thể phê duyệt dịch vụ')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async () => {
    if (!confirmDialog.service) return
    if (!confirmDialog.rejectComment.trim()) {
      setConfirmDialog(prev => ({ ...prev, error: 'Vui lòng nhập lý do từ chối' }))
      return
    }
    try {
      setProcessingId(confirmDialog.service.id)
      await rejectServiceCombo(confirmDialog.service.id, confirmDialog.rejectComment)
      setSuccess({ message: `Đã từ chối dịch vụ "${confirmDialog.service.name}"`, type: 'reject' })
      setConfirmDialog({ open: false, service: null, action: null, rejectComment: '', error: '' })
      await loadServices()
    } catch (err: any) {
      setConfirmDialog(prev => ({ ...prev, error: err?.message || 'Không thể từ chối dịch vụ' }))
    } finally {
      setProcessingId(null)
    }
  }

  const pendingCount = services.filter(s => s.status?.toLowerCase() === 'pending').length

  const canModerate = (status?: ServiceStatus) =>
    status === null || status === undefined || status?.toLowerCase() === 'pending'

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
              Danh sách dịch vụ chờ duyệt
            </Typography>
          }
          subheader={
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Phê duyệt hoặc từ chối các dịch vụ combo từ Host.
            </Typography>
          }
          action={
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Trạng thái</InputLabel>
                <Select
                  value={statusFilter}
                  label="Trạng thái"
                  onChange={(e) => setStatusFilter(e.target.value)}
                  sx={{ borderRadius: '0.8rem' }}
                >
                  <MenuItem value="all">Tất cả ({services.length})</MenuItem>
                  <MenuItem value="pending">Chờ duyệt ({pendingCount})</MenuItem>
                  <MenuItem value="approved">Đã duyệt</MenuItem>
                  <MenuItem value="rejected">Đã từ chối</MenuItem>
                </Select>
              </FormControl>
              <Tooltip title="Làm mới">
                <IconButton onClick={loadServices} disabled={loading} sx={{ bgcolor: 'rgba(0,0,0,0.04)' }}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          }
        />
        <CardContent>
          {/* Search Bar */}
          <TextField
            fullWidth
            placeholder="Tìm kiếm theo tên dịch vụ, địa điểm, mô tả, tên Host..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': {
                borderRadius: '1rem',
                bgcolor: 'rgba(0,0,0,0.02)'
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          {error && (
            <Alert severity="error" sx={{ borderRadius: '1.2rem', mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Stack spacing={2}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rectangular" height={180} sx={{ borderRadius: '1.4rem', bgcolor: 'rgba(148,163,184,0.25)' }} />
              ))}
            </Stack>
          ) : filteredServices.length === 0 ? (
            <Alert severity="info" icon={<PendingActionsIcon />} sx={{ borderRadius: '1.2rem' }}>
              {searchQuery 
                ? `Không tìm thấy dịch vụ nào với từ khóa "${searchQuery}"` 
                : `Không có dịch vụ nào ${statusFilter !== 'all' ? `với trạng thái "${statusMeta[statusFilter]?.label || statusFilter}"` : ''}`}
            </Alert>
          ) : (
            <Stack spacing={2}>
              {filteredServices.map((service) => {
                const meta = statusMeta[service.status?.toLowerCase() ?? 'pending'] ?? statusMeta.pending
                const hostAvatar = hostAvatars[service.hostId] || ''
                return (
                  <Card
                    key={service.id}
                    sx={{
                      borderRadius: '1rem',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#fff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      overflow: 'hidden',
                      '&:hover': {
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        borderColor: '#cbd5e1',
                      }
                    }}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      {/* Header: Avatar + Host info + Status */}
                      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                        <Avatar
                          src={hostAvatar}
                          sx={{
                            width: 56,
                            height: 56,
                            border: '3px solid #e2e8f0',
                          }}
                        >
                          <PersonIcon />
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" alignItems="center" spacing={1.5}>
                            <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>
                              {service.hostName || 'Chưa rõ'}
                            </Typography>
                            <Chip 
                              label={meta.label} 
                              size="small" 
                              sx={{ 
                                fontWeight: 600,
                                fontSize: '0.7rem',
                                height: '22px',
                                bgcolor: meta.bg,
                                color: meta.color === 'warning' ? '#ed6c02' : meta.color === 'success' ? '#2e7d32' : meta.color === 'error' ? '#d32f2f' : '#0288d1',
                              }} 
                            />
                          </Stack>
                          <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                            {service.hostEmail && (
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <EmailIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                                <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>
                                  {service.hostEmail}
                                </Typography>
                              </Stack>
                            )}
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <TimeIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                              <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                {formatDateTime(service.createdAt)}
                              </Typography>
                            </Stack>
                          </Stack>
                        </Box>
                      </Stack>

                      {/* Service info */}
                      <Box sx={{ 
                        p: 2, 
                        bgcolor: '#f8fafc', 
                        borderRadius: '0.75rem',
                        mb: 2
                      }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: '#334155', mb: 1 }}>
                          {service.name}
                        </Typography>
                        
                        <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mb: 1.5 }}>
                          {service.address && (
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <LocationIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                              <Typography sx={{ fontSize: '0.85rem', color: '#64748b' }}>
                                {service.address}
                              </Typography>
                            </Stack>
                          )}
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <MoneyIcon sx={{ fontSize: 16, color: '#22c55e' }} />
                            <Typography sx={{ fontWeight: 700, color: '#22c55e', fontSize: '0.95rem' }}>
                              {formatPrice(service.price)}
                            </Typography>
                          </Stack>
                          {service.availableSlots && (
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <SlotIcon sx={{ fontSize: 16, color: '#3b82f6' }} />
                              <Typography sx={{ fontSize: '0.85rem', color: '#64748b' }}>
                                {service.availableSlots} chỗ
                              </Typography>
                            </Stack>
                          )}
                        </Stack>

                        {service.description && (
                          <Typography sx={{ 
                            color: '#64748b', 
                            fontSize: '0.85rem', 
                            lineHeight: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>
                            {service.description}
                          </Typography>
                        )}
                      </Box>

                      {/* Cancellation policy */}
                      {service.cancellationPolicy && (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ 
                          p: 1.5, 
                          bgcolor: 'rgba(251, 191, 36, 0.08)', 
                          borderRadius: '0.5rem',
                          mb: 2
                        }}>
                          <PolicyIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                          <Typography sx={{ fontSize: '0.8rem', color: '#92400e' }}>
                            Chính sách hủy: {service.cancellationPolicy}
                          </Typography>
                        </Stack>
                      )}

                      {/* Actions */}
                      {canModerate(service.status) && (
                        <Stack direction="row" spacing={1.5}>
                          <Button
                            variant="outlined"
                            startIcon={<ImageIcon />}
                            disabled={!service.image}
                            onClick={() => setImageDialog({ open: true, imageUrl: service.image || '', serviceName: service.name })}
                            sx={{ 
                              borderRadius: '0.6rem', 
                              py: 1,
                              fontWeight: 600,
                              textTransform: 'none',
                              fontSize: '0.9rem',
                              borderColor: service.image ? '#6366f1' : '#cbd5e1',
                              color: service.image ? '#6366f1' : '#94a3b8',
                              '&:hover': {
                                borderColor: '#4f46e5',
                                bgcolor: 'rgba(99, 102, 241, 0.05)',
                              },
                              '&.Mui-disabled': {
                                borderColor: '#e2e8f0',
                                color: '#cbd5e1',
                              }
                            }}
                          >
                            {service.image ? 'Xem ảnh' : 'Không có ảnh'}
                          </Button>
                          <Button
                            variant="contained"
                            startIcon={<CheckCircleIcon />}
                            disabled={processingId === service.id}
                            onClick={() => setConfirmDialog({ open: true, service, action: 'approve', rejectComment: '', error: '' })}
                            sx={{ 
                              flex: 1,
                              borderRadius: '0.6rem', 
                              py: 1,
                              fontWeight: 600,
                              textTransform: 'none',
                              fontSize: '0.9rem',
                              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                              boxShadow: 'none',
                              '&:hover': {
                                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                              }
                            }}
                          >
                            Phê duyệt
                          </Button>
                          <Button
                            variant="outlined"
                            startIcon={<CancelIcon />}
                            disabled={processingId === service.id}
                            onClick={() => setConfirmDialog({ open: true, service, action: 'reject', rejectComment: '', error: '' })}
                            sx={{ 
                              flex: 1,
                              borderRadius: '0.6rem', 
                              py: 1,
                              fontWeight: 600,
                              textTransform: 'none',
                              fontSize: '0.9rem',
                              borderColor: '#ef4444',
                              color: '#ef4444',
                              '&:hover': {
                                borderColor: '#dc2626',
                                bgcolor: 'rgba(239, 68, 68, 0.05)',
                              }
                            }}
                          >
                            Từ chối
                          </Button>
                        </Stack>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <Dialog 
        open={confirmDialog.open} 
        onClose={() => setConfirmDialog({ open: false, service: null, action: null, rejectComment: '', error: '' })} 
        maxWidth="sm" 
        fullWidth
        disableScrollLock
        PaperProps={{
          sx: {
            borderRadius: '1.2rem',
            overflow: 'hidden',
          }
        }}
      >
        <DialogTitle sx={{ 
          fontWeight: 700,
          background: confirmDialog.action === 'approve' 
            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
            : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: '#fff',
          py: 2,
        }}>
          {confirmDialog.action === 'approve' ? '✓ Xác nhận phê duyệt' : '✕ Xác nhận từ chối'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {confirmDialog.service && (
            <Box>
              <Typography sx={{ mb: 2, color: '#475569' }}>
                Bạn có chắc chắn muốn {confirmDialog.action === 'approve' ? 'phê duyệt' : 'từ chối'} dịch vụ này?
              </Typography>
              <Box
                sx={{
                  p: 2.5,
                  bgcolor: confirmDialog.action === 'approve' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  borderRadius: '1rem',
                  border: `1px solid ${confirmDialog.action === 'approve' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: '1.15rem', mb: 1.5, color: '#1e293b' }}>
                  {confirmDialog.service.name}
                </Typography>
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <PersonIcon sx={{ fontSize: 18, color: '#64748b' }} />
                    <Typography sx={{ color: '#64748b', fontSize: '0.9rem' }}>
                      Host: <strong style={{ color: '#334155' }}>{confirmDialog.service.hostName || 'N/A'}</strong>
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <MoneyIcon sx={{ fontSize: 18, color: '#22c55e' }} />
                    <Typography sx={{ color: '#22c55e', fontWeight: 600 }}>
                      {formatPrice(confirmDialog.service.price)}
                    </Typography>
                  </Stack>
                  {confirmDialog.service.address && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <LocationIcon sx={{ fontSize: 18, color: '#64748b' }} />
                      <Typography sx={{ color: '#64748b', fontSize: '0.9rem' }}>
                        {confirmDialog.service.address}
                      </Typography>
                    </Stack>
                  )}
                </Stack>
              </Box>
              {confirmDialog.action === 'approve' && (
                <Alert 
                  severity="info" 
                  sx={{ 
                    mt: 2, 
                    borderRadius: '0.8rem',
                    bgcolor: 'rgba(59, 130, 246, 0.08)',
                    '& .MuiAlert-icon': { color: '#3b82f6' }
                  }}
                >
                  Sau khi phê duyệt, dịch vụ sẽ được hiển thị công khai cho người dùng.
                </Alert>
              )}
              {confirmDialog.action === 'reject' && (
                <TextField
                  label="Lý do từ chối"
                  multiline
                  rows={3}
                  fullWidth
                  value={confirmDialog.rejectComment}
                  onChange={(e) => setConfirmDialog(prev => ({ ...prev, rejectComment: e.target.value, error: '' }))}
                  placeholder="Nhập lý do từ chối để Host biết..."
                  error={!!confirmDialog.error}
                  helperText={confirmDialog.error}
                  sx={{ 
                    mt: 2, 
                    '& .MuiOutlinedInput-root': { 
                      borderRadius: '0.8rem',
                      '&:focus-within': {
                        boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.1)',
                      }
                    } 
                  }}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1 }}>
          <Button 
            onClick={() => setConfirmDialog({ open: false, service: null, action: null, rejectComment: '', error: '' })} 
            sx={{ 
              borderRadius: '0.8rem',
              px: 3,
              color: '#64748b',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' }
            }}
          >
            Hủy
          </Button>
          <Button
            variant="contained"
            onClick={confirmDialog.action === 'approve' ? handleApprove : handleReject}
            disabled={processingId !== null}
            sx={{ 
              borderRadius: '0.8rem',
              px: 3,
              fontWeight: 600,
              background: confirmDialog.action === 'approve' 
                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              boxShadow: confirmDialog.action === 'approve'
                ? '0 4px 14px rgba(34, 197, 94, 0.4)'
                : '0 4px 14px rgba(239, 68, 68, 0.4)',
              '&:hover': {
                background: confirmDialog.action === 'approve' 
                  ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                  : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              }
            }}
          >
            {processingId !== null ? 'Đang xử lý...' : (confirmDialog.action === 'approve' ? 'Xác nhận phê duyệt' : 'Xác nhận từ chối')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog
        open={imageDialog.open}
        onClose={() => setImageDialog({ open: false, imageUrl: '', serviceName: '' })}
        maxWidth="md"
        fullWidth
        disableScrollLock
        PaperProps={{
          sx: {
            borderRadius: '1rem',
            overflow: 'hidden',
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          bgcolor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          py: 1.5
        }}>
          <Typography sx={{ fontWeight: 600, color: '#334155' }}>
            Ảnh dịch vụ: {imageDialog.serviceName}
          </Typography>
          <IconButton 
            onClick={() => setImageDialog({ open: false, imageUrl: '', serviceName: '' })}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#1e293b' }}>
          {imageDialog.imageUrl && (
            <Box
              component="img"
              src={imageDialog.imageUrl}
              alt={imageDialog.serviceName}
              sx={{
                maxWidth: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Success Snackbar - Toast notification */}
      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={() => setSuccess(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSuccess(null)} 
          severity={success?.type === 'reject' ? 'error' : 'success'}
          sx={{ 
            width: '100%',
            borderRadius: '0.8rem',
            boxShadow: success?.type === 'reject' 
              ? '0 4px 20px rgba(239, 68, 68, 0.3)'
              : '0 4px 20px rgba(34, 197, 94, 0.3)',
            '& .MuiAlert-icon': { 
              color: success?.type === 'reject' ? '#ef4444' : '#22c55e' 
            },
            bgcolor: success?.type === 'reject' ? '#fef2f2' : '#f0fdf4',
            color: success?.type === 'reject' ? '#991b1b' : '#166534',
            fontWeight: 500,
          }}
        >
          {success?.message}
        </Alert>
      </Snackbar>
    </Stack>
  )
}
