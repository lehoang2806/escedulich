import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  IconButton,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  InputAdornment,
  Menu,
  MenuItem,
  Divider,
  ImageList,
  ImageListItem,
  DialogContentText
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteBorderIcon,
  Image as ImageIcon,
  Close as CloseIcon,
  Link as LinkIcon
} from '@mui/icons-material'
import { uploadImageToFirebase, deleteImageFromFirebase } from '~/services/firebaseStorage'
import {
  fetchAllNews,
  createNews,
  updateNews,
  deleteNews,
  toggleLikeNews,
  type NewsDto,
  type CreateNewsDto,
  type UpdateNewsDto
} from '~/api/instances/NewsApi'


const getRoleColor = (role: string) => {
  switch (role?.toLowerCase()) {
    case 'admin':
      return 'primary'
    case 'travel agency':
    case 'agency':
      return 'info'
    case 'host':
      return 'secondary'
    default:
      return 'default'
  }
}


const formatTimeAgo = (dateString?: string) => {
  if (!dateString) return 'Vừa xong'


  try {
    // Backend trả về UTC time, thêm 'Z' nếu chưa có để đảm bảo parse đúng UTC
    let utcDateString = dateString
    if (!dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('-', 10)) {
      utcDateString = dateString + 'Z'
    }
    
    const date = new Date(utcDateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)


    if (diffMins < 1) return 'Vừa xong'
    if (diffMins < 60) return `${diffMins} phút trước`
    if (diffHours < 24) return `${diffHours} giờ trước`
    if (diffDays < 30) return `${diffDays} ngày trước`
    return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  } catch {
    return 'Vừa xong'
  }
}


