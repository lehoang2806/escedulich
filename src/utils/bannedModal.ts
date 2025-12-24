/**
 * Hiển thị modal thông báo tài khoản bị khóa thay vì alert mặc định
 */
export const showBannedModal = (onClose?: () => void) => {
  // Kiểm tra nếu modal đã tồn tại
  if (document.getElementById('banned-account-modal-overlay')) {
    return
  }

  // Tạo overlay
  const overlay = document.createElement('div')
  overlay.id = 'banned-account-modal-overlay'
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    animation: fadeIn 0.3s ease;
  `

  // Tạo modal
  const modal = document.createElement('div')
  modal.style.cssText = `
    background: linear-gradient(145deg, #ffffff, #f8f9fa);
    border-radius: 20px;
    padding: 32px;
    max-width: 420px;
    width: 90%;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
    animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
  `

  // Icon
  const icon = document.createElement('div')
  icon.style.cssText = `
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    box-shadow: 0 8px 24px rgba(238, 90, 90, 0.4);
  `
  icon.innerHTML = `
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      <line x1="12" y1="15" x2="12" y2="17"></line>
    </svg>
  `

  // Title
  const title = document.createElement('h2')
  title.textContent = 'Tài khoản bị khóa'
  title.style.cssText = `
    color: #2d3748;
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  // Message
  const message = document.createElement('p')
  message.textContent = 'Tài khoản của bạn đã bị khóa do vi phạm điều khoản sử dụng hoặc theo yêu cầu của quản trị viên.'
  message.style.cssText = `
    color: #4a5568;
    font-size: 15px;
    line-height: 1.6;
    margin: 0 0 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  // Contact info
  const contact = document.createElement('p')
  contact.innerHTML = 'Vui lòng liên hệ hỗ trợ qua email: <strong style="color: #5a67d8;">support@esce.vn</strong>'
  contact.style.cssText = `
    color: #718096;
    font-size: 14px;
    margin: 0 0 24px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  // Button
  const button = document.createElement('button')
  button.textContent = 'Đã hiểu'
  button.style.cssText = `
    background: linear-gradient(135deg, #667eea, #5a67d8);
    color: white;
    border: none;
    padding: 14px 48px;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 16px rgba(90, 103, 216, 0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `
  button.onmouseover = () => {
    button.style.transform = 'translateY(-2px)'
    button.style.boxShadow = '0 6px 20px rgba(90, 103, 216, 0.5)'
  }
  button.onmouseout = () => {
    button.style.transform = 'translateY(0)'
    button.style.boxShadow = '0 4px 16px rgba(90, 103, 216, 0.4)'
  }
  button.onclick = () => {
    overlay.style.animation = 'fadeOut 0.2s ease forwards'
    modal.style.animation = 'slideDown 0.2s ease forwards'
    setTimeout(() => {
      overlay.remove()
      if (onClose) onClose()
    }, 200)
  }

  // Add CSS animations
  const style = document.createElement('style')
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes slideUp {
      from { 
        opacity: 0;
        transform: translateY(30px) scale(0.95);
      }
      to { 
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    @keyframes slideDown {
      from { 
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to { 
        opacity: 0;
        transform: translateY(30px) scale(0.95);
      }
    }
  `
  document.head.appendChild(style)

  // Assemble modal
  modal.appendChild(icon)
  modal.appendChild(title)
  modal.appendChild(message)
  modal.appendChild(contact)
  modal.appendChild(button)
  overlay.appendChild(modal)
  document.body.appendChild(overlay)
}
