interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      {/* Dialog */}
      <div className="w-[400px] rounded-[18px] bg-white shadow-[0_8px_30px_rgba(15,23,42,0.12)] border border-black/8 p-5 animate-slide-up">
        <h2 className="text-[18px] font-semibold text-black mb-2">{title}</h2>
        <p className="text-[14px] text-black/60 mb-5 leading-relaxed">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-black/70 bg-black/5 hover:bg-black/10 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-white transition-colors ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-strong)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}