/**
 * Markdown preprocessing: preserve single line breaks the way the author
 * typed them.
 *
 * Standard markdown collapses a single newline (e.g. inside a paragraph
 * of prose) into a space, so this input:
 *
 *   MONDAY
 *   08:00 - 09:00 Mathematics
 *   09:00 - 10:00 ICT
 *
 * renders as one line. People expect timetables, addresses, poems, and
 * other line-organised content to render with each row on its own line.
 *
 * This helper appends two trailing spaces to each line that's followed
 * by another non-blank line. In markdown, "  \n" is a hard line break,
 * so the renderer now respects the author's line breaks while still
 * collapsing actual blank lines into paragraph breaks.
 *
 * Lines that are part of a code fence are left alone — adding trailing
 * spaces inside ``` blocks would corrupt code samples.
 */
export function preserveLineBreaks(src) {
  if (!src) return '';
  const lines = String(src).split(/\r?\n/);
  let inFence = false;
  const out = lines.map((line, i) => {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    // If the next line exists, is non-blank, and the current line itself
    // is non-blank, append a hard-break marker (two trailing spaces).
    const next = lines[i + 1];
    const isBlank = line.trim() === '';
    const nextBlank = next === undefined || next.trim() === '';
    if (!isBlank && !nextBlank && !/[ ]{2,}$/.test(line)) {
      return line + '  ';
    }
    return line;
  });
  return out.join('\n');
}
