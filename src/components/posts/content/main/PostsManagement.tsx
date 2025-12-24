import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
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
  DialogContentText,
  Select,
  FormControl,
  InputLabel,
  Snackbar
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Image as ImageIcon,
  Close as CloseIcon,
  ThumbUpAlt as LikeIcon,
  ThumbUpOffAlt as LikeBorderIcon,
  Comment as CommentIcon,
  Send as SendIcon,
  Favorite as FavoriteIcon,
  Article as ArticleIcon
} from '@mui/icons-material'
import { uploadImageToFirebase } from '~/services/firebaseStorage'
import { useNotification } from '~/contexts/NotificationContext'
import {
  fetchAllPosts,
  createPost,
  updatePost,
  deletePost,
  approvePost,
  rejectPost,
  reactToPost,
  fetchPostById,
  fetchCommentsByPost,
  createComment,
  updateComment,
  deleteComment,
  toggleCommentLike,
  type PostDto,
  type CreatePostDto,
  type UpdatePostDto,
  type PostComment,
  type PostCommentReply
} from '~/api/instances/PostsApi'
import { getApprovedTime } from '~/api/instances/PostApprovalApi'
import { saveApprovalTimeToFirestore, getAllApprovalTimesFromFirestore } from '~/services/postApprovalService'

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

// ĐÃ BỎ dữ liệu ảo cho bài viết (MOCK_POSTS) theo yêu cầu, chỉ dùng dữ liệu thật từ backend

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'approved':
      return 'success'
    case 'pending':
      return 'warning'
    case 'rejected':
      return 'error'
    default:
      return 'default'
  }
}

// Reaction types for posts - map sang ReactionTypeId trong backend
// Backend mapping: 1 Like, 2 Love, 3 Haha, 4 Wow, 5 Sad, 6 Angry
type ReactionKey = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry'

const REACTION_ID_MAP: Record<ReactionKey, number> = {
  like: 1,
  love: 2,
  haha: 3,
  wow: 4,
  sad: 5,
  angry: 6
}

const REACTIONS: { key: ReactionKey; label: string; emoji: string }[] = [
  { key: 'like', label: 'Thích', emoji: '👍' },
  { key: 'love', label: 'Tim', emoji: '❤️' },
  { key: 'haha', label: 'Haha', emoji: '😂' },
  { key: 'wow', label: 'Wow', emoji: '😮' },
  { key: 'sad', label: 'Buồn', emoji: '😢' },
  { key: 'angry', label: 'Phẫn nộ', emoji: '😡' }
]

const formatTimeAgo = (dateString?: string, postId?: number | string) => {
  // Ưu tiên sử dụng thời gian phê duyệt từ localStorage nếu có
  // Để hiển thị "vừa xong" khi bài viết mới được Admin phê duyệt
  let effectiveDate = dateString
  if (postId) {
    const approvedTime = getApprovedTime(postId)
    if (approvedTime) {
      effectiveDate = approvedTime
    }
  }
  
  if (!effectiveDate) return 'Vừa xong'

  try {
    let date: Date
    
    // Thử parse với nhiều format khác nhau
    // Backend có thể trả về format "dd/MM/yyyy HH:mm" hoặc ISO format
    if (effectiveDate.includes('/')) {
      const parts = effectiveDate.split(' ')
      const dateParts = parts[0].split('/')
      if (dateParts.length === 3) {
        const day = parseInt(dateParts[0], 10)
        const month = parseInt(dateParts[1], 10) - 1
        const year = parseInt(dateParts[2], 10)
        
        if (parts.length > 1 && parts[1]?.includes(':')) {
          const timeParts = parts[1].split(':')
          const hours = parseInt(timeParts[0], 10)
          const minutes = parseInt(timeParts[1], 10)
          // Tạo date với UTC vì backend lưu UTC
          date = new Date(Date.UTC(year, month, day, hours, minutes))
        } else {
          date = new Date(Date.UTC(year, month, day))
        }
      } else {
        date = new Date(effectiveDate)
      }
    } else {
      // ISO format - backend trả về UTC nhưng có thể không có 'Z'
      // Nếu không có timezone indicator, coi như UTC
      if (!effectiveDate.endsWith('Z') && !effectiveDate.includes('+') && !effectiveDate.includes('-', 10)) {
        date = new Date(effectiveDate + 'Z')
      } else {
        date = new Date(effectiveDate)
      }
    }
    
    // Kiểm tra date có hợp lệ không
    if (isNaN(date.getTime())) {
      return 'Vừa xong'
    }
    
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 0) return 'Vừa xong' // Trường hợp thời gian trong tương lai
    if (diffMins < 1) return 'Vừa xong'
    if (diffMins < 60) return `${diffMins} phút trước`
    if (diffHours < 24) return `${diffHours} giờ trước`
    if (diffDays < 30) return `${diffDays} ngày trước`
    return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  } catch {
    return 'Vừa xong'
  }
}

// Helper function to count total comments including all nested replies
const countTotalComments = (comments: PostComment[]): number => {
  let total = 0
  
  const countReplies = (replies: PostCommentReply[] | undefined): number => {
    if (!replies || replies.length === 0) return 0
    let count = replies.length
    for (const reply of replies) {
      if (reply.replies && reply.replies.length > 0) {
        count += countReplies(reply.replies)
      }
    }
    return count
  }
  
  for (const comment of comments) {
    total += 1 // Count the parent comment
    total += countReplies(comment.replies) // Count all nested replies
  }
  
  return total
}

