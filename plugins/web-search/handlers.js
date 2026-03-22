/**
 * Web search plugin handlers.
 *
 * Implements web_search and fetchUrl operations.
 */

/**
 * Searches the web using DuckDuckGo HTML endpoint (no API key required).
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {import('../../src/types/tools.js').ToolContext} context - Tool context.
 * @returns {Promise<import('../../src/types/tools.js').ToolHandlerResult>} Handler result.
 */
export async function web_search(args, context) {
  try {
    if (!args.query || typeof args.query !== 'string') {
      return { output: 'Error: Missing or invalid required parameter "query"' };
    }

    const limit = typeof args.limit === 'number' ? args.limit : 5;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: context.signal,
    });

    if (!response.ok) {
      return { output: `Error: HTTP ${response.status} - ${response.statusText}` };
    }

    const html = await response.text();
    const results = parseDuckDuckGoResults(html, limit);

    if (results.length === 0) {
      return { output: `No results found for: ${args.query}` };
    }

    const output = results
      .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
      .join('\n\n');

    return { output: `Search results for "${args.query}":\n\n${output}` };
  } catch (error) {
    return { output: `Error executing search: ${error.message}` };
  }
}

/**
 * Parses DuckDuckGo HTML search results.
 *
 * @param {string} html - Raw HTML from DuckDuckGo.
 * @param {number} limit - Max number of results.
 * @returns {{ title: string, url: string, snippet: string }[]} Parsed results.
 */
function parseDuckDuckGoResults(html, limit) {
  const results = [];

  const titlePattern = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetPattern = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const titles = [];
  let m;
  while ((m = titlePattern.exec(html)) !== null) {
    titles.push({ rawUrl: m[1], title: stripTags(m[2]).trim() });
  }

  const snippets = [];
  while ((m = snippetPattern.exec(html)) !== null) {
    snippets.push(stripTags(m[1]).trim());
  }

  const count = Math.min(titles.length, limit);
  for (let i = 0; i < count; i++) {
    const { rawUrl, title } = titles[i];
    const url = extractRealUrl(rawUrl);
    const snippet = snippets[i] ?? '';
    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

/**
 * Extracts real URL from DuckDuckGo redirect URL.
 *
 * @param {string} rawUrl - Possibly a DDG redirect URL.
 * @returns {string} The real destination URL.
 */
function extractRealUrl(rawUrl) {
  // DDG redirect format: //duckduckgo.com/l/?uddg=https%3A%2F%2F...
  const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
  if (uddgMatch) {
    return decodeURIComponent(uddgMatch[1]);
  }
  // Some results use /l/?kh=-1&uddg=...
  if (rawUrl.startsWith('//')) {
    return `https:${rawUrl}`;
  }
  return rawUrl;
}

/**
 * Strips HTML tags from a string.
 *
 * @param {string} html - HTML string.
 * @returns {string} Plain text.
 */
function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetches content from a URL.
 *
 * @param {Record<string, unknown>} args - Tool arguments.
 * @param {import('../../src/types/tools.js').ToolContext} context - Tool context.
 * @returns {Promise<import('../../src/types/tools.js').ToolHandlerResult>} Handler result.
 */
export async function fetch_url(args, context) {
  try {
    // Validate required parameters
    if (!args.url || typeof args.url !== 'string') {
      return {
        output: 'Error: Missing or invalid required parameter "url"',
      };
    }

    const format = args.format || 'markdown';

    // Create AbortSignal with timeout (15000ms as per manifest)
    const timeoutMs = 15000;
    let timeoutSignal;

    // Use AbortSignal.timeout if available (Node 17.3+), otherwise create manual timeout
    if (AbortSignal.timeout) {
      timeoutSignal = AbortSignal.timeout(timeoutMs);
    } else {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeoutMs);
      timeoutSignal = controller.signal;
    }

    // Combine timeout signal with context signal if provided
    let signal = timeoutSignal;
    if (context.signal) {
      // If context already has an abort signal, we need to handle both
      // For simplicity, just use context signal and let timeout be handled by fetch
      signal = context.signal;
    }

    // Fetch the URL
    const response = await fetch(args.url, { signal });

    // Check for HTTP errors
    if (!response.ok) {
      return {
        output: `Error: HTTP ${response.status} - ${response.statusText}`,
      };
    }

    // Get the HTML content
    const html = await response.text();

    // Convert based on format
    let output;
    switch (format) {
      case 'html':
        output = html;
        break;
      case 'text':
        output = htmlToText(html);
        break;
      case 'markdown':
        output = htmlToMarkdown(html);
        break;
      default:
        output = htmlToMarkdown(html);
    }

    return {
      output,
    };
  } catch (error) {
    return {
      output: `Error fetching URL "${args.url}": ${error.message}`,
    };
  }
}

/**
 * Converts HTML to plain text by removing tags.
 *
 * @param {string} html - HTML content.
 * @returns {string} Plain text.
 */
function htmlToText(html) {
  // Remove script and style tags and their contents
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove all HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Converts HTML to Markdown (simple conversion).
 *
 * @param {string} html - HTML content.
 * @returns {string} Markdown text.
 */
function htmlToMarkdown(html) {
  // Remove script and style tags
  let md = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert headings (h1-h6)
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

  // Convert links
  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Convert bold and italic
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

  // Convert lists
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<ul[^>]*>/gi, '\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');

  // Convert paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

  // Convert line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Remove remaining HTML tags
  md = md.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  // Clean up excessive whitespace while preserving intentional breaks
  md = md.replace(/\n\n\n+/g, '\n\n');
  md = md.trim();

  return md;
}

// PluginManager looks up handlers by tool name; export aliases for both names
export { web_search as search, fetch_url as fetchUrl };
