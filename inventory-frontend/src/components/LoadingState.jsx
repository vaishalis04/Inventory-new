export const Loading = ({ text = "Loading..." }) => <p className="muted">{text}</p>;

export const ErrorMessage = ({ error, onRetry }) =>
  error ? (
    <p role="alert" className="alert error">
      {error}
      {onRetry && (
        <button className="link" onClick={onRetry}>
          Retry
        </button>
      )}
    </p>
  ) : null;

export const Success = ({ children }) =>
  children ? <p className="alert success">{children}</p> : null;
