/** Label + input/select/textarea. Pass `options` for a select: [{value,label}] */
export default function FormField({ label, type = "text", options, hint, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {options ? (
        <select {...props}>
          <option value="">— select —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea rows={3} {...props} />
      ) : type === "checkbox" ? (
        <input type="checkbox" {...props} />
      ) : (
        <input type={type} {...props} />
      )}
      {hint && <small className="muted">{hint}</small>}
      {children}
    </label>
  );
}
