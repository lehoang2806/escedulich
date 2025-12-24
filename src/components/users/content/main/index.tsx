import { useState, useMemo, useEffect } from 'react'
import { getAllUsers, banAccount, unbanAccount } from '~/api/instances/AdminManaUser'
import Box from '@mui/material/Box'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Avatar,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  ButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Card,
  CardContent,
  Pagination,
  Stack
} from '@mui/material'
import type { ChipProps } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PeopleIcon from '@mui/icons-material/People'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import './UsersManagement.css'

type RoleType = 'Admin' | 'Host' | 'Agency' | 'Customer'
type ChipColor = NonNullable<ChipProps['color']>

// Type definition
type User = {
  id: number
  name: string
  email: string
  avatar: string | null
  phone: string | null
  dob: string | null
  gender: string | null
  address: string | null
  role: RoleType
  roleId?: number
  status: 'active' | 'blocked'
  joinDate: string
  verified: boolean
  isBanned: boolean // Thêm field để phân biệt tài khoản bị khóa (IS_BANNED) vs không hoạt động (IsActive=false)
}

const DEFAULT_ROLE: RoleType = 'Customer'

const ROLE_LABELS: Record<RoleType, string> = {
  Admin: 'Admin',
  Host: 'Host',
  Agency: 'Agency',
  Customer: 'Customer'
}

const ROLE_FILTER_OPTIONS: { value: RoleType; label: string }[] = [
  { value: 'Host', label: ROLE_LABELS.Host },
  { value: 'Agency', label: ROLE_LABELS.Agency },
  { value: 'Customer', label: ROLE_LABELS.Customer }
]

const ROLE_CHIP_COLOR_MAP: Record<RoleType, ChipColor> = {
  Admin: 'warning',
  Host: 'secondary',
  Agency: 'primary',
  Customer: 'default'
}

const ROLE_ID_MAP: Record<number, RoleType> = {
  1: 'Admin',
  2: 'Host',
  3: 'Agency',
  4: 'Customer'
}

const ROLE_NAME_MAP: Record<string, RoleType> = {
  admin: 'Admin',
  host: 'Host',
  agency: 'Agency',
  'travel agency': 'Agency',
  travelagency: 'Agency',
  customer: 'Customer',
  tourist: 'Customer'
}

// Helper function to map backend user data to frontend format
const mapBackendUserToFrontend = (backendUser: any): User => {
  // Back-end đang trả PascalCase (Name, Email, Role, ...), nhưng cũng giữ fallback cho camelCase
  const rolePayload = backendUser.Role ?? backendUser.role ?? {}
  const rawRoleName =
    rolePayload?.Name ??
    rolePayload?.name ??
    backendUser.RoleName ??
    backendUser.roleName ??
    (typeof backendUser.Role === 'string' ? backendUser.Role : null) ??
    (typeof backendUser.role === 'string' ? backendUser.role : null) ??
    null

  const rawRoleId =
    backendUser.RoleId ??
    backendUser.roleId ??
    rolePayload?.Id ??
    rolePayload?.id ??
    (typeof backendUser.RoleId === 'number' ? backendUser.RoleId : null)

  const normalizedRoleName =
    typeof rawRoleName === 'string' ? rawRoleName.trim().toLowerCase() : null

  const parsedRoleId =
    typeof rawRoleId === 'string'
      ? Number.parseInt(rawRoleId, 10)
      : typeof rawRoleId === 'number'
        ? rawRoleId
        : undefined

  const normalizedRoleId =
    typeof parsedRoleId === 'number' && !Number.isNaN(parsedRoleId) ? parsedRoleId : undefined

  const roleFromName = normalizedRoleName ? ROLE_NAME_MAP[normalizedRoleName] : undefined
  const roleFromId =
    typeof normalizedRoleId === 'number' ? ROLE_ID_MAP[normalizedRoleId] : undefined
  const resolvedRole: RoleType = roleFromName ?? roleFromId ?? DEFAULT_ROLE

  // Backend trả về IS_BANNED (PascalCase với underscore) hoặc IsBanned
  const isBanned = backendUser.IS_BANNED ?? backendUser.IsBanned ?? backendUser.isBanned ?? false
  // IsActive: backend mặc định là true cho account mới, chỉ false khi bị ban
  // Nếu IsActive không có trong response, mặc định là true
  const isActive = backendUser.IsActive ?? backendUser.isActive ?? true

  const rawCreatedAt = backendUser.CreatedAt ?? backendUser.createdAt
  const joinDate = rawCreatedAt
    ? new Date(rawCreatedAt).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  const rawId =
    backendUser.Id ?? backendUser.id ?? backendUser.AccountId ?? backendUser.accountId ?? 0

  const parsedId = typeof rawId === 'string' ? Number.parseInt(rawId, 10) : rawId

  const normalizedId = typeof parsedId === 'number' && !Number.isNaN(parsedId) ? parsedId : 0

  const rawDob = backendUser.Dob ?? backendUser.dob ?? backendUser.DOB ?? null
  const dob = rawDob
    ? typeof rawDob === 'string'
      ? rawDob
      : new Date(rawDob).toISOString().split('T')[0]
    : null

  return {
    id: normalizedId,
    name: backendUser.Name ?? backendUser.name ?? '',
    email: backendUser.Email ?? backendUser.email ?? '',
    avatar: backendUser.Avatar ?? backendUser.avatar ?? null,
    phone: backendUser.Phone ?? backendUser.phone ?? null,
    dob: dob,
    gender: backendUser.Gender ?? backendUser.gender ?? null,
    address: backendUser.Address ?? backendUser.address ?? null,
    role: resolvedRole,
    roleId: normalizedRoleId,
    // Chỉ coi là blocked khi IS_BANNED = true
    // IsActive = false chỉ có nghĩa là chưa verify OTP, không phải bị khóa
    status: isBanned ? 'blocked' : 'active',
    joinDate,
    verified: Boolean(isActive && !isBanned),
    isBanned: isBanned // Lưu giá trị IS_BANNED để biết có thể unban hay không
  }
}