export default function PostsManagement() {
  const [posts, setPosts] = useState<PostDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity?: 'success' | 'error' | 'warning' | 'info'
  }>({ open: false, message: '' })

  // Likes Dialog State
  const [likesDialogOpen, setLikesDialogOpen] = useState(false)
  const [selectedPostLikes, setSelectedPostLikes] = useState<PostDto['likes']>([])
  const [_selectedPostTitle, setSelectedPostTitle] = useState('')
  
  // Comment Likes Dialog State
  const [commentLikesDialogOpen, setCommentLikesDialogOpen] = useState(false)
  const [selectedCommentLikes, setSelectedCommentLikes] = useState<PostComment['likes']>([])
  const [_selectedCommentContent, setSelectedCommentContent] = useState('')
  // Hiển thị popup reaction khi hover vào nút like
  const [reactionMenuPostId, setReactionMenuPostId] = useState<number | null>(null)
  const reactionHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Create Post State
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newImages, setNewImages] = useState<File[]>([])
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  // Edit Post State
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<PostDto | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editImages, setEditImages] = useState<string[]>([])
  const [editNewImages, setEditNewImages] = useState<File[]>([])
  const [editNewImagePreviews, setEditNewImagePreviews] = useState<string[]>([])
  const [updating, setUpdating] = useState(false)

  // Delete Post State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingPost, setDeletingPost] = useState<PostDto | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Approve/Reject State
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [reviewingPost, setReviewingPost] = useState<PostDto | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const [reviewing, setReviewing] = useState(false)

  // Helpers cho reaction menu (giữ menu mở lâu hơn một chút)
  const showReactionMenu = (postId: number) => {
    if (reactionHideTimeoutRef.current) {
      clearTimeout(reactionHideTimeoutRef.current)
      reactionHideTimeoutRef.current = null
    }
    setReactionMenuPostId(postId)
  }

  const scheduleHideReactionMenu = (postId: number) => {
    if (reactionHideTimeoutRef.current) {
      clearTimeout(reactionHideTimeoutRef.current)
    }
    reactionHideTimeoutRef.current = setTimeout(() => {
      setReactionMenuPostId((current) => (current === postId ? null : current))
      reactionHideTimeoutRef.current = null
    }, 400) // giữ thêm ~0.4s sau khi rời chuột
  }

  // Menu State
  const [menuAnchor, setMenuAnchor] = useState<{ [key: number]: HTMLElement | null }>({})

  // Like State
  const [likingPosts, setLikingPosts] = useState<Set<number>>(new Set())

  // Comment State
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set())
  const [postComments, setPostComments] = useState<{ [postId: number]: PostComment[] }>({})
  const [commentTexts, setCommentTexts] = useState<{ [postId: number]: string }>({})
  const [editingComments, setEditingComments] = useState<{ [commentId: string]: string }>({})
  const [creatingComment, setCreatingComment] = useState<{ [postId: number]: boolean }>({})
  const [updatingComment, setUpdatingComment] = useState<Set<string>>(new Set())
  const [deletingComment, setDeletingComment] = useState<Set<string>>(new Set())
  const [likingComments, setLikingComments] = useState<Set<string>>(new Set())
  
  // Reply Comment State
  const [replyingTo, setReplyingTo] = useState<{ postId: number; commentId: string; authorName: string } | null>(null)
  const [replyText, setReplyText] = useState('')
  const [creatingReply, setCreatingReply] = useState(false)

  // Delete Comment Confirm Dialog State
  const [deleteCommentDialogOpen, setDeleteCommentDialogOpen] = useState(false)
  const [deletingCommentInfo, setDeletingCommentInfo] = useState<{ commentId: string; postId: number; authorId?: number; isOwnContent?: boolean } | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteReasonError, setDeleteReasonError] = useState('')
  
  // Ref để track các comment IDs đã bị xóa trong session (tránh hiển thị lại sau polling)
  const deletedCommentIdsRef = useRef<Set<string>>(new Set())

  // Delete Post with Reason State (for deleting others' posts)
  const [deletePostReasonDialogOpen, setDeletePostReasonDialogOpen] = useState(false)
  const [deletingPostWithReason, setDeletingPostWithReason] = useState<PostDto | null>(null)
  const [deletePostReason, setDeletePostReason] = useState('')
  const [deletePostReasonError, setDeletePostReasonError] = useState('')

  // Get current user - make it a state so it can be updated
  const [currentUser, setCurrentUser] = useState<any>(null)

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

  // Load user info on mount and when profile is updated
  useEffect(() => {
    const loadUserInfo = () => {
      const user = getCurrentUser()
      setCurrentUser(user)
    }

    loadUserInfo()

    // Listen for profile update events
    const handleProfileUpdate = () => {
      console.log('Profile updated event received in PostsManagement, reloading userInfo...')
      loadUserInfo()
    }

    window.addEventListener('userProfileUpdated', handleProfileUpdate)

    // Reload when window gets focus
    const handleFocus = () => {
      loadUserInfo()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('userProfileUpdated', handleProfileUpdate)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const isAdmin =
    currentUser?.role === 'Admin' ||
    currentUser?.roleName === 'Admin' ||
    currentUser?.Role === 'Admin' ||
    currentUser?.roleId === 1 ||
    currentUser?.roleId === '1' ||
    currentUser?.RoleId === 1 ||
    currentUser?.RoleId === '1'
  const isAuthenticated = !!currentUser

  // Helper function để filter ra các comments đã bị xóa trong session
  const filterDeletedComments = (comments: PostComment[]): PostComment[] => {
    const filterRecursive = (commentList: PostComment[]): PostComment[] => {
      return commentList
        .filter(comment => {
          const commentId = comment.postCommentId || String(comment.id || '')
          return !deletedCommentIdsRef.current.has(commentId)
        })
        .map(comment => ({
          ...comment,
          replies: comment.replies ? filterRecursive(comment.replies as unknown as PostComment[]) as unknown as PostCommentReply[] : []
        }))
    }
    return filterRecursive(comments)
  }

  // Debug: Log current user info
  useEffect(() => {
    if (currentUser) {
      console.log('Current User Info:', {
        id: currentUser.id,
        Id: currentUser.Id,
        userId: currentUser.userId,
        UserId: currentUser.UserId,
        ID: currentUser.ID,
        avatar: currentUser.avatar || currentUser.Avatar,
        allKeys: Object.keys(currentUser)
      })
    }
  }, [currentUser])

  // Lấy reaction hiện tại của user cho 1 post (nếu có)
  const getCurrentUserReaction = (post: PostDto): ReactionKey | null => {
    if (!currentUser) return null
    
    // Kiểm tra cả likesCount và likes array
    // Nếu likesCount = 0 thì chắc chắn không có reaction
    if (post.likesCount === 0) {
      return null
    }
    
    if (!post.likes || !Array.isArray(post.likes) || post.likes.length === 0) {
      console.log('[getCurrentUserReaction] No likes array or empty:', post.postId, post.likes)
      return null
    }

    const userId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      null
    if (!userId) return null

    const userIdStr = String(userId)
    const userLike = post.likes.find((like) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const likeAccountId = String(like.accountId ?? (like as any).AccountId ?? '')
      return likeAccountId === userIdStr
    })
    
    if (!userLike) {
      console.log('[getCurrentUserReaction] User not found in likes:', post.postId, userIdStr, post.likes)
      return null
    }

    // Kiểm tra xem có reactionType hợp lệ không
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawType = (userLike.reactionType ?? (userLike as any).ReactionType ?? '').toString().toLowerCase().trim()
    console.log('[getCurrentUserReaction] Found user reaction:', post.postId, rawType, userLike)
    if (!rawType || rawType === '' || rawType === 'null' || rawType === 'undefined') {
      return null // Không có reaction hợp lệ
    }
    
    switch (rawType) {
      case 'like':
        return 'like'
      case 'love':
        return 'love'
      case 'haha':
        return 'haha'
      case 'wow':
        return 'wow'
      case 'sad':
        return 'sad'
      case 'angry':
        return 'angry'
      default:
        return null // Không nhận dạng được reaction type
    }
  }

  const getReactionDisplay = (reaction: ReactionKey | null) => {
    if (!reaction) return { label: 'Thích', emoji: '👍' }
    return REACTIONS.find((r) => r.key === reaction) ?? { label: 'Thích', emoji: '👍' }
  }

  // Load Posts
  useEffect(() => {
    loadPosts()

    // Polling mỗi 2 giây để cập nhật bài viết gần như realtime
    const pollInterval = setInterval(() => {
      loadPostsSilent()
    }, 2000)

    // Refresh ngay khi user quay lại tab này
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadPostsSilent()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Refresh ngay khi window được focus
    const handleFocus = () => {
      loadPostsSilent()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Load posts không hiển thị loading (dùng cho polling)
  const loadPostsSilent = async () => {
    try {
      const data = await fetchAllPosts()
      
      // Fetch comments cho tất cả posts để có số đếm chính xác
      if (data && data.length > 0) {
        const updatedPosts = await Promise.all(
          data.map(async (post) => {
            try {
              const comments = await fetchCommentsByPost(post.postId)
              const filteredComments = filterDeletedComments(comments)
              const totalCount = countTotalComments(filteredComments)
              // Lưu comments vào state
              setPostComments((prev) => ({ ...prev, [post.postId]: filteredComments }))
              return { ...post, commentsCount: totalCount }
            } catch (err) {
              console.error(`Error fetching comments for post ${post.postId}:`, err)
              return post
            }
          })
        )
        setPosts(updatedPosts)
      } else {
        setPosts(data || [])
      }
    } catch (err) {
      console.error('Error polling posts:', err)
    }
  }

  const loadPosts = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchAllPosts()
      
      // Fetch comments cho tất cả posts để có số đếm chính xác
      if (data && data.length > 0) {
        const updatedPosts = await Promise.all(
          data.map(async (post) => {
            try {
              const comments = await fetchCommentsByPost(post.postId)
              const filteredComments = filterDeletedComments(comments)
              const totalCount = countTotalComments(filteredComments)
              // Lưu comments vào state
              setPostComments((prev) => ({ ...prev, [post.postId]: filteredComments }))
              return { ...post, commentsCount: totalCount }
            } catch (err) {
              console.error(`Error fetching comments for post ${post.postId}:`, err)
              return post // Giữ nguyên commentsCount từ backend nếu lỗi
            }
          })
        )
        setPosts(updatedPosts)
        
        // Auto-sync approval times cho các bài đã approved mà chưa có trong Firestore
        syncApprovalTimesForApprovedPosts(updatedPosts)
      } else {
        setPosts(data || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách bài viết')
      console.error('Error loading posts:', err)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  // Sync approval times cho các bài đã approved mà chưa có trong Firestore
  const syncApprovalTimesForApprovedPosts = async (posts: PostDto[]) => {
    try {
      // Lấy tất cả approval times hiện có từ Firestore
      const existingTimes = await getAllApprovalTimesFromFirestore()
      
      // Tìm các bài đã approved nhưng chưa có approval time
      const approvedPostsWithoutTime = posts.filter(post => {
        const isApproved = post.status?.toLowerCase() === 'approved'
        const hasApprovalTime = existingTimes[String(post.postId)]
        return isApproved && !hasApprovalTime
      })
      
      // Lưu approval time cho các bài này (sử dụng publicDate hoặc createdAt làm fallback)
      for (const post of approvedPostsWithoutTime) {
        await saveApprovalTimeToFirestore(post.postId)
        console.log(`[PostsManagement] Synced approval time for post ${post.postId}`)
      }
      
      if (approvedPostsWithoutTime.length > 0) {
        console.log(`[PostsManagement] Synced ${approvedPostsWithoutTime.length} posts to Firestore`)
      }
    } catch (error) {
      console.error('[PostsManagement] Error syncing approval times:', error)
    }
  }

  // Filter Posts - optimized
  const filteredPosts = useMemo(() => {
    if (posts.length === 0) return []

    let filtered = posts

    // Loại bỏ bài viết Pending - những bài này sẽ được xem ở trang "Duyệt bài viết"
    // Loại bỏ bài viết Rejected - không hiển thị bài đã từ chối
    filtered = filtered.filter((post) => {
      const postStatus = post.status?.toLowerCase() ?? ''
      return postStatus !== 'pending' && postStatus !== 'rejected'
    })

    // Filter by search text (fast)
    if (searchText.trim()) {
      const lowerSearch = searchText.toLowerCase()
      filtered = filtered.filter((item) => {
        const title = (item.title ?? '').toLowerCase()
        const content = (item.content ?? '').toLowerCase()
        const author = (item.authorName ?? '').toLowerCase()
        return (
          title.includes(lowerSearch) ||
          content.includes(lowerSearch) ||
          author.includes(lowerSearch)
        )
      })
    }

    // Sort by approved time (from localStorage) first, then publicDate/createdAt - newest first
    // Bài viết mới duyệt sẽ hiển thị lên đầu
    filtered = [...filtered].sort((a, b) => {
      // Ưu tiên thời gian phê duyệt từ localStorage
      const approvedTimeA = getApprovedTime(a.postId)
      const approvedTimeB = getApprovedTime(b.postId)
      const dateA = new Date(approvedTimeA || a.publicDate || a.createdAt || 0).getTime()
      const dateB = new Date(approvedTimeB || b.publicDate || b.createdAt || 0).getTime()
      return dateB - dateA // Newest first
    })

    return filtered
  }, [posts, searchText])

  // Create Post Handlers
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
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const fileArray = Array.from(files).filter((file) => file.type.startsWith('image/'))

      if (fileArray.length === 0) return

      setNewImages((prev) => {
        const existingNames = new Set(prev.map((f) => f.name))
        const newFiles = fileArray.filter((f) => !existingNames.has(f.name))
        return [...prev, ...newFiles]
      })

      const previews = fileArray.map((file) => URL.createObjectURL(file))
      setNewImagePreviews((prev) => [...prev, ...previews])
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

  const handleCreatePost = async () => {
    if (!newTitle.trim() && !newContent.trim() && newImages.length === 0) {
      return
    }

    try {
      setCreating(true)
      setError(null)

      const imageUrls: string[] = []
      const processedFiles = new Set<string>()

      for (const file of newImages) {
        if (processedFiles.has(file.name)) continue

        try {
          // Upload từng ảnh lên Firebase, lấy URL
          const url = await uploadImageToFirebase(file, 'posts')
          imageUrls.push(url)
          processedFiles.add(file.name)
        } catch (fileError) {
          console.error(`Error uploading file ${file.name} to Firebase:`, fileError)
        }
      }

      if (imageUrls.length === 0 && newImages.length > 0) {
        setError('Không thể upload ảnh lên Firebase. Vui lòng thử lại với ảnh khác.')
        setCreating(false)
        return
      }

      const dto: CreatePostDto = {
        title: newTitle.trim(),
        content: newContent.trim(),
        images: imageUrls.length > 0 ? imageUrls : undefined
      }

      const newPost = await createPost(dto)
      
      // Thêm bài viết mới vào đầu danh sách thay vì reload
      setPosts((prev) => [newPost, ...prev])
      
      setSnackbar({
        open: true,
        message: 'Tạo bài viết thành công!',
        severity: 'success'
      })
      
      handleCloseCreateDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo bài viết')
      console.error('Error creating post:', err)
    } finally {
      setCreating(false)
    }
  }

  // Edit Post Handlers
  const handleOpenEditDialog = (post: PostDto) => {
    setEditingPost(post)
    setEditTitle(post.title)
    setEditContent(post.content)
    setEditImages([...post.images])
    setEditNewImages([])
    setEditNewImagePreviews([])
    setEditDialogOpen(true)
    handleMenuClose(post.postId)
  }

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false)
    setEditingPost(null)
    setEditTitle('')
    setEditContent('')
    setEditImages([])
    setEditNewImages([])
    setEditNewImagePreviews([])
  }

  const handleEditImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const fileArray = Array.from(files).filter((file) => file.type.startsWith('image/'))
      setEditNewImages((prev) => [...prev, ...fileArray])

      const previews = fileArray.map((file) => URL.createObjectURL(file))
      setEditNewImagePreviews((prev) => [...prev, ...previews])
      e.target.value = ''
    }
  }

  const removeEditImage = (index: number, isNew: boolean) => {
    if (isNew) {
      setEditNewImages((prev) => prev.filter((_, i) => i !== index))
      setEditNewImagePreviews((prev) => {
        URL.revokeObjectURL(prev[index])
        return prev.filter((_, i) => i !== index)
      })
    } else {
      setEditImages((prev) => prev.filter((_, i) => i !== index))
    }
  }

  const handleUpdatePost = async () => {
    if (!editingPost) return

    try {
      setUpdating(true)
      setError(null)

      const newImageUrls: string[] = []

      for (const file of editNewImages) {
        try {
          const url = await uploadImageToFirebase(file, 'posts')
          newImageUrls.push(url)
        } catch (fileError) {
          console.error(`Error uploading edit image ${file.name} to Firebase:`, fileError)
        }
      }

      const allImages = [...editImages, ...newImageUrls]

      const dto: UpdatePostDto = {
        title: editTitle.trim() || undefined,
        content: editContent.trim() || undefined,
        images: allImages.length > 0 ? allImages : undefined
      }

      await updatePost(editingPost.postId, dto)
      
      // Cập nhật bài viết trong state thay vì reload
      setPosts((prev) =>
        prev.map((p) =>
          p.postId === editingPost.postId
            ? {
                ...p,
                title: editTitle.trim() || p.title,
                content: editContent.trim() || p.content,
                images: allImages.length > 0 ? allImages : p.images
              }
            : p
        )
      )
      
      setSnackbar({
        open: true,
        message: 'Cập nhật bài viết thành công!',
        severity: 'success'
      })
      
      handleCloseEditDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật bài viết')
      console.error('Error updating post:', err)
    } finally {
      setUpdating(false)
    }
  }

  // Delete Post Handlers
  const handleOpenDeleteDialog = (post: PostDto) => {
    // Kiểm tra xem có phải xóa bài của chính mình không
    const isOwn = isOwnContent(post.authorId)
    
    if (isOwn) {
      // Xóa bài của mình - không cần lý do
      setDeletingPost(post)
      setDeleteDialogOpen(true)
    } else {
      // Xóa bài của người khác - cần nhập lý do
      setDeletingPostWithReason(post)
      setDeletePostReason('')
      setDeletePostReasonError('')
      setDeletePostReasonDialogOpen(true)
    }
    handleMenuClose(post.postId)
  }

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setDeletingPost(null)
  }

  const handleCloseDeletePostReasonDialog = () => {
    setDeletePostReasonDialogOpen(false)
    setDeletingPostWithReason(null)
    setDeletePostReason('')
    setDeletePostReasonError('')
  }

  const handleDeletePost = async () => {
    if (!deletingPost) return

    try {
      setDeleting(true)
      await deletePost(deletingPost.postId)

      // Remove from local state immediately for better UX - không reload trang
      setPosts((prev) => prev.filter((p) => p.postId !== deletingPost.postId))

      handleCloseDeleteDialog()
      setSnackbar({ open: true, message: 'Đã xóa bài viết', severity: 'success' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa bài viết')
      console.error('Error deleting post:', err)
    } finally {
      setDeleting(false)
    }
  }

  const handleDeletePostWithReason = async () => {
    if (!deletingPostWithReason) return

    // Phải có lý do khi xóa bài của người khác
    if (!deletePostReason.trim()) {
      setDeletePostReasonError('Vui lòng nhập lý do xóa bài viết')
      return
    }

    try {
      setDeleting(true)
      // TODO: Gửi deletePostReason đến backend để thông báo cho người dùng
      await deletePost(deletingPostWithReason.postId)

      // Remove from local state immediately for better UX - không reload trang
      setPosts((prev) => prev.filter((p) => p.postId !== deletingPostWithReason.postId))

      handleCloseDeletePostReasonDialog()
      setSnackbar({ open: true, message: 'Đã xóa bài viết', severity: 'success' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa bài viết')
      console.error('Error deleting post:', err)
    } finally {
      setDeleting(false)
    }
  }

  // Approve/Reject Handlers
  const handleOpenApproveDialog = (post: PostDto) => {
    setReviewingPost(post)
    setApproveDialogOpen(true)
    handleMenuClose(post.postId)
  }

  const handleCloseApproveDialog = () => {
    setApproveDialogOpen(false)
    setReviewingPost(null)
  }

  const handleApprovePost = async () => {
    if (!reviewingPost) return

    try {
      setReviewing(true)
      await approvePost(reviewingPost.postId)
      
      // Cập nhật status trong state thay vì reload
      setPosts((prev) =>
        prev.map((p) =>
          p.postId === reviewingPost.postId
            ? { ...p, status: 'Approved', publicDate: new Date().toISOString() }
            : p
        )
      )
      
      setSnackbar({
        open: true,
        message: 'Đã duyệt bài viết thành công!',
        severity: 'success'
      })
      
      handleCloseApproveDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể duyệt bài viết')
      console.error('Error approving post:', err)
    } finally {
      setReviewing(false)
    }
  }

  const handleOpenRejectDialog = (post: PostDto) => {
    setReviewingPost(post)
    setRejectComment('')
    setRejectDialogOpen(true)
    handleMenuClose(post.postId)
  }

  const handleCloseRejectDialog = () => {
    setRejectDialogOpen(false)
    setReviewingPost(null)
    setRejectComment('')
  }

  const handleRejectPost = async () => {
    if (!reviewingPost || !rejectComment.trim()) return

    try {
      setReviewing(true)
      await rejectPost(reviewingPost.postId, rejectComment.trim())
      
      // Cập nhật status trong state thay vì reload
      setPosts((prev) =>
        prev.map((p) =>
          p.postId === reviewingPost.postId
            ? { ...p, status: 'Rejected', rejectComment: rejectComment.trim() }
            : p
        )
      )
      
      setSnackbar({
        open: true,
        message: 'Đã từ chối bài viết',
        severity: 'success'
      })
      
      handleCloseRejectDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể từ chối bài viết')
      console.error('Error rejecting post:', err)
    } finally {
      setReviewing(false)
    }
  }

  // Menu Handlers
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, postId: number) => {
    setMenuAnchor((prev) => ({ ...prev, [postId]: event.currentTarget }))
  }

  const handleMenuClose = (postId: number) => {
    setMenuAnchor((prev) => ({ ...prev, [postId]: null }))
  }

  // Chỉ có thể edit bài viết của chính mình (kể cả Admin)
  const canEdit = (post: PostDto) => {
    if (!currentUser) return false

    // Check multiple possible user ID fields from currentUser
    const userId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      0
    const postAuthorId = post.authorId ?? 0

    // Convert to numbers for comparison (handle both string and number)
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId)
    const authorIdNum =
      typeof postAuthorId === 'string' ? parseInt(String(postAuthorId), 10) : Number(postAuthorId)

    return userIdNum === authorIdNum && userIdNum > 0
  }

  // Admin có thể delete bất kỳ bài viết nào, user thường chỉ delete của mình
  const canDelete = (post: PostDto) => {
    // Admin có thể delete bất kỳ bài viết nào
    if (isAdmin) return true

    if (!currentUser) return false

    // Check multiple possible user ID fields from currentUser
    const userId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      0
    const postAuthorId = post.authorId ?? 0

    // Convert to numbers for comparison (handle both string and number)
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId)
    const authorIdNum =
      typeof postAuthorId === 'string' ? parseInt(String(postAuthorId), 10) : Number(postAuthorId)

    return userIdNum === authorIdNum && userIdNum > 0
  }

  // Helper để kiểm tra có thể edit hoặc delete (dùng cho menu button)
  const canEditOrDelete = (post: PostDto) => {
    return canEdit(post) || canDelete(post)
  }

  // Reaction handler: chọn/bỏ reaction, gửi reactionTypeId tương ứng xuống backend
  // Optimistic update: cập nhật UI ngay lập tức, không cần reload trang
  const handleReactionClick = async (post: PostDto, reaction: ReactionKey) => {
    // Double check authentication
    if (!isAuthenticated || !currentUser) {
      const message = 'Vui lòng đăng nhập để bày tỏ cảm xúc'
      setError(message)
      setSnackbar({ open: true, message, severity: 'warning' })
      return
    }

    const reactionTypeId = REACTION_ID_MAP[reaction] ?? REACTION_ID_MAP.like
    const userId = currentUser?.id ?? currentUser?.Id ?? currentUser?.userId ?? currentUser?.UserId ?? currentUser?.ID ?? null
    
    if (!userId) {
      setSnackbar({ open: true, message: 'Không thể xác định người dùng', severity: 'error' })
      return
    }

    const userIdStr = String(userId)
    const currentLikes = Array.isArray(post.likes) ? post.likes : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingReaction = currentLikes.find((like: any) => {
      const likeAccountId = String(like.accountId ?? like.AccountId ?? '')
      return likeAccountId === userIdStr
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentReactionTypeId = (existingReaction as any)?.reactionType || (existingReaction as any)?.ReactionType
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rt = String((existingReaction as any)?.reactionType ?? (existingReaction as any)?.ReactionType ?? '').toLowerCase()
          if (rt === 'like') return 1
          if (rt === 'love') return 2
          if (rt === 'haha') return 3
          if (rt === 'wow') return 4
          if (rt === 'sad') return 5
          if (rt === 'angry') return 6
          return null
        })()
      : null

    // Nếu đã react với cùng loại -> unlike (xóa reaction)
    const isUnliking = currentReactionTypeId === reactionTypeId

    try {
      setLikingPosts((prev) => new Set(prev).add(post.postId))

      // Optimistic update: cập nhật UI ngay lập tức
      setPosts((prev) => prev.map((p) => {
        if (p.postId !== post.postId) return p

        const updatedLikes = Array.isArray(p.likes) ? [...p.likes] : []
        
        if (isUnliking) {
          // Remove reaction - filter out user's reaction completely
          const filteredLikes = updatedLikes.filter((like: any) => {
            const likeAccountId = String(like.accountId ?? like.AccountId ?? '')
            return likeAccountId !== userIdStr
          })
          console.log('[PostsManagement] Unlike - filtered likes:', filteredLikes.length, 'from', updatedLikes.length)
          return {
            ...p,
            likes: filteredLikes,
            likesCount: filteredLikes.length, // Sử dụng length thực tế thay vì trừ 1
            isLiked: false
          }
        } else {
          // Add or update reaction
          const existingIndex = updatedLikes.findIndex((like: any) => {
            const likeAccountId = String(like.accountId ?? like.AccountId ?? '')
            return likeAccountId === userIdStr
          })
          const reactionTypeNames: Record<number, string> = {
            1: 'like',
            2: 'love',
            3: 'haha',
            4: 'wow',
            5: 'sad',
            6: 'angry'
          }
          
          if (existingIndex >= 0) {
            // Update existing reaction
            updatedLikes[existingIndex] = {
              ...updatedLikes[existingIndex],
              reactionType: reactionTypeNames[reactionTypeId] ?? 'like'
            }
          } else {
            // Add new reaction
            updatedLikes.push({
              postLikeId: `temp-${Date.now()}`,
              accountId: userIdStr,
              fullName: currentUser?.name ?? currentUser?.Name ?? 'Người dùng',
              createdDate: new Date().toISOString(),
              reactionType: reactionTypeNames[reactionTypeId] ?? 'like'
            })
          }
          
          return {
            ...p,
            likes: updatedLikes,
            likesCount: existingIndex >= 0 ? (p.likesCount ?? 0) : (p.likesCount ?? 0) + 1,
            isLiked: true
          }
        }
      }))

      // Gọi API
      await reactToPost(post.postId, reactionTypeId)

      // Sau khi API thành công, reload post để lấy dữ liệu chính xác từ backend
      // Chỉ reload khi thêm/đổi reaction, không reload khi unlike để tránh race condition
      if (!isUnliking) {
        try {
          const updatedPost = await fetchPostById(post.postId)
          setPosts((prev) => prev.map((p) => (p.postId === updatedPost.postId ? updatedPost : p)))
        } catch (reloadError) {
          console.warn('[PostsManagement] Could not reload post after reaction, using optimistic update:', reloadError)
          // Giữ optimistic update nếu không reload được
        }
      }
    } catch (err) {
      // Revert optimistic update on error
      setPosts((prev) => prev.map((p) => (p.postId === post.postId ? post : p)))
      
      const errorMessage = err instanceof Error ? err.message : 'Không thể bày tỏ cảm xúc'
      setError(errorMessage)
      setSnackbar({ open: true, message: errorMessage, severity: 'error' })
      console.error('Error reacting to post:', err)
    } finally {
      setLikingPosts((prev) => {
        const next = new Set(prev)
        next.delete(post.postId)
        return next
      })
    }
  }

  // Comment Handlers
  const handleToggleComments = async (postId: number) => {
    const isExpanded = expandedComments.has(postId)

    if (isExpanded) {
      setExpandedComments((prev) => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
    } else {
      setExpandedComments((prev) => new Set(prev).add(postId))
      // Load comments if not already loaded or force reload
      try {
        setError(null) // Clear previous errors
        console.log('[PostsManagement] Loading comments for post:', postId)
        const comments = await fetchCommentsByPost(postId)
        // Filter ra các comments đã bị xóa trong session
        const filteredComments = filterDeletedComments(comments)
        const totalCount = countTotalComments(filteredComments)
        console.log('[PostsManagement] Loaded comments:', {
          postId,
          parentCount: filteredComments.length,
          totalCount,
          comments: filteredComments
        })
        setPostComments((prev) => ({ ...prev, [postId]: filteredComments }))
        
        // Update post comment count to reflect actual total (including replies)
        setPosts((prev) =>
          prev.map((p) => (p.postId === postId ? { ...p, commentsCount: totalCount } : p))
        )
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Không thể tải bình luận'
        console.error('[PostsManagement] Error loading comments:', {
          postId,
          error: err,
          message: errorMessage
        })
        setPostComments((prev) => ({ ...prev, [postId]: [] }))
        setError(errorMessage)
        setSnackbar({
          open: true,
          message: errorMessage,
          severity: 'error'
        })
      }
    }
  }

  const handleCreateComment = async (postId: number) => {
    const content = commentTexts[postId]?.trim()
    if (!content || !isAuthenticated) {
      if (!isAuthenticated) {
        setSnackbar({ open: true, message: 'Vui lòng đăng nhập để bình luận', severity: 'warning' })
      }
      return
    }

    try {
      setCreatingComment((prev) => ({ ...prev, [postId]: true }))
      setError(null) // Clear previous errors

      // Ensure comments section is expanded
      if (!expandedComments.has(postId)) {
        setExpandedComments((prev) => new Set(prev).add(postId))
      }

      console.log('[PostsManagement] Creating comment:', { postId, content })

      await createComment({
        postId: String(postId),
        content
      })

      console.log('[PostsManagement] Comment created successfully, reloading comments...')

      // Reload comments after a short delay to ensure backend has processed
      await new Promise((resolve) => setTimeout(resolve, 300))
      const comments = await fetchCommentsByPost(postId)
      // Filter ra các comments đã bị xóa trong session
      const filteredComments = filterDeletedComments(comments)

      console.log('[PostsManagement] Reloaded comments:', {
        postId,
        count: filteredComments.length,
        comments: filteredComments
      })

      setPostComments((prev) => ({ ...prev, [postId]: filteredComments }))

      // Clear comment text
      setCommentTexts((prev) => ({ ...prev, [postId]: '' }))

      // Update post comment count (including all replies)
      setPosts((prev) =>
        prev.map((p) => (p.postId === postId ? { ...p, commentsCount: countTotalComments(filteredComments) } : p))
      )

      // Show success message
      setSnackbar({ open: true, message: 'Bình luận đã được thêm', severity: 'success' })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể tạo bình luận'
      console.error('[PostsManagement] Error creating comment:', {
        postId,
        error: err,
        message: errorMessage
      })
      setError(errorMessage)
      setSnackbar({ open: true, message: errorMessage, severity: 'error' })
    } finally {
      setCreatingComment((prev) => ({ ...prev, [postId]: false }))
    }
  }

  // Handle reply to comment
  const handleStartReply = (postId: number, commentId: string, authorName: string) => {
    setReplyingTo({ postId, commentId, authorName })
    setReplyText('')
  }

  const handleCancelReply = () => {
    setReplyingTo(null)
    setReplyText('')
  }

  const handleSubmitReply = async () => {
    if (!replyingTo || !replyText.trim() || !isAuthenticated) return

    try {
      setCreatingReply(true)
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createComment({
        postId: String(replyingTo.postId),
        content: replyText.trim(),
        parentCommentId: replyingTo.commentId
      } as any)

      // Reload comments
      const comments = await fetchCommentsByPost(replyingTo.postId)
      // Filter ra các comments đã bị xóa trong session
      const filteredComments = filterDeletedComments(comments)
      setPostComments((prev) => ({ ...prev, [replyingTo.postId]: filteredComments }))

      // Update post comment count (including all replies)
      setPosts((prev) =>
        prev.map((p) => (p.postId === replyingTo.postId ? { ...p, commentsCount: countTotalComments(filteredComments) } : p))
      )

      // Clear reply state
      setReplyingTo(null)
      setReplyText('')
      setSnackbar({ open: true, message: 'Đã trả lời bình luận', severity: 'success' })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể trả lời bình luận'
      setSnackbar({ open: true, message: errorMessage, severity: 'error' })
    } finally {
      setCreatingReply(false)
    }
  }

  const handleStartEditComment = (commentId: string, currentContent: string) => {
    setEditingComments((prev) => ({ ...prev, [commentId]: currentContent }))
  }

  const handleCancelEditComment = (commentId: string) => {
    setEditingComments((prev) => {
      const next = { ...prev }
      delete next[commentId]
      return next
    })
  }

  const handleUpdateComment = async (commentId: string, postId: number) => {
    const content = editingComments[commentId]?.trim()
    if (!content) return

    try {
      setUpdatingComment((prev) => new Set(prev).add(commentId))
      await updateComment(parseInt(commentId, 10), { content })

      // Reload comments
      const comments = await fetchCommentsByPost(postId)
      // Filter ra các comments đã bị xóa trong session
      const filteredComments = filterDeletedComments(comments)
      setPostComments((prev) => ({ ...prev, [postId]: filteredComments }))

      // Clear editing state
      handleCancelEditComment(commentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật bình luận')
      console.error('Error updating comment:', err)
    } finally {
      setUpdatingComment((prev) => {
        const next = new Set(prev)
        next.delete(commentId)
        return next
      })
    }
  }

  const handleDeleteComment = async (commentId: string, postId: number, commentAuthorId?: number) => {
    const isOwn = isOwnContent(commentAuthorId)
    setDeletingCommentInfo({ commentId, postId, authorId: commentAuthorId, isOwnContent: isOwn })
    setDeleteReason('')
    setDeleteReasonError('')
    setDeleteCommentDialogOpen(true)
  }

  const confirmDeleteComment = async () => {
    if (!deletingCommentInfo) return
    const { commentId, postId, isOwnContent: isOwn } = deletingCommentInfo

    // Nếu xóa của người khác, phải có lý do
    if (!isOwn && !deleteReason.trim()) {
      setDeleteReasonError('Vui lòng nhập lý do xóa bình luận')
      return
    }

    // Thêm commentId vào deletedCommentIdsRef để tránh hiển thị lại sau polling
    deletedCommentIdsRef.current.add(commentId)

    try {
      setDeletingComment((prev) => new Set(prev).add(commentId))
      setDeleteCommentDialogOpen(false)
      
      // TODO: Gửi deleteReason đến backend nếu cần thông báo cho người dùng
      await deleteComment(parseInt(commentId, 10))

      // Reload comments
      const comments = await fetchCommentsByPost(postId)
      // Filter ra các comments đã bị xóa trong session
      const filteredComments = filterDeletedComments(comments)
      setPostComments((prev) => ({ ...prev, [postId]: filteredComments }))

      // Update post comment count (including all replies)
      setPosts((prev) =>
        prev.map((p) =>
          p.postId === postId ? { ...p, commentsCount: countTotalComments(filteredComments) } : p
        )
      )
      setSnackbar({ open: true, message: 'Đã xóa bình luận', severity: 'success' })
    } catch (err) {
      // Xóa commentId khỏi deletedCommentIdsRef nếu xóa thất bại
      deletedCommentIdsRef.current.delete(commentId)
      setError(err instanceof Error ? err.message : 'Không thể xóa bình luận')
      setSnackbar({ open: true, message: 'Không thể xóa bình luận', severity: 'error' })
      console.error('Error deleting comment:', err)
    } finally {
      setDeletingComment((prev) => {
        const next = new Set(prev)
        next.delete(commentId)
        return next
      })
      setDeletingCommentInfo(null)
    }
  }

  // Chỉ có thể edit comment của chính mình (kể cả Admin)
  const canEditComment = (comment: PostComment) => {
    if (!isAuthenticated || !currentUser) return false

    // Check multiple possible user ID fields from currentUser
    const userId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      0
    const commentAuthorId = comment.authorId ?? comment.authorID ?? 0

    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId)
    const authorIdNum =
      typeof commentAuthorId === 'string'
        ? parseInt(String(commentAuthorId), 10)
        : Number(commentAuthorId)

    return userIdNum === authorIdNum && userIdNum > 0
  }

  // Admin có thể delete bất kỳ comment nào, user thường chỉ delete của mình hoặc comment trong bài của mình
  const canDeleteComment = (comment: PostComment, post?: PostDto) => {
    // Admin có thể delete bất kỳ comment nào
    if (isAdmin) return true

    if (!isAuthenticated || !currentUser) return false

    // Check multiple possible user ID fields from currentUser
    const userId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      0
    const commentAuthorId = comment.authorId ?? comment.authorID ?? 0

    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId)
    const authorIdNum =
      typeof commentAuthorId === 'string'
        ? parseInt(String(commentAuthorId), 10)
        : Number(commentAuthorId)

    // User có thể xóa comment của chính mình
    if (userIdNum === authorIdNum && userIdNum > 0) return true

    // Chủ bài post có thể xóa comment trong bài của mình
    if (post) {
      const postAuthorId = post.authorId ?? (post as any).AuthorId ?? (post as any).posterId ?? (post as any).PosterId ?? 0
      const postAuthorIdNum = typeof postAuthorId === 'string' ? parseInt(postAuthorId, 10) : Number(postAuthorId)
      console.log('[canDeleteComment] Post owner check:', { userIdNum, postAuthorIdNum, postAuthorId })
      if (userIdNum === postAuthorIdNum && userIdNum > 0) return true
    }

    return false
  }

  // Kiểm tra xem đây có phải là xóa content của chính mình không
  const isOwnContent = (authorId: number | undefined) => {
    if (!currentUser) return false
    const userId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      0
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId)
    const authorIdNum = typeof authorId === 'string' ? parseInt(String(authorId), 10) : Number(authorId || 0)
    return userIdNum === authorIdNum && userIdNum > 0
  }

  // Helper để kiểm tra có thể edit hoặc delete (dùng cho hiển thị buttons)
  const canEditOrDeleteComment = (comment: PostComment) => {
    return canEditComment(comment) || canDeleteComment(comment)
  }

  const getCommentId = (comment: PostComment): string => {
    return comment.postCommentId ?? String(comment.id ?? 0)
  }

  const getCommentAuthorAvatar = (comment: PostComment): string | undefined => {
    // Ưu tiên avatar lấy trực tiếp từ dữ liệu comment (Author từ backend)
    if (comment.authorAvatar && comment.authorAvatar.trim() !== '') {
      return comment.authorAvatar
    }

    // Nếu là comment của current user thì dùng avatar trong thông tin user hiện tại
    if (currentUser) {
      const commentAuthorId = comment.authorId ?? comment.authorID
      const currentUserId =
        currentUser.id ??
        currentUser.Id ??
        currentUser.userId ??
        currentUser.UserId ??
        currentUser.ID ??
        null

      if (commentAuthorId && currentUserId && String(commentAuthorId) === String(currentUserId)) {
        const userAvatar = (currentUser as any).avatar || (currentUser as any).Avatar
        if (typeof userAvatar === 'string' && userAvatar.trim() !== '') {
          return userAvatar
        }
      }
    }

    return undefined
  }

  const getCommentAuthorName = (comment: PostComment): string => {
    return comment.fullName ?? comment.authorName ?? 'Người dùng'
  }

  const getCommentDate = (comment: PostComment): string => {
    return comment.createdDate ?? comment.createdAt ?? ''
  }

  const getCommentLikesCount = (comment: PostComment): number => {
    return Array.isArray(comment.likes) ? comment.likes.length : 0
  }

  const isCommentLikedByCurrentUser = (comment: PostComment): boolean => {
    if (!currentUser || !Array.isArray(comment.likes) || comment.likes.length === 0) return false
    const currentUserId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      null
    if (!currentUserId) return false
    const currentUserIdStr = String(currentUserId)
    return comment.likes!.some((like) => String(like.accountId ?? '') === currentUserIdStr)
  }

  // Helper functions for reply likes
  const getReplyLikesCount = (reply: PostCommentReply): number => {
    return Array.isArray(reply.likes) ? reply.likes.length : 0
  }

  const isReplyLikedByCurrentUser = (reply: PostCommentReply): boolean => {
    if (!currentUser || !Array.isArray(reply.likes) || reply.likes.length === 0) return false
    const currentUserId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      null
    if (!currentUserId) return false
    const currentUserIdStr = String(currentUserId)
    return reply.likes!.some((like) => String(like.accountId ?? '') === currentUserIdStr)
  }

  // Handle toggle like for reply (reuse comment like API since replies are also comments)
  const handleToggleReplyLike = async (postId: number, reply: PostCommentReply) => {
    if (!isAuthenticated || !currentUser) {
      const message = 'Vui lòng đăng nhập để thích bình luận'
      setSnackbar({ open: true, message, severity: 'warning' })
      return
    }

    const replyId = reply.replyPostCommentId
    const userId = currentUser?.id ?? currentUser?.Id ?? currentUser?.userId ?? currentUser?.UserId ?? currentUser?.ID ?? null
    
    if (!userId) {
      setSnackbar({ open: true, message: 'Không thể xác định người dùng', severity: 'error' })
      return
    }

    // Create a fake PostComment object to reuse toggleCommentLike
    const fakeComment: PostComment = {
      postCommentId: replyId,
      id: parseInt(replyId, 10) || undefined,
      content: reply.content,
      likes: reply.likes
    }

    try {
      setLikingComments((prev) => new Set(prev).add(replyId))

      // Call the API
      await toggleCommentLike(fakeComment)

      // Reload comments to get updated likes
      const comments = await fetchCommentsByPost(postId)
      // Filter ra các comments đã bị xóa trong session
      const filteredComments = filterDeletedComments(comments)
      setPostComments((prev) => ({ ...prev, [postId]: filteredComments }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể thích bình luận'
      setSnackbar({ open: true, message: errorMessage, severity: 'error' })
      console.error('Error toggling reply like:', err)
    } finally {
      setLikingComments((prev) => {
        const next = new Set(prev)
        next.delete(replyId)
        return next
      })
    }
  }

  // Helper functions for reply permissions
  const canEditReply = (reply: PostCommentReply) => {
    if (!isAuthenticated || !currentUser) return false

    const userId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      0
    const replyAuthorId = reply.authorId ?? 0

    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId)
    const authorIdNum = typeof replyAuthorId === 'string' ? parseInt(String(replyAuthorId), 10) : Number(replyAuthorId)

    return userIdNum === authorIdNum && userIdNum > 0
  }

  const canDeleteReply = (reply: PostCommentReply, post?: PostDto) => {
    // Admin có thể delete bất kỳ reply nào
    if (isAdmin) return true

    if (!isAuthenticated || !currentUser) return false

    const userId =
      currentUser?.id ??
      currentUser?.Id ??
      currentUser?.userId ??
      currentUser?.UserId ??
      currentUser?.ID ??
      0
    const replyAuthorId = reply.authorId ?? 0

    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId)
    const authorIdNum = typeof replyAuthorId === 'string' ? parseInt(String(replyAuthorId), 10) : Number(replyAuthorId)

    // User có thể xóa reply của chính mình
    if (userIdNum === authorIdNum && userIdNum > 0) return true

    // Chủ bài post có thể xóa reply trong bài của mình
    if (post) {
      const postAuthorId = post.authorId ?? (post as any).AuthorId ?? (post as any).posterId ?? (post as any).PosterId ?? 0
      const postAuthorIdNum = typeof postAuthorId === 'string' ? parseInt(postAuthorId, 10) : Number(postAuthorId)
      if (userIdNum === postAuthorIdNum && userIdNum > 0) return true
    }

    return false
  }

  const canEditOrDeleteReply = (reply: PostCommentReply, post?: PostDto) => {
    return canEditReply(reply) || canDeleteReply(reply, post)
  }

  // Handle edit reply
  const handleStartEditReply = (replyId: string, currentContent: string) => {
    setEditingComments((prev) => ({ ...prev, [replyId]: currentContent }))
  }

  const handleCancelEditReply = (replyId: string) => {
    setEditingComments((prev) => {
      const next = { ...prev }
      delete next[replyId]
      return next
    })
  }

  const handleUpdateReply = async (replyId: string, postId: number) => {
    const content = editingComments[replyId]?.trim()
    if (!content) return

    try {
      setUpdatingComment((prev) => new Set(prev).add(replyId))
      await updateComment(parseInt(replyId, 10), { content })

      // Reload comments
      const comments = await fetchCommentsByPost(postId)
      // Filter ra các comments đã bị xóa trong session
      const filteredComments = filterDeletedComments(comments)
      setPostComments((prev) => ({ ...prev, [postId]: filteredComments }))

      // Clear editing state
      handleCancelEditReply(replyId)
      setSnackbar({ open: true, message: 'Đã cập nhật bình luận', severity: 'success' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật bình luận')
      setSnackbar({ open: true, message: 'Không thể cập nhật bình luận', severity: 'error' })
      console.error('Error updating reply:', err)
    } finally {
      setUpdatingComment((prev) => {
        const next = new Set(prev)
        next.delete(replyId)
        return next
      })
    }
  }

  // Handle delete reply
  const handleDeleteReply = async (replyId: string, postId: number, replyAuthorId?: number) => {
    const isOwn = isOwnContent(replyAuthorId)
    setDeletingCommentInfo({ commentId: replyId, postId, authorId: replyAuthorId, isOwnContent: isOwn })
    setDeleteReason('')
    setDeleteReasonError('')
    setDeleteCommentDialogOpen(true)
  }

  const handleToggleCommentLike = async (postId: number, comment: PostComment) => {
    if (!isAuthenticated || !currentUser) {
      const message = 'Vui lòng đăng nhập để thích bình luận'
      setSnackbar({ open: true, message, severity: 'warning' })
      return
    }

    const commentId = getCommentId(comment)
    const userId = currentUser?.id ?? currentUser?.Id ?? currentUser?.userId ?? currentUser?.UserId ?? currentUser?.ID ?? null
    
    if (!userId) {
      setSnackbar({ open: true, message: 'Không thể xác định người dùng', severity: 'error' })
      return
    }

    const userIdStr = String(userId)
    const currentLikes = Array.isArray(comment.likes) ? comment.likes : []
    const existingLike = currentLikes.find((like: any) => String(like.accountId ?? '') === userIdStr)
    const isUnliking = !!existingLike

    try {
      setLikingComments((prev) => new Set(prev).add(commentId))

      // Optimistic update: cập nhật UI ngay lập tức
      setPostComments((prev) => {
        const currentComments = prev[postId] || []
        return {
          ...prev,
          [postId]: currentComments.map((c) => {
            const cId = getCommentId(c)
            if (cId !== commentId) return c

            const updatedLikes = Array.isArray(c.likes) ? [...c.likes] : []
            
            if (isUnliking) {
              // Remove like
              const filteredLikes = updatedLikes.filter((like: any) => String(like.accountId ?? '') !== userIdStr)
              return {
                ...c,
                likes: filteredLikes
              }
            } else {
              // Add like
              updatedLikes.push({
                postCommentLikeId: `temp-${Date.now()}`,
                accountId: userIdStr,
                fullName: currentUser?.name ?? currentUser?.Name ?? 'Người dùng',
                createdDate: new Date().toISOString()
              })
              return {
                ...c,
                likes: updatedLikes
              }
            }
          })
        }
      })

      // Gọi API
      await toggleCommentLike(comment)

      // Sau khi API thành công, reload comments để lấy dữ liệu chính xác từ backend
      try {
        const comments = await fetchCommentsByPost(postId)
        // Filter ra các comments đã bị xóa trong session
        const filteredComments = filterDeletedComments(comments)
        setPostComments((prev) => ({ ...prev, [postId]: filteredComments }))
      } catch (reloadError) {
        console.warn('[PostsManagement] Could not reload comments after like, using optimistic update:', reloadError)
        // Giữ optimistic update nếu không reload được
      }
    } catch (err) {
      // Revert optimistic update on error
      setPostComments((prev) => {
        const currentComments = prev[postId] || []
        return {
          ...prev,
          [postId]: currentComments.map((c) => {
            const cId = getCommentId(c)
            return cId === commentId ? comment : c
          })
        }
      })

      const errorMessage = err instanceof Error ? err.message : 'Không thể thích bình luận'
      setError(errorMessage)
      setSnackbar({ open: true, message: errorMessage, severity: 'error' })
      console.error('Error toggling comment like:', err)
    } finally {
      setLikingComments((prev) => {
        const next = new Set(prev)
        next.delete(commentId)
        return next
      })
    }
  }

  // Recursive function to render reply and its nested replies
  const renderReply = (reply: PostCommentReply, postId: number, depth: number = 0, post?: PostDto): React.ReactNode => {
    const maxDepth = 3 // Giới hạn độ sâu để tránh UI quá phức tạp
    const marginLeft = Math.min(depth, maxDepth) * 2 // Tăng margin theo depth

    return (
      <Box key={reply.replyPostCommentId}>
        <Box
          sx={{
            bgcolor: depth === 0 ? 'grey.50' : 'grey.100',
            p: 1.5,
            borderRadius: 2,
            borderLeft: '3px solid',
            borderColor: depth === 0 ? 'primary.light' : 'secondary.light',
            ml: marginLeft
          }}
        >
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
            <Box display="flex" alignItems="center" gap={1}>
              <Avatar
                src={reply.authorAvatar}
                sx={{ width: 28, height: 28, fontSize: '0.8rem', bgcolor: 'primary.main' }}
              >
                {reply.fullName?.charAt(0).toUpperCase() || 'U'}
              </Avatar>
              <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                <Typography variant="body2" fontWeight="bold">
                  {reply.fullName}
                </Typography>
                {reply.replyToName && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      trả lời
                    </Typography>
                    <Typography variant="body2" fontWeight="bold" color="primary.main">
                      {reply.replyToName}
                    </Typography>
                  </>
                )}
                <Typography variant="caption" color="text.secondary">
                  {formatTimeAgo(reply.createdDate)}
                </Typography>
              </Box>
            </Box>
            {/* Edit/Delete buttons for reply */}
            {canEditOrDeleteReply(reply) && (
              <Box display="flex" gap={0.5}>
                {canEditReply(reply) && (
                  <IconButton
                    size="small"
                    onClick={() => handleStartEditReply(reply.replyPostCommentId, reply.content || '')}
                    disabled={updatingComment.has(reply.replyPostCommentId) || deletingComment.has(reply.replyPostCommentId)}
                    sx={{ p: 0.5 }}
                    title="Chỉnh sửa"
                  >
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                )}
                {canDeleteReply(reply, post) && (
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteReply(reply.replyPostCommentId, postId)}
                    disabled={deletingComment.has(reply.replyPostCommentId)}
                    sx={{ p: 0.5, color: 'error.main' }}
                    title="Xóa"
                  >
                    {deletingComment.has(reply.replyPostCommentId) ? (
                      <CircularProgress size={14} color="error" />
                    ) : (
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                )}
              </Box>
            )}
          </Box>
          {/* Reply content - show edit mode or normal content */}
          {editingComments[reply.replyPostCommentId] !== undefined ? (
            <Box sx={{ ml: 4.5, mb: 0.5 }}>
              <TextField
                fullWidth
                size="small"
                value={editingComments[reply.replyPostCommentId]}
                onChange={(e) => setEditingComments((prev) => ({ ...prev, [reply.replyPostCommentId]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleUpdateReply(reply.replyPostCommentId, postId)
                  }
                  if (e.key === 'Escape') {
                    handleCancelEditReply(reply.replyPostCommentId)
                  }
                }}
                multiline
                maxRows={3}
                autoFocus
                sx={{ bgcolor: 'white' }}
              />
              <Box display="flex" gap={1} mt={0.5} justifyContent="flex-end">
                <Button
                  size="small"
                  onClick={() => handleCancelEditReply(reply.replyPostCommentId)}
                  disabled={updatingComment.has(reply.replyPostCommentId)}
                >
                  Hủy
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => handleUpdateReply(reply.replyPostCommentId, postId)}
                  disabled={!editingComments[reply.replyPostCommentId]?.trim() || updatingComment.has(reply.replyPostCommentId)}
                >
                  {updatingComment.has(reply.replyPostCommentId) ? <CircularProgress size={16} /> : 'Lưu'}
                </Button>
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ ml: 4.5, mb: 0.5 }}>
              {reply.content}
            </Typography>
          )}
          {/* Like and Reply buttons for reply */}
          <Box display="flex" alignItems="center" gap={1.5} ml={4.5}>
            <IconButton
              size="small"
              onClick={() => handleToggleReplyLike(postId, reply)}
              disabled={!isAuthenticated || likingComments.has(reply.replyPostCommentId)}
              sx={{
                color: isReplyLikedByCurrentUser(reply) ? 'error.main' : 'text.secondary',
                p: 0.5
              }}
            >
              <FavoriteIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <Typography
              variant="caption"
              color="text.secondary"
              onClick={() => {
                const likesCount = getReplyLikesCount(reply)
                if (likesCount > 0) {
                  setSelectedCommentLikes(reply.likes || [])
                  setSelectedCommentContent(reply.content || 'Bình luận')
                  setCommentLikesDialogOpen(true)
                }
              }}
              sx={{
                cursor: getReplyLikesCount(reply) > 0 ? 'pointer' : 'default',
                '&:hover':
                  getReplyLikesCount(reply) > 0
                    ? { textDecoration: 'underline', color: 'primary.main' }
                    : {}
              }}
            >
              {getReplyLikesCount(reply)} thích
            </Typography>
            <Typography
              variant="caption"
              color="primary.main"
              onClick={() => handleStartReply(postId, reply.replyPostCommentId, reply.fullName)}
              sx={{
                cursor: 'pointer',
                fontWeight: 600,
                '&:hover': { textDecoration: 'underline' }
              }}
            >
              Trả lời
            </Typography>
          </Box>
          {/* Reply input for this reply */}
          {replyingTo?.commentId === reply.replyPostCommentId && (
            <Box mt={1.5} ml={4.5}>
              <Box display="flex" gap={1} alignItems="flex-start">
                <TextField
                  fullWidth
                  size="small"
                  placeholder={`Trả lời ${replyingTo.authorName}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmitReply()
                    }
                  }}
                  multiline
                  maxRows={3}
                  sx={{ bgcolor: 'white' }}
                />
                <IconButton
                  size="small"
                  color="primary"
                  onClick={handleSubmitReply}
                  disabled={!replyText.trim() || creatingReply}
                >
                  {creatingReply ? <CircularProgress size={16} /> : <SendIcon fontSize="small" />}
                </IconButton>
                <IconButton size="small" onClick={handleCancelReply}>
                  <CancelIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          )}
        </Box>
        {/* Render nested replies recursively */}
        {reply.replies && reply.replies.length > 0 && (
          <Box mt={1} display="flex" flexDirection="column" gap={1}>
            {reply.replies.map((nestedReply) => renderReply(nestedReply, postId, depth + 1, post))}
          </Box>
        )}
      </Box>
    )
  }

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3, bgcolor: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <Card
        sx={{
          mb: 3,
          borderRadius: '1.5rem',
          boxShadow: '0 10px 40px rgba(15, 118, 110, 0.12)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(240,253,250,0.95))',
          overflow: 'hidden'
        }}
      >
        <Box
          sx={{
            background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%)',
            py: 2.5,
            px: 3,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <Box display="flex" alignItems="center" gap={2}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '1rem',
                bgcolor: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ArticleIcon sx={{ color: 'white', fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'white' }}>
                Quản lý Bài viết
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                Xem và quản lý các bài viết trên diễn đàn
              </Typography>
            </Box>
          </Box>
          {isAuthenticated && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleOpenCreateDialog}
              sx={{
                borderRadius: '0.8rem',
                px: 3,
                py: 1.2,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '0.95rem',
                bgcolor: 'transparent',
                color: 'white',
                border: '2px solid white',
                boxShadow: '0 4px 14px rgba(255, 255, 255, 0.2)',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.15)',
                  borderColor: 'white',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 6px 20px rgba(255, 255, 255, 0.3)'
                }
              }}
            >
              Tạo bài viết mới
            </Button>
          )}
        </Box>

        {/* Search and Filter */}
        <CardContent sx={{ p: 2.5 }}>
          <Box display="flex" gap={2}>
            <TextField
              fullWidth
              placeholder="Tìm kiếm bài viết theo tiêu đề, nội dung, tác giả..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#64748b' }} />
                  </InputAdornment>
                ),
                endAdornment: searchText && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchText('')}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                )
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '1rem',
                  bgcolor: '#f8fafc',
                  border: '1.5px solid #94a3b8',
                  '& fieldset': { border: 'none' },
                  '&:hover': {
                    bgcolor: '#f1f5f9',
                    borderColor: '#0f766e'
                  },
                  '&.Mui-focused': {
                    bgcolor: 'white',
                    borderColor: '#0f766e',
                    boxShadow: '0 0 0 3px rgba(15, 118, 110, 0.1)'
                  }
                }
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert 
          severity="error" 
          sx={{ 
            mb: 3, 
            borderRadius: '1rem',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            bgcolor: '#fef2f2',
            '& .MuiAlert-icon': { color: '#ef4444' },
            '& .MuiAlert-message': { color: '#991b1b' }
          }} 
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      {/* Posts List */}
      {filteredPosts.length === 0 ? (
        <Card 
          sx={{ 
            borderRadius: '1.5rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            border: '1px solid #e2e8f0'
          }}
        >
          <CardContent sx={{ py: 6 }}>
            <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  bgcolor: '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <SearchIcon sx={{ fontSize: 40, color: '#94a3b8' }} />
              </Box>
              <Typography variant="h6" color="#64748b" fontWeight={600}>
                {searchText || statusFilter !== 'All'
                  ? 'Không tìm thấy bài viết nào'
                  : 'Chưa có bài viết nào'}
              </Typography>
              <Typography variant="body2" color="#94a3b8">
                {searchText || statusFilter !== 'All'
                  ? 'Thử thay đổi từ khóa hoặc bộ lọc'
                  : 'Hãy tạo bài viết đầu tiên của bạn'}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box display="flex" flexDirection="column" gap={2.5}>
          {filteredPosts.map((post) => (
            <Card
              key={post.postId}
              sx={{
                borderRadius: '1.25rem',
                bgcolor: 'white',
                boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
                transition: 'all 0.3s ease',
                overflow: 'hidden',
                '&:hover': {
                  boxShadow: '0 8px 30px rgba(15, 118, 110, 0.12)',
                  borderColor: '#cbd5e1',
                  transform: 'translateY(-3px)'
                }
              }}
            >
              <CardContent sx={{ p: 3 }}>
                {/* Header */}
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2.5}>
                  <Box display="flex" gap={2} alignItems="center">
                    <Avatar
                      src={(() => {
                        // Nếu post là của current user, dùng avatar từ userInfo
                        const currentUserId =
                          currentUser?.id ||
                          currentUser?.Id ||
                          currentUser?.userId ||
                          currentUser?.UserId
                        const postAuthorId = post.authorId
                        if (
                          currentUserId &&
                          postAuthorId &&
                          String(currentUserId) === String(postAuthorId)
                        ) {
                          // Dùng avatar từ userInfo
                          const userAvatar = currentUser?.avatar || currentUser?.Avatar
                          if (userAvatar && userAvatar.trim() !== '') {
                            // Nếu là URL đầy đủ, dùng trực tiếp
                            if (
                              userAvatar.startsWith('http://') ||
                              userAvatar.startsWith('https://')
                            ) {
                              return userAvatar
                            }
                            // Nếu là base64, dùng trực tiếp
                            if (userAvatar.startsWith('data:image/')) {
                              return userAvatar
                            }
                          }
                        }
                        // Nếu không phải post của current user hoặc không có avatar trong userInfo, dùng post.authorAvatar
                        return post.authorAvatar
                      })()}
                      sx={{
                        width: 52,
                        height: 52,
                        bgcolor: '#0f766e',
                        fontSize: '1.4rem',
                        fontWeight: 'bold',
                        border: '3px solid #e2e8f0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}
                    >
                      {post.authorName.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: 700, color: '#1e293b', mb: 0.5, fontSize: '1.05rem' }}
                      >
                        {post.authorName}
                      </Typography>
                      <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                        <Chip
                          label={post.authorRole}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: '22px',
                            bgcolor: getRoleColor(post.authorRole) === 'primary' ? 'rgba(59, 130, 246, 0.1)' :
                                    getRoleColor(post.authorRole) === 'info' ? 'rgba(6, 182, 212, 0.1)' :
                                    getRoleColor(post.authorRole) === 'secondary' ? 'rgba(168, 85, 247, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                            color: getRoleColor(post.authorRole) === 'primary' ? '#2563eb' :
                                   getRoleColor(post.authorRole) === 'info' ? '#0891b2' :
                                   getRoleColor(post.authorRole) === 'secondary' ? '#9333ea' : '#64748b'
                          }}
                        />
                        <Chip
                          label={post.status === 'Approved' ? 'Đã duyệt' : post.status === 'Rejected' ? 'Đã từ chối' : post.status}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: '22px',
                            bgcolor: getStatusColor(post.status) === 'success' ? 'rgba(34, 197, 94, 0.1)' :
                                    getStatusColor(post.status) === 'error' ? 'rgba(239, 68, 68, 0.1)' :
                                    getStatusColor(post.status) === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                            color: getStatusColor(post.status) === 'success' ? '#16a34a' :
                                   getStatusColor(post.status) === 'error' ? '#dc2626' :
                                   getStatusColor(post.status) === 'warning' ? '#d97706' : '#64748b'
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{ color: '#94a3b8', fontSize: '0.8rem' }}
                        >
                          {formatTimeAgo(post.publicDate || post.createdAt, post.postId)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                  {canEditOrDelete(post) && (
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, post.postId)}
                      sx={{ 
                        color: '#64748b',
                        bgcolor: '#f1f5f9',
                        '&:hover': {
                          bgcolor: '#e2e8f0',
                          color: '#334155'
                        }
                      }}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  )}
                </Box>

                {/* Title */}
                {post.title && (
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      fontWeight: 700, 
                      color: '#1e293b', 
                      mb: 1.5,
                      fontSize: '1.15rem',
                      lineHeight: 1.4
                    }}
                  >
                    {post.title}
                  </Typography>
                )}

                {/* Content */}
                <Typography
                  variant="body1"
                  sx={{
                    mb: 2.5,
                    whiteSpace: 'pre-wrap',
                    color: '#475569',
                    lineHeight: 1.75,
                    fontSize: '0.95rem'
                  }}
                >
                  {post.content}
                </Typography>

                {/* Images */}
                {post.images && post.images.length > 0 && (
                  <Box mb={2.5}>
                    <ImageList cols={post.images.length === 1 ? 1 : post.images.length === 2 ? 2 : 3} gap={12} sx={{ mb: 0 }}>
                      {post.images
                        .filter((img) => {
                          if (!img || typeof img !== 'string') return false
                          const trimmed = img.trim()
                          return trimmed !== '' && trimmed.length > 10
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
                            const base64Pattern = /^[A-Za-z0-9+/=\s]+$/
                            const cleaned = imageSrc.replace(/\s/g, '')

                            if (base64Pattern.test(cleaned) && cleaned.length > 50) {
                              imageSrc = `data:image/jpeg;base64,${cleaned}`
                            } else {
                              return null
                            }
                          }

                          return (
                            <ImageListItem key={`${post.postId}-img-${index}`}>
                              <img
                                src={imageSrc}
                                alt={`Post ${post.postId} - ${index + 1}`}
                                style={{
                                  width: '100%',
                                  height: post.images.length === 1 ? '350px' : '200px',
                                  objectFit: 'cover',
                                  borderRadius: '1rem',
                                  border: '2px solid #e2e8f0',
                                  backgroundColor: '#f8fafc',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                                }}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                }}
                                loading="lazy"
                              />
                            </ImageListItem>
                          )
                        })
                        .filter(Boolean)}
                    </ImageList>
                  </Box>
                )}

                {/* Hashtags */}
                {post.hashtags && post.hashtags.length > 0 && (
                  <Box mb={2.5} display="flex" flexWrap="wrap" gap={1}>
                    {post.hashtags.map((tag, index) => (
                      <Chip
                        key={index}
                        label={`#${tag}`}
                        size="small"
                        sx={{ 
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          bgcolor: 'rgba(15, 118, 110, 0.08)',
                          color: '#0f766e',
                          border: '1px solid rgba(15, 118, 110, 0.2)',
                          '&:hover': {
                            bgcolor: 'rgba(15, 118, 110, 0.15)'
                          }
                        }}
                      />
                    ))}
                  </Box>
                )}

                {/* Actions - Reaction button + comments */}
                <Box
                  display="flex"
                  alignItems="center"
                  gap={2.5}
                  mb={2}
                  sx={{
                    p: 1.5,
                    bgcolor: '#f8fafc',
                    borderRadius: '0.75rem',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  {/* Nút reaction chính (giống Facebook like) + popup nhiều reaction khi hover */}
                  <Box
                    position="relative"
                    onMouseEnter={() => showReactionMenu(post.postId)}
                    onMouseLeave={() => scheduleHideReactionMenu(post.postId)}
                  >
                    {/* Nút chính - hiển thị reaction hiện tại của user (nếu có) */}
                    {(() => {
                      const userReaction = getCurrentUserReaction(post)
                      const hasReaction = userReaction !== null
                      const display = getReactionDisplay(userReaction)
                      return (
                        <IconButton
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            // Nếu đã có reaction, bấm nút chính sẽ unlike (gửi reaction hiện tại để toggle off)
                            // Nếu chưa có reaction, bấm nút chính sẽ like
                            handleReactionClick(post, userReaction ?? 'like')
                          }}
                          disabled={likingPosts.has(post.postId)}
                          title={
                            !isAuthenticated
                              ? 'Vui lòng đăng nhập để bày tỏ cảm xúc'
                              : hasReaction
                                ? 'Bỏ cảm xúc'
                                : 'Thích'
                          }
                          sx={{
                            color: hasReaction ? '#ef4444' : '#64748b',
                            opacity: !isAuthenticated ? 0.5 : 1,
                            cursor: !isAuthenticated ? 'not-allowed' : 'pointer',
                            bgcolor: hasReaction ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                            '&:hover': {
                              bgcolor: hasReaction
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(100, 116, 139, 0.1)',
                              color: hasReaction ? '#dc2626' : '#ef4444'
                            },
                            '&.Mui-disabled': {
                              opacity: 0.3
                            }
                          }}
                        >
                          <span style={{ fontSize: '1.6rem' }} aria-label={display.label}>
                            {display.emoji}
                          </span>
                        </IconButton>
                      )
                    })()}

                    {/* Popup reaction khi hover */}
                    {reactionMenuPostId === post.postId && (
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: '100%',
                          left: 0,
                          mb: 0.75,
                          px: 1,
                          py: 0.75,
                          bgcolor: 'white',
                          borderRadius: '2rem',
                          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                          display: 'flex',
                          gap: 0.5,
                          zIndex: 10,
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        {REACTIONS.map((reaction) => (
                          <IconButton
                            key={reaction.key}
                            size="small"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleReactionClick(post, reaction.key)
                            }}
                            sx={{
                              width: 36,
                              height: 36,
                              fontSize: '1.3rem',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                transform: 'scale(1.3)',
                                bgcolor: 'rgba(15, 118, 110, 0.1)'
                              }
                            }}
                          >
                            <span aria-label={reaction.label}>{reaction.emoji}</span>
                          </IconButton>
                        ))}
                      </Box>
                    )}
                  </Box>

                  <Typography
                    variant="body2"
                    sx={{
                      color: '#64748b',
                      fontWeight: 600,
                      cursor: post.likesCount > 0 ? 'pointer' : 'default',
                      '&:hover':
                        post.likesCount > 0
                          ? {
                              textDecoration: 'underline',
                              color: '#0f766e'
                            }
                          : {}
                    }}
                    onClick={() => {
                      if (post.likesCount > 0) {
                        setSelectedPostLikes(post.likes || [])
                        setSelectedPostTitle(post.title || 'Bài viết')
                        setLikesDialogOpen(true)
                      }
                    }}
                  >
                    {post.likesCount} lượt thích
                  </Typography>

                  <IconButton
                    onClick={() => handleToggleComments(post.postId)}
                    sx={{
                      color: expandedComments.has(post.postId) ? '#0f766e' : '#64748b',
                      bgcolor: expandedComments.has(post.postId) ? 'rgba(15, 118, 110, 0.1)' : 'transparent',
                      '&:hover': {
                        bgcolor: 'rgba(15, 118, 110, 0.15)',
                        color: '#0f766e'
                      }
                    }}
                  >
                    <CommentIcon />
                  </IconButton>
                  <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
                    {postComments[post.postId] ? countTotalComments(postComments[post.postId]) : post.commentsCount} bình luận
                  </Typography>
                </Box>

                {/* Comments Section */}
                {expandedComments.has(post.postId) && (
                  <Box sx={{ 
                    mt: 2.5, 
                    pl: 2.5, 
                    borderLeft: '3px solid', 
                    borderColor: '#0f766e',
                    bgcolor: '#f8fafc',
                    borderRadius: '0 0.75rem 0.75rem 0',
                    py: 2,
                    pr: 2
                  }}>
                    {/* Comment Input */}
                    {isAuthenticated && (
                      <Box display="flex" gap={1.5} mb={2.5}>
                        <TextField
                          fullWidth
                          size="small"
                          placeholder="Viết bình luận..."
                          value={commentTexts[post.postId] || ''}
                          onChange={(e) =>
                            setCommentTexts((prev) => ({ ...prev, [post.postId]: e.target.value }))
                          }
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleCreateComment(post.postId)
                            }
                          }}
                          sx={{ 
                            bgcolor: 'white',
                            '& .MuiOutlinedInput-root': {
                              borderRadius: '0.75rem',
                              border: '1.5px solid #94a3b8',
                              '& fieldset': { border: 'none' },
                              '&:hover': {
                                borderColor: '#0f766e'
                              },
                              '&.Mui-focused': {
                                borderColor: '#0f766e',
                                boxShadow: '0 0 0 3px rgba(15, 118, 110, 0.1)'
                              }
                            }
                          }}
                        />
                        <IconButton
                          onClick={() => handleCreateComment(post.postId)}
                          disabled={
                            !commentTexts[post.postId]?.trim() || creatingComment[post.postId]
                          }
                          sx={{
                            bgcolor: '#0f766e',
                            color: 'white',
                            '&:hover': {
                              bgcolor: '#0d9488'
                            },
                            '&.Mui-disabled': {
                              bgcolor: '#cbd5e1',
                              color: 'white'
                            }
                          }}
                        >
                          {creatingComment[post.postId] ? (
                            <CircularProgress size={20} sx={{ color: 'white' }} />
                          ) : (
                            <SendIcon />
                          )}
                        </IconButton>
                      </Box>
                    )}

                    {/* Comments List */}
                    {postComments[post.postId] && postComments[post.postId].length > 0 ? (
                      <Box display="flex" flexDirection="column" gap={2}>
                        {postComments[post.postId].map((comment) => {
                          const commentId = getCommentId(comment)
                          const isEditing = editingComments[commentId] !== undefined

                          return (
                            <Box
                              key={commentId}
                              sx={{ 
                                bgcolor: 'white', 
                                p: 2, 
                                borderRadius: '0.75rem',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                              }}
                            >
                              <Box
                                display="flex"
                                justifyContent="space-between"
                                alignItems="flex-start"
                                mb={1}
                              >
                                <Box display="flex" alignItems="center" gap={1.5}>
                                  <Avatar
                                    src={getCommentAuthorAvatar(comment)}
                                    sx={{
                                      width: 32,
                                      height: 32,
                                      bgcolor: 'primary.main',
                                      fontSize: '0.875rem'
                                    }}
                                  >
                                    {getCommentAuthorName(comment).charAt(0).toUpperCase()}
                                  </Avatar>
                                  <Box>
                                    <Typography
                                      variant="subtitle2"
                                      fontWeight="bold"
                                      color="text.primary"
                                    >
                                      {getCommentAuthorName(comment)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {formatTimeAgo(getCommentDate(comment))}
                                    </Typography>
                                  </Box>
                                </Box>
                                {!isEditing && (
                                  <Box display="flex" gap={0.5}>
                                    {canEditComment(comment) && (
                                      <IconButton
                                        size="small"
                                        onClick={() =>
                                          handleStartEditComment(commentId, comment.content)
                                        }
                                      >
                                        <EditIcon fontSize="small" />
                                      </IconButton>
                                    )}
                                    {canDeleteComment(comment, post) && (
                                      <IconButton
                                        size="small"
                                        onClick={() => handleDeleteComment(commentId, post.postId, comment.authorId)}
                                        disabled={deletingComment.has(commentId)}
                                        sx={{ color: 'error.main' }}
                                      >
                                        {deletingComment.has(commentId) ? (
                                          <CircularProgress size={16} />
                                        ) : (
                                          <DeleteIcon fontSize="small" />
                                        )}
                                      </IconButton>
                                    )}
                                  </Box>
                                )}
                              </Box>

                              {isEditing ? (
                                <Box display="flex" gap={1} alignItems="flex-start">
                                  <TextField
                                    fullWidth
                                    size="small"
                                    multiline
                                    value={editingComments[commentId]}
                                    onChange={(e) =>
                                      setEditingComments((prev) => ({
                                        ...prev,
                                        [commentId]: e.target.value
                                      }))
                                    }
                                    sx={{ bgcolor: 'white' }}
                                  />
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={() => handleUpdateComment(commentId, post.postId)}
                                    disabled={updatingComment.has(commentId)}
                                  >
                                    {updatingComment.has(commentId) ? (
                                      <CircularProgress size={16} />
                                    ) : (
                                      <CheckCircleIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleCancelEditComment(commentId)}
                                  >
                                    <CancelIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              ) : (
                                <>
                                  <Typography
                                    variant="body2"
                                    color="text.primary"
                                    sx={{ whiteSpace: 'pre-wrap' }}
                                  >
                                    {comment.content}
                                  </Typography>
                                  <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleToggleCommentLike(post.postId, comment)}
                                      disabled={!isAuthenticated || likingComments.has(commentId)}
                                      sx={{
                                        color: isCommentLikedByCurrentUser(comment)
                                          ? 'error.main'
                                          : 'text.secondary'
                                      }}
                                    >
                                      <FavoriteIcon fontSize="small" />
                                    </IconButton>
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      onClick={() => {
                                        const likesCount = getCommentLikesCount(comment)
                                        if (likesCount > 0) {
                                          setSelectedCommentLikes(comment.likes || [])
                                          setSelectedCommentContent(comment.content || 'Bình luận')
                                          setCommentLikesDialogOpen(true)
                                        }
                                      }}
                                      sx={{
                                        cursor: getCommentLikesCount(comment) > 0 ? 'pointer' : 'default',
                                        '&:hover':
                                          getCommentLikesCount(comment) > 0
                                            ? {
                                                textDecoration: 'underline',
                                                color: 'primary.main'
                                              }
                                            : {}
                                      }}
                                    >
                                      {getCommentLikesCount(comment)} lượt thích
                                    </Typography>
                                    {isAuthenticated && (
                                      <Typography
                                        variant="caption"
                                        color="primary.main"
                                        onClick={() => handleStartReply(post.postId, commentId, getCommentAuthorName(comment))}
                                        sx={{
                                          cursor: 'pointer',
                                          fontWeight: 500,
                                          '&:hover': {
                                            textDecoration: 'underline'
                                          }
                                        }}
                                      >
                                        Trả lời
                                      </Typography>
                                    )}
                                  </Box>
                                  
                                  {/* Reply Input */}
                                  {replyingTo?.commentId === commentId && (
                                    <Box mt={1.5} ml={4}>
                                      <Box display="flex" gap={1} alignItems="flex-start">
                                        <TextField
                                          fullWidth
                                          size="small"
                                          placeholder={`Trả lời ${replyingTo.authorName}...`}
                                          value={replyText}
                                          onChange={(e) => setReplyText(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                              e.preventDefault()
                                              handleSubmitReply()
                                            }
                                          }}
                                          multiline
                                          maxRows={3}
                                          sx={{ bgcolor: 'white' }}
                                        />
                                        <IconButton
                                          size="small"
                                          color="primary"
                                          onClick={handleSubmitReply}
                                          disabled={!replyText.trim() || creatingReply}
                                        >
                                          {creatingReply ? (
                                            <CircularProgress size={16} />
                                          ) : (
                                            <SendIcon fontSize="small" />
                                          )}
                                        </IconButton>
                                        <IconButton
                                          size="small"
                                          onClick={handleCancelReply}
                                        >
                                          <CancelIcon fontSize="small" />
                                        </IconButton>
                                      </Box>
                                    </Box>
                                  )}
                                  
                                  {/* Display Replies */}
                                  {comment.replies && comment.replies.length > 0 && (
                                    <Box mt={1.5} ml={4} display="flex" flexDirection="column" gap={1.5}>
                                      {comment.replies.map((reply) => renderReply(reply, post.postId, 0, post))}
                                    </Box>
                                  )}
                                </>
                              )}
                            </Box>
                          )
                        })}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                        Chưa có bình luận nào
                      </Typography>
                    )}
                  </Box>
                )}
              </CardContent>

              {/* Menu */}
              <Menu
                anchorEl={menuAnchor[post.postId]}
                open={Boolean(menuAnchor[post.postId])}
                onClose={() => handleMenuClose(post.postId)}
              >
                {isAdmin && post.status === 'Pending' && (
                  <>
                    <MenuItem onClick={() => handleOpenApproveDialog(post)}>
                      <CheckCircleIcon sx={{ mr: 1 }} fontSize="small" color="success" />
                      Duyệt bài viết
                    </MenuItem>
                    <MenuItem onClick={() => handleOpenRejectDialog(post)}>
                      <CancelIcon sx={{ mr: 1 }} fontSize="small" color="error" />
                      Từ chối
                    </MenuItem>
                    <Divider />
                  </>
                )}
                {canEdit(post) && (
                  <MenuItem onClick={() => handleOpenEditDialog(post)}>
                    <EditIcon sx={{ mr: 1 }} fontSize="small" />
                    Chỉnh sửa
                  </MenuItem>
                )}
                {canDelete(post) && (
                  <MenuItem
                    onClick={() => handleOpenDeleteDialog(post)}
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
            borderRadius: '1.5rem',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)'
          }
        }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%)',
            color: 'white',
            fontWeight: 700,
            fontSize: '1.25rem',
            py: 2.5,
            px: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            boxShadow: '0 4px 20px rgba(15, 118, 110, 0.3)',
            '&::before': {
              content: '""',
              width: 4,
              height: 28,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.5)'
            }
          }}
        >
          Tạo bài viết mới
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'transparent', pt: 4, px: 3 }}>
          <TextField
            fullWidth
            label="Tiêu đề"
            placeholder="Nhập tiêu đề bài viết..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            sx={{
              mb: 2.5,
              mt: 2,
              '& .MuiOutlinedInput-root': {
                borderRadius: '0.75rem',
                bgcolor: 'white',
                border: '1.5px solid #94a3b8',
                '& fieldset': { border: 'none' },
                '&:hover': {
                  borderColor: '#0f766e'
                },
                '&.Mui-focused': {
                  borderColor: '#0f766e',
                  boxShadow: '0 0 0 3px rgba(15, 118, 110, 0.1)'
                }
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: '#0f766e'
              }
            }}
          />
          <TextField
            fullWidth
            multiline
            rows={6}
            label="Nội dung"
            placeholder="Nhập nội dung bài viết..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            sx={{
              mb: 2.5,
              '& .MuiOutlinedInput-root': {
                borderRadius: '0.75rem',
                bgcolor: 'white',
                border: '1.5px solid #94a3b8',
                '& fieldset': { border: 'none' },
                '&:hover': {
                  borderColor: '#0f766e'
                },
                '&.Mui-focused': {
                  borderColor: '#0f766e',
                  boxShadow: '0 0 0 3px rgba(15, 118, 110, 0.1)'
                }
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: '#0f766e'
              }
            }}
          />
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
                  borderRadius: '0.75rem',
                  borderWidth: 2,
                  borderColor: '#0f766e',
                  color: '#0f766e',
                  px: 3,
                  py: 1.2,
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderWidth: 2,
                    borderColor: '#0d9488',
                    background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                    color: 'white',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(15, 118, 110, 0.3)'
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
                    borderRadius: '0.75rem',
                    overflow: 'hidden',
                    border: '3px solid #14b8a6',
                    boxShadow: '0 4px 12px rgba(15, 118, 110, 0.15)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: '0 8px 20px rgba(15, 118, 110, 0.25)'
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
                        boxShadow: '0 4px 12px rgba(211, 47, 47, 0.5)'
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
        <DialogActions sx={{ bgcolor: 'transparent', px: 3, pb: 3, pt: 1, gap: 1.5 }}>
          <Button
            onClick={handleCloseCreateDialog}
            sx={{
              color: '#64748b',
              borderRadius: '0.75rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: '#f1f5f9',
                color: '#334155'
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleCreatePost}
            variant="contained"
            disabled={
              creating || (!newTitle.trim() && !newContent.trim() && newImages.length === 0)
            }
            sx={{
              borderRadius: '0.75rem',
              px: 4,
              py: 1,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
              boxShadow: '0 4px 12px rgba(15, 118, 110, 0.3)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(15, 118, 110, 0.4)'
              },
              '&:disabled': {
                background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
                boxShadow: 'none'
              }
            }}
          >
            {creating ? <CircularProgress size={20} color="inherit" /> : 'Tạo bài viết'}
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
            borderRadius: '1.5rem',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)'
          }
        }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)',
            color: 'white',
            fontWeight: 700,
            fontSize: '1.25rem',
            py: 2.5,
            px: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            boxShadow: '0 4px 20px rgba(124, 58, 237, 0.3)',
            '&::before': {
              content: '""',
              width: 4,
              height: 28,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.5)'
            }
          }}
        >
          Chỉnh sửa bài viết
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'transparent', pt: 4, px: 3 }}>
          <TextField
            fullWidth
            label="Tiêu đề"
            placeholder="Nhập tiêu đề bài viết..."
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            sx={{
              mb: 2.5,
              mt: 2,
              '& .MuiOutlinedInput-root': {
                borderRadius: '0.75rem',
                bgcolor: 'white',
                border: '1.5px solid #94a3b8',
                '& fieldset': { border: 'none' },
                '&:hover': {
                  borderColor: '#7c3aed'
                },
                '&.Mui-focused': {
                  borderColor: '#7c3aed',
                  boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.1)'
                }
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: '#7c3aed'
              }
            }}
          />
          <TextField
            fullWidth
            multiline
            rows={6}
            label="Nội dung"
            placeholder="Nhập nội dung bài viết..."
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            sx={{
              mb: 2.5,
              '& .MuiOutlinedInput-root': {
                borderRadius: '0.75rem',
                bgcolor: 'white',
                border: '1.5px solid #94a3b8',
                '& fieldset': { border: 'none' },
                '&:hover': {
                  borderColor: '#7c3aed'
                },
                '&.Mui-focused': {
                  borderColor: '#7c3aed',
                  boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.1)'
                }
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: '#7c3aed'
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
                  borderRadius: '0.75rem',
                  borderWidth: 2,
                  borderColor: '#7c3aed',
                  color: '#7c3aed',
                  px: 3,
                  py: 1.2,
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderWidth: 2,
                    borderColor: '#8b5cf6',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
                    color: 'white',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)'
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
                    borderRadius: '0.75rem',
                    overflow: 'hidden',
                    border: '3px solid #a78bfa',
                    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.15)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: '0 8px 20px rgba(124, 58, 237, 0.25)'
                    }
                  }}
                >
                  <img
                    src={
                      image.startsWith('data:image/') || image.startsWith('http')
                        ? image
                        : `data:image/jpeg;base64,${image}`
                    }
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
                        boxShadow: '0 4px 12px rgba(211, 47, 47, 0.5)'
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
                    borderRadius: '0.75rem',
                    overflow: 'hidden',
                    border: '3px solid #14b8a6',
                    boxShadow: '0 4px 12px rgba(15, 118, 110, 0.15)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: '0 8px 20px rgba(15, 118, 110, 0.25)'
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
                      bgcolor: '#ef4444',
                      color: 'white',
                      width: 28,
                      height: 28,
                      boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                      '&:hover': {
                        bgcolor: '#dc2626',
                        transform: 'scale(1.15)',
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.5)'
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
        <DialogActions sx={{ bgcolor: 'transparent', px: 3, pb: 3, pt: 1, gap: 1.5 }}>
          <Button
            onClick={handleCloseEditDialog}
            sx={{
              color: '#64748b',
              borderRadius: '0.75rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: '#f1f5f9',
                color: '#334155'
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleUpdatePost}
            variant="contained"
            disabled={
              updating ||
              (!editTitle.trim() &&
                !editContent.trim() &&
                editImages.length === 0 &&
                editNewImages.length === 0)
            }
            sx={{
              borderRadius: '0.75rem',
              px: 4,
              py: 1,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(124, 58, 237, 0.4)'
              },
              '&:disabled': {
                background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
                boxShadow: 'none'
              }
            }}
          >
            {updating ? <CircularProgress size={20} color="inherit" /> : 'Lưu thay đổi'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog (for own posts - no reason required) */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        PaperProps={{
          sx: {
            borderRadius: '1.5rem',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            background: 'linear-gradient(180deg, #ffffff 0%, #fef2f2 100%)',
            minWidth: 400
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
              bgcolor: 'rgba(255,255,255,0.5)'
            }
          }}
        >
          Xác nhận xóa
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'transparent', pt: 4, px: 3 }}>
          <DialogContentText
            sx={{
              color: '#1e293b',
              fontSize: '1rem',
              lineHeight: 1.6,
              p: 2,
              mt: 1,
              bgcolor: 'rgba(239, 68, 68, 0.05)',
              borderRadius: '0.75rem',
              border: '1px solid rgba(239, 68, 68, 0.15)'
            }}
          >
            Bạn có chắc chắn muốn xóa bài viết này? Hành động này không thể hoàn tác.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ bgcolor: 'transparent', px: 3, pb: 3, pt: 1, gap: 1.5 }}>
          <Button
            onClick={handleCloseDeleteDialog}
            sx={{
              color: '#64748b',
              borderRadius: '0.75rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: '#f1f5f9',
                color: '#334155'
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleDeletePost}
            variant="contained"
            disabled={deleting}
            sx={{
              borderRadius: '0.75rem',
              px: 4,
              py: 1,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(239, 68, 68, 0.4)'
              },
              '&:disabled': {
                background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
                boxShadow: 'none'
              }
            }}
          >
            {deleting ? <CircularProgress size={20} color="inherit" /> : 'Xóa'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Post with Reason Dialog (for others' posts - reason required) */}
      <Dialog
        open={deletePostReasonDialogOpen}
        onClose={handleCloseDeletePostReasonDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '1.5rem',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            background: 'linear-gradient(180deg, #ffffff 0%, #fef2f2 100%)'
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
              bgcolor: 'rgba(255,255,255,0.5)'
            }
          }}
        >
          Xóa bài viết của người khác
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'transparent', pt: 4, px: 3 }}>
          <DialogContentText
            sx={{
              color: '#1e293b',
              fontSize: '1rem',
              mb: 2.5,
              mt: 1,
              p: 2,
              bgcolor: 'rgba(239, 68, 68, 0.05)',
              borderRadius: '0.75rem',
              border: '1px solid rgba(239, 68, 68, 0.15)'
            }}
          >
            Bạn đang xóa bài viết của <strong>{deletingPostWithReason?.authorName}</strong>. Vui
            lòng nhập lý do để thông báo cho họ.
          </DialogContentText>
          <TextField
            fullWidth
            label="Lý do xóa bài viết *"
            placeholder="Nhập lý do xóa bài viết..."
            multiline
            rows={3}
            value={deletePostReason}
            onChange={(e) => {
              setDeletePostReason(e.target.value)
              setDeletePostReasonError('')
            }}
            error={!!deletePostReasonError}
            helperText={deletePostReasonError}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '0.75rem',
                bgcolor: 'white',
                border: '1.5px solid #94a3b8',
                '& fieldset': { border: 'none' },
                '&:hover': {
                  borderColor: '#ef4444'
                },
                '&.Mui-focused': {
                  borderColor: '#ef4444',
                  boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.1)'
                }
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: '#ef4444'
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ bgcolor: 'transparent', px: 3, pb: 3, pt: 1, gap: 1.5 }}>
          <Button
            onClick={handleCloseDeletePostReasonDialog}
            sx={{
              color: '#64748b',
              borderRadius: '0.75rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: '#f1f5f9',
                color: '#334155'
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleDeletePostWithReason}
            variant="contained"
            disabled={deleting}
            sx={{
              borderRadius: '0.75rem',
              px: 4,
              py: 1,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(239, 68, 68, 0.4)'
              },
              '&:disabled': {
                background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
                boxShadow: 'none'
              }
            }}
          >
            {deleting ? <CircularProgress size={20} color="inherit" /> : 'Xóa bài viết'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog
        open={approveDialogOpen}
        onClose={handleCloseApproveDialog}
        PaperProps={{
          sx: {
            borderRadius: '1.5rem',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
            minWidth: 400
          }
        }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)',
            color: 'white',
            fontWeight: 700,
            fontSize: '1.25rem',
            py: 2.5,
            px: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            boxShadow: '0 4px 20px rgba(34, 197, 94, 0.3)',
            '&::before': {
              content: '""',
              width: 4,
              height: 28,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.5)'
            }
          }}
        >
          Duyệt bài viết
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'transparent', pt: 4, px: 3 }}>
          <DialogContentText
            sx={{
              color: '#1e293b',
              fontSize: '1rem',
              lineHeight: 1.6,
              p: 2,
              mt: 1,
              bgcolor: 'rgba(34, 197, 94, 0.05)',
              borderRadius: '0.75rem',
              border: '1px solid rgba(34, 197, 94, 0.15)'
            }}
          >
            Bạn có chắc chắn muốn duyệt bài viết này?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ bgcolor: 'transparent', px: 3, pb: 3, pt: 1, gap: 1.5 }}>
          <Button
            onClick={handleCloseApproveDialog}
            sx={{
              color: '#64748b',
              borderRadius: '0.75rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: '#f1f5f9',
                color: '#334155'
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleApprovePost}
            variant="contained"
            disabled={reviewing}
            sx={{
              borderRadius: '0.75rem',
              px: 4,
              py: 1,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(34, 197, 94, 0.4)'
              },
              '&:disabled': {
                background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
                boxShadow: 'none'
              }
            }}
          >
            {reviewing ? <CircularProgress size={20} color="inherit" /> : 'Duyệt'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={rejectDialogOpen}
        onClose={handleCloseRejectDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '1.5rem',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            background: 'linear-gradient(180deg, #ffffff 0%, #fff7ed 100%)'
          }
        }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)',
            color: 'white',
            fontWeight: 700,
            fontSize: '1.25rem',
            py: 2.5,
            px: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            boxShadow: '0 4px 20px rgba(249, 115, 22, 0.3)',
            '&::before': {
              content: '""',
              width: 4,
              height: 28,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.5)'
            }
          }}
        >
          Từ chối bài viết
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'transparent', pt: 4, px: 3 }}>
          <DialogContentText
            sx={{
              color: '#1e293b',
              fontSize: '1rem',
              mb: 2.5,
              mt: 1,
              p: 2,
              bgcolor: 'rgba(249, 115, 22, 0.05)',
              borderRadius: '0.75rem',
              border: '1px solid rgba(249, 115, 22, 0.15)'
            }}
          >
            Vui lòng nhập lý do từ chối:
          </DialogContentText>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder="Nhập lý do từ chối..."
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '0.75rem',
                bgcolor: 'white',
                border: '1.5px solid #94a3b8',
                '& fieldset': { border: 'none' },
                '&:hover': {
                  borderColor: '#f97316'
                },
                '&.Mui-focused': {
                  borderColor: '#f97316',
                  boxShadow: '0 0 0 3px rgba(249, 115, 22, 0.1)'
                }
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: '#f97316'
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ bgcolor: 'transparent', px: 3, pb: 3, pt: 1, gap: 1.5 }}>
          <Button
            onClick={handleCloseRejectDialog}
            sx={{
              color: '#64748b',
              borderRadius: '0.75rem',
              px: 3,
              py: 1,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: '#f1f5f9',
                color: '#334155'
              }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleRejectPost}
            variant="contained"
            disabled={reviewing || !rejectComment.trim()}
            sx={{
              borderRadius: '0.75rem',
              px: 4,
              py: 1,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 16px rgba(249, 115, 22, 0.4)'
              },
              '&:disabled': {
                background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
                boxShadow: 'none'
              }
            }}
          >
            {reviewing ? <CircularProgress size={20} color="inherit" /> : 'Từ chối'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Likes Dialog */}
      <Dialog
        open={likesDialogOpen}
        onClose={() => setLikesDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.default',
            borderRadius: 2
          }
        }}
      >
        <DialogTitle
          sx={{ bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight="bold">
              Người đã phản ứng với bài viết
            </Typography>
            <IconButton
              onClick={() => setLikesDialogOpen(false)}
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'background.default', pt: 2 }}>
          {selectedPostLikes && selectedPostLikes.length > 0 ? (
            <Box>
              {selectedPostLikes.map((like, index) => {
                // Map reactionType sang emoji và label
                const reactionType = (like.reactionType ?? 'like').toLowerCase()
                const reactionDisplay = REACTIONS.find((r) => r.key === reactionType) ?? REACTIONS[0]
                
                return (
                  <Box
                    key={like.postLikeId || index}
                    display="flex"
                    alignItems="center"
                    gap={2}
                    py={1.5}
                    sx={{
                      borderBottom: index < selectedPostLikes.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                      '&:hover': {
                        bgcolor: 'action.hover',
                        borderRadius: 1
                      }
                    }}
                  >
                    <Avatar
                      src={like.avatar || undefined}
                      sx={{
                        width: 40,
                        height: 40,
                        bgcolor: 'primary.main'
                      }}
                    >
                      {like.fullName?.charAt(0)?.toUpperCase() || 'U'}
                    </Avatar>
                    <Box flex={1}>
                      <Typography variant="body1" fontWeight="medium">
                        {like.fullName || 'Người dùng'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatTimeAgo(like.createdDate)}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontSize: '2rem' }}>
                      {reactionDisplay.emoji}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
          ) : (
            <Box textAlign="center" py={4}>
              <LikeBorderIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
              <Typography variant="body1" color="text.secondary">
                Chưa có ai phản ứng với bài viết này
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Comment Likes Dialog */}
      <Dialog
        open={commentLikesDialogOpen}
        onClose={() => setCommentLikesDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.default',
            borderRadius: 2
          }
        }}
      >
        <DialogTitle
          sx={{ bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight="bold">
              Người đã thích bình luận
            </Typography>
            <IconButton
              onClick={() => setCommentLikesDialogOpen(false)}
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'background.default', pt: 2 }}>
          {selectedCommentLikes && selectedCommentLikes.length > 0 ? (
            <Box>
              {selectedCommentLikes.map((like, index) => (
                <Box
                  key={like.postCommentLikeId || index}
                  display="flex"
                  alignItems="center"
                  gap={2}
                  py={1.5}
                  sx={{
                    borderBottom: index < selectedCommentLikes.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                    '&:hover': {
                      bgcolor: 'action.hover',
                      borderRadius: 1
                    }
                  }}
                >
                  <Avatar
                    src={like.avatar}
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: 'primary.main'
                    }}
                  >
                    {like.fullName?.charAt(0)?.toUpperCase() || 'U'}
                  </Avatar>
                  <Box flex={1}>
                    <Typography variant="body1" fontWeight="medium">
                      {like.fullName || 'Người dùng'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatTimeAgo(like.createdDate)}
                    </Typography>
                  </Box>
                  <FavoriteIcon sx={{ color: 'error.main', fontSize: 20 }} />
                </Box>
              ))}
            </Box>
          ) : (
            <Box textAlign="center" py={4}>
              <FavoriteIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
              <Typography variant="body1" color="text.secondary">
                Chưa có ai thích bình luận này
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Comment Confirm Dialog */}
      <Dialog
        open={deleteCommentDialogOpen}
        onClose={() => {
          setDeleteCommentDialogOpen(false)
          setDeletingCommentInfo(null)
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 1
          }
        }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 600 }}>
          Xác nhận xóa bình luận
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: deletingCommentInfo?.isOwnContent ? 0 : 2 }}>
            Bạn có chắc muốn xóa bình luận này? Hành động này không thể hoàn tác.
          </DialogContentText>
          {/* Hiển thị input lý do nếu xóa comment của người khác */}
          {deletingCommentInfo && !deletingCommentInfo.isOwnContent && (
            <TextField
              fullWidth
              label="Lý do xóa bình luận *"
              placeholder="Nhập lý do xóa để thông báo cho người dùng..."
              multiline
              rows={2}
              value={deleteReason}
              onChange={(e) => {
                setDeleteReason(e.target.value)
                setDeleteReasonError('')
              }}
              error={!!deleteReasonError}
              helperText={deleteReasonError}
              sx={{ mt: 2 }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setDeleteCommentDialogOpen(false)
              setDeletingCommentInfo(null)
              setDeleteReason('')
              setDeleteReasonError('')
            }}
            variant="outlined"
            sx={{ borderRadius: 2 }}
          >
            Hủy
          </Button>
          <Button
            onClick={confirmDeleteComment}
            variant="contained"
            color="error"
            sx={{ borderRadius: 2 }}
            disabled={deletingCommentInfo ? deletingComment.has(deletingCommentInfo.commentId) : false}
          >
            {deletingCommentInfo && deletingComment.has(deletingCommentInfo.commentId) ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              'Xóa'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ open: false, message: '' })}
          severity={snackbar.severity || 'success'}
          sx={{
            borderRadius: '0.75rem',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            minWidth: '300px',
            ...(snackbar.severity === 'success' && {
              bgcolor: '#f0fdf4',
              color: '#166534',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              '& .MuiAlert-icon': { color: '#22c55e' }
            }),
            ...(snackbar.severity === 'error' && {
              bgcolor: '#fef2f2',
              color: '#991b1b',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              '& .MuiAlert-icon': { color: '#ef4444' }
            }),
            ...(snackbar.severity === 'warning' && {
              bgcolor: '#fffbeb',
              color: '#92400e',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              '& .MuiAlert-icon': { color: '#f59e0b' }
            }),
            ...(snackbar.severity === 'info' && {
              bgcolor: '#eff6ff',
              color: '#1e40af',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              '& .MuiAlert-icon': { color: '#3b82f6' }
            })
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}


