import { Box, Typography, Avatar } from '@mui/material'

type Message = {
  id: number
  senderId: number
  senderName: string
  senderAvatar?: string
  content: string
  timestamp: string
  image?: string
  reactions?: { emoji: string; userId: number; userName: string }[]
  createdAt?: string
  createdAtMs?: number
}

type MessageBubbleProps = {
  message: Message
  isCurrentUser: boolean
  showAvatar: boolean
  showName: boolean
  showTimestamp: boolean
  isFirstInGroup: boolean
  isLastInGroup: boolean
  currentUserAvatar?: string
  participantAvatar?: string
}

/**
 * MessageBubble component - Giống style Facebook/Zalo
 * - Tin nhắn liên tiếp cùng người gửi được gộp lại
 * - Avatar chỉ hiện ở tin cuối cùng trong nhóm
 * - Tên người gửi chỉ hiện ở tin đầu tiên trong nhóm
 * - Timestamp chỉ hiện khi cách nhau > 5 phút
 * - Border radius thay đổi theo vị trí trong nhóm
 */
export default function MessageBubble({
  message,
  isCurrentUser,
  showAvatar,
  showName,
  showTimestamp,
  isFirstInGroup,
  isLastInGroup,
  currentUserAvatar,
  participantAvatar
}: MessageBubbleProps) {
  // Border radius theo vị trí trong nhóm tin nhắn
  const getBorderRadius = () => {
    const baseRadius = '1.8rem'
    const smallRadius = '0.4rem'

    if (isCurrentUser) {
      // Tin nhắn của mình - bên phải
      if (isFirstInGroup && isLastInGroup) {
        // Tin nhắn đơn lẻ
        return `${baseRadius} ${baseRadius} ${smallRadius} ${baseRadius}`
      } else if (isFirstInGroup) {
        // Tin đầu tiên trong nhóm
        return `${baseRadius} ${baseRadius} ${smallRadius} ${baseRadius}`
      } else if (isLastInGroup) {
        // Tin cuối cùng trong nhóm
        return `${baseRadius} ${smallRadius} ${smallRadius} ${baseRadius}`
      } else {
        // Tin ở giữa nhóm
        return `${baseRadius} ${smallRadius} ${smallRadius} ${baseRadius}`
      }
    } else {
      // Tin nhắn của người khác - bên trái
      if (isFirstInGroup && isLastInGroup) {
        return `${baseRadius} ${baseRadius} ${baseRadius} ${smallRadius}`
      } else if (isFirstInGroup) {
        return `${baseRadius} ${baseRadius} ${baseRadius} ${smallRadius}`
      } else if (isLastInGroup) {
        return `${smallRadius} ${baseRadius} ${baseRadius} ${smallRadius}`
      } else {
        return `${smallRadius} ${baseRadius} ${baseRadius} ${smallRadius}`
      }
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isCurrentUser ? 'flex-end' : 'flex-start',
        mb: isLastInGroup ? 1.5 : 0.3,
        px: 2
      }}
    >
      <Box
        sx={{
          maxWidth: '65%',
          display: 'flex',
          flexDirection: isCurrentUser ? 'row-reverse' : 'row',
          alignItems: 'flex-end',
          gap: 1.2
        }}
      >
        {/* Avatar - chỉ hiện ở tin cuối trong nhóm */}
        {!isCurrentUser && (
          <Box sx={{ width: 36, height: 36, flexShrink: 0 }}>
            {showAvatar && (
              <Avatar
                src={participantAvatar || message.senderAvatar || undefined}
                sx={{
                  width: 36,
                  height: 36,
                  fontSize: '1.3rem',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 3px 12px rgba(102, 126, 234, 0.35)',
                  border: '2px solid #fff'
                }}
              >
                {!participantAvatar && !message.senderAvatar && message.senderName.charAt(0).toUpperCase()}
              </Avatar>
            )}
          </Box>
        )}

        {/* Avatar của current user - bên phải */}
        {isCurrentUser && (
          <Box sx={{ width: 36, height: 36, flexShrink: 0 }}>
            {showAvatar && (
              <Avatar
                src={currentUserAvatar || undefined}
                sx={{
                  width: 36,
                  height: 36,
                  fontSize: '1.3rem',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
                  boxShadow: '0 3px 12px rgba(20, 184, 166, 0.35)',
                  border: '2px solid #fff'
                }}
              >
                {!currentUserAvatar && message.senderName.charAt(0).toUpperCase()}
              </Avatar>
            )}
          </Box>
        )}

        <Box 
          sx={{ 
            position: 'relative', 
            display: 'flex',
            flexDirection: 'column',
            alignItems: isCurrentUser ? 'flex-end' : 'flex-start'
          }}
        >
          {/* Tên người gửi - chỉ hiện ở tin đầu trong nhóm */}
          {showName && !isCurrentUser && (
            <Typography
              sx={{
                fontSize: '1.15rem',
                fontWeight: 600,
                color: '#64748b',
                ml: 1,
                mb: 0.4
              }}
            >
              {message.senderName}
            </Typography>
          )}

          {/* Message bubble */}
          <Box
            sx={{
              px: 1.8,
              py: 1,
              background: isCurrentUser
                ? 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)'
                : '#f1f5f9',
              color: isCurrentUser ? '#fff' : '#1e293b',
              borderRadius: getBorderRadius(),
              maxWidth: '100%',
              wordBreak: 'break-word',
              position: 'relative',
              transition: 'all 0.2s ease',
              boxShadow: isCurrentUser
                ? '0 2px 12px rgba(20, 184, 166, 0.25)'
                : '0 1px 4px rgba(0, 0, 0, 0.06)',
              '&:hover': {
                transform: 'translateY(-1px)',
                boxShadow: isCurrentUser
                  ? '0 4px 16px rgba(20, 184, 166, 0.35)'
                  : '0 2px 8px rgba(0, 0, 0, 0.1)'
              }
            }}
          >
            {/* Ảnh đính kèm */}
            {message.image && (
              <Box
                sx={{
                  mb: message.content ? 0.8 : 0,
                  borderRadius: '1.2rem',
                  overflow: 'hidden',
                  maxWidth: '280px'
                }}
              >
                <img
                  src={message.image}
                  alt="attachment"
                  style={{ 
                    width: '100%', 
                    height: 'auto', 
                    display: 'block',
                    borderRadius: '8px'
                  }}
                />
              </Box>
            )}

            {/* Nội dung tin nhắn */}
            {message.content && (
              <Typography
                sx={{
                  fontSize: '1.4rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  fontWeight: 400
                }}
              >
                {message.content}
              </Typography>
            )}

            {/* Reactions */}
            {message.reactions && message.reactions.length > 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  bottom: -10,
                  right: isCurrentUser ? 'auto' : 8,
                  left: isCurrentUser ? 8 : 'auto',
                  display: 'flex',
                  gap: 0.3,
                  bgcolor: '#fff',
                  borderRadius: '1.2rem',
                  px: 0.8,
                  py: 0.3,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  border: '1px solid rgba(0,0,0,0.05)'
                }}
              >
                {message.reactions.slice(0, 3).map((r, i) => (
                  <span key={i} style={{ fontSize: '1.3rem' }}>{r.emoji}</span>
                ))}
                {message.reactions.length > 3 && (
                  <Typography sx={{ fontSize: '1.1rem', color: '#64748b', fontWeight: 500 }}>
                    +{message.reactions.length - 3}
                  </Typography>
                )}
              </Box>
            )}
          </Box>

          {/* Timestamp - chỉ hiện khi cần */}
          {showTimestamp && (
            <Typography
              sx={{
                fontSize: '1.05rem',
                color: '#94a3b8',
                mt: 0.5,
                ml: isCurrentUser ? 0 : 1,
                mr: isCurrentUser ? 1 : 0,
                textAlign: isCurrentUser ? 'right' : 'left',
                fontWeight: 400
              }}
            >
              {message.timestamp}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Helper function để xác định cách hiển thị tin nhắn trong danh sách
 * Trả về thông tin về việc hiển thị avatar, tên, timestamp cho mỗi tin nhắn
 */
export function getMessageDisplayInfo(
  messages: Message[],
  currentUserId: number,
  index: number
): {
  showAvatar: boolean
  showName: boolean
  showTimestamp: boolean
  isFirstInGroup: boolean
  isLastInGroup: boolean
} {
  const message = messages[index]
  const prevMessage = index > 0 ? messages[index - 1] : null
  const nextMessage = index < messages.length - 1 ? messages[index + 1] : null

  const isCurrentUser = message.senderId === currentUserId
  const isSameSenderAsPrev = prevMessage && prevMessage.senderId === message.senderId
  const isSameSenderAsNext = nextMessage && nextMessage.senderId === message.senderId

  // Kiểm tra khoảng cách thời gian (5 phút = 300000ms)
  const TIME_GAP = 5 * 60 * 1000
  const getTimestampMs = (msg: Message) => {
    // Ưu tiên dùng createdAtMs nếu có, sau đó là createdAt (ISO string)
    if (msg.createdAtMs) return msg.createdAtMs
    if (msg.createdAt) {
      const time = new Date(msg.createdAt).getTime()
      return Number.isNaN(time) ? 0 : time
    }
    return 0
  }

  const timeDiffWithPrev = prevMessage
    ? getTimestampMs(message) - getTimestampMs(prevMessage)
    : Infinity
  const timeDiffWithNext = nextMessage
    ? getTimestampMs(nextMessage) - getTimestampMs(message)
    : Infinity

  const isTimeGapWithPrev = timeDiffWithPrev > TIME_GAP
  const isTimeGapWithNext = timeDiffWithNext > TIME_GAP

  // Xác định vị trí trong nhóm
  const isFirstInGroup = !isSameSenderAsPrev || isTimeGapWithPrev
  const isLastInGroup = !isSameSenderAsNext || isTimeGapWithNext

  return {
    showAvatar: isLastInGroup && !isCurrentUser,
    showName: isFirstInGroup && !isCurrentUser,
    showTimestamp: isLastInGroup || isTimeGapWithNext,
    isFirstInGroup,
    isLastInGroup
  }
}