const getStatusColor = (status: string, isBanned: boolean) => {
  if (isBanned) return 'error' // Bị khóa (IS_BANNED = true)
  return 'success' // Hoạt động
}

const getStatusLabel = (status: string, isBanned: boolean) => {
  if (isBanned) return 'Bị khóa' // IS_BANNED = true
  return 'Hoạt động'
}

const getRoleLabel = (role: RoleType) => ROLE_LABELS[role] ?? role

export default function MainUsersContent() {
  const [users, setUsers] = useState<User[]>([])
  const [searchText, setSearchText] = useState('')
  const [selectedRole, setSelectedRole] = useState<RoleType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Action loading states
  const [actionLoading, setActionLoading] = useState(false)

  // Pagination state
  const [page, setPage] = useState(1)
  const [rowsPerPage] = useState(5)

  // Dialog states
  const [banDialogOpen, setBanDialogOpen] = useState(false)
  const [unbanDialogOpen, setUnbanDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [banReason, setBanReason] = useState('')
  const [unbanReason, setUnbanReason] = useState('')
  const [banError, setBanError] = useState('')
  const [unbanError, setUnbanError] = useState('')

  // Helper function to reload users from API (only when necessary)
  const reloadUsersFromAPI = async (silent = false): Promise<boolean> => {
    try {
      if (!silent) setLoading(true)
      const data = await getAllUsers()

      if (!Array.isArray(data)) {
        console.warn('Reload returned non-array data:', typeof data)
        return false
      }

      if (data.length === 0) {
        console.warn('Reload returned empty array')
        return false
      }

      // Map each user individually to avoid losing all users if one fails
      const mappedUsers: User[] = []
      let hasErrors = false

      for (let i = 0; i < data.length; i++) {
        try {
          const mappedUser = mapBackendUserToFrontend(data[i])
          mappedUsers.push(mappedUser)
        } catch (mapErr: any) {
          console.error(`Failed to map user at index ${i}:`, mapErr)
          hasErrors = true
        }
      }

      if (mappedUsers.length > 0) {
        setUsers(mappedUsers)
        if (hasErrors) {
          console.warn(
            `Successfully mapped ${mappedUsers.length} out of ${data.length} users. Some users were skipped.`
          )
        }
        return true
      }

      return false
    } catch (err: any) {
      console.error('Failed to reload users:', err)
      if (!silent) {
        setError(err.message || 'Không thể tải lại danh sách người dùng')
      }
      return false
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Load users from API
  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await getAllUsers()

        // Validate data is an array
        if (!Array.isArray(data)) {
          console.error('Invalid data format from API:', typeof data, data)
          setError('Dữ liệu từ server không hợp lệ. Vui lòng thử lại sau.')
          setUsers([])
          return
        }

        // Map users data - map each user individually to avoid losing all users if one fails
        const mappedUsers: User[] = []
        let hasErrors = false

        for (let i = 0; i < data.length; i++) {
          try {
            const mappedUser = mapBackendUserToFrontend(data[i])
            mappedUsers.push(mappedUser)
          } catch (mapErr: any) {
            console.error(`Failed to map user at index ${i}:`, mapErr, data[i])
            hasErrors = true
            // Continue mapping other users instead of stopping
          }
        }

        if (mappedUsers.length > 0) {
          setUsers(mappedUsers)
          if (hasErrors) {
            console.warn(
              `Successfully mapped ${mappedUsers.length} out of ${data.length} users. Some users were skipped due to mapping errors.`
            )
          }
        } else {
          // If no users could be mapped, show error
          console.error('No users could be mapped from API response')
          setError('Không thể xử lý dữ liệu người dùng. Vui lòng thử lại sau.')
          setUsers([])
        }
      } catch (err: any) {
        console.error('Failed to load users:', err)
        setError(err.message || 'Không thể tải danh sách người dùng')
        setUsers([])
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [])

  // Filter users based on search text (by name and email) and selected role
  const filteredUsers = useMemo(() => {
    const searchLower = searchText.toLowerCase().trim()

    return users.filter((user) => {
      // Always exclude Admin users from the list
      if (user.role === 'Admin') {
        return false
      }

      // Search by name or email
      const matchesSearch =
        searchLower === '' ||
        user.name.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower)

      // Filter by role
      const matchesRole = selectedRole === null || user.role === selectedRole

      return matchesSearch && matchesRole
    })
  }, [users, searchText, selectedRole])

  // Calculate statistics from ALL users (not filtered) - để hiển thị tổng quan hệ thống
  const statistics = useMemo(() => {
    const totalUsers = users.length
    const verifiedUsers = users.filter((u) => u.verified).length
    const blockedUsers = users.filter((u) => u.status === 'blocked').length

    // Users mới: chỉ tính những user tham gia trong vòng 1 ngày (24 giờ)
    const oneDayAgo = new Date()
    oneDayAgo.setDate(oneDayAgo.getDate() - 1)
    const newUsers = users.filter((u) => {
      const joinDate = new Date(u.joinDate)
      return joinDate >= oneDayAgo
    }).length

    return {
      total: totalUsers,
      new: newUsers,
      verified: verifiedUsers,
      blocked: blockedUsers
    }
  }, [users])

  // Paginated users
  const paginatedUsers = useMemo(() => {
    const startIndex = (page - 1) * rowsPerPage
    const endIndex = startIndex + rowsPerPage
    return filteredUsers.slice(startIndex, endIndex)
  }, [filteredUsers, page, rowsPerPage])

  // Calculate total pages
  const totalPages = Math.ceil(filteredUsers.length / rowsPerPage)

  // Reset page when filter changes
  useEffect(() => {
    // Reset to page 1 when search or role filter changes
    setPage(1)
  }, [searchText, selectedRole])

  const handleRoleFilter = (role: RoleType) => {
    const newRole = role === selectedRole ? null : role
    setSelectedRole(newRole)
    // Page will reset automatically via useEffect
  }

  const handleSearchChange = (value: string) => {
    setSearchText(value)
    // Page will reset automatically via useEffect
  }

  // Ban account (khóa tài khoản) - mở dialog
  const handleBanAccount = (user: User) => {
    setSelectedUser(user)
    setBanReason('')
    setBanError('')
    setBanDialogOpen(true)
  }

  // Confirm ban account
  const handleConfirmBan = async () => {
    if (!selectedUser) return

    if (!banReason.trim()) {
      setBanError('Vui lòng nhập lý do khóa tài khoản')
      return
    }

    setActionLoading(true)
    setError(null)
    setBanError('')

    try {
      const reason = banReason.trim()
      await banAccount(selectedUser.id, reason)

      // Optimistic update - update local state immediately
      setUsers((prevUsers) => {
        return prevUsers.map((user) => {
          if (user.id === selectedUser.id) {
            return {
              ...user,
              status: 'blocked' as const,
              verified: false, // Blocked users cannot be verified
              isBanned: true // Cập nhật isBanned = true sau khi ban thành công
            }
          }
          return user
        })
      })

      // Close dialog and reset state
      setBanDialogOpen(false)
      setSelectedUser(null)
      setBanReason('')
      setBanError('')

      // No need to reload - optimistic update is sufficient
    } catch (err: any) {
      console.error('Failed to ban account:', err)
      setBanError(err.message || 'Không thể khóa tài khoản')
      // On error, reload to get correct state from backend
      await reloadUsersFromAPI(true)
    } finally {
      setActionLoading(false)
    }
  }

  // Unban account (mở khóa tài khoản - hoạt động) - mở dialog
  const handleUnbanAccount = (user: User) => {
    setSelectedUser(user)
    setUnbanReason('')
    setUnbanError('')
    setUnbanDialogOpen(true)
  }

  // Confirm unban account
  const handleConfirmUnban = async () => {
    if (!selectedUser) return

    if (!unbanReason.trim()) {
      setUnbanError('Vui lòng nhập lý do mở khóa tài khoản')
      return
    }

    setActionLoading(true)
    setError(null)
    setUnbanError('')

    try {
      const reason = unbanReason.trim()
      await unbanAccount(selectedUser.id, reason)

      // Optimistic update - update local state immediately
      // Note: Unbanning makes account active, but verified status depends on IsActive from backend
      // We'll set verified based on the original logic: active && !banned
      setUsers((prevUsers) => {
        return prevUsers.map((user) => {
          if (user.id === selectedUser.id) {
            return {
              ...user,
              status: 'active' as const,
              verified: true, // Unbanned accounts are active, assume verified (backend will confirm)
              isBanned: false // Cập nhật isBanned = false sau khi unban thành công
            }
          }
          return user
        })
      })

      // Close dialog and reset state
      setUnbanDialogOpen(false)
      setSelectedUser(null)
      setUnbanReason('')
      setUnbanError('')

      // No need to reload - optimistic update is sufficient
    } catch (err: any) {
      console.error('Failed to unban account:', err)
      setUnbanError(err.message || 'Không thể mở khóa tài khoản')
      // On error, reload to get correct state from backend
      await reloadUsersFromAPI(true)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <Box className="users-management-container">
      <Typography className="users-management-title">Danh sách User</Typography>

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{ mb: 2, borderRadius: '1.2rem' }}
        >
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <Box className="loading-state">
          <Typography className="loading-text">Đang tải danh sách người dùng...</Typography>
        </Box>
      )}

      {/* Statistics Cards */}
      <Box className="stats-grid">
        <div className="stat-card total">
          <div className="stat-card-content">
            <div className="stat-card-info">
              <span className="stat-card-label">Tổng số User</span>
              <span className="stat-card-value">{statistics.total}</span>
            </div>
            <PeopleIcon className="stat-card-icon" />
          </div>
        </div>

        <div className="stat-card new">
          <div className="stat-card-content">
            <div className="stat-card-info">
              <span className="stat-card-label">Users mới</span>
              <span className="stat-card-value">{statistics.new}</span>
            </div>
            <PersonAddIcon className="stat-card-icon" />
          </div>
        </div>

        <div className="stat-card verified">
          <div className="stat-card-content">
            <div className="stat-card-info">
              <span className="stat-card-label">Đã xác thực</span>
              <span className="stat-card-value">{statistics.verified}</span>
            </div>
            <CheckCircleIcon className="stat-card-icon" />
          </div>
        </div>

        <div className="stat-card blocked">
          <div className="stat-card-content">
            <div className="stat-card-info">
              <span className="stat-card-label">Đã khóa</span>
              <span className="stat-card-value">{statistics.blocked}</span>
            </div>
            <LockIcon className="stat-card-icon" />
          </div>
        </div>
      </Box>

      {/* Search and Filter Section */}
      <Box className="search-section">
        {/* Search Bar */}
        <div className="search-input-wrapper">
          <TextField
            fullWidth
            placeholder="Tìm kiếm theo tên hoặc email..."
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#94a3b8' }} />
                </InputAdornment>
              )
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '16px',
                bgcolor: '#f8fafc',
                fontSize: '1.4rem',
                transition: 'all 0.3s ease',
                '& fieldset': {
                  borderColor: '#e2e8f0'
                },
                '&:hover': {
                  bgcolor: '#f1f5f9',
                  '& fieldset': {
                    borderColor: '#667eea'
                  }
                },
                '&.Mui-focused': {
                  bgcolor: '#ffffff',
                  boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.15)',
                  '& fieldset': {
                    borderColor: '#667eea'
                  }
                }
              },
              '& .MuiInputBase-input': {
                fontSize: '1.4rem',
                py: 1.5
              }
            }}
          />
        </div>

        {/* Role Filter Buttons */}
        <Box className="filter-section">
          <Typography className="filter-label">Lọc theo vai trò:</Typography>
          <ButtonGroup variant="outlined" size="medium" className="filter-buttons">
            {ROLE_FILTER_OPTIONS.map((option) => (
              <Button
                key={option.value}
                onClick={() => handleRoleFilter(option.value)}
                variant={selectedRole === option.value ? 'contained' : 'outlined'}
                sx={{
                  borderRadius: '12px',
                  textTransform: 'none',
                  fontWeight: 600,
                  px: 2.5,
                  fontSize: '1.3rem',
                  ...(selectedRole === option.value && {
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)'
                    }
                  }),
                  ...(selectedRole !== option.value && {
                    borderColor: '#e2e8f0',
                    color: '#64748b',
                    '&:hover': {
                      background: '#f8fafc',
                      borderColor: '#667eea',
                      color: '#667eea'
                    }
                  })
                }}
              >
                {option.label}
              </Button>
            ))}
          </ButtonGroup>
          {selectedRole && (
            <Button
              onClick={() => setSelectedRole(null)}
              size="small"
              className="clear-filter-btn"
              sx={{
                textTransform: 'none',
                color: '#94a3b8',
                '&:hover': {
                  color: '#667eea',
                  background: 'rgba(102, 126, 234, 0.08)'
                }
              }}
            >
              Xóa bộ lọc
            </Button>
          )}
        </Box>
      </Box>

      {!loading && (
        <TableContainer
          component={Paper}
          className="users-table-container"
          sx={{ boxShadow: 'none' }}
        >
          <Table className="users-table" sx={{ minWidth: 800 }} aria-label="users table">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Vai trò</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell>Ngày tham gia</TableCell>
                <TableCell>Xác thực</TableCell>
                <TableCell sx={{ textAlign: 'center' }}>Hành động</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Box className="empty-state">
                      <Typography className="empty-state-text">
                        Không tìm thấy User nào
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedUsers.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Box className="user-cell">
                        <Avatar
                          src={user.avatar || undefined}
                          className="user-avatar"
                          onError={(e) => {
                            // Fallback to initial if image fails to load
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                          }}
                        >
                          {user.name.charAt(0)}
                        </Avatar>
                        <Typography className="user-name">{user.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell className="user-email">{user.email}</TableCell>
                    <TableCell>
                      <Chip
                        label={getRoleLabel(user.role)}
                        size="small"
                        className={`role-chip ${user.role.toLowerCase()}`}
                        sx={{
                          fontWeight: 600,
                          fontSize: '1.2rem',
                          borderRadius: '10px',
                          ...(user.role === 'Host' && {
                            background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                            color: 'white'
                          }),
                          ...(user.role === 'Agency' && {
                            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                            color: 'white'
                          }),
                          ...(user.role === 'Customer' && {
                            background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                            color: 'white'
                          }),
                          ...(user.role === 'Admin' && {
                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                            color: 'white'
                          })
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getStatusLabel(user.status, user.isBanned)}
                        size="small"
                        className={`status-chip ${user.isBanned ? 'banned' : user.status}`}
                        sx={{
                          fontWeight: 600,
                          fontSize: '1.2rem',
                          borderRadius: '20px',
                          ...(user.status === 'active' &&
                            !user.isBanned && {
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              color: 'white'
                            }),
                          ...(user.isBanned && {
                            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                            color: 'white'
                          }),
                          ...(user.status === 'blocked' &&
                            !user.isBanned && {
                              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                              color: 'white'
                            })
                        }}
                      />
                    </TableCell>
                    <TableCell>{user.joinDate}</TableCell>
                    <TableCell>
                      <Chip
                        label={user.verified ? 'Đã xác thực' : 'Chưa xác thực'}
                        size="small"
                        className={`verified-chip ${user.verified ? 'yes' : 'no'}`}
                        sx={{
                          fontWeight: 600,
                          fontSize: '1.2rem',
                          borderRadius: '10px',
                          ...(user.verified && {
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#059669',
                            border: '1px solid rgba(16, 185, 129, 0.3)'
                          }),
                          ...(!user.verified && {
                            background: 'rgba(148, 163, 184, 0.12)',
                            color: '#64748b',
                            border: '1px solid rgba(148, 163, 184, 0.3)'
                          })
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box className="action-buttons">
                        {/* Chỉ hiển thị nút Mở khóa khi tài khoản thực sự bị ban (IS_BANNED = true) */}
                        {user.isBanned ? (
                          <IconButton
                            className="action-btn unlock"
                            title="Mở khóa (Hoạt động)"
                            onClick={() => handleUnbanAccount(user)}
                          >
                            <LockOpenIcon fontSize="small" />
                          </IconButton>
                        ) : (
                          <IconButton
                            className="action-btn lock"
                            title="Khóa tài khoản"
                            onClick={() => handleBanAccount(user)}
                          >
                            <LockIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Pagination */}
      {!loading && filteredUsers.length > 0 && (
        <Box className="pagination-container">
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
            size="large"
            sx={{
              '& .MuiPaginationItem-root': {
                fontSize: '1.4rem',
                fontWeight: 600,
                borderRadius: '12px',
                minWidth: '40px',
                height: '40px',
                margin: '0 4px',
                '&.Mui-selected': {
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%) !important'
                  }
                },
                '&:hover:not(.Mui-selected)': {
                  background: 'rgba(102, 126, 234, 0.1)'
                }
              }
            }}
          />
        </Box>
      )}

      {/* Ban Account Dialog */}
      <Dialog
        open={banDialogOpen}
        onClose={() => {
          if (!actionLoading) {
            setBanDialogOpen(false)
            setBanReason('')
            setBanError('')
            setSelectedUser(null)
            setError(null)
          }
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '24px',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle
          sx={{
            fontSize: '1.8rem',
            fontWeight: 700,
            pb: 1,
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
            borderBottom: '1px solid #fed7aa',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
            }}
          >
            <LockIcon sx={{ color: 'white', fontSize: '1.4rem' }} />
          </Box>
          Khóa tài khoản
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedUser && (
            <Box>
              <Alert
                severity="warning"
                sx={{
                  mb: 3,
                  borderRadius: '16px',
                  '& .MuiAlert-icon': { fontSize: '1.5rem' }
                }}
              >
                Bạn có chắc chắn muốn khóa tài khoản này không? Người dùng sẽ nhận được thông báo về
                lý do khóa.
              </Alert>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 2.5,
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                  borderRadius: '16px',
                  mb: 3,
                  border: '1px solid #e2e8f0'
                }}
              >
                <Avatar
                  src={selectedUser.avatar || undefined}
                  sx={{
                    width: 64,
                    height: 64,
                    fontSize: '1.6rem',
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                  }}
                >
                  {selectedUser.name.charAt(0)}
                </Avatar>
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: '1.5rem',
                      color: '#1e293b',
                      mb: 0.5
                    }}
                  >
                    {selectedUser.name}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '1.3rem',
                      color: '#64748b'
                    }}
                  >
                    {selectedUser.email}
                  </Typography>
                </Box>
              </Box>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Lý do khóa tài khoản"
                placeholder="Nhập lý do khóa tài khoản (sẽ được gửi đến người dùng)..."
                value={banReason}
                onChange={(e) => {
                  setBanReason(e.target.value)
                  setBanError('')
                }}
                error={!!banError}
                helperText={banError}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '16px',
                    fontSize: '1.4rem',
                    '&:hover fieldset': {
                      borderColor: '#f59e0b'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#f59e0b'
                    }
                  },
                  '& .MuiInputLabel-root': {
                    fontSize: '1.4rem',
                    '&.Mui-focused': {
                      color: '#f59e0b'
                    }
                  }
                }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions
          sx={{
            px: 3,
            pb: 3,
            pt: 2,
            gap: 1.5,
            borderTop: '1px solid #f1f5f9'
          }}
        >
          <Button
            onClick={() => {
              setBanDialogOpen(false)
              setBanReason('')
              setBanError('')
              setSelectedUser(null)
              setError(null)
            }}
            disabled={actionLoading}
            sx={{
              textTransform: 'none',
              borderRadius: '14px',
              px: 4,
              py: 1.2,
              fontSize: '1.4rem',
              fontWeight: 600,
              color: '#64748b',
              '&:hover': {
                background: '#f1f5f9'
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleConfirmBan}
            variant="contained"
            disabled={actionLoading}
            sx={{
              textTransform: 'none',
              borderRadius: '14px',
              px: 4,
              py: 1.2,
              fontSize: '1.4rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
              '&:hover': {
                background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                boxShadow: '0 6px 16px rgba(245, 158, 11, 0.5)'
              }
            }}
          >
            {actionLoading ? 'Đang khóa...' : 'Khóa tài khoản'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Unban Account Dialog */}
      <Dialog
        open={unbanDialogOpen}
        onClose={() => {
          if (!actionLoading) {
            setUnbanDialogOpen(false)
            setUnbanReason('')
            setUnbanError('')
            setSelectedUser(null)
            setError(null)
          }
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '24px',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle
          sx={{
            fontSize: '1.8rem',
            fontWeight: 700,
            pb: 1,
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            borderBottom: '1px solid #a7f3d0',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
          >
            <LockOpenIcon sx={{ color: 'white', fontSize: '1.4rem' }} />
          </Box>
          Mở khóa tài khoản
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedUser && (
            <Box>
              <Alert
                severity="info"
                sx={{
                  mb: 3,
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  color: '#065f46',
                  '& .MuiAlert-icon': {
                    fontSize: '1.5rem',
                    color: '#10b981'
                  }
                }}
              >
                Bạn có chắc chắn muốn mở khóa tài khoản này không? Tài khoản sẽ được kích hoạt lại
                và người dùng có thể đăng nhập bình thường.
              </Alert>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 2.5,
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                  borderRadius: '16px',
                  mb: 3,
                  border: '1px solid #e2e8f0'
                }}
              >
                <Avatar
                  src={selectedUser.avatar || undefined}
                  sx={{
                    width: 64,
                    height: 64,
                    fontSize: '1.6rem',
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                  }}
                >
                  {selectedUser.name.charAt(0)}
                </Avatar>
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: '1.5rem',
                      color: '#1e293b',
                      mb: 0.5
                    }}
                  >
                    {selectedUser.name}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '1.3rem',
                      color: '#64748b'
                    }}
                  >
                    {selectedUser.email}
                  </Typography>
                </Box>
              </Box>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Lý do mở khóa tài khoản"
                placeholder="Nhập lý do mở khóa tài khoản (sẽ được gửi đến người dùng)..."
                value={unbanReason}
                onChange={(e) => {
                  setUnbanReason(e.target.value)
                  setUnbanError('')
                }}
                error={!!unbanError}
                helperText={unbanError}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '16px',
                    fontSize: '1.4rem',
                    '&:hover fieldset': {
                      borderColor: '#10b981'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#10b981'
                    }
                  },
                  '& .MuiInputLabel-root': {
                    fontSize: '1.4rem',
                    '&.Mui-focused': {
                      color: '#10b981'
                    }
                  }
                }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions
          sx={{
            px: 3,
            pb: 3,
            pt: 2,
            gap: 1.5,
            borderTop: '1px solid #f1f5f9'
          }}
        >
          <Button
            onClick={() => {
              setUnbanDialogOpen(false)
              setUnbanReason('')
              setUnbanError('')
              setSelectedUser(null)
              setError(null)
            }}
            disabled={actionLoading}
            sx={{
              textTransform: 'none',
              borderRadius: '14px',
              px: 4,
              py: 1.2,
              fontSize: '1.4rem',
              fontWeight: 600,
              color: '#64748b',
              '&:hover': {
                background: '#f1f5f9'
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleConfirmUnban}
            variant="contained"
            disabled={actionLoading}
            sx={{
              textTransform: 'none',
              borderRadius: '14px',
              px: 4,
              py: 1.2,
              fontSize: '1.4rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
              '&:hover': {
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                boxShadow: '0 6px 16px rgba(16, 185, 129, 0.5)'
              }
            }}
          >
            {actionLoading ? 'Đang mở khóa...' : 'Mở khóa tài khoản'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
