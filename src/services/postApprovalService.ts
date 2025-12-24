/**
 * postApprovalService.ts
 * Service để lưu trữ và lấy thời gian phê duyệt bài viết từ Firestore
 */

import { db } from '~/firebase'
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore'

const COLLECTION_NAME = 'post_approval_times'

/**
 * Lưu thời gian phê duyệt bài viết vào Firestore
 * @param postId - ID của bài viết
 * @param approvalTime - Thời gian phê duyệt (mặc định là thời gian hiện tại)
 */
export const saveApprovalTimeToFirestore = async (
  postId: number | string,
  approvalTime?: string
): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, String(postId))
    await setDoc(docRef, {
      postId: String(postId),
      approvalTime: approvalTime || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    console.log(`[postApprovalService] Saved approval time for post ${postId}`)
  } catch (error) {
    console.error('[postApprovalService] Error saving approval time to Firestore:', error)
    throw error
  }
}

/**
 * Lấy thời gian phê duyệt của một bài viết từ Firestore
 * @param postId - ID của bài viết
 * @returns Thời gian phê duyệt hoặc null nếu không tìm thấy
 */
export const getApprovalTimeFromFirestore = async (
  postId: number | string
): Promise<string | null> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, String(postId))
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      return docSnap.data().approvalTime || null
    }
    return null
  } catch (error) {
    console.error('[postApprovalService] Error getting approval time from Firestore:', error)
    return null
  }
}

/**
 * Lấy tất cả thời gian phê duyệt từ Firestore
 * @returns Object với key là postId và value là approvalTime
 */
export const getAllApprovalTimesFromFirestore = async (): Promise<Record<string, string>> => {
  try {
    const collectionRef = collection(db, COLLECTION_NAME)
    const querySnapshot = await getDocs(collectionRef)
    
    const times: Record<string, string> = {}
    querySnapshot.forEach((doc) => {
      const data = doc.data()
      if (data.postId && data.approvalTime) {
        times[String(data.postId)] = data.approvalTime
      }
    })
    
    console.log(`[postApprovalService] Loaded ${Object.keys(times).length} approval times from Firestore`)
    return times
  } catch (error) {
    console.error('[postApprovalService] Error getting all approval times from Firestore:', error)
    return {}
  }
}

/**
 * Lấy thời gian phê duyệt bài viết
 * Ưu tiên từ cached Firestore data, fallback to localStorage
 * @param postId - ID của bài viết
 * @param cachedTimes - Cache của approval times từ Firestore (optional)
 * @returns Thời gian phê duyệt hoặc null
 */
export const getApprovalTime = (
  postId: number | string,
  cachedTimes?: Record<string, string>
): string | null => {
  const postIdStr = String(postId)
  
  // Ưu tiên từ cached Firestore data
  if (cachedTimes && cachedTimes[postIdStr]) {
    return cachedTimes[postIdStr]
  }
  
  // Fallback to localStorage
  try {
    const approvedTimes = JSON.parse(localStorage.getItem('post_approved_times') || '{}')
    return approvedTimes[postIdStr] || null
  } catch (e) {
    console.error('[postApprovalService] Error reading from localStorage:', e)
    return null
  }
}