export default function NewsManagement() {
  const [news, setNews] = useState<NewsDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')


  // Create News State
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newImages, setNewImages] = useState<File[]>([])
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([])
  const [creating, setCreating] = useState(false)


  // Edit News State
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingNews, setEditingNews] = useState<NewsDto | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editSocialLink, setEditSocialLink] = useState('')
  const [editImages, setEditImages] = useState<string[]>([])
  const [editNewImages, setEditNewImages] = useState<File[]>([])
  const [editNewImagePreviews, setEditNewImagePreviews] = useState<string[]>([])
  const [updating, setUpdating] = useState(false)


  // Delete News State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingNews, setDeletingNews] = useState<NewsDto | null>(null)
  const [deleting, setDeleting] = useState(false)


  // Menu State
  const [menuAnchor, setMenuAnchor] = useState<{ [key: number]: HTMLElement | null }>({})


  // Get current user
  const getCurrentUser = () => {
    try {
      const userInfoStr = localStorage.getItem('userInfo')
      if (userInfoStr) {
        return JSON.parse(userInfoStr)
      }
    } catch (error) {
      console.error('Error parsing userInfo:', error)
    }
    return null
  }


  const currentUser = getCurrentUser()


  // Debug: Log user info to console with full details
  useEffect(() => {
    console.log('=== NEWS COMPONENT DEBUG ===')
    console.log('Current User Info (full):', JSON.stringify(currentUser, null, 2))
    console.log('Role check (detailed):', {
      role: currentUser?.role,
      roleName: currentUser?.roleName,
      Role: currentUser?.Role,
      RoleName: currentUser?.RoleName,
      roleId: currentUser?.roleId,
      RoleId: currentUser?.RoleId,
      allKeys: currentUser ? Object.keys(currentUser) : []
    })
    console.log('isAdmin will be calculated from above values')
    console.log('==========================')
  }, [currentUser])


  // Check if user is Admin - check multiple possible property names and roleId
  const isAdmin =
    currentUser?.role === 'Admin' ||
    currentUser?.roleName === 'Admin' ||
    currentUser?.Role === 'Admin' ||
    currentUser?.RoleName === 'Admin' ||
    currentUser?.roleId === 1 || // Admin thường có roleId = 1
    currentUser?.RoleId === 1 || // PascalCase version
    (typeof currentUser?.role === 'string' && currentUser.role.toLowerCase() === 'admin') ||
    (typeof currentUser?.roleName === 'string' && currentUser.roleName.toLowerCase() === 'admin') ||
    (typeof currentUser?.RoleName === 'string' && currentUser.RoleName.toLowerCase() === 'admin')


  // Log isAdmin result
  useEffect(() => {
    console.log('isAdmin result:', isAdmin)
  }, [isAdmin])


  // Load News
  useEffect(() => {
    loadNews()

    // Lắng nghe BroadcastChannel để nhận updates realtime từ user (like/unlike)
    let newsChannel: BroadcastChannel | null = null
    try {
      newsChannel = new BroadcastChannel('news-updates')
      newsChannel.onmessage = (event) => {
        const { type } = event.data || {}
        if (type === 'NEWS_LIKED' || type === 'NEWS_DELETED' || type === 'NEWS_CREATED' || type === 'NEWS_UPDATED') {
          console.log(`[Admin] Received ${type} broadcast, refreshing...`)
          loadNewsQuiet()
        }
      }
    } catch (e) {
      console.log('BroadcastChannel not supported')
    }

    // Fallback: Auto-refresh mỗi 10 giây
    const refreshInterval = setInterval(() => {
      loadNewsQuiet()
    }, 10000)

    return () => {
      clearInterval(refreshInterval)
      if (newsChannel) {
        newsChannel.close()
      }
    }
  }, [])

  // Load news không hiển thị loading (dùng cho auto-refresh)
  const loadNewsQuiet = async () => {
    try {
      const data = await fetchAllNews()
      setNews(data || [])
    } catch (err) {
      console.error('Error auto-refreshing news:', err)
    }
  }


  const loadNews = async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('Loading news...')
      const data = await fetchAllNews()
      console.log('News loaded:', data)
      setNews(data || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể tải danh sách tin tức'
      setError(errorMessage)
      console.error('Error loading news:', err)
      // Set empty array on error to prevent crash
      setNews([])
    } finally {
      setLoading(false)
    }
  }


  // Filter News
  const filteredNews = useMemo(() => {
    if (!searchText.trim()) return news
    const lowerSearch = searchText.toLowerCase()
    return news.filter(
      (item) =>
        item.content.toLowerCase().includes(lowerSearch) ||
        item.authorName.toLowerCase().includes(lowerSearch)
    )
  }, [news, searchText])


  // Create News Handlers
  const handleOpenCreateDialog = () => {
    setCreateDialogOpen(true)
    setNewTitle('')
    setNewContent('')
    setNewImages([])
    setNewImagePreviews([])
  }


  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false)
    setNewTitle('')
    setNewContent('')
    setNewImages([])
    setNewImagePreviews([])
    setError(null) // Clear error when closing dialog
  }


  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const fileArray = Array.from(files)


      // Validate file types
      const validFiles = fileArray.filter((file) => {
        if (!file.type.startsWith('image/')) {
          console.warn(`File ${file.name} is not an image, skipping`)
          return false
        }
        return true
      })


      if (validFiles.length === 0) {
        return
      }


      // Add new files (don't append to existing, replace if needed)
      setNewImages((prev) => {
        // If we want to allow multiple, use: [...prev, ...validFiles]
        // For now, let's allow multiple but ensure no duplicates
        const existingNames = new Set(prev.map((f) => f.name))
        const newFiles = validFiles.filter((f) => !existingNames.has(f.name))
        return [...prev, ...newFiles]
      })


      // Create previews
      const previews = validFiles.map((file) => URL.createObjectURL(file))
      setNewImagePreviews((prev) => {
        // Ensure no duplicate previews
        return [...prev, ...previews]
      })


      // Reset input to allow selecting same file again
      e.target.value = ''
    }
  }


  const removeNewImage = (index: number) => {
    setNewImages((prev) => prev.filter((_, i) => i !== index))
    setNewImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
  }


  const handleCreateNews = async () => {
    // Validate title
    if (!newTitle.trim()) {
      setError('Tiêu đề tin tức không được để trống')
      return
    }


    // Validate title length
    if (newTitle.trim().length > 200) {
      setError('Tiêu đề tin tức tối đa 200 ký tự')
      return
    }


    // Backend requires Content to be non-empty (Required attribute)
    if (!newContent.trim()) {
      setError('Nội dung tin tức không được để trống')
      return
    }


    // Validate content length
    if (newContent.trim().length > 4000) {
      setError('Nội dung tin tức tối đa 4000 ký tự')
      return
    }


    // Validate at least 1 image is required
    if (newImages.length === 0) {
      setError('Vui lòng thêm ít nhất 1 hình ảnh cho tin tức')
      return
    }


    try {
      setCreating(true)
      setError(null) // Clear previous errors


      // Upload images to Firebase - ensure no duplicates
      const imageUrls: string[] = []
      const processedFiles = new Set<string>() // Track processed file names to avoid duplicates


      for (const file of newImages) {
        // Skip if already processed (duplicate check)
        if (processedFiles.has(file.name)) {
          console.warn(`Skipping duplicate file: ${file.name}`)
          continue
        }


        try {
          const url = await uploadImageToFirebase(file, 'news')
          imageUrls.push(url)
          processedFiles.add(file.name)
          console.log(`Successfully uploaded file to Firebase: ${file.name}, url: ${url}`)
        } catch (fileError) {
          console.error(`Error uploading file ${file.name} to Firebase:`, fileError)
          setError(`Lỗi khi upload ảnh ${file.name} lên server. Vui lòng thử lại.`)
          setCreating(false)
          return
        }
      }


      if (imageUrls.length === 0 && newImages.length > 0) {
        setError('Không thể upload ảnh. Vui lòng thử lại với ảnh khác.')
        setCreating(false)
        return
      }


      console.log(`Creating news with ${imageUrls.length} images`)


      const dto: CreateNewsDto = {
        title: newTitle.trim(),
        content: newContent.trim(),
        images: imageUrls.length > 0 ? imageUrls : undefined
      }


      await createNews(dto)
      await loadNews()
      handleCloseCreateDialog()

      // Broadcast để các tab/window khác biết có tin tức mới
      try {
        const newsChannel = new BroadcastChannel('news-updates')
        newsChannel.postMessage({ type: 'NEWS_CREATED', timestamp: Date.now() })
        newsChannel.close()
      } catch (e) {
        console.log('BroadcastChannel not supported')
      }

      // Show success message (optional)
      console.log('News created successfully')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể tạo tin tức'
      setError(errorMessage)
      console.error('Error creating news:', err)
    } finally {
      setCreating(false)
    }
  }


  // Edit News Handlers
  const handleOpenEditDialog = (newsItem: NewsDto) => {
    console.log('🔵 [Edit News] Opening edit dialog for news:', newsItem.newsId)
    console.log('🔵 [Edit News] newsItem.images:', newsItem.images)
    console.log('🔵 [Edit News] newsItem.images length:', newsItem.images?.length)
   
    setEditingNews(newsItem)
    setEditContent(newsItem.content)
    setEditSocialLink('')
    setEditImages(newsItem.images ? [...newsItem.images] : [])
    setEditNewImages([])
    setEditNewImagePreviews([])
    setEditDialogOpen(true)
    handleMenuClose(newsItem.newsId)
  }


  const handleCloseEditDialog = () => {
    setEditDialogOpen(false)
    setEditingNews(null)
    setEditContent('')
    setEditSocialLink('')
    setEditImages([])
    setEditNewImages([])
    setEditNewImagePreviews([])
  }


  const handleEditImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const fileArray = Array.from(files)


      // Validate file types
      const validFiles = fileArray.filter((file) => {
        if (!file.type.startsWith('image/')) {
          console.warn(`File ${file.name} is not an image, skipping`)
          return false
        }
        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
          console.warn(`File ${file.name} exceeds 5MB limit, skipping`)
          setError(`Ảnh ${file.name} vượt quá 5MB`)
          return false
        }
        return true
      })


      if (validFiles.length === 0) {
        return
      }


      // Add new files (avoid duplicates)
      setEditNewImages((prev) => {
        const existingNames = new Set(prev.map((f) => f.name))
        const newFiles = validFiles.filter((f) => !existingNames.has(f.name))
        return [...prev, ...newFiles]
      })


      // Create previews
      const previews = validFiles.map((file) => URL.createObjectURL(file))
      setEditNewImagePreviews((prev) => [...prev, ...previews])


      // Reset input to allow selecting same file again
      e.target.value = ''
    }
  }


  const removeEditImage = async (index: number, isNew: boolean) => {
    if (isNew) {
      setEditNewImages((prev) => prev.filter((_, i) => i !== index))
      setEditNewImagePreviews((prev) => {
        URL.revokeObjectURL(prev[index])
        return prev.filter((_, i) => i !== index)
      })
    } else {
      // Delete old Firebase image when removing existing image
      const imageToDelete = editImages[index]
      if (imageToDelete && imageToDelete.includes('firebasestorage')) {
        try {
          await deleteImageFromFirebase(imageToDelete)
          console.log('✅ Đã xóa ảnh cũ từ Firebase:', imageToDelete)
        } catch (deleteErr) {
          console.warn('⚠️ Không thể xóa ảnh cũ từ Firebase:', deleteErr)
        }
      }
      setEditImages((prev) => prev.filter((_, i) => i !== index))
    }
  }


  const handleUpdateNews = async () => {
    if (!editingNews) return


    try {
      setUpdating(true)
      setError(null)


      // Upload new images to Firebase
      const newImageUrls: string[] = []
      for (const file of editNewImages) {
        try {
          const url = await uploadImageToFirebase(file, 'news')
          newImageUrls.push(url)
        } catch (fileError) {
          console.error(`Error uploading edit image ${file.name} to Firebase:`, fileError)
        }
      }


      // Combine existing and new images
      const allImages = [...editImages, ...newImageUrls]


      const dto: UpdateNewsDto = {
        content: editContent.trim() || undefined,
        images: allImages.length > 0 ? allImages : undefined
      }


      await updateNews(editingNews.newsId, dto)
      
      // Cập nhật state trực tiếp thay vì reload toàn bộ
      setNews((prev) =>
        prev.map((item) =>
          item.newsId === editingNews.newsId
            ? {
                ...item,
                content: editContent.trim() || item.content,
                images: allImages.length > 0 ? allImages : item.images
              }
            : item
        )
      )
      
      handleCloseEditDialog()

      // Broadcast để các tab khác biết tin tức đã được cập nhật
      try {
        const newsChannel = new BroadcastChannel('news-updates')
        newsChannel.postMessage({ type: 'NEWS_UPDATED', newsId: editingNews.newsId, timestamp: Date.now() })
        newsChannel.close()
      } catch (e) {
        console.log('BroadcastChannel not supported')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật tin tức')
      console.error('Error updating news:', err)
    } finally {
      setUpdating(false)
    }
  }


  // Delete News Handlers
  const handleOpenDeleteDialog = (newsItem: NewsDto) => {
    setDeletingNews(newsItem)
    setDeleteDialogOpen(true)
    handleMenuClose(newsItem.newsId)
  }


  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setDeletingNews(null)
  }


  const handleDeleteNews = async () => {
    if (!deletingNews) return

    const newsIdToDelete = deletingNews.newsId

    try {
      setDeleting(true)
      await deleteNews(newsIdToDelete)
      
      // Cập nhật state trực tiếp thay vì reload toàn bộ
      setNews((prev) => prev.filter((item) => item.newsId !== newsIdToDelete))
      
      handleCloseDeleteDialog()

      // Broadcast để các tab khác biết tin tức đã bị xóa
      try {
        const newsChannel = new BroadcastChannel('news-updates')
        newsChannel.postMessage({ type: 'NEWS_DELETED', newsId: newsIdToDelete, timestamp: Date.now() })
        newsChannel.close()
      } catch (e) {
        console.log('BroadcastChannel not supported')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa tin tức')
      console.error('Error deleting news:', err)
    } finally {
      setDeleting(false)
    }
  }


  // Check if user is authenticated (has token)
  const isAuthenticated = () => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken')
      return !!token
    } catch {
      return false
    }
  }


  // Like Handler - chỉ cho phép khi đã đăng nhập
  const handleToggleLike = async (newsId: number) => {
    // Kiểm tra đăng nhập trước khi like
    if (!isAuthenticated()) {
      setError('Vui lòng đăng nhập để thả tim tin tức')
      return
    }


    try {
      const result = await toggleLikeNews(newsId)
      setNews((prev) =>
        prev.map((item) =>
          item.newsId === newsId
            ? { ...item, isLiked: result.liked, likesCount: result.likesCount }
            : item
        )
      )

      // Broadcast để các tab khác biết lượt like đã thay đổi
      try {
        const newsChannel = new BroadcastChannel('news-updates')
        newsChannel.postMessage({ type: 'NEWS_LIKED', newsId, likesCount: result.likesCount, timestamp: Date.now() })
        newsChannel.close()
      } catch (e) {
        console.log('BroadcastChannel not supported')
      }
    } catch (err: any) {
      console.error('Error toggling like:', err)
      const errorMessage = err?.message || 'Không thể thả tim tin tức'
      setError(errorMessage)
    }
  }


  // Menu Handlers
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, newsId: number) => {
    setMenuAnchor((prev) => ({ ...prev, [newsId]: event.currentTarget }))
  }


  const handleMenuClose = (newsId: number) => {
    setMenuAnchor((prev) => ({ ...prev, [newsId]: null }))
  }


  // Chỉ có thể edit tin tức của chính mình (kể cả Admin)
  const canEdit = (newsItem: NewsDto) => {
    if (!isAdmin || !currentUser) return false


    // Check multiple possible user ID fields from currentUser
    const userId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      0
    const newsAuthorId = newsItem.authorId ?? 0


    // Convert to numbers for comparison (handle both string and number)
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId)
    const authorIdNum =
      typeof newsAuthorId === 'string' ? parseInt(String(newsAuthorId), 10) : Number(newsAuthorId)


    return userIdNum === authorIdNum && userIdNum > 0
  }


  // Admin có thể delete bất kỳ tin tức nào
  const canDelete = () => {
    return isAdmin
  }


  // Helper để kiểm tra có thể edit hoặc delete (dùng cho menu button)
  const canEditOrDelete = (newsItem: NewsDto) => {
    return canEdit(newsItem) || canDelete()
  }


  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    )
  }


  return (
    <Box sx={{ p: 3, bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
        sx={{
          bgcolor: 'white',
          p: 2,
          borderRadius: 2,
          boxShadow: 1
        }}
      >
        <Typography variant="h4" fontWeight="bold" color="text.primary">
          Quản lý Tin tức
        </Typography>
        {isAdmin ? (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreateDialog}
            sx={{
              borderRadius: 2,
              bgcolor: 'primary.main',
              '&:hover': {
                bgcolor: 'primary.dark'
              }
            }}
          >
            Tạo tin tức mới
          </Button>
        ) : (
          <Box
            sx={{
              color: 'text.secondary',
              fontSize: '0.875rem',
              p: 1,
              bgcolor: 'warning.light',
              borderRadius: 1
            }}
          >
            {/* Debug info - always show for now */}
            <Typography variant="caption" color="text.secondary" component="div">
              <strong>Debug Info:</strong>
              <br />
              isAdmin = {String(isAdmin)}
              <br />
              role = {currentUser?.role || 'N/A'}
              <br />
              roleName = {currentUser?.roleName || currentUser?.RoleName || 'N/A'}
              <br />
              roleId = {currentUser?.roleId || currentUser?.RoleId || 'N/A'}
              <br />
              All keys: {currentUser ? Object.keys(currentUser).join(', ') : 'No user'}
            </Typography>
          </Box>
        )}
      </Box>


      {/* Search */}
      <Box mb={3}>
        <TextField
          fullWidth
          placeholder="Tìm kiếm tin tức..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            )
          }}
          sx={{
            borderRadius: 2,
            bgcolor: 'white',
            '& .MuiOutlinedInput-root': {
              '&:hover fieldset': {
                borderColor: 'primary.main'
              }
            }
          }}
        />
      </Box>


      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}


      {/* News List */}
      {filteredNews.length === 0 ? (
        <Card sx={{ bgcolor: 'white', borderRadius: 2, boxShadow: 1 }}>
          <CardContent>
            <Typography textAlign="center" color="text.secondary" py={4}>
              {searchText ? 'Không tìm thấy tin tức nào' : 'Chưa có tin tức nào'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box display="flex" flexDirection="column" gap={2}>
          {filteredNews.map((newsItem) => (
            <Card
              key={newsItem.newsId}
              sx={{
                borderRadius: 2,
                bgcolor: 'white',
                boxShadow: 2,
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: 4,
                  transform: 'translateY(-2px)'
                }
              }}
            >
              <CardContent sx={{ p: 3 }}>
                {/* Header */}
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                  <Box display="flex" gap={2} alignItems="center">
                    <Avatar
                      src={newsItem.authorAvatar}
                      sx={{
                        width: 56,
                        height: 56,
                        bgcolor: 'primary.main',
                        fontSize: '1.5rem',
                        fontWeight: 'bold'
                      }}
                    >
                      {newsItem.authorName.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography
                        variant="subtitle1"
                        fontWeight="bold"
                        color="text.primary"
                        mb={0.5}
                      >
                        {newsItem.authorName}
                      </Typography>
                      <Box display="flex" gap={1} alignItems="center">
                        <Chip
                          label={newsItem.authorRole}
                          size="small"
                          color={getRoleColor(newsItem.authorRole)}
                          sx={{ fontWeight: 'medium' }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.875rem' }}
                        >
                          {formatTimeAgo(newsItem.createdDate)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                  {canEditOrDelete(newsItem) && (
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, newsItem.newsId)}
                      sx={{ color: 'text.secondary' }}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  )}
                </Box>

                {/* Title */}
                {newsItem.title && (
                  <Typography
                    variant="h5"
                    sx={{
                      mb: 2,
                      fontWeight: 700,
                      color: 'text.primary',
                      fontSize: '1.5rem',
                      lineHeight: 1.4
                    }}
                  >
                    {newsItem.title}
                  </Typography>
                )}

                {/* Content */}
                <Typography
                  variant="body1"
                  sx={{
                    mb: 2,
                    whiteSpace: 'pre-wrap',
                    color: 'text.primary',
                    lineHeight: 1.7,
                    fontSize: '1rem'
                  }}
                >
                  {newsItem.content}
                </Typography>


                {/* Images */}
                {newsItem.images && newsItem.images.length > 0 && (
                  <Box mb={2}>
                    <ImageList cols={3} gap={8} sx={{ mb: 0 }}>
                      {newsItem.images
                        .filter((img) => {
                          // Filter out empty strings and invalid data
                          if (!img || typeof img !== 'string') return false
                          const trimmed = img.trim()
                          return trimmed !== ''
                        })
                        .map((image, index) => {
                          let imageSrc = image.trim()


                          // If it's already a data URL or HTTP(S) URL, use as is
                          if (imageSrc.startsWith('data:image/')) {
                            // Validate it has base64 data
                            if (!imageSrc.includes('base64,')) {
                              return null
                            }
                          } else if (
                            imageSrc.startsWith('http://') ||
                            imageSrc.startsWith('https://')
                          ) {
                            // HTTP(S) URL, use as is
                          } else {
                            // Assume it's base64 without prefix
                            // Check if it looks like base64
                            const base64Pattern = /^[A-Za-z0-9+/=\s]+$/
                            const cleaned = imageSrc.replace(/\s/g, '') // Remove whitespace


                            if (base64Pattern.test(cleaned) && cleaned.length > 50) {
                              // It's likely base64, add prefix
                              imageSrc = `data:image/jpeg;base64,${cleaned}`
                            } else {
                              // If it's very short, might be incomplete
                              if (cleaned.length < 50) {
                                return null
                              }
                              // Try as base64 anyway
                              imageSrc = `data:image/jpeg;base64,${cleaned}`
                            }
                          }


                          // Skip if imageSrc is null (invalid)
                          if (!imageSrc) {
                            return null
                          }


                          return (
                            <ImageListItem key={`${newsItem.newsId}-img-${index}`}>
                              <img
                                src={imageSrc}
                                alt={`News ${newsItem.newsId} - ${index + 1}`}
                                style={{
                                  width: '100%',
                                  height: '200px',
                                  objectFit: 'cover',
                                  borderRadius: '12px',
                                  border: '2px solid #e0e0e0',
                                  backgroundColor: '#f5f5f5' // Show background while loading
                                }}
                                onError={(e) => {
                                  console.error(
                                    `Failed to load image ${index} for news ${newsItem.newsId}`
                                  )
                                  console.error(
                                    'Image src type:',
                                    imageSrc.startsWith('data:') ? 'data URL' : 'other'
                                  )
                                  console.error('Image src length:', imageSrc.length)
                                  console.error(
                                    'Image src (first 200 chars):',
                                    imageSrc.substring(0, 200)
                                  )
                                  console.error('Has base64,:', imageSrc.includes('base64,'))


                                  // Try alternative: maybe it needs different format
                                  if (imageSrc.includes('base64,')) {
                                    const base64Part = imageSrc.split('base64,')[1]
                                    console.error('Base64 part length:', base64Part?.length)


                                    if (base64Part && base64Part.length > 50) {
                                      // Try with different image type
                                      const alternatives = [
                                        `data:image/png;base64,${base64Part}`,
                                        `data:image/jpeg;base64,${base64Part}`,
                                        `data:image/jpg;base64,${base64Part}`,
                                        `data:image/webp;base64,${base64Part}`
                                      ]


                                      let tried = 0
                                      const tryNext = () => {
                                        if (tried < alternatives.length) {
                                          console.log(
                                            `Trying alternative ${tried + 1}: ${alternatives[tried].substring(0, 50)}...`
                                          )
                                          e.currentTarget.src = alternatives[tried]
                                          tried++
                                        } else {
                                          // All alternatives failed, show placeholder
                                          console.error(
                                            'All alternatives failed, showing placeholder'
                                          )
                                          e.currentTarget.style.display = 'flex'
                                          e.currentTarget.style.alignItems = 'center'
                                          e.currentTarget.style.justifyContent = 'center'
                                          e.currentTarget.style.backgroundColor = '#e0e0e0'
                                          e.currentTarget.alt = 'Không thể tải ảnh'
                                        }
                                      }


                                      e.currentTarget.onerror = tryNext
                                      tryNext()
                                    } else {
                                      console.error('Base64 part is too short or missing')
                                    }
                                  } else {
                                    console.error('Image src does not contain base64,')
                                  }
                                }}
                                onLoad={() => {
                                  console.log(
                                    `✅ Successfully loaded image ${index} for news ${newsItem.newsId}`
                                  )
                                }}
                              />
                            </ImageListItem>
                          )
                        })}
                    </ImageList>
                  </Box>
                )}

                <Divider sx={{ my: 2, bgcolor: 'grey.200' }} />


                {/* Actions */}
                <Box display="flex" alignItems="center" gap={2}>
                  <IconButton
                    onClick={() => handleToggleLike(newsItem.newsId)}
                    disabled={!isAuthenticated()}
                    title={
                      !isAuthenticated()
                        ? 'Vui lòng đăng nhập để thả tim tin tức'
                        : newsItem.isLiked
                          ? 'Bỏ thích'
                          : 'Thích'
                    }
                    sx={{
                      color: newsItem.isLiked ? 'error.main' : 'text.secondary',
                      opacity: !isAuthenticated() ? 0.5 : 1,
                      cursor: !isAuthenticated() ? 'not-allowed' : 'pointer',
                      '&:hover': {
                        bgcolor:
                          !isAuthenticated()
                            ? 'transparent'
                            : newsItem.isLiked
                              ? 'error.light'
                              : 'grey.100',
                        color:
                          !isAuthenticated()
                            ? 'text.secondary'
                            : newsItem.isLiked
                              ? 'error.dark'
                              : 'error.main'
                      }
                    }}
                  >
                    {newsItem.isLiked ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                  </IconButton>
                  <Typography variant="body2" color="text.secondary" fontWeight="medium">
                    {newsItem.likesCount} lượt thích
                  </Typography>
                </Box>
              </CardContent>


              {/* Menu */}
              <Menu
                anchorEl={menuAnchor[newsItem.newsId]}
                open={Boolean(menuAnchor[newsItem.newsId])}
                onClose={() => handleMenuClose(newsItem.newsId)}
              >
                {canEdit(newsItem) && (
                  <MenuItem onClick={() => handleOpenEditDialog(newsItem)}>
                    <EditIcon sx={{ mr: 1 }} fontSize="small" />
                    Chỉnh sửa
                  </MenuItem>
                )}
                {canDelete() && (
                  <MenuItem
                    onClick={() => handleOpenDeleteDialog(newsItem)}
                    sx={{ color: 'error.main' }}
                  >
                    <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
                    Xóa
                  </MenuItem>
                )}
              </Menu>
            </Card>
          ))}
        </Box>
      )}


      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={handleCloseCreateDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 4,
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          }
        }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 50%, #0d47a1 100%)',
            color: 'white',
            fontWeight: 700,
            fontSize: '1.25rem',
            py: 2.5,
            px: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            boxShadow: '0 4px 20px rgba(25, 118, 210, 0.3)',
            '&::before': {
              content: '""',
              width: 4,
              height: 28,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.5)',
            }
          }}
        >
          Tạo tin tức mới
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'transparent', pt: 4, px: 3 }}>
          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 2.5,
                mt: 1,
                borderRadius: 2,
                boxShadow: '0 4px 12px rgba(211, 47, 47, 0.15)',
              }}
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, mt: 2, color: 'text.primary' }}>
            Tiêu đề <span style={{ color: '#d32f2f' }}>*</span>
          </Typography>
          <TextField
            fullWidth
            placeholder="Nhập tiêu đề tin tức..."
            value={newTitle}
            onChange={(e) => {
              setNewTitle(e.target.value)
              if (error) setError(null)
            }}
            sx={{
              mb: 2.5,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.5,
                bgcolor: 'white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.1)',
                },
                '&:hover fieldset': {
                  borderColor: 'primary.main',
                  borderWidth: 2,
                },
                '&.Mui-focused': {
                  boxShadow: '0 4px 16px rgba(25, 118, 210, 0.2)',
                },
                '&.Mui-focused fieldset': {
                  borderWidth: 2,
                }
              }
            }}
          />
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.primary' }}>
            Nội dung <span style={{ color: '#d32f2f' }}>*</span>
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={6}
            placeholder="Nhập nội dung tin tức..."
            value={newContent}
            onChange={(e) => {
              setNewContent(e.target.value)
              if (error) setError(null)
            }}
            sx={{
              mb: 2.5,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.5,
                bgcolor: 'white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.1)',
                },
                '&:hover fieldset': {
                  borderColor: 'primary.main',
                  borderWidth: 2,
                },
                '&.Mui-focused': {
                  boxShadow: '0 4px 16px rgba(25, 118, 210, 0.2)',
                },
                '&.Mui-focused fieldset': {
                  borderWidth: 2,
                }
              }
            }}
          />
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.primary' }}>
            Hình ảnh <span style={{ color: '#d32f2f' }}>*</span>
          </Typography>
          <Box mb={2.5}>
            <input
              accept="image/*"
              style={{ display: 'none' }}
              id="create-image-upload"
              type="file"
              multiple
              onChange={handleImageSelect}
            />
            <label htmlFor="create-image-upload">
              <Button
                variant="outlined"
                component="span"
                startIcon={<ImageIcon />}
                sx={{
                  borderRadius: 2.5,
                  borderWidth: 2,
                  borderColor: 'primary.main',
                  color: 'primary.main',
                  px: 3,
                  py: 1.2,
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderWidth: 2,
                    borderColor: 'primary.dark',
                    background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
                    color: 'white',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                  }
                }}
              >
                Thêm hình ảnh
              </Button>
            </label>
          </Box>
          {newImagePreviews.length > 0 && (
            <Box display="flex" flexWrap="wrap" gap={1.5} mb={2.5}>
              {newImagePreviews.map((preview, index) => (
                <Box
                  key={index}
                  position="relative"
                  sx={{
                    width: 120,
                    height: 120,
                    borderRadius: 3,
                    overflow: 'hidden',
                    border: '3px solid',
                    borderColor: 'primary.light',
                    boxShadow: '0 4px 12px rgba(25, 118, 210, 0.15)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: '0 8px 20px rgba(25, 118, 210, 0.25)',
                    }
                  }}
                >
                  <img
                    src={preview}
                    alt={`Preview ${index}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removeNewImage(index)}
                    sx={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      bgcolor: 'error.main',
                      color: 'white',
                      width: 28,
                      height: 28,
                      boxShadow: '0 2px 8px rgba(211, 47, 47, 0.4)',
                      '&:hover': {
                        bgcolor: 'error.dark',
                        transform: 'scale(1.15)',
                        boxShadow: '0 4px 12px rgba(211, 47, 47, 0.5)',
                      }
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions
          sx={{
            bgcolor: 'transparent',
            px: 3,
            pb: 3,
            pt: 1,
            gap: 1.5,
          }}
        >
          <Button
            onClick={handleCloseCreateDialog}
            sx={{
              color: 'text.secondary',
              borderRadius: 2.5,
              px: 3,
              py: 1,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: 'grey.100',
                color: 'text.primary',
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleCreateNews}
            variant="contained"
            disabled={creating || !newTitle.trim() || !newContent.trim() || newImages.length === 0}
            sx={{
              borderRadius: 2.5,
              px: 4,
              py: 1,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
              boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(25, 118, 210, 0.4)',
              },
              '&:disabled': {
                background: 'linear-gradient(135deg, #bdbdbd 0%, #9e9e9e 100%)',
                boxShadow: 'none',
              }
            }}
          >
            {creating ? <CircularProgress size={20} color="inherit" /> : 'Tạo'}
          </Button>
        </DialogActions>
      </Dialog>


      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={handleCloseEditDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 4,
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          }
        }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 50%, #6a1b9a 100%)',
            color: 'white',
            fontWeight: 700,
            fontSize: '1.25rem',
            py: 2.5,
            px: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            boxShadow: '0 4px 20px rgba(156, 39, 176, 0.3)',
            '&::before': {
              content: '""',
              width: 4,
              height: 28,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.5)',
            }
          }}
        >
          Chỉnh sửa tin tức
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'transparent', pt: 4, px: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={6}
            placeholder="Nhập nội dung tin tức..."
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            sx={{
              mb: 2.5,
              mt: 2,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.5,
                bgcolor: 'white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(156, 39, 176, 0.1)',
                },
                '&:hover fieldset': {
                  borderColor: 'secondary.main',
                  borderWidth: 2,
                },
                '&.Mui-focused': {
                  boxShadow: '0 4px 16px rgba(156, 39, 176, 0.2)',
                },
                '&.Mui-focused fieldset': {
                  borderWidth: 2,
                }
              }
            }}
          />
          <Box mb={2.5}>
            <input
              accept="image/*"
              style={{ display: 'none' }}
              id="edit-image-upload"
              type="file"
              multiple
              onChange={handleEditImageSelect}
            />
            <label htmlFor="edit-image-upload">
              <Button
                variant="outlined"
                component="span"
                startIcon={<ImageIcon />}
                sx={{
                  borderRadius: 2.5,
                  borderWidth: 2,
                  borderColor: 'secondary.main',
                  color: 'secondary.main',
                  px: 3,
                  py: 1.2,
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderWidth: 2,
                    borderColor: 'secondary.dark',
                    background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
                    color: 'white',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(156, 39, 176, 0.3)',
                  }
                }}
              >
                Thêm hình ảnh mới
              </Button>
            </label>
          </Box>
          {(editImages.length > 0 || editNewImagePreviews.length > 0) && (
            <Box display="flex" flexWrap="wrap" gap={1.5} mb={2.5}>
              {editImages.map((image, index) => (
                <Box
                  key={`existing-${index}`}
                  position="relative"
                  sx={{
                    width: 120,
                    height: 120,
                    borderRadius: 3,
                    overflow: 'hidden',
                    border: '3px solid',
                    borderColor: 'secondary.light',
                    boxShadow: '0 4px 12px rgba(156, 39, 176, 0.15)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: '0 8px 20px rgba(156, 39, 176, 0.25)',
                    }
                  }}
                >
                  <img
                    src={image}
                    alt={`Existing ${index}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removeEditImage(index, false)}
                    sx={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      bgcolor: 'error.main',
                      color: 'white',
                      width: 28,
                      height: 28,
                      boxShadow: '0 2px 8px rgba(211, 47, 47, 0.4)',
                      '&:hover': {
                        bgcolor: 'error.dark',
                        transform: 'scale(1.15)',
                        boxShadow: '0 4px 12px rgba(211, 47, 47, 0.5)',
                      }
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              {editNewImagePreviews.map((preview, index) => (
                <Box
                  key={`new-${index}`}
                  position="relative"
                  sx={{
                    width: 120,
                    height: 120,
                    borderRadius: 3,
                    overflow: 'hidden',
                    border: '3px solid',
                    borderColor: 'primary.light',
                    boxShadow: '0 4px 12px rgba(25, 118, 210, 0.15)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: '0 8px 20px rgba(25, 118, 210, 0.25)',
                    }
                  }}
                >
                  <img
                    src={preview}
                    alt={`New ${index}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removeEditImage(index, true)}
                    sx={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      bgcolor: 'error.main',
                      color: 'white',
                      width: 28,
                      height: 28,
                      boxShadow: '0 2px 8px rgba(211, 47, 47, 0.4)',
                      '&:hover': {
                        bgcolor: 'error.dark',
                        transform: 'scale(1.15)',
                        boxShadow: '0 4px 12px rgba(211, 47, 47, 0.5)',
                      }
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions
          sx={{
            bgcolor: 'transparent',
            px: 3,
            pb: 3,
            pt: 1,
            gap: 1.5,
          }}
        >
          <Button
            onClick={handleCloseEditDialog}
            sx={{
              color: 'text.secondary',
              borderRadius: 2.5,
              px: 3,
              py: 1,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: 'grey.100',
                color: 'text.primary',
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleUpdateNews}
            variant="contained"
            disabled={
              updating ||
              (!editContent.trim() && editImages.length === 0 && editNewImages.length === 0)
            }
            sx={{
              borderRadius: 2.5,
              px: 4,
              py: 1,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
              boxShadow: '0 4px 12px rgba(156, 39, 176, 0.3)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'linear-gradient(135deg, #7b1fa2 0%, #6a1b9a 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(156, 39, 176, 0.4)',
              },
              '&:disabled': {
                background: 'linear-gradient(135deg, #bdbdbd 0%, #9e9e9e 100%)',
                boxShadow: 'none',
              }
            }}
          >
            {updating ? <CircularProgress size={20} color="inherit" /> : 'Lưu'}
          </Button>
        </DialogActions>
      </Dialog>


      {/* Delete Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        PaperProps={{
          sx: {
            borderRadius: 4,
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            background: 'linear-gradient(180deg, #ffffff 0%, #fef2f2 100%)',
            minWidth: 400,
          }
        }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)',
            color: 'white',
            fontWeight: 700,
            fontSize: '1.25rem',
            py: 2.5,
            px: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            boxShadow: '0 4px 20px rgba(239, 68, 68, 0.3)',
            '&::before': {
              content: '""',
              width: 4,
              height: 28,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.5)',
            }
          }}
        >
          Xác nhận xóa
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'transparent', pt: 4, px: 3 }}>
          <DialogContentText
            sx={{
              color: 'text.primary',
              fontSize: '1rem',
              lineHeight: 1.6,
              p: 2,
              mt: 1,
              bgcolor: 'rgba(239, 68, 68, 0.05)',
              borderRadius: 2,
              border: '1px solid rgba(239, 68, 68, 0.1)',
            }}
          >
            Bạn có chắc chắn muốn xóa tin tức này? Hành động này không thể hoàn tác.
          </DialogContentText>
        </DialogContent>
        <DialogActions
          sx={{
            bgcolor: 'transparent',
            px: 3,
            pb: 3,
            pt: 1,
            gap: 1.5,
          }}
        >
          <Button
            onClick={handleCloseDeleteDialog}
            sx={{
              color: 'text.secondary',
              borderRadius: 2.5,
              px: 3,
              py: 1,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: 'grey.100',
                color: 'text.primary',
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleDeleteNews}
            variant="contained"
            disabled={deleting}
            sx={{
              borderRadius: 2.5,
              px: 4,
              py: 1,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(239, 68, 68, 0.4)',
              },
              '&:disabled': {
                background: 'linear-gradient(135deg, #bdbdbd 0%, #9e9e9e 100%)',
                boxShadow: 'none',
              }
            }}
          >
            {deleting ? <CircularProgress size={20} color="inherit" /> : 'Xóa'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}




