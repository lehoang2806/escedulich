import React from 'react';
import { XIcon } from '../icons/index';
import './BookingConfirmationModal.css';

interface BookingConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalData: {
    bookingId: string | null;
    action: string;
    notes: string;
  };
  onConfirm: () => void;
  onModalDataChange: (data: { bookingId: string | null; action: string; notes: string }) => void;
}

const BookingConfirmationModal: React.FC<BookingConfirmationModalProps> = ({
  isOpen,
  onClose,
  modalData,
  onConfirm,
  onModalDataChange
}) => {
  if (!isOpen) return null;

  const getTitle = () => {
    if (modalData.action === 'accept') {
      return 'Chấp nhận booking';
    } else if (modalData.action === 'reject') {
      return 'Từ chối booking';
    } else if (modalData.action === 'complete') {
      return 'Hoàn thành booking';
    }
    return 'Xác nhận booking';
  };

  const getMessage = () => {
    if (modalData.action === 'accept') {
      return 'Bạn có chắc chắn muốn chấp nhận booking này?';
    } else if (modalData.action === 'reject') {
      return 'Bạn có chắc chắn muốn từ chối đơn này? Nếu từ chối bạn rất có thể sẽ bị khóa tài khoản tùy theo lý do từ chối.';
    } else if (modalData.action === 'complete') {
      return 'Bạn có chắc chắn muốn đánh dấu booking này là đã hoàn thành?';
    }
    return 'Bạn có chắc chắn muốn thực hiện hành động này?';
  };

  return (
    <div className="booking-confirmation-modal-overlay" onClick={onClose}>
      <div className="booking-confirmation-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="booking-confirmation-modal-header">
          <h2>{getTitle()}</h2>
          <button className="booking-confirmation-modal-close" onClick={onClose}>
            <XIcon className="booking-confirmation-modal-close-icon" />
          </button>
        </div>
        
        <div className="booking-confirmation-modal-body">
          <p style={{ marginBottom: '1rem' }}>{getMessage()}</p>
          
          {/* Cảnh báo đặc biệt cho action reject */}
          {modalData.action === 'reject' && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '2px solid #ef4444',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px'
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>⚠️</span>
              <p style={{ 
                margin: 0, 
                fontSize: '13px', 
                color: '#991b1b',
                lineHeight: '1.5',
                fontWeight: '500'
              }}>
                Lưu ý: Việc từ chối booking có thể ảnh hưởng đến uy tín của bạn. Admin sẽ xem xét lý do từ chối và có thể khóa tài khoản nếu phát hiện vi phạm.
              </p>
            </div>
          )}
          
          <div className="booking-confirmation-field">
            <label htmlFor="booking-notes-input">
              {modalData.action === 'reject' ? 'Lý do từ chối (bắt buộc):' : 'Ghi chú:'}
            </label>
            <textarea
              id="booking-notes-input"
              value={modalData.notes}
              onChange={(e) => onModalDataChange({ ...modalData, notes: e.target.value })}
              rows={4}
              placeholder={modalData.action === 'reject' ? 'Vui lòng nhập lý do từ chối...' : 'Nhập ghi chú (tùy chọn)...'}
              className="booking-confirmation-textarea"
              style={modalData.action === 'reject' ? { borderColor: '#ef4444' } : {}}
            />
          </div>
        </div>
        
        <div className="booking-confirmation-form-action">
          <button 
            type="button"
            className="booking-confirmation-btn-primary"
            onClick={onConfirm}
          >
            Xác nhận
          </button>
          <button 
            type="button"
            className="booking-confirmation-btn-secondary"
            onClick={onClose}
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingConfirmationModal;





