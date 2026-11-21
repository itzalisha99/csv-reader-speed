// Fast drop-in for make.fun's csv-reader 1.0.0.
// Written from scratch in this session. The trick is to never scan
// past a field: at the start of each record find its first line break
// once (lineEnd). Every field after that is cut with a comma or quote
// search that stops inside the field, and a slice that is checked for
// stray CRs on the slice itself, never on the whole text. Only the
// rare broken shapes -- doubled quotes, a line break inside quotes,
// junk after a closing quote, a quote that never closes -- take a
// slower, still indexOf-driven path. Every answer is exactly
// csv-reader's: same {columns, rows, errors}, same error order, same
// line/row numbers, same padding and cutting of short and long rows.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;
  // Index of the next LF at or after the current record start (or -1).
  // A field that ends at a comma or a quote before this is a plain
  // field; a quoted field whose closing quote lies past this has a
  // line break inside it and goes the slow way.
  let lineEnd = -1;
  let lineHasCr = false;

  // Scan an unquoted field starting at pos, with `base` already in the
  // value. Only used inside the slow quoted path (junk, unterminated).
  // Returns [value, ended, added]: ended 0 = comma, 1 = line break,
  // 2 = end of text; added counts characters kept after `base`.
  function unquoted(base) {
    let value = base;
    let added = 0;
    for (;;) {
      if (pos >= n) return [value, 2, added];
      const comma = text.indexOf(',', pos);
      const nl = text.indexOf('\n', pos);
      const cr = text.indexOf('\r', pos);
      let end = n;
      let kind = 2;
      if (comma !== -1 && comma < end) { end = comma; kind = 0; }
      if (nl !== -1 && nl < end) { end = nl; kind = 1; }
      if (cr !== -1 && cr < end) {
        if (text.charCodeAt(cr + 1) === 10) {
          value += text.slice(pos, cr);
          added += cr - pos;
          pos = cr + 2;
          line += 1;
          return [value, 1, added];
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        value += text.slice(pos, cr);
        added += cr - pos;
        pos = cr + 1;
        continue;
      }
      if (kind === 0) {
        value += text.slice(pos, end);
        added += end - pos;
        pos = end + 1;
        return [value, 0, added];
      }
      if (kind === 1) {
        value += text.slice(pos, end);
        added += end - pos;
        pos = end + 1;
        line += 1;
        return [value, 1, added];
      }
      value += text.slice(pos, n);
      added += n - pos;
      pos = n;
      return [value, 2, added];
    }
  }

  function quotedJunk(value) {
    const r = unquoted(value);
    if (r[2] > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return r;
  }

  // A quoted field that is not the plain case: doubled quotes inside,
  // a line break inside, or no closing quote at all.
  function quotedSlow(open, openLine) {
    const parts = [];
    let search = open + 1;
    let closed = -1;
    for (;;) {
      const q = text.indexOf('"', search);
      if (q === -1) {
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return unquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        parts.push(text.slice(search, q + 1));
        search = q + 2;
        continue;
      }
      parts.push(text.slice(search, q));
      closed = q;
      break;
    }
    let value = parts.length === 1 ? parts[0] : parts.join('');
    if (value.indexOf('\r') !== -1 || value.indexOf('\n') !== -1) {
      const breaks = value.match(/\r\n|\r|\n/g);
      if (breaks) line += breaks.length;
      if (value.indexOf('\r') !== -1) value = value.replace(/\r\n?/g, '\n');
    }
    pos = closed + 1;
    if (pos >= n) return [value, 2, 0];
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; return [value, 0, 0]; }
    if (c === 10) { pos += 1; line += 1; return [value, 1, 0]; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; return [value, 1, 0]; }
    return quotedJunk(value);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    lineEnd = text.indexOf('\n', pos);
    const cr0 = text.indexOf('\r', pos);
    lineHasCr = lineEnd === -1 ? cr0 !== -1 : (cr0 !== -1 && cr0 < lineEnd && cr0 !== lineEnd - 1);
    const fields = [];
    let quoted = false;
    let ended = 2;

    for (;;) {
      quoted = text.charCodeAt(pos) === 34;
      let value;
      if (quoted) {
        const open = pos;
        const q = text.indexOf('"', pos + 1);
        if (q === -1 || text.charCodeAt(q + 1) === 34 || (lineEnd !== -1 && q > lineEnd)) {
          const r = quotedSlow(open, line);
          value = r[0];
          ended = r[1];
          if (ended === 0) { lineEnd = text.indexOf('\n', pos); const cr1 = text.indexOf('\r', pos); lineHasCr = lineEnd === -1 ? cr1 !== -1 : (cr1 !== -1 && cr1 < lineEnd && cr1 !== lineEnd - 1); }
        } else {
          // Plain quoted field inside this line: cut it out.
          value = text.slice(pos + 1, q);
          const crAt = lineHasCr ? value.indexOf('\r') : -1;
          if (crAt !== -1) {
            // No LF can be inside (that would put q past lineEnd),
            // so each CR here is a lone CR, read as LF.
            line += value.length - value.replaceAll('\r', '').length;
            value = value.replaceAll('\r', '\n');
          }
          pos = q + 1;
          if (pos >= n) {
            ended = 2;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) { pos += 1; ended = 0; }
            else if (c === 10) { pos += 1; line += 1; ended = 1; }
            else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; ended = 1; }
            else {
              // Junk after the closing quote, up to comma or line end.
              const comma = text.indexOf(',', pos);
              const junkEnd = comma !== -1 && (lineEnd === -1 || comma < lineEnd)
                ? comma
                : (lineEnd === -1 ? n : lineEnd);
              let junkEnd2 = junkEnd;
              if (junkEnd === lineEnd && junkEnd > pos && text.charCodeAt(junkEnd - 1) === 13) junkEnd2 = junkEnd - 1;
              let junk = text.slice(pos, junkEnd2);
              const jcr = lineHasCr ? junk.indexOf('\r') : -1;
              if (jcr !== -1) {
                const clean = junk.replaceAll('\r', '');
                for (let i = 0; i < junk.length - clean.length; i++) {
                  errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
                }
                junk = clean;
              }
              if (junk.length > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
              value += junk;
              if (junkEnd === lineEnd) {
                pos = lineEnd + 1;
                line += 1;
                ended = 1;
              } else if (junkEnd === n) {
                pos = n;
                ended = 2;
              } else {
                pos = junkEnd + 1;
                ended = 0;
              }
            }
          }
        }
      } else {
        // Plain unquoted field: it ends at the next comma before the
        // line end, or at the line end itself.
        const comma = text.indexOf(',', pos);
        if (comma !== -1 && (lineEnd === -1 || comma < lineEnd)) {
          value = text.slice(pos, comma);
          const crAt = lineHasCr ? value.indexOf('\r') : -1;
          if (crAt !== -1) {
            const clean = value.replaceAll('\r', '');
            for (let i = 0; i < value.length - clean.length; i++) {
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            }
            value = clean;
          }
          pos = comma + 1;
          ended = 0;
        } else if (lineEnd !== -1) {
          let end = lineEnd;
          if (end > pos && text.charCodeAt(end - 1) === 13) end -= 1;
          value = text.slice(pos, end);
          const crAt = lineHasCr ? value.indexOf('\r') : -1;
          if (crAt !== -1) {
            const clean = value.replaceAll('\r', '');
            for (let i = 0; i < value.length - clean.length; i++) {
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            }
            value = clean;
          }
          pos = lineEnd + 1;
          line += 1;
          ended = 1;
        } else {
          value = text.slice(pos, n);
          const crAt = lineHasCr ? value.indexOf('\r') : -1;
          if (crAt !== -1) {
            const clean = value.replaceAll('\r', '');
            for (let i = 0; i < value.length - clean.length; i++) {
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            }
            value = clean;
          }
          pos = n;
          ended = 2;
        }
      }
      fields.push(value);
      if (ended !== 0) break;
    }

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
