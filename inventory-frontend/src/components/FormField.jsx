
export default function FormField({
  label,
  type = "text",
  options,
  hint,
  children,
  ...props
}) {
  const isCheckbox = type === "checkbox";

  return (
    <label className={`field dark-field${isCheckbox ? " checkbox-field" : ""}`}>
      {isCheckbox ? (
        <span className="checkbox-control">
          <input type="checkbox" {...props} />
          <span className="checkbox-custom" aria-hidden="true" />
          <span className="field-label">{label}</span>
        </span>
      ) : (
        <>
          <span className="field-label">{label}</span>

          {options ? (
            <select className="dark-input" {...props}>
              <option value="">— Select an option —</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : type === "textarea" ? (
            <textarea
              className="dark-input"
              rows={3}
              {...props}
            />
          ) : (
            <input
              className="dark-input"
              type={type}
              {...props}
            />
          )}
        </>
      )}

      {hint && <small className="field-hint">{hint}</small>}
      {children}
    </label>
  );
}
