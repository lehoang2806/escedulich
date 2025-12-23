/**
 * Service để lưu và đọc thời gian phê duyệt bài viết từ Firestore
 * Giải quyết vấn đề localStorage chỉ tồn tại trên browser của Admin
 * Bằng cách lưu vào Firestore, cả Admin và User đều có thể truy cập
 */

import { db } from '~/firebase'
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore'

const COLLECTION_NAME = 'post_approval_times'

/**
 * Lưu thời gian phê duyệt bài viết vào Firestore
 * Được gọi khi Admin approve bài viết
 */
export const saveApprovalTimeToFirestore = async (postId: number | string): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, String(postId))
    await setDoc(docRef, {
      postId: String(postId),
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    console.log(`[PostApprovalService] Saved approval time for post ${postId}`)
  } catch (error) {
    console.error('[PostApprovalService] Error saving approval time:', error)
    // Fallback to localStorage if Firestore fails
    try {
      const approvedTimes = JSON.parse(localStorage.getItem('post_approved_times') || '{}')
      approvedTimes[String(postId)] = new Date().toISOString()
      localStorage.setItem('post_approved_times', JSON.stringify(approvedTimes))
    } catch (e) {
      console.error('[PostApprovalService] Fallback localStorage also failed:', e)
    }
  }
}

/**
 * Lấy thời gian phê duyệt của một bài viết từ Firestore
 */
export const getApprovalTimeFromFirestore = async (postId: number | string): Promise<string | null> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, String(postId))
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      return docSnap.data().approvedAt || null
    }
    return null
  } catch (error) {
    console.error('[PostApprovalService] Error getting approval time:', error)
    // Fallback to localStorage
    try {
      const approvedTimes = JSON.parse(localStorage.getItem('post_approved_times') || '{}')
      return approvedTimes[String(postId)] || null
    } catch (e) {
      return null
    }
  }
}

/**
 * Lấy tất cả thời gian phê duyệt từ Firestore
 * Dùng để cache và tránh gọi nhiều lần
 */
export const getAllApprovalTimesFromFirestore = async (): Promise<Record<string, string>> => {
  try {
    const collectionRef = collection(db, COLLECTION_NAME)
    const querySnapshot = await getDocs(collectionRef)
    
    const approvalTimes: Record<string, string> = {}
    querySnapshot.forEach((doc) => {
      const data = doc.data()
      if (data.postId && data.approvedAt) {
        approvalTimes[data.postId] = data.approvedAt
      }
    })
    
    // Cache to localStorage for faster subsequent access
    localStorage.setItem('post_approved_times', JSON.stringify(approvalTimes))
    
    return approvalTimes
  } catch (error) {
    console.error('[PostApprovalService] Error getting all approval times:', error)
    // Fallback to localStorage
    try {
      return JSON.parse(localStorage.getItem('post_approved_times') || '{}')
    } catch (e) {
      return {}
    }
  }
}

/**
 * Lấy thời gian phê duyệt từ cache (localStorage) hoặc Firestore
 * Ưu tiên cache để tăng tốc độ
 */
export const getApprovalTime = (postId: number | string, cachedTimes?: Record<string, string>): string | null => {
  const postIdStr = String(postId)
  
  // Nếu có cached times từ Firestore, dùng nó
  if (cachedTimes && cachedTimes[postIdStr]) {
    return cachedTimes[postIdStr]
  }
  
  // Fallback to localStorage
  try {
    const approvedTimes = JSON.parse(localStorage.getItem('post_approved_times') || '{}')
    return approvedTimes[postIdStr] || null
  } catch (e) {
    return null
  }
}
