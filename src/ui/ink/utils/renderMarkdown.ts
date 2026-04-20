import chalk from 'chalk';

/**
 * Converts common markdown syntax to ANSI-styled terminal text using chalk.
 * Covers: headings, bold, italic, inline code, code blocks, and unordered lists.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines: string[] = [];

  for (const line of lines) {
    // Fenced code block start/end
    const fenceMatch = line.match(/^```(\w*)$/);
    if (fenceMatch) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = fenceMatch[1] ?? '';
        codeLines = [];
      } else {
        inCodeBlock = false;
        const header = codeLang ? chalk.dim(`[${codeLang}]`) : '';
        if (header) out.push(header);
        out.push(chalk.bgBlack.white(codeLines.join('\n')));
        codeLang = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    let l = line;

    // ATX headings: # H1  ## H2  ### H3
    const headingMatch = l.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const depth = headingMatch[1]!.length;
      const content = headingMatch[2] ?? '';
      if (depth === 1) { out.push(chalk.bold.underline.cyan(content)); continue; }
      if (depth === 2) { out.push(chalk.bold.cyan(content)); continue; }
      out.push(chalk.cyan(content));
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(l)) {
      out.push(chalk.dim('─'.repeat(40)));
      continue;
    }

    // Unordered list items
    const listMatch = l.match(/^(\s*)[*\-+]\s+(.*)/);
    if (listMatch) {
      const indent = listMatch[1];
      const content = applyInline(listMatch[2] ?? '');
      out.push(`${indent}${chalk.green('•')} ${content}`);
      continue;
    }

    // Ordered list items
    const orderedMatch = l.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (orderedMatch) {
      const indent = orderedMatch[1];
      const num = orderedMatch[2];
      const content = applyInline(orderedMatch[3] ?? '');
      out.push(`${indent}${chalk.green(num + '.')} ${content}`);
      continue;
    }

    // Blockquote
    if (l.startsWith('> ')) {
      out.push(chalk.dim('│ ') + chalk.italic(applyInline(l.slice(2))));
      continue;
    }

    out.push(applyInline(l));
  }

  // Flush unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    out.push(chalk.bgBlack.white(codeLines.join('\n')));
  }

  return out.join('\n').trimEnd();
}

/** Apply inline markdown: bold, italic, inline code, strikethrough. */
function applyInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_, c) => chalk.bgBlack.white(c))
    .replace(/\*\*\*(.+?)\*\*\*/g, (_, c) => chalk.bold.italic(c))
    .replace(/___(.+?)___/g, (_, c) => chalk.bold.italic(c))
    .replace(/\*\*(.+?)\*\*/g, (_, c) => chalk.bold(c))
    .replace(/__(.+?)__/g, (_, c) => chalk.bold(c))
    .replace(/\*(.+?)\*/g, (_, c) => chalk.italic(c))
    .replace(/_(.+?)_/g, (_, c) => chalk.italic(c))
    .replace(/~~(.+?)~~/g, (_, c) => chalk.strikethrough(c));
}
