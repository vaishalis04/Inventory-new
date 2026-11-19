import { useEffect, useId, useMemo, useRef, useState } from "react";

export default function SearchableSelect({
  label,
  value,
  onChange,
  options = [],
  placeholder = "— Select an option —",
  searchPlaceholder = "Search options...",
  required = false,
  disabled = false,
}) {
  const id = useId();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => String(option.value) === String(value));
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term
      ? options.filter((option) => String(option.label).toLocaleLowerCase().includes(term))
      : options;
  }, [options, query]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function closeOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function selectOption(option) {
    onChange({ target: { value: option ? String(option.value) : "" } });
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="field dark-field searchable-field" ref={rootRef}>
      <span className="field-label">{label}{required ? " *" : ""}</span>
      <button
        id={`${id}-trigger`}
        className={`dark-input searchable-trigger${open ? " is-open" : ""}`}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-haspopup="listbox"
        aria-required={required}
        disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className={selected ? "" : "searchable-placeholder"}>{selected?.label || placeholder}</span>
        <span className="searchable-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="searchable-menu">
          <input
            ref={searchRef}
            className="dark-input searchable-query"
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            aria-label={`Search ${label.replace(/\s*\*$/, "")}`}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div id={`${id}-listbox`} className="searchable-options" role="listbox" aria-labelledby={`${id}-trigger`}>
            <button
              type="button"
              role="option"
              aria-selected={!selected}
              className={`searchable-option${!selected ? " selected" : ""}`}
              onClick={() => selectOption(null)}
            >
              {placeholder}
            </button>
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={String(option.value) === String(value)}
                className={`searchable-option${String(option.value) === String(value) ? " selected" : ""}`}
                onClick={() => selectOption(option)}
              >
                {option.label}
              </button>
            ))}
            {filtered.length === 0 && <div className="searchable-empty">No matching items.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
