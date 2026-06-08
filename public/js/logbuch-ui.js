/**
 * Gemeinsame Logbuch-UI – Dropdowns im Streets-of-Logic-Stil.
 */
window.LogbuchUI = {
  escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  fieldLabel(text, opts = {}) {
    const req = opts.required
      ? ' <span class="logbuch-req">*</span>'
      : opts.optional
        ? ' <span class="logbuch-opt">(optional)</span>'
        : "";
    return `<label class="logbuch-label">${this.escapeHtml(text)}${req}</label>`;
  },

  select(field, options, value, cfg = {}) {
    const id = cfg.id || `lb-${field}`;
    const placeholder = cfg.placeholder || "Bitte wählen…";
    const multiple = !!cfg.multiple;
    const size = cfg.size || (multiple ? 4 : 1);
    const phase = cfg.phase ? ` logbuch-select-${cfg.phase}` : "";

    let optsHtml = "";
    if (!multiple && !cfg.hidePlaceholder) {
      const sel = !value ? "selected" : "";
      optsHtml += `<option value="" ${sel}>${this.escapeHtml(placeholder)}</option>`;
    }

    optsHtml += options
      .map((opt) => {
        const val = opt.value ?? opt.id ?? opt;
        const lab = opt.label ?? opt;
        const disabled = opt.disabled ? "disabled" : "";
        const selected = multiple
          ? (Array.isArray(value) && value.includes(val) ? "selected" : "")
          : value === val
            ? "selected"
            : "";
        return `<option value="${this.escapeHtml(val)}" ${disabled} ${selected}>${this.escapeHtml(lab)}</option>`;
      })
      .join("");

    const dataField = cfg.dataField || field;
    const dataItem = cfg.dataItem ? ` data-item="${this.escapeHtml(cfg.dataItem)}"` : "";

    return `
      <select id="${id}" class="logbuch-select${phase}" data-field="${dataField}"${dataItem}
        ${multiple ? "multiple" : ""} size="${size}">
        ${optsHtml}
      </select>`;
  },

  selectOptgroups(field, groups, value, cfg = {}) {
    const id = cfg.id || `lb-${field}`;
    const placeholder = cfg.placeholder || "Bitte wählen…";
    const phase = cfg.phase ? ` logbuch-select-${cfg.phase}` : "";

    let html = `<select id="${id}" class="logbuch-select${phase}" data-field="${field}">`;
    html += `<option value="">${this.escapeHtml(placeholder)}</option>`;
    for (const [group, items] of Object.entries(groups)) {
      html += `<optgroup label="${this.escapeHtml(group)}">`;
      html += items
        .map((item) => {
          const sel = value === item ? "selected" : "";
          return `<option value="${this.escapeHtml(item)}" ${sel}>${this.escapeHtml(item)}</option>`;
        })
        .join("");
      html += `</optgroup>`;
    }
    html += `</select>`;
    return html;
  },

  fieldWrap(label, control, hint = "", opts = {}) {
    const wide = opts.wide ? " logbuch-field-wide" : "";
    return `
      <div class="logbuch-field${wide}">
        ${label}
        ${control}
        ${hint ? `<p class="logbuch-hint">${this.escapeHtml(hint)}</p>` : ""}
      </div>`;
  },

  btnPrimary(text, id, disabled = false, extraClass = "") {
    return `<button type="button" class="btn-primary logbuch-submit ${extraClass}" id="${id}" ${disabled ? "disabled" : ""}>${this.escapeHtml(text)}</button>`;
  },

  btnGhost(text, id) {
    return `<button type="button" class="logbuch-btn-ghost" id="${id}">${this.escapeHtml(text)}</button>`;
  },

  msg(text, type = "error") {
    return `<div class="logbuch-msg logbuch-msg-${type}">${this.escapeHtml(text)}</div>`;
  },

  bindSelects(root, state, onChange) {
    root.querySelectorAll(".logbuch-select[data-field]").forEach((el) => {
      el.addEventListener("change", () => {
        const field = el.dataset.field;
        if (el.multiple) {
          state[field] = [...el.selectedOptions].map((o) => o.value).filter(Boolean);
        } else {
          state[field] = el.value || null;
        }
        if (onChange) onChange(field, el);
      });
    });
  }
};
