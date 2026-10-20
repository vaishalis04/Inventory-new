
export default function Modal({ title, onClose, children }) {
  return (
    <div
      className="modal-backdrop dark-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal dark-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head dark-modal-head">
          <div>
            <span className="modal-eyebrow">WORKSPACE</span>
            <h2>{title}</h2>
          </div>

          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <div className="dark-modal-body">{children}</div>
      </div>
    </div>
  );
}
